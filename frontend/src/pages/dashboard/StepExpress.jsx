import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { track } from '../../services/analytics';
import { lsKey } from '../../config/brand';

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
    { label: 'Paleo', value: 'paleo', icon: 'park' },
    { label: 'Sin Lactosa', value: 'sin_lactosa', icon: 'water_drop' },
];

const COMMON_ALLERGENS = ['Gluten', 'Lactosa', 'Huevos', 'Pescado', 'Mariscos', 'Frutos Secos', 'Cacahuetes', 'Soja'];

// Basic pantry items most households already have
// canonical_key is used for robust matching with shopping list items
const BASIC_PANTRY = [
    // Universal (all diets) — canonical_keys must match backend BASIC_PANTRY
    { name: "Aceite oliva", canonical_key: "aceite_oliva", quantity: 1, unit: "l", category: "Despensa" },
    { name: "Sal", canonical_key: "sal", quantity: 1, unit: "kg", category: "Despensa" },
    { name: "Pimienta negra", canonical_key: "pimienta_negra", quantity: 50, unit: "g", category: "Despensa" },
    { name: "Cebolla", canonical_key: "cebolla", quantity: 500, unit: "g", category: "Despensa" },
    { name: "Ajo", canonical_key: "ajo", quantity: 100, unit: "g", category: "Despensa" },
    { name: "Tomate triturado", canonical_key: "tomate_triturado", quantity: 400, unit: "g", category: "Despensa" },
    { name: "Vinagre", canonical_key: "vinagre", quantity: 250, unit: "ml", category: "Despensa" },
    { name: "Oregano", canonical_key: "oregano", quantity: 25, unit: "g", category: "Despensa" },
    // Carbs (excluded for keto/paleo/sin_gluten where applicable)
    { name: "Arroz", canonical_key: "arroz", quantity: 1, unit: "kg", category: "Despensa", excludeDiets: ["keto"] },
    { name: "Pasta", canonical_key: "pasta", quantity: 500, unit: "g", category: "Despensa", excludeDiets: ["keto", "sin_gluten", "paleo"] },
    { name: "Harina trigo", canonical_key: "harina_trigo", quantity: 1, unit: "kg", category: "Despensa", excludeDiets: ["keto", "sin_gluten", "paleo"] },
    { name: "Patatas", canonical_key: "patata", quantity: 1, unit: "kg", category: "Despensa", excludeDiets: ["keto", "paleo"] },
    // Animal products (excluded for vegano/vegetariano where applicable)
    { name: "Huevos", canonical_key: "huevo", quantity: 12, unit: "ud", category: "Nevera", excludeDiets: ["vegano"] },
    { name: "Leche", canonical_key: "leche", quantity: 1, unit: "l", category: "Nevera", excludeDiets: ["vegano", "sin_lactosa"] },
    { name: "Mantequilla", canonical_key: "mantequilla", quantity: 250, unit: "g", category: "Nevera", excludeDiets: ["vegano", "sin_lactosa", "paleo"] },
];

const getFilteredPantry = (diet) => {
    return BASIC_PANTRY
        .filter(item => !item.excludeDiets || !item.excludeDiets.includes(diet))
        .map(({ excludeDiets, ...item }) => item);
};

// Fallback supermarket list (used if API is unavailable)
const DEFAULT_SUPERMARKETS = [
    { code: 'MERCADONA', display_name: 'Mercadona', color: '#009234', icon: 'storefront' },
    { code: 'CONSUM', display_name: 'Consum', color: '#E8611A', icon: 'storefront' },
];

