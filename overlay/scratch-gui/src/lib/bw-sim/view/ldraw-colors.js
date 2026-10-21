// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Parse LDraw's LDConfig.ldr colour table into a Map from code to
// {name, value, edge, alpha}. Used by the 3D view to colour parts.

// Direct colours are encoded in a file as 0x2RRGGBB and need no LDConfig row.
// Keep the same Map interface so placed colours and printed subfaces agree.
class LDrawColors extends Map {
    get (code) {
        if (Number.isInteger(code) && code >= 0x2000000 && code <= 0x2ffffff) {
            return {name: 'Direct', value: `#${(code - 0x2000000).toString(16).padStart(6, '0')}`,
                edge: '#333333', alpha: 1};
        }
        return super.get(code);
    }
    has (code) {
        return (Number.isInteger(code) && code >= 0x2000000 && code <= 0x2ffffff) || super.has(code);
    }
}

/**
 * Parse LDConfig text.
 * Each colour is 0 !COLOUR name CODE n VALUE #rrggbb EDGE #rrggbb [ALPHA a] ...
 * @param {string} text
 * @returns {Map<number, {name: string, value: string, edge: string, alpha: number}>}
 */
export const parseLDConfig = text => {
    const map = new LDrawColors();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line.startsWith('0 !COLOUR')) continue;
        // Extract fields via regex
        const nameMatch = line.match(/^0\s+!COLOUR\s+(\S+)/i);
        const codeMatch = line.match(/\bCODE\s+(\d+)/i);
        const valueMatch = line.match(/\bVALUE\s+(#[0-9a-fA-F]{6})/);
        const edgeMatch = line.match(/\bEDGE\s+(#[0-9a-fA-F]{6})/);
        const alphaMatch = line.match(/\bALPHA\s+(\d+)/i);
        if (!nameMatch || !codeMatch || !valueMatch || !edgeMatch) continue;
        const name = nameMatch[1];
        const code = parseInt(codeMatch[1], 10);
        const value = valueMatch[1].toLowerCase();
        const edge = edgeMatch[1].toLowerCase();
        const alpha = alphaMatch ? parseInt(alphaMatch[1], 10) / 255 : 1;
        map.set(code, {name, value, edge, alpha});
    }
    return map;
};

/**
 * Load LDConfig from the vendored library.
 * @param {(path: string) => string|undefined} read
 * @returns {Map<number, object>}
 */
export const loadLDConfig = read => {
    const text = read('LDConfig.ldr') || read('ldconfig.ldr');
    if (!text) return new Map();
    return parseLDConfig(text);
};
