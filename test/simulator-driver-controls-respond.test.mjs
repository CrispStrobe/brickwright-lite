/**
 * Every declared INPUT pin that has a control wired to it must RESPOND to that
 * control, through the simulator driver, on the bench its example ships.
 *
 * WHY THIS EXISTS
 * ---------------
 * This is the defect class of the Pocket Calculator report (lite `39b83a1f9`):
 * a learner presses a key and nothing happens, or the wrong key registers. It
 * had no gate in this repo at all — `declared-pins-wired.test.mjs` asks whether
 * a declared pad is WIRED, and every one of these pads was. What nothing asked
 * is whether the pin the program reads MOVES when its own button is operated.
 *
 * The repair that closed that report fixed half of a two-family defect, and the
 * upstream gate written alongside it (`js-driver-oled-chain`) covers the
 * 70-calculator, which is a Pico. Measured over every example that ships both a
 * `program.bw` declaring an INPUT pin and a `circuit.json` with a button or
 * switch on that pin's net — 34 benches, 84 such pins — counting pins whose
 * `readPin` does NOT change when their own control is operated:
 *
 *     no arming at all           (before sb3-creator 0777a17)   60 / 84 dead
 *     armed with driveHigh=false (0777a17)                      22 / 84 dead
 *     armed at the pull's rail   (553a639)                       1 / 84 dead
 *
 * RE-DERIVED 2026-08-25 when the gallery sync to sb3-creator 73d3174 took the
 * population from 33/67 to 34/84. ONE of the three moved: unarmed 43 -> 60,
 * because all 17 new pins are ones the repair rescues. `armedLow` stayed at 22
 * and `armedRail` stayed at 1, so no bench joined the dead set with the repair
 * in place — the growth is in the counterfactual, which is the direction that
 * means the repair covers more, not that something regressed.
 *
 * WHAT "RESPOND" MEANS, and why it is not "an unpressed key reads 0".
 * This gate is deliberately declaration-AGNOSTIC. `26-debounce` declares
 * `PIN btn = P3.2 INPUT` and inverts in the program (`wait until read btn = 0`);
 * `05-counter` declares `INPUT ACTIVE LOW` and lets the driver invert. Both are
 * correct, and a gate that asserted "an unpressed key reads 0" would have called
 * one of them a defect — I wrote that gate first and it did exactly that. What
 * no correct bench can do is fail to CHANGE.
 *
 * WHICH FILES IT OPENS.
 * The circuit comes from `examples/index.json`, never from a hardcoded
 * `circuit.json` — `scripts/lesson-bench.mjs` records why: retargetable examples
 * such as `11-toggle-button` ship ten benches and no bare `circuit.json`, so
 * globbing for that name measures a file the app never opens, and silently drops
 * seven of the thirty-three benches (it dropped exactly seven when this gate was
 * first written).
 *
 * WHICH ENGINE THIS TESTS.
 * The one lite VENDORS (`overlay/scratch-gui/src/lib/{bw-circuit-ui,bw-board}`)
 * plus the INTEGRATED compiler, which together are what the browser runs. It
 * needs no sibling checkout and therefore cannot skip in CI — which matters
 * here more than usual, because the upstream twin of this gate cannot run on a
 * box whose bw-board checkout has no `avr8js`.
 *
 * RATCHET: `EXPECTED_DEAD` may only shrink.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OV = path.join(root, 'overlay/scratch-gui/src/lib');
const INTEGRATED = path.join(root, 'packages/scratch-gui');
const EXAMPLES = path.join(root, 'overlay/scratch-gui/examples');

/**
 * The one bench whose control still cannot respond, with the reason and the
 * owner. `arduino-02-digital-input-pullup` is the Arduino sketch whose whole
 * subject is `pinMode(2, INPUT_PULLUP)`: the button goes to ground and the
 * bench carries no pull resistor, so the pull must come from inside the MCU.
 * Its declaration is `PIN btn = D2 INPUT` — active HIGH — which the driver
 * correctly honours as a programmed pull-DOWN, leaving both sides of the button
 * at 0 V. The fix is the declaration (`INPUT ACTIVE LOW` is what INPUT_PULLUP
 * plus button-to-ground means), it is upstream in sb3-creator's examples, and
 * it changes what the example emits for real silicon — so it carries its own
 * verdict rather than riding along inside a driver fix.
 */
const EXPECTED_DEAD = new Set(['arduino-02-digital-input-pullup:btn']);

const MS = 1000000n;

/** Every example, in the shape the app resolves them: index.json is the map. */
function exampleIndex () {
    const raw = JSON.parse(readFileSync(path.join(EXAMPLES, 'index.json'), 'utf8'));
    const list = Array.isArray(raw) ? raw : raw.examples;
    return [...list].sort((a, b) => a.id.localeCompare(b.id));
}

