import { useState } from 'react';

export default function MealPrepSection({ mealPrepGuide, selectedDay, navigate }) {
    const [mealPrepSession, setMealPrepSession] = useState(null);

    if (!mealPrepGuide || selectedDay !== 0) return null;

    return (
        <>
            {/* Meal Prep Guide */}
            <div className="px-5 pb-4">
                <div className="bg-[var(--color-bg-card)] rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
                    <div className="bg-amber-50 px-4 py-3 flex items-center gap-2 border-b border-amber-200">
                        <span className="material-symbols-outlined text-amber-500">kitchen</span>
                        <h3 className="text-amber-700 font-bold text-sm">Guía Meal Prep</h3>
                    </div>
                    <div className="p-4 space-y-4">
                        {mealPrepGuide.sesiones?.map((sesion, si) => (
                            <div key={si}>
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <p className="text-[var(--color-text-primary)] font-bold text-xs">{sesion.titulo}</p>
                                        <p className="text-[var(--color-text-muted)] text-[10px]">{sesion.descripcion}</p>
                                    </div>
                                    <button
                                        onClick={() => setMealPrepSession(sesion)}
                                        className="flex items-center gap-1 bg-amber-50 text-amber-600 text-[10px] font-bold px-3 py-1.5 rounded-lg border border-amber-300 hover:bg-amber-100 transition-colors shrink-0"
                                    >
                                        <span className="material-symbols-outlined text-sm">play_arrow</span>
                                        Cocinar
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    {sesion.recetas?.slice(0, 6).map((r, ri) => (
                                        <button
                                            key={ri}
                                            onClick={() => {
                                                if (r.dish_data) {
                                                    navigate('/app/receta', { state: { dish: r.dish_data, mealType: r.meal_type } });
                                                }
                                            }}
                                            className="flex items-center justify-between text-[11px] w-full text-left hover:bg-[var(--color-bg-page)] rounded-lg px-2 py-1.5 -mx-2 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2 truncate flex-1">
                                                <span className="material-symbols-outlined text-amber-300 text-sm group-hover:text-amber-500 transition-colors">menu_book</span>
                                                <span className="text-[var(--color-text-secondary)] truncate group-hover:text-[var(--color-text-primary)] transition-colors">{r.nombre}</span>
                                                {r.repeticiones > 1 && <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full shrink-0 border border-amber-200">x{r.repeticiones}</span>}
                                            </div>
                                            <span className="text-[var(--color-text-muted)] text-[10px] shrink-0 ml-2">{r.dias}</span>
                                        </button>
                                    ))}
                                </div>
                                {si === 0 && mealPrepGuide.sesiones.length > 1 && <div className="h-px bg-amber-100 mt-3"></div>}
                            </div>
                        ))}

                        {mealPrepGuide.shared_ingredients?.length > 0 && (
                            <div className="border-t border-amber-100 pt-3">
                                <p className="text-amber-600 text-[10px] font-bold uppercase tracking-wider mb-2">Prepara junto (se repiten)</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {mealPrepGuide.shared_ingredients.slice(0, 6).map((ing, i) => (
                                        <span key={i} className="text-[10px] bg-[var(--color-bg-page)] text-[var(--color-text-secondary)] px-2 py-1 rounded-lg border border-[var(--color-border)]">
                                            {ing.nombre} <span className="text-[var(--color-text-muted)]">({ing.recetas.length} recetas)</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Meal Prep Session Modal */}
            {mealPrepSession && (
                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-end justify-center" onClick={() => setMealPrepSession(null)}>
                    <div className="w-full max-w-lg bg-[var(--color-bg-card)] rounded-t-3xl max-h-[85vh] overflow-y-auto no-scrollbar" onClick={e => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 bg-[var(--color-bg-card)] border-b border-[var(--color-border)] px-5 py-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-amber-500">kitchen</span>
                                </div>
                                <div>
                                    <h3 className="text-[var(--color-text-primary)] font-bold text-base">{mealPrepSession.titulo}</h3>
                                    <p className="text-[var(--color-text-muted)] text-xs">{mealPrepSession.num_recetas || mealPrepSession.recetas?.length || 0} recetas a preparar</p>
                                </div>
                            </div>
                            <button onClick={() => setMealPrepSession(null)} className="w-8 h-8 rounded-full bg-[var(--color-bg-muted)] flex items-center justify-center">
                                <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg">close</span>
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-4">
                            <div className="bg-[var(--color-tint-teal)] rounded-xl p-4 border border-[var(--color-primary)]/20">
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-black">1</div>
                                    <h4 className="text-[var(--color-text-primary)] font-bold text-sm">Preparación conjunta</h4>
                                </div>
                                <p className="text-[var(--color-text-muted)] text-xs mb-2">Estos ingredientes se usan en varias recetas. Prepáralos todos de golpe:</p>
                                <div className="space-y-1">
                                    {(mealPrepGuide.shared_ingredients || []).slice(0, 5).map((ing, i) => (
                                        <p key={i} className="text-[var(--color-text-secondary)] text-xs flex items-center gap-2">
                                            <span className="text-[var(--color-primary)]">•</span> {ing.nombre} <span className="text-[var(--color-text-muted)]">→ {ing.recetas.join(", ")}</span>
                                        </p>
                                    ))}
                                    {(!mealPrepGuide.shared_ingredients || mealPrepGuide.shared_ingredients.length === 0) && (
                                        <p className="text-[var(--color-text-muted)] text-xs">Corta todas las verduras, mide especias y prepara salsas base antes de empezar a cocinar.</p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3">
                                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-black">2</div>
                                    <h4 className="text-[var(--color-text-primary)] font-bold text-sm">Cocinar por receta</h4>
                                </div>
                                <div className="space-y-3">
                                    {mealPrepSession.recetas?.map((r, ri) => (
                                        <div key={ri} className="bg-[var(--color-bg-card)] rounded-xl border border-[var(--color-border)] overflow-hidden shadow-sm">
                                            <button
                                                onClick={() => {
                                                    if (r.dish_data) {
                                                        navigate('/app/receta', { state: { dish: r.dish_data, mealType: r.meal_type } });
                                                    }
                                                }}
                                                className="w-full text-left p-3 flex items-center gap-3 hover:bg-[var(--color-bg-page)] transition-colors"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                                                    <span className="material-symbols-outlined text-amber-500 text-lg">menu_book</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[var(--color-text-primary)] font-bold text-sm truncate">{r.nombre}</p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[var(--color-text-muted)] text-[10px]">{r.dias}</span>
                                                        {r.calorias > 0 && <span className="text-[var(--color-text-muted)] text-[10px]">· {r.calorias} kcal</span>}
                                                    </div>
                                                </div>
                                                <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg">chevron_right</span>
                                            </button>
                                            {r.ingredientes?.length > 0 && (
                                                <div className="px-3 pb-3 flex flex-wrap gap-1">
                                                    {r.ingredientes.slice(0, 5).map((ing, ii) => {
                                                        const text = typeof ing === 'string' ? ing : (ing.n ? `${ing.n} ${ing.q || ''}` : '');
                                                        return text ? <span key={ii} className="text-[9px] bg-[var(--color-bg-page)] text-[var(--color-text-muted)] px-2 py-0.5 rounded border border-[var(--color-border)]">{text}</span> : null;
                                                    })}
                                                </div>
                                            )}
                                            {r.storage && (
                                                <div className="px-3 pb-2">
                                                    <p className="text-[10px] text-cyan-600 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">ac_unit</span> {r.storage}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-cyan-50 rounded-xl p-4 border border-cyan-200">
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-6 h-6 rounded-full bg-[var(--color-primary)] text-white flex items-center justify-center text-xs font-black">3</div>
                                    <h4 className="text-[var(--color-text-primary)] font-bold text-sm">Almacenamiento</h4>
                                </div>
                                <div className="space-y-1.5">
                                    <p className="text-[var(--color-text-secondary)] text-xs flex items-start gap-2"><span className="text-cyan-500 mt-px">•</span> Etiqueta cada recipiente con el día y nombre del plato</p>
                                    <p className="text-[var(--color-text-secondary)] text-xs flex items-start gap-2"><span className="text-cyan-500 mt-px">•</span> Deja enfriar antes de tapar y meter en la nevera</p>
                                    <p className="text-[var(--color-text-secondary)] text-xs flex items-start gap-2"><span className="text-cyan-500 mt-px">•</span> Lo que vayas a comer del día 4 en adelante, congélalo</p>
                                </div>
                            </div>
                        </div>

                        <div className="sticky bottom-0 bg-[var(--color-bg-card)] border-t border-[var(--color-border)] p-4">
                            <button
                                onClick={() => setMealPrepSession(null)}
                                className="w-full h-12 text-white font-bold rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-lg shadow-[var(--color-primary)]/20"
                                style={{ background: 'var(--gradient-hero)' }}
                            >
                                <span className="material-symbols-outlined">check</span> Entendido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
