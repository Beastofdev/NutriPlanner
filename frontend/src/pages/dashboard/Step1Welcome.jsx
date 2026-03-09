import { useState } from 'react';
import { useToast } from '../../components/Toast';
import { api } from '../../services/api';
import { track } from '../../services/analytics';

const ONBOARDING_STEPS = [
    { icon: 'restaurant_menu', title: 'Menu personalizado', desc: 'Recetas adaptadas a tu dieta, objetivo y preferencias' },
    { icon: 'savings', title: 'Compra al mejor precio', desc: 'Con precios reales de supermercado' },
    { icon: 'inventory_2', title: 'Despensa inteligente', desc: 'Controla lo que tienes en casa y evita desperdiciar' },
];

const Step1Welcome = ({ formData, updateForm, nextStep, user, setTargetCalories, goToSummary, goToExpress, planHistory = [], onRestorePlan, restoringPlanId }) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('nutriplanner_seen_onboarding'));
    const [localData, setLocalData] = useState(() => ({
        age: user?.profile?.age || '',
        gender: user?.profile?.gender || '',
        height: user?.profile?.height || '',
        weight: user?.profile?.weight || '',
        activity_level: user?.goals?.activity_level || 'sedentary',
        goal: user?.goals?.goal || 'lose_weight'
    }));

    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    const validateField = (field, value) => {
        const numValue = parseFloat(value);
        switch (field) {
            case 'age':
                if (!value) return 'Requerido';
                if (numValue < 12) return 'Mínimo 12 años';
                if (numValue > 120) return 'Máximo 120 años';
                return null;
            case 'weight':
                if (!value) return 'Requerido';
                if (numValue < 30) return 'Mínimo 30 kg';
                if (numValue > 300) return 'Máximo 300 kg';
                return null;
            case 'height':
                if (!value) return 'Requerido';
                if (numValue < 100) return 'Mínimo 100 cm';
                if (numValue > 250) return 'Máximo 250 cm';
                return null;
            default:
                return null;
        }
    };

    const handleChange = (field, value) => {
        setLocalData(prev => ({ ...prev, [field]: value }));
        if (touched[field]) {
            setErrors(prev => ({ ...prev, [field]: validateField(field, value) }));
        }
    };

    const handleBlur = (field) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        setErrors(prev => ({ ...prev, [field]: validateField(field, localData[field]) }));
    };

    const calculateLocalCalories = (data) => {
        // Harris-Benedict (same formula as backend nutrition_logic.py)
        let geb;
        if (data.gender === 'male') {
            geb = 66.5 + (13.75 * data.weight) + (5.003 * data.height) - (6.755 * data.age);
        } else {
            geb = 655 + (9.56 * data.weight) + (1.85 * data.height) - (4.7 * data.age);
        }

        const multipliers = data.gender === 'male'
            ? { 'sedentary': 1.3, 'light': 1.6, 'moderate': 1.7, 'active': 2.1, 'very_active': 2.4 }
            : { 'sedentary': 1.3, 'light': 1.5, 'moderate': 1.6, 'active': 1.9, 'very_active': 2.2 };

        let tdee = geb * (multipliers[data.activity_level] || 1.3);

        if (data.goal === 'lose_weight') tdee -= 400;
        if (data.goal === 'gain_muscle') tdee += 400;

        return Math.round(tdee);
    };

    const handleContinue = async () => {
        const fieldsToValidate = ['age', 'weight', 'height'];
        const newErrors = {};
        let hasErrors = false;

        if (!localData.gender) {
            newErrors.gender = 'Selecciona tu género';
            hasErrors = true;
        }

        fieldsToValidate.forEach(field => {
            const error = validateField(field, localData[field]);
            if (error) {
                newErrors[field] = error;
                hasErrors = true;
            }
        });

        setTouched({ age: true, weight: true, height: true, gender: true });
        setErrors(newErrors);

        if (hasErrors) {
            return;
        }

        setLoading(true);
        try {
            const payload = {
                age: parseInt(localData.age),
                gender: localData.gender,
                height: parseFloat(localData.height),
                weight: parseFloat(localData.weight),
                activity_level: localData.activity_level,
                goal: localData.goal
            };

            let targetCals;

            if (user) {
                const data = await api.updateProfile(payload);
                targetCals = data.target_calories;
            } else {
                targetCals = calculateLocalCalories(payload);
            }

            if (setTargetCalories) {
                setTargetCalories(targetCals);
            }
            updateForm('target_calories', targetCals);
            updateForm('goal', localData.goal);

            nextStep();

        } catch (error) {
            console.error(error);
            showToast("Error actualizando perfil: " + error.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const goalOptions = [
        { val: 'lose_weight', label: 'Perder', subtitle: 'Grasa', img: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80' },
        { val: 'maintain', label: 'Mantener', subtitle: 'Salud', img: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?w=400&q=80' },
        { val: 'gain_muscle', label: 'Ganar', subtitle: 'Músculo', img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=400&q=80' }
    ];

    if (showOnboarding) {
        return (
            <div className="relative flex min-h-screen w-full flex-col max-w-md mx-auto bg-[var(--color-bg-page)] items-center justify-center px-6">
                <div className="w-full space-y-8">
                    <div className="text-center space-y-2">
                        <div className="text-4xl mb-2">🌱</div>
                        <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Bienvenido a NutriPlanner</h1>
                        <p className="text-sm text-[var(--color-text-muted)]">Tu planificador nutricional inteligente</p>
                    </div>
                    <div className="space-y-3">
                        {ONBOARDING_STEPS.map((step, i) => (
                            <div key={i} className="flex items-center gap-4 bg-[var(--color-bg-card)] p-4 rounded-2xl border border-[var(--color-border)]">
                                <div className="h-12 w-12 rounded-xl bg-[var(--color-tint-teal)] flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">{step.icon}</span>
                                </div>
                                <div>
                                    <p className="text-[var(--color-text-primary)] font-bold text-sm">{step.title}</p>
                                    <p className="text-[var(--color-text-muted)] text-xs">{step.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => { setShowOnboarding(false); localStorage.setItem('nutriplanner_seen_onboarding', '1'); track('onboarding_completed', {}); }}
                        className="w-full py-3.5 bg-[var(--color-primary)] text-white font-bold rounded-xl text-sm hover:bg-[var(--color-primary-dark)] transition-colors"
                    >
                        Empezar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md lg:max-w-3xl mx-auto bg-[var(--color-bg-page)]">
            {/* Header */}
            <div className="sticky top-0 z-40 flex items-center bg-[var(--color-bg-header)] backdrop-blur-md p-4 pb-2 justify-between border-b border-[var(--color-border)]">
                <div className="w-12"></div>
                <h2 className="text-[var(--color-text-primary)] text-lg font-bold flex-1 text-center">Tu Perfil Medico</h2>
                <div className="w-12"></div>
            </div>

            {/* Progress Indicator */}
            <div className="flex w-full flex-col items-center justify-center gap-2 py-4">
                <div className="flex flex-row items-center gap-3">
                    <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">Paso 1 de 4</p>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pb-32 space-y-6">
                <div className="space-y-2 text-center">
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">Hola, {user?.full_name?.split(' ')[0] || 'Usuario'}</h1>
                    <p className="text-[var(--color-text-secondary)] text-sm">Crea tu menu semanal personalizado</p>
                </div>

                {/* Express Onboarding CTA */}
                <button
                    onClick={goToExpress}
                    className="w-full relative overflow-hidden rounded-2xl border-2 border-[var(--color-primary)]/30 bg-gradient-to-br from-[var(--color-tint-teal)] to-[var(--color-bg-card)] p-5 text-left transition-all hover:border-[var(--color-primary)]/50 hover:shadow-lg active:scale-[0.99] group"
                >
                    <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-[var(--color-primary)]/10 blur-2xl group-hover:bg-[var(--color-primary)]/15 transition-colors"></div>
                    <div className="relative flex items-center gap-4">
                        <div className="h-14 w-14 rounded-xl bg-[var(--color-primary)] flex items-center justify-center shrink-0 shadow-lg shadow-[var(--color-primary)]/20">
                            <span className="material-symbols-outlined text-white text-2xl">bolt</span>
                        </div>
                        <div className="flex-1">
                            <p className="text-[var(--color-text-primary)] font-bold text-base">Menu Rapido</p>
                            <p className="text-[var(--color-text-muted)] text-xs mt-0.5">3 preguntas y tu menu listo en segundos</p>
                        </div>
                        <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">arrow_forward</span>
                    </div>
                </button>

                {/* Plan History Section */}
                {planHistory.length > 0 && (
                    <div className="bg-[var(--color-bg-card)] p-4 rounded-2xl border border-[var(--color-border)] space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">replay</span>
                            <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Repetir Menu Anterior</h3>
                        </div>
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                            {planHistory.map(plan => (
                                <button
                                    key={plan.id}
                                    onClick={() => onRestorePlan?.(plan.id)}
                                    disabled={!!restoringPlanId}
                                    className="w-full flex items-center gap-3 bg-[var(--color-bg-page)] hover:bg-[var(--color-tint-teal)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/30 rounded-xl p-3 transition-all text-left disabled:opacity-50 group"
                                >
                                    <div className="h-10 w-10 rounded-xl bg-[var(--color-tint-teal)] flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">restaurant_menu</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[var(--color-text-primary)] text-sm font-bold truncate">
                                            {plan.label || `Plan del ${new Date(plan.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium">
                                                {plan.summary?.diet_type || 'Omnivoro'}
                                            </span>
                                            <span className="text-[var(--color-text-muted)] text-xs">
                                                {plan.summary?.days || 7}d · {plan.summary?.target_calories || '?'} kcal
                                            </span>
                                        </div>
                                    </div>
                                    {restoringPlanId === plan.id ? (
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg animate-spin">progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg opacity-0 group-hover:opacity-100 transition-opacity">replay</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Separator */}
                <div className="flex items-center gap-3 px-2">
                    <div className="flex-1 h-px bg-[var(--color-border)]"></div>
                    <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">O personaliza al detalle</span>
                    <div className="flex-1 h-px bg-[var(--color-border)]"></div>
                </div>

                <div className="bg-[var(--color-bg-card)] p-5 rounded-2xl border border-[var(--color-border)] space-y-4">
                    {/* Gender */}
                    <div>
                        <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 block">Género</label>
                        <div className="flex gap-2">
                            {['male', 'female'].map(g => (
                                <button
                                    key={g}
                                    onClick={() => handleChange('gender', g)}
                                    className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${localData.gender === g
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                        : `bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] ${errors.gender && touched.gender ? 'border-red-400' : 'border-transparent'} hover:border-[var(--color-primary)]/30`
                                        }`}
                                >
                                    {g === 'male' ? 'Hombre' : 'Mujer'}
                                </button>
                            ))}
                        </div>
                        {errors.gender && touched.gender && <p className="text-xs text-red-500 mt-1">{errors.gender}</p>}
                    </div>

                    {/* Numeric Inputs */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase">Edad</label>
                            <input
                                type="number"
                                min="12"
                                max="120"
                                value={localData.age}
                                onChange={(e) => handleChange('age', e.target.value)}
                                onBlur={() => handleBlur('age')}
                                className={`w-full bg-[var(--color-bg-card)] border rounded-xl px-3 py-3 text-[var(--color-text-primary)] text-center font-bold outline-none transition-colors ${errors.age && touched.age
                                    ? 'border-red-500 focus:border-red-400'
                                    : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'
                                    }`}
                                placeholder="Años"
                            />
                            {errors.age && touched.age && (
                                <p className="text-red-400 text-xs mt-1">{errors.age}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase">Peso</label>
                            <input
                                type="number"
                                min="30"
                                max="300"
                                value={localData.weight}
                                onChange={(e) => handleChange('weight', e.target.value)}
                                onBlur={() => handleBlur('weight')}
                                className={`w-full bg-[var(--color-bg-card)] border rounded-xl px-3 py-3 text-[var(--color-text-primary)] text-center font-bold outline-none transition-colors ${errors.weight && touched.weight
                                    ? 'border-red-500 focus:border-red-400'
                                    : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'
                                    }`}
                                placeholder="Kg"
                            />
                            {errors.weight && touched.weight && (
                                <p className="text-red-400 text-xs mt-1">{errors.weight}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase">Altura</label>
                            <input
                                type="number"
                                min="100"
                                max="250"
                                value={localData.height}
                                onChange={(e) => handleChange('height', e.target.value)}
                                onBlur={() => handleBlur('height')}
                                className={`w-full bg-[var(--color-bg-card)] border rounded-xl px-3 py-3 text-[var(--color-text-primary)] text-center font-bold outline-none transition-colors ${errors.height && touched.height
                                    ? 'border-red-500 focus:border-red-400'
                                    : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'
                                    }`}
                                placeholder="Cm"
                            />
                            {errors.height && touched.height && (
                                <p className="text-red-400 text-xs mt-1">{errors.height}</p>
                            )}
                        </div>
                    </div>

                    {/* Activity Level */}
                    <div>
                        <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 block">Nivel de Actividad</label>
                        <select
                            value={localData.activity_level}
                            onChange={(e) => handleChange('activity_level', e.target.value)}
                            className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-primary)] appearance-none cursor-pointer transition-colors"
                        >
                            <option value="sedentary">Sedentario (Poco o nada)</option>
                            <option value="light">Ligero (1-3 días/sem)</option>
                            <option value="moderate">Moderado (3-5 días/sem)</option>
                            <option value="active">Activo (6-7 días/sem)</option>
                            <option value="very_active">Muy Activo (Doble sesión)</option>
                        </select>
                    </div>

                    {/* Goal - PREMIUM LARGE CARDS */}
                    <div>
                        <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-4 block">Objetivo Principal</label>
                        <div className="grid grid-cols-3 gap-2 lg:gap-3">
                            {goalOptions.map(opt => (
                                <button
                                    key={opt.val}
                                    onClick={() => handleChange('goal', opt.val)}
                                    className={`relative h-32 lg:h-40 rounded-xl border-2 overflow-hidden group transition-all ${localData.goal === opt.val
                                        ? 'border-[var(--color-primary)] scale-105 shadow-lg shadow-[var(--color-primary)]/30'
                                        : 'border-transparent opacity-70 hover:opacity-100 hover:scale-[1.02]'
                                        }`}
                                >
                                    <img src={opt.img} alt={opt.label} className="absolute inset-0 w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent flex flex-col items-center justify-end pb-3">
                                        <span className={`text-base font-bold ${localData.goal === opt.val ? 'text-[var(--color-primary)]' : 'text-white'}`}>{opt.label}</span>
                                        <span className="text-xs text-gray-300">{opt.subtitle}</span>
                                    </div>
                                    {localData.goal === opt.val && (
                                        <div className="absolute top-2 right-2 bg-[var(--color-primary)] text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs">check</span>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Button */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-50 flex justify-center">
                <div className="w-full max-w-md lg:max-w-3xl">
                    <button
                        onClick={handleContinue}
                        disabled={loading}
                        style={{ background: 'var(--gradient-hero)' }}
                        className={`w-full h-14 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-[var(--color-primary)]/20 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Calculando...' : 'Guardar y Continuar'} {!loading && <span className="material-symbols-outlined text-xl">arrow_forward</span>}
                    </button>

                    {/* Guest Access */}
                    <div className="w-full text-center mt-3">
                        <button
                            onClick={() => {
                                updateForm('diet', 'omnivoro');
                                updateForm('target_calories', 2000);
                                updateForm('goal', 'lose_weight');
                                updateForm('planDays', 3);
                                if (setTargetCalories) setTargetCalories(2000);
                                if (goToSummary) goToSummary();
                            }}
                            className="text-[var(--color-text-muted)] text-sm underline hover:text-[var(--color-text-primary)] transition-colors"
                        >
                            <span className="material-symbols-outlined text-sm align-middle">bolt</span> Probar ahora sin registro (Modo Invitado)
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Step1Welcome;
