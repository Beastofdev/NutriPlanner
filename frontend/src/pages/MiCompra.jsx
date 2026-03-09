import { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { track } from '../services/analytics';
import { cleanName } from '../utils/cleanName';
import { getCategoryFromCanonical, getCategoryMeta, CATEGORY_META } from '../utils/categoryMappings';
import BottomNav from '../components/NavBar';
import Coachmark from '../components/Coachmark';
import { SupermarketTabs } from '../components/comparador/SupermarketTabs';
import { ComparadorSummary } from '../components/comparador/ComparadorSummary';
import { CategorySection } from '../components/comparador/CategorySection';
import { EmptyComparador } from '../components/comparador/EmptyComparador';
import { BRAND, lsKey } from '../config/brand';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SUPERMARKETS = [];

// ---------------------------------------------------------------------------
// Skeleton loader for the Precios tab loading state
// ---------------------------------------------------------------------------

const LoadingSkeletonPrecios = ({ itemCount }) => (
    <div className="flex flex-col gap-4 px-5 lg:px-10 py-4">
        <div className="h-10 w-full skeleton-shimmer rounded-2xl"></div>
        <div className="h-20 w-full skeleton-shimmer rounded-xl"></div>
        {Array.from({ length: Math.min(itemCount || 5, 6) }).map((_, idx) => (
            <div key={idx} className="bg-[var(--color-bg-card)] rounded-2xl p-3 border border-[var(--color-border)] flex gap-3 shadow-sm">
                <div className="size-10 shrink-0 skeleton-shimmer rounded-xl"></div>
                <div className="flex-1 space-y-2 py-1">
                    <div className="flex justify-between">
                        <div className="h-3 w-3/4 skeleton-shimmer rounded"></div>
                        <div className="h-4 w-10 skeleton-shimmer rounded"></div>
                    </div>
                    <div className="h-2 w-1/2 skeleton-shimmer rounded"></div>
                </div>
            </div>
        ))}
        <div className="flex items-center justify-center gap-2 mt-2">
            <div className="w-4 h-4 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
            <p className="text-[var(--color-primary)] text-sm animate-pulse">Consultando precios de supermercado...</p>
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MiCompra() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Active page tab: 'lista' | 'precios'
    const [activePageTab, setActivePageTab] = useState('lista');

    // ------------------------------------------------------------------
    // Offline detection
    // ------------------------------------------------------------------
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    useEffect(() => {
        const goOffline = () => setIsOffline(true);
        const goOnline  = () => setIsOffline(false);
        window.addEventListener('offline', goOffline);
        window.addEventListener('online',  goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online',  goOnline);
        };
    }, []);

    // ==================================================================
    // LISTA TAB STATE
    // ==================================================================

    const [consolidatedList, setConsolidatedList]   = useState([]);
    const [listaLoading, setListaLoading]           = useState(true);
    const [loadingMessage, setLoadingMessage]       = useState('Cargando tu lista...');
    const [checkedItems, setCheckedItems]           = useState(() => {
        try {
            const stored = localStorage.getItem(lsKey('checked_items'));
            return stored ? new Set(JSON.parse(stored)) : new Set();
        } catch { return new Set(); }
    });
    const [searchList, setSearchList]               = useState('');
    const [collapsedCategories, setCollapsedCategories] = useState(new Set());
    const [pantryCollapsed, setPantryCollapsed]     = useState(true);

    // Sort items in supermarket-aisle order
    const sortListBySupermarketLayout = useCallback((list) => {
        return [...list].sort((a, b) => {
            const orderA = (CATEGORY_META[a.category] || CATEGORY_META['Otros']).order;
            const orderB = (CATEGORY_META[b.category] || CATEGORY_META['Otros']).order;
            if (orderA !== orderB) return orderA - orderB;
            return (a.name || '').localeCompare(b.name || '');
        });
    }, []);

    const deduplicateByProductId = (items) => {
        const productMap = new Map();
        items.forEach(item => {
            const key = item.canonical_name || item.product_id || item.name;
            if (productMap.has(key)) {
                const existing = productMap.get(key);
                existing.total_qty += item.total_qty;
                if (item.source_meals && existing.source_meals) {
                    existing.source_meals = [...new Set([...existing.source_meals, ...item.source_meals])];
                }
            } else {
                productMap.set(key, { ...item });
            }
        });
        return Array.from(productMap.values());
    };

    // Load shopping list from localStorage / API
    useEffect(() => {
        const fetchAggregatedList = async () => {
            try {
                const storedVersion    = localStorage.getItem(lsKey('version'));
                const storedShoppingV2 = localStorage.getItem(lsKey('shopping_v2'));

                if ((storedVersion === 'v2' || storedVersion === 'v3') && storedShoppingV2) {
                    setLoadingMessage('Cargando lista...');
                    try {
                        const v2List = JSON.parse(storedShoppingV2);
                        if (Array.isArray(v2List) && v2List.length > 0) {
                            const deduped = deduplicateByProductId(v2List);
                            const withCategory = deduped.map(item => ({
                                ...item,
                                category: getCategoryFromCanonical(item.canonical_name, item.name),
                            }));
                            setConsolidatedList(sortListBySupermarketLayout(withCategory));
                            setListaLoading(false);
                            return;
                        }
                    } catch (e) { console.error('[V2] Error parsing shopping_v2:', e); }
                }

                const storedPlan = localStorage.getItem('nutriplanner_plan');
                let shouldUseFallback = true;

                if (storedPlan) {
                    try {
                        const plan = JSON.parse(storedPlan);
                        if (plan?.menu && Array.isArray(plan.menu) && plan.menu.length > 0) {
                            setLoadingMessage('Consolidando ingredientes...');
                            const data = await api.aggregateIngredientsOnly(plan.menu);
                            if (data) {
                                const rawList = data.consolidated_ingredients || [];
                                const deduped = deduplicateByProductId(rawList);
                                setConsolidatedList(sortListBySupermarketLayout(deduped));
                            }
                            setListaLoading(false);
                            shouldUseFallback = false;
                        }
                    } catch (parseError) {
                        // localStorage parse failed, will use fallback
                    }
                }

                if (shouldUseFallback) {
                    setLoadingMessage('Recuperando tu lista desde la nube...');
                    const dbList = await api.getShoppingList();
                    if (!dbList || !dbList.categories || Object.keys(dbList.categories).length === 0) {
                        setListaLoading(false);
                        return;
                    }
                    const flatList = [];
                    Object.entries(dbList.categories || {}).forEach(([category, items]) => {
                        items.forEach(item => {
                            flatList.push({
                                name: item.name,
                                total_qty: item.quantity,
                                unit: item.unit,
                                category,
                                product_id: item.id,
                                is_checked: item.is_checked,
                                source_meals: [],
                            });
                        });
                    });
                    setConsolidatedList(sortListBySupermarketLayout(flatList));
                    setListaLoading(false);
                }
            } catch (error) {
                console.error('Error cargando lista:', error);
            } finally {
                setListaLoading(false);
            }
        };
        fetchAggregatedList();
    }, [sortListBySupermarketLayout]);

    const toggleCategory = (category) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            if (newSet.has(category)) newSet.delete(category); else newSet.add(category);
            return newSet;
        });
    };

    // Separate to-buy items from pantry-excluded items
    const { toBuyItems, pantryMatchItems } = useMemo(() => {
        const storedPlan = localStorage.getItem('nutriplanner_plan');
        let excluded = [];
        if (storedPlan) {
            try {
                const plan = JSON.parse(storedPlan);
                excluded = plan.pantry_excluded || [];
            } catch {}
        }
        return { toBuyItems: consolidatedList, pantryMatchItems: excluded };
    }, [consolidatedList]);

    const checkedCount    = toBuyItems.filter(item => checkedItems.has(item.name)).length;
    const totalCount      = toBuyItems.length;
    const progressPercent = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    const estimatedCost = useMemo(() => {
        try {
            const stored = localStorage.getItem('nutriplanner_comparison_v2');
            if (!stored) return null;
            const comparison = JSON.parse(stored);
            return comparison?.stats?.mixed_total || comparison?.stats?.cheapest_total || null;
        } catch { return null; }
    }, []);

    const toggleItem = async (itemName, itemId) => {
        const wasChecked = checkedItems.has(itemName);
        setCheckedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemName)) newSet.delete(itemName); else newSet.add(itemName);
            localStorage.setItem('nutriplanner_checked_items', JSON.stringify([...newSet]));
            return newSet;
        });
        if (itemId) {
            try { await api.toggleItem(itemId); }
            catch (error) {
                console.error('[SYNC ERROR]', error);
                // Rollback optimistic update on error
                setCheckedItems(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(itemName)) newSet.delete(itemName); else newSet.add(itemName);
                    localStorage.setItem('nutriplanner_checked_items', JSON.stringify([...newSet]));
                    return newSet;
                });
            }
        }
        if (!wasChecked) track('item_checked', { item: itemName });
        // Auto-add to pantry when item is ticked as bought
        if (!wasChecked && user) {
            const item = consolidatedList.find(i => i.name === itemName);
            if (item) {
                api.addInventoryItem({
                    name: cleanName(item.name),
                    quantity: item.total_qty || 1,
                    unit: item.unit || 'ud',
                    category: item.category || 'Despensa',
                }).then(() => {
                    const count = parseInt(localStorage.getItem('nutriplanner_pantry_toast_count') || '0');
                    if (count < 3) {
                        showToast(`${cleanName(item.name)} anadido a tu despensa`, 'success');
                        localStorage.setItem('nutriplanner_pantry_toast_count', String(count + 1));
                    }
                }).catch(err => console.warn('[Pantry auto-add]', err));
            }
        }
    };

    const handleListaShareWhatsApp = () => {
        const unchecked = toBuyItems.filter(item => !checkedItems.has(item.name));
        const items = unchecked.length > 0 ? unchecked : toBuyItems;
        const grouped = {};
        items.forEach(item => {
            const cat = item.category || 'Otros';
            if (!grouped[cat]) grouped[cat] = [];
            const qty = item.total_qty ? `${item.total_qty} ${item.unit || ''}`.trim() : '';
            grouped[cat].push(`  - ${item.name}${qty ? ` (${qty})` : ''}`);
        });
        const sections = Object.entries(grouped).map(([cat, lines]) => `*${cat}*\n${lines.join('\n')}`);
        const text = `*Lista de la Compra - NutriPlanner*\n${items.length} productos\n\n${sections.join('\n\n')}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        track('shopping_list_shared', { method: 'whatsapp', items: items.length });
    };

    const handleListaShareGeneric = async () => {
        const unchecked = toBuyItems.filter(item => !checkedItems.has(item.name));
        const items = unchecked.length > 0 ? unchecked : toBuyItems;
        const lines = items.map(item => {
            const qty = item.total_qty ? `${item.total_qty} ${item.unit || ''}`.trim() : '';
            return `- ${item.name}${qty ? ` (${qty})` : ''}`;
        });
        const text = `Lista de la Compra - NutriPlanner\n${lines.join('\n')}`;
        if (navigator.share) {
            try { await navigator.share({ title: 'Lista de la Compra', text }); }
            catch (e) {
                if (e.name !== 'AbortError') {
                    await navigator.clipboard.writeText(text);
                    showToast('Lista copiada al portapapeles', 'success');
                }
            }
        } else {
            await navigator.clipboard.writeText(text);
            showToast('Lista copiada al portapapeles', 'success');
        }
        track('shopping_list_shared', { method: 'generic', items: items.length });
    };

    // ==================================================================
    // PRECIOS TAB STATE
    // ==================================================================

    const [comparisonData, setComparisonData]     = useState(null);
    const [preciosLoading, setPreciosLoading]     = useState(false);
    const [compareError, setCompareError]         = useState(null);
    const [activeSuperTab, setActiveSuperTab]     = useState(() => localStorage.getItem(lsKey('preferred_supermarket')) || 'Mixed');
    const [copiedToast, setCopiedToast]           = useState(false);
    const [isV2, setIsV2]                         = useState(false);
    const [excludedItems, setExcludedItems]       = useState(new Set());
    const [supermarkets, setSupermarkets]         = useState(DEFAULT_SUPERMARKETS);
    // Guard to prevent double-firing the auto-compare
    const [preciosTriggered, setPreciosTriggered] = useState(false);

    // Load supermarket metadata from backend
    useEffect(() => {
        api.getSupermarkets()
            .then(data => {
                if (data.supermarkets?.length > 0) setSupermarkets(data.supermarkets);
            })
            .catch(() => {}); // fall back to defaults
    }, []);

    // Pantry lookup built from the shopping list v2 backend flags
    const pantryLookup = useMemo(() => {
        try {
            const stored = localStorage.getItem('nutriplanner_shopping_v2');
            const shoppingList = stored ? JSON.parse(stored) : [];
            const lookup = {};
            for (const item of shoppingList) {
                if (item.in_pantry) {
                    const key = (item.name || '').toLowerCase();
                    lookup[key] = {
                        name: item.name,
                        covers: item.pantry_covers ?? 1.0,
                        needed_qty: item.needed_qty,
                        needed_unit: item.needed_unit,
                    };
                }
            }
            return lookup;
        } catch { return {}; }
    }, []);

    const checkPantryMatch = useMemo(() => {
        return (itemName) => {
            if (!itemName) return null;
            const key = itemName.replace(/_/g, ' ').toLowerCase();
            return pantryLookup[key] || null;
        };
    }, [pantryLookup]);

    // Auto-exclude pantry items that are fully covered (covers >= 1)
    useEffect(() => {
        if (!comparisonData?.items) return;
        const autoExcluded = new Set();
        comparisonData.items.forEach(item => {
            const match = checkPantryMatch(item.original_name || item.original_query);
            if (match && (match.covers ?? 1) >= 1) {
                autoExcluded.add(item.product_id || item.original_query);
            }
        });
        if (autoExcluded.size > 0) setExcludedItems(autoExcluded);
    }, [comparisonData, checkPantryMatch]);

    // Load cached comparison data on mount
    useEffect(() => {
        const storedVersion      = localStorage.getItem('nutriplanner_version');
        const storedComparisonV2 = localStorage.getItem('nutriplanner_comparison_v2');

        if ((storedVersion === 'v2' || storedVersion === 'v3') && storedComparisonV2) {
            try {
                const parsed = JSON.parse(storedComparisonV2);
                setComparisonData(parsed);
                setIsV2(true);
                track('comparador_viewed', { products: parsed.items?.length || 0, source: 'mi_compra_cache' });
            } catch (e) {
                console.error('[MiCompra] Error parsing comparison_v2:', e);
            }
        }
    }, []);

    // When user switches to the Precios tab and no data is loaded, auto-trigger a comparison
    useEffect(() => {
        if (activePageTab !== 'precios') return;
        if (comparisonData?.items?.length) return;
        if (preciosTriggered) return;
        if (listaLoading) return;
        if (consolidatedList.length === 0) return;

        setPreciosTriggered(true);
        handleCompare();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePageTab, comparisonData, consolidatedList, listaLoading, preciosTriggered]);

    const handleCompare = async () => {
        setPreciosLoading(true);
        setCompareError(null);
        try {
            // Build ingredient list from unchecked shopping list items
            const unchecked = consolidatedList.filter(item => !checkedItems.has(item.name));
            const ingredients = (unchecked.length > 0 ? unchecked : consolidatedList).map(item => ({
                name: item.name,
                canonical_name: item.canonical_name || item.name,
                total_qty: item.total_qty || 1.0,
                unit: item.unit || 'ud',
            }));
            const result = await api.comparePrices(ingredients);
            setComparisonData(result);
            setIsV2(true);
            track('comparador_viewed', { products: result.items?.length || 0, source: 'mi_compra_fresh' });
        } catch (err) {
            console.error('Error comparando:', err);
            setCompareError('No se pudieron comparar los precios. Comprueba tu conexion e intentalo de nuevo.');
        } finally {
            setPreciosLoading(false);
        }
    };

    // Price summary respecting exclusions — dynamic per supermarket
    const summary = useMemo(() => {
        const superCodes = supermarkets.map(s => s.code);

        if (!comparisonData?.items) {
            const stats = comparisonData?.stats || {};
            const per_supermarket = stats.per_supermarket || {};
            return { mix: stats.cheapest_total || 0, per_supermarket, savings: stats.savings || 0 };
        }

        let mixTotal = 0;
        const perSuper = {};
        superCodes.forEach(code => { perSuper[code] = 0; });

        comparisonData.items.forEach(item => {
            if (excludedItems.has(item.product_id || item.original_query)) return;
            if (!item.candidates?.length) return;

            const sorted   = [...item.candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999));
            const cheapest = sorted[0];
            if (cheapest) mixTotal += cheapest.ticket_cost || 0;

            superCodes.forEach(code => {
                const superCands = item.candidates.filter(c => (c.supermarket || '').trim().toUpperCase() === code);
                perSuper[code] += superCands.length > 0
                    ? Math.min(...superCands.map(c => c.ticket_cost || 999))
                    : (cheapest?.ticket_cost || 0);
            });
        });

        const superTotals = Object.values(perSuper).filter(v => v > 0);
        const maxSingle   = superTotals.length > 0 ? Math.max(...superTotals) : 0;
        return { mix: mixTotal, per_supermarket: perSuper, savings: maxSingle - mixTotal };
    }, [comparisonData, excludedItems, supermarkets]);

    const minSingleSuper = useMemo(() => {
        const totals = Object.values(summary.per_supermarket || {}).filter(v => v > 0);
        return totals.length > 0 ? Math.min(...totals) : summary.mix;
    }, [summary]);
    const savingsPercent = minSingleSuper > 0 ? ((summary.savings / minSingleSuper) * 100).toFixed(1) : 0;

    const supermarketCounts = useMemo(() => {
        if (!comparisonData?.items) return { per_supermarket: {}, notFound: 0 };
        const counts = {};
        supermarkets.forEach(s => { counts[s.code] = 0; });
        let notFound = 0;
        comparisonData.items.forEach(item => {
            if (excludedItems.has(item.product_id || item.original_query)) return;
            if (item.status === 'not_found') { notFound++; return; }
            if (!item.candidates?.[0]) return;
            const cheapest = item.candidates.reduce((a, b) => (a.ticket_cost || 999) < (b.ticket_cost || 999) ? a : b);
            const superCode = (cheapest.supermarket || '').trim().toUpperCase();
            if (counts[superCode] !== undefined) counts[superCode]++;
            else counts[superCode] = 1;
        });
        return { per_supermarket: counts, notFound };
    }, [comparisonData, excludedItems, supermarkets]);

    const excludedSavings = useMemo(() => {
        if (!comparisonData?.items || excludedItems.size === 0) return 0;
        let total = 0;
        comparisonData.items.forEach(item => {
            if (!excludedItems.has(item.product_id || item.original_query)) return;
            const cheapest = item.candidates?.length > 0
                ? [...item.candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999))[0]
                : null;
            if (cheapest) total += cheapest.ticket_cost || 0;
        });
        return total;
    }, [comparisonData, excludedItems]);

    const getDisplayPrice = () => {
        if (activeSuperTab === 'Mixed') return summary.mix;
        return summary.per_supermarket?.[activeSuperTab] || summary.mix;
    };

    const generateShareableList = () => {
        if (!comparisonData?.items) return '';
        const itemsBySuper = {};
        supermarkets.forEach(s => { itemsBySuper[s.code] = []; });

        comparisonData.items.forEach(item => {
            if (excludedItems.has(item.product_id || item.original_query)) return;
            if (item.status === 'not_found') return;
            const cheapest = item.candidates?.reduce((a, b) => (a.ticket_cost || 999) < (b.ticket_cost || 999) ? a : b);
            if (!cheapest) return;
            const line = `\u2022 ${cheapest.product_name || item.original_name || item.original_query} - ${cheapest.ticket_cost?.toFixed(2)}\u20AC`;
            const superCode = (cheapest.supermarket || '').trim().toUpperCase();
            if (itemsBySuper[superCode]) itemsBySuper[superCode].push(line);
            else {
                if (!itemsBySuper['OTHER']) itemsBySuper['OTHER'] = [];
                itemsBySuper['OTHER'].push(line);
            }
        });

        let text = `\uD83D\uDED2 MI LISTA DE LA COMPRA\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\n`;
        supermarkets.forEach(s => {
            const items = itemsBySuper[s.code] || [];
            if (items.length > 0) {
                text += `\uD83C\uDFEA ${s.display_name.toUpperCase()} (${items.length})\n${items.join('\n')}\n\n`;
            }
        });
        text += `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n\uD83D\uDCB0 TOTAL: ${summary.mix.toFixed(2)}\u20AC\n\u2728 AHORRO: ${summary.savings.toFixed(2)}\u20AC (${savingsPercent}%)\n\n\uD83D\uDCF1 NutriPlanner`;
        return text;
    };

    const handleCopyList = async () => {
        const text = generateShareableList();
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        }
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2000);
        track('list_copied', { tab: 'precios' });
    };

    const handlePreciosShareWhatsApp = () => {
        window.open(`https://wa.me/?text=${encodeURIComponent(generateShareableList())}`, '_blank');
        track('shopping_list_shared', { method: 'whatsapp', tab: 'precios' });
    };

    const handleToggleExclude = (key) => {
        setExcludedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) newSet.delete(key); else newSet.add(key);
            return newSet;
        });
    };

    // ==================================================================
    // Shared bottom CTA: "Comprar en tienda" — dynamic per supermarket
    // ==================================================================
    const activeSupermarket = supermarkets.find(s => s.code === activeSuperTab);
    const storeSearchUrl = activeSupermarket?.affiliate_url_template?.replace('{product_name}', '') || '#';

    const handleCopyShoppingList = async () => {
        const unchecked = toBuyItems.filter(item => !checkedItems.has(item.name));
        if (unchecked.length === 0) return;
        const text = unchecked.map(item => `- ${cleanName(item.name)} (${item.quantity || ''} ${item.unit || ''})`.trim()).join('\n');
        const header = `Lista de la compra NutriPlanner (${unchecked.length} productos)\n\n`;
        try {
            await navigator.clipboard.writeText(header + text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = header + text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2000);
        track('list_copied', { tab: 'lista' });
    };

    const handleBuyStore = () => {
        track('buy_store_clicked', {
            total: summary.mix,
            items: comparisonData?.items?.length,
            source: activePageTab,
            supermarket: activeSuperTab,
        });
        if (user && comparisonData) {
            const offerSavings = comparisonData?.stats?.offer_savings || 0;
            api.saveShoppingHistory(summary.mix, offerSavings, activeSuperTab || 'UNKNOWN')
                .catch(err => console.warn('[ShoppingHistory]', err));
        }
    };

    // Header action is context-aware: share text (Lista) vs copy prices (Precios)
    const handleHeaderAction = async () => {
        if (activePageTab === 'lista') {
            await handleListaShareGeneric();
        } else {
            await handleCopyList();
        }
    };

    // ==================================================================
    // Full-page loading skeleton (shown only while lista is loading)
    // ==================================================================
    if (listaLoading) {
        return (
            <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
                <div className="relative w-full max-w-lg lg:max-w-none mx-auto h-full overflow-hidden flex flex-col">
                    <div className="flex items-center px-5 pt-6 pb-2 justify-between">
                        <div className="w-10 h-10 skeleton-shimmer rounded-full"></div>
                        <div className="h-5 w-32 skeleton-shimmer rounded"></div>
                        <div className="w-10 h-10 skeleton-shimmer rounded-full"></div>
                    </div>
                    <div className="px-5 py-2">
                        <div className="h-12 w-full skeleton-shimmer rounded-full"></div>
                    </div>
                    <div className="px-5 py-3">
                        <div className="h-28 w-full skeleton-shimmer rounded-xl"></div>
                    </div>
                    <div className="flex flex-col px-5 gap-2 mt-2">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <div key={i} className="flex items-center gap-3 p-3 mx-4 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)]">
                                <div className="h-6 w-6 skeleton-shimmer rounded-full"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-3/4 skeleton-shimmer rounded"></div>
                                    <div className="h-3 w-1/4 skeleton-shimmer rounded"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-4">
                        <div className="w-4 h-4 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin"></div>
                        <p className="text-[var(--color-primary)] text-sm animate-pulse">{loadingMessage}</p>
                    </div>
                </div>
            </div>
        );
    }

    // ==================================================================
    // Main render
    // ==================================================================
    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Copied-to-clipboard toast (Precios tab) */}
                {copiedToast && (
                    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-[var(--color-primary)] text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg animate-in fade-in zoom-in duration-200">
                        <span className="material-symbols-outlined text-sm mr-1">check</span> Lista copiada
                    </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* Header                                                    */}
                {/* -------------------------------------------------------- */}
                <div className="flex items-center px-5 lg:px-10 pt-6 pb-2 justify-between z-10 bg-[var(--color-bg-page)]">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-[var(--color-text-primary)] flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors"
                        aria-label="Volver"
                    >
                        <span className="material-symbols-outlined text-2xl">arrow_back</span>
                    </button>

                    <h2 className="text-[var(--color-text-primary)] text-lg leading-tight tracking-[-0.015em] flex-1 text-center" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                        Mi Compra
                    </h2>

                    <button
                        onClick={handleHeaderAction}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors text-[var(--color-text-primary)]"
                        aria-label={activePageTab === 'lista' ? 'Compartir lista' : 'Copiar precios'}
                    >
                        <span className="material-symbols-outlined text-xl">
                            {activePageTab === 'lista' ? 'share' : 'content_copy'}
                        </span>
                    </button>
                </div>

                {/* Offline indicator */}
                {isOffline && (
                    <div className="mx-5 mb-1 px-3 py-2 bg-[var(--color-tint-amber)] border border-[var(--color-warning)]/20 rounded-xl flex items-center gap-2">
                        <span className="material-symbols-outlined text-[var(--color-warning)] text-lg">cloud_off</span>
                        <span className="text-[var(--color-text-secondary)] text-xs font-medium">Sin conexion — tu lista sigue disponible</span>
                    </div>
                )}

                {/* -------------------------------------------------------- */}
                {/* Pill tab switcher                                         */}
                {/* -------------------------------------------------------- */}
                <div className="px-5 lg:px-10 py-2 z-10 bg-[var(--color-bg-page)]">
                    <div className="flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-bg-muted)] p-1">

                        {/* Lista tab */}
                        <button
                            onClick={() => setActivePageTab('lista')}
                            className={`flex flex-1 h-full items-center justify-center gap-2 rounded-full px-2 transition-all duration-200 ${
                                activePageTab === 'lista'
                                    ? 'bg-[var(--color-bg-card)] shadow-sm'
                                    : 'hover:bg-white/50'
                            }`}
                        >
                            <span
                                className={`material-symbols-outlined text-lg transition-[font-variation-settings] duration-200 ${activePageTab === 'lista' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
                                style={activePageTab === 'lista' ? { fontVariationSettings: "'FILL' 1" } : { fontVariationSettings: "'FILL' 0" }}
                            >
                                shopping_cart
                            </span>
                            <span className={`text-sm font-bold leading-normal ${activePageTab === 'lista' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                                Lista
                            </span>
                            {totalCount > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    activePageTab === 'lista'
                                        ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                                        : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                                }`}>
                                    {checkedCount}/{totalCount}
                                </span>
                            )}
                        </button>

                        {/* Precios tab */}
                        <button
                            onClick={() => setActivePageTab('precios')}
                            className={`flex flex-1 h-full items-center justify-center gap-2 rounded-full px-2 transition-all duration-200 ${
                                activePageTab === 'precios'
                                    ? 'bg-[var(--color-bg-card)] shadow-sm'
                                    : 'hover:bg-white/50'
                            }`}
                        >
                            <span
                                className={`material-symbols-outlined text-lg transition-[font-variation-settings] duration-200 ${activePageTab === 'precios' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}
                                style={activePageTab === 'precios' ? { fontVariationSettings: "'FILL' 1" } : { fontVariationSettings: "'FILL' 0" }}
                            >
                                storefront
                            </span>
                            <span className={`text-sm font-bold leading-normal ${activePageTab === 'precios' ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                                Precios
                            </span>
                            {summary.mix > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    activePageTab === 'precios'
                                        ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                                        : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'
                                }`}>
                                    {summary.mix.toFixed(0)}€
                                </span>
                            )}
                        </button>

                    </div>
                </div>

                {/* -------------------------------------------------------- */}
                {/* Scrollable content area                                   */}
                {/* -------------------------------------------------------- */}
                <div className="flex-1 overflow-y-auto pb-52 lg:pb-8 no-scrollbar transition-opacity duration-200">

                    {/* ==================================================== */}
                    {/* LISTA TAB CONTENT                                      */}
                    {/* ==================================================== */}
                    {activePageTab === 'lista' && (
                        <>
                            {/* Summary hero card */}
                            <div className="px-5 lg:px-10 py-3">
                                <div className="relative overflow-hidden rounded-xl shadow-md" style={{ background: 'var(--gradient-hero)' }}>
                                    <div className="relative z-10 flex flex-col p-5 gap-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="material-symbols-outlined text-white/80 text-sm">auto_awesome</span>
                                                    <p className="text-white/80 text-xs font-bold uppercase tracking-wider">Lista Consolidada</p>
                                                </div>
                                                <h3 className="text-white text-xl leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu Compra Semanal</h3>
                                            </div>
                                            {estimatedCost && (
                                                <div className="text-right">
                                                    <p className="text-white/60 text-xs">Coste estimado</p>
                                                    <p className="text-white text-xl font-black font-mono">~{estimatedCost.toFixed(0)}€</p>
                                                    {(() => {
                                                        try {
                                                            const fi = JSON.parse(localStorage.getItem('nutriplanner_family_info') || 'null');
                                                            if (fi && fi.members_count > 1) return (
                                                                <p className="text-white/70 text-[10px] font-bold mt-0.5">
                                                                    ~{(estimatedCost / fi.members_count).toFixed(0)}€/persona
                                                                </p>
                                                            );
                                                        } catch {}
                                                        return null;
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <p className="text-white/80 text-sm font-medium">{checkedCount}/{totalCount} productos</p>
                                                <p className="text-white text-sm font-bold">{progressPercent}%</p>
                                            </div>
                                            <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-white rounded-full transition-all duration-300"
                                                    style={{ width: `${progressPercent}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Coachmark: auto-pantry tip */}
                            {toBuyItems.length > 0 && (
                                <div className="px-5 lg:px-10 relative">
                                    <Coachmark
                                        tipKey="lista_auto_pantry"
                                        text="Al marcar un item como comprado, se anade automaticamente a tu despensa"
                                        position="bottom"
                                        delay={1500}
                                    />
                                </div>
                            )}

                            {/* Search filter — shown when > 10 items */}
                            {toBuyItems.length > 10 && (
                                <div className="px-5 lg:px-10 mb-2">
                                    <div className="relative">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-lg">search</span>
                                        <input
                                            type="text"
                                            placeholder="Buscar en tu lista..."
                                            value={searchList}
                                            onChange={(e) => setSearchList(e.target.value)}
                                            className="w-full glass-panel rounded-xl pl-10 pr-8 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all"
                                        />
                                        {searchList && (
                                            <button
                                                onClick={() => setSearchList('')}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                                            >
                                                <span className="material-symbols-outlined text-lg">close</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Shopping items */}
                            <div className="flex flex-col lg:grid lg:grid-cols-2 xl:grid-cols-3 px-5 lg:px-10 gap-1.5 lg:gap-1 mt-2 animate-stagger">
                                {toBuyItems.length === 0 && pantryMatchItems.length === 0 && (
                                    <div className="text-center text-[var(--color-text-muted)] py-10 opacity-50 col-span-full">
                                        Lista vacia. Genera un menu primero.
                                    </div>
                                )}

                                {toBuyItems
                                    .filter(item => !searchList || item.name.toLowerCase().includes(searchList.toLowerCase()))
                                    .map((item, idx, filteredArr) => {
                                        const prevItem   = filteredArr[idx - 1];
                                        const showHeader = !prevItem || prevItem.category !== item.category;
                                        if (collapsedCategories.has(item.category) && !showHeader) return null;

                                        const isChecked = checkedItems.has(item.name);
                                        const catStyle  = getCategoryMeta(item.category);

                                        return (
                                            <Fragment key={idx}>
                                                {showHeader && (
                                                    <button
                                                        onClick={() => toggleCategory(item.category)}
                                                        aria-expanded={!collapsedCategories.has(item.category)}
                                                        aria-label={`Categoria ${item.category}`}
                                                        className="lg:col-span-full flex items-center gap-2 px-4 py-1.5 mt-2 lg:mt-1 w-full text-left group"
                                                    >
                                                        <span className={`material-symbols-outlined text-sm ${catStyle.color}`}>{catStyle.icon}</span>
                                                        <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-widest">{item.category}</h4>
                                                        <span className="text-[var(--color-text-muted)] text-xs">
                                                            ({toBuyItems.filter(i => i.category === item.category).length})
                                                        </span>
                                                        <div className="flex-1 h-px bg-[var(--color-border)] ml-1"></div>
                                                        <span className={`material-symbols-outlined text-[var(--color-text-muted)] text-lg transition-transform ${collapsedCategories.has(item.category) ? '-rotate-90' : ''}`}>
                                                            expand_more
                                                        </span>
                                                    </button>
                                                )}

                                                {!collapsedCategories.has(item.category) && (
                                                    <label className={`flex items-center gap-3 p-3 lg:p-2.5 mx-4 lg:mx-0 mb-1 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] cursor-pointer transition-all shadow-sm hover:border-[var(--color-primary)]/40 hover:shadow-md ${isChecked ? 'opacity-50' : ''}`}>
                                                        <div className={`relative flex items-center justify-center h-5 w-5 rounded-full border-2 transition-all shrink-0 ${isChecked ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--color-text-muted)]'}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleItem(item.name, item.product_id)}
                                                                className="peer appearance-none absolute inset-0 w-full h-full cursor-pointer"
                                                            />
                                                            {isChecked && (
                                                                <span className="material-symbols-outlined text-white text-xs font-bold pointer-events-none">check</span>
                                                            )}
                                                        </div>
                                                        <div className={`flex flex-col flex-1 ${isChecked ? 'line-through' : ''}`}>
                                                            <div className="flex justify-between items-start">
                                                                <p className="text-[var(--color-text-primary)] text-sm font-medium leading-tight">{cleanName(item.name)}</p>
                                                                <div className="flex items-center gap-1 ml-2 shrink-0">
                                                                    {item.nutriscore && (
                                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                                            item.nutriscore === 'a' ? 'bg-[#038141] text-white'
                                                                            : item.nutriscore === 'b' ? 'bg-[#85BB2F] text-white'
                                                                            : item.nutriscore === 'c' ? 'bg-[#FECB02] text-black'
                                                                            : item.nutriscore === 'd' ? 'bg-[#EE8100] text-white'
                                                                            : 'bg-[#E63E11] text-white'
                                                                        }`}>
                                                                            {item.nutriscore}
                                                                        </span>
                                                                    )}
                                                                    {item.nova === 4 && (
                                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black text-white" title="NOVA 4">UP</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                <span className="text-[var(--color-primary)] text-xs font-bold">{item.total_qty} {item.unit}</span>
                                                                {item.source_meals?.length > 1 && (
                                                                    <span className="text-[var(--color-text-muted)] text-[11px]">({item.source_meals.length} comidas)</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </label>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                            </div>

                            {/* Pantry-excluded items section */}
                            {pantryMatchItems.length > 0 && (
                                <div className="px-5 lg:px-10 mt-3 mb-2">
                                    <button
                                        onClick={() => setPantryCollapsed(prev => !prev)}
                                        className="flex items-center gap-2 w-full px-4 py-2.5 rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/15 transition-all hover:bg-[var(--color-primary)]/10"
                                    >
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">inventory_2</span>
                                        <span className="text-[var(--color-primary)] text-sm font-bold">Excluido de tu despensa</span>
                                        <span className="text-[var(--color-primary)]/60 text-xs font-medium bg-[var(--color-primary)]/10 px-2 py-0.5 rounded-full">
                                            {pantryMatchItems.length}
                                        </span>
                                        <div className="flex-1" />
                                        <span className={`material-symbols-outlined text-[var(--color-primary)]/60 text-lg transition-transform ${pantryCollapsed ? '-rotate-90' : ''}`}>
                                            expand_more
                                        </span>
                                    </button>

                                    {!pantryCollapsed && (
                                        <div className="flex flex-col lg:grid lg:grid-cols-2 xl:grid-cols-3 gap-1.5 lg:gap-1 mt-2">
                                            {pantryMatchItems.map((item, idx) => (
                                                <div key={idx} className="flex items-center gap-3 p-3 lg:p-2.5 mx-4 lg:mx-0 mb-1 rounded-xl bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/10 opacity-60">
                                                    <div className="flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-primary)]/15 shrink-0">
                                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-xs">check</span>
                                                    </div>
                                                    <div className="flex flex-col flex-1">
                                                        <p className="text-[var(--color-text-primary)] text-sm font-medium leading-tight">{cleanName(item.name)}</p>
                                                        <span className="text-[var(--color-text-muted)] text-xs">{item.total_qty} {item.unit}</span>
                                                    </div>
                                                    <span className="text-[var(--color-primary)] text-[10px] font-bold uppercase">Despensa</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Nudge to Precios tab when no comparison data loaded yet */}
                            {toBuyItems.length > 0 && !comparisonData && (
                                <button
                                    onClick={() => setActivePageTab('precios')}
                                    className="mx-5 lg:mx-10 mt-3 mb-2 flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-left hover:border-[var(--color-primary)]/40 transition-all group"
                                >
                                    <div className="flex items-center justify-center size-9 rounded-full bg-[var(--color-primary)]/10 shrink-0">
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">storefront</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[var(--color-text-primary)] text-sm font-semibold">Ver precios en supermercados</p>
                                        <p className="text-[var(--color-text-muted)] text-xs">Consulta el coste real de tu lista</p>
                                    </div>
                                    <span className="material-symbols-outlined text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors">chevron_right</span>
                                </button>
                            )}

                            <div className="h-4"></div>
                        </>
                    )}

                    {/* ==================================================== */}
                    {/* PRECIOS TAB CONTENT                                    */}
                    {/* ==================================================== */}
                    {activePageTab === 'precios' && (
                        <>
                            {preciosLoading ? (
                                <LoadingSkeletonPrecios itemCount={consolidatedList.length} />
                            ) : compareError ? (
                                <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                                    <span className="material-symbols-outlined text-5xl text-red-400">cloud_off</span>
                                    <p className="text-[var(--color-text-primary)] font-bold text-lg">Error al consultar precios</p>
                                    <p className="text-[var(--color-text-muted)] text-sm max-w-xs">{compareError}</p>
                                    <button
                                        onClick={() => { setPreciosTriggered(true); handleCompare(); }}
                                        className="mt-2 px-6 py-2 bg-[var(--color-primary)] text-white rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
                                    >
                                        Reintentar
                                    </button>
                                </div>
                            ) : !comparisonData?.items?.length ? (
                                <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                                    <span className="material-symbols-outlined text-5xl text-[var(--color-text-muted)]">storefront</span>
                                    <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Sin datos de precios</h2>
                                    <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
                                        {consolidatedList.length > 0
                                            ? 'Consultando precios de tu lista...'
                                            : 'Genera un plan desde el Dashboard para ver los precios.'}
                                    </p>
                                    {consolidatedList.length === 0 && (
                                        <button
                                            onClick={() => navigate('/app')}
                                            className="mt-2 px-6 py-2.5 text-white font-bold rounded-xl transition-colors"
                                            style={{ background: 'var(--gradient-hero)' }}
                                        >
                                            Ir al Dashboard
                                        </button>
                                    )}
                                    {consolidatedList.length > 0 && (
                                        <button
                                            onClick={() => { setPreciosTriggered(true); handleCompare(); }}
                                            className="mt-2 px-6 py-2 bg-[var(--color-primary)] text-white rounded-full font-bold text-sm hover:opacity-90 transition-opacity"
                                        >
                                            Consultar precios
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {/* Offers summary banner */}
                                    {(() => {
                                        const offerItems = (comparisonData?.items || []).filter(item =>
                                            !excludedItems.has(item.product_id || item.original_query) &&
                                            item.candidates?.some(c => c.is_on_offer)
                                        );
                                        const totalSaved = offerItems.reduce((sum, item) => {
                                            const offerCandidate = item.candidates?.find(c => c.is_on_offer);
                                            if (offerCandidate?.original_price && offerCandidate?.ticket_cost) {
                                                return sum + ((offerCandidate.original_price * (offerCandidate.units_to_buy || 1)) - offerCandidate.ticket_cost);
                                            }
                                            return sum;
                                        }, 0);
                                        if (offerItems.length === 0) return null;
                                        return (
                                            <div className="mx-5 lg:mx-10 mt-3 mb-1 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200/50 flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-white text-lg">local_offer</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-red-600 dark:text-red-400">
                                                        {offerItems.length} producto{offerItems.length !== 1 ? 's' : ''} en oferta
                                                    </p>
                                                    {totalSaved > 0 && (
                                                        <p className="text-xs text-red-500/80">
                                                            Te ahorras {totalSaved.toFixed(2)}€ con ofertas
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Article count + V3 badge */}
                                    <div className="flex items-center justify-between px-5 lg:px-10 pt-3 pb-1">
                                        <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-widest">
                                            {(comparisonData?.items?.length || 0) - excludedItems.size} articulos
                                            {excludedItems.size > 0 && (
                                                <span> ({excludedItems.size} en despensa)</span>
                                            )}
                                        </p>
                                        {isV2 && (
                                            <span className="text-[8px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-1.5 py-0.5 rounded-full border border-[var(--color-primary)]/20 font-bold">V3</span>
                                        )}
                                    </div>

                                    {/* Supermarket tabs + summary card */}
                                    <div className="px-5 lg:px-10 py-2">
                                        <div className="mb-2">
                                            <SupermarketTabs
                                                activeTab={activeSuperTab}
                                                setActiveTab={setActiveSuperTab}
                                                summary={summary}
                                                supermarkets={supermarkets}
                                            />
                                        </div>
                                        <ComparadorSummary
                                            displayPrice={getDisplayPrice()}
                                            summary={summary}
                                            savingsPercent={savingsPercent}
                                            supermarketCounts={supermarketCounts}
                                            excludedItems={excludedItems}
                                            excludedSavings={excludedSavings}
                                            activeTab={activeSuperTab}
                                            supermarkets={supermarkets}
                                            offerSavings={comparisonData?.stats?.offer_savings || 0}
                                            offerItemsCount={comparisonData?.stats?.offer_items_count || 0}
                                        />
                                    </div>

                                    {/* Product rows by category */}
                                    <CategorySection
                                        items={comparisonData?.items || []}
                                        activeTab={activeSuperTab}
                                        checkPantryMatch={checkPantryMatch}
                                        excludedItems={excludedItems}
                                        onToggleExclude={handleToggleExclude}
                                        supermarkets={supermarkets}
                                    />

                                    {/* Affiliate disclosure */}
                                    {comparisonData?.items?.some(item => item.candidates?.some(c => c.affiliate_url)) && (
                                        <p className="text-[9px] text-[var(--color-text-muted)] text-center px-4 mt-4 opacity-70">
                                            Algunos enlaces son de afiliado. Si compras a traves de ellos, recibimos una pequena comision sin coste adicional para ti.
                                        </p>
                                    )}

                                    {/* Share row inside Precios scrollable area */}
                                    <div className="flex gap-2 px-5 lg:px-10 mt-4 mb-2">
                                        <button
                                            onClick={handlePreciosShareWhatsApp}
                                            className="flex-1 h-11 bg-[#25D366] text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                                        >
                                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                            </svg>
                                            <span className="text-sm">WhatsApp</span>
                                        </button>
                                        <button
                                            onClick={handleCopyList}
                                            className="flex-1 h-11 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all"
                                            style={{ background: 'var(--gradient-hero)' }}
                                        >
                                            <span className="material-symbols-outlined text-xl">content_copy</span>
                                            <span className="text-sm">Copiar Lista</span>
                                        </button>
                                    </div>
                                </>
                            )}

                            <div className="h-4"></div>
                        </>
                    )}
                </div>

                {/* -------------------------------------------------------- */}
                {/* Fixed bottom area: share buttons (Lista) + CTA + BottomNav*/}
                {/* -------------------------------------------------------- */}
                <div className="absolute lg:static bottom-0 left-0 w-full z-20">
                    <div className="px-5 lg:px-10 pb-20 lg:pb-2 pt-0">
                        {/* Fade mask above the CTA on mobile */}
                        <div className="h-8 w-full bg-gradient-to-t from-[var(--color-bg-page)] to-transparent pointer-events-none -mb-2 lg:hidden"></div>

                        {/* Share buttons — only in Lista tab */}
                        {activePageTab === 'lista' && (
                            <div className="flex gap-2 mb-2 lg:max-w-xl">
                                <button
                                    onClick={handleListaShareWhatsApp}
                                    className="flex-1 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-sm h-11 rounded-full transition-all active:scale-[0.98]"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                    WhatsApp
                                </button>
                                <button
                                    onClick={handleListaShareGeneric}
                                    className="flex-1 flex items-center justify-center gap-2 bg-[var(--color-bg-card)] hover:bg-[var(--color-bg-muted)] text-[var(--color-primary)] font-semibold text-sm h-11 rounded-full border border-[var(--color-border)] transition-all active:scale-[0.98]"
                                >
                                    <span className="material-symbols-outlined text-lg">share</span> Compartir
                                </button>
                            </div>
                        )}

                        {/* "Comprar en tienda" CTA + Copy button */}
                        <div className="w-full lg:max-w-xl flex gap-2">
                            <a
                                href={storeSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={handleBuyStore}
                                className="flex-1 flex items-center justify-center gap-2 text-white font-bold text-base h-14 rounded-full shadow-lg transition-all active:scale-[0.98] hover:scale-[1.02] hover:brightness-110"
                                style={{ background: 'var(--gradient-hero)', boxShadow: '0 4px 16px var(--color-primary)' }}
                            >
                                <span className="material-symbols-outlined text-2xl">shopping_cart</span>
                                <span>Ir a {activeSupermarket?.display_name || 'la tienda'}</span>
                                {activePageTab === 'precios' && summary.mix > 0 && (
                                    <span className="text-sm opacity-80 ml-1">{summary.mix.toFixed(2)}€</span>
                                )}
                            </a>
                            <button
                                onClick={activePageTab === 'lista' ? handleCopyShoppingList : handleCopyList}
                                className="h-14 w-14 shrink-0 rounded-full bg-[var(--color-bg-card)] border border-[var(--color-border)] flex items-center justify-center shadow-lg transition-all active:scale-95 hover:bg-[var(--color-bg-muted)]"
                                title="Copiar lista"
                            >
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-xl">content_copy</span>
                            </button>
                        </div>
                    </div>

                    <BottomNav active="mi-compra" />
                </div>

            </div>
        </div>
    );
}
