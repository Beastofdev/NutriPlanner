import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, resolveImageUrl } from '../services/api';
import BottomNav from '../components/NavBar';
import { lsKey } from '../config/brand';

const RECIPES_PER_PAGE = 24;

const MEAL_TYPE_LABELS = {
    desayuno: 'Desayuno',
    comida: 'Comida',
    cena: 'Cena',
};

const MEAL_TYPE_COLORS = {
    desayuno: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    comida: 'bg-[var(--color-secondary-light)] text-[var(--color-secondary)]',
    cena: 'bg-[var(--color-tint-amber)] text-[var(--color-warning)]',
};

const DIFFICULTY_LABELS = {
    easy: 'Fácil',
    medium: 'Media',
    hard: 'Difícil',
};

const DIET_LABELS = {
    omnivoro: 'Omnívoro',
    vegetariano: 'Vegetariano',
    vegano: 'Vegano',
    keto: 'Keto',
    sin_gluten: 'Sin Gluten',
    sin_lactosa: 'Sin Lactosa',
};

function RecipeCard({ recipe, isFavorite, onToggleFavorite, onClick }) {
    const mealColor = MEAL_TYPE_COLORS[recipe.meal_type] || 'bg-gray-100 text-gray-600';
    const mealLabel = MEAL_TYPE_LABELS[recipe.meal_type] || recipe.meal_type;

    return (
        <div
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
            className="group text-left w-full glass-panel rounded-2xl overflow-hidden hover:shadow-[var(--shadow-elevated)] transition-all duration-300 cursor-pointer"
        >
            <div className="h-36 w-full relative bg-gradient-to-b from-[var(--color-primary-light)] to-[var(--color-bg-page)]">
                {recipe.image_url ? (
                    <img
                        src={resolveImageUrl(recipe.image_url)}
                        alt={recipe.name}
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-15">
                        <span className="material-symbols-outlined" style={{ fontSize: '64px' }}>restaurant</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {onToggleFavorite && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(recipe.id); }}
                        className="absolute top-2.5 right-2.5 z-10 h-8 w-8 rounded-full bg-[var(--color-bg-card)] backdrop-blur flex items-center justify-center transition-all hover:scale-110 shadow-sm"
                    >
                        <span
                            className={`material-symbols-outlined text-lg ${isFavorite ? 'text-red-500' : 'text-[var(--color-text-secondary)]'}`}
                            style={isFavorite ? { fontVariationSettings: "'FILL' 1" } : {}}
                        >
                            favorite
                        </span>
                    </button>
                )}

                <div className="absolute bottom-2.5 left-3 right-3 flex justify-between items-end">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${mealColor}`}>{mealLabel}</span>
                    <span className="text-xs font-bold text-white bg-[var(--color-primary)] backdrop-blur px-2 py-1 rounded-lg">{recipe.calories} kcal</span>
                </div>
            </div>

            <div className="p-3.5">
                <h3 className="text-[var(--color-text-primary)] text-sm leading-tight mb-2 line-clamp-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{recipe.name}</h3>
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                    {recipe.rating_count > 0 && (
                        <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                            {recipe.avg_score.toFixed(1)}
                            <span className="text-[var(--color-text-muted)] font-normal">({recipe.rating_count})</span>
                        </span>
                    )}
                    {recipe.prep_time_minutes && (
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {recipe.prep_time_minutes} min
                        </span>
                    )}
                    {recipe.difficulty && (
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>
                            {DIFFICULTY_LABELS[recipe.difficulty] || recipe.difficulty}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

function PlanRecipeCard({ dish, imgUrl, onClick }) {
    return (
        <button
            onClick={onClick}
            className="group text-left flex-shrink-0 w-40 lg:w-auto bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden hover:border-[var(--color-primary-light)] hover:shadow-md transition-all"
        >
            <div className="h-24 w-full relative bg-gradient-to-b from-[var(--color-primary-light)] to-[var(--color-bg-page)]">
                {imgUrl ? (
                    <img src={resolveImageUrl(imgUrl)} alt={dish.nombre || 'Receta'} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-15">
                        <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>restaurant</span>
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                <span className="absolute bottom-1.5 right-2 text-[10px] font-bold text-white bg-[var(--color-primary)] px-1.5 py-0.5 rounded">{dish.calorias} kcal</span>
            </div>
            <div className="p-2.5">
                <h4 className="font-semibold text-[var(--color-text-primary)] text-xs leading-tight line-clamp-2">{dish.nombre}</h4>
                {dish.prep_time && (
                    <p className="text-[10px] text-[var(--color-text-muted)] mt-1 flex items-center gap-0.5">
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>schedule</span>
                        {dish.prep_time} min
                    </p>
                )}
            </div>
        </button>
    );
}

const FILTER_TABS = [
    { key: 'all', label: 'Todos', icon: 'apps' },
    { key: 'favorites', label: 'Favoritos', icon: 'favorite' },
    { key: 'desayuno', label: 'Desayuno', icon: 'bakery_dining' },
    { key: 'comida', label: 'Comida', icon: 'restaurant' },
    { key: 'cena', label: 'Cena', icon: 'nightlife' },
];

export default function Recetas() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [allRecipes, setAllRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [mealFilter, setMealFilter] = useState('all');
    const [dietFilter, setDietFilter] = useState(() => {
        try {
            const wd = JSON.parse(localStorage.getItem(lsKey('wizard_data')) || '{}');
            return wd.diet && wd.diet !== 'omnivoro' ? wd.diet : 'all';
        } catch { return 'all'; }
    });
    const [ratings, setRatings] = useState({});
    const [sortBy, setSortBy] = useState('name'); // 'name' | 'popular' | 'calories'
    const [recommendations, setRecommendations] = useState([]);
    const [plan, setPlan] = useState(null);

    // "What can I cook?" ingredient search
    const [ingredientMode, setIngredientMode] = useState(false);
    const [ingredientInput, setIngredientInput] = useState('');
    const [ingredientResults, setIngredientResults] = useState(null);
    const [ingredientLoading, setIngredientLoading] = useState(false);

    // Load plan from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(lsKey('plan'));
        if (stored) {
            try { setPlan(JSON.parse(stored)); } catch (e) { /* ignore */ }
        }
    }, []);

    // Load all recipes from API
    useEffect(() => {
        setLoading(true);
        api.getRecipes()
            .then(res => setAllRecipes(res.recipes || []))
            .catch(err => console.error('Error loading recipes:', err))
            .finally(() => setLoading(false));
    }, []);

    // Load user ratings
    useEffect(() => {
        if (!user) return;
        api.getRecipeRatings()
            .then(res => {
                const map = {};
                (res.ratings || []).forEach(r => { map[r.recipe_id] = r.rating; });
                setRatings(map);
            })
            .catch(() => {});
    }, [user]);

    // Load personalized recommendations
    useEffect(() => {
        if (!user) return;
        api.getRecipeRecommendations()
            .then(res => setRecommendations(res.recommendations || []))
            .catch(() => {});
    }, [user]);

    // Extract plan recipes (unique), enriching with images from API data when missing
    const planRecipes = useMemo(() => {
        if (!plan?.menu) return [];
        const seen = new Set();
        const dishes = [];
        // Build a lookup by name from API recipes for image fallback
        const imgLookup = {};
        allRecipes.forEach(r => { if (r.image_url) imgLookup[r.name] = r.image_url; });
        for (const day of plan.menu) {
            for (const mealKey of ['desayuno', 'comida', 'cena', 'almuerzo', 'merienda']) {
                const dish = day[mealKey];
                if (dish?.nombre && !seen.has(dish.nombre)) {
                    seen.add(dish.nombre);
                    // Fill missing image_url from API data
                    if (!dish.image_url && imgLookup[dish.nombre]) {
                        dish.image_url = imgLookup[dish.nombre];
                    }
                    dishes.push(dish);
                }
            }
        }
        return dishes;
    }, [plan, allRecipes]);

    // Available diets from recipes
    const parseDiets = (raw) => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (typeof raw === 'string') {
            try { const p = JSON.parse(raw); if (Array.isArray(p)) return p; } catch {}
            return [];
        }
        return [];
    };

    const availableDiets = useMemo(() => {
        const diets = new Set();
        allRecipes.forEach(r => parseDiets(r.suitable_diets).forEach(d => diets.add(d)));
        return Array.from(diets).sort();
    }, [allRecipes]);

    // Filter and sort recipes
    const filteredRecipes = useMemo(() => {
        const filtered = allRecipes.filter(r => {
            if (mealFilter === 'favorites') {
                if (ratings[r.id] !== 'favorite') return false;
            } else if (mealFilter !== 'all' && r.meal_type !== mealFilter) {
                return false;
            }
            if (dietFilter !== 'all' && !parseDiets(r.suitable_diets).includes(dietFilter)) return false;
            if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });

        if (sortBy === 'popular') {
            filtered.sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0) || (b.rating_count || 0) - (a.rating_count || 0));
        } else if (sortBy === 'calories') {
            filtered.sort((a, b) => a.calories - b.calories);
        }
        // 'name' keeps default server order (meal_type, name)

        return filtered;
    }, [allRecipes, mealFilter, dietFilter, search, ratings, sortBy]);

    // Progressive loading: only render RECIPES_PER_PAGE at a time
    const [visibleCount, setVisibleCount] = useState(RECIPES_PER_PAGE);
    const sentinelRef = useRef(null);

    // Reset visible count when filters or sort change
    useEffect(() => { setVisibleCount(RECIPES_PER_PAGE); }, [mealFilter, dietFilter, search, sortBy]);

    const visibleRecipes = useMemo(() => filteredRecipes.slice(0, visibleCount), [filteredRecipes, visibleCount]);
    const hasMore = visibleCount < filteredRecipes.length;

    // IntersectionObserver to load more
    useEffect(() => {
        if (!hasMore) return;
        const el = sentinelRef.current;
        if (!el) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) setVisibleCount(prev => prev + RECIPES_PER_PAGE); },
            { rootMargin: '200px' }
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [hasMore, visibleCount]);

    const handleToggleFavorite = async (recipeId) => {
        if (!user) return;
        try {
            if (ratings[recipeId] === 'favorite') {
                await api.deleteRecipeRating(recipeId);
                setRatings(prev => { const n = { ...prev }; delete n[recipeId]; return n; });
            } else {
                await api.rateRecipe(recipeId, 'favorite');
                setRatings(prev => ({ ...prev, [recipeId]: 'favorite' }));
            }
        } catch (e) {
            console.error('Error toggling favorite:', e);
        }
    };

    const navigateToRecipe = (recipe) => {
        // Adapt DB recipe format to Recipe.jsx expected format
        navigate('/app/receta', {
            state: {
                dish: {
                    nombre: recipe.name,
                    calorias: recipe.calories,
                    recipe_id: recipe.id,
                    prep_time: recipe.prep_time_minutes,
                    image_url: recipe.image_url,
                    protein: recipe.protein,
                    carbs: recipe.carbs,
                    fats: recipe.fats,
                    ingredientes: [],
                },
                imgUrl: recipe.image_url,
            }
        });
    };

    const navigateToPlanRecipe = (dish) => {
        navigate('/app/receta', {
            state: { dish, imgUrl: dish.image_url }
        });
    };

    const handleIngredientSearch = async () => {
        const ingredients = ingredientInput.split(',').map(s => s.trim()).filter(Boolean);
        if (ingredients.length === 0) return;
        setIngredientLoading(true);
        try {
            const res = await api.searchRecipesByIngredients(ingredients, 20);
            setIngredientResults(res.results || []);
        } catch (e) {
            console.error('Error searching by ingredients:', e);
        } finally {
            setIngredientLoading(false);
        }
    };

    const exitIngredientMode = () => {
        setIngredientMode(false);
        setIngredientInput('');
        setIngredientResults(null);
    };

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)] font-sans pb-20 lg:pb-8">
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto">

                {/* Header */}
                <div className="px-5 lg:px-10 pt-6 lg:pt-8 pb-4 flex justify-between items-start">
                    <div>
                        <h1 className="text-2xl text-[var(--color-text-primary)] mb-1" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Recetas</h1>
                        <p className="text-sm text-[var(--color-text-muted)]">{allRecipes.length} recetas con productos de supermercado</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <button
                            onClick={() => ingredientMode ? exitIngredientMode() : setIngredientMode(true)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors shrink-0 ${
                                ingredientMode
                                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                                    : 'glass-panel text-[var(--color-primary)] border-[var(--color-primary)]/20 hover:bg-[var(--color-primary)]/10'
                            }`}
                        >
                            <span className="material-symbols-outlined text-sm">grocery</span>
                            Por ingredientes
                        </button>
                        {user && (
                            <button
                                onClick={() => navigate('/app/favoritas')}
                                className="flex items-center gap-1.5 px-3.5 py-2 bg-[var(--color-tint-red)] text-[var(--color-danger)] rounded-xl text-xs font-bold border border-[var(--color-danger)]/15 hover:bg-[var(--color-danger)]/10 transition-colors shrink-0"
                            >
                                <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                                Favoritas
                            </button>
                        )}
                    </div>
                </div>

                {/* Search / Ingredient input */}
                <div className="px-5 lg:px-10 mb-4">
                    {ingredientMode ? (
                        <div className="glass-panel rounded-xl p-4 space-y-3">
                            <p className="text-xs text-[var(--color-text-muted)] font-medium">Escribe los ingredientes que tienes, separados por comas:</p>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-xl">grocery</span>
                                <input
                                    type="text"
                                    placeholder="ej: pollo, arroz, tomate, cebolla..."
                                    value={ingredientInput}
                                    onChange={(e) => setIngredientInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleIngredientSearch(); }}
                                    className="w-full bg-[var(--color-bg-page)] rounded-xl pl-11 pr-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)] outline-none border border-[var(--color-border)]"
                                />
                            </div>
                            {ingredientInput.trim() && (
                                <div className="flex flex-wrap gap-1.5">
                                    {ingredientInput.split(',').map(s => s.trim()).filter(Boolean).map((ing, i) => (
                                        <span key={i} className="px-2.5 py-1 bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-medium rounded-full">
                                            {ing}
                                        </span>
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={handleIngredientSearch}
                                disabled={ingredientLoading || !ingredientInput.trim()}
                                className="w-full py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                            >
                                {ingredientLoading ? (
                                    <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined text-base">search</span>
                                )}
                                Buscar recetas
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-xl">search</span>
                            <input
                                type="text"
                                placeholder="Buscar recetas..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full glass-panel rounded-xl pl-11 pr-4 py-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all"
                            />
                            {search && (
                                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                                    <span className="material-symbols-outlined text-lg">close</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Meal type tabs */}
                {!ingredientMode && <div className="px-5 lg:px-10 mb-3">
                    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                        {FILTER_TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setMealFilter(tab.key)}
                                aria-pressed={mealFilter === tab.key}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                                    mealFilter === tab.key
                                        ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                        : 'glass-panel text-[var(--color-text-secondary)]'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>}

                {/* Diet filter */}
                {!ingredientMode && availableDiets.length > 0 && (
                    <div className="px-5 lg:px-10 mb-5">
                        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
                            <button
                                onClick={() => setDietFilter('all')}
                                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                    dietFilter === 'all'
                                        ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)] border border-[var(--color-primary-light)]'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                                }`}
                            >
                                Todas
                            </button>
                            {availableDiets.map(diet => (
                                <button
                                    key={diet}
                                    onClick={() => setDietFilter(diet === dietFilter ? 'all' : diet)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                                        dietFilter === diet
                                            ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)] border border-[var(--color-primary-light)]'
                                            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                                    }`}
                                >
                                    {DIET_LABELS[diet] || diet}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Plan Recipes Section */}
                {!ingredientMode && planRecipes.length > 0 && mealFilter === 'all' && dietFilter === 'all' && !search && mealFilter !== 'favorites' && (
                    <div className="mb-6">
                        <div className="px-5 lg:px-10 mb-3">
                            <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">calendar_month</span>
                                Tu Plan Semanal
                            </h2>
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{planRecipes.length} recetas en tu menú actual</p>
                        </div>
                        <div className="px-5 lg:px-10">
                            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 lg:grid lg:grid-cols-4 xl:grid-cols-6 lg:overflow-visible">
                                {planRecipes.map((dish, i) => (
                                    <PlanRecipeCard
                                        key={dish.nombre + i}
                                        dish={dish}
                                        imgUrl={dish.image_url}
                                        onClick={() => navigateToPlanRecipe(dish)}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Recommendations Section */}
                {!ingredientMode && recommendations.length > 0 && mealFilter === 'all' && dietFilter === 'all' && !search && (
                    <div className="mb-6">
                        <div className="px-5 lg:px-10 mb-3">
                            <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[var(--color-warning)] text-lg">auto_awesome</span>
                                Recomendados para ti
                            </h2>
                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Basado en tus gustos y los de usuarios similares</p>
                        </div>
                        <div className="px-5 lg:px-10">
                            <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 lg:grid lg:grid-cols-4 xl:grid-cols-6 lg:overflow-visible">
                                {recommendations.map(recipe => (
                                    <div key={recipe.id} className="flex-shrink-0 w-44 lg:w-auto">
                                        <RecipeCard
                                            recipe={recipe}
                                            isFavorite={ratings[recipe.id] === 'favorite'}
                                            onToggleFavorite={user ? handleToggleFavorite : null}
                                            onClick={() => navigateToRecipe(recipe)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Ingredient Search Results */}
                {ingredientMode && ingredientResults && (
                    <div className="px-5 lg:px-10 mb-6">
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">grocery</span>
                            {ingredientResults.length > 0
                                ? `${ingredientResults.length} recetas encontradas`
                                : 'No se encontraron recetas'}
                        </h2>
                        <div className="space-y-3">
                            {ingredientResults.map((result) => (
                                <button
                                    key={result.recipe_id}
                                    onClick={() => {
                                        const recipe = allRecipes.find(r => r.id === result.recipe_id);
                                        if (recipe) navigateToRecipe(recipe);
                                    }}
                                    className="w-full text-left glass-panel rounded-xl p-4 hover:shadow-[var(--shadow-elevated)] transition-all"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex-1 pr-3" style={{ fontFamily: 'var(--font-display)' }}>
                                            {result.recipe_name}
                                        </h3>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${
                                            result.coverage_pct >= 80 ? 'bg-green-100 text-green-700' :
                                            result.coverage_pct >= 50 ? 'bg-amber-100 text-amber-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>
                                            {result.coverage_pct}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-[var(--color-bg-muted)] rounded-full h-1.5 mb-2">
                                        <div
                                            className={`h-1.5 rounded-full transition-all ${
                                                result.coverage_pct >= 80 ? 'bg-green-500' :
                                                result.coverage_pct >= 50 ? 'bg-amber-500' :
                                                'bg-red-400'
                                            }`}
                                            style={{ width: `${result.coverage_pct}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-[var(--color-text-muted)]">
                                        Tienes {result.matched}/{result.total_ingredients} ingredientes
                                    </p>
                                    {result.missing_ingredients?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {result.missing_ingredients.slice(0, 5).map((ing, i) => (
                                                <span key={i} className="text-[10px] px-2 py-0.5 bg-[var(--color-bg-muted)] text-[var(--color-text-muted)] rounded-full">
                                                    Falta: {ing}
                                                </span>
                                            ))}
                                            {result.missing_ingredients.length > 5 && (
                                                <span className="text-[10px] px-2 py-0.5 text-[var(--color-text-muted)]">
                                                    +{result.missing_ingredients.length - 5} más
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* All Recipes */}
                {!ingredientMode && <div className="px-5 lg:px-10">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-base font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">menu_book</span>
                            {search || mealFilter !== 'all' || dietFilter !== 'all' ? 'Resultados' : 'Todas las Recetas'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--color-text-muted)] font-medium hidden sm:inline">{filteredRecipes.length} recetas</span>
                            <div className="flex bg-[var(--color-bg-muted)] rounded-lg p-0.5 border border-[var(--color-border)]">
                                {[
                                    { key: 'name', icon: 'sort_by_alpha', title: 'Ordenar por nombre' },
                                    { key: 'popular', icon: 'star', title: 'Mejor valoradas' },
                                    { key: 'calories', icon: 'local_fire_department', title: 'Ordenar por calorías' },
                                ].map(s => (
                                    <button
                                        key={s.key}
                                        onClick={() => setSortBy(s.key)}
                                        aria-pressed={sortBy === s.key}
                                        aria-label={s.title}
                                        title={s.title}
                                        className={`p-1.5 rounded-md transition-all ${
                                            sortBy === s.key
                                                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-sm">{s.icon}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden animate-pulse">
                                    <div className="h-36 bg-[var(--color-bg-muted)]" />
                                    <div className="p-3.5 space-y-2">
                                        <div className="h-4 bg-[var(--color-bg-muted)] rounded w-3/4" />
                                        <div className="h-3 bg-[var(--color-bg-muted)] rounded w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : filteredRecipes.length === 0 ? (
                        <div className="text-center py-12">
                            <span className="material-symbols-outlined text-[var(--color-border)] mb-3" style={{ fontSize: '48px' }}>search_off</span>
                            <p className="text-[var(--color-text-muted)] text-sm">No se encontraron recetas con esos filtros</p>
                            <button
                                onClick={() => { setSearch(''); setMealFilter('all'); setDietFilter('all'); }}
                                className="mt-3 text-sm text-[var(--color-primary)] font-semibold hover:underline"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {visibleRecipes.map(recipe => (
                                    <RecipeCard
                                        key={recipe.id}
                                        recipe={recipe}
                                        isFavorite={ratings[recipe.id] === 'favorite'}
                                        onToggleFavorite={user ? handleToggleFavorite : null}
                                        onClick={() => navigateToRecipe(recipe)}
                                    />
                                ))}
                            </div>
                            {hasMore && (
                                <div ref={sentinelRef} className="flex justify-center py-6">
                                    <span className="text-xs text-[var(--color-text-muted)]">Cargando más recetas...</span>
                                </div>
                            )}
                        </>
                    )}
                </div>}

            </div>
            <BottomNav active="recetas" />
        </div>
    );
}
