import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BRAND } from '../config/brand';
import { api } from '../services/api';
import BasketCompare from '../components/comparador/BasketCompare';

const SUPERMARKETS = [
    { name: 'Mercadona', color: '#00A650' },
    { name: 'Consum', color: '#E8611A' },
];

export default function Landing() {
    const navigate = useNavigate();
    const [searchInput, setSearchInput] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [rankings, setRankings] = useState(null);
    const debounceRef = useRef(null);
    const searchRef = useRef(null);

    // Load rankings on mount
    useEffect(() => {
        api.getProductRankings('biggest_savings', 6)
            .then(setRankings)
            .catch(() => {});
    }, []);

    // Debounced search suggestions
    const handleSearchChange = useCallback((value) => {
        setSearchInput(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (!value.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }
        debounceRef.current = setTimeout(async () => {
            try {
                const data = await api.searchProducts({ q: value.trim(), limit: 5 });
                if (data?.products) {
                    setSuggestions(data.products);
                    setShowSuggestions(true);
                }
            } catch { /* ignore */ }
        }, 250);
    }, []);

    useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

    // Close suggestions on outside click
    useEffect(() => {
        const handler = (e) => {
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearch = (q) => {
        const query = q || searchInput.trim();
        if (query) navigate(`/comparar?q=${encodeURIComponent(query)}`);
    };

    return (
        <div className="text-[var(--color-text-primary)]">

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, var(--color-primary) 0%, transparent 50%), radial-gradient(circle at 70% 80%, var(--color-secondary) 0%, transparent 50%)' }} />
                <div className="max-w-4xl mx-auto px-5 pt-16 pb-20 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold uppercase tracking-wider mb-6">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        Precios reales actualizados
                    </div>

                    <h1
                        className="text-4xl sm:text-5xl lg:text-6xl leading-tight mb-5"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        ¿Mercadona o Consum?
                        <br />
                        <span className="gradient-hero-text">Compara y ahorra</span>
                    </h1>

                    <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-8 leading-relaxed">
                        Compara precios de{' '}
                        <strong className="text-[var(--color-text-primary)]">13,000+</strong>{' '}
                        productos entre{' '}
                        {SUPERMARKETS.map((s, i) => (
                            <span key={s.name}>
                                <span className="font-bold" style={{ color: s.color }}>{s.name}</span>
                                {i < SUPERMARKETS.length - 1 && ' y '}
                            </span>
                        ))}
                        . Descubre dónde comprar más barato.
                    </p>

                    {/* Search bar */}
                    <div ref={searchRef} className="max-w-xl mx-auto relative">
                        <div className="relative">
                            <span className="absolute left-5 top-1/2 -translate-y-1/2 material-symbols-outlined text-xl text-[var(--color-text-muted)] pointer-events-none">search</span>
                            <input
                                type="search"
                                value={searchInput}
                                onChange={e => handleSearchChange(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                placeholder="Busca un producto... (ej. leche, pollo, aceite)"
                                className="w-full pl-13 pr-28 py-4 rounded-2xl bg-[var(--color-bg-card)] border-2 border-[var(--color-border)] text-base text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/10 shadow-lg transition-all"
                                style={{ fontFamily: 'var(--font-body)', paddingLeft: '3.25rem' }}
                                autoComplete="off"
                            />
                            <button
                                onClick={() => handleSearch()}
                                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:scale-[1.03] active:scale-[0.97] transition-transform"
                                style={{ background: 'var(--gradient-hero)' }}
                            >
                                Comparar
                            </button>
                        </div>

                        {/* Autocomplete dropdown */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-2xl shadow-xl overflow-hidden z-50">
                                {suggestions.map((p, i) => (
                                    <button
                                        key={`${p.supermarket}-${p.id}`}
                                        onClick={() => { setShowSuggestions(false); handleSearch(p.product_name); }}
                                        className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-primary-light)] transition-colors ${i > 0 ? 'border-t border-[var(--color-border)]' : ''}`}
                                    >
                                        <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg">search</span>
                                        <span className="flex-1 text-sm text-[var(--color-text-primary)] truncate">{p.product_name}</span>
                                        <span
                                            className="text-[9px] font-bold text-white px-1.5 py-0.5 rounded"
                                            style={{ backgroundColor: p.supermarket === 'MERCADONA' ? '#00A650' : '#E8611A' }}
                                        >
                                            {p.supermarket === 'MERCADONA' ? 'Mercadona' : 'Consum'}
                                        </span>
                                        <span className="text-sm font-bold text-[var(--color-text-primary)]">{Number(p.price).toFixed(2)}€</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Social proof badges */}
                    <div className="flex items-center justify-center gap-6 mt-8 text-sm text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
                            <span><strong className="text-[var(--color-text-primary)]">13,000+</strong> productos</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>update</span>
                            <span>Precios actualizados</span>
                        </div>
                        <div className="flex items-center gap-1.5 hidden sm:flex">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>money_off</span>
                            <span>100% gratis</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Cesta básica comparison */}
            <section className="py-16 bg-[var(--color-bg-surface)]">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-3"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Mercadona vs Consum
                    </h2>
                    <p className="text-center text-[var(--color-text-secondary)] mb-10 max-w-lg mx-auto">
                        Comparamos los 20 productos básicos más comprados. ¿Quién gana?
                    </p>

                    <div className="max-w-lg mx-auto">
                        <BasketCompare />
                    </div>

                    <div className="text-center mt-8">
                        <Link
                            to="/comparar"
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[var(--color-primary)] text-sm font-bold border-2 border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all"
                        >
                            Ver todos los productos
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                    </div>
                </div>
            </section>

            {/* Rankings — mayores diferencias de precio */}
            {rankings?.items?.length > 0 && (
                <section className="py-16">
                    <div className="max-w-5xl mx-auto px-5">
                        <h2
                            className="text-2xl sm:text-3xl text-center mb-3"
                            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                        >
                            Donde más se nota la diferencia
                        </h2>
                        <p className="text-center text-[var(--color-text-secondary)] mb-10 max-w-lg mx-auto">
                            Productos con mayor diferencia de precio entre supermercados
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {rankings.items.map((item, i) => {
                                const cheaperColor = item.cheaper === 'MERCADONA' ? '#00A650' : '#E8611A';
                                const cheaperLabel = item.cheaper === 'MERCADONA' ? 'Mercadona' : 'Consum';
                                return (
                                    <div key={i} className="glass-panel rounded-2xl p-4 hover:shadow-[var(--shadow-elevated)] transition-shadow">
                                        <p className="text-sm font-semibold text-[var(--color-text-primary)] capitalize mb-3 leading-tight" style={{ fontFamily: 'var(--font-body)' }}>
                                            {item.concept || item.name}
                                        </p>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="flex-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#00A650' }}>Mercadona</p>
                                                <p className="text-sm font-mono font-bold text-[var(--color-text-primary)] tabular-nums">
                                                    {item.mercadona?.price != null ? `${item.mercadona.price.toFixed(2)}€` : '—'}
                                                </p>
                                            </div>
                                            <span className="text-[var(--color-text-muted)] text-xs">vs</span>
                                            <div className="flex-1 text-right">
                                                <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: '#E8611A' }}>Consum</p>
                                                <p className="text-sm font-mono font-bold text-[var(--color-text-primary)] tabular-nums">
                                                    {item.consum?.price != null ? `${item.consum.price.toFixed(2)}€` : '—'}
                                                </p>
                                            </div>
                                        </div>
                                        {item.savings > 0 && (
                                            <div
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold"
                                                style={{ backgroundColor: `${cheaperColor}15`, color: cheaperColor }}
                                            >
                                                <span className="material-symbols-outlined text-xs">savings</span>
                                                Ahorras {item.savings.toFixed(2)}€ en {cheaperLabel}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="text-center mt-8">
                            <Link
                                to="/comparar"
                                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary)] hover:underline"
                            >
                                Ver más comparaciones
                                <span className="material-symbols-outlined text-base">arrow_forward</span>
                            </Link>
                        </div>
                    </div>
                </section>
            )}

            {/* How it works */}
            <section className="py-16 bg-[var(--color-bg-surface)]">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-12"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Cómo funciona
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {[
                            { icon: 'search', title: 'Busca un producto', desc: 'Escribe lo que necesitas comprar' },
                            { icon: 'compare_arrows', title: 'Compara precios', desc: 'Ve el precio en Mercadona y Consum' },
                            { icon: 'savings', title: 'Ahorra dinero', desc: 'Elige donde te sale más barato' },
                        ].map((step, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-6 text-center relative">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--gradient-hero)' }}>
                                    {i + 1}
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mt-2 mb-4">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{step.icon}</span>
                                </div>
                                <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{step.title}</h3>
                                <p className="text-sm text-[var(--color-text-secondary)]">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Also: meal planner */}
            <section className="py-16">
                <div className="max-w-2xl mx-auto px-5 text-center">
                    <div className="glass-panel rounded-3xl p-8 sm:p-12" style={{ background: 'var(--gradient-hero-soft)' }}>
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-5">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
                        </div>
                        <h2
                            className="text-2xl sm:text-3xl text-[var(--color-text-primary)] mb-3"
                            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                        >
                            ¿También necesitas un menú semanal?
                        </h2>
                        <p className="text-[var(--color-text-secondary)] mb-6">
                            Genera un menú personalizado de 7 días con lista de compra y precios reales. 260+ recetas, totalmente gratis.
                        </p>
                        <button
                            onClick={() => navigate('/planificar')}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white text-lg font-bold shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-transform"
                            style={{ background: 'var(--gradient-hero)', boxShadow: '0 6px 24px rgba(45, 106, 79, 0.25)' }}
                        >
                            <span className="material-symbols-outlined text-xl">auto_awesome</span>
                            Planificar menú gratis
                        </button>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-[var(--color-border)] py-8">
                <div className="max-w-5xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[var(--color-text-muted)]">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-hero)' }}>
                            <span className="text-white text-[8px] font-extrabold">{BRAND.initials}</span>
                        </div>
                        <span>{BRAND.name} v{BRAND.version}</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link to="/recetas" className="hover:text-[var(--color-primary)] transition-colors">Recetas</Link>
                        <Link to="/privacidad" className="hover:text-[var(--color-primary)] transition-colors">Privacidad</Link>
                        <Link to="/login" className="hover:text-[var(--color-primary)] transition-colors">Iniciar sesión</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
