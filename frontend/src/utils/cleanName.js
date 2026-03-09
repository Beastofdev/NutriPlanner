/**
 * Limpia nombres de ingredientes eliminando prefijos de categoría.
 * "Verdura Cebolla" → "Cebolla"
 * "lacteo_queso_feta" → "Queso Feta"
 * "Fruta Platano" → "Platano"
 */
export function cleanName(name) {
    if (!name) return '';

    let cleaned = name;

    // Handle underscore-separated canonical names: "carne_pechuga_pollo" → "pechuga_pollo"
    const underscorePrefixes = [
        'carne_', 'pescado_', 'verdura_', 'fruta_', 'lacteo_',
        'cereal_', 'legumbre_', 'pan_', 'aceite_', 'huevo_',
        'marisco_', 'yogur_', 'harina_', 'conserva_', 'especia_',
        'condimentos_', 'embutido_', 'frutos_secos_', 'pasta_',
        'bebida_vegetal_', 'verdura_procesada_',
    ];
    for (const prefix of underscorePrefixes) {
        if (cleaned.toLowerCase().startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length);
            break;
        }
    }

    // Handle space-separated display names: "Verdura Cebolla" → "Cebolla"
    const spacePrefixes = [
        'Carne ', 'Pescado ', 'Verdura ', 'Fruta ', 'Lácteo ', 'Lacteo ',
        'Cereal ', 'Legumbre ', 'Pan ', 'Aceite ', 'Huevo ', 'Marisco ',
        'Yogur ', 'Harina ', 'Conserva ', 'Especia ', 'Condimentos ',
        'Embutido ', 'Frutos Secos ', 'Pasta ', 'Bebida Vegetal ',
        'Verdura Procesada ', 'Procesada ',
    ];
    for (const prefix of spacePrefixes) {
        if (cleaned.startsWith(prefix)) {
            cleaned = cleaned.substring(prefix.length);
            break;
        }
    }

    // Replace underscores with spaces and capitalize
    cleaned = cleaned.replace(/_/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
