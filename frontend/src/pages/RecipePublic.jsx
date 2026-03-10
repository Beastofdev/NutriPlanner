import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, resolveImageUrl } from '../services/api';
import { cleanName } from '../utils/cleanName';

export default function RecipePublic() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [recipe, setRecipe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRecipe = async () => {
            try {
                // If slug is numeric, look up recipe name first via catalog
                let dishName;
                if (!isNaN(slug) && slug.trim() !== '') {
                    const catalog = await api.getRecipes();
                    const match = (catalog.recipes || []).find(r => String(r.id) === slug);
                    if (!match) throw new Error('not found');
                    dishName = match.name;
                } else {
                    dishName = decodeURIComponent(slug);
                }
                const data = await api.getRecipeDetails(dishName);
                setRecipe(data);
            } catch (err) {
                setError('No se encontro la receta');
            } finally {
                setLoading(false);
            }
        };
        fetchRecipe();
    }, [slug]);

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-12">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-[var(--color-primary)]/30 border-t-[var(--color-primary)] rounded-full animate-spin" />
                    <p className="text-[var(--color-text-muted)] text-sm">Cargando receta...</p>
                </div>
            </div>
        );
    }

    if (error || !recipe) {
        return (
            <div className="max-w-3xl mx-auto px-5 py-12 text-center">
                <span className="material-symbols-outlined text-4xl text-[var(--color-text-muted)] mb-3">search_off</span>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Receta no encontrada</h2>
                <p className="text-[var(--color-text-muted)] mb-4">{error || 'Prueba con otra receta'}</p>
                <button
                    onClick={() => navigate('/recetas')}
                    className="px-5 py-2 rounded-full text-white font-semibold text-sm"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    Ver todas las recetas
                </button>
            </div>
        );
    }

    const name = cleanName(recipe.nombre || recipe.name || slug);
    const ingredients = recipe.ingredientes || recipe.ingredients || [];
    const steps = recipe.pasos || recipe.steps || [];
    const imageUrl = recipe.imagen || recipe.image;
    const kcal = recipe.calorias || recipe.calories;
    const time = recipe.tiempo || recipe.time;

    return (
        <div className="max-w-3xl mx-auto px-5 py-8 pb-24">
            {/* Back */}
            <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors mb-6">
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Volver
            </button>

            {/* Image */}
            {imageUrl && (
                <div className="w-full h-48 sm:h-64 rounded-2xl overflow-hidden bg-[var(--color-bg-muted)] mb-6">
                    <img src={resolveImageUrl(imageUrl)} alt={name} className="w-full h-full object-cover" />
                </div>
            )}

            {/* Title + meta */}
            <h1 className="text-2xl sm:text-3xl mb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {name}
            </h1>
            <div className="flex flex-wrap gap-3 mb-6">
                {kcal && (
                    <span className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] bg-[var(--color-tint-teal)] px-3 py-1 rounded-full">
                        <span className="material-symbols-outlined text-sm text-[var(--color-primary)]">local_fire_department</span>
                        {kcal} kcal
                    </span>
                )}
                {time && (
                    <span className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] bg-[var(--color-tint-amber)] px-3 py-1 rounded-full">
                        <span className="material-symbols-outlined text-sm text-[var(--color-warning)]">timer</span>
                        {String(time).replace(/\s*min\s*$/i, '')} min
                    </span>
                )}
            </div>

            {/* Ingredients */}
            {ingredients.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-lg font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Ingredientes</h2>
                    <div className="glass-panel rounded-xl p-4 space-y-2">
                        {ingredients.map((ing, i) => {
                            const ingName = typeof ing === 'string' ? ing : (ing.nombre || ing.name || '');
                            const qty = typeof ing === 'object' ? ing.cantidad || ing.quantity : null;
                            const unit = typeof ing === 'object' ? ing.unidad || ing.unit : null;
                            return (
                                <div key={i} className="flex items-center justify-between py-1 border-b border-[var(--color-border)] last:border-0">
                                    <span className="text-sm text-[var(--color-text-primary)]">{cleanName(ingName)}</span>
                                    {qty && <span className="text-xs text-[var(--color-text-muted)] shrink-0 ml-2">{qty} {unit || ''}</span>}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Steps */}
            {steps.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-lg font-bold mb-3" style={{ fontFamily: 'var(--font-display)' }}>Preparacion</h2>
                    <div className="space-y-4">
                        {steps.map((step, i) => {
                            const text = typeof step === 'string' ? step : (step.descripcion || step.text || '');
                            return (
                                <div key={i} className="flex gap-3">
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold" style={{ background: 'var(--gradient-hero)' }}>
                                        {i + 1}
                                    </div>
                                    <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed pt-1">{text}</p>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* CTA */}
            <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-40 flex justify-center">
                <button
                    onClick={() => navigate('/planificar')}
                    className="w-full max-w-3xl h-12 rounded-full text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <span className="material-symbols-outlined text-lg">auto_awesome</span>
                    Generar menu con esta receta
                </button>
            </div>
        </div>
    );
}
