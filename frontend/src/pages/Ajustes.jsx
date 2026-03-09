import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { scheduleLocalNotifications, cancelLocalNotifications } from '../utils/notifications';
import { canInstallPWA, triggerInstall } from '../components/InstallBanner';
import { track } from '../services/analytics';
import { api } from '../services/api';

export default function Ajustes() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { isDark, toggleTheme } = useTheme();

    // Persisted notification preferences
    const [notifications, setNotifications] = useState(() => {
        try { return JSON.parse(localStorage.getItem('nutriplanner_notif_enabled') || 'false'); } catch { return false; }
    });
    const [menuAlerts, setMenuAlerts] = useState(() => {
        try { return JSON.parse(localStorage.getItem('nutriplanner_notif_meals') || 'true'); } catch { return true; }
    });
    const [installable, setInstallable] = useState(canInstallPWA());
    const isStandalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
    const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const [showInstallGuide, setShowInstallGuide] = useState(false);
    const [planHistory, setPlanHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [restoringId, setRestoringId] = useState(null);

    useEffect(() => {
        if (user) {
            api.getPlanHistory().then(data => setPlanHistory(data.plans || [])).catch(() => {});
        }
    }, [user]);

    const handleRestorePlan = async (planId) => {
        setRestoringId(planId);
        try {
            const data = await api.restorePlan(planId);
            if (data.plan) {
                localStorage.setItem('nutriplanner_plan', JSON.stringify(data.plan));
                localStorage.setItem('nutriplanner_version', 'v3');
                if (data.wizard_data) localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(data.wizard_data));
                navigate('/app/menu');
            }
        } catch { /* ignore */ }
        setRestoringId(null);
    };

    const handleDeletePlan = async (planId) => {
        try {
            await api.deletePlanHistory(planId);
            setPlanHistory(prev => prev.filter(p => p.id !== planId));
        } catch { /* ignore */ }
    };

    useEffect(() => {
        const handler = () => setInstallable(true);
        window.addEventListener('pwa-installable', handler);
        return () => window.removeEventListener('pwa-installable', handler);
    }, []);

    const handleInstall = async () => {
        // Try native prompt first
        const accepted = await triggerInstall();
        if (accepted) {
            setInstallable(false);
            return;
        }
        // No native prompt available — show manual guide
        setShowInstallGuide(true);
        track('install_guide_shown', {});
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header Sticky */}
                <div className="sticky top-0 z-10 bg-[var(--color-bg-header)] backdrop-blur-md border-b border-[var(--color-border)]">
                    <div className="flex items-center p-4 pb-2 justify-between">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors"
                        >
                            <span className="material-symbols-outlined text-[var(--color-text-primary)] text-2xl">arrow_back_ios_new</span>
                        </button>
                        <h2 className="text-[var(--color-text-primary)] text-lg leading-tight tracking-tight text-center" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Ajustes</h2>
                        <div className="w-10"></div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 px-4 pb-10 space-y-6 pt-2 overflow-y-auto scrollbar-hide">

                    {/* Profile Snippet */}
                    <div className="flex items-center gap-4 py-2">
                        <div className="relative shrink-0">
                            <div className="h-16 w-16 rounded-full border-2 border-[var(--color-primary)] overflow-hidden bg-[var(--color-bg-muted)]">
                                <img
                                    src={`https://ui-avatars.com/api/?name=${user?.full_name || 'User'}&background=D27D59&color=ffffff&bold=true`}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div className="absolute bottom-0 right-0 h-4 w-4 bg-[var(--color-primary)] rounded-full border-2 border-[var(--color-bg-page)]"></div>
                        </div>
                        <div className="flex flex-col justify-center flex-1">
                            <p className="text-[var(--color-text-primary)] text-xl leading-tight" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{user?.full_name || 'Usuario'}</p>
                            <p className="text-[var(--color-text-muted)] text-sm font-medium">{user?.email || 'email@ejemplo.com'}</p>
                        </div>
                        <div className="w-10"></div>
                    </div>

                    {/* Plan Summary (visible for all users) */}
                    {(() => {
                        try {
                            const plan = JSON.parse(localStorage.getItem('nutriplanner_plan') || '{}');
                            const wizard = JSON.parse(localStorage.getItem('nutriplanner_wizard_data') || '{}');
                            if (plan?.menu?.length > 0 || wizard?.diet) {
                                const dietLabels = { omnivoro: 'Omnivoro', vegano: 'Vegano', vegetariano: 'Vegetariano', sin_gluten: 'Sin Gluten', keto: 'Keto' };
                                return (
                                    <div>
                                        <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu Plan Actual</h3>
                                        <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)] p-4 space-y-2">
                                            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Dias</span><span className="text-[var(--color-text-primary)] font-semibold">{plan?.menu?.length || wizard?.planDays || 7}</span></div>
                                            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Dieta</span><span className="text-[var(--color-text-primary)] font-semibold">{dietLabels[wizard?.diet] || wizard?.diet || 'Omnivoro'}</span></div>
                                            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Calorias</span><span className="text-[var(--color-text-primary)] font-semibold">{wizard?.targetCalories || plan?.total_calorias_dia || '~2000'} kcal</span></div>
                                            <div className="flex justify-between text-sm"><span className="text-[var(--color-text-secondary)]">Nivel</span><span className="text-[var(--color-text-primary)] font-semibold">{{ economico: 'Economico', normal: 'Normal', premium: 'Premium' }[wizard?.economicLevel] || 'Normal'}</span></div>
                                            <button
                                                onClick={() => navigate('/app/dashboard?new=true')}
                                                className="w-full mt-2 py-2 text-[var(--color-primary)] font-bold text-sm rounded-lg border border-[var(--color-primary)]/30 hover:bg-[var(--color-primary-light)] transition-colors"
                                            >
                                                Modificar Plan
                                            </button>
                                        </div>
                                    </div>
                                );
                            }
                        } catch {}
                        return null;
                    })()}

                    {/* Plan History */}
                    {user && planHistory.length > 0 && (
                        <div>
                            <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Planes Anteriores</h3>
                            <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)] divide-y divide-[var(--color-border)]">
                                {planHistory.map(plan => {
                                    const date = plan.created_at ? new Date(plan.created_at) : null;
                                    const dateStr = date ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                                    const days = plan.summary?.days || '?';
                                    const diet = plan.summary?.diet_type || '';
                                    return (
                                        <div key={plan.id} className="p-3 flex items-center gap-3">
                                            <div className="size-9 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
                                                <span className="material-symbols-outlined text-[var(--color-primary)] text-base">calendar_month</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{plan.label || `Menu de ${days} dias`}</p>
                                                <p className="text-[10px] text-[var(--color-text-muted)]">{dateStr}{diet ? ` · ${diet}` : ''}</p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <button
                                                    onClick={() => handleRestorePlan(plan.id)}
                                                    disabled={restoringId === plan.id}
                                                    className="px-2.5 py-1.5 bg-[var(--color-primary)] text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                                                >
                                                    {restoringId === plan.id ? '...' : 'Restaurar'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePlan(plan.id)}
                                                    className="size-7 flex items-center justify-center rounded-lg bg-[var(--color-bg-muted)] hover:bg-red-50 hover:text-red-500 text-[var(--color-text-muted)] transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* General Settings */}
                    <div>
                        <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Preferencias Generales</h3>
                        <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                            <ToggleItem
                                icon="dark_mode"
                                label="Modo Oscuro"
                                checked={isDark}
                                onChange={toggleTheme}
                                color="text-[var(--color-primary)]"
                                bg="bg-[var(--color-primary-light)]"
                            />
                        </div>
                    </div>

                    {/* Tu Hogar */}
                    <div>
                        <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Tu Hogar</h3>
                        <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                            <div onClick={() => navigate('/app/despensa')} className="cursor-pointer active:bg-[var(--color-bg-page)] transition-colors">
                                <SettingsItem
                                    icon="inventory_2"
                                    label="Mi Despensa"
                                    color="text-[var(--color-secondary)]"
                                    bg="bg-[var(--color-secondary-light)]"
                                />
                            </div>
                            {user && (
                                <>
                                    <div onClick={() => navigate('/app/familia')} className="cursor-pointer active:bg-[var(--color-bg-page)] transition-colors">
                                        <SettingsItem
                                            icon="family_restroom"
                                            label="Mi Familia"
                                            color="text-[var(--color-primary)]"
                                            bg="bg-[var(--color-primary-light)]"
                                        />
                                    </div>
                                    <div onClick={() => navigate('/app/perfil/metricas')} className="cursor-pointer active:bg-[var(--color-bg-page)] transition-colors">
                                        <SettingsItem
                                            icon="monitoring"
                                            label="Mis Metricas"
                                            color="text-[var(--color-secondary)]"
                                            bg="bg-[var(--color-secondary-light)]"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Notifications */}
                    <div>
                        <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Notificaciones</h3>
                        <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                            <ToggleItem
                                icon="notifications"
                                label="Permitir Notificaciones"
                                checked={notifications}
                                onChange={async () => {
                                    if (!notifications) {
                                        if ('Notification' in window) {
                                            const perm = await Notification.requestPermission();
                                            if (perm === 'granted') {
                                                setNotifications(true);
                                                localStorage.setItem('nutriplanner_notif_enabled', 'true');
                                                scheduleLocalNotifications();
                                            }
                                        }
                                    } else {
                                        setNotifications(false);
                                        localStorage.setItem('nutriplanner_notif_enabled', 'false');
                                        cancelLocalNotifications();
                                    }
                                }}
                                color="text-[var(--color-warning)]"
                                bg="bg-[var(--color-tint-amber)]"
                            />
                            {notifications && (
                                <>
                                    <ToggleSubItem label="Alertas de Menú" checked={menuAlerts} onChange={() => {
                                        const next = !menuAlerts;
                                        setMenuAlerts(next);
                                        localStorage.setItem('nutriplanner_notif_meals', JSON.stringify(next));
                                    }} />
                                </>
                            )}
                        </div>
                    </div>

                    {/* App Install */}
                    {!isStandalone && (
                        <div>
                            <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Aplicacion</h3>
                            <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                                <div onClick={handleInstall} className="cursor-pointer active:bg-[var(--color-bg-page)] transition-colors">
                                    <SettingsItem
                                        icon="install_mobile"
                                        label="Instalar App"
                                        value="Instalar"
                                        color="text-[var(--color-primary)]"
                                        bg="bg-[var(--color-tint-teal)]"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Install Guide Modal */}
                    {showInstallGuide && (
                        <div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowInstallGuide(false)}>
                            <div className="bg-[var(--color-bg-card)] rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4 animate-slide-up" onClick={e => e.stopPropagation()}>
                                <div className="text-center">
                                    <div className="h-14 w-14 bg-[var(--color-tint-teal)] rounded-full flex items-center justify-center mx-auto mb-3">
                                        <span className="material-symbols-outlined text-[var(--color-primary)] text-2xl">install_mobile</span>
                                    </div>
                                    <h3 className="text-lg font-bold text-[var(--color-text-primary)]">Como instalar NutriPlanner</h3>
                                </div>
                                <div className="space-y-3 text-sm text-[var(--color-text-secondary)]">
                                    {isIOS ? (
                                        <>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">1</span>
                                                <p>Pulsa el icono <span className="material-symbols-outlined text-sm align-middle">ios_share</span> <strong>Compartir</strong> en la barra del navegador</p>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">2</span>
                                                <p>Selecciona <strong>"Añadir a pantalla de inicio"</strong></p>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">3</span>
                                                <p>Pulsa <strong>"Añadir"</strong> para confirmar</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">1</span>
                                                <p>Pulsa el menu <strong>⋮</strong> de tu navegador (esquina superior derecha)</p>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">2</span>
                                                <p>Busca <strong>"Añadir a pantalla de inicio"</strong> o <strong>"Instalar aplicacion"</strong></p>
                                            </div>
                                            <div className="flex gap-3 items-start">
                                                <span className="bg-[var(--color-primary)] text-white text-xs font-bold h-6 w-6 rounded-full flex items-center justify-center shrink-0">3</span>
                                                <p>Confirma y NutriPlanner aparecera en tu inicio</p>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button onClick={() => setShowInstallGuide(false)} className="w-full py-3 bg-[var(--color-primary)] text-white font-bold rounded-xl text-sm hover:bg-[var(--color-primary-dark)] transition-colors">
                                    Entendido
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Account & Privacy */}
                    <div>
                        <h3 className="text-[var(--color-text-primary)] text-sm px-2 pb-2" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Cuenta y Privacidad</h3>
                        <div className="glass-panel rounded-xl overflow-hidden shadow-[var(--shadow-card)]">
                            <a href="/privacidad">
                                <SettingsItem
                                    icon="policy"
                                    label="Politica de Privacidad"
                                    color="text-[var(--color-primary)]"
                                    bg="bg-[var(--color-tint-teal)]"
                                />
                            </a>
                            <a href="mailto:soporte@nutriplanner.es">
                                <SettingsItem
                                    icon="mail"
                                    label="Contacto y Soporte"
                                    color="text-[var(--color-secondary)]"
                                    bg="bg-[var(--color-secondary-light)]"
                                />
                            </a>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="pt-4 flex flex-col items-center gap-4">
                        <button
                            onClick={user ? handleLogout : () => navigate('/login')}
                            className={`w-full bg-[var(--color-bg-card)] rounded-xl p-4 font-bold text-base shadow-sm border border-[var(--color-border)] transition-colors active:scale-95 ${user ? 'text-red-500 hover:bg-red-50' : 'text-[var(--color-primary)] hover:bg-[var(--color-tint-teal)]'}`}
                        >
                            {user ? 'Cerrar Sesión' : 'Iniciar Sesión'}
                        </button>
                        <p className="text-[var(--color-text-muted)] text-xs text-center font-medium">
                            NutriPlanner v3.0 • Build 2026
                        </p>
                    </div>

                    <div className="h-6 w-full"></div>
                </div>
            </div>
        </div>
    );
}

// --- Componentes Auxiliares ---

const SettingsItem = ({ icon, label, value, color, bg, hideArrow }) => (
    <div className="flex items-center gap-4 p-4 border-b border-[var(--color-border)] last:border-0 cursor-pointer hover:bg-[var(--color-bg-page)] transition-colors">
        <div className={`flex items-center justify-center h-8 w-8 rounded-full ${bg} ${color}`}>
            <span className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <p className="text-[var(--color-text-primary)] text-base font-medium flex-1">{label}</p>
        <div className="flex items-center gap-2">
            {value && <span className="text-[var(--color-text-muted)] text-sm">{value}</span>}
            {!hideArrow && <span className="material-symbols-outlined text-[var(--color-text-muted)] text-lg">chevron_right</span>}
        </div>
    </div>
);

const ToggleItem = ({ icon, label, checked, onChange, color, bg }) => (
    <div className="flex items-center gap-4 p-4 border-b border-[var(--color-border)]">
        <div className={`flex items-center justify-center h-8 w-8 rounded-full ${bg} ${color}`}>
            <span className="material-symbols-outlined text-lg">{icon}</span>
        </div>
        <p className="text-[var(--color-text-primary)] text-base font-medium flex-1">{label}</p>

        {/* Toggle Switch */}
        <button
            onClick={onChange}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)]'}`}
        >
            <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
    </div>
);

const ToggleSubItem = ({ label, checked, onChange }) => (
    <div className="flex items-center gap-4 p-4 pl-16 border-b border-[var(--color-border)] last:border-0">
        <p className="text-[var(--color-text-primary)] text-sm font-normal flex-1">{label}</p>
        <button
            onClick={onChange}
            className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)]'}`}
        >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
    </div>
);
