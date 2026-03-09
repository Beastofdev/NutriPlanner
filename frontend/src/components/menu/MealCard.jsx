import { cleanName } from '../../utils/cleanName';
import { resolveImageUrl } from '../../services/api';

const MEAL_GRADIENTS = {
    desayuno: 'linear-gradient(135deg, #D27D59, #D9A77C)',
    almuerzo: 'linear-gradient(135deg, #A3AD85, #C4CCA8)',
    comida: 'linear-gradient(135deg, #B5694A, #D27D59)',
    merienda: 'linear-gradient(135deg, #A3AD85, #D27D59)',
    cena: 'linear-gradient(135deg, #5D4037, #A3AD85)',
};

const MEAL_ICONS = {
    desayuno: "bakery_dining",
    almuerzo: "local_cafe",
    comida: "restaurant",
    merienda: "emoji_food_beverage",
    cena: "nightlife",
};

export default function MealCard({ meal, data, regeneratingMealId, productsMap, onRegenerate, onViewRecipe, recipeRating, onRate }) {
    const gradient = MEAL_GRADIENTS[meal.k] || MEAL_GRADIENTS.comida;
    const icon = MEAL_ICONS[meal.k] || "restaurant";

    const handleRate = (e, rating) => {
        e.stopPropagation();
        if (!onRate || !data.recipe_id) return;
        onRate(data.recipe_id, recipeRating === rating ? null : rating);
    };

    return (
        <div>
            {/* Meal label + logged status */}
            <div className="flex justify-between items-center mb-1.5 px-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{meal.l}</h2>
                    <span className="text-[10px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">{meal.t}</span>
                </div>
            </div>

            {/* Horizontal compact card */}
            <div
                className="glass-panel rounded-xl overflow-hidden flex transition-all hover:shadow-[var(--shadow-elevated)]"
                style={{ height: '115px' }}
            >
                {/* Left — gradient image area */}
                <div className="w-24 shrink-0 relative overflow-hidden" style={{ background: gradient }}>
                    {data.image_url ? (
                        <img src={resolveImageUrl(data.image_url)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="material-symbols-outlined text-white/30" style={{ fontSize: '48px' }}>{icon}</span>
                        </div>
                    )}
                    {/* Nutri-Score badge */}
                    {data.nutriscore && (
                        <div
                            className="absolute top-2 left-2 z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 shadow-sm"
                            style={{ backgroundColor: data.nutriscore.color + 'E6' }}
                            title={`Nutri-Score ${data.nutriscore.grade}`}
                        >
                            <span className="text-[8px] font-bold text-white/80 leading-none">NS</span>
                            <span className="text-xs font-black text-white leading-none">{data.nutriscore.grade}</span>
                        </div>
                    )}
                    {/* Favorite heart */}
                    {data.recipe_id && onRate && (
                        <button
                            onClick={(e) => handleRate(e, 'favorite')}
                            className="absolute top-2 right-2 z-10"
                        >
                            <span className={`material-symbols-outlined text-sm ${recipeRating === 'favorite' ? 'text-red-400' : 'text-white/60'}`} style={recipeRating === 'favorite' ? { fontVariationSettings: "'FILL' 1" } : {}}>
                                favorite
                            </span>
                        </button>
                    )}
                </div>

                {/* Right — content */}
                <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
                    {/* Recipe name */}
                    <h3
                        className="text-[13px] font-bold text-[var(--color-text-primary)] leading-tight line-clamp-2"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        {data.nombre}
                    </h3>

                    {/* Kcal + ingredient tags */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-[var(--color-primary)] bg-[var(--color-primary-light)] px-1.5 py-0.5 rounded-md">{data.calorias} kcal</span>
                        {Array.isArray(data.ingredientes) && data.ingredientes.slice(0, 2).map((ing, i) => {
                            let displayText = '';
                            if (typeof ing === 'string') {
                                displayText = ing;
                            } else if (typeof ing === 'object') {
                                if (ing.product_id && productsMap[ing.product_id]) {
                                    displayText = productsMap[ing.product_id].name || `ID:${ing.product_id}`;
                                } else if (ing.n) {
                                    displayText = ing.n;
                                }
                            }
                            if (!displayText) return null;
                            return (
                                <span key={i} className="text-[9px] text-[var(--color-text-secondary)] bg-[var(--color-bg-muted)] px-1.5 py-0.5 rounded-md truncate max-w-[70px]">
                                    {cleanName(displayText)}
                                </span>
                            );
                        })}
                        {data.ingredientes?.length > 2 && (
                            <span className="text-[9px] text-[var(--color-text-muted)]">+{data.ingredientes.length - 2}</span>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                        {data.recipe_id && onRate && (
                            <>
                                <button
                                    onClick={(e) => handleRate(e, 'like')}
                                    className={`size-7 rounded-full flex items-center justify-center transition-all ${recipeRating === 'like' ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-muted)] hover:bg-[var(--color-primary)] hover:text-white text-[var(--color-text-muted)]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm" style={recipeRating === 'like' ? { fontVariationSettings: "'FILL' 1" } : {}}>thumb_up</span>
                                </button>
                                <button
                                    onClick={(e) => handleRate(e, 'dislike')}
                                    className={`size-7 rounded-full flex items-center justify-center transition-all ${recipeRating === 'dislike' ? 'bg-red-500 text-white' : 'bg-[var(--color-bg-muted)] hover:bg-red-500 hover:text-white text-[var(--color-text-muted)]'}`}
                                >
                                    <span className="material-symbols-outlined text-sm" style={recipeRating === 'dislike' ? { fontVariationSettings: "'FILL' 1" } : {}}>thumb_down</span>
                                </button>
                            </>
                        )}
                        <button
                            onClick={(e) => { e.stopPropagation(); onRegenerate(meal.k, data.nombre, data.calorias); }}
                            className={`size-7 rounded-full bg-[var(--color-bg-muted)] hover:bg-[var(--color-primary)] hover:text-white flex items-center justify-center text-[var(--color-text-muted)] transition-all ${regeneratingMealId === meal.k ? 'animate-spin' : ''}`}
                        >
                            <span className="material-symbols-outlined text-sm">sync</span>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewRecipe(data, meal.k, data.image_url); }}
                            className="size-7 rounded-full bg-[var(--color-bg-muted)] hover:bg-[var(--color-primary)] hover:text-white flex items-center justify-center text-[var(--color-text-muted)] transition-all"
                        >
                            <span className="material-symbols-outlined text-sm">menu_book</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
