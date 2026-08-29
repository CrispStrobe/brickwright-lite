/**
 * Wave 4 — "Interactive systems" — claims gate.
 *
 * Wave 1 and 2 asked whether a BENCH can produce a reading and answered by
 * solving the circuit. Wave 3 asked whether the app can RENDER a language and
 * answered by generating it. Wave 5 asked what the DEBUGGER can show. Wave 4's
 * checkpoints ask something else again: can the learner OPERATE a control and
 * SEE a display — a controller-panel widget, a micro:bit simulator, a hub over
 * Bluetooth — so the subject under test is the interactive surface.
 *
 * Every number below is produced the way the browser produces it:
 *
 *   - the panel is the real `ControllerPanel` from `lib/bw-board`, restored from
 *     the example's own `controller.json` the way `pseudocode-importer.jsx`
 *     restores it, and wired to the VM by the real `bindPanelToVariables` —
 *     which `gui.jsx` mounts once per VM, independent of play/edit mode and of
 *     whether the project is running;
 *   - the program is compiled by lite's own `sb3-creator` and executed by the
 *     REAL scratch-vm `src` tree the browser bundle builds from (see
 *     `test/helpers/bw-vm.mjs`) or, where a virtual clock is needed, by lite's
 *     own trace referee (`lib/trace-oracle.js`);
 *   - the circuit is solved by `scripts/lesson-bench.mjs`, i.e. `bw-circuit-ui`
 *     over a fully-registered `bw-board`.
 *
 * Nothing here is arithmetic done on the side and reported as a measurement.
 *
 * Tests named OPEN DEFECT assert that a defect STILL REPRODUCES. They are
 * meant to fail the day someone fixes the app, the engine or the example; that
 * failure is the instruction to come back and update
 * `docs/LESSON-REVIEW-WAVE-4.md` and the lesson hint it names.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {REPO, INTEGRATED} from './helpers/bw-integrated.mjs';

const EX = path.join(REPO, 'overlay/scratch-gui/examples');
const GUI = path.join(REPO, 'overlay/scratch-gui/src');
const WAVE = path.join(GUI, 'components/gui/lesson-waves/interactive-4.json');
const VM_EXT = path.join(REPO, 'overlay/scratch-vm/src/extensions/crispstrobe');

const wave = JSON.parse(readFileSync(WAVE, 'utf8'));
const lesson = id => {
    const found = wave.lessons.find(l => l.id === id);
    assert.ok(found, `${id} is no longer in interactive-4.json`);
    return found;
};
const checkpoint = (id, cp) => {
    const found = lesson(id).checkpoints.find(c => c.id === cp);
    assert.ok(found, `${id} has no "${cp}" checkpoint`);
    return found;
};
const index = (() => {
    const raw = JSON.parse(readFileSync(path.join(EX, 'index.json'), 'utf8'));
    return new Map((Array.isArray(raw) ? raw : raw.examples).map(e => [e.id, e]));
})();

// ── Instrument checks, before any measurement ──────────────────────────────
//
// The compiler and the VM are imported from the integrated tree, the only place
// their dependencies resolve — a second checkout, therefore a second everything.
// Comparing bytes is what makes a result attributable to THIS repo.
const overlayCompiler = readFileSync(path.join(GUI, 'lib/sb3-creator.js'));
const integratedCompiler = readFileSync(path.join(INTEGRATED, 'src/lib/sb3-creator.js'));

test('instrument: the integrated compiler is byte-identical to the overlay copy', () => {
    assert.ok(overlayCompiler.equals(integratedCompiler),
        `the integrated sb3-creator differs from overlay/ (${integratedCompiler.length} vs ` +
        `${overlayCompiler.length} bytes). Run \`node scripts/integrate.mjs\`; until then every ` +
        'number in this file belongs to a tree this repo does not own.');
});

test('instrument: Wave 4 still has the eight lessons this gate measures', () => {
    assert.equal(wave.wave, 'interactive-4');
    assert.deepEqual(wave.lessons.map(l => l.id).sort(), [
        'interactive-calibration-control',
        'interactive-dashboard',
        'interactive-displays',
        'interactive-extension-discovery',
        'interactive-input-controls',
        'interactive-lego-recovery',
        'interactive-sensor-capability',
        'interactive-two-way-binding'
    ]);
});

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const VM = (await import(path.join(INTEGRATED, 'node_modules/scratch-vm/src/index.js'))).default;
const {interpretTrace} = await import(path.join(INTEGRATED, 'src/lib/trace-oracle.js'));
const {ControllerPanel} = await import(path.join(GUI, 'lib/bw-board/controller.js'));
const {bindPanelToVariables} = await import(path.join(GUI, 'lib/bw-board/controller-binding.js'));

/**
 * Load an example's program into the real VM and wire its shipped controller
 * layout to it, exactly as the app does: `pseudocode-importer.jsx` re-adds every
 * widget with `addWidget(name, type, config, layout)` and copies `binding`, then
 * applies `layout.mode`; `gui.jsx` mounts `bindPanelToVariables` on the VM.
 *
 * The pump is manual (`autoPump:false`) because node has no rAF — same function,
 * same call order, one poll per step instead of one per animation frame.
 */
