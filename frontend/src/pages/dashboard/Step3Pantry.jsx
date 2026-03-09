import { useState, useEffect, useRef } from 'react';
import IngredientAutocomplete from '../../components/IngredientAutocomplete';
import { api } from '../../services/api';

const PANTRY_CATEGORIES = [
    {
        id: 'basicos', label: 'Básicos de Cocina', icon: 'skillet',
        items: ['Aceite de oliva', 'Sal', 'Pimienta', 'Vinagre', 'Azúcar']
    },
    {
        id: 'especias', label: 'Especias y Condimentos', icon: 'potted_plant',
        items: ['Orégano', 'Comino', 'Pimentón', 'Canela', 'Ajo en polvo']
    },
    {
        id: 'cereales', label: 'Cereales y Pasta', icon: 'rice_bowl',
        items: ['Arroz', 'Pasta', 'Harina', 'Pan rallado', 'Avena']
    },
    {
        id: 'frescos', label: 'Frescos Básicos', icon: 'egg',
        items: ['Huevos', 'Leche', 'Mantequilla', 'Cebolla', 'Ajo']
    },
    {
        id: 'conservas', label: 'Conservas y Salsas', icon: 'takeout_dining',
        items: ['Tomate triturado', 'Atún en lata', 'Legumbres cocidas', 'Salsa de soja', 'Mostaza']
    },
    {
        id: 'congelados', label: 'Congelados', icon: 'ac_unit',
        items: ['Verduras congeladas', 'Pescado congelado', 'Pan congelado']
    },
];

