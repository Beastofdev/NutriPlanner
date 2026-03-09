export function ComparadorSummary({
    displayPrice,
    summary,
    savingsPercent,
    supermarketCounts,
    excludedItems,
    excludedSavings,
    activeTab,
    supermarkets,
    offerSavings,
    offerItemsCount,
}) {
    // Cost per person if family mode active
    const familyInfo = (() => {
        try {
            const fi = JSON.parse(localStorage.getItem('nutriplanner_family_info') || 'null');
            return fi && fi.members_count > 1 ? fi : null;
        } catch { return null; }
    })();

    // Plan days for per-day and "vs eating out" calculations
    const planDays = (() => {
        try {
            const plan = JSON.parse(localStorage.getItem('nutriplanner_plan') || 'null');
            return plan?.menu?.length || 7;
        } catch { return 7; }
    })();
    const members = familyInfo?.members_count || 1;
    const perPersonPerDay = displayPrice > 0 ? (displayPrice / members / planDays) : 0;
    // Average eating out cost: ~10€/person/meal × 3 meals = ~30€/day, but we use a conservative 12€/day estimate
    const eatingOutCost = planDays * members * 12;
    const vsEatingOut = eatingOutCost - displayPrice;

    return (
        <div className="space-y-2 mb-2">
            {/* Main price bar */}
            <div className="bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
                    <span className="text-2xl font-black text-[var(--color-text-primary)] font-mono">{displayPrice.toFixed(2)}€</span>
                    {familyInfo && (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded flex items-center gap-0.5 relative -top-0.5">
                            <span className="material-symbols-outlined text-[10px]">family_restroom</span>
                            {(displayPrice / familyInfo.members_count).toFixed(2)}€/persona
                        </span>
                    )}
                    {summary.savings > 0 && (
                        <span className="text-[10px] font-bold text-amber-500 bg-[var(--color-tint-amber)] px-2 py-0.5 rounded relative -top-0.5">
                            -{summary.savings.toFixed(2)}€ {savingsPercent > 0 && `(${savingsPercent}%)`}
                        </span>
                    )}
                    {offerSavings > 0 && (
                        <>
                            <span className="text-[var(--color-border)]">·</span>
                            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded flex items-center gap-0.5 relative -top-0.5">
                                <span className="material-symbols-outlined text-[10px]">local_offer</span>
                                {offerItemsCount} en oferta (-{offerSavings.toFixed(2)}€)
                            </span>
                        </>
                    )}
                    <span className="text-[var(--color-border)]">·</span>
                    {activeTab === 'Mixed' && (supermarkets || []).length > 1 && (
                        <>
                            {(supermarkets || []).map(s => (
                                <span
                                    key={s.code}
                                    className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ backgroundColor: s.color + '20', color: s.color }}
                                >
                                    {supermarketCounts.per_supermarket?.[s.code] || 0} de {s.display_name}
                                </span>
                            ))}
                            {supermarketCounts.notFound > 0 && (
                                <span className="bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] text-[9px] font-bold px-1.5 py-0.5 rounded">
                                    {supermarketCounts.notFound} sin stock
                                </span>
                            )}
                        </>
                    )}
                    {(supermarkets || []).length <= 1 && supermarketCounts.notFound > 0 && (
                        <span className="bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] text-[9px] font-bold px-1.5 py-0.5 rounded">
                            {supermarketCounts.notFound} sin stock
                        </span>
                    )}
                    {excludedItems.size > 0 && (
                        <>
                            <span className="text-[var(--color-border)]">·</span>
                            <span className="text-[10px] text-[var(--color-primary)] font-bold flex items-center gap-0.5">
                                <span className="material-symbols-outlined text-xs">home</span>
                                {excludedItems.size} en despensa
                                {excludedSavings > 0 && ` (-${excludedSavings.toFixed(2)}€)`}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Savings insight card */}
            {displayPrice > 0 && (
                <div className="glass-panel rounded-xl px-4 py-3 border border-[var(--color-border)]">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="size-9 rounded-full bg-[var(--color-secondary-light)] flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[var(--color-secondary)] text-base">savings</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[11px] font-bold text-[var(--color-text-primary)]">
                                    {planDays} dias · {perPersonPerDay.toFixed(2)}€/persona/dia
                                </p>
                                <p className="text-[10px] text-[var(--color-text-muted)]">
                                    Cocinar en casa te ahorra ~{vsEatingOut.toFixed(0)}€ vs comer fuera
                                </p>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-lg font-black text-[var(--color-secondary)]" style={{ fontFamily: 'var(--font-display)' }}>
                                {vsEatingOut > 0 ? `-${vsEatingOut.toFixed(0)}€` : '0€'}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
