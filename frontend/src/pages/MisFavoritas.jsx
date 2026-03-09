import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, resolveImageUrl } from '../services/api';

const MEAL_TYPE_LABELS = {
    desayuno: 'Desayuno',
    comida: 'Comida',
    cena: 'Cena',
};

const MEAL_TYPE_COLORS = {
    desayuno: 'bg-amber-100 text-amber-700',
    comida: 'bg-emerald-100 text-emerald-700',
    cena: 'bg-rose-100 text-rose-700',
};

const DIFFICULTY_LABELS = {
    easy: 'Facil',
    medium: 'Media',
    hard: 'Dificil',
};

export default function MisFavoritas() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('favoritas');
    const [favorites, setFavorites] = useState([]);
    const [blocked, setBlocked] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) { navigate('/login'); return; }
        api.getRecipeRatings()
            .then(res => {
                const all = res.ratings || [];
                setFavorites(all.filter(r => r.rating === 'favorite'));
                setBlocked(all.filter(r => r.rating === 'dislike'));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [user, navigate]);

    const handleRemoveFavorite = async (e, recipeId) => {
        e.stopPropagation();
        await api.deleteRecipeRating(recipeId);
        setFavorites(prev => prev.filter(f => f.recipe_id !== recipeId));
    };

    const handleUnblock = async (e, recipeId) => {
        e.stopPropagation();
        await api.deleteRecipeRating(recipeId);
        setBlocked(prev => prev.filter(b => b.recipe_id !== recipeId));
    };

    const navigateToRecipe = (fav) => {
        navigate('/app/receta', {
            state: {
                dish: {
                    nombre: fav.recipe_name,
                    calorias: fav.calories,
                    recipe_id: fav.recipe_id,
                    prep_time: fav.prep_time_minutes,
                    image_url: fav.image_url,
                    protein: fav.protein,
                    carbs: fav.carbs,
                    fats: fav.fats,
                    ingredientes: [],
                },
                imgUrl: fav.image_url,
            }
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--color-bg-page)] flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
        );
    }

    const tabCount = activeTab === 'favoritas' ? favorites.length : blocked.length;

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)] font-sans pb-20 lg:pb-8">
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto">
                {/* Header */}
                <div className="px-5 lg:px-10 pt-6 lg:pt-8 pb-4 flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="h-10 w-10 rounded-full hover:bg-[var(--color-bg-muted)] flex items-center justify-center transition-colors">
                        <span className="material-symbols-outlined text-[var(--color-text-primary)]">arrow_back</span>
                    </button>
                    <div>
                        <h1 className="text-2xl font-extrabold text-[var(--color-text-primary)]">Mis Recetas</h1>
                        <p className="text-sm text-[var(--color-text-muted)]">{tabCount} receta{tabCount !== 1 ? 's' : ''} {activeTab === 'favoritas' ? 'guardadas' : 'bloqueadas'}</p>
                    </div>
                </div>

                {/* Tab switcher */}
                <div className="px-5 lg:px-10 mb-5">
                    <div className="inline-flex bg-[var(--color-bg-muted)] rounded-xl p-1 gap-1">
                        <button
                            onClick={() => setActiveTab('favoritas')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                activeTab === 'favoritas'
                                    ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm'
                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                            }`}
                        >
                            <span className="material-symbols-outlined text-base text-red-500" style={activeTab === 'favoritas' ? { fontVariationSettings: "'FILL' 1" } : {}}>favorite</span>
                            Favoritas
                            {favorites.length > 0 && (
                                <span className="ml-1 bg-[var(--color-primary)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{favorites.length}</span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('bloqueadas')}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                activeTab === 'bloqueadas'
                                    ? 'bg-[var(--color-bg-card)] text-[var(--color-text-primary)] shadow-sm'
                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                            }`}
                        >
                            <span className="material-symbols-outlined text-base text-[var(--color-text-muted)]">block</span>
                            Bloqueadas
                            {blocked.length > 0 && (
                                <span className="ml-1 bg-[var(--color-text-muted)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">{blocked.length}</span>
                            )}
                        </button>
                    </div>
                </div>

                {/* FAVORITAS tab */}
                {activeTab === 'favoritas' && (
                    favorites.length === 0 ? (
                        <div className="text-center py-20 px-6">
                            <span className="material-symbols-outlined text-6xl text-[var(--color-text-muted)] mb-4 block">favorite_border</span>
                            <p className="text-[var(--color-text-primary)] font-bold text-lg mb-1">Tu coleccion esta vacia</p>
                            <p className="text-sm text-[var(--color-text-muted)] mb-6 max-w-xs mx-auto">Cuando pruebes una receta que te encante, toca el corazon para guardarla aqui</p>
                            <button onClick={() => navigate('/app/recetas')} className="px-6 py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl text-sm">
                                Explorar Recetas
                            </button>
                        </div>
                    ) : (
                        <div className="px-5 lg:px-10 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {favorites.map(fav => {
                                const mealColor = MEAL_TYPE_COLORS[fav.meal_type] || 'bg-gray-100 text-gray-600';
                                const mealLabel = MEAL_TYPE_LABELS[fav.meal_type] || fav.meal_type;

                                return (
                                    <div
                                        key={fav.recipe_id}
                                        onClick={() => navigateToRecipe(fav)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter') navigateToRecipe(fav); }}
                                        className="group text-left w-full bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] overflow-hidden hover:border-[var(--color-primary-light)] hover:shadow-md transition-all duration-300 cursor-pointer"
                                    >
                                        <div className="h-36 w-full relative bg-gradient-to-b from-[var(--color-primary-light)] to-[var(--color-bg-page)]">
                                            {fav.image_url ? (
                                                <img
                                                    src={resolveImageUrl(fav.image_url)}
                                                    alt={fav.recipe_name}
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

                                            <button
                                                onClick={(e) => handleRemoveFavorite(e, fav.recipe_id)}
                                                className="absolute top-2.5 right-2.5 z-10 h-8 w-8 rounded-full bg-[var(--color-bg-card)] backdrop-blur flex items-center justify-center transition-all hover:scale-110 shadow-sm"
                                                title="Quitar de favoritas"
                                            >
                                                <span
                                                    className="material-symbols-outlined text-lg text-red-500"
                                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                                >
                                                    favorite
                                                </span>
                                            </button>

                                            <div className="absolute bottom-2.5 left-3 right-3 flex justify-between items-end">
                                                {mealLabel && (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${mealColor}`}>{mealLabel}</span>
                                                )}
                                                {fav.calories && (
                                                    <span className="text-xs font-bold text-white bg-[var(--color-primary)] backdrop-blur px-2 py-1 rounded-lg">{fav.calories} kcal</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="p-3.5">
                                            <h3 className="font-bold text-[var(--color-text-primary)] text-sm leading-tight mb-2 line-clamp-2">{fav.recipe_name}</h3>
                                            <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                                                {fav.prep_time_minutes && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">schedule</span>
                                                        {fav.prep_time_minutes} min
                                                    </span>
                                                )}
                                                {fav.difficulty && (
                                                    <span className="flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">signal_cellular_alt</span>
                                                        {DIFFICULTY_LABELS[fav.difficulty] || fav.difficulty}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )
                )}

                {/* BLOQUEADAS tab */}
                {activeTab === 'bloqueadas' && (
                    blocked.length === 0 ? (
                        <div className="text-center py-20 px-6">
                            <span className="material-symbols-outlined text-6xl text-[var(--color-text-muted)] mb-4 block">thumb_down_off_alt</span>
                            <p className="text-[var(--color-text-primary)] font-bold text-lg mb-1">Sin recetas bloqueadas</p>
                            <p className="text-sm text-[var(--color-text-muted)] max-w-xs mx-auto">Las recetas que no quieras volver a ver apareceran aqui. Puedes desbloquearlas en cualquier momento.</p>
                        </div>
                    ) : (
                        <div className="px-5 lg:px-10 flex flex-col gap-2">
                            <p className="text-xs text-[var(--color-text-muted)] mb-2">Estas recetas no apareceran en tus menus. Pulsa "Desbloquear" para volver a incluirlas.</p>
                            {blocked.map(item => (
                                <div
                                    key={item.recipe_id}
                                    className="flex items-center gap-3 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl px-4 py-3 opacity-60"
                                >
                                    {/* Thumbnail */}
                                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-[var(--color-bg-muted)] relative">
                                        {item.image_url ? (
                                            <img
                                                src={resolveImageUrl(item.image_url)}
                                                alt={item.recipe_name}
                                                className="w-full h-full object-cover"
                                                loading="lazy"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <span className="material-symbols-outlined text-[var(--color-text-muted)] text-2xl">restaurant</span>
                                            </div>
                                        )}
                                        {/* Block overlay icon */}
                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-white text-base" style={{ fontVariationSettings: "'FILL' 1" }}>block</span>
                                        </div>
                                    </div>

                                    {/* Name */}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{item.recipe_name}</p>
                                        {item.calories && (
                                            <p className="text-xs text-[var(--color-text-muted)]">{item.calories} kcal</p>
                                        )}
                                    </div>

                                    {/* Unblock button */}
                                    <button
                                        onClick={(e) => handleUnblock(e, item.recipe_id)}
                                        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] hover:bg-[var(--color-primary)] hover:text-white hover:border-[var(--color-primary)] text-[var(--color-text-secondary)] text-xs font-semibold transition-all"
                                    >
                                        <span className="material-symbols-outlined text-sm">lock_open</span>
                                        Desbloquear
                                    </button>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
