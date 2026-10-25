// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The `pup …`, `boost …`, `wedo …` and `nxt …` words (overlay/scratch-gui/src/lib/legoHubsDialect.js): one
 * table for the parser and the decompiler of the bundled legopoweredup, legoboostunified and
 * wedo2unified and legonxt blocks, layered at the robot-lab door (lib/robot-lab-pseudocode.js).
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

test('the slice is counted: every opcode of the four extensions is a word or excluded, once', () => {
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
                const choices = spec.split('|');
                assert.deepEqual(choices, items.filter(v => choices.includes(v)), `${entry.op} ${name}`);
                assert.ok(choices.every(v => items.includes(v)), `${entry.op} ${name}: only the menu's values`);
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
    const lines = LEGO_HUB_WORDS.map(e => (e.kind === 'command' ? sample(e) : e.kind === 'boolean' ? `wait until ${sample(e)}` : `say (${sample(e)})`));
    const source = `WHEN flag clicked:\n${lines.map(l => `  ${l}`).join('\n')}\n`;
    const c = new Creator();
    c.parse(source);
    assert.deepEqual(c.project.extensions.sort(), ['legoboostunified', 'legonxt', 'legopoweredup', 'wedo2unified']);
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

// The NXT bumper bot (docs/ROBOT-LAB-EV3-NXT.md) in words: the same script as the shipped
// blocks example, block for block (static/sim-lab/programs/nxt-bumper-bot.blocks.json).
const NXT_BUMPER_BOT = `WHEN flag clicked:
  nxt setup touch sensor S1
  nxt motor B power 75 for 360 degrees
  nxt motor C power 75 for 360 degrees
  wait 2 seconds
  nxt motor B power 60
  nxt motor C power 60
  wait until nxt touch sensor S1 pressed
  nxt stop motor B brake
  nxt stop motor C brake
`;

const script = project => {
    const target = project.targets.find(t => Object.keys(t.blocks).length);
    const {blocks} = target;
    const value = (input) => {
        if (Array.isArray(input[1])) return String(input[1][1]);
        const b = blocks[input[1]];
        if (!b) return null;
        const field = Object.values(b.fields || {})[0];
        return field ? String(field[0]) : b.opcode;
    };
    const out = [];
    for (let b = Object.values(blocks).find(x => x.topLevel); b; b = blocks[b.next]) {
        const ins = Object.fromEntries(Object.entries(b.inputs || {}).map(([k, v]) => {
            const inner = blocks[v[1]];
            return [k, inner && inner.opcode === 'legonxt_isTouchPressed' ? `${inner.opcode}(${value(inner.inputs.PORT)})` : value(v)];
        }));
        const fields = Object.fromEntries(Object.entries(b.fields || {}).map(([k, v]) => [k, v[0]]));
        out.push([b.opcode, ins, fields]);
    }
    return out;
};

test('NXT: the bumper bot in words is the shipped blocks example, and spells back the same', () => {
    const shipped = JSON.parse(readFileSync(path.join(REPO, 'overlay/scratch-gui/static/sim-lab/programs/nxt-bumper-bot.blocks.json'), 'utf8'));
    const c = new Creator();
    c.parse(NXT_BUMPER_BOT);
    assert.deepEqual(c.project.extensions, ['legonxt']);
    assert.deepEqual(script(c.project), script({targets: [{blocks: shipped.blocks}]}));
    const back = new Creator().decompile(c.project).split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of NXT_BUMPER_BOT.split('\n').map(l => l.trim()).filter(Boolean)) assert.ok(back.includes(line), `round trip of "${line}"`);
});

test('NXT: reporters read inside expressions, and port menus take a reporter', () => {
    const c = new Creator();
    c.parse('WHEN flag clicked:\n  if (nxt distance S4 cm) < 20 then:\n    nxt play tone 440 Hz for 200 ms\n  say (nxt motor B position)\n');
    const ops = Object.values(c.project.targets.find(t => Object.keys(t.blocks).length).blocks).map(b => b.opcode);
    for (const op of ['legonxt_getDistance', 'legonxt_playTone', 'legonxt_getMotorPosition', 'operator_lt']) assert.ok(ops.includes(op), op);
    const back = new Creator().decompile(c.project);
    assert.match(back, /nxt distance S4 cm/);
    assert.match(back, /nxt play tone 440 Hz for 200 ms/);
});
