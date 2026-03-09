import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import BottomNav from '../components/NavBar';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_MEMBERS = 8;

const MEMBER_PRESETS = [
    { val: 'adult_male', label: 'Adulto', icon: 'person', kcal: 2000, age: 35, gender: 'male', weight_kg: 75, height_cm: 175 },
    { val: 'adult_female', label: 'Adulta', icon: 'person', kcal: 1700, age: 35, gender: 'female', weight_kg: 62, height_cm: 163 },
    { val: 'teen', label: 'Adolescente', icon: 'face', kcal: 1800, age: 15, gender: 'male', weight_kg: 55, height_cm: 165 },
    { val: 'child', label: 'Niño/a', icon: 'child_care', kcal: 1400, age: 8, gender: 'male', weight_kg: 28, height_cm: 128 },
    { val: 'elderly', label: 'Mayor', icon: 'elderly', kcal: 1600, age: 70, gender: 'male', weight_kg: 70, height_cm: 168 },
];

const ACTIVITY_OPTIONS = [
    { val: 'sedentary',  label: 'Sedentario' },
    { val: 'light',      label: 'Ligero' },
    { val: 'moderate',   label: 'Moderado' },
    { val: 'active',     label: 'Activo' },
    { val: 'very_active',label: 'Muy activo' },
];

const GOAL_OPTIONS = [
    { val: 'lose_weight',  label: 'Perder peso' },
    { val: 'maintain',     label: 'Mantener' },
    { val: 'gain_muscle',  label: 'Ganar músculo' },
];

const EMPTY_MEMBER = {
    name: '',
    preset: 'adult_male',
    age: '35',
    gender: 'male',
    weight_kg: '75',
    height_cm: '175',
    activity_level: 'moderate',
    goal: 'maintain',
    allergens: [],
    hated_foods: [],
    showAdvanced: false,
};

// ─── Mifflin-St Jeor calorie calculator ───────────────────────────────────────

