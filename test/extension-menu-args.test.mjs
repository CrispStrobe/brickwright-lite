// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Extension menu arguments, stored as Scratch stores them (lib/extension-menu-args.js).
 *
 * An extension menu with `acceptReporters: true` is an INPUT holding a shadow
 * `<extension>_menu_<MENU>` block; any other menu is a FIELD. 2026-10-21: every
 * SPIKE motor block sb3-creator built had PORT as a field. Blockly rebuilt the
 * blocks from the extension's definition, dropped the field, showed an empty
 * port oval, and the extension threw `this._peripheral.motorSettings[port] is
 * undefined` when the block ran. The same was true of the micro:bit+ pin
 * blocks, the circuit instruments (inputs where the extension has fields) and
 * `sort of array`.
 *
 *   - the shape table is the extensions' own getInfo(), regenerated here;
 *   - every extension block sb3-creator builds, from every shipped program and
 *     every SPIKE word, has each menu argument in the shape its extension declares;
 *   - SPIKE words round-trip text -> blocks -> text with their ports;
 *   - a project saved with the old field shape opens repaired, and still reads back;
 *   - the owner's program runs in the real VM against the virtual hub, with the
 *     fields Blockly would drop dropped, and sets the ports it names.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {importSource, importGuiDependency, REPO} from './helpers/bw-integrated.mjs';
import {quietConsole} from './helpers/quiet-console.mjs';

quietConsole();
// The VM first, before anything sets a `window` global: scratch-svg-renderer's DOMPurify
// misreads one as a browser (test/helpers/spike-arena-vm.mjs).
const {VM, runOnArena} = await import('./helpers/spike-arena-vm.mjs');
const {buildTable, renderTable, TABLE_FILE} = await import('../scripts/gen-extension-menu-args.mjs');
const {menuArgOf, menuShadowOpcode, normalizeProjectMenuArgs, readableView} = await importSource('src/lib/extension-menu-args.js');
const TABLE = (await importSource('src/lib/extension-menu-table.js')).default;
const Creator = (await importSource('src/lib/sb3-creator-register-art.js')).default;
const {projectToSpike3Python} = await importSource('src/lib/sb3-creator-spike3.js');
const installMigration = (await importSource('src/lib/arcade-project-migration.js')).default;

/** The program in the owner's report: three stop actions, three speeds, runs of 360/1800/3600 degrees. */
export const OWNER_PROGRAM = `DEVICE SPIKE
WHEN flag clicked:
  set motor stop action A hold
  set motor stop action B hold
  set motor stop action C hold
  set motor speed A 50
  set motor speed B 80
  set motor speed C 100
  run motor A clockwise 360 degrees
  run motor B clockwise 1800 degrees
  run motor C clockwise 3600 degrees
  wait 1 seconds
  run motor A counterclockwise 360 degrees
  run motor B counterclockwise 1800 degrees
  run motor C counterclockwise 3600 degrees
`;

/** Every SPIKE word sb3-creator has, as a statement or inside one. */
const SPIKE_WORDS = `DEVICE SPIKE
WHEN flag clicked:
  start motor A forward
  stop motor A
  run motor B backward 2 rotations
  run motor C clockwise 1 seconds
  set motor speed D 40
  move forward 10 cm
  stop movement
  set movement motors A B
  set movement speed 50
  start moving steering 20
  start tank 30 40
  run motor A to position 90
  reset motor position B to 0
  set motor stop action E coast
  set center button light to red
  set spike volume to 50
  set distance lights D 9 9 9 9
  set pixel 1 1 100
  play beep 440 1
  play spike note 60 1
  stop sound
  reset yaw
  preset yaw to 0
  reset spike timer
  display text "hi"
  display clear
  say (spike distance D)
  say (spike color C)
  say (spike force E)
  say (spike reflection C)
  say (spike angle yaw)
  say (spike acceleration x)
  say (spike motor position A)
  say (spike motor speed A)
  say (spike motor relative position A)
  say (spike distance D in cm)
  say (spike gyro rate yaw)
  say (spike color C raw red)
  wait until spike force sensor E pressed
  wait until spike button left pressed
  wait until spike color C is red
`;

const corpus = () => {
    // Every shipped .bw program, found by walking the directories that hold them (a node walk, not
    // `git ls-files`: the verdict must not depend on a tool found on PATH).
    const files = ['overlay/scratch-gui/examples', 'overlay/scratch-gui/static', 'scripts/spike', 'test/fixtures']
        .flatMap(dir => readdirSync(path.join(REPO, dir), {recursive: true}).map(f => path.join(dir, String(f))))
        .filter(f => f.endsWith('.bw')).sort();
    return [...files.map(f => [f, readFileSync(path.join(REPO, f), 'utf8')]),
        ['OWNER_PROGRAM', OWNER_PROGRAM], ['SPIKE_WORDS', SPIKE_WORDS]];
};

