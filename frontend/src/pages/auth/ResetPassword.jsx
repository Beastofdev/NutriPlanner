import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { API_URL } from '../../services/api';

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (password !== confirm) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (!token) {
            setError('Enlace invalido. Solicita uno nuevo desde el login.');
            return;
        }

        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.detail || 'Error al cambiar la contraseña');
            } else {
                setDone(true);
            }
        } catch {
            setError('Error de conexion. Intenta de nuevo.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-page)] p-6 font-sans text-[var(--color-text-primary)]">
                <div className="w-full max-w-md text-center space-y-6">
                    <span className="material-symbols-outlined text-[var(--color-text-muted)] text-5xl">link_off</span>
                    <p className="text-[var(--color-text-secondary)]">Enlace invalido o expirado.</p>
                    <Link to="/forgot-password" className="inline-block px-6 py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl">
                        Solicitar nuevo enlace
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-page)] p-6 font-sans text-[var(--color-text-primary)]">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 shadow-lg" style={{ background: 'var(--gradient-hero)' }}>
                        <span className="material-symbols-outlined text-white text-2xl">password</span>
                    </div>
                    <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
                        {done ? 'Contraseña actualizada' : 'Nueva contraseña'}
                    </h2>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-sm flex items-center gap-2">
                        <span className="material-symbols-outlined text-base">warning</span> {error}
                    </div>
                )}

                {done ? (
                    <div className="space-y-6">
                        <div className="p-6 glass-panel rounded-2xl text-center space-y-3">
                            <span className="material-symbols-outlined text-[var(--color-secondary)] text-4xl">check_circle</span>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                                Tu contraseña ha sido actualizada correctamente.
                            </p>
                        </div>
                        <Link
                            to="/login"
                            className="block w-full text-center py-4 text-white font-bold rounded-2xl shadow-lg"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            Iniciar Sesion
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="password" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                                Nueva contraseña
                            </label>
                            <input
                                id="password"
                                type="password"
                                required
                                autoComplete="new-password"
                                minLength={8}
                                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all placeholder-[var(--color-text-muted)]"
                                placeholder="Min. 8 caracteres, 1 mayuscula, 1 numero"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="confirm" className="block text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                                Confirmar contraseña
                            </label>
                            <input
                                id="confirm"
                                type="password"
                                required
                                autoComplete="new-password"
                                className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-2xl px-5 py-4 focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent outline-none transition-all placeholder-[var(--color-text-muted)]"
                                placeholder="Repite la contraseña"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full text-white text-lg font-bold py-4 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50"
                            style={{ background: 'var(--gradient-hero)' }}
                        >
                            {isLoading ? 'Guardando...' : 'Guardar nueva contraseña'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
