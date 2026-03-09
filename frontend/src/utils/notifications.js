/**
 * Client-side local notification scheduler.
 * Uses setInterval to check time and fire Notification API.
 * No server push needed (Render free tier sleeps).
 */

let notifInterval = null;

function getDynamicBody(key) {
    const streak = (() => { try { return JSON.parse(localStorage.getItem('nutriplanner_streak_cache') || '{}'); } catch { return {}; } })();
    const plan = (() => { try { return JSON.parse(localStorage.getItem('nutriplanner_plan') || '{}'); } catch { return {}; } })();
    const dayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    const todayMenu = plan?.menu?.[dayIdx % (plan?.menu?.length || 7)];

    if (key === 'monday_plan') {
        const cost = (() => { try { return JSON.parse(localStorage.getItem('nutriplanner_generation_feedback') || '{}')?.estimatedCost; } catch { return null; } })();
        if (cost) return `Tu menu cuesta ~${Math.round(cost)}€. Genera tu plan en NutriPlanner.`;
        return 'Empieza la semana con un menu saludable. Genera tu plan.';
    }
    if (key === 'wednesday_list') {
        const shopping = (() => { try { return JSON.parse(localStorage.getItem('nutriplanner_shopping_v2') || '[]'); } catch { return []; } })();
        return shopping.length > 0
            ? `Tienes ${shopping.length} productos en tu lista. Prepara tu compra semanal.`
            : 'Genera tu menu para tener la lista de la compra lista.';
    }
    if (key === 'morning') {
        const desayuno = todayMenu?.desayuno?.nombre;
        if (desayuno) return `Hoy toca: ${desayuno}`;
        return 'Revisa tu menu de hoy y prepara tu desayuno saludable';
    }
    if (key === 'lunch') {
        const comida = todayMenu?.comida?.nombre;
        if (comida) return `Tu comida: ${comida}`;
        return 'Tu comida de hoy esta lista en NutriPlanner';
    }
    if (key === 'evening') {
        const dow = new Date().getDay();
        if (dow === 0) {
            return 'Manana empieza la semana — genera tu menu semanal';
        }
        if (streak?.streak >= 4) {
            return `Racha de ${streak.streak} semanas — sigue asi!`;
        }
        return 'Echa un vistazo a tu menu de manana';
    }
    if (key === 'sunday') {
        if (streak?.streak > 0) {
            return `Llevas ${streak.streak} semanas — no pierdas tu racha!`;
        }
        return 'Genera tu menu semanal en 30 segundos';
    }
    return 'Tu planificador nutricional te espera';
}

const NOTIFICATION_SCHEDULE = [
    { hour: 8, minute: 0, key: 'monday_plan', title: 'Tu menu semanal esta listo', dayOfWeek: 1 },
    { hour: 9, minute: 0, key: 'morning', title: 'Buenos dias' },
    { hour: 13, minute: 30, key: 'lunch', title: 'Hora de comer' },
    { hour: 18, minute: 0, key: 'wednesday_list', title: 'Ya tienes tu lista?', dayOfWeek: 3 },
    { hour: 20, minute: 0, key: 'evening', title: 'Planifica manana' },
    { hour: 10, minute: 0, key: 'sunday', title: 'Tu menu semanal te espera', dayOfWeek: 0 },
];

function getTodayKey(scheduleKey) {
    const d = new Date();
    return `notif_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}_${scheduleKey}`;
}

function checkAndFire() {
    if (Notification.permission !== 'granted') return;
    const enabled = localStorage.getItem('nutriplanner_notif_enabled') === 'true';
    if (!enabled) return;

    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes();

    for (const sched of NOTIFICATION_SCHEDULE) {
        if (h === sched.hour && m === sched.minute) {
            // Day-of-week filter (e.g., sunday notifications only on Sunday)
            if (sched.dayOfWeek !== undefined && now.getDay() !== sched.dayOfWeek) continue;

            const dayKey = getTodayKey(sched.key);
            if (localStorage.getItem(dayKey)) continue; // already fired today
            localStorage.setItem(dayKey, '1');

            // Only fire meal alerts if user has that preference
            const mealsEnabled = localStorage.getItem('nutriplanner_notif_meals') !== 'false';
            if (!mealsEnabled && sched.key !== 'evening' && sched.key !== 'sunday') continue;

            new Notification(sched.title, {
                body: getDynamicBody(sched.key),
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: sched.key,
            });
        }
    }
}

export function scheduleLocalNotifications() {
    if (notifInterval) clearInterval(notifInterval);
    // Check every 60 seconds
    notifInterval = setInterval(checkAndFire, 60_000);
    // Also check immediately
    checkAndFire();
}

export function cancelLocalNotifications() {
    if (notifInterval) {
        clearInterval(notifInterval);
        notifInterval = null;
    }
}

/**
 * Auto-start notifications if previously enabled.
 * Call this once from App.jsx or main entry.
 */
/**
 * Fire a one-time notification after menu generation.
 * Call from Step4Summary after successful plan generation.
 */
export function notifyPlanGenerated(cost, productCount) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const enabled = localStorage.getItem('nutriplanner_notif_enabled') === 'true';
    if (!enabled) return;

    const body = cost
        ? `Tu menu cuesta ~${Math.round(cost)}€ con ${productCount} productos. Comprar en tu super.`
        : `${productCount} productos listos en tu lista de compra.`;

    new Notification('Menu generado', {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'plan_generated',
    });
}

export function initNotifications() {
    const enabled = localStorage.getItem('nutriplanner_notif_enabled') === 'true';
    if (enabled && 'Notification' in window && Notification.permission === 'granted') {
        scheduleLocalNotifications();
    }
}
