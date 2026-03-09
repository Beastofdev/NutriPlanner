import { useState, useEffect } from 'react';
import { track } from '../../services/analytics';

function ProductThumb({ imageUrl, name }) {
    const [error, setError] = useState(false);
    useEffect(() => { setError(false); }, [imageUrl]);

    if (!error && imageUrl) {
        return (
            <div className="size-full bg-[var(--color-bg-page)] rounded-md border border-[var(--color-border)]">
                <img src={imageUrl} alt="" className="size-full object-contain p-0.5 rounded-md" loading="lazy" onError={() => setError(true)} />
            </div>
        );
    }
    return (
        <div className="size-full rounded-md bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-secondary)] flex items-center justify-center text-white font-bold text-sm">
            {name?.[0]?.toUpperCase() || '?'}
        </div>
    );
}

export function SmartProductRow({ item, activeTab, pantryMatch, isExcluded, onExclude, supermarkets }) {
    const candidates = item.candidates || [];
    const [idx, setIdx] = useState(0);

    useEffect(() => { setIdx(0); }, [activeTab]);

    let filteredCandidates;
    if (activeTab === 'Mixed') {
        filteredCandidates = [...candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999));
    } else {
        filteredCandidates = candidates.filter(c => {
            const supermarket = c.supermarket || '';
            if (!supermarket) return true;
            return supermarket.toLowerCase().includes(activeTab.toLowerCase());
        });
    }

    const itemName = item.original_name || item.original_query;

    if (filteredCandidates.length === 0) return <MissingCard name={itemName} supermarket={activeTab} />;

    const current = filteredCandidates[idx % filteredCandidates.length];
    const units = current?.units_to_buy || 1;
    const price = current?.ticket_cost || (current?.price * units) || 0;
    // Find cheapest alternative from any supermarket's house brand
    const activeSuper = (activeTab || '').toLowerCase();
    const isHouseBrand = activeSuper && new RegExp(`\\b${activeSuper}\\b`, 'i').test(current?.product_name || '');

    const cheaperAlt = filteredCandidates.length > 1
        ? filteredCandidates.find((c, i) => i !== (idx % filteredCandidates.length) && (c.ticket_cost || c.price || 999) < price)
        : null;
    const altSaving = cheaperAlt ? (price - (cheaperAlt.ticket_cost || (cheaperAlt.price * (cheaperAlt.units_to_buy || 1)))).toFixed(2) : null;
    const superName = current?.supermarket || 'Unknown';
    const superCode = superName.trim().toUpperCase();
    const superMeta = (supermarkets || []).find(s => s.code === superCode);
    const superColor = superMeta?.color || '#666666';
    const superLabel = superCode.length > 4 ? superCode.slice(0, 4) : superCode;

    let cardClass;
    if (isExcluded) {
        cardClass = "bg-[var(--color-bg-muted)] rounded-lg p-2 border border-[var(--color-border)] flex gap-2 relative transition-all opacity-50";
    } else if (pantryMatch) {
        cardClass = "bg-[var(--color-tint-teal)] rounded-lg p-2 border border-[var(--color-primary)]/20 flex gap-2 relative transition-all";
    } else if (item.is_suggestion) {
        cardClass = "bg-[var(--color-tint-amber)] rounded-lg p-2 border border-amber-300/30 flex gap-2 relative transition-all";
    } else {
        cardClass = "bg-[var(--color-bg-card)] rounded-lg p-2 border border-[var(--color-border)] flex gap-2 relative transition-all";
    }

    return (
        <div className={cardClass}>
            <div className="relative size-10 shrink-0">
                <ProductThumb imageUrl={current?.image_url} name={current?.product_name || itemName} />
                {units > 1 && (
                    <div className="absolute -top-1 -right-1 bg-[var(--color-primary)] text-white text-[8px] font-bold px-1 rounded-full shadow z-10 leading-tight">x{units}</div>
                )}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                        <h4 className="text-[11px] font-bold leading-tight line-clamp-1 text-[var(--color-text-primary)]">
                            {current?.product_name || itemName}
                        </h4>
                        {isHouseBrand && (
                            <span className="text-[7px] font-black text-white bg-[var(--color-secondary)] px-1 py-px rounded shrink-0 uppercase tracking-wide">
                                {activeTab}
                            </span>
                        )}
                        {current?.is_on_offer && (
                            <span className="text-[7px] font-black text-white bg-red-500 px-1 py-px rounded shrink-0 uppercase tracking-wide">
                                -{current.discount_percentage}%
                            </span>
                        )}
                    </div>
                    <div className="flex items-baseline gap-1 shrink-0">
                        {current?.is_on_offer && current?.original_price && (
                            <span className="text-[9px] text-[var(--color-text-muted)] line-through font-mono">{(current.original_price * units).toFixed(2)}€</span>
                        )}
                        <span className={`text-xs font-black whitespace-nowrap font-mono ${current?.is_on_offer ? 'text-red-500' : 'text-[var(--color-primary)]'}`}>{price.toFixed(2)}€</span>
                    </div>
                </div>

                <div className="flex items-center justify-between mt-0.5">
                    <div className="flex items-center gap-1 min-w-0">
                        <span className="text-white text-[7px] font-black px-1 py-px rounded shrink-0" style={{ backgroundColor: superColor }}>
                            {superLabel}
                        </span>
                        <span className="text-[8px] text-[var(--color-text-muted)] truncate">
                            {item.required_qty}{item.unit || 'g'}
                            {units > 1 && ` · ${current?.price?.toFixed(2)}€/ud`}
                        </span>
                        {pantryMatch && !isExcluded && (
                            <span className="text-[8px] text-[var(--color-primary)] font-bold shrink-0">
                                {pantryMatch.covers < 1 && pantryMatch.needed_qty
                                    ? `· FALTAN ${pantryMatch.needed_qty}${pantryMatch.needed_unit || 'g'}`
                                    : '· EN CASA'}
                            </span>
                        )}
                        {isExcluded && (
                            <span className="text-[8px] text-[var(--color-text-muted)] font-bold shrink-0">· EXCLUIDO</span>
                        )}
                        {cheaperAlt && altSaving && parseFloat(altSaving) > 0 && (
                            <button
                                onClick={() => { const altIdx = filteredCandidates.indexOf(cheaperAlt); if (altIdx >= 0) setIdx(altIdx); }}
                                className="text-[8px] text-[var(--color-secondary)] font-bold shrink-0 hover:underline"
                            >
                                · Ahorra {altSaving}€
                            </button>
                        )}
                    </div>
                    <div className="flex gap-0.5 shrink-0 ml-1">
                        {filteredCandidates.length > 1 && (
                            <button onClick={() => setIdx((prev) => prev + 1)} className="size-5 rounded bg-[var(--color-bg-muted)] flex items-center justify-center hover:bg-[var(--color-border)] transition-colors" title="Ver alternativa">
                                <span className="material-symbols-outlined text-[10px] text-[var(--color-text-muted)]">sync</span>
                            </button>
                        )}
                        <button
                            onClick={onExclude}
                            aria-pressed={isExcluded}
                            aria-label={isExcluded ? "Añadir a la lista" : "No comprar"}
                            className={`size-5 rounded flex items-center justify-center transition-colors ${isExcluded ? 'bg-[var(--color-tint-green)] hover:bg-green-200 text-green-600' : 'bg-[var(--color-bg-muted)] hover:bg-[var(--color-tint-red)] text-[var(--color-text-muted)] hover:text-red-500'}`}
                            title={isExcluded ? "Añadir a la lista" : "No comprar"}
                        >
                            <span className="material-symbols-outlined text-[10px]">{isExcluded ? 'add_shopping_cart' : 'remove_shopping_cart'}</span>
                        </button>
                        <a
                            href={current?.affiliate_url || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => track('product_deep_link', { product: current?.product_name || itemName, supermarket: current?.supermarket })}
                            className="size-5 rounded bg-[var(--color-primary)]/15 flex items-center justify-center hover:bg-[var(--color-primary)]/30 transition-colors"
                            aria-label="Ver en tienda"
                            title="Ver en tienda"
                        >
                            <span className="material-symbols-outlined text-[10px] text-[var(--color-primary)]">open_in_new</span>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function MissingCard({ name, supermarket }) {
    return (
        <div className="p-2 rounded-lg border border-dashed border-amber-300/30 flex items-center gap-2 opacity-60 bg-[var(--color-tint-amber)]">
            <span className="material-symbols-outlined text-amber-500 text-sm">storefront</span>
            <p className="text-[10px] font-bold text-[var(--color-text-muted)]">No disponible en {supermarket || 'este super'}: {name}</p>
        </div>
    );
}
