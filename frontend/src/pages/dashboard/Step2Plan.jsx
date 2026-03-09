import { useState } from 'react';
import { api } from '../../services/api';

const MEMBER_PRESETS = [
    { val: 'adult_male', label: 'Adulto', icon: 'person', kcal: 2000, age: 35, gender: 'male', weight_kg: 75, height_cm: 175 },
    { val: 'adult_female', label: 'Adulta', icon: 'person', kcal: 1700, age: 35, gender: 'female', weight_kg: 62, height_cm: 163 },
    { val: 'teen', label: 'Adolescente', icon: 'face', kcal: 1800, age: 15, gender: 'male', weight_kg: 55, height_cm: 165 },
    { val: 'child', label: 'Niño/a', icon: 'child_care', kcal: 1400, age: 8, gender: 'male', weight_kg: 28, height_cm: 128 },
    { val: 'elderly', label: 'Mayor', icon: 'elderly', kcal: 1600, age: 70, gender: 'male', weight_kg: 70, height_cm: 168 },
];

const ACTIVITY_OPTIONS = [
    { val: 'sedentary', label: 'Sedentario' },
    { val: 'light', label: 'Ligero' },
    { val: 'moderate', label: 'Moderado' },
    { val: 'active', label: 'Activo' },
    { val: 'very_active', label: 'Muy activo' },
];

const GOAL_OPTIONS = [
    { val: 'lose_weight', label: 'Perder peso' },
    { val: 'maintain', label: 'Mantener' },
    { val: 'gain_muscle', label: 'Ganar músculo' },
];

const calcCalories = (member) => {
    const { age, weight_kg, height_cm, gender, activity_level, goal } = member;
    if (!age || !weight_kg || !height_cm) return 2000;
    let geb = gender === 'male'
        ? 66.5 + 13.75 * weight_kg + 5.003 * height_cm - 6.755 * age
        : 655 + 9.56 * weight_kg + 1.85 * height_cm - 4.7 * age;
    const mult = gender === 'male'
        ? { sedentary: 1.3, light: 1.6, moderate: 1.7, active: 2.1, very_active: 2.4 }
        : { sedentary: 1.3, light: 1.5, moderate: 1.6, active: 1.9, very_active: 2.2 };
    let tdee = geb * (mult[activity_level] || 1.3);
    if (goal === 'lose_weight') tdee -= 400;
    if (goal === 'gain_muscle') tdee += 400;
    return Math.round(tdee);
};

const EMPTY_MEMBER = { name: '', preset: 'adult_male', age: 35, gender: 'male', weight_kg: 75, height_cm: 175, activity_level: 'moderate', goal: 'maintain', allergens: [], hated_foods: [], showAdvanced: false };

