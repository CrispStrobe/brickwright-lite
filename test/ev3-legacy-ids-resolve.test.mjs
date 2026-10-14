// SPDX-License-Identifier: Apache-2.0
//
// The retired EV3 ids must resolve, and the two copies of that list must agree.
//
// extension-manager.js INLINES the retired ids. It has to: the canonical table
// lives in scratch-gui/src/lib/ev3-legacy-migration.js, and the VM overlay is
// applied into scratch-gui's node_modules at integrate time, so no import path
// from there to here survives the build. Two strings is a cheap duplication —
// but only while something fails when they drift, which is this file.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {quietConsole} from './helpers/quiet-console.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
quietConsole();

const migration = await import('../overlay/scratch-gui/src/lib/ev3-legacy-migration.js');
const managerSource = readFileSync(
    resolve(root, 'overlay/scratch-vm/src/extension-support/extension-manager.js'), 'utf8');

/** Read a `const NAME = [...]` array literal out of the source, by brace matching. */
const arrayLiteral = (source, name) => {
    const start = source.indexOf(`const ${name} = [`);
    assert.notEqual(start, -1, `${name} is gone from extension-manager.js`);
    const open = source.indexOf('[', start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '[') depth++;
        else if (source[i] === ']' && --depth === 0) {
            return JSON.parse(source.slice(open, i + 1).replace(/'/g, '"'));
        }
    }
    throw new Error(`${name} literal is unterminated`);
};

test('the inlined retired ids match the canonical table', () => {
    assert.deepEqual(
        arrayLiteral(managerSource, 'EV3_LEGACY_IDS').sort(),
        [...migration.LEGACY_IDS].sort(),
        'extension-manager.js and ev3-legacy-migration.js disagree about which EV3 ids ' +
        'are retired; a project naming the one they disagree on would log a missing ' +
        'implementation for an extension that is present under another name');
    assert.match(managerSource, /const EV3_UNIFIED_ID = 'ev3comprehensive';/);
});

test('the retired ids have no loader of their own left', () => {
    // If a builtin entry survived, the id would load the OLD bundle and the
    // migration would be pointless — and the divergence would be invisible,
    // because both paths "work".
    for (const id of migration.LEGACY_IDS) {
        assert.doesNotMatch(managerSource, new RegExp(`\\n\\s+${id}: \\(\\) => import\\(`),
            `${id} still has a builtin loader, so it resolves to its own retired bundle`);
    }
    assert.match(managerSource, /\n\s+ev3comprehensive: \(\) => import\(/);
    // ev3dev keeps its own loader: different operating system, not retired.
    assert.match(managerSource, /\n\s+ev3dev: \(\) => import\(/,
        'ev3dev was retired along with the stock-firmware extensions; it should not be');
});

test('the retired bundles are gone from the tree', async () => {
    const {bundleIds} = await import('../scripts/spike/bundled-upstream.mjs');
    const {readdirSync} = await import('node:fs');
    const present = bundleIds(readdirSync);
    for (const id of migration.LEGACY_IDS) {
        assert.ok(!present.includes(id), `${id}'s bundle is still vendored`);
    }
    assert.ok(present.includes('ev3comprehensive'));
    assert.ok(present.includes('ev3dev'));
});
