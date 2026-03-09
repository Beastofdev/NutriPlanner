import { createContext, useState, useContext, useEffect } from 'react';

const ThemeContext = createContext();

export function useTheme() {
    return useContext(ThemeContext);
}

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem('nutriplanner_theme') || 'light';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('nutriplanner_theme', theme);
    }, [theme]);

    // Apply immediately on first render (before paint) to prevent flash
    document.documentElement.setAttribute('data-theme', theme);

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
}
