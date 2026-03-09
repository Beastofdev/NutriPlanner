/**
 * Format a quantity + unit pair with proper spacing and pluralization.
 * Examples: "2 pellizcos", "500 g", "1 diente", "al gusto"
 */
export function formatQuantityUnit(qty, unit) {
    if (!qty && !unit) return '';
    if (!qty) return unit || '';

    const q = String(qty).trim();
    const u = (unit || '').trim();

    // Special cases
    if (u === 'al_gusto' || u === 'al gusto') return 'al gusto';
    if (u === 'un_chorrito' || u === 'chorrito') return q === '1' ? 'un chorrito' : `${q} chorritos`;

    // No unit
    if (!u || u === 'u' || u === 'ud' || u === 'unidad') {
        const num = parseFloat(q);
        return num === 1 ? `${q} ud` : `${q} uds`;
    }

    return `${q} ${u}`;
}
