import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { api } from '../services/api';
import BottomNav from '../components/NavBar';
import { BRAND, lsKey } from '../config/brand';
import { LoadingSkeleton } from '../components/menu/MenuSkeletons';
import MealCard from '../components/menu/MealCard';
import MealPrepSection from '../components/menu/MealPrepSection';
import GenerationFeedback from '../components/menu/GenerationFeedback';
import Coachmark from '../components/Coachmark';
import { track } from '../services/analytics';

export default function Menu() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [plan, setPlan] = useState(null);
    const [selectedDay, setSelectedDay] = useState(0);
    const [loading, setLoading] = useState(true);
    const [weekDates, setWeekDates] = useState([]);

    const [regeneratingMealId, setRegeneratingMealId] = useState(null);
    const [copyToast, setCopyToast] = useState(false);
    const [productsMap, setProductsMap] = useState({});
    const [generationFeedback, setGenerationFeedback] = useState(null);
    const [recipeRatings, setRecipeRatings] = useState({});
    const [showSignupModal, setShowSignupModal] = useState(false);
    const [showNewMenuConfirm, setShowNewMenuConfirm] = useState(false);

    // 0. LOAD RECIPE RATINGS
    useEffect(() => {
        if (!user) return;
        api.getRecipeRatings()
            .then(res => {
                const map = {};
                (res.ratings || []).forEach(r => { map[r.recipe_id] = r.rating; });
                setRecipeRatings(map);
            })
            .catch(() => {});
    }, [user]);

    const handleRateRecipe = async (recipeId, rating) => {
        if (!user) return;
        try {
            if (rating === null) {
                await api.deleteRecipeRating(recipeId);
                setRecipeRatings(prev => { const n = { ...prev }; delete n[recipeId]; return n; });
            } else {
                await api.rateRecipe(recipeId, rating);
                setRecipeRatings(prev => ({ ...prev, [recipeId]: rating }));
                if (rating === 'dislike') {
                    showToast('Esta receta no volvera a aparecer', 'info');
                }
            }
        } catch (e) {
            console.error('Error rating recipe:', e);
        }
    };

    // 0b. FEEDBACK POST-GENERACIÓN
    useEffect(() => {
        const stored = localStorage.getItem(lsKey('generation_feedback'));
        if (stored) {
            try {
                const feedback = JSON.parse(stored);
                if (Date.now() - feedback.timestamp < 30000) {
                    setGenerationFeedback(feedback);
                    setTimeout(() => setGenerationFeedback(null), 10000);
                }
                localStorage.removeItem(lsKey('generation_feedback'));
                // Show signup modal for guests after first generation
                if (!user && !localStorage.getItem(lsKey('seen_signup_modal'))) {
                    setTimeout(() => {
                        setShowSignupModal(true);
                        track('guest_signup_prompt_shown', {});
                    }, 3000);
                }
            } catch (e) {
                console.error('Error parsing feedback:', e);
            }
        }
    }, []);

    // 1+2. CARGA DE DATOS + FECHAS según días del plan
    useEffect(() => {
        let numDays = 7;
        const storedPlan = localStorage.getItem(lsKey('plan'));
        if (storedPlan) {
            try {
                const parsed = JSON.parse(storedPlan);
                if (parsed && Array.isArray(parsed.menu)) {
                    setPlan(parsed);
                    numDays = parsed.menu.length || 7;
                }
            } catch (e) { console.error(e); }
        }

        const days = [];
        const today = new Date();
        for (let i = 0; i < numDays; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            days.push({
                name: d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '').toUpperCase(),
                num: d.getDate(),
            });
        }
        setWeekDates(days);

        const storedProductsMap = localStorage.getItem(lsKey('products_map'));
        if (storedProductsMap) {
            try {
                const parsed = JSON.parse(storedProductsMap);
                setProductsMap(parsed);
            } catch (e) { console.error('[Menu] Error parsing products_map:', e); }
        }

        setLoading(false);
    }, [user]);

    // --- REGENERACIÓN DETERMINISTA ---
    const handleRegenerateDish = async (mealKey, currentDishName, currentCalories) => {
        setRegeneratingMealId(mealKey);

        try {
            const wizardData = JSON.parse(localStorage.getItem(lsKey('wizard_data')) || '{}');

            const excludedRecipeIds = [];
            if (plan?.menu) {
                plan.menu.forEach(day => {
                    Object.values(day).forEach(meal => {
                        if (meal && typeof meal === 'object' && meal.recipe_id) {
                            excludedRecipeIds.push(meal.recipe_id);
                        }
                    });
                });
            }

            const newDish = await api.regenerateDish(
                currentDishName,
                currentCalories,
                wizardData.diet || null,
                wizardData.allergens || [],
                wizardData.hatedFoods || [],
                mealKey,
                excludedRecipeIds
            );

            if (!newDish || !newDish.nombre) throw new Error("Respuesta vacia");

            const ingredientesV2 = newDish.ingredientes_v2 || [];

            let safeIngredients = [];
            const rawIng = newDish.ingredientes || newDish.ingredients || [];

            if (Array.isArray(rawIng)) {
                safeIngredients = rawIng.map(i => {
                    if (typeof i === 'string') return { n: i, q: '' };
                    if (typeof i === 'object' && i !== null) {
                        return {
                            n: i.nombre || i.n || i.name || String(i),
                            q: i.q || i.quantity || ''
                        };
                    }
                    return { n: String(i), q: '' };
                });
            } else if (typeof rawIng === 'string') {
                safeIngredients = rawIng.split(',').map(s => ({ n: s.trim(), q: '' }));
            }

            if (safeIngredients.length === 0) {
                safeIngredients = [{ n: "Ingredientes no especificados", q: '' }];
            }

            const rawCals = newDish.calorias || newDish.calories || newDish.macros?.calorias || currentCalories;
            const finalCalorias = Math.round(Number(rawCals) || currentCalories);

            const dishToSave = {
                nombre: String(newDish.nombre || newDish.title || "Plato Nuevo"),
                descripcion: String(newDish.descripcion || newDish.justificacion || ""),
                calorias: finalCalorias,
                macros: {
                    proteinas: Number(newDish.macros?.proteinas || 0),
                    carbohidratos: Number(newDish.macros?.carbohidratos || 0),
                    grasas: Number(newDish.macros?.grasas || 0)
                },
                ingredientes: safeIngredients,
                ingredientes_v2: ingredientesV2,
                justificacion: String(newDish.justificacion || newDish.summary || "Opcion alternativa"),
                recipe_id: newDish.recipe_id || null,
                image_url: newDish.image_url || null
            };

            const newPlan = JSON.parse(JSON.stringify(plan));
            if (newPlan.menu && newPlan.menu[selectedDay]) {
                newPlan.menu[selectedDay][mealKey] = dishToSave;
                setPlan(newPlan);
                localStorage.setItem(lsKey('plan'), JSON.stringify(newPlan));
            }

            api.recalculateShoppingV3(newPlan.menu)
                .then((result) => {
                    if (result.shopping_list) {
                        localStorage.setItem(lsKey('shopping_v2'), JSON.stringify(result.shopping_list));
                    }
                    if (result.comparison) {
                        localStorage.setItem(lsKey('comparison_v2'), JSON.stringify(result.comparison));
                    }
                })
                .catch(err => console.warn("Error recalculando lista V3:", err));

        } catch (err) {
            console.error("Error en handleRegenerateDish:", err);
            const msg = err.response?.data?.detail || "Error al regenerar el plato.";
            showToast(msg, "error");
        } finally {
            setRegeneratingMealId(null);
        }
    };

    const handleSharePlan = async () => {
        if (!plan?.menu) return;
        const dayNames = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
        const mealKeys = ['desayuno', 'comida', 'cena'];
        let text = `Mi menu semanal con ${BRAND.name}:\n\n`;
        plan.menu.forEach((day, i) => {
            const meals = mealKeys.map(k => day[k]?.nombre).filter(Boolean).join(', ');
            if (meals) text += `${dayNames[i] || `Dia ${i + 1}`}: ${meals}\n`;
        });
        text += `\nGenera el tuyo: ${BRAND.siteUrl}`;

        track('share_menu', { days: plan.menu.length });

        if (navigator.share) {
            try {
                await navigator.share({ title: 'Mi Menu Semanal', text });
                return;
            } catch { /* user cancelled or error — fall through to clipboard */ }
        }
        navigator.clipboard.writeText(text).then(() => {
            setCopyToast(true);
            setTimeout(() => setCopyToast(false), 2000);
        });
    };

    if (loading) return <LoadingSkeleton />;
    if (!plan || !plan.menu) return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-display flex flex-col text-[var(--color-text-primary)]">
            <div className="flex-1 flex flex-col justify-center items-center gap-4 px-6">
                <span className="material-symbols-outlined text-5xl text-[var(--color-text-muted)]">restaurant_menu</span>
                <p className="text-[var(--color-text-secondary)] text-center">No tienes un plan de menu activo</p>
                <button onClick={() => navigate('/app')} className="mt-2 px-6 py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl active:scale-95 transition-transform">
                    Crear Menu
                </button>
            </div>
            <BottomNav active="menu" />
        </div>
    );

    const MEAL_SLOTS = [
        { k: 'desayuno', l: 'Desayuno', t: '08:00' },
        { k: 'almuerzo', l: 'Almuerzo', t: '11:00' },
        { k: 'comida', l: 'Comida', t: '14:00' },
        { k: 'merienda', l: 'Merienda', t: '17:30' },
        { k: 'cena', l: 'Cena', t: '21:00' },
    ];

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-display">
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 lg:pb-8">

                    <GenerationFeedback feedback={generationFeedback} onDismiss={() => setGenerationFeedback(null)} />

                    {/* Header */}
                    <div className="flex flex-col gap-4 p-5 lg:px-10 pt-8">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-widest">Plan Semanal</p>
                                <h1 className="text-2xl text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu Menú Semanal</h1>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    className="w-10 h-10 rounded-full glass-panel flex items-center justify-center active:scale-95 transition-transform"
                                    title="Crear nuevo menu"
                                    onClick={() => setShowNewMenuConfirm(true)}
                                >
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">auto_awesome</span>
                                </button>
                                <button
                                    className="w-10 h-10 rounded-full glass-panel flex items-center justify-center active:scale-95 transition-transform"
                                    title="Compartir menu"
                                    onClick={handleSharePlan}
                                >
                                    <span className="material-symbols-outlined text-[var(--color-text-secondary)] text-lg">share</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-2 lg:gap-3 overflow-x-auto scrollbar-hide pb-1">
                            {weekDates.map((d, idx) => (
                                <button key={idx} onClick={() => setSelectedDay(idx)} className={`flex flex-col items-center justify-center h-14 w-12 lg:h-16 lg:w-14 shrink-0 rounded-xl transition-all duration-200 ${selectedDay === idx ? 'bg-[var(--color-primary)] text-white scale-105 shadow-lg' : 'glass-panel text-[var(--color-text-secondary)] hover:scale-[1.02]'}`}>
                                    <span className="text-[10px] font-bold uppercase">{d.name}</span>
                                    <span className="text-base font-bold" style={{ fontFamily: 'var(--font-body)' }}>{d.num}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Day summary + shopping CTA */}
                    {(() => {
                        const dayPlan = plan.menu[selectedDay];
                        if (!dayPlan) return null;
                        const mealKeys = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
                        const mealCount = mealKeys.filter(k => dayPlan[k]).length;
                        const totalKcal = mealKeys.reduce((sum, k) => sum + (Number(dayPlan[k]?.calorias) || 0), 0);
                        let compTotal = null;
                        try { compTotal = JSON.parse(localStorage.getItem(lsKey('comparison_v2')) || '{}')?.stats?.cheapest_total; } catch {}
                        return (
                            <div className="px-5 lg:px-10 pb-4">
                                <div className="flex items-center justify-between glass-panel rounded-xl px-4 py-3 shadow-[var(--shadow-sm)]">
                                    <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant</span>
                                        <span className="font-semibold">{mealCount} comidas</span>
                                        <span className="text-[var(--color-text-muted)]">·</span>
                                        <span>~{totalKcal} kcal</span>
                                    </div>
                                    {compTotal > 0 && (
                                        <button onClick={() => navigate('/app/mi-compra')} className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-primary)] hover:underline">
                                            <span className="material-symbols-outlined text-sm">storefront</span>
                                            {compTotal.toFixed(0)}€ {(() => { try { return localStorage.getItem('nutriplanner_preferred_supermarket') || 'tu super'; } catch { return 'tu super'; } })()}
                                            <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Savings Banner */}
                    {(() => {
                        try {
                            const comp = JSON.parse(localStorage.getItem(lsKey('comparison_v2')) || '{}');
                            const saved = comp?.stats?.savings;
                            const cheapest = comp?.stats?.cheapest_total;
                            if (saved > 0) return (
                                <div className="px-5 lg:px-10 pb-4 relative">
                                    <div className="flex items-center gap-3 bg-[var(--color-secondary-light)] border border-[var(--color-secondary)]/20 rounded-2xl p-4 animate-fade-in">
                                        <div className="h-10 w-10 rounded-xl bg-[var(--color-secondary)]/15 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-xl">savings</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[var(--color-text-primary)] font-bold text-sm">Ahorras <CountUp end={saved} decimals={2} />€ esta semana</p>
                                            <p className="text-[var(--color-text-secondary)] text-xs">Cesta optima: {cheapest.toFixed(2)}€ en tu super</p>
                                        </div>
                                        <button onClick={() => { track('savings_clicked', { saved, cheapest }); navigate('/app/mi-compra'); }} className="text-[var(--color-secondary)] shrink-0">
                                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                        </button>
                                    </div>
                                    <Coachmark tipKey="savings_banner" text="Con precios reales de supermercado para encontrar la cesta mas barata" position="bottom" />
                                </div>
                            );
                        } catch { /* ignore */ }
                        return null;
                    })()}

                    {/* Family Mode Banner */}
                    {(() => {
                        try {
                            const fi = JSON.parse(localStorage.getItem(lsKey('family_info')) || 'null');
                            if (fi && fi.members_count > 0) return (
                                <div className="px-5 lg:px-10 pb-4">
                                    <div className="flex items-center gap-3 bg-[var(--color-tint-amber)] border border-[var(--color-warning)]/15 rounded-2xl p-4 animate-fade-in">
                                        <div className="h-10 w-10 rounded-xl bg-[var(--color-warning)]/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[var(--color-warning)] text-xl">family_restroom</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[var(--color-text-primary)] font-bold text-sm">Menú Familiar ({fi.members_count} personas)</p>
                                            <p className="text-[var(--color-text-secondary)] text-xs">
                                                {fi.members.map(m => m.name).join(', ')} · {fi.total_calories} kcal/día
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        } catch { /* ignore */ }
                        return null;
                    })()}

                    {/* Offer Savings Banner */}
                    {(() => {
                        try {
                            const comp = JSON.parse(localStorage.getItem(lsKey('comparison_v2')) || '{}');
                            const offerSavings = comp?.stats?.offer_savings;
                            const offerCount = comp?.stats?.offer_items_count;
                            if (offerSavings > 0 && offerCount > 0) return (
                                <div className="px-5 lg:px-10 pb-4">
                                    <div className="flex items-center gap-3 bg-[var(--color-primary-light)] border border-[var(--color-primary)]/15 rounded-2xl p-4 animate-fade-in">
                                        <div className="h-10 w-10 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">local_offer</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[var(--color-text-primary)] font-bold text-sm">{offerCount} productos en oferta</p>
                                            <p className="text-[var(--color-text-secondary)] text-xs">Te ahorras {offerSavings.toFixed(2)}€ con las ofertas disponibles</p>
                                        </div>
                                        <button onClick={() => navigate('/app/mi-compra')} className="text-[var(--color-primary)] shrink-0">
                                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        } catch { /* ignore */ }
                        return null;
                    })()}

                    {/* Seasonal Banner */}
                    {plan.seasonal_info && (
                        <div className="px-5 lg:px-10 pb-4">
                            <div className="flex items-center gap-3 bg-[var(--color-tint-green)] border border-[var(--color-secondary)]/15 rounded-2xl p-4 animate-fade-in">
                                <div className="h-10 w-10 rounded-xl bg-[var(--color-secondary)]/15 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[var(--color-secondary)] text-xl">eco</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[var(--color-text-primary)] font-bold text-sm">Recetas de {plan.seasonal_info.season_label}</p>
                                    <p className="text-[var(--color-text-secondary)] text-xs">Tu menú prioriza ingredientes de temporada para mejor sabor y precio</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <MealPrepSection mealPrepGuide={plan.meal_prep_guide} selectedDay={selectedDay} navigate={navigate} />

                    {/* Comidas */}
                    <div className="flex flex-col lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5 xl:gap-6 px-5 lg:px-6 xl:px-10 pb-6">
                        {MEAL_SLOTS.map((meal, mealIndex) => {
                            const data = plan.menu[selectedDay]?.[meal.k];
                            if (!data) return null;

                            return (
                                <div key={meal.k} className="animate-fade-in" style={{ animationDelay: `${mealIndex * 80}ms` }}>
                                    <MealCard
                                        meal={meal}
                                        data={data}
                                        regeneratingMealId={regeneratingMealId}
                                        productsMap={productsMap}
                                        onRegenerate={handleRegenerateDish}
                                        onViewRecipe={(dish, mealType, imgUrl) => navigate('/app/receta', { state: { dish, mealType, imgUrl } })}
                                        recipeRating={data.recipe_id ? recipeRatings[data.recipe_id] : undefined}
                                        onRate={user ? handleRateRecipe : undefined}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                <BottomNav active="menu" />

                {copyToast && (
                    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-[var(--color-primary)] text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 animate-fade-in">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        Menu copiado al portapapeles
                    </div>
                )}

                {/* New menu confirmation modal */}
                {showNewMenuConfirm && (
                    <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowNewMenuConfirm(false)}>
                        <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 animate-slide-up bg-[var(--color-bg-page)]" onClick={e => e.stopPropagation()}>
                            <div className="text-center">
                                <div className="h-14 w-14 bg-[var(--color-tint-amber)] rounded-full flex items-center justify-center mx-auto mb-3">
                                    <span className="material-symbols-outlined text-[var(--color-warning)] text-2xl">auto_awesome</span>
                                </div>
                                <h3 className="text-lg text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Crear nuevo menú</h3>
                                <p className="text-sm text-[var(--color-text-muted)] mt-1">Esto reemplazara tu menu actual y la lista de la compra. ¿Continuar?</p>
                            </div>
                            <button
                                onClick={() => { setShowNewMenuConfirm(false); track('new_menu_from_menu', {}); navigate('/app?new=true'); }}
                                className="w-full py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl text-sm hover:bg-[var(--color-primary-dark)] transition-colors"
                            >
                                Si, crear nuevo menu
                            </button>
                            <button onClick={() => setShowNewMenuConfirm(false)} className="w-full py-2 text-[var(--color-text-muted)] text-sm font-medium">
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Guest signup modal */}
                {showSignupModal && (
                    <div className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center p-4 animate-fade-in" onClick={() => { setShowSignupModal(false); localStorage.setItem(lsKey('seen_signup_modal'), '1'); }}>
                        <div className="glass-panel rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 animate-slide-up bg-[var(--color-bg-page)]" onClick={e => e.stopPropagation()}>
                            <div className="text-center">
                                <div className="h-14 w-14 bg-[var(--color-primary-light)] rounded-full flex items-center justify-center mx-auto mb-3">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl">bookmark_add</span>
                                </div>
                                <h3 className="text-lg text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu menú está listo</h3>
                                <p className="text-sm text-[var(--color-text-muted)] mt-1">Crea tu cuenta en 10 segundos para guardar tu menu, historial y favoritas</p>
                            </div>
                            <button onClick={() => { track('guest_signup_clicked', {}); localStorage.setItem(lsKey('seen_signup_modal'), '1'); navigate('/register'); }} className="w-full py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl text-sm hover:bg-[var(--color-primary-dark)] transition-colors">
                                Crear Cuenta Gratis
                            </button>
                            <button onClick={() => { setShowSignupModal(false); localStorage.setItem(lsKey('seen_signup_modal'), '1'); }} className="w-full py-2 text-[var(--color-text-muted)] text-sm font-medium">
                                Ahora no, seguir como invitado
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const CountUp = ({ end, decimals = 0, duration = 1000 }) => {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const start = 0;
        const startTime = performance.now();
        const step = (now) => {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            setValue(start + (end - start) * eased);
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [end, duration]);
    return <span>{value.toFixed(decimals)}</span>;
};

