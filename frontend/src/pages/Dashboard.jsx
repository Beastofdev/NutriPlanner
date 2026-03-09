import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import Step1Welcome from './dashboard/Step1Welcome';
import StepExpress from './dashboard/StepExpress';
import Step2Plan from './dashboard/Step2Plan';
import Step3Pantry from './dashboard/Step3Pantry';
import Step4Summary from './dashboard/Step4Summary';

export default function Dashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();

    const [targetCalories, setTargetCalories] = useState(null);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isGuest = searchParams.get('guest') === 'true';
    const [planHistory, setPlanHistory] = useState([]);
    const [restoringPlanId, setRestoringPlanId] = useState(null);
    // Show loading while checking DB for existing plan (avoids wizard flash on cold start)
    const [checkingPlan, setCheckingPlan] = useState(() => {
        if (isGuest || searchParams.get('new') === 'true') return false;
        // If localStorage already has a plan, no need to check DB
        try {
            const stored = JSON.parse(localStorage.getItem('nutriplanner_plan'));
            if (stored?.menu?.length > 0) return false;
        } catch {}
        // Authenticated user without localStorage plan → need to check DB
        return !!user?.email;
    });

    const [step, setStep] = useState(5);

    // Migrate old localStorage key (one-time)
    useEffect(() => {
        const oldKey = 'nutriplanner_wizard_form';
        const newKey = 'nutriplanner_wizard_data';
        if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
            try {
                localStorage.setItem(newKey, localStorage.getItem(oldKey));
                localStorage.removeItem(oldKey);
            } catch {}
        }
    }, []);

    // Load plan history (API for users, localStorage for guests)
    useEffect(() => {
        if (user?.email && !isGuest) {
            api.getPlanHistory()
                .then(res => setPlanHistory(res.plans || []))
                .catch(() => {});
        } else {
            // Guest: load local plan history
            try {
                const local = JSON.parse(localStorage.getItem('nutriplanner_plan_history_local') || '[]');
                if (local.length > 0) setPlanHistory(local);
            } catch {}
        }
    }, [user?.email, isGuest]);

    const handleRestorePlan = async (planId) => {
        setRestoringPlanId(planId);
        try {
            // Local history entries (guests) only have metadata, not full plan data
            if (typeof planId === 'string' && planId.startsWith('local_')) {
                showToast('Crea una cuenta para restaurar planes anteriores', 'info');
                setRestoringPlanId(null);
                return;
            }
            const res = await api.restorePlan(planId);
            if (res.ok && res.plan) {
                localStorage.setItem('nutriplanner_plan', JSON.stringify(res.plan));
                if (res.wizard_data) {
                    localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(res.wizard_data));
                }
                if (res.plan.shopping_list) {
                    localStorage.setItem('nutriplanner_shopping_v2', JSON.stringify(res.plan.shopping_list));
                }
                if (res.plan.comparison) {
                    localStorage.setItem('nutriplanner_comparison_v2', JSON.stringify(res.plan.comparison));
                }
                navigate('/app/menu', { replace: true });
            }
        } catch (e) {
            console.error('Error restoring plan:', e);
            showToast('Error restaurando el plan', 'error');
        } finally {
            setRestoringPlanId(null);
        }
    };

    useEffect(() => {
        if (searchParams.get('new') === 'true') {
            localStorage.removeItem('nutriplanner_plan');
            localStorage.removeItem('nutriplanner_wizard_data');
            // Reset formData to defaults so stale values (allergens, pantry, etc.)
            // from previous wizard runs don't persist in React state
            setFormData(prev => ({
                ...prev,
                allergens: [],
                hatedFoods: [],
                pantryItems: [],
            }));
            return;
        }

        // 1. Check localStorage first (fast path)
        const storedPlan = localStorage.getItem('nutriplanner_plan');
        if (storedPlan) {
            try {
                const parsed = JSON.parse(storedPlan);
                if (parsed && Array.isArray(parsed.menu) && parsed.menu.length > 0) {
                    navigate('/app/menu', { replace: true });
                    return;
                }
            } catch (e) { console.error("Plan corrupto", e); }
        }

        // 2. If no localStorage plan and user is authenticated, try DB restore
        if (user?.email) {
            api.getActivePlan().then(data => {
                if (data?.plan && Array.isArray(data.plan.menu) && data.plan.menu.length > 0) {
                    // Restore plan + related data to localStorage
                    localStorage.setItem('nutriplanner_plan', JSON.stringify(data.plan));
                    if (data.wizard_data) {
                        localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(data.wizard_data));
                    }
                    // Restore shopping/comparison if present in plan
                    if (data.plan.shopping_list) {
                        localStorage.setItem('nutriplanner_shopping_v2', JSON.stringify(data.plan.shopping_list));
                    }
                    if (data.plan.comparison) {
                        localStorage.setItem('nutriplanner_comparison_v2', JSON.stringify(data.plan.comparison));
                    }
                    navigate('/app/menu', { replace: true });
                } else {
                    setCheckingPlan(false);
                }
            }).catch(() => { setCheckingPlan(false); });
        } else {
            setCheckingPlan(false);
        }
    }, [navigate, searchParams, user?.email]);

    const [formData, setFormData] = useState(() => {
        const defaults = {
            name: user?.full_name || (isGuest ? 'Invitado' : ''),
            diet: 'omnivoro',
            economicLevel: 'normal',
            prioritizeOffers: true,
            menuMode: 'savings',
            cookingTime: 'normal',
            skillLevel: 'intermediate',
            mealPrep: false,
            pantryItems: [],
            allergens: [],
            hatedFoods: [],
            goal: user?.goals?.goal || 'lose_weight',
            target_calories: 2000,
            macros: { protein: 30, fats: 30, carbs: 40 },
            planDays: isGuest ? 3 : 7,
            mealsPerDay: 3
        };
        try {
            const saved = JSON.parse(localStorage.getItem('nutriplanner_wizard_data'));
            return saved ? { ...defaults, ...saved, name: defaults.name, goal: defaults.goal } : defaults;
        } catch { return defaults; }
    });

    // Restore wizard form from localStorage on step change (handles remounts)
    useEffect(() => {
        try {
            const saved = JSON.parse(localStorage.getItem('nutriplanner_wizard_data'));
            if (saved) setFormData(prev => ({ ...prev, ...saved }));
        } catch { /* ignore */ }
    }, [step]);

    const updateForm = (key, value) => {
        setFormData(prev => {
            const next = { ...prev, [key]: value };
            localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(next));
            return next;
        });
    };
    const nextStep = () => setStep(prev => prev + 1);
    const prevStep = () => setStep(prev => prev - 1);

    if (checkingPlan) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-page)] flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                <p className="text-[var(--color-text-secondary)] text-sm font-medium">Recuperando tu plan...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)] font-sans flex flex-col items-center justify-center">
            <div className="w-full max-w-md lg:max-w-5xl bg-[var(--color-bg-page)] relative min-h-screen">
                {step === 1 && <Step1Welcome formData={formData} updateForm={updateForm} nextStep={nextStep} user={user} setTargetCalories={setTargetCalories} goToSummary={() => setStep(4)} goToExpress={() => setStep(5)} planHistory={planHistory} onRestorePlan={handleRestorePlan} restoringPlanId={restoringPlanId} />}
                {step === 2 && <Step2Plan formData={formData} updateForm={updateForm} nextStep={nextStep} prevStep={prevStep} targetCalories={targetCalories} />}
                {step === 3 && <Step3Pantry formData={formData} updateForm={updateForm} nextStep={nextStep} prevStep={prevStep} />}
                {step === 4 && <Step4Summary formData={formData} prevStep={prevStep} isExpress={formData._fromExpress} />}
                {step === 5 && <StepExpress updateForm={updateForm} goToSummary={() => setStep(4)} prevStep={() => setStep(1)} goToCustomize={() => setStep(1)} user={user} setTargetCalories={setTargetCalories} />}
            </div>
        </div>
    );
}
