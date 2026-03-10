import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { BRAND } from '../../config/brand';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await login(email, password);
            navigate('/app');
        } catch (err) {
            setError(err.message || 'Credenciales incorrectas');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--color-bg-page)] font-sans text-[var(--color-text-primary)]">
            {/* LEFT COLUMN: VISUAL */}
            <div className="hidden lg:flex flex-col justify-center items-center relative overflow-hidden p-12"
                style={{ background: 'linear-gradient(160deg, #5D4037 0%, #3E2723 40%, #D27D59 100%)' }}
            >
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, rgba(255,255,255,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(210,125,89,0.2) 0%, transparent 40%)' }}></div>
                <div className="relative z-10 text-center max-w-lg">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-8 shadow-xl" style={{ background: 'var(--gradient-hero)' }}>
                        <span className="text-white text-3xl font-extrabold" style={{ fontFamily: "var(--font-body)" }}>{BRAND.initials}</span>
                    </div>
                    <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight">
                        {BRAND.tagline}
                    </h1>
                    <p className="text-base text-white/70 mb-10">
                        Menús semanales con productos reales de supermercado
                    </p>
                    <div className="space-y-4 text-left max-w-sm mx-auto">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-white text-xl">storefront</span>
                            </div>
                            <p className="text-white/90 text-sm font-medium">Precios reales de supermercado actualizados</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-white text-xl">restaurant_menu</span>
                            </div>
                            <p className="text-white/90 text-sm font-medium">260+ recetas con ingredientes de supermercado</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-white text-xl">shopping_cart</span>
                            </div>
                            <p className="text-white/90 text-sm font-medium">Lista de la compra instantánea</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: FORM */}
            <div className="flex items-center justify-center p-6 lg:p-12">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left">
                        <h2 className="text-3xl font-bold text-[var(--color-text-primary)] mb-2">Bienvenido de nuevo</h2>
                        <p className="text-[var(--color-text-muted)]">Inicia sesión para gestionar tu dieta inteligente</p>
                    </div>

                    {error && <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2"><span className="material-symbols-outlined text-base">warning</span> {error}</div>}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Correo electrónico</label>
                            <input
                                id="email"
                                type="email"
                                name="email"
                                autoComplete="email"
                                required
                                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all placeholder-[var(--color-text-muted)]"
                                placeholder="ejemplo@correo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Contraseña</label>
                            <input
                                id="password"
                                type="password"
                                name="password"
                                autoComplete="current-password"
                                required
                                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all placeholder-[var(--color-text-muted)]"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <div className="text-right mt-2">
                                <Link to="/forgot-password" className="text-xs text-[var(--color-primary)] hover:underline font-medium">¿Olvidaste tu contraseña?</Link>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full text-white text-lg font-bold py-4 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'var(--gradient-hero)', boxShadow: '0 4px 16px rgba(232, 97, 26, 0.3)' }}
                        >
                            {isLoading ? 'Iniciando...' : 'Iniciar Sesión'}
                        </button>
                    </form>

                    <div className="w-full text-center mt-6 space-y-3">
                        <Link
                            to="/planificar"
                            className="text-[var(--color-primary)] text-sm font-semibold hover:underline transition-colors flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-base">auto_awesome</span>
                            Continuar sin cuenta
                        </Link>
                    </div>

                    <div className="text-center text-sm text-[var(--color-text-muted)] mt-8">
                        ¿No tienes una cuenta? <Link to="/register" className="text-[var(--color-primary)] font-bold hover:text-[var(--color-primary-dark)] transition-colors">Regístrate</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
