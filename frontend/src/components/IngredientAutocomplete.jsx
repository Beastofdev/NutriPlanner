import React, { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { api } from '../services/api';

/**
 * Componente de autocompletado inteligente para ingredientes.
 * Usa fuzzy search para sugerir ingredientes mientras el usuario escribe.
 */
const IngredientAutocomplete = ({
    value,
    onChange,
    onSelect,
    placeholder = "Ej: Arroz, Leche, Huevos...",
    className = "",
    autoFocus = false
}) => {
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [ingredients, setIngredients] = useState([]);
    const inputRef = useRef(null);
    const suggestionsRef = useRef(null);

    // Configurar Fuse.js para fuzzy search
    const fuseOptions = {
        threshold: 0.4, // 0 = exacto, 1 = cualquier cosa
        distance: 100,
        minMatchCharLength: 2,
        keys: ['name']
    };

    // Cargar ingredientes comunes del backend
    useEffect(() => {
        const fetchIngredients = async () => {
            try {
                const data = await api.getCommonIngredients();
                setIngredients(data.ingredients.map(name => ({ name })));
            } catch (error) {
                console.error("Error cargando ingredientes:", error);
                setIngredients(FALLBACK_INGREDIENTS.map(name => ({ name })));
            }
        };

        fetchIngredients();
    }, []);

    // Buscar sugerencias cuando cambia el valor
    useEffect(() => {
        if (value && value.length >= 2 && ingredients.length > 0) {
            const fuse = new Fuse(ingredients, fuseOptions);
            const results = fuse.search(value);

            // [FIX] Threshold más permisivo para mostrar sugerencias con typos
            // Score: 0 = match perfecto, 1 = no match
            // 0.7 permite errores como "amlendras" → "Almendras"
            const filtered = results
                .filter(result => result.score < 0.7)
                .slice(0, 5)
                .map(result => ({
                    name: result.item.name,
                    score: result.score,
                    isExact: result.item.name.toLowerCase() === value.toLowerCase()
                }));

            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
            setSelectedIndex(-1);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [value, ingredients]);

    // Manejar clicks fuera del componente
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                inputRef.current &&
                !inputRef.current.contains(event.target) &&
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Manejar navegación con teclado
    const handleKeyDown = (e) => {
        if (!showSuggestions) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < suggestions.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                    handleSelectSuggestion(suggestions[selectedIndex].name);
                }
                break;
            case 'Escape':
                setShowSuggestions(false);
                setSelectedIndex(-1);
                break;
        }
    };

    const handleSelectSuggestion = (name) => {
        onChange({ target: { value: name } });
        setShowSuggestions(false);
        setSelectedIndex(-1);

        if (onSelect) {
            onSelect(name);
        }
    };

    const handleInputChange = (e) => {
        onChange(e);
        setShowSuggestions(true);
    };

    return (
        <div className="relative">
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                className={className}
                placeholder={placeholder}
                value={value}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                type="text"
            />

            {/* Dropdown de sugerencias */}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg-card)] rounded-xl shadow-lg border border-[var(--color-border)] max-h-60 overflow-y-auto z-50"
                >
                    {suggestions.map((suggestion, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSelectSuggestion(suggestion.name)}
                            className={`w-full px-4 py-3 text-left transition-colors flex items-center justify-between ${
                                idx === selectedIndex
                                    ? 'bg-[var(--color-primary)]/10'
                                    : 'hover:bg-[var(--color-tint-teal)]'
                            }`}
                        >
                            <div className="flex-1">
                                <span className="font-medium text-[var(--color-text-primary)]">
                                    {suggestion.name}
                                </span>
                                {!suggestion.isExact && (
                                    <span className="text-xs text-gray-400 ml-2">
                                        ¿Querías decir esto?
                                    </span>
                                )}
                            </div>

                            {/* Indicador de calidad del match */}
                            {suggestion.score < 0.2 && (
                                <span className="material-symbols-outlined text-[var(--color-primary)] text-sm ml-2">
                                    check_circle
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// Ingredientes de fallback si falla la carga del backend
const FALLBACK_INGREDIENTS = [
    'Aceite de oliva', 'Arroz', 'Sal', 'Azúcar', 'Leche', 'Huevos',
    'Harina', 'Mantequilla', 'Queso', 'Tomate', 'Cebolla', 'Ajo',
    'Patatas', 'Pasta', 'Pan', 'Pollo', 'Carne', 'Pescado',
    'Almendras', 'Nueces', 'Arándanos', 'Frambuesas', 'Fresas',
    'Plátano', 'Manzana', 'Naranja', 'Yogur', 'Limón', 'Pimienta'
];

export default IngredientAutocomplete;
