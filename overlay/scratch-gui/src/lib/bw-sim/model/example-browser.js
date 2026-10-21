// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
export const EXAMPLE_TOPICS = Object.freeze({
    linkages: {en: 'Linkages & motion conversion', de: 'Gestänge und Bewegungswandlung'},
    motion: {en: 'Motion & traction', de: 'Bewegung & Haftung'},
    sensing: {en: 'Sensors & feedback', de: 'Sensoren & Regelung'},
    forces: {en: 'Forces & gravity', de: 'Kräfte & Schwerkraft'},
    gears: {en: 'Gears & clutches', de: 'Zahnräder & Kupplungen'},
    chains: {en: 'Chain transmission', de: 'Kettenantrieb'},
    inertia: {en: 'Rotational inertia', de: 'Rotationsträgheit'},
    fluids: {en: 'Air pressure', de: 'Luftdruck'}
});

/** Pure filtering for the model gallery. Metadata stays separate from the model registry. */
export const filterModelExamples = (models, details, {query = '', topic = '', size = '', locale = 'en'} = {}) => {
    const q = query.trim().toLocaleLowerCase(locale);
    return models.filter(entry => {
        const key = entry.id || entry.file;
        const d = details[key];
        if (!d || (topic && d.topic !== topic)) return false;
        if (size === 'large' && d.pieces <= 50) return false;
        if (size === 'small' && d.pieces > 50) return false;
        const words = [entry.title[locale] || entry.title.en, d.description[locale] || d.description.en,
            EXAMPLE_TOPICS[d.topic]?.[locale], ...d.hubs, d.author, key].join(' ').toLocaleLowerCase(locale);
        return !q || words.includes(q);
    });
};
