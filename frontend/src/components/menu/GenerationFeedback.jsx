export default function GenerationFeedback({ feedback, onDismiss }) {
    if (!feedback) return null;

    return (
        <div className="mx-5 mt-4 mb-2 relative">
            <div className="rounded-2xl p-4 border bg-[var(--color-tint-teal)] border-[var(--color-primary)]/30">
                <button
                    onClick={onDismiss}
                    className="absolute top-2 right-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                >
                    <span className="material-symbols-outlined text-sm">close</span>
                </button>

                <h3 className="font-bold text-[var(--color-text-primary)] text-sm flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[var(--color-primary)]">auto_awesome</span> ¡Menú Generado!
                </h3>

                <div className="space-y-1.5 text-xs">
                    <p className="text-[var(--color-text-secondary)]">
                        <span className="text-[var(--color-text-primary)] font-medium">{feedback.totalDays} días</span> con{' '}
                        <span className="text-[var(--color-text-primary)] font-medium">{feedback.totalProducts} productos</span>
                    </p>

                    {feedback.estimatedCost > 0 && (
                        <p className="text-[var(--color-primary)] font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">payments</span> Coste estimado: ~{feedback.estimatedCost}€
                        </p>
                    )}

                    {(feedback.pantryNames?.length > 0 || feedback.pantryItemsProvided > 0) && (
                        <p className="text-[var(--color-secondary)] flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">home</span> Ya tienes en casa: {(feedback.pantryNames || feedback.pantryUnused || []).slice(0, 3).join(', ')}
                            {(feedback.pantryNames || feedback.pantryUnused || []).length > 3 && ` (+${(feedback.pantryNames || feedback.pantryUnused || []).length - 3} más)`}
                        </p>
                    )}

                    <p className="text-[var(--color-text-muted)] mt-1 flex items-center gap-1">
                        Modo: {feedback.menuMode === 'savings' ? <><span className="material-symbols-outlined text-sm">savings</span> Ahorro</> : <><span className="material-symbols-outlined text-sm">restaurant</span> Variedad</>}
                    </p>
                </div>
            </div>
        </div>
    );
}