const Step3Pantry = ({ formData, updateForm, nextStep, prevStep }) => {
    const [newItem, setNewItem] = useState('');
    const [newHatedFood, setNewHatedFood] = useState('');
    const [commonIngredients, setCommonIngredients] = useState([]);
    const [validationError, setValidationError] = useState('');
    const [pantryLoaded, setPantryLoaded] = useState(false);
    const [expandedCategory, setExpandedCategory] = useState(null);

    const pantryFetchedRef = useRef(false);
    useEffect(() => {
        const fetchCommonIngredients = async () => {
            try {
                const data = await api.getCommonIngredients();
                setCommonIngredients(data.ingredients || []);

                if (!pantryFetchedRef.current) {
                    pantryFetchedRef.current = true;
                    const token = localStorage.getItem('token');
                    if (token) {
                        try {
                            const pantryData = await api.getInventory({ skipAuthRedirect: true });
                            if (Array.isArray(pantryData) && pantryData.length > 0) {
                                const names = pantryData.map(item => item.name);
                                updateForm('pantryItems', names);
                            }
                            setPantryLoaded(true);
                        } catch (_) { /* inventory fetch is optional */ }
                    }
                }
            } catch (error) {
                console.error("Error cargando ingredientes:", error);
            }
        };
        fetchCommonIngredients();
    }, []);

    const addItem = () => {
        const trimmed = newItem.trim();
        if (!trimmed) return;

        const isValid = commonIngredients.some(ing =>
            ing.toLowerCase().includes(trimmed.toLowerCase()) ||
            trimmed.toLowerCase().includes(ing.toLowerCase())
        );

        if (!isValid && commonIngredients.length > 0) {
            setValidationError(`"${trimmed}" no reconocido. Selecciona del autocompletado.`);
            setTimeout(() => setValidationError(''), 4000);
            return;
        }

        const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        const exists = formData.pantryItems.some(i => i.toLowerCase() === formatted.toLowerCase());

        if (!exists) {
            updateForm('pantryItems', [...formData.pantryItems, formatted]);
            setNewItem('');
            setValidationError('');
        } else {
            setNewItem('');
        }
    };

    const removeItem = (item) => updateForm('pantryItems', formData.pantryItems.filter(i => i !== item));

    const commonAllergens = ['Gluten', 'Lactosa', 'Huevos', 'Pescado', 'Mariscos', 'Frutos Secos', 'Cacahuetes', 'Soja'];

    const addHatedFood = () => {
        const trimmed = newHatedFood.trim();
        if (trimmed && !formData.hatedFoods.includes(trimmed)) {
            updateForm('hatedFoods', [...formData.hatedFoods, trimmed]);
            setNewHatedFood('');
        }
    };

    const removeHatedFood = (food) => {
        updateForm('hatedFoods', formData.hatedFoods.filter(f => f !== food));
    };

    const toggleAllergen = (a) => {
        const current = formData.allergens;
        updateForm('allergens', current.includes(a) ? current.filter(x => x !== a) : [...current, a]);
    };

    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md lg:max-w-5xl mx-auto bg-[var(--color-bg-page)]">
            <div className="sticky top-0 z-40 flex items-center bg-[var(--color-bg-header)] backdrop-blur-md p-4 pb-2 justify-between border-b border-[var(--color-border)]">
                <button onClick={prevStep} className="text-[var(--color-text-primary)] flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)]"><span className="material-symbols-outlined text-2xl">arrow_back</span></button>
                <h2 className="text-[var(--color-text-primary)] text-lg font-bold flex-1 text-center pr-12">Despensa y Restricciones</h2>
            </div>

            <div className="flex w-full flex-col items-center justify-center gap-2 py-4">
                <div className="flex flex-row items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">Paso 3 de 4</p>
            </div>

            <div className="flex-1 px-4 pb-32 space-y-6">
                {/* Info Banner */}
                <div className="group relative overflow-hidden rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-primary)]/30 p-4 transition-all">
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[var(--color-tint-teal)] blur-2xl transition-all group-hover:bg-[var(--color-primary-light)]"></div>
                    <div className="relative flex gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-tint-teal)] text-[var(--color-primary)]">
                            <span className="material-symbols-outlined text-2xl">inventory_2</span>
                        </div>
                        <div>
                            <h3 className="font-bold text-[var(--color-text-primary)]">Tu Despensa</h3>
                            <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                                Los ingredientes que marques no aparecerán en tu lista de la compra. Así solo compras lo que te falta.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Pantry Items */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-[var(--color-text-primary)] text-xl font-bold">Tu Despensa Permanente</h3>
                        <span className="text-xs font-medium text-[var(--color-primary)] bg-[var(--color-tint-teal)] px-2 py-1 rounded-full">{formData.pantryItems.length} ítems</span>
                    </div>

                    <div className="flex gap-2 mb-2">
                        <IngredientAutocomplete
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            onSelect={(name) => {
                                const trimmed = name.trim();
                                const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
                                if (formatted && !formData.pantryItems.includes(formatted)) {
                                    updateForm('pantryItems', [...formData.pantryItems, formatted]);
                                }
                                setNewItem('');
                            }}
                            className="flex-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-primary)] transition-colors"
                            placeholder="Añadir ingrediente (ej. Arroz, Almendras...)"
                        />
                        <button
                            onClick={addItem}
                            className="h-12 w-12 rounded-xl text-white hover:opacity-90 flex items-center justify-center transition-colors shadow-lg shadow-[var(--color-primary)]/20"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            <span className="text-2xl font-bold">+</span>
                        </button>
                    </div>

                    {validationError && (
                        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                            <span className="text-red-500 text-xs flex items-center gap-1"><span className="material-symbols-outlined text-sm">warning</span> {validationError}</span>
                        </div>
                    )}

                    {formData.pantryItems.length === 0 && (
                        <button
                            onClick={() => {
                                const allItems = PANTRY_CATEGORIES.flatMap(c => c.items);
                                const newItems = allItems.filter(b => !formData.pantryItems.some(i => i.toLowerCase() === b.toLowerCase()));
                                updateForm('pantryItems', [...formData.pantryItems, ...newItems]);
                            }}
                            className="w-full mb-3 py-3 rounded-xl border-2 border-dashed border-[var(--color-primary)]/30 bg-[var(--color-tint-teal)]/50 hover:bg-[var(--color-tint-teal)] hover:border-[var(--color-primary)]/50 text-[var(--color-primary)] font-semibold text-sm transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">done_all</span>
                            Tengo una despensa completa
                        </button>
                    )}

                    {/* Pantry Categories */}
                    <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 mb-3">
                        {PANTRY_CATEGORIES.map(cat => {
                            const catItemsLower = cat.items.map(i => i.toLowerCase());
                            const selectedCount = formData.pantryItems.filter(p => catItemsLower.includes(p.toLowerCase())).length;
                            const allSelected = selectedCount === cat.items.length;
                            const isExpanded = expandedCategory === cat.id;

                            return (
                                <div key={cat.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
                                    <div
                                        onClick={() => setExpandedCategory(isExpanded ? null : cat.id)}
                                        className="w-full flex items-center justify-between p-3 hover:bg-[var(--color-bg-page)] transition-colors cursor-pointer"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedCategory(isExpanded ? null : cat.id); } }}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-[var(--color-tint-teal)] text-[var(--color-primary)] flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">{cat.icon}</span>
                                            </div>
                                            <div className="text-left">
                                                <span className="text-[var(--color-text-primary)] text-sm font-semibold">{cat.label}</span>
                                                <span className="text-[var(--color-text-muted)] text-xs block">{selectedCount}/{cat.items.length} seleccionados</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (allSelected) {
                                                        const updated = formData.pantryItems.filter(p => !catItemsLower.includes(p.toLowerCase()));
                                                        updateForm('pantryItems', updated);
                                                    } else {
                                                        const newItems = cat.items.filter(b => !formData.pantryItems.some(i => i.toLowerCase() === b.toLowerCase()));
                                                        updateForm('pantryItems', [...formData.pantryItems, ...newItems]);
                                                    }
                                                }}
                                                className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${allSelected
                                                    ? 'bg-[var(--color-primary)] text-white'
                                                    : 'bg-[var(--color-tint-teal)] text-[var(--color-primary)] border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary-light)]'
                                                    }`}
                                            >
                                                {allSelected ? 'Todo' : 'Añadir todo'}
                                            </button>
                                            <span className={`material-symbols-outlined text-[var(--color-text-muted)] text-lg transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                                            {cat.items.map(item => {
                                                const isSelected = formData.pantryItems.some(p => p.toLowerCase() === item.toLowerCase());
                                                return (
                                                    <button
                                                        key={item}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                updateForm('pantryItems', formData.pantryItems.filter(p => p.toLowerCase() !== item.toLowerCase()));
                                                            } else {
                                                                updateForm('pantryItems', [...formData.pantryItems, item]);
                                                            }
                                                        }}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-95 ${isSelected
                                                            ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)] border border-[var(--color-primary)]/40'
                                                            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/20'
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{isSelected ? 'check_circle' : 'add_circle_outline'}</span>
                                                        {item}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="space-y-3">
                        {(() => {
                            // Group items by category, uncategorized last
                            const catMap = new Map();
                            const allCatItems = new Set(PANTRY_CATEGORIES.flatMap(c => c.items.map(i => i.toLowerCase())));
                            PANTRY_CATEGORIES.forEach(cat => {
                                const matched = formData.pantryItems.filter(p => cat.items.some(ci => ci.toLowerCase() === p.toLowerCase()));
                                if (matched.length > 0) catMap.set(cat.label, matched);
                            });
                            const uncategorized = formData.pantryItems.filter(p => !allCatItems.has(p.toLowerCase()));
                            if (uncategorized.length > 0) catMap.set('Otros', uncategorized);

                            return Array.from(catMap.entries()).map(([label, items]) => (
                                <div key={label}>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">{label}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {items.map((item, idx) => (
                                            <div key={idx} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full border border-[var(--color-primary)]/30 bg-[var(--color-tint-teal)] text-[var(--color-primary)] text-xs font-medium hover:border-[var(--color-primary)]/50 transition-all">
                                                <span>{item}</span>
                                                <button
                                                    onClick={() => removeItem(item)}
                                                    className="h-4 w-4 rounded-full hover:bg-red-100 text-[var(--color-primary)] hover:text-red-500 flex items-center justify-center transition-colors"
                                                >
                                                    <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                <hr className="border-[var(--color-border)]" />

                {/* Allergens */}
                <div>
                    <h3 className="text-[var(--color-text-primary)] text-xl font-bold mb-2">Ingredientes a Evitar</h3>
                    <p className="text-[var(--color-text-muted)] text-sm mb-4">Selecciona alérgenos comunes o añade los tuyos.</p>

                    <div className="flex flex-wrap gap-2 mb-4">
                        {commonAllergens.map(allergen => (
                            <button
                                key={allergen}
                                onClick={() => toggleAllergen(allergen)}
                                className={`px-4 py-2 rounded-full border text-sm font-medium transition-all ${formData.allergens.includes(allergen)
                                    ? 'bg-red-50 border-red-300 text-red-500'
                                    : 'bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-red-300'
                                    }`}
                            >
                                {allergen}
                            </button>
                        ))}
                    </div>

                    <div className="mb-4">
                        <p className="text-[var(--color-text-primary)] font-bold text-sm mb-2">Preferencias personales</p>
                        <p className="text-[var(--color-text-muted)] text-xs mb-2">Ingredientes que no te gustan (sin ser alérgeno)</p>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newHatedFood}
                                onChange={(e) => setNewHatedFood(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addHatedFood()}
                                className="flex-1 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-orange-500 transition-colors"
                                placeholder="Ej. Cilantro, Picante..."
                            />
                            <button
                                onClick={addHatedFood}
                                className="h-12 px-4 rounded-xl border border-[var(--color-border)] hover:border-orange-400 text-[var(--color-text-primary)] font-medium hover:text-orange-600 flex items-center justify-center transition-colors bg-[var(--color-bg-muted)]"
                            >
                                Añadir
                            </button>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {(formData.hatedFoods || []).map((food, idx) => (
                            <div key={`hated-${idx}`} className="inline-flex items-center gap-1 pl-3 pr-2 py-1.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-600 text-sm font-medium">
                                <span>{food}</span>
                                <button
                                    onClick={() => removeHatedFood(food)}
                                    className="hover:bg-orange-100 rounded p-0.5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-xs">close</span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 w-full bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-50 flex justify-center">
                <div className="w-full max-w-md lg:max-w-5xl">
                    <button
                        onClick={nextStep}
                        className="w-full h-14 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-[var(--color-primary)]/20"
                        style={{ background: 'var(--gradient-hero)' }}
                    >
                        Continuar <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Step3Pantry;
