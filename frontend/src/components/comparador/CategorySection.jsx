import { useState } from 'react';
import { getCategoryFromCanonical, getCategoryMeta, getCategoryOrder } from '../../utils/categoryMappings';
import { SmartProductRow } from './SmartProductRow';

export function CategorySection({ items, activeTab, checkPantryMatch, excludedItems, onToggleExclude, supermarkets }) {
    const [collapsedCats, setCollapsedCats] = useState(new Set());

    const toggleCategory = (cat) => {
        setCollapsedCats(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    // Group items by category
    const categoryMap = {};
    items.forEach(item => {
        const cn = item.canonical_name || item.original_query || item.original_name || '';
        const cat = getCategoryFromCanonical(cn);
        if (!categoryMap[cat]) categoryMap[cat] = [];
        categoryMap[cat].push(item);
    });

    const categoryOrder = getCategoryOrder();

    return (
        <div className="px-4 lg:px-10 space-y-1.5 animate-stagger">
            {categoryOrder
                .filter(cat => categoryMap[cat]?.length > 0)
                .map(cat => {
                    const isCollapsed = collapsedCats.has(cat);
                    const meta = getCategoryMeta(cat);
                    const catItems = categoryMap[cat];
                    const catTotal = catItems.reduce((sum, item) => {
                        if (excludedItems.has(item.product_id || item.original_query)) return sum;
                        const cheapest = item.candidates?.length > 0
                            ? [...item.candidates].sort((a, b) => (a.ticket_cost || 999) - (b.ticket_cost || 999))[0]
                            : null;
                        return sum + (cheapest?.ticket_cost || 0);
                    }, 0);

                    return (
                        <div key={cat}>
                            <button
                                onClick={() => toggleCategory(cat)}
                                className="flex items-center gap-2 py-1.5 mt-1 w-full group cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-sm text-gray-500">{meta.icon}</span>
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{cat}</h4>
                                <span className="text-[10px] text-gray-600">({catItems.length})</span>
                                {catTotal > 0 && (
                                    <span className="text-[10px] font-bold text-[var(--color-primary)]">{catTotal.toFixed(2)}€</span>
                                )}
                                <div className="flex-1 h-px bg-gray-700/50 ml-1"></div>
                                <span className={`material-symbols-outlined text-sm text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}>
                                    expand_more
                                </span>
                            </button>
                            {!isCollapsed && (
                                <div className="space-y-1.5 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-2 lg:space-y-0">
                                    {catItems.map((item, idx) => (
                                        <SmartProductRow
                                            key={idx}
                                            item={item}
                                            activeTab={activeTab}
                                            pantryMatch={checkPantryMatch(item.original_name || item.original_query)}
                                            isExcluded={excludedItems.has(item.product_id || item.original_query)}
                                            onExclude={() => onToggleExclude(item.product_id || item.original_query)}
                                            supermarkets={supermarkets}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
        </div>
    );
}
