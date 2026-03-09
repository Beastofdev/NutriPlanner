import { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Register() {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        fullName: ''
    });
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    // Validación de contraseña en tiempo real
    const passwordValidation = useMemo(() => {
        const pwd = formData.password;
        return {
            minLength: pwd.length >= 8,
            hasUppercase: /[A-Z]/.test(pwd),
            hasNumber: /[0-9]/.test(pwd),
            isValid: pwd.length >= 8 && /[A-Z]/.test(pwd) && /[0-9]/.test(pwd)
        };
    }, [formData.password]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        // Validación client-side antes de enviar al backend
        if (!passwordValidation.isValid) {
            setError('La contraseña debe tener mínimo 8 caracteres, 1 mayúscula y 1 número');
            return;
        }

        if (formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        setIsLoading(true);
        try {
            await register(formData.email, formData.password, formData.fullName);
            navigate('/app?new=true');
        } catch (err) {
            setError(err.message || 'Error al registrarse');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--color-bg-page)] font-sans text-[var(--color-text-primary)]">
            {/* LEFT COLUMN: VISUAL (desktop only) */}
            <div className="hidden lg:flex flex-col justify-center items-center relative overflow-hidden p-12"
                style={{ background: 'linear-gradient(160deg, #5D4037 0%, #3E2723 40%, #D27D59 100%)' }}
            >
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(210,125,89,0.2) 0%, transparent 50%)' }}></div>
                <div className="relative z-10 text-center max-w-lg">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-8 shadow-xl" style={{ background: 'var(--gradient-hero)' }}>
                        <span className="text-white text-3xl font-extrabold" style={{ fontFamily: "var(--font-body)" }}>NC</span>
                    </div>
                    <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight">
                        Empieza a planificar tus comidas
                    </h1>
                    <p className="text-base text-white/70">
                        Crea tu cuenta y genera tu primer menú semanal en 30 segundos.
                    </p>
                </div>
            </div>

            {/* RIGHT COLUMN: FORM */}
            <div className="flex items-center justify-center p-6 lg:p-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[var(--color-primary)]/10 rounded-full blur-[120px] -z-0 pointer-events-none lg:hidden"></div>
                <div className="w-full max-w-md space-y-8 relative z-10">
                <div className="flex justify-between items-center mb-2">
                    <button onClick={() => navigate('/login')} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1 text-sm font-medium"><span className="material-symbols-outlined text-base">arrow_back</span> Volver</button>
                    <span className="text-[var(--color-primary)] font-bold tracking-widest text-xs uppercase lg:hidden">NutriPlanner</span>
                </div>
                <div className="text-center lg:text-left mb-2">
                    <h1 className="text-3xl font-extrabold text-[var(--color-text-primary)] mb-2">Crea tu cuenta</h1>
                    <p className="text-[var(--color-text-muted)]">Comienza tu viaje hacia una nutrición inteligente.</p>
                </div>
                {error && <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2"><span className="material-symbols-outlined text-base">warning</span> {error}</div>}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="fullName" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Nombre completo</label>
                        <input id="fullName" type="text" name="fullName" autoComplete="name" required className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] outline-none placeholder-[var(--color-text-muted)]" placeholder="Tu nombre" value={formData.fullName} onChange={handleChange} />
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Correo electrónico</label>
                        <input id="email" type="email" name="email" autoComplete="email" required className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] outline-none placeholder-[var(--color-text-muted)]" placeholder="ejemplo@correo.com" value={formData.email} onChange={handleChange} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="password" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Contraseña</label>
                            <input id="password" type="password" name="password" autoComplete="new-password" required className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] outline-none" value={formData.password} onChange={handleChange} />
                        </div>
                        <div>
                            <label htmlFor="confirmPassword" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Confirmar</label>
                            <input id="confirmPassword" type="password" name="confirmPassword" autoComplete="new-password" required className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] outline-none" value={formData.confirmPassword} onChange={handleChange} />
                        </div>
                    </div>
                    {/* Indicadores de requisitos de contraseña */}
                    {formData.password && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            <span className={`text-xs px-2 py-1 rounded-full transition-colors ${passwordValidation.minLength ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'}`}>
                                {passwordValidation.minLength ? '✓' : '○'} 8+ caracteres
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full transition-colors ${passwordValidation.hasUppercase ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'}`}>
                                {passwordValidation.hasUppercase ? '✓' : '○'} 1 mayúscula
                            </span>
                            <span className={`text-xs px-2 py-1 rounded-full transition-colors ${passwordValidation.hasNumber ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'}`}>
                                {passwordValidation.hasNumber ? '✓' : '○'} 1 número
                            </span>
                        </div>
                    )}
                    <button type="submit" disabled={isLoading}
                        className="w-full text-white text-lg font-bold py-4 rounded-2xl mt-4 disabled:opacity-50 transition-all hover:-translate-y-0.5"
                        style={{ background: 'var(--gradient-hero)', boxShadow: '0 4px 16px rgba(232, 97, 26, 0.3)' }}
                    >
                        {isLoading ? 'Creando cuenta...' : 'Registrarse'}
                    </button>
                </form>
                <div className="mt-8 text-center">
                    <p className="text-sm text-[var(--color-text-muted)]">¿Ya tienes cuenta? <Link to="/login" className="text-[var(--color-primary)] font-bold">Inicia sesión</Link></p>
                </div>
                </div>{/* /max-w-md */}
            </div>{/* /RIGHT COLUMN */}
        </div>
    );
}