const calcCalories = (weight, height, age, gender, activity, goal) => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const a = parseFloat(age);
    if (!w || !h || !a || w <= 0 || h <= 0 || a <= 0) return 2000;

    let bmr;
    if (gender === 'female') {
        bmr = 10 * w + 6.25 * h - 5 * a - 161;
    } else {
        // male or other → use male formula as default
        bmr = 10 * w + 6.25 * h - 5 * a + 5;
    }

    const activityFactors = {
        sedentary:  1.2,
        light:      1.375,
        moderate:   1.55,
        active:     1.725,
        very_active: 1.9,
    };
    const goalFactors = {
        lose_weight:  0.85,
        maintain:     1.0,
        gain_muscle:  1.15,
    };

    return Math.round(bmr * (activityFactors[activity] || 1.55) * (goalFactors[goal] || 1.0));
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function Familia() {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [members, setMembers]     = useState([]);
    const [summary, setSummary]     = useState(null);
    const [loading, setLoading]     = useState(true);
    const [showForm, setShowForm]   = useState(false);
    const [editingId, setEditingId] = useState(null); // null = add mode, number = edit mode
    const [formData, setFormData]   = useState({ ...EMPTY_MEMBER });
    const [formError, setFormError] = useState('');
    const [saving, setSaving]       = useState(false);
    const [deletingId, setDeletingId] = useState(null);

    // Cost-per-person from localStorage shopping data
    const [costPerPerson, setCostPerPerson] = useState(null);

    // ── Data loading ───────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const [membersData, summaryData] = await Promise.all([
                api.getFamilyMembers(),
                api.getFamilySummary(),
            ]);
            setMembers(Array.isArray(membersData) ? membersData : []);
            setSummary(summaryData);
        } catch (err) {
            console.error('[Familia] Error loading family data:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Derive cost-per-person from localStorage shopping comparison
    useEffect(() => {
        try {
            const compRaw = localStorage.getItem('nutriplanner_comparison_v2');
            if (compRaw) {
                const comp = JSON.parse(compRaw);
                const totalCost = comp?.stats?.cheapest_total ?? comp?.total_cost ?? null;
                if (totalCost && members.length > 0) {
                    setCostPerPerson((totalCost / (members.length + 1)).toFixed(2));
                }
            }
        } catch { /* ignore */ }
    }, [members]);

    // ── Live calorie preview (computed from form fields) ──────────────────────

    const previewCalories = calcCalories(
        formData.weight_kg,
        formData.height_cm,
        formData.age,
        formData.gender,
        formData.activity_level,
        formData.goal,
    );

    // ── Form helpers ──────────────────────────────────────────────────────────

    const updateField = (key, value) => {
        setFormData(prev => ({ ...prev, [key]: value }));
        setFormError('');
    };

    const validateForm = () => {
        if (!formData.name.trim()) return 'El nombre es obligatorio.';
        return null;
    };

    const openAddForm = () => {
        setFormData({ ...EMPTY_MEMBER });
        setEditingId(null);
        setFormError('');
        setShowForm(true);
    };

    const openEditForm = (member) => {
        setFormData({
            name:           member.name || '',
            preset:         member.preset || 'adult_male',
            age:            member.age?.toString() || '35',
            gender:         member.gender || 'male',
            weight_kg:      member.weight_kg?.toString() || '75',
            height_cm:      member.height_cm?.toString() || '175',
            activity_level: member.activity_level || 'moderate',
            goal:           member.goal || 'maintain',
            allergens:      member.allergens || [],
            hated_foods:    member.hated_foods || [],
            showAdvanced:   false,
        });
        setEditingId(member.id);
        setFormError('');
        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData({ ...EMPTY_MEMBER });
        setFormError('');
    };

    // ── CRUD operations ───────────────────────────────────────────────────────

    const handleSave = async () => {
        const error = validateForm();
        if (error) { setFormError(error); return; }

        const preset = MEMBER_PRESETS.find(p => p.val === formData.preset) || MEMBER_PRESETS[0];
        const age = parseInt(formData.age, 10) || preset.age;
        const weight_kg = parseFloat(formData.weight_kg) || preset.weight_kg;
        const height_cm = parseFloat(formData.height_cm) || preset.height_cm;
        const calories = formData.showAdvanced
            ? previewCalories
            : preset.kcal;

        const payload = {
            name:           formData.name.trim(),
            age:            age,
            gender:         formData.gender || preset.gender,
            weight_kg:      weight_kg,
            height_cm:      height_cm,
            activity_level: formData.activity_level,
            goal:           formData.goal,
            target_calories: calories,
            allergens:      formData.allergens,
            hated_foods:    formData.hated_foods,
        };

        setSaving(true);

        if (editingId !== null) {
            // Optimistic update
            setMembers(prev =>
                prev.map(m => m.id === editingId ? { ...m, ...payload, id: editingId } : m)
            );
            closeForm();
            try {
                const updated = await api.updateFamilyMember(editingId, payload);
                setMembers(prev => prev.map(m => m.id === editingId ? updated : m));
                // Refresh summary
                api.getFamilySummary().then(setSummary).catch(() => {});
            } catch (err) {
                console.error('[Familia] Error updating member:', err);
                // Revert on error
                loadData();
            }
        } else {
            // Optimistic insert with temp id
            const tempId = `temp_${Date.now()}`;
            const optimisticMember = { ...payload, id: tempId };
            setMembers(prev => [...prev, optimisticMember]);
            closeForm();
            try {
                const created = await api.addFamilyMember(payload);
                // Replace temp entry with real one
                setMembers(prev => prev.map(m => m.id === tempId ? created : m));
                api.getFamilySummary().then(setSummary).catch(() => {});
            } catch (err) {
                console.error('[Familia] Error adding member:', err);
                // Revert on error
                setMembers(prev => prev.filter(m => m.id !== tempId));
                loadData();
            }
        }

        setSaving(false);
    };

    const handleDelete = async (id) => {
        // Optimistic remove
        const removed = members.find(m => m.id === id);
        setDeletingId(id);
        setMembers(prev => prev.filter(m => m.id !== id));
        try {
            await api.deleteFamilyMember(id);
            api.getFamilySummary().then(setSummary).catch(() => {});
        } catch (err) {
            console.error('[Familia] Error deleting member:', err);
            // Revert on error
            if (removed) setMembers(prev => [...prev, removed].sort((a, b) => a.id - b.id));
        } finally {
            setDeletingId(null);
        }
    };

    // ── Derived values ─────────────────────────────────────────────────────────

    const totalCalories = members.reduce((sum, m) => sum + (m.target_calories || 0), 0);
    const sharedAllergens = summary?.shared_allergens ?? [];
    const sharedHatedFoods = summary?.shared_hated_foods ?? [];

    // ── Render: not logged in ──────────────────────────────────────────────────

    if (!user && !loading) {
        return (
            <div className="h-screen bg-[var(--color-bg-page)] font-sans flex flex-col items-center justify-center px-6 text-center gap-6">
                <div className="h-20 w-20 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-orange-500 text-4xl">family_restroom</span>
                </div>
                <div>
                    <h2 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Mi Familia</h2>
                    <p className="text-[var(--color-text-secondary)] text-sm leading-relaxed max-w-xs">
                        Inicia sesion para gestionar tu familia y planificar menus personalizados para cada miembro.
                    </p>
                </div>
                <button
                    onClick={() => navigate('/login')}
                    className="px-8 py-3 rounded-2xl font-bold text-white text-sm shadow-md"
                    style={{ background: 'var(--gradient-hero)' }}
                >
                    Iniciar sesion
                </button>
                <BottomNav active="familia" />
            </div>
        );
    }

    // ── Render: loading spinner ────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="h-screen bg-[var(--color-bg-page)] font-sans flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin"></div>
                    <p className="text-sm text-[var(--color-text-muted)]">Cargando familia...</p>
                </div>
            </div>
        );
    }

    // ── Main render ────────────────────────────────────────────────────────────

    return (
        <div className="h-screen lg:h-auto lg:min-h-screen bg-[var(--color-bg-page)] font-sans">
            <div className="relative w-full max-w-lg lg:max-w-2xl mx-auto h-full overflow-hidden flex flex-col text-[var(--color-text-primary)]">

                {/* Sticky Header */}
                <header className="sticky top-0 z-20 bg-[var(--color-bg-header)] backdrop-blur-md border-b border-[var(--color-border)]">
                    <div className="flex items-center gap-3 px-4 py-4 pb-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors"
                            aria-label="Volver"
                        >
                            <span className="material-symbols-outlined text-[var(--color-text-primary)] text-2xl">arrow_back_ios_new</span>
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className="text-lg font-bold leading-tight tracking-tight text-[var(--color-text-primary)]">Mi Familia</h1>
                            <p className="text-xs text-[var(--color-text-muted)] leading-tight">Planifica menus para todos</p>
                        </div>
                        {/* Add button in header */}
                        {!showForm && members.length < MAX_MEMBERS && (
                            <button
                                onClick={openAddForm}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
                                aria-label="Anadir miembro"
                            >
                                <span className="material-symbols-outlined text-xl">person_add</span>
                            </button>
                        )}
                    </div>
                </header>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide pb-28 pt-2 px-4 space-y-4">

                    {/* Intro banner */}
                    <div className="flex gap-3 p-4 rounded-2xl bg-orange-50 border border-orange-100">
                        <span className="material-symbols-outlined text-orange-500 shrink-0 text-xl mt-0.5">family_restroom</span>
                        <p className="text-sm text-orange-800 leading-relaxed">
                            Anade a los miembros de tu familia. NutriPlanner calculara las calorias de cada uno y ajustara las porciones de la lista de la compra.
                        </p>
                    </div>

                    {/* Member cards list */}
                    {members.length === 0 && !showForm ? (
                        <EmptyState onAdd={openAddForm} />
                    ) : (
                        <div className="space-y-3">
                            {members.map(member => (
                                <MemberCard
                                    key={member.id}
                                    member={member}
                                    isDeleting={deletingId === member.id}
                                    onEdit={() => openEditForm(member)}
                                    onDelete={() => handleDelete(member.id)}
                                />
                            ))}
                        </div>
                    )}

                    {/* Inline Add/Edit Form */}
                    {showForm && (
                        <MemberForm
                            formData={formData}
                            updateField={updateField}
                            isEditing={editingId !== null}
                            onSave={handleSave}
                            onCancel={closeForm}
                            previewCalories={previewCalories}
                            error={formError}
                            saving={saving}
                        />
                    )}

                    {/* Add more button (when members exist and form is closed) */}
                    {!showForm && members.length > 0 && members.length < MAX_MEMBERS && (
                        <button
                            onClick={openAddForm}
                            className="w-full py-3 rounded-2xl border-2 border-dashed border-orange-200 text-orange-500 text-sm font-medium hover:border-orange-400 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">add</span>
                            Anadir miembro ({members.length}/{MAX_MEMBERS})
                        </button>
                    )}

                    {/* Max members reached notice */}
                    {members.length >= MAX_MEMBERS && !showForm && (
                        <p className="text-center text-xs text-[var(--color-text-muted)] py-2">
                            Maximo de {MAX_MEMBERS} miembros alcanzado.
                        </p>
                    )}

                    {/* Family Summary Card */}
                    {members.length > 0 && (
                        <FamilySummaryCard
                            members={members}
                            totalCalories={totalCalories}
                            sharedAllergens={sharedAllergens}
                            sharedHatedFoods={sharedHatedFoods}
                            costPerPerson={costPerPerson}
                        />
                    )}

                </div>

                {/* Bottom Nav */}
                <BottomNav active="familia" />

            </div>
        </div>
    );
}