async function faceplate (id) {
    const entry = index.get(id);
    assert.ok(entry && entry.files.program && entry.files.controller,
        `${id} no longer ships both a program and a controller layout`);
    const creator = new SB3Creator();
    creator.parse(readFileSync(path.join(EX, entry.files.program), 'utf8'));
    const vm = new VM();
    await vm.loadProject(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
    if (creator.project.stc) vm.runtime.stc = creator.project.stc;

    const layout = JSON.parse(readFileSync(path.join(EX, entry.files.controller), 'utf8'));
    const panel = new ControllerPanel();
    for (const w of layout.widgets) {
        const added = panel.addWidget(w.name, w.type, w.config || {}, w.layout || {});
        if (w.binding) added.binding = {...w.binding};
    }
    if (layout.mode) panel.setMode(layout.mode);
    const binding = bindPanelToVariables(panel, vm, {autoPump: false});
    const stage = vm.runtime.getTargetForStage();
    const val = name => {
        const v = Object.values(stage.variables).find(entry_ => entry_.name === name);
        return v ? v.value : undefined;
    };
    const set = (name, value) => {
        const v = Object.values(stage.variables).find(entry_ => entry_.name === name);
        assert.ok(v, `${id} has no variable "${name}"`);
        v.value = value;
    };
    vm.start();
    vm.greenFlag();
    const step = (n = 5) => {
        for (let i = 0; i < n; i++) {
            vm.runtime._step();
            binding.pump();
        }
    };
    const done = () => {
        binding.dispose();
        vm.quit();
    };
    return {vm, panel, layout, val, set, step, done};
}

// ── interactive-two-way-binding / mb05-faceplate-matrix ────────────────────

test('interactive-two-way-binding: the whole loop runs — button to variable to program to matrix face', async () => {
    assert.equal(lesson('interactive-two-way-binding').exampleId, 'mb05-faceplate-matrix');
    const f = await faceplate('mb05-faceplate-matrix');
    try {
        assert.equal(f.layout.mode, 'play', 'the panel must open in play mode or no input is accepted');
        f.step();
        assert.equal(Number(f.val('screen')), 1, 'green flag: one lit dot');
        assert.equal(f.panel.getValue('scr'), 1, 'the matrix face shows what the program wrote');

        f.panel.setButtonInput('a', true);
        f.step();
        assert.equal(Number(f.val('btnA')), 1, 'the button wrote its variable');
        assert.equal(Number(f.val('screen')), 18157905, 'A held: the X pattern');
        assert.equal(f.panel.getValue('scr'), 18157905);

        f.panel.setButtonInput('a', false);
        f.step();
        assert.equal(Number(f.val('screen')), 1, 'A released: back to one dot');

        f.panel.setButtonInput('b', true);
        f.step();
        assert.equal(Number(f.val('screen')), 31744, 'B held: the middle row');
        assert.equal(f.panel.getValue('scr'), 31744);
    } finally {
        f.done();
    }
});

test('interactive-two-way-binding: re-binding a widget is reachable, and rename still is not', async () => {
    // Was an OPEN DEFECT: `bindToVariable`, `bindToPart` and `bindToPin` were
    // called from nowhere in the GUI, so the only reachable configuration
    // change was remove-and-re-add, which silently converted a variable
    // binding into a program binding. Fixed 2026-08-24 — the inspector has a
    // Binding section. The lesson is version 3 and re-binding is its action.
    const uiFiles = [
        readFileSync(path.join(GUI, 'components/tw-pseudocode/controller-panel-view.jsx'), 'utf8'),
        readFileSync(path.join(GUI, 'components/gui/gui.jsx'), 'utf8')
    ].join('\n');
    for (const call of ['bindToVariable', 'bindToPart', 'bindToPin', 'unbind']) {
        assert.match(uiFiles, new RegExp(`panel\\.${call}\\(`),
            `the panel UI stopped calling ${call} — interactive-two-way-binding's action ` +
            'is to re-bind a widget, and would become impossible again');
    }

    const f = await faceplate('mb05-faceplate-matrix');
    try {
        // Rename is still a no-op by design, and version 3 teaches that as the
        // CONTRAST to re-binding, so it must stay true.
        f.panel.renameWidget('a', 'buttonA');
        assert.deepEqual(f.panel.getWidget('buttonA').binding, {target: 'variable', variableName: 'btnA'},
            'renaming a widget must still leave its binding untouched');
        f.step();
        f.panel.setButtonInput('buttonA', true);
        f.step();
        assert.equal(Number(f.val('screen')), 18157905, 'the renamed widget still drives the program');

        // Re-binding through the model the inspector now calls: point it
        // somewhere else, and the loop stops.
        f.panel.setButtonInput('buttonA', false);
        f.step();
        f.panel.bindToVariable('buttonA', 'somethingElse');
        f.panel.setButtonInput('buttonA', true);
        f.step();
        assert.equal(Number(f.val('screen')), 1, 're-binding away from btnA breaks the loop');

        // And back: the arrow is repairable from the app, which is the whole
        // point of the checkpoint.
        f.panel.setButtonInput('buttonA', false);
        f.step();
        f.panel.bindToVariable('buttonA', 'btnA');
        f.panel.setButtonInput('buttonA', true);
        f.step();
        assert.equal(Number(f.val('screen')), 18157905, 're-binding back must restore the loop');
    } finally {
        f.done();
    }
});

// ── interactive-input-controls / retro-console ─────────────────────────────

test('interactive-input-controls: every control retro-console ships has a readable value contract', async () => {
    assert.equal(lesson('interactive-input-controls').exampleId, 'retro-console');
    const f = await faceplate('retro-console');
    try {
        f.step(20);
        assert.equal(Number(f.val('game_screen')), 1, 'flag: the player dot sits at the top-left');
        assert.equal(Number(f.val('status_screen')), 7, 'flag: three lives');

        // D-pad bitmask, the "exact booleans, bitmasks or X/Y ranges" the
        // predict checkpoint asks the learner to write down.
        for (const [dir, bit] of [['up', 1], ['down', 2], ['left', 4], ['right', 8]]) {
            f.panel.setDpadInput('pad', dir, true);
            assert.equal(f.panel.getValue('pad'), bit, `${dir} is bit ${bit}`);
            assert.equal(Number(f.val('dpad')), bit, `${dir} reaches the program's variable`);
            f.panel.setDpadInput('pad', dir, false);
        }
        // Opposites: the panel reports BOTH, which is the "impossible
        // combination" the test checkpoint sends the learner looking for.
        f.panel.setDpadInput('pad', 'up', true);
        f.panel.setDpadInput('pad', 'down', true);
        assert.equal(f.panel.getValue('pad'), 3, 'up + down together report 1|2 = 3');
        f.panel.setDpadInput('pad', 'up', false);
        f.panel.setDpadInput('pad', 'down', false);
        f.step(10);

        // The dot moves, clamped, and the trail latches — the shipped controls
        // do drive the program.
        f.panel.setDpadInput('pad', 'right', true);
        f.step(10);
        f.panel.setDpadInput('pad', 'right', false);
        f.step(10);
        assert.equal(Number(f.val('px')), 1);
        assert.equal(Number(f.val('game_screen')), 2, 'one step right lights bit 1');

        f.panel.setButtonInput('fire', true);
        assert.equal(Number(f.val('btnFire')), 1, 'press writes 1');
        f.step(10);
        f.panel.setButtonInput('fire', false);
        assert.equal(Number(f.val('btnFire')), 0, 'release writes 0');
        f.step(10);
        assert.equal(Number(f.val('trail')), 2, 'FIRE latched the current cell into the trail');

        f.panel.setButtonInput('start', true);
        f.step(10);
        f.panel.setButtonInput('start', false);
        f.step(10);
        assert.equal(Number(f.val('px')), 0);
        assert.equal(Number(f.val('trail')), 0);
        assert.equal(Number(f.val('lives')), 3);

        // The continuous controls the test checkpoint has the learner ADD.
        const joy = f.panel.addWidget('joy1', 'joystick');
        assert.deepEqual(joy.config, {x: 0, y: 0});
        f.panel.setJoystickInput('joy1', 0, 0);
        assert.deepEqual([f.panel.getX('joy1'), f.panel.getY('joy1')], [0, 0], 'centre');
        f.panel.setJoystickInput('joy1', 100, -100);
        assert.deepEqual([f.panel.getX('joy1'), f.panel.getY('joy1')], [100, -100], 'a corner');
        assert.equal(f.panel.getValue('joy1'), 141, 'the scalar readout is the magnitude');
        const slider = f.panel.addWidget('slider1', 'slider');
        assert.deepEqual(slider.config, {min: 0, max: 100, step: 1, value: 0},
            'an added slider has testable endpoints out of the box');
    } finally {
        f.done();
    }
});

test('interactive-input-controls: a toggle contract is reachable from the panel UI', () => {
    // Was an OPEN DEFECT: the widget inspector edited `color`, `fontSize`,
    // `src` and `text` and nothing else, so a button's `toggle` was reachable
    // only by hand-editing controller.json. Fixed 2026-08-24 — the inspector
    // has a Config section, and version 3 of the lesson asks for the toggle
    // prediction on THIS console instead of sending the learner elsewhere.
    const view = readFileSync(path.join(GUI, 'components/tw-pseudocode/controller-panel-view.jsx'), 'utf8');
    assert.match(view, /button: \[\{ key: 'toggle', kind: 'bool'/,
        "the inspector lost its `toggle` field — interactive-input-controls asks the learner " +
        'to make a toggle button on retro-console');
    assert.match(view, /data-testid=\{'bw-ctl-insp-cfg-' \+ f\.key\}/,
        'the config fields are no longer rendered');

    // The behaviour the field reaches, driven through the model.
    const panel = new ControllerPanel();
    assert.equal(panel.addWidget('btn1', 'button').config.toggle, false,
        '"+ Add Widget" still creates a momentary button, which is why the field matters');
    panel.setWidgetConfig('btn1', {toggle: true});
    panel.setButtonInput('btn1', true);
    panel.setButtonInput('btn1', false);
    assert.equal(panel.getWidget('btn1').state.pressed, true,
        'a toggled button latches on press and ignores release');
    panel.setButtonInput('btn1', true);
    assert.equal(panel.getWidget('btn1').state.pressed, false, 'the second press releases it');
});

// ── interactive-displays + interactive-dashboard / lego-hub-face ───────────

test('interactive-displays: what the shipped run actually puts on each face', async () => {
    assert.equal(lesson('interactive-displays').exampleId, 'lego-hub-face');
    assert.equal(lesson('interactive-dashboard').exampleId, 'lego-hub-face');
    const f = await faceplate('lego-hub-face');
    try {
        // The program paces itself with `wait 200 ms`, which scratch-vm times
        // against the wall clock, so a fixed step count buys an amount of
        // PROGRAM time that depends on how loaded the machine is. Run until the
        // motor has completed one full sweep instead — that is the condition the
        // claims below are about — with a hard cap so a stalled run fails
        // loudly rather than hanging.
        const seen = {};
        const frames = new Set();
        const track = ['motor_angle', 'dist_cm', 'colour_id'];
        let steps = 0;
        const sweptFully = () => seen.motor_angle &&
            seen.motor_angle.min === -180 && seen.motor_angle.max === 180 && frames.size === 4;
        while (steps < 200_000 && !sweptFully()) {
            f.step(1);
            steps++;
            for (const name of track) {
                const x = Number(f.val(name));
                if (!seen[name]) seen[name] = {min: x, max: x};
                if (x < seen[name].min) seen[name].min = x;
                if (x > seen[name].max) seen[name].max = x;
            }
            frames.add(Number(f.val('hub_matrix')));
        }
        assert.ok(sweptFully(),
            `the motor sweep did not complete in ${steps} steps — measured ` +
            `${JSON.stringify(seen.motor_angle)} and ${frames.size} matrix frames`);
        // The matrix cycles through exactly the four patterns EXPECTED.md names.
        assert.deepEqual([...frames].sort((a, b) => a - b),
            [31744, 1118480, 4329604, 17043521].sort((a, b) => a - b));

        assert.deepEqual(seen.motor_angle, {min: -180, max: 180},
            'the motor sweep reaches both ends of its own gauge');
        assert.deepEqual(seen.colour_id, {min: 0, max: 10},
            'the colour cycle reaches both ends of its own gauge');
        assert.deepEqual(seen.dist_cm, {min: 10, max: 190},
            'the distance sweep stops short of its gauge at BOTH ends (gauge is 0..200)');

        const gauge = name => f.panel.getWidget(name).config;
        assert.deepEqual(gauge('distance'), {min: 0, max: 200, value: 0, label: 'Dist cm'});

        // Clipping is real — but only a value the shipped program never writes
        // can show it, which is why the v2 checkpoint tells the learner to write one.
        f.set('motor_angle', 1180);
        f.step(1);
        assert.equal(f.panel.getValue('motor'), 180, 'the gauge clamps above its maximum');
        f.set('motor_angle', -1180);
        f.step(1);
        assert.equal(f.panel.getValue('motor'), -180, 'and below its minimum');

        // The one visual state distinct from every valid reading.
        f.set('dist_cm', 'n/a');
        f.step(1);
        assert.ok(Number.isNaN(f.panel.getValue('distance')),
            'a non-numeric variable is the only "unavailable" face a gauge has');
    } finally {
        f.done();
    }
});

test('every faceplate with an operable control opens in play mode', () => {
    // Was an OPEN DEFECT: four of the eleven shipped layouts declared no mode
    // and ControllerPanel defaults to `edit`, where every input control renders
    // disabled — including `retro-console` and `lego-hub-face`, the benches for
    // three Wave 4 lessons. Fixed 2026-08-24 in three places, because the
    // example file alone would have been undone by the first save.
    const INPUTS = new Set(['button', 'slider', 'joystick', 'dpad', 'dial', 'keypad', 'keyboard']);
    const dead = [];
    for (const e of [...index.values()].filter(x => x.files && x.files.controller)) {
        const data = JSON.parse(readFileSync(path.join(EX, e.files.controller), 'utf8'));
        if (!(data.widgets || []).some(w => INPUTS.has(w.type))) continue;
        if (data.mode !== 'play') dead.push(e.id);
    }
    assert.deepEqual(dead, [], 'these faceplates open with dead controls: ' + dead.join(', '));

    // And the mode survives the round trip the host actually makes.
    const panel = new ControllerPanel();
    panel.addWidget('go', 'button');
    panel.setMode('play');
    assert.equal(ControllerPanel.fromJSON(panel.toJSON()).mode, 'play',
        'the panel model dropped the mode again — the example fix is lost on the first save');
    assert.match(readFileSync(path.join(GUI, 'components/gui/gui.jsx'), 'utf8'),
        /controllerPanel\.setMode\(restored\.mode\)/,
        "gui.jsx's PROJECT_LOADED restore no longer applies the mode");
});

// ── interactive-extension-discovery + interactive-sensor-capability ────────

test('OPEN DEFECT: the micro:bit blocks are no-ops in the VM, and this extension shows no connection indicator', () => {
    assert.equal(lesson('interactive-extension-discovery').exampleId, 'mb05-lesson');
    assert.equal(lesson('interactive-sensor-capability').exampleId, 'mb02-sensors');
    const source = readFileSync(path.join(VM_EXT, 'microbitplus/index.js'), 'utf8');

    // Its own header says so, and the methods agree.
    assert.match(source, /opcode methods are intentional no-ops/,
        'microbitplus no longer documents its blocks as VM no-ops — re-measure');
    for (const sensor of ['accel', 'light', 'temp', 'sound', 'compass']) {
        assert.match(source, new RegExp(`${sensor}\\(\\)\\s*\\{\\s*return 0;\\s*\\}`),
            `microbitplus.${sensor}() no longer returns a flat 0 — the sensor lesson can be softened`);
    }
    assert.ok(!/showStatusButton/.test(source),
        'microbitplus now declares showStatusButton — a connection indicator exists and ' +
        'interactive-extension-discovery may name it again');
    // Contrast, so "no indicator" is a property of THIS extension, not of the app.
    assert.match(readFileSync(path.join(VM_EXT, 'spikeprime/index.js'), 'utf8'), /showStatusButton: true/);
});

test('the micro:bit simulator models its sensors, and lite can now vary them', () => {
    // Was an OPEN DEFECT: the simulator declared each sensor with its range,
    // default and unit and accepted `{kind:'set_value', id, value}`, and the
    // string `set_value` appeared nowhere in lite — so the temperature was
    // 21 °C and the light level 127 for ever. Fixed 2026-08-24.
    const sim = readFileSync(
        path.join(GUI, '../static/microbit-sim/build/simulator.js'), 'utf8');
    assert.match(sim, /new RangeSensor\("temperature", -5, 50, 21, "\\xB0C"\)/,
        'the simulator temperature sensor changed — re-measure Wave 4');
    assert.match(sim, /new RangeSensor\("lightLevel", 0, 255, 127/,
        'the simulator light sensor changed — re-measure Wave 4');

    const pane = readFileSync(path.join(GUI, 'components/tw-pseudocode/microbit-sim-pane.jsx'), 'utf8');
    const sent = new Set([...pane.matchAll(/postMessage\(\{kind: '([a-z_]+)'/g)].map(m => m[1]));
    assert.ok(sent.has('set_value'),
        'the sim pane stopped posting set_value — interactive-sensor-capability asks the ' +
        'learner to move each sensor through its declared range');

    // Every id the strip offers must be one the simulator's own switch handles,
    // or the write is silently dropped.
    const offered = [...pane.match(/const SENSOR_IDS = \[([\s\S]*?)\]/)[1]
        .matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]);
    for (const id of offered) {
        assert.ok(sim.includes(`case "${id}":`),
            `the pane offers a control for ${id}, which the simulator cannot set`);
    }
    for (const id of ['temperature', 'lightLevel', 'soundLevel', 'gesture']) {
        assert.ok(offered.includes(id), `${id} is no longer offered a control`);
    }
});

// ── interactive-lego-recovery / spike01-obstacle-avoid ─────────────────────

test('interactive-lego-recovery: the connection observable has a producer, and the hub path needs Scratch Link', () => {
    assert.equal(lesson('interactive-lego-recovery').exampleId, 'spike01-obstacle-avoid');
    assert.equal(lesson('interactive-lego-recovery').environment, 'optional-hardware');
    const observe = checkpoint('interactive-lego-recovery', 'recover').observe;
    assert.deepEqual(observe, {event: 'hardware-state', match: {state: 'connected'}});

    // The producer: gui.jsx turns the VM's peripheral events into the DOM event
    // guided-lessons.jsx listens for.
    const gui = readFileSync(path.join(GUI, 'components/gui/gui.jsx'), 'utf8');
    assert.match(gui, /PERIPHERAL_CONNECTED/);
    assert.match(gui, /bw-hardware-state[\s\S]{0,200}state: 'connected'/);
    const lessons = readFileSync(path.join(GUI, 'components/gui/guided-lessons.jsx'), 'utf8');
    assert.match(lessons, /'hardware-state':\s*'bw-hardware-state'/);

    // The transport: Bluetooth CLASSIC through the Scratch Link helper, not
    // Web Bluetooth from the page.
    const spike = readFileSync(path.join(VM_EXT, 'spikeprime/index.js'), 'utf8');
    assert.match(spike, /getScratchLinkSocket\(\\?"BT\\?"\)/,
        'spikeprime changed transport — re-check what interactive-lego-recovery must disclose');
    assert.ok(!/navigator\.bluetooth|navigator\.serial/.test(spike),
        'spikeprime can now connect from the page itself — the Scratch Link disclosure can go');
});

// ── interactive-calibration-control / arduino-03-calibration ───────────────

test('interactive-calibration-control: the bench sweeps, and the map lands where the lesson says', async () => {
    assert.equal(lesson('interactive-calibration-control').exampleId, 'arduino-03-calibration');
    const bench = await import(path.join(REPO, 'scripts/lesson-bench.mjs'));
    const {board} = await bench.load('arduino-03-calibration');
    const MS = 1000n * 1000n;
    let t = 0n;
    const wiper = pos => {
        board.setControl('pot1', pos);
        board.advanceTo(t += 50n * MS);
        return bench.terminalVolts(board)['pot1.wiper'];
    };
    assert.ok(Math.abs(wiper(0) - 0.0005) < 1e-3, 'the pot bottoms out at the rail');
    assert.ok(Math.abs(wiper(0.5) - 2.5) < 1e-3, 'and sits at half the supply at half travel');
    assert.ok(Math.abs(wiper(1) - 4.9995) < 1e-3, 'and tops out at the rail');

    // The program, under lite's own trace referee with a virtual clock: a full
    // sweep during the 5 s calibration window, then held at one value.
    const creator = new SB3Creator();
    creator.parse(readFileSync(path.join(EX, 'arduino-03-calibration/program.bw'), 'utf8'));
    const stim = hold => {
        const rows = [];
        for (let ms = 0; ms <= 12000; ms += 10) {
            const counts = ms < 5200 ? Math.round(511 + (511 * Math.sin(ms / 300))) : hold;
            rows.push({tMs: ms, pin: 'sensor', volts: (counts / 1023) * 5});
        }
        return rows;
    };
    const run = hold => interpretTrace(creator.project,
        {horizonMs: 9000, stimulus: stim(hold), adc: {bits: 10, vref: 5}, maxSteps: 4_000_000});

    const low = run(0);
    const mid = run(511);
    const high = run(1023);
    assert.deepEqual([low.vars.sensorMin, low.vars.sensorMax], [0, 1022], 'the calibrated band');
    assert.equal(low.vars.outputValue, 0, 'at the calibrated minimum the map gives 0 %');
    assert.equal(mid.vars.outputValue, 50, 'at the midpoint it gives 50 %');
    assert.equal(high.vars.outputValue, 100, 'at the calibrated maximum it gives 100 %');
    // And the duty reaches the pin: the example was repaired upstream on
    // 2026-08-23 (sb3-creator@1a83dfa, vendored as d7325a272) mid-review.
    assert.equal(high.pwm.at(-1).pin, 'led');
    assert.equal(high.pwm.at(-1).percent, 100, 'the green LED is driven to full duty at the top of the band');
    assert.equal(low.pwm.at(-1).percent, 0, 'and to zero at the bottom');
    // The clamp the test checkpoint asks the learner to verify.
    assert.equal(high.vars.sensorValue, 1022,
        'a reading above the band is clamped to the calibrated maximum');
    assert.equal(low.vars.sensorValue, 0,
        'and one below it to the calibrated minimum');
    // Status LED: on for the calibration window, off after. The only pin the
    // program actually drives.
    const statusEdges = low.events.filter(e => e.pin === 'statusled');
    assert.equal(statusEdges.length, 2, 'the status LED goes on and then off');
    assert.equal(statusEdges[0].level, 1);
    assert.equal(statusEdges[1].level, 0);
});

// This test used to be the D32 sentinel — "has no filter, so there is no delay
// to time" — and it fired on 2026-08-29 at the sb3-creator `86a5bab` vendor
// bump. sb3-creator `1d2606b` gave the example a 4-tap boxcar, written as four
// VARIABLES rather than a list because list ops lower to `0 /* item */` on the
// device: a filter that is a no-op on real silicon would have been a worse
// lesson than no filter at all.
test('interactive-calibration-control: the filter is four taps, and its cost is measurable', () => {
    const source = readFileSync(path.join(EX, 'arduino-03-calibration/program.bw'), 'utf8');
    assert.match(source, /average/i, 'the filter is gone again — re-open D32');
    assert.ok(!/^\s*(add|item|delete) .*\blist\b/mi.test(source),
        'the filter must not be a list: list ops lower to `0 /* item */` on the device');
    assert.match(source, /^PIN led = D9 PWM$/m,
        'the led pin is no longer PWM — if the actuator went inert again, re-measure Wave 4');
    assert.match(source, /^\s*set led to outputValue percent$/m,
        'the PWM write changed — re-measure Wave 4 and the numbers in its review');

    const creator = new SB3Creator();
    creator.parse(source);
    // The calibration sweep must reach BOTH rails, or the mapped percentages
    // come out against a narrower band and the staircase reads 24/50/75 instead
    // of 24/49/74. That is arithmetic, not a defect — but it is why this
    // stimulus clips a larger sine rather than reusing the one above.
    const rows = [];
    for (let ms = 0; ms <= 12000; ms += 10) {
        const counts = ms < 5200
            ? Math.min(1023, Math.max(0, Math.round(512 + (600 * Math.sin(ms / 300)))))
            : (ms < 8000 ? 0 : 1023);
        rows.push({tMs: ms, pin: 'sensor', volts: (counts / 1023) * 5});
    }
    const at = horizonMs => interpretTrace(creator.project,
        {horizonMs, stimulus: rows, adc: {bits: 10, vref: 5}, maxSteps: 6_000_000});
    assert.deepEqual([at(8000).vars.sensorMin, at(8000).vars.sensorMax], [0, 1023],
        'the calibration must cover the full span, or the percentages below shift');
    assert.equal(at(7990).vars.outputValue, 0, 'before the step');
    // Four loop passes, one quarter of the step each: the boxcar's own shape.
    assert.deepEqual(
        [8000, 8020, 8040, 8060].map(h => at(h).vars.outputValue),
        [24, 49, 74, 100],
        'the 4-tap staircase changed — re-measure Wave 4 and arduino-03-calibration/EXPECTED.md');
    assert.equal(at(8200).vars.outputValue, 100, 'and it stays there');
    // The duty reaches the pin at every step, not only at the end.
    assert.equal(at(8020).pwm.at(-1).percent, 49, 'the half-filled window drives the LED too');
});

// ── The lesson copy this review wrote, in both languages ───────────────────

test('the Wave 4 revisions are present, EN and DE, at the content version this review recorded', () => {
    const versions = Object.fromEntries(wave.lessons.map(l => [l.id, l.version]));
    assert.deepEqual(versions, {
        'interactive-extension-discovery': 3,
        'interactive-sensor-capability': 3,
        'interactive-lego-recovery': 2,
        'interactive-input-controls': 3,
        'interactive-displays': 2,
        'interactive-two-way-binding': 3,
        'interactive-dashboard': 1,
        'interactive-calibration-control': 3
    }, 'a Wave 4 lesson changed content version — update docs/LESSON-REVIEW-WAVE-4.md with it');

    const says = (id, cp, field, en, de) => {
        const copy = checkpoint(id, cp).copy;
        assert.match(copy.en[field], en, `${id}/${cp}: the English ${field} lost its Wave 4 revision`);
        assert.match(copy.de[field], de, `${id}/${cp}: the German ${field} lost its Wave 4 revision`);
    };
    says('interactive-extension-discovery', 'inspect', 'hint', /Run on Simulator/, /Im Simulator/);
    says('interactive-sensor-capability', 'observe', 'hint', /Sensors strip/, /Sensorleiste/);
    says('interactive-lego-recovery', 'recover', 'hint', /Scratch Link/, /Scratch Link/);
    says('interactive-input-controls', 'predict', 'action', /toggle.*inspector|inspector.*toggle/i, /Inspektor/);
    says('interactive-displays', 'observe', 'action', /beyond|outside/i, /au(ß|ss)erhalb/i);
    says('interactive-two-way-binding', 'test', 'action', /re-bind/i, /binde .*neu|neu — /i);
    // v3 (D32 closed): the bench grew the filter, so the predict hint stopped
    // saying there is none and started asking for a prediction that can be
    // checked against a measurement.
    says('interactive-calibration-control', 'predict', 'hint', /Predict it, then measure it/, /Sage es voraus und miss es dann/);
    says('interactive-calibration-control', 'predict', 'hint', /80 ms.*30 ms|24, 49, 74, 100/s, /80 ms.*30 ms|24, 49, 74, 100/s);
    says('interactive-calibration-control', 'test', 'action', /sensorValue.*outputValue/, /sensorValue.*outputValue/);
    says('interactive-calibration-control', 'test', 'hint', /no plausibility check/i, /Plausibilit(ä|ae)tspr(ü|ue)fung fehlt/i);
});

// ── Coverage: every checkpoint in the wave is accounted for ────────────────

test('every Wave 4 checkpoint is accounted for by this review', () => {
    const total = wave.lessons.reduce((n, l) => n + l.checkpoints.length, 0);
    assert.equal(total, 16, 'Wave 4 gained or lost a checkpoint — review it and update the doc');
    const doc = path.join(REPO, 'docs/LESSON-REVIEW-WAVE-4.md');
    assert.ok(existsSync(doc), 'docs/LESSON-REVIEW-WAVE-4.md is missing');
    const text = readFileSync(doc, 'utf8');
    for (const l of wave.lessons) {
        assert.ok(text.includes(l.id), `${l.id} is not named in the Wave 4 review`);
        for (const cp of l.checkpoints) {
            assert.ok(text.includes(`${l.id}/${cp.id}`) || text.includes(`\`${cp.id}\``),
                `${l.id}/${cp.id} is not accounted for in the Wave 4 review`);
        }
    }
});
