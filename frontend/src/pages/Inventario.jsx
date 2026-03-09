import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import IngredientAutocomplete from '../components/IngredientAutocomplete';
import BottomNav from '../components/NavBar';
import { api } from '../services/api';

// ---------------------------------------------------------------------------
// Static pantry catalog — shown as selectable chips grouped by category.
// These are the items the backend uses for pantry-coverage exclusion.
// ---------------------------------------------------------------------------
const BASIC_PANTRY = [
    {
        id: 'especias',
        label: 'Especias',
        icon: 'potted_plant',
        items: [
            { name: 'Sal',           canonical_key: 'sal' },
            { name: 'Pimienta negra', canonical_key: 'pimienta_negra' },
            { name: 'Orégano',       canonical_key: 'oregano' },
            { name: 'Pimentón',      canonical_key: 'pimenton' },
            { name: 'Comino',        canonical_key: 'comino' },
            { name: 'Laurel',        canonical_key: 'laurel' },
            { name: 'Perejil',       canonical_key: 'perejil' },
        ],
    },
    {
        id: 'aceites',
        label: 'Aceites',
        icon: 'water_drop',
        items: [
            { name: 'Aceite de oliva', canonical_key: 'aceite_oliva' },
            { name: 'Vinagre',         canonical_key: 'vinagre' },
        ],
    },
    {
        id: 'despensa',
        label: 'Despensa',
        icon: 'shelves',
        items: [
            { name: 'Azúcar',         canonical_key: 'azucar' },
            { name: 'Harina de trigo', canonical_key: 'harina_trigo' },
            { name: 'Arroz',           canonical_key: 'arroz' },
            { name: 'Pasta',           canonical_key: 'pasta' },
            { name: 'Pan rallado',     canonical_key: 'pan_rallado' },
        ],
    },
    {
        id: 'lacteos',
        label: 'Lácteos',
        icon: 'egg',
        items: [
            { name: 'Leche',       canonical_key: 'leche' },
            { name: 'Huevos',      canonical_key: 'huevo' },
            { name: 'Mantequilla', canonical_key: 'mantequilla' },
        ],
    },
    {
        id: 'verduras',
        label: 'Verduras',
        icon: 'eco',
        items: [
            { name: 'Ajo',    canonical_key: 'ajo' },
            { name: 'Cebolla', canonical_key: 'cebolla' },
        ],
    },
    {
        id: 'conservas',
        label: 'Conservas',
        icon: 'takeout_dining',
        items: [
            { name: 'Tomate frito',       canonical_key: 'tomate_frito' },
            { name: 'Caldo de pollo',     canonical_key: 'caldo_pollo' },
            { name: 'Caldo de verduras',  canonical_key: 'caldo_verduras' },
        ],
    },
    {
        id: 'frutas',
        label: 'Frutas',
        icon: 'nutrition',
        items: [
            { name: 'Limón', canonical_key: 'limon' },
        ],
    },
    {
        id: 'otros',
        label: 'Otros',
        icon: 'category',
        items: [
            { name: 'Miel', canonical_key: 'miel' },
        ],
    },
];

// Flatten for quick lookup
const ALL_BASIC_ITEMS = BASIC_PANTRY.flatMap(cat =>
    cat.items.map(item => ({ ...item, category: cat.label }))
);

// ---------------------------------------------------------------------------
// Helper: derive diet from localStorage wizard data
// ---------------------------------------------------------------------------
const getDietFromStorage = () => {
    try {
        const raw = localStorage.getItem('nutriplanner_wizard_data');
        if (!raw) return 'omnivoro';
        const parsed = JSON.parse(raw);
        return parsed?.diet || 'omnivoro';
    } catch {
        return 'omnivoro';
    }
};