/** Each menu argument of every extension block, against the table: [] when every one has its declared shape. */
const misplaced = project => {
    const wrong = [];
    for (const target of project.targets) {
        const blocks = target.blocks;
        for (const [id, b] of Object.entries(blocks)) {
            if (!b || b.shadow || !TABLE[b.opcode]) continue;
            for (const arg of Object.keys(TABLE[b.opcode])) {
                const {menu, reporters} = menuArgOf(b.opcode, arg);
                const field = b.fields && b.fields[arg];
                const input = b.inputs && b.inputs[arg];
                const where = `${target.name} ${b.opcode}.${arg} (${id})`;
                if (reporters) {
                    if (field !== undefined) wrong.push(`${where}: a field, but ${menu} accepts reporters`);
                    if (input === undefined) continue; // absent: the block was written without it
                    const shadowId = input[0] === 1 ? input[1] : input[2];
                    const shadow = blocks[shadowId];
                    if (!shadow || !shadow.shadow || shadow.opcode !== menuShadowOpcode(b.opcode, menu) ||
                        !shadow.fields || !shadow.fields[menu] || shadow.parent !== id) {
                        wrong.push(`${where}: not a ${menuShadowOpcode(b.opcode, menu)} shadow: ${JSON.stringify(shadow)}`);
                    }
                } else if (input !== undefined) wrong.push(`${where}: an input, but ${menu} is a field menu`);
            }
        }
    }
    return wrong;
};

test('the shape table is the bundled extensions\' getInfo(), current', () => {
    const {table, skipped} = buildTable();
    // cameracapture needs the VM's engine to construct; sb3-creator builds none of its blocks.
    assert.deepEqual(skipped.map(s => s.split(':')[0]), ['cameracapture']);
    assert.equal(readFileSync(TABLE_FILE, 'utf8'), renderTable(table),
        'stale: node --import ./scripts/lib/register-gui-scope.mjs scripts/gen-extension-menu-args.mjs');
    // The two shapes of the reported bug, as the extension declares them.
    assert.deepEqual(menuArgOf('spikeprime_motorRunFor', 'PORT'), {menu: 'MULTIPLE_PORT', reporters: true});
    assert.deepEqual(menuArgOf('spikeprime_motorSetStopAction', 'PORT'), {menu: 'PORT', reporters: true});
    assert.deepEqual(menuArgOf('spikeprime_motorSetStopAction', 'ACTION'), {menu: 'STOP_ACTION', reporters: false});
    assert.deepEqual(menuArgOf('spikeprime_motorRunFor', 'DIRECTION'), {menu: 'DIRECTION', reporters: false});
});

test('every extension block sb3-creator builds holds each menu argument in its declared shape', () => {
    const seen = new Set();
    let programs = 0;
    for (const [name, source] of corpus()) {
        const c = new Creator();
        let project;
        try { project = c.parse(source); } catch { continue; } // not a pseudocode program (the corpus has a few)
        programs++;
        assert.deepEqual(misplaced(project), [], name);
        for (const t of project.targets) for (const b of Object.values(t.blocks)) if (b && TABLE[b.opcode]) seen.add(b.opcode);
    }
    assert.ok(programs > 300, `${programs} programs parsed`);
    // The extensions the report and the audit named are all in the sweep.
    for (const op of ['spikeprime_motorRunFor', 'spikeprime_motorSetSpeed', 'spikeprime_motorSetStopAction',
        'spikeprime_motorStart', 'spikeprime_motorStop', 'spikeprime_motorRunToPosition', 'spikeprime_getDistance',
        'spikeprime_isColor', 'spikeprime_getDistanceIn', 'spikeprime_setMovementMotors',
        'microbitplus_digitalwrite', 'microbitplus_digitalread', 'microbitplus_analogread']) {
        assert.ok(seen.has(op), `${op} is built by some program of the sweep`);
    }
});