const Step2Plan = ({ formData, updateForm, nextStep, prevStep, targetCalories }) => {
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingMember, setEditingMember] = useState({ ...EMPTY_MEMBER });
    const [editingIdx, setEditingIdx] = useState(null);
    const [familyLoadedFromDB, setFamilyLoadedFromDB] = useState(false);
    const familyMembers = formData.familyMembers || [];

    const familyEnabled = familyMembers.length > 0 || showAddForm;
    const totalFamilyCal = familyMembers.reduce((sum, m) => sum + (m.target_calories || 0), 0);

    const handleSaveMember = () => {
        const m = editingMember;
        if (!m.name) return;
        // Use preset defaults if no custom values set, otherwise calculate
        const preset = MEMBER_PRESETS.find(p => p.val === m.preset);
        const age = +m.age || preset?.age || 35;
        const weight_kg = +m.weight_kg || preset?.weight_kg || 70;
        const height_cm = +m.height_cm || preset?.height_cm || 170;
        const kcal = m.showAdvanced
            ? calcCalories({ ...m, age, weight_kg, height_cm })
            : (preset?.kcal || 2000);
        const saved = { ...m, age, weight_kg, height_cm, target_calories: kcal };
        const updated = [...familyMembers];
        if (editingIdx !== null) {
            updated[editingIdx] = saved;
        } else {
            updated.push(saved);
        }
        updateForm('familyMembers', updated);
        setEditingMember({ ...EMPTY_MEMBER });
        setShowAddForm(false);
        setEditingIdx(null);

        // Persist to DB in the background (fire-and-forget)
        const token = localStorage.getItem('token');
        if (token) {
            const apiMember = {
                name: saved.name,
                age: saved.age,
                gender: saved.gender,
                weight_kg: saved.weight_kg,
                height_cm: saved.height_cm,
                activity_level: saved.activity_level || 'moderate',
                goal: saved.goal || 'maintain',
                target_calories: saved.target_calories || 2000,
                allergens: saved.allergens || [],
                hated_foods: saved.hated_foods || [],
            };
            if (editingIdx !== null && saved.id) {
                api.updateFamilyMember(saved.id, apiMember).catch(err => console.warn('Family member update failed:', err));
            } else if (editingIdx === null) {
                api.addFamilyMember(apiMember)
                    .then(created => {
                        // Attach the returned DB id to the member in local state
                        updateForm('familyMembers', updated.map((mem, i) =>
                            i === updated.length - 1 ? { ...mem, id: created.id } : mem
                        ));
                    })
                    .catch(err => console.warn('Family member add failed:', err));
            }
        }
    };

    const handleRemoveMember = (idx) => {
        const member = familyMembers[idx];
        const updated = familyMembers.filter((_, i) => i !== idx);
        // Optimistic removal from local state
        updateForm('familyMembers', updated);
        // Persist deletion to DB in the background (fire-and-forget)
        const token = localStorage.getItem('token');
        if (token && member.id) {
            api.deleteFamilyMember(member.id).catch(err => console.warn('Family member delete failed:', err));
        }
    };

    const handleEditMember = (idx) => {
        setEditingMember({ ...familyMembers[idx] });
        setEditingIdx(idx);
        setShowAddForm(true);
    };

    const dietOptions = [
        { label: 'Omnívoro', value: 'omnivoro' },
        { label: 'Vegano', value: 'vegano' },
        { label: 'Vegetariano', value: 'vegetariano' },
        { label: 'Sin Gluten', value: 'sin_gluten' },
        { label: 'Keto', value: 'keto' },
        { label: 'Paleo', value: 'paleo' },
        { label: 'Sin Lactosa', value: 'sin_lactosa' },
    ];

    return (
        <div className="relative flex h-auto min-h-screen w-full flex-col max-w-md lg:max-w-5xl mx-auto bg-[var(--color-bg-page)]">
            <div className="sticky top-0 z-40 flex items-center bg-[var(--color-bg-header)] backdrop-blur-md p-4 pb-2 justify-between border-b border-[var(--color-border)]">
                <button onClick={prevStep} className="text-[var(--color-text-primary)] flex size-12 shrink-0 items-center justify-center rounded-full hover:bg-[var(--color-bg-muted)]"><span className="material-symbols-outlined text-2xl">arrow_back</span></button>
                <h2 className="text-[var(--color-text-primary)] text-lg font-bold flex-1 text-center pr-12">Preferencias</h2>
            </div>

            <div className="flex w-full flex-col items-center justify-center gap-2 py-4">
                <div className="flex flex-row items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-8 rounded-full bg-[var(--color-primary)] shadow-[0_0_10px_rgba(232,97,26,0.4)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                    <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-border)]"></div>
                </div>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">Paso 2 de 4</p>
            </div>

            <div className="flex-1 px-4 pb-32 space-y-6">
                {/* Calories Info Banner */}
                <div className="group relative overflow-hidden rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-primary)]/20 p-4 transition-all">
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-[var(--color-tint-teal)] blur-2xl"></div>
                    <div className="relative flex gap-4 items-center">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-tint-teal)] text-[var(--color-primary)] text-xl"><span className="material-symbols-outlined">link</span></div>
                        <div>
                            <h3 className="font-bold text-[var(--color-text-primary)] text-sm">Sincronizado con Perfil</h3>
                            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">Objetivo calórico: <span className="text-[var(--color-text-primary)] font-bold">{targetCalories ? Math.round(targetCalories) : '...'} kcal</span></p>
                        </div>
                    </div>
                </div>

                {/* Diet Style */}
                <div>
                    <h3 className="text-[var(--color-text-primary)] text-xl font-bold mb-4">Estilo de Dieta</h3>
                    <div className="flex flex-wrap gap-2">
                        {dietOptions.map(opt => (
                            <label key={opt.value} className="cursor-pointer">
                                <input
                                    type="radio"
                                    name="diet"
                                    className="peer sr-only"
                                    checked={formData.diet === opt.value}
                                    onChange={() => updateForm('diet', opt.value)}
                                />
                                <div className="px-4 py-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] text-sm peer-checked:border-[var(--color-primary)] peer-checked:text-[var(--color-primary)] peer-checked:bg-[var(--color-tint-teal)] transition-all hover:border-[var(--color-primary)]/30">
                                    {opt.label}
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Plan Duration + Meals per Day - 2 cols on desktop */}
                <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-6 lg:space-y-0">
                    <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                        <h3 className="text-[var(--color-text-primary)] text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-xl">calendar_month</span> Duración del Plan
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                            {[1, 3, 5, 7].map(d => (
                                <button
                                    key={d}
                                    type="button"
                                    onClick={() => updateForm('planDays', d)}
                                    className={`py-3 rounded-xl text-sm font-bold border transition-all ${formData.planDays === d
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    {d} {d === 1 ? 'día' : 'días'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Meals per Day */}
                    <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                        <h3 className="text-[var(--color-text-primary)] text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-xl">restaurant</span> Comidas por Día
                        </h3>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                            {[
                                { val: 2, label: 'Ayuno', desc: 'Comida + Cena', icon: 'schedule' },
                                { val: 3, label: 'Tradicional', desc: 'Desayuno + Comida + Cena', icon: 'skillet' },
                                { val: 4, label: 'Equilibrado', desc: 'Con merienda', icon: 'balance' },
                                { val: 5, label: 'Completo', desc: '5 comidas al dia', icon: 'fitness_center' }
                            ].map(m => (
                                <button
                                    key={m.val}
                                    type="button"
                                    onClick={() => updateForm('mealsPerDay', m.val)}
                                    className={`py-3 px-2 rounded-xl text-center border transition-all ${formData.mealsPerDay === m.val
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-lg block">{m.icon}</span>
                                    <span className="font-bold text-sm block">{m.val} comidas</span>
                                    <span className="text-xs opacity-70 block">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Cooking Time + Skill Level - 2 cols on desktop */}
                <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-6 lg:space-y-0">
                    <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                        <h3 className="text-[var(--color-text-primary)] text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-xl">timer</span> Tiempo para Cocinar
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { val: 'express', label: 'Express', desc: '≤15 min', icon: 'bolt' },
                                { val: 'normal', label: 'Normal', desc: '15-45 min', icon: 'schedule' },
                                { val: 'chef', label: 'Chef', desc: '45+ min', icon: 'soup_kitchen' }
                            ].map(t => (
                                <button
                                    key={t.val}
                                    type="button"
                                    onClick={() => updateForm('cookingTime', t.val)}
                                    className={`py-3 px-2 rounded-xl text-center border transition-all ${formData.cookingTime === t.val
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-lg block">{t.icon}</span>
                                    <span className="font-bold text-sm block">{t.label}</span>
                                    <span className="text-xs opacity-70 block">{t.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Skill Level */}
                    <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                        <h3 className="text-[var(--color-text-primary)] text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-xl">emoji_events</span> Nivel de Cocina
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { val: 'beginner', label: 'Básico', desc: 'Recetas fáciles', icon: 'child_care' },
                                { val: 'intermediate', label: 'Medio', desc: 'Algo de técnica', icon: 'person' },
                                { val: 'advanced', label: 'Avanzado', desc: 'Platos elaborados', icon: 'military_tech' }
                            ].map(s => (
                                <button
                                    key={s.val}
                                    type="button"
                                    onClick={() => updateForm('skillLevel', s.val)}
                                    className={`py-3 px-2 rounded-xl text-center border transition-all ${formData.skillLevel === s.val
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-lg block">{s.icon}</span>
                                    <span className="font-bold text-sm block">{s.label}</span>
                                    <span className="text-xs opacity-70 block">{s.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Meal Prep Mode */}
                <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                    <button
                        type="button"
                        onClick={() => updateForm('mealPrep', !formData.mealPrep)}
                        className="w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${formData.mealPrep ? 'bg-[var(--color-tint-teal)] text-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'}`}>
                                <span className="material-symbols-outlined text-xl">kitchen</span>
                            </div>
                            <div className="text-left">
                                <h3 className="text-[var(--color-text-primary)] text-lg font-bold">Meal Prep</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">Cocinar en lotes para toda la semana</p>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${formData.mealPrep ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-bg-muted)]'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${formData.mealPrep ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                    </button>
                    {formData.mealPrep && (
                        <p className="mt-3 text-xs text-[var(--color-primary)]/80 bg-[var(--color-tint-teal)] p-3 rounded-lg">
                            <span className="material-symbols-outlined text-sm align-text-bottom mr-1">info</span>
                            Las recetas se diseñarán para cocinar en 1-2 sesiones y conservar bien durante la semana.
                        </p>
                    )}
                </div>

                {/* Family Mode */}
                <div className="bg-[var(--color-bg-card)] p-5 rounded-xl border border-[var(--color-border)]">
                    <button
                        type="button"
                        onClick={() => {
                            if (familyEnabled && familyMembers.length === 0) {
                                setShowAddForm(false);
                            } else if (!familyEnabled) {
                                // Try to load saved members from DB before showing the form
                                const token = localStorage.getItem('token');
                                if (token) {
                                    api.getFamilyMembers()
                                        .then(members => {
                                            if (members && members.length > 0) {
                                                updateForm('familyMembers', members);
                                                setFamilyLoadedFromDB(true);
                                                setShowAddForm(false);
                                            } else {
                                                setShowAddForm(true);
                                            }
                                        })
                                        .catch(err => {
                                            console.warn('Could not load family members from DB:', err);
                                            setShowAddForm(true);
                                        });
                                } else {
                                    setShowAddForm(true);
                                }
                            } else {
                                updateForm('familyMembers', []);
                                setFamilyLoadedFromDB(false);
                                setShowAddForm(false);
                            }
                        }}
                        className="w-full flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${familyEnabled ? 'bg-orange-100 text-orange-600' : 'bg-[var(--color-bg-muted)] text-[var(--color-text-muted)]'}`}>
                                <span className="material-symbols-outlined text-xl">family_restroom</span>
                            </div>
                            <div className="text-left">
                                <h3 className="text-[var(--color-text-primary)] text-lg font-bold">Modo Familia</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">Planifica para toda la familia a la vez</p>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors ${familyEnabled ? 'bg-orange-500' : 'bg-[var(--color-bg-muted)]'}`}>
                            <div className={`w-5 h-5 rounded-full bg-white transition-transform ${familyEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                        </div>
                    </button>

                    {familyEnabled && (
                        <div className="mt-4 space-y-3">
                            {/* Auto-save indicator */}
                            <p className="text-[var(--color-text-muted)] text-xs italic">
                                Tu familia se guarda automáticamente
                            </p>

                            {/* Loaded from DB banner */}
                            {familyLoadedFromDB && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-orange-500 text-base">cloud_done</span>
                                    <p className="text-xs text-orange-700">Tu familia anterior cargada</p>
                                </div>
                            )}

                            {/* Existing members */}
                            {familyMembers.map((m, idx) => {
                                const preset = MEMBER_PRESETS.find(p => p.val === m.preset);
                                return (
                                <div key={idx} className="flex items-center gap-3 bg-[var(--color-bg-muted)] rounded-lg p-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                                        <span className="material-symbols-outlined text-base">{preset?.icon || 'person'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{m.name}</p>
                                        <p className="text-xs text-[var(--color-text-muted)]">
                                            {preset?.label || 'Adulto'} · {m.target_calories || preset?.kcal || 2000} kcal
                                        </p>
                                    </div>
                                    <button onClick={() => handleEditMember(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)]">
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                    </button>
                                    <button onClick={() => handleRemoveMember(idx)} className="text-[var(--color-text-muted)] hover:text-red-500">
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                </div>
                                );
                            })}

                            {/* Total calories banner */}
                            {familyMembers.length > 0 && (
                                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-orange-600 text-lg">calculate</span>
                                    <p className="text-xs text-orange-800">
                                        <span className="font-bold">{familyMembers.length} miembros</span> · Total: <span className="font-bold">{totalFamilyCal} kcal/día</span>
                                    </p>
                                </div>
                            )}

                            {/* Add member form */}
                            {showAddForm ? (
                                <div className="border border-[var(--color-border)] rounded-xl p-4 space-y-3 bg-[var(--color-bg-page)]">
                                    <h4 className="text-sm font-bold text-[var(--color-text-primary)]">
                                        {editingIdx !== null ? 'Editar miembro' : 'Añadir miembro'}
                                    </h4>
                                    <input
                                        type="text"
                                        placeholder="Nombre (ej: Abuela, Hijo, Pareja...)"
                                        value={editingMember.name}
                                        onChange={e => setEditingMember(p => ({ ...p, name: e.target.value }))}
                                        className="w-full px-3 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]"
                                        autoFocus
                                    />
                                    {/* Preset selector */}
                                    <div>
                                        <label className="text-xs text-[var(--color-text-muted)] mb-2 block">Tipo de persona</label>
                                        <div className="grid grid-cols-5 gap-1.5">
                                            {MEMBER_PRESETS.map(p => (
                                                <button key={p.val} type="button"
                                                    onClick={() => setEditingMember(prev => ({
                                                        ...prev, preset: p.val, age: p.age, gender: p.gender,
                                                        weight_kg: p.weight_kg, height_cm: p.height_cm,
                                                    }))}
                                                    className={`py-2 px-1 rounded-lg text-center border transition-all ${editingMember.preset === p.val
                                                        ? 'bg-orange-500 text-white border-orange-500'
                                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)]'}`}>
                                                    <span className={`material-symbols-outlined text-lg block ${editingMember.preset === p.val ? 'text-white' : ''}`}>{p.icon}</span>
                                                    <span className="text-[10px] font-medium block">{p.label}</span>
                                                    <span className="text-[9px] opacity-70 block">{p.kcal} kcal</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Advanced toggle */}
                                    <button type="button"
                                        onClick={() => setEditingMember(p => ({ ...p, showAdvanced: !p.showAdvanced }))}
                                        className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] flex items-center gap-1 transition-colors">
                                        <span className="material-symbols-outlined text-sm">
                                            {editingMember.showAdvanced ? 'expand_less' : 'tune'}
                                        </span>
                                        {editingMember.showAdvanced ? 'Ocultar detalles' : 'Personalizar (opcional)'}
                                    </button>
                                    {/* Advanced fields (hidden by default) */}
                                    {editingMember.showAdvanced && (
                                        <div className="space-y-2 pt-1 border-t border-[var(--color-border)]">
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="text-xs text-[var(--color-text-muted)]">Edad</label>
                                                    <input type="number" value={editingMember.age} onChange={e => setEditingMember(p => ({ ...p, age: e.target.value }))}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-[var(--color-text-muted)]">Peso (kg)</label>
                                                    <input type="number" value={editingMember.weight_kg} onChange={e => setEditingMember(p => ({ ...p, weight_kg: e.target.value }))}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-[var(--color-text-muted)]">Altura (cm)</label>
                                                    <input type="number" value={editingMember.height_cm} onChange={e => setEditingMember(p => ({ ...p, height_cm: e.target.value }))}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <label className="text-xs text-[var(--color-text-muted)]">Sexo</label>
                                                    <select value={editingMember.gender} onChange={e => setEditingMember(p => ({ ...p, gender: e.target.value }))}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]">
                                                        <option value="male">Hombre</option>
                                                        <option value="female">Mujer</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-[var(--color-text-muted)]">Actividad</label>
                                                    <select value={editingMember.activity_level} onChange={e => setEditingMember(p => ({ ...p, activity_level: e.target.value }))}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] text-sm text-[var(--color-text-primary)]">
                                                        {ACTIVITY_OPTIONS.map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-[var(--color-text-muted)]">Objetivo</label>
                                                <div className="grid grid-cols-3 gap-2 mt-1">
                                                    {GOAL_OPTIONS.map(g => (
                                                        <button key={g.val} type="button" onClick={() => setEditingMember(p => ({ ...p, goal: g.val }))}
                                                            className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-all ${editingMember.goal === g.val
                                                                ? 'bg-orange-500 text-white border-orange-500'
                                                                : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)]'}`}>
                                                            {g.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => { setShowAddForm(false); setEditingIdx(null); setEditingMember({ ...EMPTY_MEMBER }); }}
                                            className="flex-1 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)]">
                                            Cancelar
                                        </button>
                                        <button onClick={handleSaveMember}
                                            disabled={!editingMember.name}
                                            className="flex-1 py-2 rounded-lg bg-orange-500 text-white text-sm font-bold disabled:opacity-40">
                                            {editingIdx !== null ? 'Guardar' : 'Añadir'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => { setEditingMember({ ...EMPTY_MEMBER }); setEditingIdx(null); setShowAddForm(true); }}
                                    disabled={familyMembers.length >= 8}
                                    className="w-full py-2.5 rounded-lg border-2 border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-muted)] hover:border-orange-300 hover:text-orange-500 transition-colors flex items-center justify-center gap-1 disabled:opacity-40"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    Añadir miembro ({familyMembers.length}/8)
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Nivel Económico + Modo de Menú */}
                <div>
                    <h3 className="text-[var(--color-text-primary)] text-xl font-bold mb-4">Economía</h3>
                    <div className="space-y-4">
                        <div>
                            <p className="text-[var(--color-text-secondary)] text-sm mb-3">Nivel de gasto semanal</p>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { val: 'economico', label: 'Económico', icon: 'savings', desc: 'Recetas asequibles' },
                                    { val: 'normal', label: 'Normal', icon: 'balance', desc: 'Equilibrio calidad-precio' },
                                    { val: 'premium', label: 'Premium', icon: 'diamond', desc: 'Sin restricciones' },
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        type="button"
                                        onClick={() => updateForm('economicLevel', opt.val)}
                                        className={`p-3 rounded-xl border transition-all text-center ${formData.economicLevel === opt.val
                                            ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                            : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                            }`}
                                    >
                                        <span className="material-symbols-outlined text-xl block mb-1">{opt.icon}</span>
                                        <span className="font-bold text-xs block">{opt.label}</span>
                                        <span className="text-[10px] opacity-60 block mt-0.5">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="bg-[var(--color-bg-card)] p-4 rounded-xl border border-[var(--color-border)]">
                            <p className="text-[var(--color-text-secondary)] text-sm mb-3">Estilo de planificación</p>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => updateForm('menuMode', 'savings')}
                                    className={`p-4 rounded-xl border transition-all text-center ${formData.menuMode === 'savings'
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-2xl block mb-1">savings</span>
                                    <span className="font-bold text-sm block">Ahorro Máximo</span>
                                    <span className="text-xs opacity-70 block">Repite platos, cero desperdicio</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateForm('menuMode', 'variety')}
                                    className={`p-4 rounded-xl border transition-all text-center ${formData.menuMode === 'variety'
                                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)] shadow-lg shadow-[var(--color-primary)]/20'
                                        : 'bg-[var(--color-bg-muted)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-primary)]/30'
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-2xl block mb-1">restaurant</span>
                                    <span className="font-bold text-sm block">Máxima Variedad</span>
                                    <span className="text-xs opacity-70 block">Platos diferentes cada día</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 w-full bg-[var(--color-bg-header)] backdrop-blur-md border-t border-[var(--color-border)] p-4 z-50 flex justify-center">
                <div className="w-full max-w-md lg:max-w-5xl">
                    <button
                        onClick={nextStep}
                        style={{ background: 'var(--gradient-hero)' }}
                        className="w-full h-14 text-white font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-[var(--color-primary)]/20"
                    >
                        Continuar <span className="material-symbols-outlined text-xl">arrow_forward</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Step2Plan;
