import { useState, useEffect } from 'react';
import { api } from '../../services/api';

const MERCADONA_COLOR = '#00A650';
const CONSUM_COLOR = '#E8611A';

function SkeletonRow() {
    return (
        <div className="flex items-center gap-3 py-2 border-b border-[var(--color-border)]">
            <div className="flex-1 h-3 rounded skeleton-shimmer" />
            <div className="w-14 h-3 rounded skeleton-shimmer" />
            <div className="w-14 h-3 rounded skeleton-shimmer" />
        </div>
    );
}

function PriceCell({ entry, isCheaper, supermarketColor }) {
    if (!entry) {
        return (
            <span className="text-xs text-[var(--color-text-muted)] italic w-20 text-right">
                —
            </span>
        );
    }
    return (
        <span
            className={`text-xs font-mono w-20 text-right tabular-nums ${
                isCheaper
                    ? 'font-black'
                    : 'text-[var(--color-text-muted)]'
            }`}
            style={isCheaper ? { color: supermarketColor } : undefined}
        >
            {isCheaper && (
                <span className="material-symbols-outlined text-[9px] align-middle mr-0.5" style={{ color: supermarketColor }}>
                    arrow_downward
                </span>
            )}
            {entry.price.toFixed(2)}€
        </span>
    );
}

export default function BasketCompare() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        api.getProductRankings('cheapest_basket')
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.response?.data?.detail || 'No se pudo cargar la cesta básica.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    const cheapestColor = data?.cheapest === 'MERCADONA' ? MERCADONA_COLOR : CONSUM_COLOR;
    const cheapestLabel = data?.cheapest === 'MERCADONA' ? 'Mercadona' : 'Consum';

    return (
        <div className="glass-panel rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-card)] animate-fade-in">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h2
                        className="text-base font-bold text-[var(--color-text-primary)] leading-tight"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        Cesta básica
                    </h2>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        Mercadona vs Consum
                    </p>
                </div>
                <span className="material-symbols-outlined text-xl text-[var(--color-primary)] shrink-0 mt-0.5">
                    shopping_basket
                </span>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-3 mb-1 pb-1 border-b border-[var(--color-border)]">
                <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-muted)]">
                    Producto
                </span>
                <span
                    className="w-20 text-right text-[10px] font-black uppercase tracking-wide"
                    style={{ color: MERCADONA_COLOR }}
                >
                    Mercadona
                </span>
                <span
                    className="w-20 text-right text-[10px] font-black uppercase tracking-wide"
                    style={{ color: CONSUM_COLOR }}
                >
                    Consum
                </span>
            </div>

            {/* Loading skeleton */}
            {loading && (
                <div className="space-y-0.5 mt-1">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <SkeletonRow key={i} />
                    ))}
                </div>
            )}

            {/* Error state */}
            {!loading && error && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <span className="material-symbols-outlined text-3xl text-[var(--color-text-muted)]">
                        sentiment_dissatisfied
                    </span>
                    <p className="text-sm text-[var(--color-text-muted)]">{error}</p>
                    <button
                        onClick={() => {
                            setError(null);
                            setLoading(true);
                            api.getProductRankings('cheapest_basket')
                                .then(setData)
                                .catch((err) => setError(err?.response?.data?.detail || 'Error al cargar datos.'))
                                .finally(() => setLoading(false));
                        }}
                        className="mt-1 text-xs font-bold text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-xs">refresh</span>
                        Reintentar
                    </button>
                </div>
            )}

            {/* Product rows */}
            {!loading && !error && data && (
                <>
                    <div className="divide-y divide-[var(--color-border)]">
                        {data.items.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex items-center gap-3 py-2 group"
                            >
                                {/* Product name */}
                                <span className="flex-1 text-xs text-[var(--color-text-primary)] capitalize leading-tight">
                                    {item.name}
                                </span>

                                {/* Mercadona price */}
                                <PriceCell
                                    entry={item.mercadona}
                                    isCheaper={item.cheaper === 'MERCADONA'}
                                    supermarketColor={MERCADONA_COLOR}
                                />

                                {/* Consum price */}
                                <PriceCell
                                    entry={item.consum}
                                    isCheaper={item.cheaper === 'CONSUM'}
                                    supermarketColor={CONSUM_COLOR}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Totals row */}
                    <div className="flex items-center gap-3 pt-3 mt-1 border-t-2 border-[var(--color-border)]">
                        <span
                            className="flex-1 text-xs font-black uppercase tracking-wide text-[var(--color-text-primary)]"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            Total
                        </span>
                        <span
                            className={`w-20 text-right text-sm font-black font-mono tabular-nums ${
                                data.cheapest === 'MERCADONA' ? 'font-black' : 'text-[var(--color-text-muted)]'
                            }`}
                            style={data.cheapest === 'MERCADONA' ? { color: MERCADONA_COLOR } : undefined}
                        >
                            {data.totals?.MERCADONA?.toFixed(2)}€
                        </span>
                        <span
                            className={`w-20 text-right text-sm font-black font-mono tabular-nums ${
                                data.cheapest === 'CONSUM' ? 'font-black' : 'text-[var(--color-text-muted)]'
                            }`}
                            style={data.cheapest === 'CONSUM' ? { color: CONSUM_COLOR } : undefined}
                        >
                            {data.totals?.CONSUM?.toFixed(2)}€
                        </span>
                    </div>

                    {/* Savings badge */}
                    {data.savings > 0 && (
                        <div
                            className="mt-4 flex items-center gap-2 px-3 py-2.5 rounded-xl"
                            style={{ backgroundColor: `${cheapestColor}18` }}
                        >
                            <span
                                className="material-symbols-outlined text-lg shrink-0"
                                style={{ color: cheapestColor }}
                            >
                                check_circle
                            </span>
                            <p className="text-xs font-bold leading-tight" style={{ color: cheapestColor }}>
                                Ahorras{' '}
                                <span className="font-black text-sm">{data.savings.toFixed(2)}€</span>{' '}
                                comprando en {cheapestLabel}
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
