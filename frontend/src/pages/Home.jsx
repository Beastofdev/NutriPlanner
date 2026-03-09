import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import BottomNav from '../components/NavBar';
import { BRAND, lsKey } from '../config/brand';

export default function Home() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [shopping, setShopping] = useState([]);
    const [comparison, setComparison] = useState(null);
    const [checkedCount, setCheckedCount] = useState(0);
    const [shoppingStats, setShoppingStats] = useState(null);
    const [supermarkets, setSupermarkets] = useState([]);
    const preferredSuper = localStorage.getItem(lsKey('preferred_supermarket'));

    useEffect(() => {
        const storedPlan = localStorage.getItem(lsKey('plan'));
        if (storedPlan) {
            try {
                setPlan(JSON.parse(storedPlan));
            } catch (e) {
                console.error("Error parsing plan", e);
            }
        }
        try {
            const s = localStorage.getItem(lsKey('shopping_v2'));
            if (s) setShopping(JSON.parse(s));
        } catch {}
        try {
            const c = localStorage.getItem(lsKey('comparison_v2'));
            if (c) setComparison(JSON.parse(c));
        } catch {}
        try {
            const ck = localStorage.getItem(lsKey('checked_items'));
            if (ck) setCheckedCount(JSON.parse(ck).length);
        } catch {}
        setLoading(false);
    }, []);

    useEffect(() => {
        if (!user) return;
        api.getShoppingStats()
            .then(data => setShoppingStats(data))
            .catch(() => {});
    }, [user]);

    useEffect(() => {
        api.getSupermarkets()
            .then(data => { if (data.supermarkets?.length > 0) setSupermarkets(data.supermarkets); })
            .catch(() => {});
    }, []);

    const todayPlan = plan?.menu?.[0];

    // Comparison summary for cards
    const compSummary = (() => {
        if (!comparison) return null;
        const superCodes = supermarkets.map(s => s.code);

        if (!comparison.items) {
            if (comparison.stats) {
                return { mix: comparison.stats.cheapest_total || 0, per_supermarket: comparison.stats.per_supermarket || {}, savings: comparison.stats.savings || 0 };
            }
            return null;
        }

        let mixTotal = 0;
        const perSuper = {};
        superCodes.forEach(code => { perSuper[code] = 0; });

        comparison.items.forEach(item => {
            if (!item.candidates?.length) return;
            const sorted = [...item.candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999));
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
        const maxSingle = superTotals.length > 0 ? Math.max(...superTotals) : 0;
        return { mix: mixTotal, per_supermarket: perSuper, savings: maxSingle - mixTotal };
    })();

    const mealSlots = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena'];
    const mealLabels = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', comida: 'Comida', merienda: 'Merienda', cena: 'Cena' };
    const mealIcons = { desayuno: 'egg_alt', almuerzo: 'brunch_dining', comida: 'lunch_dining', merienda: 'coffee', cena: 'dinner_dining' };
    const todayMeals = mealSlots.filter(s => todayPlan?.[s]).map(s => ({
        key: s, label: mealLabels[s], icon: mealIcons[s],
        nombre: todayPlan[s].nombre, calorias: todayPlan[s].calorias,
    }));

    const userName = user?.full_name?.split(' ')[0] || (() => { try { return JSON.parse(localStorage.getItem(lsKey('wizard_form')))?.name; } catch { return null; } })() || 'Invitado';
    const dateStr = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    if (loading) return <div className="h-screen bg-[var(--color-bg-page)] flex items-center justify-center text-[var(--color-primary)]">Cargando...</div>;

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)]" style={{ fontFamily: 'var(--font-body)' }}>
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header — serif greeting + small-caps date */}
                <header className="sticky top-0 z-20 bg-[var(--color-bg-header)] backdrop-blur-md pt-6 pb-3 px-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="rounded-full w-11 h-11 flex items-center justify-center text-white font-bold text-sm" style={{ background: 'var(--gradient-hero)' }}>
                                    {userName.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[var(--color-secondary)] rounded-full border-2 border-[var(--color-bg-page)]"></div>
                            </div>
                            <div>
                                <h2 className="text-xl text-[var(--color-text-primary)] leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                                    Hola, {userName}
                                </h2>
                                <p className="text-[var(--color-text-muted)] text-[10px] font-semibold uppercase tracking-widest">
                                    {dateStr}
                                </p>
                            </div>
                        </div>
                        <button onClick={() => navigate('/app/ajustes')} className="w-10 h-10 rounded-full glass-panel flex items-center justify-center">
                            <span className="material-symbols-outlined text-[var(--color-text-secondary)] text-xl">settings</span>
                        </button>
                    </div>
                </header>

                <main className="flex-1 flex flex-col gap-4 px-5 lg:px-10 pt-4 overflow-y-auto pb-24 lg:pb-8 scrollbar-hide animate-stagger">

                    {/* Hero Card — Menu de Hoy */}
                    <section className="glass-panel rounded-2xl p-5 shadow-[var(--shadow-card)]">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
                                </div>
                                <h3 className="text-base text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Menú de Hoy</h3>
                            </div>
                            <button onClick={() => navigate('/app/menu')} className="text-xs font-semibold text-[var(--color-primary)] hover:underline">Ver todo →</button>
                        </div>
                        <div className="flex flex-col gap-2">
                            {todayMeals.length > 0 ? todayMeals.map(meal => (
                                <div key={meal.key} className="flex items-center gap-3 px-3 py-2.5 bg-[var(--color-bg-page)]/60 rounded-xl">
                                    <span className="material-symbols-outlined text-lg text-[var(--color-primary)]" style={{ fontVariationSettings: "'FILL' 1" }}>{meal.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">{meal.nombre}</p>
                                        <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">{meal.label}</p>
                                    </div>
                                    <span className="text-xs font-bold text-[var(--color-text-secondary)] shrink-0">{meal.calorias} kcal</span>
                                </div>
                            )) : (
                                <button onClick={() => navigate('/app?new=true')} className="flex items-center justify-center gap-2 py-6 text-[var(--color-primary)] text-sm font-semibold hover:underline">
                                    <span className="material-symbols-outlined">add_circle</span> Genera tu primer menú
                                </button>
                            )}
                        </div>
                    </section>

                    {/* 2x2 Grid — secondary cards */}
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">

                        {/* Precio Semanal */}
                        <section
                            onClick={() => navigate('/app/mi-compra')}
                            className="glass-panel rounded-2xl p-4 shadow-[var(--shadow-card)] cursor-pointer hover:shadow-[var(--shadow-elevated)] transition-shadow min-h-[140px] flex flex-col"
                        >
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-light)] flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Tu Compra</p>
                            {compSummary ? (() => {
                                const preferredInfo = supermarkets.find(s => s.code === preferredSuper);
                                const preferredTotal = preferredSuper && compSummary.per_supermarket?.[preferredSuper];
                                const displayTotal = preferredTotal || compSummary.mix;
                                const displayName = preferredInfo?.display_name || supermarkets[0]?.display_name || 'tu super';
                                // Find if another super is cheaper
                                const otherEntries = Object.entries(compSummary.per_supermarket || {}).filter(([code]) => code !== preferredSuper && compSummary.per_supermarket[code] > 0);
                                const cheaperAlt = otherEntries.find(([, total]) => displayTotal - total > 3);
                                return (
                                    <>
                                        <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{displayTotal.toFixed(2)}€</p>
                                        {cheaperAlt ? (
                                            <p className="text-[11px] text-[var(--color-secondary)] font-semibold mt-auto">Ahorra {(displayTotal - cheaperAlt[1]).toFixed(0)}€ en {supermarkets.find(s => s.code === cheaperAlt[0])?.display_name || cheaperAlt[0]}</p>
                                        ) : (
                                            <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">Total en {displayName}</p>
                                        )}
                                    </>
                                );
                            })() : (
                                <p className="text-sm text-[var(--color-text-muted)] mt-2">Sin datos</p>
                            )}
                        </section>

                        {/* Lista de Compra */}
                        <section
                            onClick={() => navigate('/app/mi-compra')}
                            className="glass-panel rounded-2xl p-4 shadow-[var(--shadow-card)] cursor-pointer hover:shadow-[var(--shadow-elevated)] transition-shadow min-h-[140px] flex flex-col"
                        >
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-secondary-light)] flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[var(--color-secondary)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>checklist</span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Lista</p>
                            <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{checkedCount}/{shopping.length}</p>
                            <div className="h-1.5 w-full bg-[var(--color-bg-muted)] rounded-full overflow-hidden mt-2">
                                <div className="h-full bg-[var(--color-secondary)] rounded-full transition-all" style={{ width: `${shopping.length > 0 ? (checkedCount / shopping.length) * 100 : 0}%` }} />
                            </div>
                            <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">productos</p>
                        </section>

                        {/* Ofertas */}
                        <section
                            onClick={() => navigate('/app/mi-compra')}
                            className="glass-panel rounded-2xl p-4 shadow-[var(--shadow-card)] cursor-pointer hover:shadow-[var(--shadow-elevated)] transition-shadow min-h-[140px] flex flex-col"
                        >
                            <div className="w-8 h-8 rounded-lg bg-[var(--color-tint-amber)] flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[var(--color-warning)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>local_offer</span>
                            </div>
                            <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Ofertas</p>
                            {comparison?.stats?.offer_items_count > 0 ? (
                                <>
                                    <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{comparison.stats.offer_items_count}</p>
                                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">productos en oferta</p>
                                </>
                            ) : (
                                <>
                                    <p className="text-lg font-bold text-[var(--color-secondary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>Ver</p>
                                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">Ver precios</p>
                                </>
                            )}
                        </section>

                        {/* Historial / Ofertas */}
                        <section
                            onClick={() => shoppingStats?.trip_count > 0 ? navigate('/app/mi-compra') : navigate('/app/menu')}
                            className="glass-panel rounded-2xl p-4 shadow-[var(--shadow-card)] cursor-pointer hover:shadow-[var(--shadow-elevated)] transition-shadow min-h-[140px] flex flex-col"
                        >
                            {shoppingStats && shoppingStats.trip_count > 0 ? (
                                <>
                                    <div className="w-8 h-8 rounded-lg bg-[var(--color-secondary-light)] flex items-center justify-center mb-3">
                                        <span className="material-symbols-outlined text-[var(--color-secondary)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>receipt_long</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Historial</p>
                                    <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>{shoppingStats.total_spent?.toFixed(2)}€</p>
                                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">{shoppingStats.trip_count} compra{shoppingStats.trip_count !== 1 ? 's' : ''}</p>
                                </>
                            ) : (
                                <>
                                    <div className="w-8 h-8 rounded-lg bg-[var(--color-tint-green)] flex items-center justify-center mb-3">
                                        <span className="material-symbols-outlined text-[var(--color-secondary)] text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                                    </div>
                                    <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">Recetas</p>
                                    <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1" style={{ fontFamily: 'var(--font-display)' }}>260</p>
                                    <p className="text-[11px] text-[var(--color-text-secondary)] mt-auto">con productos de tu super</p>
                                </>
                            )}
                        </section>
                    </div>


                    {/* Share button — mobile only, shown when there's price data */}
                    {compSummary && (
                        <button
                            onClick={() => {
                                const text = `Mi compra semanal en ${BRAND.name}: ${compSummary.mix.toFixed(2)}\u20AC — ${BRAND.name}`;
                                if (navigator.share) {
                                    navigator.share({ title: 'Mi compra con NutriPlanner', text }).catch(() => {});
                                } else {
                                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                                }
                            }}
                            className="lg:hidden glass-panel rounded-xl py-3 px-4 flex items-center justify-center gap-2 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">share</span>
                            Compartir tu compra
                        </button>
                    )}

                </main>

                <BottomNav active="home" />
            </div>
        </div>
    );
}
