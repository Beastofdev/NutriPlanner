import { useNavigate } from 'react-router-dom';

/**
 * Bottom navigation bar – light theme.
 * 4 tabs: Inicio | Menú | Mi Compra | Recetas
 */

export const NavBtn = ({ icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center gap-0.5 p-1.5 transition-colors min-w-0 flex-1 ${
            active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
    >
        <span
            className="material-symbols-outlined text-[22px] transition-[font-variation-settings] duration-200"
            style={active ? { fontVariationSettings: "'FILL' 1, 'wght' 600" } : { fontVariationSettings: "'FILL' 0, 'wght' 400" }}
        >
            {icon}
        </span>
        <span className={`text-[10px] leading-tight ${active ? 'font-bold' : 'font-medium'}`}>
            {label}
        </span>
    </button>
);

export default function BottomNav({ active }) {
    const navigate = useNavigate();

    return (
        <nav className="fixed bottom-0 left-0 right-0 w-full bg-[var(--color-bg-nav)] backdrop-blur-xl border-t border-[var(--color-border)] pb-6 pt-2 px-2 z-30 lg:hidden"
            style={{ boxShadow: 'var(--shadow-nav)' }}
        >
            <div className="flex justify-between items-center max-w-lg mx-auto">
                <NavBtn
                    icon="dashboard"
                    label="Inicio"
                    active={active === 'home'}
                    onClick={() => navigate('/app/home')}
                />
                <NavBtn
                    icon="calendar_month"
                    label="Menú"
                    active={active === 'menu'}
                    onClick={() => navigate('/app/menu')}
                />
                <NavBtn
                    icon="shopping_cart"
                    label="Mi Compra"
                    active={active === 'mi-compra'}
                    onClick={() => navigate('/app/mi-compra')}
                />
                <NavBtn
                    icon="menu_book"
                    label="Recetas"
                    active={active === 'recetas'}
                    onClick={() => navigate('/app/recetas')}
                />
            </div>
        </nav>
    );
}
