/**
 * ROADMAP §3.5 item 3: the Circuit tab's import/export menus name other
 * makers' file formats (nominative use), so the "Not affiliated" disclaimer
 * must name them too -- in README and in both store descriptions. The names
 * are DERIVED from the menus the app renders (bw-circuit-ui's importer list
 * and exporter registry), so a format added upstream reds here until the
 * disclaimer names it or it is shown to be generic.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageSourceRoot} from './helpers/package-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI = packageSourceRoot('bw-circuit-ui');

// Leading words of menu labels that are nobody's mark: descriptive words, and
// open formats/languages (SPICE, LaTeX, Gerber).
const GENERIC = new Set(['File', 'Breadboard', 'Diagram', 'SPICE', 'LaTeX', 'Schematic', 'Picture', 'Gerber']);

function formatNames () {
    const names = new Set();
    for (const rel of ['importers/index.js', 'model/exporters/registry.js']) {
        const src = readFileSync(path.join(UI, rel), 'utf8');
        const labels = [...src.matchAll(/\blabel: '([^']+)'/g)].map(m => m[1]);
        assert.ok(labels.length >= 5, `${rel}: ${labels.length} labels; the parse is suspect`);
        for (const label of labels) {
            const lead = label.split(/[\s(]/)[0];
            if (!GENERIC.has(lead)) names.add(lead);
        }
    }
    return [...names].sort();
}

const between = (text, from, to) => {
    const a = text.indexOf(from);
    assert.ok(a >= 0, `"${from}" not found`);
    const b = text.indexOf(to, a);
    assert.ok(b > a, `"${to}" not found after "${from}"`);
    return text.slice(a, b);
};

test('the disclaimers name every brand the import/export menus show', () => {
    const names = formatNames();
    assert.ok(names.includes('KiCad'), `derived ${names.join(', ')}: KiCad missing, the parse is suspect`);
    const readme = readFileSync(path.join(REPO, 'README.md'), 'utf8');
    const store = readFileSync(path.join(REPO, 'docs/app-store-metadata.md'), 'utf8');
    const places = {
        'README "Affiliation"': between(readme, 'Not affiliated with', 'owners.'),
        'App Store (en)': between(store, 'Brickwright is not affiliated with', 'owners.'),
        'App Store (de)': between(store, 'Brickwright steht in keiner Verbindung', 'Inhabern.')
    };
    for (const [where, text] of Object.entries(places)) {
        const missing = names.filter(n => !text.replace(/\s+/g, ' ').includes(n));
        assert.deepEqual(missing, [], `${where} does not name ${missing.join(', ')}`);
    }
});
