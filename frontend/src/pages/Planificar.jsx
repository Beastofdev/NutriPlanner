import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { track } from '../services/analytics';
import { BRAND, lsKey } from '../config/brand';

const GOAL_OPTIONS = [
    { val: 'lose_weight', label: 'Perder Grasa', icon: 'trending_down', color: 'text-orange-500', bg: 'bg-orange-50' },
    { val: 'maintain', label: 'Mantenerme', icon: 'balance', color: 'text-[var(--color-primary)]', bg: 'bg-[var(--color-tint-teal)]' },
    { val: 'gain_muscle', label: 'Ganar Musculo', icon: 'fitness_center', color: 'text-purple-500', bg: 'bg-purple-50' },
];

const DIET_OPTIONS = [
    { label: 'Omnivoro', value: 'omnivoro', icon: 'restaurant' },
    { label: 'Vegetariano', value: 'vegetariano', icon: 'eco' },
    { label: 'Vegano', value: 'vegano', icon: 'spa' },
    { label: 'Sin Gluten', value: 'sin_gluten', icon: 'grain' },
    { label: 'Keto', value: 'keto', icon: 'local_fire_department' },
];

const COMMON_ALLERGENS = ['Gluten', 'Lactosa', 'Huevos', 'Pescado', 'Mariscos', 'Frutos Secos'];

const BASIC_PANTRY = [
    { name: "Aceite oliva", canonical_key: "aceite_oliva", quantity: 1, unit: "l", category: "Despensa" },
    { name: "Sal", canonical_key: "sal", quantity: 1, unit: "kg", category: "Despensa" },
    { name: "Pimienta negra", canonical_key: "pimienta_negra", quantity: 50, unit: "g", category: "Despensa" },
    { name: "Cebolla", canonical_key: "cebolla", quantity: 500, unit: "g", category: "Despensa" },
    { name: "Ajo", canonical_key: "ajo", quantity: 100, unit: "g", category: "Despensa" },
    { name: "Tomate triturado", canonical_key: "tomate_triturado", quantity: 400, unit: "g", category: "Despensa" },
    { name: "Vinagre", canonical_key: "vinagre", quantity: 250, unit: "ml", category: "Despensa" },
    { name: "Oregano", canonical_key: "oregano", quantity: 25, unit: "g", category: "Despensa" },
    { name: "Arroz", canonical_key: "arroz", quantity: 1, unit: "kg", category: "Despensa", excludeDiets: ["keto"] },
    { name: "Pasta", canonical_key: "pasta", quantity: 500, unit: "g", category: "Despensa", excludeDiets: ["keto", "sin_gluten"] },
    { name: "Huevos", canonical_key: "huevo", quantity: 12, unit: "ud", category: "Nevera", excludeDiets: ["vegano"] },
    { name: "Leche", canonical_key: "leche", quantity: 1, unit: "l", category: "Nevera", excludeDiets: ["vegano", "sin_lactosa"] },
];

const DEFAULT_SUPERMARKETS = [
    { code: 'MERCADONA', display_name: 'Mercadona', color: '#009234' },
    { code: 'CONSUM', display_name: 'Consum', color: '#E8611A' },
];

const LOADING_MESSAGES = [
    { icon: "psychology", text: "Analizando tu perfil nutricional..." },
    { icon: "search", text: "Buscando recetas en el catalogo..." },
    { icon: "shopping_cart", text: "Calculando precios reales..." },
    { icon: "savings", text: "Optimizando tu cesta de la compra..." },
    { icon: "auto_awesome", text: "Finalizando tu menu..." },
];

