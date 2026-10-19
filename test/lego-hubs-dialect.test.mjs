// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The `pup …`, `boost …` and `wedo …` words (overlay/scratch-gui/src/lib/legoHubsDialect.js): one
 * table for the parser and the decompiler of the bundled legopoweredup, legoboostunified and
 * wedo2unified blocks, layered at the robot-lab door (lib/robot-lab-pseudocode.js).
 *
 *   - THE SLICE IS COUNTED: every opcode of each extension's getInfo() is a word or in exactly
 *     one exclusion class, and nothing else is;
 *   - every word's arguments are the block's, with the extension's own menus: an acceptReporters
 *     menu is a shadow input, any other menu a field (scratch-vm runtime _convertPlaceholders);
 *   - every word round-trips: text → blocks → text, the same line;
 *   - the shipped examples parse into blocks of the real extensions only.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {importSource, REPO} from './helpers/bw-integrated.mjs';
import {bundledExtensionIds, loadExtensionClass} from './helpers/bw-extensions.mjs';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();
globalThis.window = globalThis.window || globalThis;
globalThis.document = globalThis.document || {documentElement: {lang: 'en'}};
globalThis.localStorage = globalThis.localStorage || {getItem: () => null, setItem: () => {}};
globalThis.addEventListener = globalThis.addEventListener || (() => {});

const {LEGO_HUB_WORDS, LEGO_HUB_EXCLUSIONS, LEGO_HUB_EXTENSIONS, legoHubWordFor} = await importSource('src/lib/legoHubsDialect.js');
const Creator = (await importSource('src/lib/sb3-creator-register-art.js')).default;

const runtime = {getLocale: () => 'en', on () {}, emit () {}, registerPeripheralExtension () {}, constructor: {}};
// The extensions start a locale poll (an interval) on load: built with inert timers, so the run can end.
const saved = [globalThis.setInterval, globalThis.setTimeout];
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
let infos;
try {
    infos = Object.fromEntries(Object.keys(LEGO_HUB_EXTENSIONS).map(id => {
        const Cls = loadExtensionClass(bundledExtensionIds().get(id));
        return [id, new Cls(runtime).getInfo()];
    }));
} finally {
    [globalThis.setInterval, globalThis.setTimeout] = saved;
}

test('the slice is counted: every opcode of the three extensions is a word or excluded, once', () => {
    const excluded = Object.values(LEGO_HUB_EXCLUSIONS).flat();
    const words = LEGO_HUB_WORDS.map(e => e.op);
    assert.equal(new Set(words).size, words.length, 'one word per opcode');
    assert.equal(new Set(excluded).size, excluded.length, 'one exclusion class per opcode');
    assert.deepEqual(words.filter(op => excluded.includes(op)), []);
    const surface = Object.entries(infos).flatMap(([id, info]) => info.blocks.filter(b => b && b.opcode).map(b => `${id}_${b.opcode}`));
    assert.deepEqual([...words, ...excluded].sort(), [...surface].sort());
});

test('each word\'s slots are its block\'s arguments, menus as the extension declares them', () => {
    for (const entry of LEGO_HUB_WORDS) {
        const info = infos[entry.extension];
        const block = info.blocks.find(b => b && `${entry.extension}_${b.opcode}` === entry.op);
        const slots = [...entry.words.matchAll(/\{([A-Z0-9_]+)(?::([^}]+))?\}/g)].map(m => [m[1], m[2] || '']);
        assert.deepEqual(slots.map(([n]) => n).sort(), Object.keys(block.arguments || {}).sort(), entry.op);
        for (const [name, spec] of slots) {
            const arg = block.arguments[name];
            if (!arg.menu) { assert.equal(spec, '', `${entry.op} ${name} is a value`); continue; }
            const menu = info.menus[arg.menu];
            const items = menu.items.map(i => (typeof i === 'object' ? i.value : i));
            if (menu.acceptReporters) {
                assert.equal(spec, `menu:${arg.menu}:${items.join('|')}`, `${entry.op} ${name}: a shadow menu`);
            } else {
                assert.deepEqual(spec.split('|'), items.filter(v => spec.split('|').includes(v)), `${entry.op} ${name}`);
                assert.ok(spec.split('|').every(v => items.includes(v)), `${entry.op} ${name}: only the menu's values`);
            }
        }
    }
});

test('every word round-trips: text → blocks → text', () => {
    const sample = e => e.words.replace(/\{([A-Z0-9_]+)(?::([^}]+))?\}/g, (_, n, spec) => {
        if (!spec) return n === 'NOTE' ? '60' : '2';
        const choices = spec.startsWith('menu:') ? spec.split(':')[2].split('|') : spec.split('|');
        return choices[1] || choices[0];
    });
    const lines = LEGO_HUB_WORDS.map(e => (e.kind === 'command' ? sample(e) : `say (${sample(e)})`));
    const source = `WHEN flag clicked:\n${lines.map(l => `  ${l}`).join('\n')}\n`;
    const c = new Creator();
    c.parse(source);
    assert.deepEqual(c.project.extensions.sort(), ['legoboostunified', 'legopoweredup', 'looks', 'wedo2unified'].filter(x => x !== 'looks').sort());
    const opcodes = Object.values(c.project.targets.find(t => Object.keys(t.blocks).length).blocks).map(b => b.opcode);
    for (const e of LEGO_HUB_WORDS) assert.ok(opcodes.includes(e.op), `${e.op} parsed`);
    const back = new Creator().decompile(c.project).split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) assert.ok(back.includes(line), `round trip of "${line}"`);
});

test('the shipped radio-hub examples parse into the real extensions\' blocks', () => {
    for (const [file, ext] of [['technic-hub-bench.bw', 'legopoweredup'], ['boost-rover.bw', 'legoboostunified'], ['wedo-milo.bw', 'wedo2unified']]) {
        const c = new Creator();
        c.parse(readFileSync(path.join(REPO, 'overlay/scratch-gui/static/sim-lab/programs', file), 'utf8'));
        assert.deepEqual(c.project.extensions, [ext], file);
        const ops = Object.values(c.project.targets.find(t => Object.keys(t.blocks).length).blocks).map(b => b.opcode);
        for (const op of ops.filter(o => o.startsWith(`${ext}_`) && !o.includes('_menu_'))) assert.ok(legoHubWordFor(op), op);
    }
});