test('the SPIKE motor words build the shadow menus the extension declares, with their ports', () => {
    const c = new Creator();
    const project = c.parse(OWNER_PROGRAM);
    const blocks = project.targets.find(t => Object.keys(t.blocks).length).blocks;
    const portOf = b => blocks[b.inputs.PORT[1]];
    const of = op => Object.values(blocks).filter(b => b.opcode === op);
    assert.deepEqual(of('spikeprime_motorSetStopAction').map(b => [portOf(b).opcode, portOf(b).fields.PORT[0], b.fields.ACTION[0]]),
        [['spikeprime_menu_PORT', 'A', 'hold'], ['spikeprime_menu_PORT', 'B', 'hold'], ['spikeprime_menu_PORT', 'C', 'hold']]);
    assert.deepEqual(of('spikeprime_motorSetSpeed').map(b => [portOf(b).opcode, portOf(b).fields.MULTIPLE_PORT[0]]),
        [['spikeprime_menu_MULTIPLE_PORT', 'A'], ['spikeprime_menu_MULTIPLE_PORT', 'B'], ['spikeprime_menu_MULTIPLE_PORT', 'C']]);
    assert.deepEqual(of('spikeprime_motorRunFor').map(b => [portOf(b).fields.MULTIPLE_PORT[0], b.fields.DIRECTION[0], b.fields.UNIT[0]]),
        [['A', '1', 'degrees'], ['B', '1', 'degrees'], ['C', '1', 'degrees'], ['A', '-1', 'degrees'], ['B', '-1', 'degrees'], ['C', '-1', 'degrees']]);
    for (const b of of('spikeprime_motorRunFor')) assert.equal(b.fields.PORT, undefined);
});

test('SPIKE words round-trip text -> blocks -> text with their ports, and to SPIKE 3 Python', () => {
    for (const source of [OWNER_PROGRAM, SPIKE_WORDS, readFileSync(path.join(REPO, 'overlay/scratch-gui/static/sim-lab/programs/crane.bw'), 'utf8')]) {
        const project = new Creator().parse(source);
        // The decompiler writes its canonical spelling: forward/backward for clockwise/counterclockwise,
        // and a SPIKE boolean waited on as `(…) = "true"` (sb3-creator's, unchanged here).
        const words = text => text.split('\n').map(l => l.trim().replace(/ counterclockwise /, ' backward ').replace(/ clockwise /, ' forward ')
            .replace(/^wait until \((.*)\) = "true"$/, 'wait until $1'))
            .filter(l => l && !l.startsWith('#') && !/^(DEVICE|CLOCK|STAGE:)/i.test(l));
        const back = new Creator().decompile(project);
        assert.deepEqual(words(back), words(source));
        assert.equal(new Creator().decompile(new Creator().parse(back)), back, 'and the read-back text is a fixpoint');
    }
    // The SPIKE 3 Python writer (vendored, not wired into Lite's GUI) reads ports as fields: the view gives it them.
    const python = projectToSpike3Python(readableView(new Creator().parse(OWNER_PROGRAM))).py;
    for (const line of ['_bw_stop[port.C] = motor.HOLD', '_bw_speed[port.B] = 80',
        'await motor.run_for_degrees(port.C, 3600, _bw_speed[port.C] * 11.1)']) {
        assert.ok(python.includes(line), `SPIKE 3 Python has ${line}`);
    }
});

test('the circuit instruments store their element as the field the extension declares, and read back', () => {
    const source = 'WHEN flag clicked:\n  say (voltage at "n1")\n  say (resistance between "n1" and "n2")\n  set control "pot" to 5\n';
    const c = new Creator();
    const project = c.parse(source);
    const blocks = Object.values(project.targets.find(t => Object.keys(t.blocks).length).blocks);
    const of = op => blocks.find(b => b.opcode === op);
    assert.deepEqual([of('circuit_nodevoltage').fields.NET[0], of('circuit_resistance').fields.A[0],
        of('circuit_resistance').fields.B[0], of('circuit_setcontrol').fields.CONTROL[0]], ['n1', 'n1', 'n2', 'pot']);
    assert.equal(of('circuit_nodevoltage').inputs.NET, undefined);
    assert.deepEqual(misplaced(project), []);
    const back = new Creator().decompile(project).split('\n').map(l => l.trim()).filter(l => l && l !== 'STAGE:');
    assert.deepEqual(back, source.split('\n').map(l => l.trim()).filter(Boolean));
});

/** The project the creator built before 2026-10-21: every acceptReporters menu argument as a field. */
const legacyShape = project => {
    for (const target of project.targets) {
        for (const [id, b] of Object.entries(target.blocks)) {
            if (!b || b.shadow || !TABLE[b.opcode]) continue;
            for (const arg of Object.keys(TABLE[b.opcode])) {
                const input = b.inputs[arg];
                if (!menuArgOf(b.opcode, arg).reporters || !input || typeof input[1] !== 'string') continue;
                const shadow = target.blocks[input[1]];
                if (!shadow || !shadow.shadow || shadow.parent !== id) continue;
                b.fields[arg] = [Object.values(shadow.fields)[0][0], null];
                delete b.inputs[arg];
                delete target.blocks[input[1]];
            }
        }
    }
    return project;
};

