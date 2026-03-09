import { useNavigate } from 'react-router-dom';

export function EmptyComparador() {
    const navigate = useNavigate();

    return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
            <span className="material-symbols-outlined text-5xl text-[var(--color-text-muted)]">shopping_cart_off</span>
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Sin datos de comparación</h2>
            <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
                Genera un plan desde el Dashboard para ver la comparación de precios entre supermercados.
            </p>
            <button
                onClick={() => navigate('/app')}
                className="mt-2 px-6 py-2.5 text-white font-bold rounded-xl transition-colors"
                style={{ background: 'var(--gradient-hero)' }}
            >
                Ir al Dashboard
            </button>
        </div>
    );
}
