import { useNavigate, useLocation } from 'react-router-dom';
import { BRAND } from '../config/brand';

const NAV_ITEMS = [
    { icon: 'dashboard', label: 'Inicio', route: '/app/home' },
    { icon: 'calendar_month', label: 'Menu Semanal', route: '/app/menu' },
    { icon: 'shopping_cart', label: 'Mi Compra', route: '/app/mi-compra' },
    { icon: 'menu_book', label: 'Recetas', route: '/app/recetas' },
    { icon: 'settings', label: 'Ajustes', route: '/app/ajustes' },
];

function SidebarItem({ icon, label, active, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-150 text-left ${
                active
                    ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-text-primary)]'
            }`}
        >
            <span
                className="material-symbols-outlined text-[20px] transition-[font-variation-settings] duration-200"
                style={
                    active
                        ? { fontVariationSettings: "'FILL' 1, 'wght' 600", color: 'var(--color-primary)' }
                        : { fontVariationSettings: "'FILL' 0, 'wght' 400", color: 'var(--color-text-muted)' }
                }
            >
                {icon}
            </span>
            <span
                className={`text-sm ${active ? 'font-semibold' : 'font-medium'}`}
                style={{ fontFamily: "var(--font-body)" }}
            >
                {label}
            </span>
        </button>
    );
}

export default function Sidebar() {
    const navigate = useNavigate();
    const location = useLocation();

    const getActiveKey = () => {
        const path = location.pathname;
        // Match the most specific route first
        for (const item of NAV_ITEMS) {
            if (path === item.route || path.startsWith(item.route + '/')) {
                return item.route;
            }
        }
        return '/app/home';
    };

    const activeRoute = getActiveKey();

    return (
        <aside className="hidden lg:flex flex-col w-[260px] h-screen bg-[var(--color-bg-card)] border-r border-[var(--color-border)] fixed left-0 top-0 z-40">
            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 pt-6 pb-2">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    <span className="text-white text-sm font-extrabold" style={{ fontFamily: "var(--font-body)" }}>{BRAND.initials}</span>
                </div>
                <div className="flex flex-col">
                    <span
                        className="text-lg text-[var(--color-text-primary)] tracking-tight leading-tight"
                        style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}
                    >
                        {BRAND.name}
                    </span>
                    <span className="text-[9px] text-[var(--color-text-muted)] font-semibold uppercase tracking-wider">{BRAND.tagline}</span>
                </div>
            </div>

            {/* Spacer */}
            <div className="h-6" />

            {/* Navigation */}
            <nav className="flex flex-col gap-1 px-3 flex-1">
                {NAV_ITEMS.map((item) => (
                    <SidebarItem
                        key={item.route}
                        icon={item.icon}
                        label={item.label}
                        active={activeRoute === item.route}
                        onClick={() => navigate(item.route)}
                    />
                ))}
            </nav>

            {/* Generate button */}
            <div className="px-3 pb-5">
                <button
                    onClick={() => navigate('/app?new=true')}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-white font-semibold text-sm shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform"
                    style={{
                        background: 'var(--gradient-hero)',
                        fontFamily: "var(--font-body)",
                        boxShadow: '0 4px 16px rgba(210, 125, 89, 0.3)',
                    }}
                >
                    <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        add
                    </span>
                    Generar Menu
                </button>
            </div>
        </aside>
    );
}
