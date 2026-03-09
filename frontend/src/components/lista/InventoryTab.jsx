import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../../services/api';

const QUICK_ADD_CHIPS = [
    { name: 'Huevos', icon: 'egg' },
    { name: 'Aceite de oliva', icon: 'water_drop' },
    { name: 'Arroz', icon: 'rice_bowl' },
    { name: 'Leche', icon: 'water_full' },
    { name: 'Sal', icon: 'nutrition' },
    { name: 'Cebolla', icon: 'nutrition' },
    { name: 'Ajo', icon: 'nutrition' },
    { name: 'Pasta', icon: 'dinner_dining' },
];

const CATEGORY_CONFIG = {
    'Nevera': { icon: 'kitchen', color: 'text-blue-500', bg: 'bg-blue-100', badgeBg: 'bg-blue-100', badgeText: 'text-blue-600' },
    'Fresco': { icon: 'eco', color: 'text-green-500', bg: 'bg-green-100', badgeBg: 'bg-green-100', badgeText: 'text-green-600' },
    'Proteinas': { icon: 'set_meal', color: 'text-red-500', bg: 'bg-red-100', badgeBg: 'bg-red-100', badgeText: 'text-red-600' },
    'Despensa': { icon: 'shelves', color: 'text-amber-500', bg: 'bg-amber-100', badgeBg: 'bg-amber-100', badgeText: 'text-amber-600' },
};

function classifyItemCategory(name) {
    const n = name.toLowerCase();
    if (/leche|yogur|queso|mantequilla|nata|kefir|crema|margarina/.test(n)) return 'Nevera';
    if (/pollo|ternera|cerdo|pavo|jamon|chorizo|salmon|atun|merluza|bacalao|gambas|langostino|huevo|lomo|pechuga|muslo|carne|pescado|bacon|salchicha/.test(n)) return 'Proteinas';
    if (/tomate|cebolla|ajo|patata|zanahoria|pimiento|calabacin|berenjena|espinaca|lechuga|brocoli|pepino|apio|col|champin|aguacate|platano|manzana|naranja|limon|fresa|arandano|frambuesa|melocoton|pera|sandia|melon|uva|kiwi|fruta|verdura/.test(n)) return 'Fresco';
    return 'Despensa';
}

