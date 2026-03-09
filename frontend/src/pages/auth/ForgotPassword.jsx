import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API_URL } from '../../services/api';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            if (res.status === 429) {
                setError('Demasiadas solicitudes. Intenta de nuevo en 15 minutos.');
            } else {
                setSent(true);
            }
        } catch {
            setError('Error de conexion. Intenta de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-page)] p-6 font-sans text-[var(--color-text-primary)]">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 shadow-lg" style={{ background: 'var(--gradient-hero)' }}>
                        <span className="material-symbols-outlined text-white text-2xl">lock_reset</span>
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Recuperar contraseña</h2>
                    <p className="text-[var(--color-text-muted)] text-sm">
                        {sent ? 'Revisa tu bandeja de entrada' : 'Introduce tu email y te enviaremos un enlace'}
                    </p>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">warning</span> {error}
                    </div>
                )}

                {sent ? (
                    <div className="space-y-6">
                        <div className="p-6 glass-panel rounded-2xl text-center space-y-3">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-4xl">mark_email_read</span>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Si <strong>{email}</strong> esta registrado, recibiras un email con un enlace para crear una nueva contraseña.
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                No lo ves? Revisa la carpeta de spam.
                            </p>
                        </div>
                        <Link
                            to="/login"
                            className="block w-full text-center py-3 text-[var(--color-primary)] font-bold text-sm hover:underline"
                        >
                            Volver a Iniciar Sesion
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="email" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                                Correo electronico
                            </label>
                            <input
                                id="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all placeholder-[var(--color-text-muted)]"
                                placeholder="ejemplo@correo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full text-white text-lg font-bold py-4 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            {isLoading ? 'Enviando...' : 'Enviar enlace'}
                        </button>
                    </form>
                )}

                <div className="text-center text-sm text-[var(--color-text-muted)]">
                    <Link to="/login" className="text-[var(--color-primary)] font-bold hover:underline">Volver al login</Link>
                </div>
            </div>
        </div>
    );
}
