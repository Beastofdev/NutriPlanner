import { useState, useEffect } from 'react';

const CONSENT_KEY = 'nutriplanner_consent';

export function getConsent() {
    return localStorage.getItem(CONSENT_KEY); // 'all' | 'essential' | null
}

export default function ConsentBanner({ onConsent }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!getConsent()) setVisible(true);
    }, []);

    if (!visible) return null;

    const handleAccept = (level) => {
        localStorage.setItem(CONSENT_KEY, level);
        setVisible(false);
        if (onConsent) onConsent(level);
    };

    return (
        <div className="fixed bottom-0 inset-x-0 z-[9999] p-4 pb-safe">
            <div className="max-w-lg mx-auto glass-panel rounded-2xl p-5 shadow-[var(--shadow-elevated)] border border-[var(--color-border)]">
                <p className="text-sm text-[var(--color-text-primary)] font-medium mb-1">Usamos cookies</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-4 leading-relaxed">
                    Utilizamos cookies propias y de terceros para analizar el uso de la app y mejorar tu experiencia.
                    Puedes aceptar todas o solo las esenciales.{' '}
                    <a href="/privacidad" className="text-[var(--color-primary)] underline">Politica de Privacidad</a>
                </p>
                <div className="flex gap-2">
                    <button
                        onClick={() => handleAccept('all')}
                        className="flex-1 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
                    >
                        Aceptar todas
                    </button>
                    <button
                        onClick={() => handleAccept('essential')}
                        className="flex-1 py-2.5 bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] rounded-xl text-sm font-medium border border-[var(--color-border)] hover:bg-[var(--color-bg-card)] transition-colors"
                    >
                        Solo esenciales
                    </button>
                </div>
            </div>
        </div>
    );
}
