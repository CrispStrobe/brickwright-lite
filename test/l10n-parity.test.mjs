import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const overlay = resolve(here, '../overlay/scratch-gui/src');

/**
 * Extract L10N dict keys from a source file by parsing the L10N constant.
 * Returns { en: Set<string>, de: Set<string> } with flattened dot-paths for nested objects.
 */
function extractL10NKeys (src) {
    // Find the L10N object: const L10N = { en: { ... }, de: { ... } };
    const m = src.match(/const\s+L10N\s*=\s*\{([\s\S]*?)\n\};\s*\n/);
    if (!m) return null;
    const body = m[1];
    const result = {};
    for (const locale of ['en', 'de']) {
        const locRe = new RegExp(`${locale}:\\s*\\{([\\s\\S]*?)\\n    \\}`, 'g');
        const lm = locRe.exec(body);
        if (!lm) { result[locale] = new Set(); continue; }
        const keys = new Set();
        // Top-level keys: word followed by :
        for (const km of lm[1].matchAll(/^\s+(\w+)\s*:/gm)) {
            // Check if it's a nested object (h: { ... })
            const after = lm[1].slice(km.index + km[0].length);
            if (/^\s*\{/.test(after)) {
                // Nested object — extract sub-keys
                const nested = after.match(/\{([^}]*)\}/);
                if (nested) {
                    for (const sk of nested[1].matchAll(/(\w+)\s*:/g)) {
                        keys.add(`${km[1]}.${sk[1]}`);
                    }
                }
            } else {
                keys.add(km[1]);
            }
        }
        result[locale] = keys;
    }
    return result;
}

test('pseudocode-importer L10N: en and de have identical key sets', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    const keys = extractL10NKeys(src);
    assert.ok(keys, 'L10N constant not found');
    assert.ok(keys.en.size > 0, 'en dict is empty');
    assert.ok(keys.de.size > 0, 'de dict is empty');

    const enOnly = [...keys.en].filter(k => !keys.de.has(k));
    const deOnly = [...keys.de].filter(k => !keys.en.has(k));

    if (enOnly.length) {
        assert.fail(`Keys in en but NOT in de: ${enOnly.join(', ')}`);
    }
    if (deOnly.length) {
        assert.fail(`Keys in de but NOT in en: ${deOnly.join(', ')}`);
    }
});

test('pseudocode-importer L10N: de dict has no broken umlauts', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    // Common umlaut defects found historically
    const broken = [
        ['ausfuhren', 'ausführen'],
        ['zurückfuhren', 'zurückführen'],
        ['Blocke ', 'Blöcke '],
        ['geratespezifisch', 'gerätespezifisch']
    ];
    for (const [bad, fix] of broken) {
        assert.ok(!src.includes(bad), `Broken umlaut: "${bad}" should be "${fix}"`);
    }
});

test('microbit-sim-pane L10N: en and de have identical key sets', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/microbit-sim-pane.jsx'), 'utf8'
    );
    const keys = extractL10NKeys(src);
    assert.ok(keys, 'L10N constant not found in microbit-sim-pane');
    const enOnly = [...keys.en].filter(k => !keys.de.has(k));
    const deOnly = [...keys.de].filter(k => !keys.en.has(k));
    if (enOnly.length) assert.fail(`en-only: ${enOnly.join(', ')}`);
    if (deOnly.length) assert.fail(`de-only: ${deOnly.join(', ')}`);
});

test('SUPPORTED has an asm entry (reference crash guard)', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(/SUPPORTED\s*=\s*\{[\s\S]*?asm:\s*\[/.test(src),
        'SUPPORTED missing asm entry — clicking ASM Reference will crash');
});

test('reference render uses || [] guard', () => {
    const src = readFileSync(
        resolve(overlay, 'components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8'
    );
    assert.ok(src.includes('SUPPORTED[this.state.lang] || []'),
        'Missing || [] guard on SUPPORTED lookup — unknown lang will crash .map()');
});
