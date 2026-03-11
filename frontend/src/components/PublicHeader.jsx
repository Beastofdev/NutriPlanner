import { Link, useNavigate } from 'react-router-dom';
import { BRAND } from '../config/brand';

export default function PublicHeader() {
    const navigate = useNavigate();

    return (
        <header className="sticky top-0 z-50 bg-[var(--color-bg-header)] backdrop-blur-md border-b border-[var(--color-border)]">
            <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-3">
                {/* Logo */}
                <Link to="/" className="flex items-center gap-2.5 group">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"
                        style={{ background: 'var(--gradient-hero)' }}
                    >
                        <span className="text-white text-sm font-extrabold" style={{ fontFamily: 'var(--font-body)' }}>
                            {BRAND.initials}
                        </span>
                    </div>
                    <span
                        className="text-lg text-[var(--color-text-primary)] tracking-tight hidden sm:block"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        {BRAND.name}
                    </span>
                </Link>

                {/* Nav links + CTA */}
                <div className="flex items-center gap-4">
                    <Link
                        to="/recetas"
                        className="hidden sm:block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        Recetas
                    </Link>
                    <Link
                        to="/comparar"
                        className="hidden sm:block text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                        Comparar
                    </Link>
                    <button
                        onClick={() => navigate('/planificar')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-full text-white text-sm font-semibold shadow-md hover:scale-[1.03] active:scale-[0.97] transition-transform"
                        style={{ background: 'var(--gradient-hero)' }}
                    >
                        <span className="material-symbols-outlined text-base">auto_awesome</span>
                        Planificar Menu
                    </button>
                </div>
            </div>
        </header>
    );
}
