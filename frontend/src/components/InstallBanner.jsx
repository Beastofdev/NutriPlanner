import { useState, useEffect } from 'react';
import { track } from '../services/analytics';

let deferredPrompt = null;

// Capture the beforeinstallprompt event globally
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        window.dispatchEvent(new Event('pwa-installable'));
    });
}

export function canInstallPWA() {
    return deferredPrompt !== null;
}

export async function triggerInstall() {
    if (!deferredPrompt) return false;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
}

export default function InstallBanner() {
    const [show, setShow] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
        // Check if already installed (standalone mode)
        const standalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
        setIsStandalone(standalone);
        if (standalone) return;

        // Check if dismissed recently (7 days)
        const dismissedAt = localStorage.getItem('nutriplanner_install_dismissed');
        if (dismissedAt) {
            const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
            if (daysSince < 7) return;
        }

        // Track visit count (no longer gated — banner shows from first visit)
        const visits = parseInt(localStorage.getItem('nutriplanner_visit_count') || '0') + 1;
        localStorage.setItem('nutriplanner_visit_count', String(visits));

        // Detect iOS
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        setIsIOS(ios);

        if (ios) {
            // iOS doesn't support beforeinstallprompt, show guide
            setShow(true);
            return;
        }

        // Android/Desktop: wait for beforeinstallprompt
        if (deferredPrompt) {
            setShow(true);
        } else {
            const handler = () => setShow(true);
            window.addEventListener('pwa-installable', handler);
            return () => window.removeEventListener('pwa-installable', handler);
        }
    }, []);

    const dismiss = () => {
        setShow(false);
        localStorage.setItem('nutriplanner_install_dismissed', String(Date.now()));
        track('install_banner_dismissed');
    };

    const handleInstall = async () => {
        if (isIOS) {
            // Can't programmatically install on iOS, just dismiss
            dismiss();
            return;
        }
        const accepted = await triggerInstall();
        track('install_banner_action', { accepted });
        setShow(false);
    };

    if (!show || isStandalone) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-[60] max-w-md mx-auto animate-slide-up">
            <div className="bg-[var(--color-bg-card)] rounded-2xl shadow-2xl border border-[var(--color-border)] p-4 relative overflow-hidden">
                {/* Accent gradient */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-emerald-400"></div>

                <button
                    onClick={dismiss}
                    className="absolute top-3 right-3 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>

                <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-xl bg-[var(--color-tint-teal)] flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl">install_mobile</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[var(--color-text-primary)] font-bold text-sm">Instalar NutriPlanner</p>
                        {isIOS ? (
                            <p className="text-[var(--color-text-muted)] text-xs mt-0.5 leading-relaxed">
                                Pulsa <span className="inline-flex items-center"><span className="material-symbols-outlined text-xs align-middle">ios_share</span></span> y luego <strong>"Añadir a pantalla de inicio"</strong>
                            </p>
                        ) : (
                            <p className="text-[var(--color-text-muted)] text-xs mt-0.5">
                                Acceso rapido desde tu pantalla de inicio
                            </p>
                        )}
                    </div>
                </div>

                {!isIOS && (
                    <button
                        onClick={handleInstall}
                        className="w-full mt-3 py-2.5 bg-[var(--color-primary)] text-white font-bold text-sm rounded-xl hover:bg-[var(--color-primary-dark)] transition-colors"
                    >
                        Instalar
                    </button>
                )}
            </div>
        </div>
    );
}
