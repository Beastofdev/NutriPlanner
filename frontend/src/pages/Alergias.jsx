import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ALLERGEN_MAP = {
    gluten: { label: 'Gluten', sub: 'Trigo, cebada', icon: 'bakery_dining', color: 'text-orange-600', bg: 'bg-orange-50', wizardLabel: 'Gluten' },
    lactose: { label: 'Lactosa', sub: 'Leche, queso', icon: 'water_drop', color: 'text-blue-600', bg: 'bg-blue-50', wizardLabel: 'Lactosa' },
    nuts: { label: 'Frutos Secos', sub: 'Nueces, almendras', icon: 'nutrition', color: 'text-yellow-700', bg: 'bg-yellow-50', wizardLabel: 'Frutos Secos' },
    eggs: { label: 'Huevo', sub: 'Clara o yema', icon: 'egg', color: 'text-amber-600', bg: 'bg-amber-50', wizardLabel: 'Huevo' },
    seafood: { label: 'Marisco', sub: 'Crustáceos', icon: 'set_meal', color: 'text-red-600', bg: 'bg-red-50', wizardLabel: 'Marisco' },
    soy: { label: 'Soja', sub: 'Salsas, tofu', icon: 'eco', color: 'text-green-600', bg: 'bg-green-50', wizardLabel: 'Soja' },
};

export default function Alergias() {
    const navigate = useNavigate();
    const [allergens, setAllergens] = useState({});
    const [hatedText, setHatedText] = useState('');
    const [saved, setSaved] = useState(false);

    // Cargar datos del wizard (localStorage)
    useEffect(() => {
        try {
            const raw = localStorage.getItem('nutriplanner_wizard_data');
            if (raw) {
                const data = JSON.parse(raw);
                const activeAllergens = {};
                for (const key of Object.keys(ALLERGEN_MAP)) {
                    activeAllergens[key] = (data.allergens || []).includes(ALLERGEN_MAP[key].wizardLabel);
                }
                setAllergens(activeAllergens);
                setHatedText((data.hatedFoods || []).join(', '));
            } else {
                const defaults = {};
                for (const key of Object.keys(ALLERGEN_MAP)) defaults[key] = false;
                setAllergens(defaults);
            }
        } catch {
            const defaults = {};
            for (const key of Object.keys(ALLERGEN_MAP)) defaults[key] = false;
            setAllergens(defaults);
        }
    }, []);

    const toggleAllergen = (key) => {
        setAllergens(prev => ({ ...prev, [key]: !prev[key] }));
        setSaved(false);
    };

    const handleSave = () => {
        try {
            const raw = localStorage.getItem('nutriplanner_wizard_data');
            const data = raw ? JSON.parse(raw) : {};

            data.allergens = Object.entries(allergens)
                .filter(([, v]) => v)
                .map(([k]) => ALLERGEN_MAP[k].wizardLabel);

            data.hatedFoods = hatedText
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            localStorage.setItem('nutriplanner_wizard_data', JSON.stringify(data));
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            console.error('Error guardando preferencias:', e);
        }
    };

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-2xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Header */}
                <header className="sticky top-0 z-20 flex items-center gap-2 px-4 py-4 bg-[var(--color-bg-header)] backdrop-blur-md">
                    <button onClick={() => navigate(-1)} className="flex items-center justify-center p-2 -ml-2 rounded-full hover:bg-[var(--color-bg-muted)] transition-colors">
                        <span className="material-symbols-outlined text-[var(--color-text-primary)]">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)]">Restricciones y Alergias</h1>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide pb-32 px-4 pt-2">

                    {/* Info Card */}
                    <div className="flex gap-4 p-4 mb-6 rounded-2xl bg-blue-50 text-blue-800 text-sm leading-relaxed border border-blue-100">
                        <span className="material-symbols-outlined shrink-0 filled">info</span>
                        <p>NutriPlanner usará esta información para excluir ingredientes peligrosos o no deseados de tus menús semanales.</p>
                    </div>

                    {/* Frecuentes Grid */}
                    <div className="pb-8">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 ml-1">Frecuentes</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(ALLERGEN_MAP).map(([key, cfg]) => (
                                <AllergenCard
                                    key={key}
                                    label={cfg.label} sub={cfg.sub} icon={cfg.icon}
                                    color={cfg.color} bg={cfg.bg}
                                    checked={allergens[key] || false} onChange={() => toggleAllergen(key)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Alimentos Odiados */}
                    <div className="pb-6">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-4 ml-1">Alimentos a evitar</h3>
                        <div className="relative group">
                            <textarea
                                value={hatedText}
                                onChange={(e) => { setHatedText(e.target.value); setSaved(false); }}
                                className="w-full rounded-3xl bg-[var(--color-bg-card)] border border-[var(--color-border)] p-5 pr-12 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-primary)] shadow-sm h-40 resize-none transition-shadow"
                                placeholder="Escribe aquí ingredientes específicos que quieras evitar. Ej: Cilantro, picante, pimiento rojo..."
                            ></textarea>
                            <div className="absolute bottom-4 right-5 pointer-events-none">
                                <span className="material-symbols-outlined text-[var(--color-border)] group-focus-within:text-[var(--color-primary)] transition-colors">edit_note</span>
                            </div>
                        </div>
                        <p className="text-xs text-[var(--color-text-muted)] mt-2 px-2">Separa los ingredientes por comas. Estas exclusiones se aplican estrictamente.</p>
                    </div>
                </div>

                {/* Footer Fijo */}
                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--color-bg-page)] via-[var(--color-bg-page)] to-transparent pt-12 z-10">
                    <button
                        onClick={handleSave}
                        className="w-full font-bold text-lg py-4 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 text-white"
                        style={{
                            background: saved
                                ? '#059669'
                                : 'var(--gradient-hero)',
                            boxShadow: saved
                                ? '0 10px 25px rgba(5,150,105,0.25)'
                                : '0 10px 25px rgba(8,145,178,0.25)'
                        }}
                    >
                        <span className="material-symbols-outlined">{saved ? 'check_circle' : 'save'}</span>
                        {saved ? 'Guardado' : 'Guardar Preferencias'}
                    </button>
                </div>

            </div>
        </div>
    );
}

const AllergenCard = ({ label, sub, icon, color, bg, checked, onChange }) => (
    <label className="cursor-pointer group relative">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <div className="flex flex-col items-start gap-3 p-4 rounded-3xl bg-[var(--color-bg-card)] border-2 border-[var(--color-border)] peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-tint-teal)] transition-all shadow-sm h-full">
            <div className={`flex items-center justify-center h-10 w-10 rounded-full ${bg} ${color}`}>
                <span className="material-symbols-outlined">{icon}</span>
            </div>
            <div>
                <p className="font-bold text-base text-[var(--color-text-primary)]">{label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{sub}</p>
            </div>
        </div>
        <div className="absolute top-4 right-4 text-[var(--color-primary)] opacity-0 peer-checked:opacity-100 transition-opacity scale-50 peer-checked:scale-100 duration-200">
            <span className="material-symbols-outlined filled">check_circle</span>
        </div>
    </label>
);