export default function InventoryTab({ onItemCountChange }) {
    const [pantryItems, setPantryItems] = useState([]);
    const [inventoryLoading, setInventoryLoading] = useState(false);
    const [addInputValue, setAddInputValue] = useState('');
    const [addingItem, setAddingItem] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState(-1);
    const [allIngredients, setAllIngredients] = useState([]);
    const [collapsedCategories, setCollapsedCategories] = useState(new Set());
    const addInputRef = useRef(null);
    const suggestionsRef = useRef(null);

    const getToken = useCallback(() => localStorage.getItem('token'), []);

    const syncToLocalStorage = useCallback((items) => {
        const lsItems = items.map(item => ({
            name: item.name, id: item.id
        }));
        localStorage.setItem('nutriplanner_pantry_items', JSON.stringify(lsItems));
        onItemCountChange?.(lsItems.length);
    }, [onItemCountChange]);

    // Fetch inventory from backend
    const fetchInventory = useCallback(async () => {
        const token = getToken();
        if (!token) {
            const stored = localStorage.getItem('nutriplanner_pantry_items');
            if (stored) {
                try { setPantryItems(JSON.parse(stored)); } catch { /* ignore */ }
            }
            return;
        }
        setInventoryLoading(true);
        try {
            const data = await api.getInventory();
            const items = Array.isArray(data) ? data : [];
            setPantryItems(items);
            syncToLocalStorage(items);
        } catch (error) {
            console.error('[Inventario] Error fetching:', error);
            const stored = localStorage.getItem('nutriplanner_pantry_items');
            if (stored) { try { setPantryItems(JSON.parse(stored)); } catch { /* ignore */ } }
        } finally {
            setInventoryLoading(false);
        }
    }, [getToken, syncToLocalStorage]);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('nutriplanner_pantry_items');
            if (stored) setPantryItems(JSON.parse(stored));
        } catch { /* ignore */ }
    }, []);

    // Fetch from API when tab becomes active
    useEffect(() => { fetchInventory(); }, [fetchInventory]);

    // Load autocomplete ingredients
    useEffect(() => {
        api.getCommonIngredients()
            .then(data => setAllIngredients((data.ingredients || []).map(name => ({ name }))))
            .catch(() => {
                setAllIngredients(['Aceite de oliva', 'Arroz', 'Sal', 'Leche', 'Huevos', 'Harina', 'Mantequilla', 'Queso', 'Tomate', 'Cebolla', 'Ajo', 'Patatas', 'Pasta', 'Pan', 'Pollo', 'Yogur'].map(name => ({ name })));
            });
    }, []);

    // Autocomplete filter
    useEffect(() => {
        if (addInputValue.length >= 2 && allIngredients.length > 0) {
            const query = addInputValue.toLowerCase();
            const filtered = allIngredients.filter(ing => ing.name.toLowerCase().includes(query)).slice(0, 6);
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setSelectedSuggestionIdx(-1);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [addInputValue, allIngredients]);

    // Close autocomplete on outside click
    useEffect(() => {
        const handler = (e) => {
            if (addInputRef.current && !addInputRef.current.contains(e.target) && suggestionsRef.current && !suggestionsRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Report item count changes
    useEffect(() => { onItemCountChange?.(pantryItems.length); }, [pantryItems.length, onItemCountChange]);

    const handleAddItem = async () => {
        const name = addInputValue.trim();
        if (!name) return;

        const match = allIngredients.find(ing => ing.name.toLowerCase() === name.toLowerCase());
        if (!match) {
            const query = name.toLowerCase();
            const filtered = allIngredients.filter(ing => ing.name.toLowerCase().includes(query)).slice(0, 6);
            if (filtered.length > 0) { setSuggestions(filtered); setShowSuggestions(true); return; }
        }

        const cleanedName = match ? match.name : (name.charAt(0).toUpperCase() + name.slice(1));
        setAddingItem(true);

        const tempId = Date.now();
        const optimisticItem = { id: tempId, name: cleanedName, category: classifyItemCategory(cleanedName) };
        const newItems = [...pantryItems, optimisticItem];
        setPantryItems(newItems);
        syncToLocalStorage(newItems);
        setAddInputValue('');
        setShowSuggestions(false);

        try {
            const token = getToken();
            if (token) {
                const savedItem = await api.addInventoryItem({ name: cleanedName, quantity: 1, unit: 'ud', category: 'Despensa' });
                setPantryItems(prev => { const updated = prev.map(item => item.id === tempId ? savedItem : item); syncToLocalStorage(updated); return updated; });
            }
        } catch (error) { console.error('[Inventario] Error adding:', error); }
        finally { setAddingItem(false); }
    };

    const handleDeleteItem = async (itemId) => {
        setDeletingId(itemId);
        const previousItems = [...pantryItems];
        const newItems = pantryItems.filter(item => item.id !== itemId);
        setPantryItems(newItems);
        syncToLocalStorage(newItems);

        try {
            const token = getToken();
            if (token) await api.deleteInventoryItem(itemId);
        } catch (error) {
            console.error('[Inventario] Error deleting:', error);
            setPantryItems(previousItems);
            syncToLocalStorage(previousItems);
        } finally { setDeletingId(null); }
    };

    const handleQuickAdd = async (chipName) => {
        setAddInputValue(chipName);
        const cleanedName = chipName.charAt(0).toUpperCase() + chipName.slice(1);
        setAddingItem(true);

        const tempId = Date.now();
        const guessedCategory = classifyItemCategory(cleanedName);
        const optimisticItem = { id: tempId, name: cleanedName, category: guessedCategory };
        const newItems = [...pantryItems, optimisticItem];
        setPantryItems(newItems);
        syncToLocalStorage(newItems);
        setAddInputValue('');

        try {
            const token = getToken();
            if (token) {
                const savedItem = await api.addInventoryItem({ name: cleanedName, quantity: 1, unit: 'ud', category: guessedCategory });
                setPantryItems(prev => { const updated = prev.map(item => item.id === tempId ? savedItem : item); syncToLocalStorage(updated); return updated; });
            }
        } catch (error) { console.error('[Inventario] Error quick-adding:', error); }
        finally { setAddingItem(false); }
    };

    const handleKeyDown = (e) => {
        if (showSuggestions) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedSuggestionIdx(prev => prev < suggestions.length - 1 ? prev + 1 : prev); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedSuggestionIdx(prev => prev > 0 ? prev - 1 : -1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedSuggestionIdx >= 0 && suggestions[selectedSuggestionIdx]) { setAddInputValue(suggestions[selectedSuggestionIdx].name); setShowSuggestions(false); setSelectedSuggestionIdx(-1); }
                else handleAddItem();
            }
            else if (e.key === 'Escape') { setShowSuggestions(false); setSelectedSuggestionIdx(-1); }
        } else if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); }
    };

    const groupedPantryItems = useMemo(() => {
        const groups = {};
        const categoryOrder = ['Nevera', 'Fresco', 'Proteinas', 'Despensa'];

        pantryItems.forEach(item => {
            const normalized = typeof item === 'string' ? { name: item } : item;
            let cat = normalized.category || 'Despensa';
            if (cat === 'Despensa') {
                const reclassified = classifyItemCategory(normalized.name || '');
                if (reclassified !== 'Despensa') cat = reclassified;
            }
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ ...normalized, _displayCategory: cat });
        });

        const sorted = {};
        categoryOrder.forEach(cat => { if (groups[cat]) sorted[cat] = groups[cat]; });
        Object.keys(groups).forEach(cat => { if (!sorted[cat]) sorted[cat] = groups[cat]; });
        return sorted;
    }, [pantryItems]);

    const availableChips = useMemo(() => {
        const pantryNames = new Set(pantryItems.map(i => (i.name || '').toLowerCase()));
        return QUICK_ADD_CHIPS.filter(chip => !pantryNames.has(chip.name.toLowerCase()));
    }, [pantryItems]);

    const toggleCategory = (category) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) newSet.delete(category); else newSet.add(category);
            return newSet;
        });
    };

    return (
        <div className="px-5 py-3">
            {/* Header card */}
            <div className="relative overflow-hidden rounded-xl shadow-md mb-4" style={{ background: 'var(--gradient-hero)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8"></div>
                <div className="absolute bottom-0 left-0 w-20 h-20 bg-white/5 rounded-full translate-y-6 -translate-x-6"></div>
                <div className="relative z-10 flex items-center justify-between p-5">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="material-symbols-outlined text-white/80 text-lg">kitchen</span>
                            <p className="text-white/80 text-xs font-bold uppercase tracking-wider">Tu Despensa</p>
                        </div>
                        <h3 className="text-white text-xl font-bold leading-tight">Ingredientes en Casa</h3>
                        <p className="text-white/60 text-sm font-medium">
                            {pantryItems.length === 0 ? 'Sin productos aun' : `${pantryItems.length} producto${pantryItems.length !== 1 ? 's' : ''} guardado${pantryItems.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                    <div className="flex items-center justify-center size-14 rounded-2xl bg-white/15 border border-white/20">
                        <span className="text-white text-2xl font-black tabular-nums">{pantryItems.length}</span>
                    </div>
                </div>
            </div>

            {/* Add item input */}
            <div className="relative mb-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            ref={addInputRef}
                            type="text"
                            value={addInputValue}
                            onChange={(e) => setAddInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={() => { if (addInputValue.length >= 2) setShowSuggestions(suggestions.length > 0); }}
                            placeholder="Arroz, Leche, Huevos..."
                            className="w-full h-12 pl-11 pr-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none transition-colors"
                        />
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[var(--color-text-muted)] text-xl pointer-events-none">search</span>
                    </div>
                    <button onClick={handleAddItem} disabled={!addInputValue.trim() || addingItem} className="size-12 flex items-center justify-center rounded-xl text-white shrink-0 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-md"
                        style={{ background: 'var(--gradient-hero)' }}
                    >
                        <span className="material-symbols-outlined text-xl font-bold">{addingItem ? 'hourglass_empty' : 'add'}</span>
                    </button>
                </div>

                {showSuggestions && suggestions.length > 0 && (
                    <div ref={suggestionsRef} className="absolute top-full left-0 right-14 mt-1 bg-[var(--color-bg-card)] rounded-xl shadow-xl border border-[var(--color-border)] max-h-52 overflow-y-auto z-50">
                        {suggestions.map((suggestion, idx) => (
                            <button
                                key={idx}
                                onClick={() => { setAddInputValue(suggestion.name); setShowSuggestions(false); setSelectedSuggestionIdx(-1); addInputRef.current?.focus(); }}
                                className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 ${idx === selectedSuggestionIdx ? 'bg-[var(--color-tint-teal)]' : 'hover:bg-[var(--color-bg-page)]'} ${idx !== suggestions.length - 1 ? 'border-b border-[var(--color-border)]' : ''}`}
                            >
                                <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg">nutrition</span>
                                <span className="font-medium text-[var(--color-text-primary)] text-sm">{suggestion.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick-add chips */}
            {availableChips.length > 0 && (
                <div className="mb-4">
                    <p className="text-[var(--color-text-muted)] text-xs font-semibold uppercase tracking-wider mb-2 ml-0.5">Anadir rapido</p>
                    <div className="flex flex-wrap gap-2">
                        {availableChips.map((chip) => (
                            <button key={chip.name} onClick={() => handleQuickAdd(chip.name)} disabled={addingItem} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-tint-teal)] active:scale-95 transition-all disabled:opacity-40">
                                <span className="material-symbols-outlined text-[var(--color-text-muted)] text-base">{chip.icon}</span>
                                <span className="text-xs font-semibold text-[var(--color-text-secondary)]">{chip.name}</span>
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-sm">add</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Items list */}
            {inventoryLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12">
                    <div className="w-8 h-8 border-3 border-[var(--color-primary)]/20 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
                    <p className="text-[var(--color-text-muted)] text-sm">Cargando tu despensa...</p>
                </div>
            ) : pantryItems.length === 0 ? (
                <div className="flex flex-col items-center text-center py-8">
                    <div className="size-20 rounded-full bg-[var(--color-tint-teal)] flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-[var(--color-primary)]/40 text-4xl">shelves</span>
                    </div>
                    <h4 className="text-[var(--color-text-primary)] text-base font-bold mb-1">Tu despensa esta vacia</h4>
                    <p className="text-[var(--color-text-muted)] text-sm max-w-[260px] mb-5">Anade los ingredientes que ya tienes en casa para que no aparezcan en tu lista de la compra.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {QUICK_ADD_CHIPS.slice(0, 4).map((chip) => (
                            <button key={chip.name} onClick={() => handleQuickAdd(chip.name)} disabled={addingItem} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-[var(--color-tint-teal)] border border-[var(--color-primary)]/20 hover:bg-[var(--color-primary-light)] active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-base">{chip.icon}</span>
                                <span className="text-sm font-semibold text-[var(--color-primary)]">{chip.name}</span>
                                <span className="material-symbols-outlined text-[var(--color-primary)]/60 text-sm">add</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    {Object.entries(groupedPantryItems).map(([category, items]) => {
                        const catConfig = CATEGORY_CONFIG[category] || CATEGORY_CONFIG['Despensa'];
                        const isCollapsed = collapsedCategories.has(category);

                        return (
                            <div key={category}>
                                <button onClick={() => toggleCategory(category)} className="flex items-center gap-2 py-2.5 mt-2 mb-1 w-full text-left group">
                                    <div className={`size-6 rounded-md ${catConfig.bg} flex items-center justify-center`}>
                                        <span className={`material-symbols-outlined text-sm ${catConfig.color}`}>{catConfig.icon}</span>
                                    </div>
                                    <h4 className="text-[var(--color-text-muted)] text-xs font-bold uppercase tracking-widest">{category}</h4>
                                    <span className="text-[var(--color-text-muted)] text-xs font-medium">({items.length})</span>
                                    <div className="flex-1 h-px bg-[var(--color-border)] ml-1"></div>
                                    <span className={`material-symbols-outlined text-[var(--color-text-muted)] text-lg transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}>expand_more</span>
                                </button>

                                {!isCollapsed && (
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-1.5 mb-1">
                                        {items.map((item) => {
                                            const itemName = typeof item === 'string' ? item : (item.name || 'Sin nombre');
                                            const itemId = typeof item === 'string' ? null : item.id;
                                            const isDeleting = deletingId === itemId;

                                            return (
                                                <div key={itemId || itemName} className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-bg-card)] border border-[var(--color-border)] transition-all duration-200 ${isDeleting ? 'opacity-30 scale-95' : ''}`}>
                                                    <p className="flex-1 font-medium text-[var(--color-text-primary)] truncate text-xs">{itemName}</p>
                                                    {itemId && (
                                                        <button onClick={() => handleDeleteItem(itemId)} disabled={isDeleting} className="size-5 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-red-500 hover:bg-[var(--color-tint-red)] active:scale-90 transition-all shrink-0 opacity-0 group-hover:opacity-100" title="Eliminar">
                                                            <span className="material-symbols-outlined text-sm">close</span>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="h-10"></div>
        </div>
    );
}
