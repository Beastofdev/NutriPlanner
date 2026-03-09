import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import BottomNav from '../components/NavBar';
import { api } from '../services/api';

// Bidirectional mappings frontend <-> backend enums
const GENDER_TO_BACKEND = { hombre: 'male', mujer: 'female' };
const GENDER_FROM_BACKEND = { male: 'hombre', female: 'mujer' };
const ACTIVITY_TO_BACKEND = { sedentaria: 'sedentary', ligera: 'light', moderada: 'moderate', activa: 'active', muy_activa: 'very_active' };
const ACTIVITY_FROM_BACKEND = { sedentary: 'sedentaria', light: 'ligera', moderate: 'moderada', active: 'activa', very_active: 'muy_activa' };

export default function Metricas() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [savedCalories, setSavedCalories] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    const [metrics, setMetrics] = useState({
        weight: '', height: '', age: '',
        gender: 'hombre',
        activityLevel: 'moderada',
        goal: 'lose_weight'
    });

    // Load real user data on mount
    useEffect(() => {
        const loadProfile = async () => {
            try {
                const data = await api.getProfile();
                setMetrics({
                    weight: data.profile?.weight || '',
                    height: data.profile?.height || '',
                    age: data.profile?.age || '',
                    gender: GENDER_FROM_BACKEND[data.profile?.gender] || 'hombre',
                    activityLevel: ACTIVITY_FROM_BACKEND[data.goals?.activity_level] || 'moderada',
                    goal: data.goals?.goal || 'lose_weight'
                });
                if (data.goals?.target_calories) {
                    setSavedCalories(data.goals.target_calories);
                }
            } catch (err) {
                console.warn('Could not load profile, using defaults:', err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadProfile();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveSuccess(false);
        try {
            const payload = {
                weight: parseFloat(metrics.weight),
                height: parseFloat(metrics.height),
                age: parseInt(metrics.age, 10),
                gender: GENDER_TO_BACKEND[metrics.gender] || 'male',
                activity_level: ACTIVITY_TO_BACKEND[metrics.activityLevel] || 'moderate',
                goal: metrics.goal || 'lose_weight'
            };

            const data = await api.updateProfile(payload);
            const newCalories = data.target_calories;
            setSavedCalories(newCalories);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);

            // Sync localStorage so next plan generation uses updated data
            try {
                const raw = localStorage.getItem('nutriplanner_wizard_data');
                const wizard = raw ? JSON.parse(raw) : {};
                wizard.targetCalories = newCalories;
                wizard.target_calories = newCalories;
                localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(wizard));
            } catch { /* ignore */ }

            try {
                const raw = localStorage.getItem('nutriplanner_plan');
                if (raw) {
                    const plan = JSON.parse(raw);
                    if (plan.user_preferences) {
                        plan.user_preferences.target_calories = newCalories;
                    }
                    plan.total_calorias_dia = newCalories;
                    localStorage.setItem('nutriplanner_plan', JSON.stringify(plan));
                }
            } catch { /* ignore */ }

        } catch (error) {
            console.error("Error guardando métricas:", error);
            showToast("Hubo un error al guardar tus datos. Revisa la conexion.", "error");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-screen bg-[var(--color-bg-page)] font-sans">
                <div className="relative w-full max-w-lg mx-auto h-full flex items-center justify-center">
                    <div className="w-10 h-10 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-2xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header */}
                <header className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 bg-[var(--color-bg-header)] backdrop-blur-md border-b border-[var(--color-border)]">
                    <button onClick={() => navigate(-1)} className="flex items-center justify-center p-2 rounded-full hover:bg-[var(--color-bg-muted)] transition-colors">
                        <span className="material-symbols-outlined text-[var(--color-text-primary)]">arrow_back</span>
                    </button>
                    <h1 className="text-lg font-bold tracking-tight text-[var(--color-text-primary)]">Métricas Corporales</h1>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center justify-center p-2 font-bold text-sm transition-opacity disabled:opacity-50 ${saveSuccess ? 'text-green-500' : 'text-[var(--color-primary)]'}`}
                    >
                        {isSaving ? 'Guardando...' : saveSuccess ? '✓ Guardado' : 'Guardar'}
                    </button>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 lg:pb-8 px-4 pt-4 space-y-6">

                    {/* IA Card */}
                    <div className="relative overflow-hidden rounded-2xl p-4 border border-[var(--color-primary)]/20 shadow-lg" style={{ background: 'var(--gradient-hero)' }}>
                        <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
                        <div className="relative flex items-start gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white">
                                <span className="material-symbols-outlined text-sm">auto_awesome</span>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-white">Cálculo Inteligente</p>
                                {savedCalories ? (
                                    <p className="text-xs text-white/80 mt-1 font-bold">
                                        Tu objetivo calórico: {savedCalories} kcal/día
                                    </p>
                                ) : (
                                    <p className="text-xs text-white/70 mt-1">
                                        Usaré la fórmula Harris-Benedict con tus datos para ajustar tus calorías exactas.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Datos Fisiológicos */}
                    <div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 ml-2">Datos Fisiológicos</h3>

                        {/* Peso Principal */}
                        <div className="mb-4 rounded-3xl bg-[var(--color-bg-card)] p-6 shadow-sm border border-[var(--color-border)] flex items-center justify-between">
                            <div className="flex flex-col">
                                <label className="text-sm font-medium text-[var(--color-text-muted)] mb-1">Peso Corporal</label>
                                <div className="flex items-baseline gap-1">
                                    <input
                                        className="w-28 bg-transparent border-0 border-b-2 border-[var(--color-primary)]/50 focus:border-[var(--color-primary)] p-0 text-5xl font-bold text-[var(--color-text-primary)] focus:ring-0 transition-colors placeholder-gray-300"
                                        type="number"
                                        value={metrics.weight}
                                        onChange={(e) => setMetrics({ ...metrics, weight: e.target.value })}
                                        placeholder="70"
                                    />
                                    <span className="text-xl font-medium text-[var(--color-text-muted)]">kg</span>
                                </div>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-[var(--color-tint-teal)] text-[var(--color-primary)] flex items-center justify-center">
                                <span className="material-symbols-outlined">monitor_weight</span>
                            </div>
                        </div>

                        {/* Selector de Género */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <button
                                onClick={() => setMetrics({ ...metrics, gender: 'hombre' })}
                                className={`rounded-3xl p-4 border transition-all flex flex-col items-center justify-center gap-2 ${metrics.gender === 'hombre' ? 'bg-[var(--color-tint-teal)] border-[var(--color-primary)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                            >
                                <span className="material-symbols-outlined text-3xl">male</span>
                                <span className="text-xs font-bold uppercase">Hombre</span>
                            </button>
                            <button
                                onClick={() => setMetrics({ ...metrics, gender: 'mujer' })}
                                className={`rounded-3xl p-4 border transition-all flex flex-col items-center justify-center gap-2 ${metrics.gender === 'mujer' ? 'bg-[var(--color-tint-teal)] border-[var(--color-primary)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'}`}
                            >
                                <span className="material-symbols-outlined text-3xl">female</span>
                                <span className="text-xs font-bold uppercase">Mujer</span>
                            </button>
                        </div>

                        {/* Grid Altura y Edad */}
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <SmallMetric label="Altura" value={metrics.height} unit="cm" icon="height"
                                onChange={(val) => setMetrics({ ...metrics, height: val })} />
                            <SmallMetric label="Edad" value={metrics.age} unit="años" icon="cake"
                                onChange={(val) => setMetrics({ ...metrics, age: val })} />
                        </div>

                        {/* Selector de Actividad */}
                        <div className="rounded-3xl bg-[var(--color-bg-card)] p-5 shadow-sm border border-[var(--color-border)] mb-4">
                            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">Nivel de Actividad (OMS)</label>
                            <div className="relative">
                                <select
                                    value={metrics.activityLevel}
                                    onChange={(e) => setMetrics({ ...metrics, activityLevel: e.target.value })}
                                    className="w-full appearance-none bg-[var(--color-bg-page)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-xl py-3 px-4 pr-10 focus:outline-none focus:border-[var(--color-primary)] transition-colors text-sm font-medium"
                                >
                                    <option value="sedentaria">Sedentario (Poco o nada)</option>
                                    <option value="ligera">Ligera (1-3 días/sem)</option>
                                    <option value="moderada">Moderada (3-5 días/sem)</option>
                                    <option value="activa">Activa (6-7 días/sem)</option>
                                    <option value="muy_activa">Muy Activa (Atleta)</option>
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[var(--color-primary)]">
                                    <span className="material-symbols-outlined text-sm">expand_more</span>
                                </div>
                            </div>
                        </div>

                        {/* Selector de Objetivo */}
                        <div className="rounded-3xl bg-[var(--color-bg-card)] p-5 shadow-sm border border-[var(--color-border)]">
                            <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-3">Tu Objetivo</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { val: 'lose_weight', label: 'Perder', icon: 'trending_down' },
                                    { val: 'maintain', label: 'Mantener', icon: 'balance' },
                                    { val: 'gain_muscle', label: 'Ganar', icon: 'trending_up' }
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        onClick={() => setMetrics({ ...metrics, goal: opt.val })}
                                        className={`rounded-xl p-3 border transition-all flex flex-col items-center gap-1 ${
                                            metrics.goal === opt.val
                                                ? 'bg-[var(--color-tint-teal)] border-[var(--color-primary)] text-[var(--color-primary)]'
                                                : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)]'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined">{opt.icon}</span>
                                        <span className="text-xs font-bold">{opt.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Monthly Summary */}
                    <MonthlySummary />
                </div>

                {/* Bottom Nav */}
                <BottomNav active="perfil" />
            </div>
        </div>
    );
}

// --- Monthly Summary ---
function MonthlySummary() {
    const stats = useMemo(() => {
        const plan = (() => {
            try { return JSON.parse(localStorage.getItem('nutriplanner_plan') || '{}'); } catch { return {}; }
        })();
        // Recipes in current plan
        const menu = plan.menu || [];
        const recipeNames = new Set();
        let totalCalories = 0;
        let totalProtein = 0;
        let totalCarbs = 0;
        let totalFats = 0;
        let mealCount = 0;

        for (const day of menu) {
            for (const key of ['desayuno', 'comida', 'cena']) {
                const dish = day[key];
                if (dish?.nombre) {
                    recipeNames.add(dish.nombre);
                    totalCalories += dish.calorias || 0;
                    totalProtein += dish.macros?.proteinas || dish.protein || 0;
                    totalCarbs += dish.macros?.carbohidratos || dish.carbs || 0;
                    totalFats += dish.macros?.grasas || dish.fats || 0;
                    mealCount++;
                }
            }
        }

        // Estimated spend from plan
        const totalSpend = plan.total_price || plan.total_estimated_price || 0;

        return {
            recipesInPlan: recipeNames.size,
            totalSpend: totalSpend.toFixed(2),
            avgCalories: mealCount > 0 ? Math.round(totalCalories / (menu.length || 1)) : 0,
            avgProtein: mealCount > 0 ? Math.round(totalProtein / (menu.length || 1)) : 0,
            avgCarbs: mealCount > 0 ? Math.round(totalCarbs / (menu.length || 1)) : 0,
            avgFats: mealCount > 0 ? Math.round(totalFats / (menu.length || 1)) : 0,
            planDays: menu.length,
        };
    }, []);

    const cards = [
        { icon: 'restaurant_menu', label: 'Recetas en plan', value: stats.recipesInPlan, color: 'var(--color-primary)' },
        { icon: 'shopping_cart', label: 'Gasto estimado', value: `${stats.totalSpend}€`, color: 'var(--color-secondary)' },
        { icon: 'local_fire_department', label: 'Kcal/día (media)', value: stats.avgCalories, color: '#F59E0B' },
        { icon: 'calendar_month', label: 'Días de plan', value: stats.planDays || '—', color: 'var(--color-primary)' },
    ];

    return (
        <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 ml-2">Resumen de tu Plan</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
                {cards.map((c, i) => (
                    <div key={i} className="rounded-2xl bg-[var(--color-bg-card)] p-4 shadow-sm border border-[var(--color-border)]">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-lg" style={{ color: c.color }}>{c.icon}</span>
                            <span className="text-[10px] font-bold uppercase text-[var(--color-text-muted)]">{c.label}</span>
                        </div>
                        <p className="text-xl font-bold text-[var(--color-text-primary)]">{c.value || '—'}</p>
                    </div>
                ))}
            </div>

            {/* Macro breakdown */}
            {stats.avgCalories > 0 && (
                <div className="rounded-2xl bg-[var(--color-bg-card)] p-4 shadow-sm border border-[var(--color-border)]">
                    <h4 className="text-xs font-bold uppercase text-[var(--color-text-muted)] mb-3">Media Diaria de Macros</h4>
                    <div className="space-y-2.5">
                        {[
                            { label: 'Proteínas', value: stats.avgProtein, unit: 'g', color: 'var(--color-primary)' },
                            { label: 'Carbohidratos', value: stats.avgCarbs, unit: 'g', color: '#F59E0B' },
                            { label: 'Grasas', value: stats.avgFats, unit: 'g', color: '#EF4444' },
                        ].map((m, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                                <span className="text-xs text-[var(--color-text-muted)] flex-1">{m.label}</span>
                                <span className="text-sm font-bold text-[var(--color-text-primary)]">{m.value}{m.unit}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Componente Auxiliar ---
const SmallMetric = ({ label, value, unit, icon, onChange }) => (
    <div className="rounded-3xl bg-[var(--color-bg-card)] p-5 shadow-sm border border-[var(--color-border)]">
        <label className="block text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-2">{label}</label>
        <div className="flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
                <input
                    className="w-16 bg-transparent border-none p-0 text-3xl font-bold text-[var(--color-text-primary)] focus:ring-0"
                    type="number"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                />
                <span className="text-sm text-[var(--color-text-muted)]">{unit}</span>
            </div>
            <span className="material-symbols-outlined text-[var(--color-border)]">{icon}</span>
        </div>
    </div>
);