export default function Planificar() {
    const navigate = useNavigate();

    const [supermarkets, setSupermarkets] = useState(DEFAULT_SUPERMARKETS);
    const [selectedSuper, setSelectedSuper] = useState(() => localStorage.getItem(lsKey('preferred_supermarket')) || '');
    const [goal, setGoal] = useState('maintain');
    const [diet, setDiet] = useState('omnivoro');
    const [allergens, setAllergens] = useState([]);
    const [people, setPeople] = useState(1);

    const [loading, setLoading] = useState(false);
    const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0]);
    const [error, setError] = useState('');

    useEffect(() => {
        api.getSupermarkets()
            .then(r => {
                const list = r?.supermarkets || r?.data?.supermarkets;
                if (list?.length) setSupermarkets(list);
            })
            .catch(() => {});
    }, []);

    const toggleAllergen = (a) => setAllergens(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);

    const handleGenerate = async () => {
        if (loading) return;
        setLoading(true);
        setError('');
        setLoadingMsg(LOADING_MESSAGES[0]);

        let msgIdx = 0;
        const msgInterval = setInterval(() => {
            msgIdx = (msgIdx + 1) % LOADING_MESSAGES.length;
            setLoadingMsg(LOADING_MESSAGES[msgIdx]);
        }, 5000);

        const superCode = selectedSuper || supermarkets[0]?.code || 'MERCADONA';
        const pantryItems = BASIC_PANTRY
            .filter(item => !item.excludeDiets || !item.excludeDiets.includes(diet))
            .map(({ excludeDiets, ...item }) => item);

        try {
            localStorage.setItem(lsKey('preferred_supermarket'), superCode);
            localStorage.setItem('nutriplanner_pantry_items', JSON.stringify(pantryItems));

            const payload = {
                goal,
                diet,
                economic_level: 'normal',
                prioritize_offers: true,
                menu_mode: 'savings',
                cooking_time: 'normal',
                skill_level: 'intermediate',
                meal_prep: false,
                prefer_favorites: false,
                allergens,
                hated_foods: [],
                pantry_items: pantryItems,
                current_weight: 0,
                target_calories: 2000,
                plan_days: 7,
                meals_per_day: 3,
                preferred_supermarket: superCode,
            };

            const response = await api.generatePlanV3(payload);

            if (!response?.menu?.length) throw new Error("Menu invalido");

            // Save everything to localStorage (same keys as Dashboard flow)
            localStorage.setItem(lsKey('plan'), JSON.stringify(response));
            localStorage.setItem(lsKey('version'), 'v3');
            if (response.shopping_list) localStorage.setItem(lsKey('shopping_v2'), JSON.stringify(response.shopping_list));
            if (response.comparison) localStorage.setItem(lsKey('comparison_v2'), JSON.stringify(response.comparison));
            if (response.products_map) localStorage.setItem(lsKey('products_map'), JSON.stringify(response.products_map));
            if (response.pantry_items) localStorage.setItem(lsKey('pantry_items'), JSON.stringify(response.pantry_items));

            localStorage.setItem(lsKey('wizard_data'), JSON.stringify({
                diet, allergens, hatedFoods: [], targetCalories: 2000,
                cookingTime: 'normal', skillLevel: 'intermediate',
                economicLevel: 'normal', menuMode: 'savings',
            }));

            track('plan_generated_public', { diet, goal, supermarket: superCode });

            clearInterval(msgInterval);
            navigate('/mi-menu');
        } catch (err) {
            clearInterval(msgInterval);
            setError(err?.response?.data?.detail || "Error al generar el menu. Intentalo de nuevo.");
            setLoading(false);
        }
    };

    // Loading screen
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] p-8 text-center">
                <div className="flex flex-col items-center gap-8 max-w-md">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl animate-pulse text-[var(--color-primary)]">{loadingMsg.icon}</span>
                        </div>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                            Generando tu menu
                        </h2>
                        <p className="text-[var(--color-text-muted)] mt-2 transition-all duration-500">{loadingMsg.text}</p>
                    </div>
                    <div className="w-full bg-[var(--color-border)] rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full animate-loading-bar" style={{ background: 'var(--gradient-hero)' }} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto px-5 py-10 pb-12">
            {/* Title */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ background: 'var(--gradient-hero)' }}>
                    <span className="material-symbols-outlined text-white text-2xl">auto_awesome</span>
                </div>
                <h1 className="text-3xl sm:text-4xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Planifica tu semana
                </h1>
                <p className="text-[var(--color-text-secondary)] mt-2">Elige tus preferencias y genera tu menu personalizado</p>
            </div>

            <div className="space-y-8">
                {/* 1. Supermarket */}
                <section>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block">
                        1. Tu supermercado
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        {supermarkets.map(s => (
                            <button
                                key={s.code}
                                onClick={() => setSelectedSuper(s.code)}
                                className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${selectedSuper === s.code
                                    ? 'border-[var(--color-primary)] bg-[var(--color-tint-teal)] scale-[1.02] shadow-md'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/30'
                                }`}
                            >
                                <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: s.color + '15' }}>
                                    <span className="material-symbols-outlined text-xl" style={{ color: s.color }}>storefront</span>
                                </div>
                                <span className={`text-sm font-bold ${selectedSuper === s.code ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                                    {s.display_name}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* 2. Goal */}
                <section>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block">
                        2. Tu objetivo
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {GOAL_OPTIONS.map(opt => (
                            <button
                                key={opt.val}
                                onClick={() => setGoal(opt.val)}
                                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${goal === opt.val
                                    ? 'border-[var(--color-primary)] bg-[var(--color-tint-teal)] scale-[1.02] shadow-md'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-primary)]/30'
                                }`}
                            >
                                <div className={`h-12 w-12 rounded-full ${opt.bg} flex items-center justify-center`}>
                                    <span className={`material-symbols-outlined text-2xl ${opt.color}`}>{opt.icon}</span>
                                </div>
                                <span className={`text-sm font-bold text-center ${goal === opt.val ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                                    {opt.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* 3. Diet */}
                <section>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block">
                        3. Tipo de dieta
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {DIET_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setDiet(opt.value)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all ${diet === opt.value
                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-md'
                                    : 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                }`}
                            >
                                <span className={`material-symbols-outlined text-base ${diet === opt.value ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>{opt.icon}</span>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* 4. Family size */}
                <section>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block">
                        4. Personas
                    </label>
                    <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                onClick={() => setPeople(n)}
                                className={`flex-1 py-3 rounded-xl border-2 text-center font-bold transition-all ${people === n
                                    ? 'border-[var(--color-primary)] bg-[var(--color-tint-teal)] text-[var(--color-primary)]'
                                    : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] hover:border-[var(--color-primary)]/30'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                        {people === 1 ? 'Menu individual' : `Menu para ${people} personas`}
                    </p>
                </section>

                {/* 5. Allergens */}
                <section>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 block">
                        5. Alergias (opcional)
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {COMMON_ALLERGENS.map(allergen => (
                            <button
                                key={allergen}
                                onClick={() => toggleAllergen(allergen)}
                                className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all ${allergens.includes(allergen)
                                    ? 'bg-red-50 border-red-300 text-red-600'
                                    : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-red-300'
                                }`}
                            >
                                {allergen}
                            </button>
                        ))}
                    </div>
                </section>

                {/* Info */}
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[var(--color-tint-teal)] border border-[var(--color-primary)]/20">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-lg mt-0.5">info</span>
                    <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                        <strong className="text-[var(--color-text-primary)]">Plan de 7 dias</strong> con 3 comidas diarias y ~2000 kcal.
                        Sin registro, sin pagos. Tu menu y lista de compra estaran listos en segundos.
                    </p>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">warning</span>
                        {error}
                    </div>
                )}
            </div>

            {/* CTA — inline on mobile, sticky on larger screens */}
            <div className="mt-8">
                <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className="w-full h-14 text-white font-bold text-lg rounded-full flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-[0.97] transition-transform disabled:opacity-60"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <span className="material-symbols-outlined text-xl">auto_awesome</span>
                    Generar Mi Menu
                </button>
            </div>
        </div>
    );
}
