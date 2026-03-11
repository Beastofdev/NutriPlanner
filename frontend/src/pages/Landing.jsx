import { useNavigate, Link } from 'react-router-dom';
import { BRAND } from '../config/brand';

const SUPERMARKETS = [
    { name: 'Mercadona', color: '#00A650' },
    { name: 'Consum', color: '#E8611A' },
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
                        Come bien toda la semana
                        <br />
                        <span className="gradient-hero-text">por menos de 25€</span>
                    </h1>

                    <p className="text-lg sm:text-xl text-[var(--color-text-secondary)] max-w-2xl mx-auto mb-8 leading-relaxed">
                        Genera tu menu semanal personalizado con lista de compra y{' '}
                        <strong className="text-[var(--color-text-primary)]">precios reales</strong> de{' '}
                        {SUPERMARKETS.map((s, i) => (
                            <span key={s.name}>
                                <span className="font-bold" style={{ color: s.color }}>{s.name}</span>
                                {i < SUPERMARKETS.length - 1 && ' y '}
                            </span>
                        ))}
                        . 260+ recetas. 100% gratis.
                    </p>

                    {/* Main CTA */}
                    <button
                        onClick={() => navigate('/planificar')}
                        className="inline-flex items-center gap-2.5 px-10 py-5 rounded-full text-white text-lg font-bold shadow-xl hover:scale-[1.04] active:scale-[0.97] transition-transform"
                        style={{ background: 'var(--gradient-hero)', boxShadow: '0 8px 32px rgba(45, 106, 79, 0.3)' }}
                    >
                        <span className="material-symbols-outlined text-2xl">auto_awesome</span>
                        Planificar mi menu gratis
                    </button>

                    {/* Social proof */}
                    <div className="flex items-center justify-center gap-6 mt-8 text-sm text-[var(--color-text-muted)]">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>restaurant_menu</span>
                            <span><strong className="text-[var(--color-text-primary)]">260+</strong> recetas</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>shopping_cart</span>
                            <span>Precios reales</span>
                        </div>
                        <div className="flex items-center gap-1.5 hidden sm:flex">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-base" style={{ fontVariationSettings: "'FILL' 1" }}>money_off</span>
                            <span>100% gratis</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* What you get */}
            <section className="py-16 bg-[var(--color-bg-surface)]">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-3"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Tu semana resuelta en 30 segundos
                    </h2>
                    <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-lg mx-auto">
                        Dinos tu supermercado, presupuesto y preferencias. Nosotros hacemos el resto.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {[
                            { icon: 'calendar_month', title: 'Menu de 7 dias', desc: '21 comidas equilibradas, variadas y adaptadas a ti. Sin repetir recetas.' },
                            { icon: 'receipt_long', title: 'Lista de compra exacta', desc: 'Solo lo que necesitas. Sin desperdiciar comida ni dinero.' },
                            { icon: 'euro', title: 'Precios reales', desc: 'Sabes exactamente cuanto te costara en Mercadona o Consum.' },
                        ].map((item, i) => (
                            <div key={i} className="glass-panel rounded-2xl p-6 text-center relative">
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: 'var(--gradient-hero)' }}>
                                    {i + 1}
                                </div>
                                <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mt-2 mb-4">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{item.icon}</span>
                                </div>
                                <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1" style={{ fontFamily: 'var(--font-display)' }}>{item.title}</h3>
                                <p className="text-sm text-[var(--color-text-secondary)]">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Budget examples */}
            <section className="py-16">
                <div className="max-w-5xl mx-auto px-5">
                    <h2
                        className="text-2xl sm:text-3xl text-center mb-3"
                        style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                    >
                        Come sano sin arruinarte
                    </h2>
                    <p className="text-center text-[var(--color-text-secondary)] mb-10 max-w-lg mx-auto">
                        Menus completos con precios reales. Tu eliges cuanto gastar.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
                        {[
                            { budget: '~20€', label: 'Muy economico', desc: '7 dias, 3 comidas', color: 'var(--color-primary)', meals: 'Lentejas, tortilla, ensaladas, pasta...' },
                            { budget: '~30€', label: 'Economico', desc: '7 dias, 3 comidas', color: 'var(--color-secondary)', meals: 'Pollo, pescado, verduras variadas...' },
                            { budget: '~45€', label: 'Normal', desc: '7 dias, 3 comidas', color: '#8B5CF6', meals: 'Salmon, ternera, recetas elaboradas...' },
                        ].map((tier, i) => (
                            <div
                                key={i}
                                className="glass-panel rounded-2xl p-6 text-center hover:shadow-[var(--shadow-elevated)] transition-shadow cursor-pointer"
                                onClick={() => navigate('/planificar')}
                            >
                                <p className="text-3xl font-bold mb-1" style={{ color: tier.color, fontFamily: 'var(--font-display)' }}>
                                    {tier.budget}
                                </p>
                                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">{tier.label}</p>
                                <p className="text-xs text-[var(--color-text-muted)] mb-3">{tier.desc}/persona</p>
                                <p className="text-xs text-[var(--color-text-secondary)] italic">{tier.meals}</p>
                            </div>
                        ))}
                    </div>

                    <div className="text-center mt-8">
                        <button
                            onClick={() => navigate('/planificar')}
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-transform"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            <span className="material-symbols-outlined text-lg">auto_awesome</span>
                            Elegir mi presupuesto
                        </button>
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
                        Asi de facil
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
                        {[
                            { icon: 'storefront', title: 'Elige super', desc: 'Mercadona o Consum' },
                            { icon: 'savings', title: 'Pon tu presupuesto', desc: '20€, 30€ o mas' },
                            { icon: 'auto_awesome', title: 'Generamos tu menu', desc: '7 dias, 21 comidas' },
                            { icon: 'shopping_cart', title: 'Ve a comprar', desc: 'Con lista y precios' },
                        ].map((step, i) => (
                            <div key={i} className="flex flex-col items-center text-center gap-2">
                                <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{step.icon}</span>
                                </div>
                                <h3 className="text-sm font-bold text-[var(--color-text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>{step.title}</h3>
                                <p className="text-xs text-[var(--color-text-secondary)]">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Also: comparador */}
            <section className="py-16">
                <div className="max-w-2xl mx-auto px-5 text-center">
                    <div className="glass-panel rounded-3xl p-8 sm:p-12">
                        <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mx-auto mb-5">
                            <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>compare_arrows</span>
                        </div>
                        <h2
                            className="text-2xl sm:text-3xl text-[var(--color-text-primary)] mb-3"
                            style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}
                        >
                            Tambien puedes comparar precios
                        </h2>
                        <p className="text-[var(--color-text-secondary)] mb-6">
                            Busca cualquier producto y compara su precio entre Mercadona y Consum. 13,000+ productos con precios actualizados.
                        </p>
                        <button
                            onClick={() => navigate('/comparar')}
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[var(--color-primary)] text-sm font-bold border-2 border-[var(--color-primary)] hover:bg-[var(--color-primary)] hover:text-white transition-all"
                        >
                            <span className="material-symbols-outlined text-base">compare_arrows</span>
                            Comparar precios
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
                        <Link to="/comparar" className="hover:text-[var(--color-primary)] transition-colors">Comparar precios</Link>
                        <Link to="/login" className="hover:text-[var(--color-primary)] transition-colors">Iniciar sesion</Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}
