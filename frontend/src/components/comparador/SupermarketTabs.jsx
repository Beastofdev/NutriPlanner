export function SupermarketTabs({ activeTab, setActiveTab, summary, supermarkets }) {
    if ((supermarkets || []).length <= 1) {
        return (
            <div className="flex items-center justify-center gap-2 py-2">
                <span className="material-symbols-outlined text-lg text-[var(--color-primary)]">storefront</span>
                <span className="text-sm font-bold text-[var(--color-primary)]">Precios {supermarkets?.[0]?.display_name || 'Supermercado'}</span>
            </div>
        );
    }

    const tabs = [
        { key: 'Mixed', label: 'Optima', price: summary.mix, icon: 'bolt', color: 'var(--color-primary)' },
        ...(supermarkets || []).map(s => ({
            key: s.code,
            label: s.display_name,
            price: summary.per_supermarket?.[s.code] || 0,
            icon: s.icon || 'storefront',
            color: s.color,
        })),
    ];

    return (
        <div className="flex bg-[var(--color-bg-muted)] rounded-lg p-0.5 border border-[var(--color-border)]" role="tablist" aria-label="Supermercados">
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    aria-label={`${tab.label} — ${(tab.price || 0).toFixed(2)}€`}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                        activeTab === tab.key
                            ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/20'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                    }`}
                >
                    <span
                        className={`material-symbols-outlined text-sm ${activeTab === tab.key ? '' : tab.key === 'Mixed' ? 'text-[var(--color-primary)]' : ''}`}
                        style={activeTab !== tab.key && tab.key !== 'Mixed' ? { color: tab.color } : undefined}
                    >{tab.icon}</span>
                    <span>{tab.label}</span>
                    <span className="font-black">{(tab.price || 0).toFixed(2)}€</span>
                </button>
            ))}
        </div>
    );
}
