/** Shared labels for editor and extension menus; values remain resource UUIDs. */
module.exports = function animationResourceMenuItems (resources, runtime) {
    const rows = resources instanceof Map ? [...resources].map(([id, resource]) => {
        const source = resource.source || {};
        const target = runtime?.getTargetById?.(source.targetId);
        const owner = [target?.getName?.() || source.targetName, source.costumeName].filter(Boolean).join(' / ');
        return {id: String(id), name: String(resource.name || id), owner};
    }) : [];
    const counts = values => values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
    const names = counts(rows.map(row => row.name));
    const bases = rows.map(row => names.get(row.name) > 1 ? `${row.name} — ${row.owner || 'Artwork'}` : row.name);
    const duplicates = counts(bases), reserved = new Set(bases), used = new Set();
    return rows.map((row, index) => {
        const base = bases[index];
        let text = base;
        if (duplicates.get(base) > 1) {
            let length = Math.min(6, row.id.length);
            while (length < row.id.length && rows.some(other => other.id !== row.id && other.id.endsWith(row.id.slice(-length)))) length++;
            text = `${base} [${row.id.slice(-length)}]`;
            let suffix = 2;
            const projected = text;
            while (reserved.has(text) || used.has(text)) text = `${projected} (${suffix++})`;
        }
        used.add(text);
        return {text, value: row.id};
    });
};