// ─── Member Card ───────────────────────────────────────────────────────────────

function MemberCard({ member, isDeleting, onEdit, onDelete }) {
    const preset = MEMBER_PRESETS.find(p => p.val === member.preset);
    const allergens = member.allergens ?? [];

    return (
        <div
            className={`bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm p-4 transition-opacity ${isDeleting ? 'opacity-40 pointer-events-none' : ''}`}
        >
            <div className="flex items-center gap-3">
                {/* Icon */}
                <div className="flex-shrink-0 h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="material-symbols-outlined text-orange-500 text-2xl">{preset?.icon || 'person'}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-[var(--color-text-primary)] text-base leading-tight truncate">{member.name}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {preset?.label || 'Adulto'} · {member.target_calories ?? preset?.kcal ?? 2000} kcal/dia
                    </p>
                    {/* Allergen pills */}
                    {allergens.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {allergens.map(a => (
                                <span key={a} className="text-[10px] bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                                    {a}
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1 shrink-0 ml-1">
                    <button
                        onClick={onEdit}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                        aria-label="Editar miembro"
                    >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button
                        onClick={onDelete}
                        className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-red-50 transition-colors text-[var(--color-text-muted)] hover:text-red-500"
                        aria-label="Eliminar miembro"
                    >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Member Form ───────────────────────────────────────────────────────────────

function MemberForm({ formData, updateField, isEditing, onSave, onCancel, previewCalories, error, saving }) {
    const isValid = formData.name.trim();
    const selectedPreset = MEMBER_PRESETS.find(p => p.val === formData.preset) || MEMBER_PRESETS[0];

    return (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-orange-200 shadow-sm p-5 space-y-4">
            {/* Form title */}
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-xl">
                    {isEditing ? 'edit' : 'person_add'}
                </span>
                <h3 className="font-bold text-[var(--color-text-primary)] text-base">
                    {isEditing ? 'Editar miembro' : 'Nuevo miembro'}
                </h3>
            </div>

            {/* Name */}
            <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Nombre</label>
                <input
                    type="text"
                    placeholder="Ej: Abuela, Hijo, Pareja..."
                    value={formData.name}
                    onChange={e => updateField('name', e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-orange-300 transition"
                    autoFocus
                />
            </div>

            {/* Preset selector */}
            <div>
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-2">Tipo de persona</label>
                <div className="grid grid-cols-5 gap-1.5">
                    {MEMBER_PRESETS.map(p => (
                        <button key={p.val} type="button"
                            onClick={() => {
                                updateField('preset', p.val);
                                updateField('age', p.age.toString());
                                updateField('gender', p.gender);
                                updateField('weight_kg', p.weight_kg.toString());
                                updateField('height_cm', p.height_cm.toString());
                            }}
                            className={`py-2.5 px-1 rounded-xl text-center border transition-all ${formData.preset === p.val
                                ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-orange-300'}`}>
                            <span className={`material-symbols-outlined text-lg block ${formData.preset === p.val ? 'text-white' : ''}`}>{p.icon}</span>
                            <span className="text-[10px] font-medium block">{p.label}</span>
                            <span className="text-[9px] opacity-70 block">{p.kcal} kcal</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Calorie preview */}
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                <span className="material-symbols-outlined text-orange-500 text-lg">local_fire_department</span>
                <div>
                    <p className="text-xs text-orange-700 font-medium">Calorias estimadas</p>
                    <p className="text-lg font-bold text-orange-600">
                        {formData.showAdvanced ? previewCalories : selectedPreset.kcal} kcal/dia
                    </p>
                </div>
            </div>

            {/* Advanced toggle */}
            <button type="button"
                onClick={() => updateField('showAdvanced', !formData.showAdvanced)}
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 transition-colors">
                <span className="material-symbols-outlined text-sm">
                    {formData.showAdvanced ? 'expand_less' : 'tune'}
                </span>
                {formData.showAdvanced ? 'Ocultar detalles' : 'Personalizar (opcional)'}
            </button>

            {/* Advanced fields (hidden by default) */}
            {formData.showAdvanced && (
                <div className="space-y-3 pt-1 border-t border-[var(--color-border)]">
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Edad</label>
                            <input type="number" min="1" max="120" value={formData.age}
                                onChange={e => updateField('age', e.target.value)}
                                className="w-full px-2 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Peso (kg)</label>
                            <input type="number" min="10" max="300" step="0.1" value={formData.weight_kg}
                                onChange={e => updateField('weight_kg', e.target.value)}
                                className="w-full px-2 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Altura (cm)</label>
                            <input type="number" min="50" max="250" value={formData.height_cm}
                                onChange={e => updateField('height_cm', e.target.value)}
                                className="w-full px-2 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Sexo</label>
                            <select value={formData.gender} onChange={e => updateField('gender', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]">
                                <option value="male">Hombre</option>
                                <option value="female">Mujer</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Actividad</label>
                            <select value={formData.activity_level} onChange={e => updateField('activity_level', e.target.value)}
                                className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]">
                                {ACTIVITY_OPTIONS.map(opt => (
                                    <option key={opt.val} value={opt.val}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">Objetivo</label>
                        <div className="grid grid-cols-3 gap-2">
                            {GOAL_OPTIONS.map(opt => (
                                <button key={opt.val} type="button"
                                    onClick={() => updateField('goal', opt.val)}
                                    className={`py-2 px-2 rounded-xl text-xs font-medium border transition-all ${
                                        formData.goal === opt.val
                                            ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                                            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-orange-300'
                                    }`}>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Error message */}
            {error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {error}
                </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
                <button
                    onClick={onCancel}
                    className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] font-medium hover:bg-[var(--color-bg-muted)] transition-colors"
                >
                    Cancelar
                </button>
                <button
                    onClick={onSave}
                    disabled={!isValid || saving}
                    className="flex-1 py-2.5 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-1.5"
                >
                    {saving ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <span className="material-symbols-outlined text-base">{isEditing ? 'save' : 'add'}</span>
                    )}
                    {isEditing ? 'Guardar' : 'Anadir'}
                </button>
            </div>
        </div>
    );
}

// ─── Family Summary Card ───────────────────────────────────────────────────────

function FamilySummaryCard({ members, totalCalories, sharedAllergens, sharedHatedFoods, costPerPerson }) {
    const hasShared = sharedAllergens.length > 0 || sharedHatedFoods.length > 0;

    return (
        <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-orange-500 text-xl">groups</span>
                <h3 className="font-bold text-[var(--color-text-primary)] text-base">Resumen familiar</h3>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-orange-600">{members.length}</p>
                    <p className="text-[10px] text-orange-700 uppercase font-bold mt-0.5">
                        {members.length === 1 ? 'Persona' : 'Personas'}
                    </p>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-orange-600">{totalCalories.toLocaleString('es-ES')}</p>
                    <p className="text-[10px] text-orange-700 uppercase font-bold mt-0.5">kcal/dia totales</p>
                </div>
            </div>

            {/* Cost per person from shopping data */}
            {costPerPerson && (
                <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                    <span className="material-symbols-outlined text-green-600 text-xl">shopping_bag</span>
                    <div>
                        <p className="text-xs text-green-700 font-medium">Coste estimado por persona</p>
                        <p className="text-lg font-bold text-green-700">~{costPerPerson}€/semana</p>
                    </div>
                </div>
            )}

            {/* Shared restrictions */}
            {hasShared && (
                <div className="space-y-2">
                    <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Restricciones compartidas</p>
                    {sharedAllergens.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {sharedAllergens.map(a => (
                                <span key={a} className="text-xs bg-red-50 text-red-600 border border-red-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">warning</span>
                                    {a}
                                </span>
                            ))}
                        </div>
                    )}
                    {sharedHatedFoods.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {sharedHatedFoods.map(f => (
                                <span key={f} className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-1 rounded-full font-medium flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">block</span>
                                    {f}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Member calorie breakdown */}
            <div className="space-y-1.5">
                <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">Desglose por miembro</p>
                {members.map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-orange-500 text-xs">person</span>
                        </div>
                        <p className="text-sm text-[var(--color-text-primary)] flex-1 truncate">{m.name}</p>
                        <p className="text-sm font-bold text-[var(--color-text-secondary)] shrink-0">{m.target_calories ?? '—'} kcal</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }) {
    return (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="h-20 w-20 rounded-full bg-orange-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-orange-400 text-4xl">family_restroom</span>
            </div>
            <div>
                <p className="font-bold text-[var(--color-text-primary)] text-lg mb-1">Sin miembros todavia</p>
                <p className="text-sm text-[var(--color-text-muted)] max-w-xs leading-relaxed">
                    Anade a tu pareja, hijos u otros convivientes para planificar el menu para toda la familia.
                </p>
            </div>
            <button
                onClick={onAdd}
                className="px-6 py-3 rounded-2xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition-colors flex items-center gap-2 shadow-md shadow-orange-200"
            >
                <span className="material-symbols-outlined text-lg">person_add</span>
                Anadir primer miembro
            </button>
        </div>
    );
}
