// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * The Robot Lab's four surfaces are ONE method list (docs/ROBOT-LAB-HUBS-PLAN.md P1):
 *
 *   blocks       the `robotlab` extension (overlay/scratch-vm/.../crispstrobe/robotlab)
 *   `lab` words  overlay/scratch-gui/src/lib/robotLabDialect.js (parser + decompiler)
 *   Python / JS  SB3Creator.RUNTIME_EXTENSIONS.robotlab (`_robotlab.<method>`) and the
 *                readers' lift back (lib/robot-lab-pseudocode.js, on the shared Translator)
 *   the API      lib/bw-sim/api/robot-lab-api.js (`runtime.robotLab`)
 *
 * This holds them equal — every block has exactly one word, one runtime op and one API
 * method, with the same arguments — and round-trips EVERY block: blocks → words → blocks,
 * and blocks → Python → words → blocks and blocks → JavaScript → words → blocks, the
 * blocks compared by what they hold (opcode, fields, menu values, literals, nested
 * reporters). The words are read under any DEVICE line. The extension's EN and DE texts
 * carry the same slots, and with no Lab open it never throws: commands do nothing,
 * reporters answer 0, `Robot Lab status` says 'not-open'.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// The compiler as the app obtains it (the registering door layers the `lab` words on the pinned,
// byte-identical sb3-creator), and the Code tab's readers (lib/robot-lab-pseudocode.js).
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator-register-art.js';
import {readPython as pythonToPseudocode, readJavaScript as javascriptToPseudocode} from '../overlay/scratch-gui/src/lib/robot-lab-pseudocode.js';
import {ROBOTLAB_WORDS, ROBOTLAB_MODELS, ROBOTLAB_RUNTIME, robotLabCallToPseudo} from '../overlay/scratch-gui/src/lib/robotLabDialect.js';
import {createRobotLabApi} from '../overlay/scratch-gui/src/lib/bw-sim/api/robot-lab-api.js';
import {MODELS} from '../overlay/scratch-gui/src/lib/bw-sim/sim-session.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/robotlab/index.js');

let locale = 'en';
const STUBS = {
    'argument-type': {STRING: 'string', NUMBER: 'number'},
    'block-type': {COMMAND: 'command', REPORTER: 'reporter', BOOLEAN: 'Boolean', HAT: 'hat'},
    cast: {toNumber: v => { const n = Number(v); return Number.isFinite(n) ? n : 0; }, toString: v => String(v)},
    'format-message': Object.assign(() => '', {setup: () => ({locale})})
};
const loadExtClass = () => {
    const module_ = {exports: {}};
    // eslint-disable-next-line no-new-func
    new Function('require', 'module', 'exports', fs.readFileSync(EXT, 'utf8'))(spec => STUBS[path.basename(spec)], module_, module_.exports);
    return module_.exports;
};
const Ext = loadExtClass();
const infoIn = lang => { locale = lang; try { return new Ext({}).getInfo(); } finally { locale = 'en'; } };
const INFO = infoIn('en');
const BLOCKS = INFO.blocks.filter(b => typeof b === 'object');

