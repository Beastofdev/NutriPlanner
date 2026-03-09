import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const showToast = useCallback((message, type = 'success', duration = 3000) => {
        const id = Date.now();
        const toast = { id, message, type };

        setToasts(prev => [...prev, toast]);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, duration);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onRemove }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 w-full max-w-sm px-4">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

function Toast({ toast, onRemove }) {
    const icons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
    };

    const colors = {
        success: 'bg-[var(--color-primary)]/90 text-white',
        error: 'bg-red-500/90 text-white',
        warning: 'bg-yellow-500/90 text-[#052e16]',
        info: 'bg-blue-500/90 text-white'
    };

    return (
        <div
            className={`${colors[toast.type]} backdrop-blur-md rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg animate-in slide-in-from-top fade-in duration-300`}
            onClick={() => onRemove(toast.id)}
        >
            <span className="material-symbols-outlined text-xl">{icons[toast.type]}</span>
            <span className="font-medium text-sm flex-1">{toast.message}</span>
            <button className="opacity-70 hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
    );
}

export default ToastProvider;
