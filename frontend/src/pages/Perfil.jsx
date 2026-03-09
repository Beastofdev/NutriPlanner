import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import BottomNav from '../components/NavBar';

const DIET_LABELS = {
    omnivoro: 'Omnívora', omnivora: 'Omnívora',
    vegano: 'Vegana', vegan: 'Vegana',
    vegetariano: 'Vegetariana', vegetarian: 'Vegetariana',
    keto: 'Keto', cetogenica: 'Keto',
    sin_gluten: 'Sin Gluten', gluten_free: 'Sin Gluten',
    mediterranea: 'Mediterránea', paleo: 'Paleo',
};
const GOAL_LABELS = {
    lose_weight: 'Pérdida', lose_fat: 'Pérdida',
    gain_muscle: 'Ganar Músculo', maintain: 'Mantener',
    health: 'Salud',
};

export default function Perfil() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [stats, setStats] = useState({ calories: 2000, diet: 'Omnívora', goal: 'Salud' });
    const [restrictions, setRestrictions] = useState('');
    const [shoppingStats, setShoppingStats] = useState(null);
    const [streak, setStreak] = useState(null);

    useEffect(() => {
        try {
            const storedPlan = localStorage.getItem('nutriplanner_plan');
            if (storedPlan) {
                const parsed = JSON.parse(storedPlan);
                const rawDiet = parsed.user_preferences?.diet_type || '';
                const rawGoal = parsed.user_preferences?.goal || '';
                setStats({
                    calories: parsed.user_preferences?.target_calories || parsed.total_calorias_dia || 2000,
                    diet: DIET_LABELS[rawDiet] || rawDiet || 'Omnívora',
                    goal: GOAL_LABELS[rawGoal] || rawGoal || 'Pérdida'
                });
            }
        } catch (e) {
            console.warn('Error parsing stored plan:', e);
        }
        // Cargar restricciones del wizard
        // Fetch shopping stats & streak for logged-in users
        if (user) {
            api.getShoppingStats()
                .then(res => setShoppingStats(res))
                .catch(() => {});
            api.getUserStreak()
                .then(res => setStreak(res))
                .catch(() => {});
        }

        try {
            const wizardRaw = localStorage.getItem('nutriplanner_wizard_data');
            if (wizardRaw) {
                const wd = JSON.parse(wizardRaw);
                const parts = [...(wd.allergens || []), ...(wd.hatedFoods || [])];
                setRestrictions(parts.length > 0 ? parts.join(', ') : 'Ninguno');
            }
        } catch { /* ignore */ }
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-2xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header Sticky */}
                <header className="sticky top-0 z-10 flex items-center justify-between px-6 py-5 bg-[var(--color-bg-header)] backdrop-blur-md">
                    <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">Mi Perfil</h1>
                    <button
                        onClick={() => navigate('/app/ajustes')}
                        className="flex items-center justify-center p-2 rounded-full hover:bg-[var(--color-bg-muted)] transition-colors"
                    >
                        <span className="material-symbols-outlined text-[var(--color-text-secondary)]">settings</span>
                    </button>
                </header>

                {/* Contenido Scrollable */}
                <div className="flex-1 overflow-y-auto scrollbar-hide pb-24 lg:pb-8">
                    {/* Profile Hero */}
                    <div className="flex flex-col items-center px-4 pt-2 pb-6">
                        <div className="relative mb-4">
                            <div className="h-28 w-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-[var(--color-bg-muted)]">
                                <img
                                    src={`https://ui-avatars.com/api/?name=${user?.full_name || 'User'}&background=E8611A&color=ffffff&bold=true`}
                                    alt="Profile"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                        <div className="text-center space-y-1">
                            <h2 className="text-2xl font-bold leading-tight text-[var(--color-text-primary)]">{user?.full_name || 'Usuario Invitado'}</h2>
                            <p className="text-[var(--color-text-muted)] text-sm">{user?.email || 'usuario@email.com'}</p>
                        </div>
                    </div>

                    {/* Quick Stats Cards */}
                    <div className="w-full px-5 pb-6">
                        <div className="flex gap-3">
                            <StatCard icon="monitor_weight" label={stats.goal} sub="Objetivo" color="text-blue-500 bg-blue-50" />
                            <StatCard icon="restaurant" label={stats.diet} sub="Dieta" color="text-[var(--color-primary)] bg-[var(--color-tint-teal)]" />
                            <StatCard icon="local_fire_department" label={Math.round(stats.calories)} sub="Kcal Meta" color="text-orange-500 bg-orange-50" />
                        </div>
                    </div>

                    {/* Savings & Streak */}
                    {user && (shoppingStats?.trip_count > 0 || streak?.streak > 0) && (
                        <div className="w-full px-5 pb-6">
                            <div className="flex gap-3">
                                {shoppingStats?.total_saved > 0 && (
                                    <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                        <span className="material-symbols-outlined text-emerald-600 text-2xl mb-1 block">savings</span>
                                        <p className="text-xl font-bold text-emerald-700">{shoppingStats.total_saved.toFixed(2)}€</p>
                                        <p className="text-[10px] text-emerald-600 uppercase font-bold mt-0.5">Ahorro Total</p>
                                        <p className="text-[10px] text-emerald-500">{shoppingStats.trip_count} {shoppingStats.trip_count === 1 ? 'compra' : 'compras'}</p>
                                    </div>
                                )}
                                {streak?.streak > 0 && (
                                    <div className="flex-1 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                                        <span className="material-symbols-outlined text-amber-600 text-2xl mb-1 block">local_fire_department</span>
                                        <p className="text-xl font-bold text-amber-700">{streak.streak}</p>
                                        <p className="text-[10px] text-amber-600 uppercase font-bold mt-0.5">{streak.streak === 1 ? 'Semana' : 'Semanas'} Racha</p>
                                        <p className="text-[10px] text-amber-500">{streak.total_plans} planes creados</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Section 1: Navigation Links */}
                    <div className="px-5 pb-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3 ml-2">Nutrición y Salud</h3>
                        <div className="flex flex-col rounded-3xl bg-[var(--color-bg-card)] overflow-hidden shadow-sm border border-[var(--color-border)]">

                            <MenuItem
                                icon="accessibility_new"
                                title="Métricas Corporales"
                                subtitle="Peso, Altura, Edad"
                                onClick={() => navigate('/app/perfil/metricas')}
                            />

                            <div className="h-px w-full bg-[var(--color-border)] ml-16"></div>

                            <MenuItem
                                icon="no_food"
                                title="Restricciones y Alergias"
                                subtitle={restrictions || 'Ninguno'}
                                onClick={() => navigate('/app/perfil/alergias')}
                            />

                            <div className="h-px w-full bg-[var(--color-border)] ml-16"></div>

                            <MenuItem
                                icon="favorite"
                                title="Mis Recetas Favoritas"
                                subtitle="Tus recetas guardadas"
                                onClick={() => navigate('/app/favoritas')}
                            />

                        </div>
                    </div>


                    {/* Log Out & Version */}
                    <div className="px-5 pt-8 pb-4 flex flex-col items-center gap-4">
                        <button
                            onClick={handleLogout}
                            className="w-full rounded-2xl border border-red-200 bg-red-50 py-4 text-red-500 hover:bg-red-100 transition-colors font-bold text-center active:scale-95"
                        >
                            Cerrar Sesión
                        </button>
                        <p className="text-[10px] text-[var(--color-text-muted)]">NutriPlanner v2.0 • Build 2026</p>
                    </div>
                </div>

                {/* Bottom Navigation Bar */}
                <BottomNav active="perfil" />

            </div>
        </div>
    );
}

// --- Componentes Auxiliares ---
const StatCard = ({ icon, label, sub, color }) => (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-[var(--color-bg-card)] p-4 shadow-sm flex-1 border border-[var(--color-border)] min-w-0">
        <div className={`p-2 rounded-full mb-1 ${color}`}>
            <span className="material-symbols-outlined text-xl">{icon}</span>
        </div>
        <p className="text-base font-bold truncate w-full text-center text-[var(--color-text-primary)]">{label}</p>
        <p className="text-[10px] text-[var(--color-text-muted)] uppercase">{sub}</p>
    </div>
);

const MenuItem = ({ icon, title, subtitle, onClick }) => (
    <button
        onClick={onClick}
        className="group flex w-full items-center justify-between p-4 hover:bg-[var(--color-bg-page)] transition-colors text-left"
    >
        <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-tint-teal)] text-[var(--color-primary)]">
                <span className="material-symbols-outlined">{icon}</span>
            </div>
            <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{title}</p>
                {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
            </div>
        </div>
        <span className="material-symbols-outlined text-[var(--color-text-muted)] text-xl">chevron_right</span>
    </button>
);