test('a project saved with the old field shape opens repaired, and still reads back', async () => {
    const fresh = new Creator().parse(OWNER_PROGRAM);
    const text = new Creator().decompile(fresh);
    const legacy = legacyShape(structuredClone(fresh));
    assert.ok(misplaced(legacy).length >= 9, 'the legacy shape is the bug: ports as fields');
    // The decompiler reads the old shape as it always did.
    assert.equal(new Creator().decompile(legacy), text);

    // Loading goes through the one parsed-project boundary the GUI installs (vm-manager-hoc.jsx).
    const calls = [];
    const vm = {deserializeProject: async (project, zip) => { calls.push([project, zip]); return 'loaded'; }};
    installMigration(vm);
    const zip = {};
    assert.equal(await vm.deserializeProject(legacy, zip), 'loaded');
    assert.equal(calls[0][0], legacy);
    assert.equal(calls[0][1], zip);
    assert.deepEqual(misplaced(legacy), [], 'repaired before the VM sees it');
    assert.equal(new Creator().decompile(legacy), text);
    const once = structuredClone(legacy);
    assert.deepEqual(normalizeProjectMenuArgs(legacy), []);
    assert.deepEqual(legacy, once, 'a repaired project is left as it is');

    // A field-menu value saved as an input (the circuit instruments' old shape) becomes the field.
    const circuit = {extensions: ['circuit'], targets: [{name: 'Stage', blocks: {
        r: {opcode: 'circuit_nodevoltage', inputs: {NET: [1, [10, 'n1']]}, fields: {}, shadow: false, topLevel: true}
    }}]};
    await vm.deserializeProject(circuit, zip);
    assert.deepEqual(circuit.targets[0].blocks.r, {opcode: 'circuit_nodevoltage', inputs: {}, fields: {NET: ['n1', null]}, shadow: false, topLevel: true});
});

test('the owner\'s program runs in the VM against the virtual SPIKE hub with the ports it names', async () => {
    const dispatch = (await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
    // What the editor does to a loaded project: Blockly rebuilds every block from
    // its extension's definition and drops what the definition does not have.
    // A field where the extension declares a shadow input is dropped; the VM then
    // runs the block with that argument missing. Emulated here, before the run.
    // One block is switched to the A+B pair, as a learner picks it in the menu.
    const greenFlag = VM.prototype.greenFlag;
    let extension = null;
    VM.prototype.greenFlag = function () {
        for (const target of this.runtime.targets) {
            const container = target.blocks;
            let pairs = 0;
            for (const block of Object.values(container._blocks)) {
                if (!TABLE[block.opcode]) continue;
                for (const arg of Object.keys(TABLE[block.opcode])) {
                    if (menuArgOf(block.opcode, arg).reporters) delete block.fields[arg];
                }
                if (block.opcode === 'spikeprime_motorRunFor' && block.inputs.PORT && pairs++ === 0) {
                    const shadow = container._blocks[block.inputs.PORT.shadow];
                    shadow.fields.MULTIPLE_PORT.value = 'A+B';
                }
            }
            container.resetCache();
        }
        extension = dispatch.services[this.extensionManager._loadedExtensions.get('spikeprime')];
        return greenFlag.call(this);
    };
    let result;
    try {
        result = await runOnArena(OWNER_PROGRAM, {timeLimitMs: 30000}, {
            bridgeFor: hub => ({verdict: {status: 'running'}, tick (ms) { hub.stepMotors(ms); return {status: 'running'}; }})
        });
    } finally {
        VM.prototype.greenFlag = greenFlag;
    }
    const {calls} = result;
    assert.equal(calls.get('motorSetStopAction'), 3);
    assert.equal(calls.get('motorSetSpeed'), 3);
    assert.equal(calls.get('motorRunFor'), 6);
    // The adapter (crispstrobe/adapter.js) wraps the TurboWarp-style instance as `_inst`.
    const settings = (extension._inst || extension)._peripheral.motorSettings;
    assert.deepEqual(['A', 'B', 'C', 'D'].map(p => settings[p].stopMode), [2, 2, 2, 1]);
    assert.deepEqual(['A', 'B', 'C', 'D'].map(p => settings[p].speed), [50, 80, 100, 75]);
});