test('one method list: every block is one word, one _robotlab op and one API method, with the same arguments', () => {
    const ops = BLOCKS.map(b => `robotlab_${b.opcode}`).sort();
    assert.deepEqual(ROBOTLAB_WORDS.map(w => w.op).sort(), ops, 'words = blocks');
    assert.deepEqual(Object.keys(ROBOTLAB_RUNTIME.ops).map(op => `robotlab_${op}`).sort(), ops, 'runtime ops = blocks');
    assert.deepEqual(SB3Creator.RUNTIME_EXTENSIONS.robotlab, ROBOTLAB_RUNTIME, 'the registry entry is the table\'s');
    const api = createRobotLabApi({getSession: () => null});
    for (const b of BLOCKS) {
        const word = ROBOTLAB_WORDS.find(w => w.op === `robotlab_${b.opcode}`);
        assert.deepEqual([...word.args].sort(), Object.keys(b.arguments || {}).sort(), `${b.opcode}: the word's slots are the block's arguments`);
        assert.equal(typeof api[word.method], 'function', `${b.opcode}: the API has ${word.method}`);
        const kind = {command: 'command', reporter: 'reporter', hat: 'hat'}[b.blockType];
        assert.equal(word.kind, kind, `${b.opcode}: kind`);
        // The word's menus are the extension's (shadow robotlab_menu_<m>, field <m>).
        for (const m of word.words.matchAll(/\{([A-Z]+):menu:(\w+):/g)) {
            assert.equal(b.arguments[m[1]].menu, m[2], `${b.opcode}.${m[1]}: menu ${m[2]}`);
            assert.ok(INFO.menus[m[2]], `menu ${m[2]} exists`);
        }
        for (const m of word.words.matchAll(/\{([A-Z]+):([a-z|]+)\}/g)) {
            const menu = INFO.menus[b.arguments[m[1]].menu];
            assert.deepEqual(menu.items.map(i => i.value), m[2].split('|'), `${b.opcode}.${m[1]}: field choices = menu values`);
        }
    }
    // The extension's own blocks call the API by the same names (one place to read them: its source).
    const src = fs.readFileSync(EXT, 'utf8');
    for (const w of ROBOTLAB_WORDS) assert.match(src, new RegExp(`'${w.method}'`), `the extension calls ${w.method}`);
});

test('the model list is the shipped one in the words, the extension and the Robot Lab', () => {
    const shipped = MODELS.map(m => (m.id || m.file).replace(/\.ldr$/, ''));
    assert.deepEqual([...ROBOTLAB_MODELS], shipped);
    assert.deepEqual(new Ext({}).modelMenu(), shipped, 'the extension\'s menu before the Lab is open');
});

test('EN and DE: every block text has the same slots in both languages', () => {
    const de = infoIn('de');
    assert.equal(de.blocks.length, INFO.blocks.length);
    INFO.blocks.forEach((b, i) => {
        if (typeof b !== 'object') return;
        const d = de.blocks[i];
        const slots = text => [...text.matchAll(/\[([A-Z]+)\]/g)].map(m => m[1]).sort();
        assert.deepEqual(slots(d.text), slots(b.text), b.opcode);
        assert.notEqual(d.text, b.text, `${b.opcode} is translated`);
    });
    assert.deepEqual(de.menus.stopActions.items.map(i => i.text), ['bremsen', 'ausrollen', 'halten']);
});

/** Every block, in words: each command once, each reporter in a slot, the hat. */
const PROGRAM = `WHEN flag clicked:
  lab load model motor-bench
  lab start
  lab set motor A power to 50 %
  lab run motor "motor" for 360 degrees at 180 degrees per second
  lab run motor B at (lab motor A speed) degrees per second
  lab stop motor A hold
  lab stop motor (lab sensor C value) coast
  say (lab motor A angle)
  say (lab part "gear" heading)
  say (lab part hub y)
  say (lab status)
  lab stop
  lab reset

WHEN lab part "gear" touches ground:
  lab run motor A at -90 degrees per second
`;

/** What a script holds, independent of block ids: opcode, fields, inputs (menus by value, nested blocks inline). */
const canon = project => {
    const t = project.targets.find(x => Object.values(x.blocks || {}).some(b => b.topLevel && !b.shadow));
    const blocks = t.blocks;
    const value = input => {
        if (!Array.isArray(input)) return input;
        const v = input[1];
        if (Array.isArray(v)) return {lit: String(v[1])};
        const b = blocks[v];
        if (!b) return {ref: v};
        if (b.shadow && /_menu_/.test(b.opcode)) return {menu: b.opcode, value: Object.values(b.fields)[0][0]};
        return block(v);
    };
    const block = id => {
        const b = blocks[id];
        return {op: b.opcode, fields: Object.fromEntries(Object.entries(b.fields || {}).map(([k, f]) => [k, f[0]])),
            inputs: Object.fromEntries(Object.entries(b.inputs || {}).map(([k, i]) => [k, value(i)]))};
    };
    const stack = id => { const out = []; for (let x = id; x; x = blocks[x].next) out.push(block(x)); return out; };
    return Object.values(blocks).filter(b => b.topLevel && !b.shadow).map(b => stack(Object.keys(blocks).find(k => blocks[k] === b)))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
};
const compile = text => { const c = new SB3Creator(); c.parse(text); return c.project; };
const opsIn = project => new Set(project.targets.flatMap(t => Object.values(t.blocks)).map(b => b.opcode).filter(op => /^robotlab_(?!menu_)/.test(op)));

test('every robotlab block round-trips: blocks → words → blocks', () => {
    const project = compile(PROGRAM);
    assert.deepEqual([...opsIn(project)].sort(), ROBOTLAB_WORDS.map(w => w.op).sort(), 'the program uses every block');
    assert.deepEqual(project.extensions, ['robotlab']);
    const words = new SB3Creator().decompile(project);
    assert.match(words, /lab run motor "motor" for 360 degrees at 180 degrees per second/);
    assert.match(words, /WHEN lab part "gear" touches ground:/);
    assert.deepEqual(canon(compile(words)), canon(project));
});

test('every robotlab block round-trips through Python and JavaScript (_robotlab calls), the hat with its arguments', () => {
    const project = compile(PROGRAM);
    const py = new SB3Creator().generatePython(project, {events: true});
    assert.match(py, /_robotlab\.runMotorDegrees\("motor", 360, 180\)/);
    assert.match(py, /_robotlab\.on\("robotlab_whenTouch", \w+, "gear", "ground"\)/);
    const fromPy = pythonToPseudocode(py);
    assert.deepEqual(fromPy.warnings, []);
    assert.deepEqual(canon(compile(fromPy.pseudocode)), canon(project), 'Python');
    const js = new SB3Creator().generateJavaScript(project, {events: true});
    assert.match(js, /_robotlab\.setMotorPower\("A", 50\);/);
    const fromJs = javascriptToPseudocode(js);
    assert.deepEqual(fromJs.warnings, []);
    assert.deepEqual(canon(compile(fromJs.pseudocode)), canon(project), 'JavaScript');
});

test('the simulator driver binds _robotlab to the Robot Lab API in the page, neutral elsewhere', () => {
    const project = compile(PROGRAM);
    const js = new SB3Creator().generateJavaScript(project, {driver: 'simulator'});
    assert.match(js, /const _robotlab = \(typeof globalThis !== "undefined" && globalThis\.__bwSimLab && globalThis\.__bwSimLab\.api\) \|\|/);
    // Run the driver's own lines both ways: with a Lab, the calls reach it; without, they are neutral.
    const driver = js.slice(js.indexOf('const _robotlab'), js.indexOf('};', js.indexOf('const _robotlab')) + 2);
    const calls = [];
    const lab = {setMotorPower: (...a) => calls.push(a), status: () => 'running'};
    // eslint-disable-next-line no-new-func
    const run = new Function('globalThis', `${driver}\nreturn _robotlab;`);
    const bound = run({__bwSimLab: {api: lab}});
    bound.setMotorPower('A', 50);
    assert.deepEqual(calls, [['A', 50]]);
    const neutral = run({});
    assert.equal(neutral.motorAngle('A'), 0);
    assert.equal(neutral.status(), 'not-open');
    assert.equal(neutral.setMotorPower('A', 50), undefined);
    const py = new SB3Creator().generatePython(project, {driver: 'simulator'});
    assert.match(py, /press ⇦ To blocks/);
});

test('lab words are read under any DEVICE line, and never shadow a Scratch word', () => {
    for (const device of ['', 'DEVICE SPIKE\n', 'DEVICE EV3\n', 'DEVICE CPX\n', 'DEVICE MICROBIT\n']) {
        const p = compile(`${device}WHEN flag clicked:\n  lab set motor A power to 30 %\n  say (lab motor A angle)\n  stop all\n`);
        const ops = [...opsIn(p)].sort();
        assert.deepEqual(ops, ['robotlab_motorAngle', 'robotlab_setMotorPower'], device || 'no DEVICE');
        assert.ok(p.targets.some(t => Object.values(t.blocks).some(b => b.opcode === 'control_stop')), `${device}: stop all is still Scratch's`);
    }
    // A bare word in a menu slot is a variable (quote a part name), as everywhere in the dialect.
    const v = compile('WHEN flag clicked:\n  lab set motor m power to 30 %\n');
    assert.ok(Object.values(v.targets.flatMap(t => Object.values(t.blocks))).some(b => b.opcode === 'data_variable' || JSON.stringify(b).includes('"m"')));
});

test('robotLabCallToPseudo: choices come back bare, names quoted, expressions parenthesised, unknowns refused', () => {
    assert.equal(robotLabCallToPseudo('setMotorPower', ['"A"', '50']), 'lab set motor A power to 50 %');
    assert.equal(robotLabCallToPseudo('setMotorPower', ['"motorL"', '(x + 1)']), 'lab set motor "motorL" power to (x + 1) %');
    assert.equal(robotLabCallToPseudo('stopMotor', ['"A"', '"hold"']), 'lab stop motor A hold');
    assert.equal(robotLabCallToPseudo('stopMotor', ['"A"', '"drift"']), null);
    assert.equal(robotLabCallToPseudo('whenTouch', ['"gear"', '"ground"'], {hat: true}), 'WHEN lab part "gear" touches ground:');
    assert.equal(robotLabCallToPseudo('whenTouch', ['"gear"', '"ground"']), null, 'a hat is not a statement');
    assert.equal(robotLabCallToPseudo('teleport', []), null);
});

test('the blocks with no Robot Lab open: nothing throws, commands are no-ops, status says not-open', async () => {
    const ext = new Ext({});
    assert.equal(ext.labStatus(), 'not-open');
    assert.equal(ext.motorAngle({MOTOR: 'A'}), 0);
    assert.equal(ext.partPosition({PART: 'hub', AXIS: 'x'}), 0);
    assert.equal(ext.whenTouch({PART: 'hub', OTHER: 'ground'}), false);
    assert.equal(await ext.runMotorDegrees({MOTOR: 'A', DEGREES: 90, SPEED: 90}), undefined);
    assert.equal(await ext.loadModel({MODEL: 'driving-base'}), undefined);
    assert.deepEqual(ext.motorMenu(), ['A', 'B', 'C', 'D', 'E', 'F']);
    // With the Lab: the block's arguments reach the API method as numbers and words; a throw stays inside.
    const calls = [];
    const runtime = {robotLab: {
        runMotorDegrees: async (...a) => { calls.push(['runMotorDegrees', ...a]); return 'completed'; },
        motorAngle: m => (m === 'A' ? 12.5 : 0),
        status: () => 'running',
        motors: () => [{port: 'A'}, {port: 'C'}],
        stopMotor: () => { throw new Error('boom'); }
    }};
    const live = new Ext(runtime);
    await live.runMotorDegrees({MOTOR: 'A', DEGREES: '90', SPEED: '45'});
    assert.deepEqual(calls, [['runMotorDegrees', 'A', 90, 45]]);
    assert.equal(live.motorAngle({MOTOR: 'A'}), 12.5);
    assert.equal(live.labStatus(), 'running');
    assert.deepEqual(live.motorMenu(), ['A', 'C']);
    assert.equal(live.stopMotor({MOTOR: 'A', ACTION: 'brake'}), undefined);
});
