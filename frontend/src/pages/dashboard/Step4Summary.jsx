import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { track } from '../../services/analytics';
import { notifyPlanGenerated } from '../../utils/notifications';
import { lsKey } from '../../config/brand';

const Step4Summary = ({ formData, prevStep, isExpress }) => {
    const [loading, setLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [loadingMessage, setLoadingMessage] = useState('');
    const [preferFavorites, setPreferFavorites] = useState(true);
    const [celebrationData, setCelebrationData] = useState(null);
    const navigate = useNavigate();
    const { user } = useAuth();
    const getGoalLabel = (goal) => {
        const map = { 'lose_weight': 'Equilibrar', 'maintain': 'Mantener', 'gain_muscle': 'Energía Extra' };
        return map[goal] || goal;
    };

    const loadingMessages = [
        { icon: "psychology", text: "Analizando tu perfil nutricional..." },
        { icon: "search", text: "Buscando recetas en el catalogo de supermercados..." },
        { icon: "skillet", text: "Creando recetas personalizadas para ti..." },
        { icon: "shopping_cart", text: "Calculando precios reales de supermercado..." },
        { icon: "savings", text: "Optimizando tu cesta de la compra..." },
        { icon: "auto_awesome", text: "Añadiendo los toques finales a tu menu..." }
    ];

    const handleGeneratePlan = async () => {
        if (isSubmitting) {
            return;
        }

        setIsSubmitting(true);
        setLoading(true);
        setError('');
        setLoadingMessage(loadingMessages[0]);

        let messageIndex = 0;
        const messageInterval = setInterval(() => {
            messageIndex = (messageIndex + 1) % loadingMessages.length;
            setLoadingMessage(loadingMessages[messageIndex]);
        }, 5000);

        try {
            localStorage.removeItem(lsKey('plan'));

            const payload = {
                goal: formData.goal,
                diet: formData.diet,
                economic_level: formData.economicLevel || 'normal',
                prioritize_offers: formData.prioritizeOffers,
                menu_mode: formData.menuMode || 'savings',
                cooking_time: formData.cookingTime || 'normal',
                skill_level: formData.skillLevel || 'intermediate',
                meal_prep: formData.mealPrep || false,
                prefer_favorites: preferFavorites,
                allergens: formData.allergens,
                hated_foods: formData.hatedFoods || [],
                pantry_items: formData.pantryItems,
                current_weight: 0,
                target_calories: formData.target_calories || 2000,
                macros: formData.macros,
                plan_days: formData.planDays || 7,
                meals_per_day: formData.mealsPerDay || 3,
                family_members: formData.familyMembers || [],
                preferred_supermarket: formData.preferred_supermarket || localStorage.getItem(lsKey('preferred_supermarket')) || null,
            };

            const response = await api.generatePlanV3(payload);

            if (response.shopping_list) {
                localStorage.setItem(lsKey('shopping_v2'), JSON.stringify(response.shopping_list));
            }
            if (response.comparison) {
                localStorage.setItem(lsKey('comparison_v2'), JSON.stringify(response.comparison));
            }
            if (response.products_map) {
                localStorage.setItem(lsKey('products_map'), JSON.stringify(response.products_map));
            }
            if (response.pantry_items) {
                localStorage.setItem(lsKey('pantry_items'), JSON.stringify(response.pantry_items));
            }
            if (response.family_info) {
                localStorage.setItem(lsKey('family_info'), JSON.stringify(response.family_info));
            } else {
                localStorage.removeItem(lsKey('family_info'));
            }

            if (!response || !Array.isArray(response.menu) || response.menu.length === 0) {
                throw new Error("Formato de menú inválido recibido del servidor.");
            }

            // Archive old plan to local history before overwriting
            try {
                const oldPlan = localStorage.getItem(lsKey('plan'));
                if (oldPlan) {
                    const parsed = JSON.parse(oldPlan);
                    if (parsed?.menu?.length > 0) {
                        const history = JSON.parse(localStorage.getItem(lsKey('plan_history_local')) || '[]');
                        const wizardSnap = JSON.parse(localStorage.getItem(lsKey('wizard_data')) || '{}');
                        history.unshift({
                            id: `local_${Date.now()}`,
                            created_at: new Date().toISOString(),
                            label: null,
                            summary: {
                                diet_type: wizardSnap.diet || 'omnivoro',
                                days: parsed.menu.length,
                                target_calories: wizardSnap.target_calories || parsed.total_calorias_dia || 2000,
                            },
                        });
                        // Keep max 5 local entries
                        localStorage.setItem(lsKey('plan_history_local'), JSON.stringify(history.slice(0, 5)));
                    }
                }
            } catch {}

            localStorage.setItem(lsKey('plan'), JSON.stringify(response));
            localStorage.setItem(lsKey('version'), 'v3');

            const estimatedCost = response.estimated_cost?.total || response.comparison?.stats?.cheapest_total || 0;
            const pantryNames = (response.pantry_items || []).map(p => p.name || p).filter(Boolean);

            const feedback = {
                timestamp: Date.now(),
                totalDays: response.menu?.length || 0,
                totalProducts: response.shopping_list?.length || 0,
                estimatedCost: estimatedCost,
                economicLevel: formData.economicLevel || 'normal',
                pantryItemsProvided: pantryNames.length,
                pantryNames: pantryNames,
                menuMode: formData.menuMode || 'savings'
            };
            localStorage.setItem(lsKey('generation_feedback'), JSON.stringify(feedback));

            localStorage.setItem(lsKey('wizard_data'), JSON.stringify({
                diet: formData.diet,
                allergens: formData.allergens,
                hatedFoods: formData.hatedFoods,
                targetCalories: formData.target_calories,
                cookingTime: formData.cookingTime,
                skillLevel: formData.skillLevel,
                mealPrep: formData.mealPrep,
                economicLevel: formData.economicLevel,
                familyMembers: formData.familyMembers || [],
                menuMode: formData.menuMode || 'savings'
            }));

            clearInterval(messageInterval);
            track('plan_generated', {
                diet: formData.diet,
                goal: formData.goal,
                days: response.menu?.length || 0,
                products: response.shopping_list?.length || 0,
                cooking_time: formData.cookingTime,
            });

            // Post-generation notification
            notifyPlanGenerated(estimatedCost, response.shopping_list?.length || 0);

            // Show celebration screen
            const totalRecipes = response.menu?.reduce((sum, day) => {
                return sum + ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'].filter(k => day[k]).length;
            }, 0) || 0;
            setCelebrationData({
                days: response.menu?.length || 0,
                recipes: totalRecipes,
                cost: estimatedCost,
                kcal: formData.target_calories || 2000,
            });

        } catch (err) {
            console.error("[ERROR] Error generando menú:", err);
            const detail = err?.response?.data?.detail || '';
            setError(detail || "Error al generar el menú. Revisa tu conexión e inténtalo de nuevo.");
            clearInterval(messageInterval);
        } finally {
            setIsSubmitting(false);
            setLoading(false);
        }
    };

    const getDietLabel = (diet) => {
        const map = { 'omnivoro': 'Omnívoro', 'vegano': 'Vegano', 'vegetariano': 'Vegetariano', 'sin_gluten': 'Sin Gluten', 'keto': 'Keto', 'paleo': 'Paleo', 'sin_lactosa': 'Sin Lactosa' };
        return map[diet] || diet;
    };

    const summaryItems = [
        {
            icon: 'target',
            bgColor: 'bg-[var(--color-tint-teal)]',
            iconColor: 'text-[var(--color-primary)]',
            title: 'Objetivo',
            description: getGoalLabel(formData.goal)
        },
        {
            icon: 'restaurant',
            bgColor: 'bg-[var(--color-tint-teal)]',
            iconColor: 'text-[var(--color-primary)]',
            title: 'Dieta',
            description: getDietLabel(formData.diet)
        },
        {
            icon: 'calendar_month',
            bgColor: 'bg-blue-500/10',
            iconColor: 'text-blue-400',
            title: 'Duración del Plan',
            description: `${formData.planDays} días, ${formData.mealsPerDay} comidas/día`
        },
        {
            icon: 'savings',
            bgColor: 'bg-[var(--color-tint-teal)]',
            iconColor: 'text-[var(--color-primary)]',
            title: 'Nivel Económico',
            description: { economico: 'Económico', normal: 'Normal', premium: 'Premium' }[formData.economicLevel] || 'Normal'
        },
        {
            icon: 'nutrition',
            bgColor: 'bg-[var(--color-tint-teal)]',
            iconColor: 'text-[var(--color-primary)]',
            title: 'Despensa',
            description: formData.pantryItems?.length > 0 ? `${formData.pantryItems.length} items` : 'Vacía'
        },
        {
            icon: 'warning',
            bgColor: 'bg-red-500/10',
            iconColor: 'text-red-400',
            title: 'Alérgenos',
            description: formData.allergens?.length > 0 ? formData.allergens.join(', ') : 'Ninguno'
        },
        {
            icon: 'block',
            bgColor: 'bg-orange-500/10',
            iconColor: 'text-orange-400',
            title: 'No me gusta',
            description: formData.hatedFoods?.length > 0 ? formData.hatedFoods.join(', ') : 'Ninguno'
        },
        ...(formData.familyMembers?.length > 0 ? [{
            icon: 'family_restroom',
            bgColor: 'bg-orange-500/10',
            iconColor: 'text-orange-500',
            title: 'Modo Familia',
            description: `${formData.familyMembers.length} miembros (${formData.familyMembers.reduce((s, m) => s + (m.target_calories || 0), 0)} kcal total)`
        }] : [])
    ];

    // Celebration screen after successful generation
    if (celebrationData) {
        const eatingOut = celebrationData.days * 12; // ~12€/day eating out
        const saved = eatingOut - celebrationData.cost;
        return (
            <div className="fixed inset-0 z-50 bg-[var(--color-bg-page)] flex flex-col items-center justify-center p-8">
                <div className="flex flex-col items-center gap-6 max-w-md text-center animate-fade-in">
                    {/* Success icon with pulse */}
                    <div className="relative">
                        <div className="size-24 rounded-full flex items-center justify-center" style={{ background: 'var(--gradient-hero)' }}>
                            <span className="material-symbols-outlined text-white text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
                        </div>
                        <div className="absolute inset-0 size-24 rounded-full animate-ping opacity-20" style={{ background: 'var(--gradient-hero)' }}></div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                            ¡Tu menu esta listo!
                        </h2>
                        <p className="text-[var(--color-text-secondary)] mt-1">{celebrationData.days} dias de comida sana planificados</p>
                    </div>

                    {/* Stats cards */}
                    <div className="grid grid-cols-3 gap-3 w-full">
                        <div className="glass-panel rounded-xl p-3 text-center animate-fade-in" style={{ animationDelay: '100ms' }}>
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{celebrationData.recipes}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Recetas</p>
                        </div>
                        <div className="glass-panel rounded-xl p-3 text-center animate-fade-in" style={{ animationDelay: '200ms' }}>
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{celebrationData.cost > 0 ? `${celebrationData.cost.toFixed(0)}€` : '~'}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Tu super</p>
                        </div>
                        <div className="glass-panel rounded-xl p-3 text-center animate-fade-in" style={{ animationDelay: '300ms' }}>
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>~{celebrationData.kcal}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">kcal/dia</p>
                        </div>
                    </div>

                    {saved > 0 && (
                        <div className="glass-panel rounded-xl px-4 py-3 w-full flex items-center gap-3 border border-[var(--color-secondary)]/20">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-xl">savings</span>
                            <p className="text-sm text-[var(--color-text-primary)]">
                                <span className="font-bold">Ahorras ~{saved.toFixed(0)}€</span> esta semana vs comer fuera
                            </p>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3 w-full">
                        <button
                            onClick={() => navigate('/app/menu')}
                            className="flex-1 h-14 text-white font-bold text-lg rounded-full flex items-center justify-center gap-2 shadow-lg"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            <span className="material-symbols-outlined">restaurant_menu</span>
                            Ver Menu
                        </button>
                        <button
                            onClick={() => navigate('/app/mi-compra')}
                            className="flex-1 h-14 bg-[var(--color-bg-card)] text-[var(--color-text-primary)] font-bold text-lg rounded-full flex items-center justify-center gap-2 shadow-sm border border-[var(--color-border)]"
                        >
                            <span className="material-symbols-outlined">shopping_cart</span>
                            Mi Compra
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-[var(--color-bg-page)] flex flex-col items-center justify-center p-8">
                <div className="flex flex-col items-center gap-8 max-w-md text-center">
                    <div className="relative">
                        <div className="w-24 h-24 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-4xl animate-pulse text-[var(--color-primary)]">psychology</span>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h2 className="text-2xl font-bold text-[var(--color-text-primary)] animate-pulse">
                            Generando tu Menú Personalizado
                        </h2>
                        <p className="text-[var(--color-text-muted)] text-lg transition-all duration-500 flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined">{loadingMessage?.icon || 'psychology'}</span>
                            {loadingMessage?.text || 'Procesando...'}
                        </p>
                    </div>

                    <div className="w-full bg-[var(--color-border)] rounded-full h-2 overflow-hidden">
                        <div className="h-full rounded-full animate-loading-bar" style={{ background: 'var(--gradient-hero)' }}></div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] mt-4">
                        <span className="material-symbols-outlined text-base">lightbulb</span>
                        <span>Este proceso puede tardar hasta 30 segundos</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen w-full max-w-md lg:max-w-5xl mx-auto bg-[var(--color-bg-page)] flex flex-col">
            <div className="sticky top-0 z-40 flex items-center bg-[var(--color-bg-header)] backdrop-blur-md p-4 pb-2 justify-between border-b border-[var(--color-border)]">
                <button onClick={prevStep} className="text-[var(--color-text-primary)] flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)]"><span className="material-symbols-outlined text-2xl">arrow_back</span></button>
                <h2 className="text-[var(--color-text-primary)] text-lg font-bold flex-1 text-center pr-12">Resumen</h2>
            </div>

            <div className="flex w-full flex-col items-center justify-center gap-2 py-4">
                <div className="flex flex-row items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">{isExpress ? 'Resumen Express' : 'Paso 4 de 4 - Final'}</p>
            </div>

            <div className="flex-1 px-4 pb-40">
                <div className="mb-4 flex items-center justify-center rounded-full bg-[var(--color-tint-teal)] p-4 size-20 mx-auto">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-5xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                </div>
                <h1 className="text-[var(--color-text-primary)] text-[32px] font-bold leading-tight text-center mb-2">
                    ¡Todo listo, {user?.full_name?.split(' ')[0] || 'Usuario'}!
                </h1>
                <p className="text-[var(--color-text-secondary)] text-base font-normal leading-relaxed text-center max-w-sm mx-auto mb-6">
                    Revisa tu plan antes de generar el menú semanal.
                </p>

                <div className="flex flex-col gap-3 w-full">
                    {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm text-center">{error}</div>}

                    {/* Mobile: individual summary rows */}
                    <div className="flex flex-col gap-3 lg:hidden">
                        {summaryItems.map((item, idx) => (
                            <div key={idx} className="flex items-center gap-4 bg-[var(--color-bg-card)] px-4 py-3 rounded-xl shadow-sm border border-[var(--color-border)] justify-between group transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`flex items-center justify-center rounded-lg ${item.bgColor} ${item.iconColor} shrink-0 size-12`}>
                                        <span className="material-symbols-outlined text-2xl">{item.icon}</span>
                                    </div>
                                    <div className="flex flex-col justify-center">
                                        <p className="text-[var(--color-text-primary)] text-base font-bold leading-normal line-clamp-1">{item.title}</p>
                                        <p className="text-[var(--color-text-muted)] text-sm font-normal leading-normal line-clamp-2">{item.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Desktop: 3-column grouped cards */}
                    <div className="hidden lg:grid lg:grid-cols-3 gap-4">
                        {/* Profile Card */}
                        <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="flex items-center justify-center rounded-lg bg-[var(--color-tint-teal)] text-[var(--color-primary)] size-10">
                                    <span className="material-symbols-outlined text-xl">person</span>
                                </div>
                                <span className="text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-wider">Perfil</span>
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Objetivo</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{getGoalLabel(formData.goal)}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Calorías</span><span className="text-[var(--color-primary)] text-sm font-bold">{formData.target_calories || 2000} kcal</span></div>
                            </div>
                        </div>
                        {/* Preferences Card */}
                        <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="flex items-center justify-center rounded-lg bg-[var(--color-tint-teal)] text-[var(--color-primary)] size-10">
                                    <span className="material-symbols-outlined text-xl">tune</span>
                                </div>
                                <span className="text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-wider">Preferencias</span>
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Dieta</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{getDietLabel(formData.diet)}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Duración</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{formData.planDays} días</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Comidas/día</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{formData.mealsPerDay} comidas</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Tiempo</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{{ express: '≤15 min', normal: '15-45 min', chef: '45+ min' }[formData.cookingTime] || 'Normal'}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Nivel</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{{ beginner: 'Básico', intermediate: 'Medio', advanced: 'Avanzado' }[formData.skillLevel] || 'Medio'}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Economía</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{{ economico: 'Económico', normal: 'Normal', premium: 'Premium' }[formData.economicLevel] || 'Normal'}</span></div>
                            </div>
                        </div>
                        {/* Pantry Card */}
                        <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="flex items-center justify-center rounded-lg bg-[var(--color-tint-teal)] text-[var(--color-primary)] size-10">
                                    <span className="material-symbols-outlined text-xl">inventory_2</span>
                                </div>
                                <span className="text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-wider">Despensa</span>
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Despensa</span><span className="text-[var(--color-text-primary)] text-sm font-semibold">{formData.pantryItems?.length || 0} items</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">Alérgenos</span><span className={`text-sm font-semibold ${formData.allergens?.length > 0 ? 'text-red-500' : 'text-[var(--color-text-primary)]'}`}>{formData.allergens?.length > 0 ? formData.allergens.join(', ') : 'Ninguno'}</span></div>
                                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)] text-sm">No me gusta</span><span className={`text-sm font-semibold ${formData.hatedFoods?.length > 0 ? 'text-orange-500' : 'text-[var(--color-text-primary)]'}`}>{formData.hatedFoods?.length > 0 ? formData.hatedFoods.join(', ') : 'Ninguno'}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* V3 badge */}
                    <div className="mt-4 flex items-center gap-3 p-4 rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-tint-teal)]">
                        <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        <div>
                            <p className="text-[var(--color-text-primary)] font-bold text-sm">Recetas verificadas</p>
                            <p className="text-[var(--color-text-muted)] text-xs">260 recetas con productos reales</p>
                        </div>
                    </div>

                    {/* Prefer favorites toggle */}
                    <button
                        type="button"
                        onClick={() => setPreferFavorites(v => !v)}
                        className="mt-2 flex items-center gap-4 bg-[var(--color-bg-card)] px-4 py-3 rounded-xl shadow-sm border border-[var(--color-border)] w-full text-left transition-colors"
                    >
                        <div className="flex items-center justify-center rounded-lg bg-orange-500/10 shrink-0 size-12">
                            <span
                                className="material-symbols-outlined text-2xl text-orange-500"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                favorite
                            </span>
                        </div>
                        <div className="flex flex-col justify-center flex-1 min-w-0">
                            <p className="text-[var(--color-text-primary)] text-base font-bold leading-normal">Incluir mis favoritas</p>
                            <p className="text-[var(--color-text-muted)] text-sm font-normal leading-normal">Priorizar recetas que te gustan en el menú</p>
                        </div>
                        <div
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${preferFavorites ? 'bg-orange-500' : 'bg-[var(--color-border)]'}`}
                        >
                            <span
                                className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200 ${preferFavorites ? 'translate-x-6' : 'translate-x-0'}`}
                            />
                        </div>
                    </button>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[var(--color-bg-page)] via-[var(--color-bg-page)] to-transparent z-50 flex flex-col items-center gap-3">
                <button
                    onClick={handleGeneratePlan}
                    disabled={loading || isSubmitting}
                    className={`w-full max-w-md lg:max-w-5xl text-white font-bold text-lg h-14 rounded-full flex items-center justify-center gap-2 shadow-lg shadow-[var(--color-primary)]/20 transition-all transform active:scale-[0.98] ${(loading || isSubmitting) ? 'opacity-70 cursor-not-allowed' : ''}`}
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <span className="material-symbols-outlined text-xl">auto_awesome</span>
                    Generar Mi Menú de {formData.planDays} Días
                </button>
                <div className="flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)] font-medium">
                    <span className="material-symbols-outlined text-sm">restaurant</span>
                    {formData.planDays * formData.mealsPerDay} platos personalizados con productos de supermercado
                </div>
            </div>
        </div>
    );
};

export default Step4Summary;
