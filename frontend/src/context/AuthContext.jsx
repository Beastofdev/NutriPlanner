import { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { api } from '../services/api';
import { identify, resetAnalytics } from '../services/analytics';

export const AuthContext = createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Definimos isAuthenticated basado en la existencia del usuario
    const isAuthenticated = !!user;

    // Verificar si el token ha expirado localmente (sin llamar al backend)
    const isTokenExpired = useCallback((token) => {
        if (!token) return true;
        try {
            const { exp } = jwtDecode(token);
            // Añadir 60 segundos de margen para evitar race conditions
            return Date.now() >= (exp * 1000) - 60000;
        } catch {
            return true;
        }
    }, []);

    useEffect(() => {
        const verifySession = async () => {
            const token = localStorage.getItem('token');
            if (token) {
                // Verificación rápida local antes de llamar al backend
                if (isTokenExpired(token)) {
                    // Token expired locally
                    logout();
                    setLoading(false);
                    return;
                }

                try {
                    const userData = await api.getProfile();
                    setUser(userData);
                    // Si no hay plan en localStorage, intentar restaurar desde DB
                    const storedPlan = localStorage.getItem('nutriplanner_plan');
                    if (!storedPlan) {
                        restorePlanFromDB(userData?.email);
                    }
                } catch (error) {
                    console.error("Sesión inválida", error);
                    logout();
                }
            }
            setLoading(false);
        };
        verifySession();
    }, [isTokenExpired]);

    // Restaurar plan activo desde la DB al localStorage
    const restorePlanFromDB = async (userEmail) => {
        try {
            const { plan, wizard_data, tracking_data } = await api.getActivePlan();
            if (plan && plan.menu && plan.menu.length > 0) {
                localStorage.setItem('nutriplanner_plan', JSON.stringify(plan));
                localStorage.setItem('nutriplanner_version', 'v3');
                if (plan.shopping_list) {
                    localStorage.setItem('nutriplanner_shopping_v2', JSON.stringify(plan.shopping_list));
                }
                if (plan.comparison) {
                    localStorage.setItem('nutriplanner_comparison_v2', JSON.stringify(plan.comparison));
                }
                if (wizard_data) {
                    localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(wizard_data));
                }
                // Restore tracking state (consumed meals, macros) if from today
                if (tracking_data && userEmail) {
                    const today = new Date().toISOString().split('T')[0];
                    if (tracking_data.date === today) {
                        const key = (k) => `nutriplanner_${k}_${userEmail}`;
                        if (tracking_data.consumed) {
                            localStorage.setItem(key('consumed'), JSON.stringify(tracking_data.consumed));
                        }
                        if (tracking_data.logged_meals) {
                            localStorage.setItem(key('logged_meals'), JSON.stringify(tracking_data.logged_meals));
                        }
                        if (tracking_data.last_record) {
                            localStorage.setItem(key('last_record'), JSON.stringify(tracking_data.last_record));
                        }
                        // Tracking restored from DB
                    }
                }
                // Plan restored from DB
            }
        } catch (error) {
            console.warn("[Auth] No se pudo restaurar plan:", error.message);
        }
    };

    const login = async (email, password) => {
        try {
            const data = await api.login(email, password);
            if (data.token) {
                localStorage.setItem('token', data.token);
                sessionStorage.removeItem('nutriplanner_logged_out');
                setUser(data.user);
                identify(data.user?.id || data.user?.email, { email: data.user?.email });
                // Restaurar plan activo desde la DB (no bloquea el login)
                restorePlanFromDB(data.user?.email);
                return true;
            }
            throw new Error('No se recibió token de autenticación');
        } catch (error) {
            console.error("Error en Login:", error);
            // Extract backend error message for user-friendly display
            const detail = error.response?.data?.detail;
            if (detail) {
                throw new Error(detail);
            }
            throw error;
        }
    };

    const register = async (email, password, fullName) => {
        try {
            const data = await api.register({ email, password, fullName });
            if (data.token) {
                localStorage.setItem('token', data.token);
                sessionStorage.removeItem('nutriplanner_logged_out');
                setUser(data.user);

                // Migrate guest plan to DB if exists (non-blocking)
                const guestPlan = localStorage.getItem('nutriplanner_plan');
                if (guestPlan) {
                    try {
                        const planData = JSON.parse(guestPlan);
                        const wizardData = JSON.parse(localStorage.getItem('nutriplanner_wizard_data') || '{}');
                        await api.adoptPlan(planData, wizardData);
                        // Guest plan migrated to DB
                    } catch (e) {
                        console.warn("[Auth] Could not migrate guest plan:", e.message);
                    }
                }

                return true;
            }
            throw new Error('No se recibió token de autenticación');
        } catch (error) {
            console.error("Error en Registro:", error);
            const detail = error.response?.data?.detail;
            if (detail) {
                throw new Error(detail);
            }
            throw error;
        }
    };

    const logout = () => {
        // Limpiar todas las claves de NutriPlanner + token
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('nutriplanner_') || key === 'token')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        sessionStorage.setItem('nutriplanner_logged_out', 'true');
        resetAnalytics();
        setUser(null);
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    };

    const value = { user, isAuthenticated, login, register, logout, loading };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}