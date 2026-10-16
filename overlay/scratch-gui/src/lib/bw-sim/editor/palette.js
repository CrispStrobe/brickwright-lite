// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Palette for the Sim Lab editor (C4). Groups parts by category, provides
// German labels, and the set of solid colours for recolouring.

import {parseLDConfig} from '../view/ldraw-colors.js';

export const PALETTE_CATEGORIES = [
    {id: 'hub', en: 'Hub', de: 'Hub'},
    {id: 'motor', en: 'Motor', de: 'Motor'},
    {id: 'sensor', en: 'Sensor', de: 'Sensor'},
    {id: 'beam', en: 'Beam', de: 'Lochbalken'},
    {id: 'axle', en: 'Axle', de: 'Achse'},
    {id: 'pin', en: 'Pin', de: 'Verbinder/Pin'},
    {id: 'gear', en: 'Gear', de: 'Zahnrad'},
    {id: 'wheel', en: 'Wheel', de: 'Rad'},
    {id: 'other', en: 'Other', de: 'Sonstiges'}
];

const CATEGORY_ORDER = PALETTE_CATEGORIES.map(c => c.id);

export const paletteFrom = (catalog, {locale = 'en'} = {}) => {
    const map = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    const groups = new Map();
    for (const cat of CATEGORY_ORDER) groups.set(cat, []);
    for (const [part, meta] of map.entries()) {
        const cat = CATEGORY_ORDER.includes(meta.category) ? meta.category : 'other';
        const label = locale === 'de' && meta.nameDe ? meta.nameDe : meta.name;
        groups.get(cat).push({part, name: label, nameEn: meta.name, nameDe: meta.nameDe});
    }
    return PALETTE_CATEGORIES.map(({id, en, de}) => ({
        category: id,
        label: locale === 'de' ? de : en,
        parts: groups.get(id).slice().sort((a, b) => a.part.localeCompare(b.part))
    })).filter(g => g.parts.length > 0);
};

// Derived from LDConfig.ldr: opaque, non-metallic, non-rubber (no ALPHA, no MATERIAL)
export const getSolidColors = ldconfigText => {
    const colors = parseLDConfig(ldconfigText);
    const solids = [];
    for (const line of ldconfigText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('0 !COLOUR')) continue;
        const codeMatch = trimmed.match(/\bCODE\s+(\d+)/i);
        const alphaMatch = trimmed.match(/\bALPHA\b/i);
        const matMatch = trimmed.match(/\bMATERIAL\b/i);
        if (!codeMatch) continue;
        const code = parseInt(codeMatch[1], 10);
        if (alphaMatch || matMatch) continue;
        if (colors.has(code)) solids.push(code);
    }
    return solids.sort((a, b) => a - b);
};

export let SOLID_COLORS = [];
try {
    const {readFileSync} = await import('node:fs');
    const {join, dirname} = await import('node:path');
    const {fileURLToPath} = await import('node:url');
    const p = join(dirname(fileURLToPath(import.meta.url)), '../../../../static/ldraw/LDConfig.ldr');
    const text = readFileSync(p, 'utf8');
    SOLID_COLORS = getSolidColors(text);
} catch {}