const overlayCompiler = readFileSync(path.join(OV, 'sb3-creator.js'));
const integratedCompiler = readFileSync(path.join(INTEGRATED, 'src/lib/sb3-creator.js'));
test('instrument: the integrated compiler is byte-identical to the overlay copy', () => {
    assert.ok(overlayCompiler.equals(integratedCompiler),
        `the integrated sb3-creator differs from overlay/ (${integratedCompiler.length} vs ` +
        `${overlayCompiler.length} bytes). Run \`node scripts/integrate.mjs\`; until then every ` +
        'number in this file belongs to a tree this repo does not own.');
});

const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;

let _circuitMod = null;
async function boot () {
    if (_circuitMod) return _circuitMod;
    const {setEngine} = await import(path.join(OV, 'bw-circuit-ui/engine.js'));
    const {BoardImpl} = await import(path.join(OV, 'bw-board/board.js'));
    const {inferNetlist, checkWiring} = await import(path.join(OV, 'bw-board/infer-netlist.js'));
    const {hasDevice, getDevice} = await import(path.join(OV, 'bw-board/devices.js'));
    (await import(path.join(OV, 'bw-board/register-all.js'))).registerAllDevices();
    const {runDcSweep, runAcSweep, logSpace} = await import(path.join(OV, 'bw-board/sweep.js'));
    setEngine({BoardImpl, inferNetlist, checkWiring, hasDevice, getDevice,
        runDcSweep, runAcSweep, logSpace});
    const {registerSidecar} = await import(path.join(OV, 'bw-circuit-ui/model/parts-registry.js'));
    for (const name of readdirSync(path.join(OV, 'bw-circuit-ui/parts-data'))) {
        if (!name.endsWith('.json')) continue;
        const sidecar = JSON.parse(readFileSync(path.join(OV, 'bw-circuit-ui/parts-data', name), 'utf8'));
        if (sidecar.kind) registerSidecar(sidecar);
    }
    _circuitMod = await import(path.join(OV, 'bw-circuit-ui/model/circuit.js'));
    return _circuitMod;
}

/**
 * The driver's OWN arming, executed.
 *
 * The first version of this gate passed its own `mode => mode === 'quasi'` rule
 * into the sweep, and reverting the emitter's rail then left it green: it was
 * measuring the rule I had typed, not the one the app emits. So the arming here
 * is the emitted `_mod` and `_bw_arm` themselves, evaluated out of the generated
 * text — which is why mutating the emitter turns this red.
 *
 * @param {string} js  the emitted simulator-driver program
 * @returns {{mode: function, arm: function(object):void}}
 */
function driverArming (js) {
    const mode = js.match(/const _mod = (\(p\) => \(.*?\));/);
    const pins = js.match(/const _stc12_pins = (\{.*?\});/s);
    const arm = js.match(/const _bw_arm = (\(b\) => \{[\s\S]*?\} \};)/);
    assert.ok(mode && pins && arm,
        'the simulator driver no longer emits `_mod` / `_stc12_pins` / `_bw_arm` in the shape ' +
        'this gate reads. Re-read stc12SimulatorDriver before trusting any number here — a ' +
        'gate that silently stops finding its subject reports zero defects for the wrong reason.');
    // eslint-disable-next-line no-new-func
    const built = new Function(
        `const _stc12_pins = ${pins[1]};\nconst _mod = ${mode[1]};\nlet _bw_armed_board = null;\n` +
        `const _bw_arm = ${arm[1]}\nreturn {mode: _mod, arm: _bw_arm, pins: _stc12_pins};`)();
    return built;
}

/**
 * Sweep the corpus under one arming rule.
 * @param {'shipped'|null|function(string):boolean} rail
 *   `'shipped'` runs the emitted `_bw_arm` itself — the only value that measures
 *   the app. `null` arms nothing. A function is a counterfactual rail, used only
 *   by the three-way comparison below to re-derive this file's header numbers.
 */
async function sweep (rail) {
    const {Circuit} = await boot();
    const dead = [];
    let benches = 0;
    let pins = 0;

    for (const entry of exampleIndex()) {
        const id = entry.id;
        if (!entry.files?.program || !entry.files?.circuit) continue;
        const prog = path.join(EXAMPLES, entry.files.program);
        const circ = path.join(EXAMPLES, entry.files.circuit);
        if (!existsSync(prog) || !existsSync(circ)) continue;
        let creator;
        try {
            creator = new SB3Creator();
            creator.parse(readFileSync(prog, 'utf8'));
        } catch { continue; }
        const stc = creator.project?.stc;
        if (!stc?.pins?.some(p => p.direction === 'input')) continue;
        let js;
        try { js = creator.generateJavaScript(undefined, {driver: 'simulator'}); } catch { continue; }
        const table = js.match(/const _stc12_pins = (\{.*?\});/s);
        if (!table) continue;
        const pinTable = JSON.parse(table[1]);
        const {mode, arm} = driverArming(js);
        const data = JSON.parse(readFileSync(circ, 'utf8'));

        let probe;
        try { probe = Circuit.fromJSON(JSON.parse(JSON.stringify(data))); } catch { continue; }
        if (!probe.board?.parts?.length) continue;
        benches++;

        for (const [name, p] of Object.entries(pinTable)) {
            if (p.dir !== 'input') continue;
            const net = probe.board.nets.find(n => n.terminals.some(
                t => String(t.terminal).toLowerCase() === String(p.pin).toLowerCase()));
            if (!net) continue;
            const control = net.terminals
                .map(t => probe.board.parts.find(x => x.id === t.part))
                .find(x => x && (x.kind === 'button' || x.kind === 'switch'));
            if (!control) continue;
            pins++;

            const c = Circuit.fromJSON(JSON.parse(JSON.stringify(data)));
            const board = c.board;
            if (rail === 'shipped') {
                // The emitted arming, run against this board exactly as `_board()`
                // runs it on the first driver call. Its own setPin may throw on a
                // pin this bench does not carry; the driver would too.
                const guarded = new Proxy(board, {get (t, k) {
                    if (k !== 'setPin') return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
                    return (...a) => { try { return t.setPin(...a); } catch { /* not on this bench */ } };
                }});
                arm(guarded);
            } else if (rail) {
                for (const q of Object.values(pinTable)) {
                    if (q.dir === 'output') continue;
                    const m = mode(q);
                    try { board.setPin(q.pin, m, rail(m)); } catch { /* not on this bench */ }
                }
            }
            board.advanceTo(10n * MS);
            const before = !!board.readPin(p.pin);
            c.setControl(control.id, 1);
            board.advanceTo(60n * MS);
            if (before === !!board.readPin(p.pin)) dead.push(`${id}:${name}`);
        }
    }
    return {benches, pins, dead};
}

