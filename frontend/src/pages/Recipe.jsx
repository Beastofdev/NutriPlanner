import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, resolveImageUrl } from '../services/api';
import { track } from '../services/analytics';
import { cleanName } from '../utils/cleanName';

// [MEJORA] Componente Timer Interactivo para cocinar
const CookingTimer = ({ onTimerEnd }) => {
    const [seconds, setSeconds] = useState(0);
    const [isRunning, setIsRunning] = useState(false);
    const [presetMinutes, setPresetMinutes] = useState(5);
    const intervalRef = useRef(null);

    useEffect(() => {
        if (isRunning && seconds > 0) {
            intervalRef.current = setInterval(() => {
                setSeconds(prev => {
                    if (prev <= 1) {
                        setIsRunning(false);
                        // Notificación cuando termina
                        if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification('Timer finalizado', { body: 'Tu tiempo de cocción ha terminado' });
                        }
                        if (onTimerEnd) onTimerEnd();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(intervalRef.current);
    }, [isRunning, seconds]);

    const formatTime = (secs) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const startTimer = () => {
        if (seconds === 0) setSeconds(presetMinutes * 60);
        setIsRunning(true);
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    };

    const resetTimer = () => {
        setIsRunning(false);
        setSeconds(0);
    };

    return (
        <div className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] p-4 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                    <span className="material-symbols-outlined text-[var(--color-primary)]">timer</span>
                    Timer de Cocción
                </h4>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-3xl font-mono font-bold text-[var(--color-text-primary)]">
                    {formatTime(seconds)}
                </div>
                <div className="flex gap-2 flex-1">
                    {!isRunning ? (
                        <>
                            <select
                                value={presetMinutes}
                                onChange={(e) => { setPresetMinutes(Number(e.target.value)); setSeconds(Number(e.target.value) * 60); }}
                                className="bg-[var(--color-bg-page)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[var(--color-text-primary)] text-sm"
                            >
                                {[1, 2, 3, 5, 10, 15, 20, 30].map(m => (
                                    <option key={m} value={m}>{m} min</option>
                                ))}
                            </select>
                            <button onClick={startTimer} className="flex-1 bg-[var(--color-primary)] text-white font-bold py-2 px-4 rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors">
                                Iniciar
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setIsRunning(false)} className="flex-1 bg-amber-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-amber-400 transition-colors">
                                Pausar
                            </button>
                            <button onClick={resetTimer} className="bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-400 transition-colors">
                                Reset
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default function Recipe() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Recuperamos los datos que nos pasó Menu.jsx (con fallback a sessionStorage para refresh)
    const initialDish = (() => {
        if (location.state?.dish) {
            // Guardar en sessionStorage para sobrevivir refreshes
            sessionStorage.setItem('nutriplanner_current_recipe', JSON.stringify(location.state.dish));
            return location.state.dish;
        }
        try {
            const saved = sessionStorage.getItem('nutriplanner_current_recipe');
            return saved ? JSON.parse(saved) : null;
        } catch { return null; }
    })();
    const { imgUrl } = location.state || {};

    // V3 normalización: mapear prep_time a tiempo si no existe
    const normalizedDish = initialDish ? {
        ...initialDish,
        tiempo: initialDish.tiempo || (initialDish.prep_time ? `${initialDish.prep_time} min` : null),
    } : null;
    const [dish, setDish] = useState(normalizedDish);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [error, setError] = useState(null);
    const [productsMap, setProductsMap] = useState({});  // V2: Mapeo product_id -> info
    const [recipeRating, setRecipeRating] = useState(null);
    const [showCookingPrompt, setShowCookingPrompt] = useState(false);

    // Load current rating for this recipe
    useEffect(() => {
        if (!user || !initialDish?.recipe_id) return;
        api.getRecipeRatings()
            .then(res => {
                const found = (res.ratings || []).find(r => r.recipe_id === initialDish.recipe_id);
                if (found) setRecipeRating(found.rating);
            })
            .catch(() => {});
    }, [user, initialDish?.recipe_id]);

    const handleRate = async (rating) => {
        if (!user || !dish?.recipe_id) return;
        try {
            if (recipeRating === rating) {
                await api.deleteRecipeRating(dish.recipe_id);
                setRecipeRating(null);
            } else {
                await api.rateRecipe(dish.recipe_id, rating);
                setRecipeRating(rating);
                track('recipe_rated', { recipe_id: dish.recipe_id, rating });
            }
        } catch (e) {
            console.error('Error rating recipe:', e);
        }
    };

    // V2: Cargar products_map al montar
    useEffect(() => {
        const storedProductsMap = localStorage.getItem('nutriplanner_products_map');
        if (storedProductsMap) {
            try {
                setProductsMap(JSON.parse(storedProductsMap));
            } catch (e) { console.error('[Recipe] Error parsing products_map:', e); }
        }
    }, []);

    // Memorizar la función para evitar recreaciones innecesarias
    const fetchDetailsIfNeeded = useCallback(async (currentDish) => {
        if (!currentDish) return;

        // [SMART FETCH] V3 dishes have 'pasos' from backend or 'instrucciones' string
        if (currentDish.instrucciones && (!currentDish.pasos || currentDish.pasos.length === 0)) {
            // Handle multiple separator formats: real newlines, escaped \n, numbered steps, "Paso N:"
            let text = currentDish.instrucciones.replace(/\\n/g, '\n');
            let steps = text.split(/\n+/).filter(s => s.trim());
            // If only 1 long step, try splitting by "Paso N:" pattern
            if (steps.length <= 1 && text.length > 100) {
                const byPaso = text.split(/(?=Paso\s*\d+\s*[:.]\s*)/i).filter(s => s.trim());
                if (byPaso.length > 1) {
                    steps = byPaso;
                } else {
                    // Try numbered patterns ("1. ...", "2. ...")
                    steps = text.split(/(?=\d+\.\s)/).filter(s => s.trim());
                }
            }
            currentDish.pasos = steps;
        }
        const needsDetails = !currentDish.pasos || currentDish.pasos.length === 0;

        if (!needsDetails) {
            return;
        }

        setLoadingDetails(true);
        setError(null);

        try {
            // [FIX] Pasamos los ingredientes originales del menú para mantener coherencia
            const originalIngredients = currentDish.ingredientes || [];
            const porciones = currentDish.porciones || 1.0;
            const details = await api.getRecipeDetails(currentDish.nombre, originalIngredients, porciones);

            // Fusionamos detalles nuevos con lo existente
            setDish(prev => ({
                ...prev,
                ingredientes: details.ingredientes || prev?.ingredientes || [],
                pasos: details.pasos || prev?.pasos || [],
                tiempo: details.tiempo || prev?.tiempo || "15 min"
            }));
        } catch (err) {
            console.error("Error cargando detalles:", err);
            setError("No se pudieron cargar los detalles. Inténtalo de nuevo.");
        } finally {
            setLoadingDetails(false);
        }
    }, []);

    useEffect(() => {
        if (!initialDish) {
            navigate('/app/menu'); // Si no hay plato, volver al menú
            return;
        }
        fetchDetailsIfNeeded(initialDish);
    }, [initialDish, navigate, fetchDetailsIfNeeded]);

    // --- RENDERIZADO DE INGREDIENTES INTELIGENTE ---
    const renderIngredient = (ing, index) => {
        // Caso A: Es un texto simple
        if (typeof ing === 'string') {
            return (
                <li key={index} className="flex items-start gap-3 p-3 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
                    <span className="text-[var(--color-primary)] mt-1">●</span>
                    <span className="text-[var(--color-text-secondary)]">{cleanName(ing)}</span>
                </li>
            );
        }

        // Caso B: V2 - Es un objeto con product_id
        if (ing.product_id && productsMap[ing.product_id]) {
            const product = productsMap[ing.product_id];
            const qty = ing.qty_used || '';
            const unit = ing.unit || 'g';
            return (
                <li key={index} className="flex items-start gap-3 p-3 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
                    <span className="text-[var(--color-primary)] mt-1">●</span>
                    <span className="text-[var(--color-text-secondary)]">
                        {qty && <strong className="text-[var(--color-text-primary)]">{qty} {unit} </strong>}
                        {cleanName(product.name)}
                    </span>
                </li>
            );
        }

        // Caso C: V1 - Es un objeto {n, q} o {name, amount}
        const name = ing.n || ing.name || (ing.product_id ? `Producto ${ing.product_id}` : String(ing));
        const quantity = ing.q || ing.amount || (ing.qty_used ? `${ing.qty_used} ${ing.unit || 'g'}` : '');

        return (
            <li key={index} className="flex items-start gap-3 p-3 bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] shadow-sm">
                <span className="text-[var(--color-primary)] mt-1">●</span>
                <span className="text-[var(--color-text-secondary)]">
                    {quantity && <strong className="text-[var(--color-text-primary)]">{quantity} </strong>}
                    {cleanName(name)}
                </span>
            </li>
        );
    };

    if (!dish) return null;

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-none mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header con Imagen */}
                <div className="relative h-64 lg:h-48 shrink-0 bg-gradient-to-b from-[var(--color-primary-light)] to-[var(--color-bg-page)]">
                    {(imgUrl || dish?.image_url) ? (
                        <img src={resolveImageUrl(imgUrl || dish.image_url)} className="w-full h-full object-cover" alt={dish?.nombre || dish?.name || 'Receta'} loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-15">
                            <span className="material-symbols-outlined text-[var(--color-primary)]" style={{ fontSize: '96px' }}>restaurant</span>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg-page)] via-transparent to-transparent"></div>

                    <button onClick={() => navigate(-1)} className="absolute top-6 left-6 w-10 h-10 bg-[var(--color-bg-card)] backdrop-blur rounded-full flex items-center justify-center text-[var(--color-text-primary)] hover:bg-[var(--color-bg-card)] transition-colors border border-[var(--color-border)] shadow-sm">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>

                    {/* Rating buttons in header */}
                    {user && dish?.recipe_id && (
                        <div className="absolute top-6 right-6 flex gap-2">
                            <button
                                onClick={() => handleRate('like')}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${recipeRating === 'like' ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-[var(--color-bg-card)] backdrop-blur border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]'}`}
                            >
                                <span className="material-symbols-outlined text-lg" style={recipeRating === 'like' ? { fontVariationSettings: "'FILL' 1" } : {}}>thumb_up</span>
                            </button>
                            <button
                                onClick={() => handleRate('favorite')}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${recipeRating === 'favorite' ? 'bg-red-500 border-red-500 text-white' : 'bg-[var(--color-bg-card)] backdrop-blur border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-red-500'}`}
                            >
                                <span className="material-symbols-outlined text-lg" style={recipeRating === 'favorite' ? { fontVariationSettings: "'FILL' 1" } : {}}>favorite</span>
                            </button>
                            <button
                                onClick={() => handleRate('dislike')}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all border shadow-sm ${recipeRating === 'dislike' ? 'bg-red-500 border-red-500 text-white' : 'bg-[var(--color-bg-card)] backdrop-blur border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-red-500'}`}
                            >
                                <span className="material-symbols-outlined text-lg" style={recipeRating === 'dislike' ? { fontVariationSettings: "'FILL' 1" } : {}}>thumb_down</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Contenido Scrollable */}
                <div className="flex-1 overflow-y-auto px-6 lg:px-10 -mt-10 relative z-10 pb-10 scrollbar-hide">
                    <div className="flex justify-between items-start mb-4">
                        <h1 className="text-2xl font-bold leading-tight flex-1 mr-2 text-[var(--color-text-primary)]">{dish?.nombre}</h1>
                        <div className="flex items-center gap-2">
                            {dish?.nutriscore && (
                                <div
                                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 border"
                                    style={{ backgroundColor: dish.nutriscore.color + '15', borderColor: dish.nutriscore.color + '40' }}
                                    title={`Nutri-Score ${dish.nutriscore.grade} (puntuación: ${dish.nutriscore.score})`}
                                >
                                    <span className="text-[10px] font-bold uppercase leading-none" style={{ color: dish.nutriscore.color }}>Nutri</span>
                                    <span className="text-lg font-black leading-none" style={{ color: dish.nutriscore.color }}>{dish.nutriscore.grade}</span>
                                </div>
                            )}
                            <div className="bg-[var(--color-tint-teal)] px-3 py-1 rounded-lg border border-[var(--color-primary-light)] text-center">
                                <span className="block text-xs text-[var(--color-text-muted)] uppercase">Calorías</span>
                                <span className="text-[var(--color-primary)] font-bold">{dish?.calorias}</span>
                            </div>
                        </div>
                    </div>

                    {/* Info bar: Tiempo + Macros */}
                    {(() => {
                        // Resolve macros from either format: flat (DB) or nested (plan)
                        const prot = dish?.protein ?? dish?.macros?.proteinas;
                        const carbs = dish?.carbs ?? dish?.macros?.carbohidratos;
                        const fats = dish?.fats ?? dish?.macros?.grasas;
                        const hasMacros = prot != null || carbs != null || fats != null;
                        return (
                            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-[var(--color-text-muted)] border-b border-[var(--color-border)] pb-4">
                                {dish?.tiempo && (
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-lg">schedule</span>
                                        <span>Tiempo: <b className="text-[var(--color-text-primary)]">{dish.tiempo}</b></span>
                                    </div>
                                )}
                                {hasMacros && (
                                    <>
                                        {dish?.tiempo && <span className="text-[var(--color-border)]">|</span>}
                                        {prot != null && (
                                            <div className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-[var(--color-primary)]"></span>
                                                <span>Prot: <b className="text-[var(--color-text-primary)]">{Math.round(prot)}g</b></span>
                                            </div>
                                        )}
                                        {carbs != null && (
                                            <div className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
                                                <span>Carbs: <b className="text-[var(--color-text-primary)]">{Math.round(carbs)}g</b></span>
                                            </div>
                                        )}
                                        {fats != null && (
                                            <div className="flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-[#EF4444]"></span>
                                                <span>Grasas: <b className="text-[var(--color-text-primary)]">{Math.round(fats)}g</b></span>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}

                    {error ? (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-center">
                            {error}
                            <button onClick={() => fetchDetailsIfNeeded(dish)} className="mt-2 text-sm underline font-bold">Reintentar</button>
                        </div>
                    ) : (
                        <div className="space-y-8 lg:grid lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:space-y-0 animate-in fade-in duration-500">

                            {/* Left column: Instructions */}
                            <div className="space-y-8">
                            {/* Sección Pasos */}
                            <section>
                                <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-[var(--color-primary)]">
                                    <span className="material-symbols-outlined">format_list_numbered</span>
                                    Instrucciones
                                    {loadingDetails && <span className="text-xs text-[var(--color-text-muted)] animate-pulse">(cargando...)</span>}
                                </h3>
                                {loadingDetails ? (
                                    <p className="text-[var(--color-text-muted)] text-center py-4">El chef está escribiendo los pasos...</p>
                                ) : (
                                    <div className="space-y-4">
                                        {(dish.pasos || dish.instructions || []).map((step, i) => (
                                            <div key={i} className="flex gap-4">
                                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-xs mt-0.5">
                                                    {i + 1}
                                                </div>
                                                <p className="text-[var(--color-text-secondary)] leading-relaxed text-sm">
                                                    {step.replace(/^\d+[\.\)\-]\s*/, '')}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                            </div>

                            {/* Right column: Ingredients + Timer */}
                            <div className="space-y-6">
                            {/* Sección Ingredientes */}
                            <section>
                                <h3 className="text-lg font-bold mb-3 flex items-center gap-2 text-[var(--color-primary)]">
                                    <span className="material-symbols-outlined">grocery</span>
                                    Ingredientes
                                    {loadingDetails && <span className="text-xs text-[var(--color-text-muted)] animate-pulse">(cargando...)</span>}
                                </h3>
                                <ul className="space-y-2">
                                    {(dish.ingredientes || []).map((ing, i) => renderIngredient(ing, i))}
                                </ul>
                            </section>

                            {/* Timer Interactivo */}
                            <CookingTimer onTimerEnd={() => setShowCookingPrompt(true)} />

                            {/* Post-cooking rating prompt */}
                            {showCookingPrompt && user && dish?.recipe_id && !recipeRating && (
                                <div className="bg-gradient-to-r from-[var(--color-primary-light)] to-[var(--color-secondary-light)] rounded-xl p-4 border border-[var(--color-primary)]/20 mb-6">
                                    <p className="text-sm font-bold text-[var(--color-text-primary)] mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                                        ¿Qué tal te quedó?
                                    </p>
                                    <p className="text-xs text-[var(--color-text-muted)] mb-3">Tu opinión ayuda a mejorar las recomendaciones</p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { handleRate('like'); setShowCookingPrompt(false); }}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[var(--color-primary)] text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                                        >
                                            <span className="material-symbols-outlined text-base">thumb_up</span>
                                            Me gustó
                                        </button>
                                        <button
                                            onClick={() => { handleRate('favorite'); setShowCookingPrompt(false); }}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-lg text-sm font-bold hover:opacity-90 transition-opacity"
                                        >
                                            <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: "'FILL' 1" }}>favorite</span>
                                            Favorita
                                        </button>
                                        <button
                                            onClick={() => setShowCookingPrompt(false)}
                                            className="px-3 py-2.5 bg-[var(--color-bg-card)] text-[var(--color-text-muted)] rounded-lg text-xs border border-[var(--color-border)]"
                                        >
                                            Ahora no
                                        </button>
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