// ---------------------------------------------------------------------------
// CategorySection — collapsible category with chip-toggle items
// ---------------------------------------------------------------------------
const CategorySection = ({ category, inventoryItems, onToggle, pendingKeys }) => {
    const [collapsed, setCollapsed] = useState(false);

    // Build a lookup: canonical_key → inventory item (so we know id + active)
    const activeByKey = {};
    inventoryItems.forEach(inv => {
        if (inv.canonical_key) activeByKey[inv.canonical_key] = inv;
    });
    // Also match by name (for user-added items without canonical_key)
    const activeByName = {};
    inventoryItems.forEach(inv => {
        activeByName[inv.name?.toLowerCase()] = inv;
    });

    const activeCount = category.items.filter(
        item => activeByKey[item.canonical_key] || activeByName[item.name?.toLowerCase()]
    ).length;

    return (
        <div className="rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] overflow-hidden shadow-sm">
            {/* Category header */}
            <button
                onClick={() => setCollapsed(prev => !prev)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-bg-muted)] transition-colors"
                aria-expanded={!collapsed}
            >
                <div className="flex items-center justify-center size-9 rounded-lg bg-[var(--color-tint-teal)] text-[var(--color-primary)] shrink-0">
                    <span className="material-symbols-outlined text-lg">{category.icon}</span>
                </div>
                <div className="flex-1 text-left">
                    <span className="text-[var(--color-text-primary)] text-sm font-semibold">{category.label}</span>
                    <span className="text-[var(--color-text-muted)] text-xs block">
                        {activeCount}/{category.items.length} seleccionados
                    </span>
                </div>
                <span className={`material-symbols-outlined text-[var(--color-text-muted)] text-lg transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}>
                    expand_more
                </span>
            </button>

            {/* Chips */}
            {!collapsed && (
                <div className="px-4 pb-4 pt-1 flex flex-wrap gap-2">
                    {category.items.map(item => {
                        const activeItem = activeByKey[item.canonical_key] || activeByName[item.name?.toLowerCase()];
                        const isActive = Boolean(activeItem);
                        const isPending = pendingKeys.has(item.canonical_key);

                        return (
                            <button
                                key={item.canonical_key}
                                onClick={() => onToggle(item, activeItem)}
                                disabled={isPending}
                                aria-pressed={isActive}
                                className={`
                                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold
                                    border transition-all duration-150 active:scale-95
                                    ${isPending ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                                    ${isActive
                                        ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-sm'
                                        : 'bg-[var(--color-bg-muted)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-tint-teal)]'
                                    }
                                `}
                            >
                                {isPending ? (
                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                ) : isActive ? (
                                    <span className="material-symbols-outlined text-sm">check</span>
                                ) : (
                                    <span className="material-symbols-outlined text-sm">add</span>
                                )}
                                {item.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const Inventario = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [inventoryItems, setInventoryItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [pendingKeys, setPendingKeys] = useState(new Set());

    // Custom-item autocomplete state
    const [customItemName, setCustomItemName] = useState('');
    const [addingCustom, setAddingCustom] = useState(false);

    const diet = getDietFromStorage();

    // -----------------------------------------------------------------------
    // Fetch inventory on mount
    // -----------------------------------------------------------------------
    const fetchInventory = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            if (!token) {
                setLoading(false);
                return;
            }
            const data = await api.getInventory();
            setInventoryItems(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('[Inventario] Error cargando despensa:', error);
            setInventoryItems([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    // Persist count to localStorage so Lista.jsx can read it
    useEffect(() => {
        try {
            localStorage.setItem('nutriplanner_pantry_items', JSON.stringify(inventoryItems));
        } catch { /* quota guard */ }
    }, [inventoryItems]);

    // -----------------------------------------------------------------------
    // Toggle a predefined chip item on/off
    // -----------------------------------------------------------------------
    const handleToggle = useCallback(async (basicItem, activeInventoryItem) => {
        setPendingKeys(prev => new Set([...prev, basicItem.canonical_key]));

        try {
            if (activeInventoryItem) {
                // Remove: optimistic update first
                setInventoryItems(prev => prev.filter(i => i.id !== activeInventoryItem.id));
                await api.deleteInventoryItem(activeInventoryItem.id);
            } else {
                // Add: optimistic update with temp id
                const tempId = `temp_${Date.now()}_${basicItem.canonical_key}`;
                const optimistic = {
                    id: tempId,
                    name: basicItem.name,
                    canonical_key: basicItem.canonical_key,
                    category: basicItem.category,
                    unit: 'ud',
                    quantity: 1,
                };
                setInventoryItems(prev => [...prev, optimistic]);

                const saved = await api.addInventoryItem({
                    name: basicItem.name,
                    canonical_key: basicItem.canonical_key,
                    category: basicItem.category,
                    unit: 'ud',
                    quantity: 1,
                });
                // Replace temp with real record
                setInventoryItems(prev =>
                    prev.map(i => i.id === tempId ? { ...optimistic, ...saved } : i)
                );
            }
        } catch (error) {
            console.error('[Inventario] Toggle error:', error);
            // Revert optimistic update on failure
            await fetchInventory();
        } finally {
            setPendingKeys(prev => {
                const next = new Set(prev);
                next.delete(basicItem.canonical_key);
                return next;
            });
        }
    }, [fetchInventory]);

    // -----------------------------------------------------------------------
    // Bulk-add all BASIC_PANTRY items that match the user's diet
    // (for simplicity we add all — the backend can filter by diet via API)
    // -----------------------------------------------------------------------
    const handleBulkAdd = useCallback(async () => {
        setBulkLoading(true);
        try {
            // Filter to items not already active
            const activeNames = new Set(inventoryItems.map(i => i.name?.toLowerCase()));
            const activeKeys = new Set(inventoryItems.map(i => i.canonical_key).filter(Boolean));

            const toAdd = ALL_BASIC_ITEMS.filter(
                item => !activeKeys.has(item.canonical_key) && !activeNames.has(item.name?.toLowerCase())
            ).map(item => ({
                name: item.name,
                canonical_key: item.canonical_key,
                category: item.category,
                unit: 'ud',
                quantity: 1,
            }));

            if (toAdd.length === 0) return;

            // Optimistic: add all at once with temp ids
            const tempItems = toAdd.map((item, idx) => ({
                ...item,
                id: `temp_bulk_${Date.now()}_${idx}`,
            }));
            setInventoryItems(prev => [...prev, ...tempItems]);

            try {
                const result = await api.bulkUploadInventory(toAdd);
                // Replace temp items with real records if API returned them
                if (Array.isArray(result?.items)) {
                    const realById = {};
                    result.items.forEach((r, idx) => { realById[idx] = r; });
                    setInventoryItems(prev => {
                        const withoutTemps = prev.filter(i => !String(i.id).startsWith('temp_bulk_'));
                        return [...withoutTemps, ...result.items];
                    });
                }
            } catch (bulkErr) {
                // Bulk endpoint not yet implemented — fall back to individual adds
                console.warn('[Inventario] Bulk endpoint failed, falling back:', bulkErr);
                const savedItems = [];
                for (const item of toAdd) {
                    try {
                        const saved = await api.addInventoryItem(item);
                        savedItems.push(saved);
                    } catch { /* skip individual failures */ }
                }
                setInventoryItems(prev => {
                    const withoutTemps = prev.filter(i => !String(i.id).startsWith('temp_bulk_'));
                    return [...withoutTemps, ...savedItems];
                });
            }
        } catch (error) {
            console.error('[Inventario] Bulk add error:', error);
            await fetchInventory();
        } finally {
            setBulkLoading(false);
        }
    }, [inventoryItems, fetchInventory]);

    // -----------------------------------------------------------------------
    // Add a custom item via autocomplete
    // -----------------------------------------------------------------------
    const handleAddCustomItem = useCallback(async (name) => {
        const cleanName = name.trim();
        if (!cleanName) return;

        const alreadyExists = inventoryItems.some(
            i => i.name?.toLowerCase() === cleanName.toLowerCase()
        );
        if (alreadyExists) {
            setCustomItemName('');
            return;
        }

        setAddingCustom(true);
        const tempId = `temp_custom_${Date.now()}`;
        const optimistic = {
            id: tempId,
            name: cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase(),
            category: 'Otros',
            unit: 'ud',
            quantity: 1,
        };
        setInventoryItems(prev => [...prev, optimistic]);
        setCustomItemName('');

        try {
            const saved = await api.addInventoryItem({
                name: optimistic.name,
                category: 'Otros',
                unit: 'ud',
                quantity: 1,
            });
            setInventoryItems(prev =>
                prev.map(i => i.id === tempId ? { ...optimistic, ...saved } : i)
            );
        } catch (error) {
            console.error('[Inventario] Custom item add error:', error);
            setInventoryItems(prev => prev.filter(i => i.id !== tempId));
        } finally {
            setAddingCustom(false);
        }
    }, [inventoryItems]);

    // -----------------------------------------------------------------------
    // Remove a custom (non-basic) item
    // -----------------------------------------------------------------------
    const handleRemoveCustom = useCallback(async (id) => {
        setInventoryItems(prev => prev.filter(i => i.id !== id));
        try {
            await api.deleteInventoryItem(id);
        } catch (error) {
            console.error('[Inventario] Delete error:', error);
            await fetchInventory();
        }
    }, [fetchInventory]);

    // -----------------------------------------------------------------------
    // Derived: custom items (user-added, not in BASIC_PANTRY)
    // -----------------------------------------------------------------------
    const basicCanonicalKeys = new Set(ALL_BASIC_ITEMS.map(i => i.canonical_key));
    const basicNames = new Set(ALL_BASIC_ITEMS.map(i => i.name?.toLowerCase()));

    const customItems = inventoryItems.filter(item => {
        if (item.canonical_key && basicCanonicalKeys.has(item.canonical_key)) return false;
        if (item.name && basicNames.has(item.name?.toLowerCase())) return false;
        return true;
    });

    const totalCount = inventoryItems.length;

    // -----------------------------------------------------------------------
    // Loading state
    // -----------------------------------------------------------------------
    if (loading) {
        return (
            <div className="h-screen bg-[var(--color-bg-page)] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-2xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* HEADER */}
                <div className="flex items-center px-5 pt-6 pb-2 justify-between z-10 bg-[var(--color-bg-page)]">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-[var(--color-text-primary)] flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors"
                        aria-label="Volver"
                    >
                        <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>
                    <div className="flex-1 text-center pr-10">
                        <h2 className="text-[var(--color-text-primary)] text-lg font-bold leading-tight tracking-[-0.015em]">
                            Mi Despensa
                        </h2>
                        <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
                            Estos ingredientes no aparecen en tu lista de la compra
                        </p>
                    </div>
                </div>

                {/* TABS */}
                <div className="px-5 py-2 z-10 bg-[var(--color-bg-page)]">
                    <div className="flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-bg-muted)] p-1">
                        <button
                            onClick={() => navigate('/app/lista')}
                            className="flex flex-1 h-full items-center justify-center rounded-full px-2 hover:bg-white/50 transition-all duration-200"
                        >
                            <span className="text-[var(--color-text-muted)] text-sm font-bold leading-normal">
                                Por Comprar
                            </span>
                        </button>
                        <div className="flex flex-1 h-full items-center justify-center rounded-full px-2 bg-[var(--color-bg-card)] shadow-sm">
                            <span className="text-[var(--color-primary)] text-sm font-bold leading-normal">
                                Mi Despensa
                            </span>
                        </div>
                    </div>
                </div>

                {/* SCROLLABLE CONTENT */}
                <div className="flex-1 overflow-y-auto no-scrollbar pb-48 lg:pb-10">

                    {/* QUICK SETUP BANNER */}
                    <div className="px-5 pt-4 pb-2">
                        <div
                            className="rounded-xl overflow-hidden border border-[var(--color-primary)]/20 bg-[var(--color-tint-teal)]"
                        >
                            <div className="flex items-center gap-4 px-4 py-4">
                                <div className="flex items-center justify-center size-11 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] shrink-0">
                                    <span className="material-symbols-outlined text-2xl">magic_button</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[var(--color-text-primary)] text-sm font-bold leading-tight">
                                        Configura tu despensa en un toque
                                    </p>
                                    <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
                                        Añade todos los básicos de una vez
                                    </p>
                                </div>
                                <button
                                    onClick={handleBulkAdd}
                                    disabled={bulkLoading}
                                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-60"
                                    style={{ background: 'var(--gradient-hero)' }}
                                >
                                    {bulkLoading ? (
                                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                    ) : (
                                        <span className="material-symbols-outlined text-sm">done_all</span>
                                    )}
                                    {bulkLoading ? 'Añadiendo...' : 'Añadir básicos'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* CATEGORY SECTIONS */}
                    <div className="px-5 pt-2 pb-3 flex flex-col gap-3">
                        <p className="text-[var(--color-text-muted)] text-[11px] font-bold uppercase tracking-wider mt-1">
                            Ingredientes básicos
                        </p>

                        {BASIC_PANTRY.map(category => (
                            <CategorySection
                                key={category.id}
                                category={category}
                                inventoryItems={inventoryItems}
                                onToggle={handleToggle}
                                pendingKeys={pendingKeys}
                            />
                        ))}
                    </div>

                    {/* CUSTOM ITEMS SECTION */}
                    <div className="px-5 pt-1 pb-4">
                        <p className="text-[var(--color-text-muted)] text-[11px] font-bold uppercase tracking-wider mb-3">
                            Ingredientes personalizados
                        </p>

                        {/* Autocomplete input */}
                        <div className="relative flex gap-2">
                            <div className="flex-1 relative">
                                <IngredientAutocomplete
                                    value={customItemName}
                                    onChange={e => setCustomItemName(e.target.value)}
                                    onSelect={name => handleAddCustomItem(name)}
                                    placeholder="Añadir ingrediente..."
                                    className="w-full h-11 px-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-primary)] text-sm placeholder-[var(--color-text-muted)] text-[var(--color-text-primary)] outline-none transition-all"
                                />
                            </div>
                            <button
                                onClick={() => {
                                    if (customItemName.trim()) handleAddCustomItem(customItemName);
                                }}
                                disabled={!customItemName.trim() || addingCustom}
                                className="size-11 rounded-xl text-white flex items-center justify-center shrink-0 disabled:opacity-40 transition-all active:scale-95"
                                style={{ background: 'var(--gradient-hero)' }}
                                aria-label="Añadir ingrediente"
                            >
                                {addingCustom ? (
                                    <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined text-lg">add</span>
                                )}
                            </button>
                        </div>

                        {/* Custom chips */}
                        {customItems.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                                {customItems.map(item => (
                                    <div
                                        key={item.id}
                                        className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full bg-[var(--color-primary)] text-white text-xs font-semibold"
                                    >
                                        <span className="material-symbols-outlined text-sm">check</span>
                                        <span>{item.name}</span>
                                        <button
                                            onClick={() => handleRemoveCustom(item.id)}
                                            className="ml-0.5 flex items-center justify-center size-4 rounded-full hover:bg-white/20 transition-colors"
                                            aria-label={`Quitar ${item.name}`}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {customItems.length === 0 && (
                            <p className="text-[var(--color-text-muted)] text-xs mt-3 italic">
                                Ninguno todavia. Escribe arriba para añadir un ingrediente que no este en la lista.
                            </p>
                        )}
                    </div>

                    <div className="h-4"></div>
                </div>

                {/* SUMMARY BAR + BOTTOM NAV */}
                <div className="absolute bottom-0 left-0 w-full z-20">
                    {/* Fade gradient */}
                    <div className="h-6 w-full bg-gradient-to-t from-[var(--color-bg-page)] to-transparent pointer-events-none"></div>

                    {/* Count bar */}
                    <div className="bg-[var(--color-bg-page)] px-5 pt-0 pb-1">
                        <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">inventory_2</span>
                            <span className="text-[var(--color-text-primary)] text-sm font-bold">
                                {totalCount === 0
                                    ? 'Tu despensa esta vacia'
                                    : `${totalCount} ingrediente${totalCount !== 1 ? 's' : ''} en tu despensa`}
                            </span>
                        </div>
                    </div>

                    <BottomNav active="lista" />
                </div>

            </div>
        </div>
    );
};

export default Inventario;
