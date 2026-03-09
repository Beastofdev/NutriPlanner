import { useState, useEffect } from 'react';
import { track } from '../services/analytics';

/**
 * Contextual coachmark tooltip. Shows once per tip key, then never again.
 * Usage: <Coachmark tipKey="savings_banner" text="Comparamos precios..." position="bottom" />
 */
export default function Coachmark({ tipKey, text, position = 'bottom', delay = 500 }) {
    const [visible, setVisible] = useState(false);
    const storageKey = `nutriplanner_seen_tip_${tipKey}`;

    useEffect(() => {
        if (localStorage.getItem(storageKey)) return;
        const timer = setTimeout(() => setVisible(true), delay);
        return () => clearTimeout(timer);
    }, [storageKey, delay]);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem(storageKey, '1');
        track('coachmark_dismissed', { tip: tipKey });
    };

    if (!visible) return null;

    const posClasses = {
        top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
        bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
        left: 'right-full mr-2 top-1/2 -translate-y-1/2',
        right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    };

    const arrowClasses = {
        top: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-[var(--color-primary)]',
        bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-[var(--color-primary)]',
        left: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-[var(--color-primary)]',
        right: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-[var(--color-primary)]',
    };

    return (
        <div className={`absolute z-50 ${posClasses[position]} animate-fade-in`}>
            <div
                className="bg-[var(--color-primary)] text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg max-w-[220px] cursor-pointer relative"
                onClick={dismiss}
            >
                {text}
                <span className={`absolute w-0 h-0 border-[5px] ${arrowClasses[position]}`} />
            </div>
        </div>
    );
}
