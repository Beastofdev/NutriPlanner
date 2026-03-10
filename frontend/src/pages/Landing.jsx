import { useNavigate, Link } from 'react-router-dom';
import { BRAND } from '../config/brand';

const SUPERMARKETS = [
    { name: 'Mercadona', color: '#009234' },
    { name: 'Consum', color: '#E8611A' },
];

const STEPS = [
    { icon: 'storefront', title: 'Elige tu super', desc: 'Mercadona, Consum o ambos' },
    { icon: 'auto_awesome', title: 'Genera tu menu', desc: '7 dias, 3 comidas, 30 segundos' },
    { icon: 'shopping_cart', title: 'Tu lista de compra', desc: 'Con precios reales y totales' },
];

const FEATURES = [
    { icon: 'restaurant_menu', title: '260+ recetas', desc: 'Verificadas con productos de supermercado' },
    { icon: 'savings', title: 'Compara precios', desc: 'Ve que super te sale mas barato' },
    { icon: 'monitor_weight', title: 'Macros y calorias', desc: 'Ajustado a tu objetivo nutricional' },
    { icon: 'bolt', title: 'Instantaneo', desc: 'Menu completo en menos de 30 segundos' },
];

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="text-[var(--color-text-primary)]">

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 30% 20%, var(--color-primary) 0%, transparent 50%), radial-gradient(circle at 70% 80%, var(--color-secondary) 0%, transparent 50%)' }} />
                <div className="max-w-4xl mx-auto px-5 pt-16 pb-20 text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)] text-xs font-bold uppercase tracking-wider mb-6">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        Precios reales de supermercado
                    </div>

                    <h1
                        className="text-4xl sm:text-5xl lg:text-6xl leading-tight mb-5"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Planifica tu menu semanal
                        <br />
                        <span className="gradient-hero-text">con precios reales</span>
                    </h1>

                    <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-8 leading-relaxed">
                        Genera menus personalizados con lista de compra y precios de
                        {' '}
                        {SUPERMARKETS.map((s, i) => (
                            <span key={s.name}>
                                <span className="font-bold" style={{ color: s.color }}>{s.name}</span>
                                {i < SUPERMARKETS.length - 1 && ' y '}
                            </span>
                        ))}
                        . Todo automatico, todo gratis.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button
                            onClick={() => navigate('/planificar')}
                            className="flex items-center gap-2 px-8 py-4 rounded-full text-white text-lg font-bold shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-transform"
                            style={{ background: 'var(--gradient-hero)', boxShadow: '0 6px 24px rgba(45, 106, 79, 0.25)' }}
                        >
                            <span className="material-symbols-outlined text-xl">auto_awesome</span>
                            Empezar gratis
                        </button>
                        <Link
                            to="/recetas"
                            className="flex items-center gap-2 px-6 py-4 rounded-full text-[var(--color-text-secondary)] text-base font-semibold hover:text-[var(--color-primary)] transition-colors"
                        >
                            Ver recetas
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                    </div>

                    {/* Social proof */}
                    <div className="flex items-center justify-center gap-6 mt-10 text-sm text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
                            <span><strong className="text-[var(--color-text-primary)]">13,000+</strong> productos</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>menu_book</span>
                            <span><strong className="text-[var(--color-text-primary)]">260+</strong> recetas</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* How it works */}
            <section className="py-16 bg-[var(--color-bg-surface)]">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-12"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Como funciona
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {STEPS.map((step, i) => (
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

            {/* Features */}
            <section className="py-16">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-12"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Todo lo que necesitas
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((f, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-5 hover:shadow-[var(--shadow-elevated)] transition-shadow">
                                <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{f.icon}</span>
                                </div>
                                <h3 className="text-sm font-bold text-[var(--color-text-primary)] mb-1">{f.title}</h3>
                                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Bottom CTA */}
            <section className="py-16">
                <div className="max-w-2xl mx-auto px-5 text-center">
                    <div className="glass-panel rounded-3xl p-8 sm:p-12" style={{ background: 'var(--gradient-hero-soft)' }}>
                        <h2
                            className="text-2xl sm:text-3xl text-[var(--color-text-primary)] mb-3"
                            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                        >
                            Planifica tu semana ahora
                        </h2>
                        <p className="text-[var(--color-text-secondary)] mb-6">
                            Sin registro. Sin pagos. Menu + lista de compra en 30 segundos.
                        </p>
                        <button
                            onClick={() => navigate('/planificar')}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white text-lg font-bold shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-transform"
                            style={{ background: 'var(--gradient-hero)', boxShadow: '0 6px 24px rgba(45, 106, 79, 0.25)' }}
                        >
                            <span className="material-symbols-outlined text-xl">auto_awesome</span>
                            Empezar gratis
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
                        <Link to="/privacidad" className="hover:text-[var(--color-primary)] transition-colors">Privacidad</Link>
                        <Link to="/login" className="hover:text-[var(--color-primary)] transition-colors">Iniciar sesion</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