const StepExpress = ({ updateForm, goToSummary, prevStep, goToCustomize, user, setTargetCalories }) => {
    const [supermarkets, setSupermarkets] = useState(DEFAULT_SUPERMARKETS);
    const [selectedSuper, setSelectedSuper] = useState(() => localStorage.getItem(lsKey('preferred_supermarket')) || '');
    const [goal, setGoal] = useState('lose_weight');
    const [diet, setDiet] = useState('omnivoro');
    const [allergens, setAllergens] = useState([]);

    useEffect(() => {
        api.getSupermarkets().then(r => {
            if (r?.data?.supermarkets?.length) setSupermarkets(r.data.supermarkets);
        }).catch(() => {});
    }, []);

    const toggleAllergen = (a) => {
        setAllergens(prev => prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]);
    };

    const handleGenerate = () => {
        const basicPantry = getFilteredPantry(diet);
        const superCode = selectedSuper || supermarkets[0]?.code || 'MERCADONA';

        // Save supermarket preference
        localStorage.setItem(lsKey('preferred_supermarket'), superCode);
        updateForm('preferred_supermarket', superCode);

        // Set all form values with sensible defaults
        updateForm('goal', goal);
        updateForm('diet', diet);
        updateForm('allergens', allergens);
        updateForm('target_calories', 2000);
        updateForm('planDays', 7);
        updateForm('mealsPerDay', 3);
        updateForm('cookingTime', 'normal');
        updateForm('skillLevel', 'intermediate');
        updateForm('economicLevel', 'normal');
        updateForm('menuMode', 'savings');
        updateForm('mealPrep', false);
        updateForm('hatedFoods', []);
        updateForm('pantryItems', basicPantry);

        // Pre-save to localStorage so Lista.jsx can use it immediately (guest mode)
        localStorage.setItem('nutriplanner_pantry_items', JSON.stringify(basicPantry));

        if (setTargetCalories) setTargetCalories(2000);

        updateForm('_fromExpress', true);
        track('express_onboarding_completed', { goal, diet, allergens_count: allergens.length, pantry_basics: basicPantry.length, supermarket: superCode });
        goToSummary();
    };

    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md lg:max-w-3xl mx-auto bg-[var(--color-bg-page)]">
            {/* Header */}
            <div className="sticky top-0 z-40 flex items-center bg-[var(--color-bg-header)] backdrop-blur-md p-4 pb-2 justify-between border-b border-[var(--color-border)]">
                <button onClick={prevStep} className="text-[var(--color-text-primary)] flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)]">
                    <span className="material-symbols-outlined text-2xl">arrow_back</span>
                </button>
                <h2 className="text-[var(--color-text-primary)] text-lg font-bold flex-1 text-center pr-12">Menu Express</h2>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 pb-32 space-y-6 pt-4">
                {/* Intro */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-1" style={{ background: 'var(--gradient-hero)' }}>
                        <span className="material-symbols-outlined text-white text-2xl">bolt</span>
                    </div>
                    <h1 className="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight">
                        Tu menu en 30 segundos
                    </h1>
                    <p className="text-[var(--color-text-muted)] text-sm">
                        4 preguntas y tu semana esta planificada
                    </p>
                </div>

                {/* 0. Supermarket */}
                <div>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block px-1">
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
                                    <span className="material-symbols-outlined text-xl" style={{ color: s.color }}>
                                        {s.icon || 'storefront'}
                                    </span>
                                </div>
                                <span className={`text-sm font-bold ${selectedSuper === s.code ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                                    {s.display_name}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 2. Goal */}
                <div>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block px-1">
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
                                <span className={`text-sm font-bold ${goal === opt.val ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-primary)]'}`}>
                                    {opt.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 3. Diet */}
                <div>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 block px-1">
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
                                <span className={`material-symbols-outlined text-base ${diet === opt.value ? 'text-white' : 'text-[var(--color-text-muted)]'}`}>
                                    {opt.icon}
                                </span>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4. Allergens */}
                <div>
                    <label className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2 block px-1">
                        4. Alergias (opcional)
                    </label>
                    <p className="text-[var(--color-text-muted)] text-xs mb-3 px-1">Toca para seleccionar tus alergenos</p>
                    <div className="flex flex-wrap gap-2">
                        {COMMON_ALLERGENS.map(allergen => (
                            <button
                                key={allergen}
                                onClick={() => toggleAllergen(allergen)}
                                className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all ${allergens.includes(allergen)
                                    ? 'bg-red-50 border-red-300 text-red-600 shadow-sm'
                                    : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-red-300'
                                    }`}
                            >
                                {allergen}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Defaults info */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--color-tint-teal)] border border-[var(--color-primary)]/20">
                    <span className="material-symbols-outlined text-[var(--color-primary)] text-lg mt-0.5">info</span>
                    <div className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                        <span className="font-bold text-[var(--color-text-primary)]">Modo rapido:</span> Plan de 7 dias, 3 comidas/dia, 2000 kcal, ahorro maximo.
                        Podras ajustar estos valores despues en tu perfil.
                    </div>
                </div>
            </div>

            {/* Bottom Button */}
            <div className="fixed bottom-0 left-0 right-0 w-full bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-50 flex justify-center">
                <div className="w-full max-w-md lg:max-w-3xl space-y-2">
                    <button
                        onClick={handleGenerate}
                        style={{ background: 'var(--gradient-hero)' }}
                        className="w-full h-14 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-[var(--color-primary)]/20"
                    >
                        <span className="material-symbols-outlined text-xl">auto_awesome</span>
                        Generar Mi Menu
                    </button>
                    {goToCustomize && (
                        <button
                            onClick={goToCustomize}
                            className="w-full text-center text-[var(--color-text-muted)] text-xs font-medium py-2 hover:text-[var(--color-primary)] transition-colors"
                        >
                            Personalizar calorias, dias y mas opciones →
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StepExpress;