/** The rule the driver actually emits, extracted rather than assumed. */
function shippedRail () {
    const src = overlayCompiler.toString();
    const m = src.match(/if \(p\.dir !== "output"\) b\.setPin\(p\.pin, ([^,]+), ([^)]+)\);/);
    assert.ok(m, 'the arming loop changed shape — re-read stc12SimulatorDriver before trusting this gate');
    return m[2].trim();
}

test('the driver arms a quasi pin at its own rail, not at zero', () => {
    assert.equal(shippedRail(), 'm === "quasi"',
        'the third argument to setPin is the pull\'s RAIL. input-pullup and input-pulldown ' +
        'carry their own rail in bw-board/pin-model.js and ignore it; quasi does not — a quasi ' +
        'pin idles HIGH, and arming it low clamps the net to ~0 V so no button on it can move ' +
        'the reading again. Arming with a flat `false` left 22 of 67 wired controls dead.');
});

test('every wired control moves the pin its program reads', async () => {
    const {benches, pins, dead} = await sweep('shipped');

    // Denominators, so a shrinking population cannot look like a repair.
    assert.ok(benches >= 33, `${benches} benches swept (expected at least 33)`);
    assert.ok(pins >= 67, `${pins} declared input pins carry a control (expected at least 67)`);

    const unexpected = dead.filter(d => !EXPECTED_DEAD.has(d));
    assert.deepEqual(unexpected, [],
        `${unexpected.length} of ${pins} wired controls do not move the pin their program reads. ` +
        'Operating the control leaves readPin unchanged, so the bench cannot tell pressed from ' +
        'released — the Pocket Calculator symptom, on a different bench.\n  ' +
        unexpected.join('\n  '));

    const fixed = [...EXPECTED_DEAD].filter(d => !dead.includes(d));
    assert.deepEqual(fixed, [],
        `${fixed.join(', ')} now responds. This ratchet may only shrink: delete the entry from ` +
        'EXPECTED_DEAD in the same commit that fixed it, and take the count down in ' +
        'docs/WAVE-OPEN-DEFECTS.md with it.');
});

test('both halves of the repair are measurable, and each one helps', async () => {
    // The three rules, so this file's header numbers are RE-DERIVED rather than
    // asserted, and so a future edit to the arming loop is judged by what it does
    // to the corpus rather than by whether it still parses.
    const unarmed = await sweep(null);
    const armedLow = await sweep(() => false);
    const armedRail = await sweep('shipped');

    assert.equal(unarmed.pins, armedRail.pins, 'the three sweeps see the same population');
    assert.equal(unarmed.dead.length, 60,
        `unarmed: ${unarmed.dead.length} dead of ${unarmed.pins} (the pre-0777a17 corpus number, ` +
        're-derived at 84 pins on 2026-08-25; it was 43 of 67)');
    assert.equal(armedLow.dead.length, 22,
        `armed low: ${armedLow.dead.length} dead of ${armedLow.pins} (the 0777a17 corpus number — ` +
        'the board-class half of the repair, with the 8051 half still open)');
    assert.equal(armedRail.dead.length, EXPECTED_DEAD.size,
        `armed at the rail: ${armedRail.dead.length} dead, EXPECTED_DEAD names ${EXPECTED_DEAD.size}`);

    // And the 22 are the 8051 side specifically — the shape of the finding, not
    // just its size. Three of them are Wave 5 lesson benches.
    for (const id of ['05-counter:button', '26-debounce:btn', '60-retro-console:btn1']) {
        assert.ok(armedLow.dead.includes(id), `${id} was dead under the 0777a17 arming rule`);
        assert.ok(!armedRail.dead.includes(id), `${id} responds under the current one`);
    }
});
