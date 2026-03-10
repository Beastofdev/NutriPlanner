import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, resolveImageUrl } from '../services/api';
import { BRAND, lsKey } from '../config/brand';
import { cleanName } from '../utils/cleanName';
import { getCategoryFromCanonical, getCategoryMeta } from '../utils/categoryMappings';

const MEAL_LABELS = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', comida: 'Comida', merienda: 'Merienda', cena: 'Cena' };
const MEAL_ICONS = { desayuno: 'bakery_dining', almuerzo: 'local_cafe', comida: 'restaurant', merienda: 'emoji_food_beverage', cena: 'nightlife' };
const MEAL_SLOTS = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
const DAY_NAMES = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

const DEFAULT_SUPERMARKETS = [
    { code: 'MERCADONA', display_name: 'Mercadona', color: '#009234' },
    { code: 'CONSUM', display_name: 'Consum', color: '#E8611A' },
];

export default function MiMenu() {
    const navigate = useNavigate();
    const [plan, setPlan] = useState(null);
    const [shopping, setShopping] = useState([]);
    const [comparison, setComparison] = useState(null);
    const [supermarkets, setSupermarkets] = useState(DEFAULT_SUPERMARKETS);
    const [activeDay, setActiveDay] = useState(0);
    const [activeSection, setActiveSection] = useState('menu');
    const [checkedItems, setCheckedItems] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem(lsKey('checked_items')) || '[]')); }
        catch { return new Set(); }
    });
    const preferredSuper = localStorage.getItem(lsKey('preferred_supermarket'));

    useEffect(() => {
        const stored = localStorage.getItem(lsKey('plan'));
        if (!stored) return;
        try {
            const data = JSON.parse(stored);
            setPlan(data);
            if (data.shopping_list) setShopping(data.shopping_list);
            if (data.comparison) setComparison(data.comparison);
        } catch {}

        try {
            const comp = localStorage.getItem(lsKey('comparison_v2'));
            if (comp) setComparison(JSON.parse(comp));
        } catch {}

        try {
            const s = localStorage.getItem(lsKey('shopping_v2'));
            if (s) setShopping(JSON.parse(s));
        } catch {}

        api.getSupermarkets()
            .then(r => { if (r?.supermarkets?.length) setSupermarkets(r.supermarkets); })
            .catch(() => {});
    }, []);

    const menu = plan?.menu || [];

    // Price summary
    const priceSummary = useMemo(() => {
        if (!comparison) return null;
        const superCodes = supermarkets.map(s => s.code);

        if (comparison.stats) {
            return {
                mix: comparison.stats.cheapest_total || comparison.stats.mixed_total || 0,
                per_supermarket: comparison.stats.per_supermarket || {},
                items_found: comparison.stats.items_found || comparison.items?.length || 0,
                total_items: comparison.stats.total_items || comparison.items?.length || 0,
            };
        }

        if (!comparison.items) return null;

        let mixTotal = 0;
        const perSuper = {};
        superCodes.forEach(c => { perSuper[c] = 0; });

        comparison.items.forEach(item => {
            if (!item.candidates?.length) return;
            const sorted = [...item.candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999));
            const cheapest = sorted[0];
            if (cheapest) mixTotal += cheapest.ticket_cost || 0;
            superCodes.forEach(code => {
                const cands = item.candidates.filter(c => (c.supermarket || '').trim().toUpperCase() === code);
                perSuper[code] += cands.length > 0 ? Math.min(...cands.map(c => c.ticket_cost || 999)) : (cheapest?.ticket_cost || 0);
            });
        });

        return { mix: mixTotal, per_supermarket: perSuper, items_found: comparison.items.filter(i => i.candidates?.length).length, total_items: comparison.items.length };
    }, [comparison, supermarkets]);

    // Shopping items grouped by category
    const groupedShopping = useMemo(() => {
        const groups = {};
        shopping.forEach(item => {
            const cat = item.category || getCategoryFromCanonical(item.canonical_name, item.name) || 'Otros';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }, [shopping]);

    const toggleCheck = (name) => {
        setCheckedItems(prev => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name); else next.add(name);
            localStorage.setItem(lsKey('checked_items'), JSON.stringify([...next]));
            return next;
        });
    };

    // No plan — redirect to planificar
    if (!plan) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--gradient-hero)' }}>
                    <span className="material-symbols-outlined text-white text-3xl">restaurant_menu</span>
                </div>
                <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                    Aun no tienes un menu
                </h2>
                <p className="text-[var(--color-text-secondary)] mb-6">Genera tu menu semanal personalizado en 30 segundos</p>
                <button
                    onClick={() => navigate('/planificar')}
                    className="flex items-center gap-2 px-6 py-3 rounded-full text-white font-bold shadow-lg"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <span className="material-symbols-outlined">auto_awesome</span>
                    Planificar Menu
                </button>
            </div>
        );
    }

    const todayMenu = menu[activeDay];
    const todayMeals = MEAL_SLOTS.filter(s => todayMenu?.[s]).map(s => ({
        key: s,
        label: MEAL_LABELS[s],
        icon: MEAL_ICONS[s],
        ...todayMenu[s],
    }));

    const totalRecipes = menu.reduce((sum, day) => sum + MEAL_SLOTS.filter(s => day[s]).length, 0);
    const preferredTotal = preferredSuper && priceSummary?.per_supermarket?.[preferredSuper];
    const displayTotal = preferredTotal || priceSummary?.mix || 0;

    return (
        <div className="max-w-5xl mx-auto pb-24">
            {/* Hero stats bar */}
            <div className="bg-[var(--color-bg-surface)] border-b border-[var(--color-border)]">
                <div className="max-w-5xl mx-auto px-5 py-5">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-2xl" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu Menu Semanal</h1>
                        <button
                            onClick={() => navigate('/planificar')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold text-[var(--color-primary)] bg-[var(--color-primary-light)] hover:bg-[var(--color-tint-teal)] transition-colors"
                        >
                            <span className="material-symbols-outlined text-base">refresh</span>
                            Regenerar
                        </button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="glass-panel rounded-xl p-3 text-center">
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{totalRecipes}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Recetas</p>
                        </div>
                        <div className="glass-panel rounded-xl p-3 text-center">
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
                                {displayTotal > 0 ? `${displayTotal.toFixed(0)}€` : '~'}
                            </p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">
                                {supermarkets.find(s => s.code === preferredSuper)?.display_name || 'Total'}
                            </p>
                        </div>
                        <div className="glass-panel rounded-xl p-3 text-center">
                            <p className="text-xl font-black text-[var(--color-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{shopping.length}</p>
                            <p className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Productos</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Section tabs */}
            <div className="sticky top-[57px] z-30 bg-[var(--color-bg-header)] backdrop-blur-md border-b border-[var(--color-border)]">
                <div className="max-w-5xl mx-auto px-5 flex gap-1">
                    {[
                        { id: 'menu', label: 'Menu', icon: 'restaurant_menu' },
                        { id: 'lista', label: 'Lista', icon: 'checklist' },
                        { id: 'precios', label: 'Precios', icon: 'savings' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSection(tab.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${activeSection === tab.id
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                            }`}
                        >
                            <span className="material-symbols-outlined text-base" style={activeSection === tab.id ? { fontVariationSettings: "'FILL' 1" } : {}}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-5 py-6">
                {/* ============ MENU SECTION ============ */}
                {activeSection === 'menu' && (
                    <div className="animate-fade-in">
                        {/* Day pills */}
                        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                            {menu.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveDay(i)}
                                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${activeDay === i
                                        ? 'text-white shadow-lg scale-[1.05]'
                                        : 'bg-[var(--color-bg-card)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:scale-[1.02]'
                                    }`}
                                    style={activeDay === i ? { background: 'var(--gradient-hero)' } : {}}
                                >
                                    {DAY_NAMES[i] || `Dia ${i + 1}`}
                                </button>
                            ))}
                        </div>

                        {/* Meals for active day */}
                        <div className="space-y-3">
                            {todayMeals.map((meal, idx) => (
                                <div
                                    key={meal.key}
                                    className="glass-panel rounded-xl p-4 flex gap-4 items-start hover:shadow-[var(--shadow-elevated)] transition-shadow cursor-pointer animate-fade-in"
                                    style={{ animationDelay: `${idx * 60}ms` }}
                                    onClick={() => navigate(`/recetas/${meal.recipe_id || encodeURIComponent(meal.nombre)}`)}
                                >
                                    {/* Image / icon fallback */}
                                    <div className="w-16 h-16 rounded-xl shrink-0 overflow-hidden bg-[var(--color-bg-muted)] flex items-center justify-center">
                                        {meal.imagen ? (
                                            <img src={resolveImageUrl(meal.imagen)} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        ) : (
                                            <span className="material-symbols-outlined text-2xl text-[var(--color-text-muted)]" style={{ fontVariationSettings: "'FILL' 1" }}>{meal.icon}</span>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase tracking-wider">{meal.label}</span>
                                            {meal.calorias && <span className="text-[10px] text-[var(--color-text-muted)]">{meal.calorias} kcal</span>}
                                        </div>
                                        <h3 className="text-sm font-bold text-[var(--color-text-primary)] truncate">{cleanName(meal.nombre)}</h3>
                                        {meal.ingredientes_v2?.length > 0 && (
                                            <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
                                                {meal.ingredientes_v2.slice(0, 4).map(i => cleanName(i.nombre || i.name || i)).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                    <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg shrink-0 mt-1">chevron_right</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ============ LISTA SECTION ============ */}
                {activeSection === 'lista' && (
                    <div className="animate-fade-in">
                        {/* Progress */}
                        <div className="glass-panel rounded-xl p-4 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                                    {checkedItems.size} de {shopping.length} productos
                                </span>
                                <span className="text-xs font-bold text-[var(--color-primary)]">
                                    {shopping.length > 0 ? Math.round((checkedItems.size / shopping.length) * 100) : 0}%
                                </span>
                            </div>
                            <div className="h-2 w-full bg-[var(--color-bg-muted)] rounded-full overflow-hidden">
                                <div className="h-full bg-[var(--color-secondary)] rounded-full transition-all" style={{ width: `${shopping.length > 0 ? (checkedItems.size / shopping.length) * 100 : 0}%` }} />
                            </div>
                        </div>

                        {/* Items by category */}
                        {Object.entries(groupedShopping).map(([category, items]) => {
                            const meta = getCategoryMeta(category);
                            return (
                                <div key={category} className="mb-4">
                                    <div className="flex items-center gap-2 mb-2 px-1">
                                        <span className="text-base">{meta?.emoji || '📦'}</span>
                                        <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">{category}</h3>
                                        <span className="text-[10px] text-[var(--color-text-muted)]">({items.length})</span>
                                    </div>
                                    <div className="space-y-1">
                                        {items.map(item => {
                                            const name = item.name || item.canonical_name;
                                            const checked = checkedItems.has(name);
                                            return (
                                                <button
                                                    key={name}
                                                    onClick={() => toggleCheck(name)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${checked ? 'opacity-50' : 'hover:bg-[var(--color-bg-muted)]'}`}
                                                >
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-[var(--color-secondary)] border-[var(--color-secondary)]' : 'border-[var(--color-border)]'}`}>
                                                        {checked && <span className="material-symbols-outlined text-white text-xs">check</span>}
                                                    </div>
                                                    <span className={`text-sm flex-1 ${checked ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]'}`}>
                                                        {cleanName(name)}
                                                    </span>
                                                    {item.total_qty && (
                                                        <span className="text-xs text-[var(--color-text-muted)] shrink-0">
                                                            {item.total_qty} {item.unit || ''}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {shopping.length === 0 && (
                            <p className="text-center text-[var(--color-text-muted)] py-8">Tu lista esta vacia</p>
                        )}
                    </div>
                )}

                {/* ============ PRECIOS SECTION ============ */}
                {activeSection === 'precios' && (
                    <div className="animate-fade-in">
                        {priceSummary ? (
                            <>
                                {/* Per-supermarket totals */}
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {supermarkets.map(s => {
                                        const total = priceSummary.per_supermarket?.[s.code] || 0;
                                        const isPreferred = s.code === preferredSuper;
                                        const allTotals = Object.values(priceSummary.per_supermarket || {}).filter(v => v > 0);
                                        const isCheapest = total > 0 && total === Math.min(...allTotals);
                                        return (
                                            <div
                                                key={s.code}
                                                className={`glass-panel rounded-xl p-4 text-center ${isPreferred ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                                            >
                                                <div className="flex items-center justify-center gap-2 mb-2">
                                                    <span className="material-symbols-outlined text-lg" style={{ color: s.color }}>storefront</span>
                                                    <span className="text-sm font-bold text-[var(--color-text-primary)]">{s.display_name}</span>
                                                </div>
                                                <p className="text-2xl font-black" style={{ fontFamily: 'var(--font-display)', color: s.color }}>
                                                    {total > 0 ? `${total.toFixed(2)}€` : '—'}
                                                </p>
                                                {isCheapest && total > 0 && (
                                                    <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-[var(--color-secondary)] bg-[var(--color-tint-green)] px-2 py-0.5 rounded-full">
                                                        <span className="material-symbols-outlined text-xs">check_circle</span>
                                                        Mas barato
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Stats */}
                                <div className="glass-panel rounded-xl p-4 mb-6">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-[var(--color-text-secondary)]">Productos encontrados</span>
                                        <span className="font-bold text-[var(--color-text-primary)]">{priceSummary.items_found}/{priceSummary.total_items}</span>
                                    </div>
                                    {priceSummary.mix > 0 && (
                                        <div className="flex items-center justify-between text-sm mt-2">
                                            <span className="text-[var(--color-text-secondary)]">Mejor precio combinado</span>
                                            <span className="font-bold text-[var(--color-primary)]">{priceSummary.mix.toFixed(2)}€</span>
                                        </div>
                                    )}
                                </div>

                                {/* CTA buttons */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {supermarkets.map(s => (
                                        <a
                                            key={s.code}
                                            href={s.affiliate_url_template?.replace('{product_name}', '') || '#'}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl text-white font-bold text-sm shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
                                            style={{ background: s.color }}
                                        >
                                            <span className="material-symbols-outlined text-lg">shopping_cart</span>
                                            Comprar en {s.display_name}
                                        </a>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-4xl text-[var(--color-text-muted)] mb-3">price_check</span>
                                <p className="text-[var(--color-text-muted)]">Los precios se calculan al generar el menu</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom share / new plan */}
            <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-40 flex justify-center">
                <div className="max-w-5xl w-full flex gap-3">
                    <button
                        onClick={() => {
                            const text = `Mi menu semanal con ${BRAND.name}: ${totalRecipes} recetas, ${displayTotal.toFixed(0)}€`;
                            if (navigator.share) {
                                navigator.share({ title: BRAND.name, text }).catch(() => {});
                            } else {
                                navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
                            }
                        }}
                        className="flex-1 h-12 glass-panel rounded-full flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]"
                    >
                        <span className="material-symbols-outlined text-lg">share</span>
                        Compartir
                    </button>
                    <button
                        onClick={() => navigate('/planificar')}
                        className="flex-1 h-12 rounded-full flex items-center justify-center gap-2 text-sm font-bold text-white shadow-lg"
                        style={{ background: 'var(--gradient-hero)' }}
                    >
                        <span className="material-symbols-outlined text-lg">refresh</span>
                        Nuevo Menu
                    </button>
                </div>
            </div>
        </div>
    );
}
