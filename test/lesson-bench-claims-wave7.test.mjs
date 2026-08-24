/**
 * Wave 7 — "Computers from wires upward" — claims gate.
 *
 * Wave 7's benches are whole computers, so this gate drives the surfaces the
 * app drives: `scripts/lesson-bench.mjs` for the analogue benches (the same
 * `bw-circuit-ui` over `bw-board` the browser runs), `extract6502Machine` /
 * `extractZ80Machine` for the bus extract behind the designer's "Build
 * Machine" button, `m6502-debug` for what the debugger can report, and lite's
 * own trace referee for the two MCU programs.
 *
 * A NOTE ON ONE NEAR-MISS, because it shaped this gate: reading
 * `DebugStatus.jsx` alone says the machine debugger shows a halt flag, a step
 * button and a millisecond counter, and three lessons would then be asking for
 * registers and memory that do not exist. They do exist —
 * `ArchitectureFace.jsx` renders A/X/Y/SP/PC, the P flags, the address and data
 * buses, IR, the live disassembly at PC and the cycle count, and
 * `debug-drawer.jsx` renders a paged memory view and the stack. Wave 1 recorded
 * the same trap with the scope and the flyback spike: check the instrument the
 * learner would actually use before calling a lesson impossible.
 *
 * Tests named OPEN DEFECT assert a defect STILL REPRODUCES; each names the
 * lesson hint to soften and this document to update when it is fixed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {boot, load, terminalVolts, EXAMPLES, fmt} from '../scripts/lesson-bench.mjs';
import {INTEGRATED} from './helpers/bw-integrated.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const GUI = path.join(REPO, 'overlay/scratch-gui/src');
const CUI = path.join(GUI, 'lib/bw-circuit-ui');
const BWB = path.join(GUI, 'lib/bw-board');
const WAVE = JSON.parse(readFileSync(
    path.join(GUI, 'components/gui/lesson-waves/machines-7.json'), 'utf8'));

const MS = 1000n * 1000n;
const lesson = id => {
    const found = WAVE.lessons.find(l => l.id === id);
    assert.ok(found, `${id} is no longer in machines-7.json`);
    return found;
};
const checkpoint = (id, cp) => {
    const found = lesson(id).checkpoints.find(c => c.id === cp);
    assert.ok(found, `${id} has no "${cp}" checkpoint`);
    return found;
};
const circuitOf = id => JSON.parse(readFileSync(path.join(EXAMPLES, id, 'circuit.json'), 'utf8'));
const near = (actual, expected, tol, what) =>
    assert.ok(Math.abs(actual - expected) <= tol,
        `${what}: measured ${fmt(actual)}, expected ${expected} ± ${tol}`);

await boot();
const {extract6502Machine} = await import(path.join(BWB, 'm6502-extract.js'));
const {extractZ80Machine} = await import(path.join(BWB, 'z80-extract.js'));
const {createM6502Adapter} = await import(path.join(BWB, 'm6502-adapter.js'));
const {createM6502DebugTarget} = await import(path.join(BWB, 'm6502-debug.js'));
const SB3Creator = (await import(path.join(INTEGRATED, 'src/lib/sb3-creator.js'))).default;
const {interpretTrace} = await import(path.join(INTEGRATED, 'src/lib/trace-oracle.js'));

test('instrument: Wave 7 still has the ten lessons this gate measures', () => {
    assert.equal(WAVE.wave, 'machines-7');
    assert.deepEqual(WAVE.lessons.map(l => l.id).sort(), [
        'machines-6502-execution', 'machines-address-decode', 'machines-buses',
        'machines-clocks', 'machines-contention', 'machines-gates-registers',
        'machines-interrupts-performance', 'machines-logic-levels',
        'machines-memory-maps', 'machines-source-asm'
    ]);
    assert.equal(WAVE.lessons.reduce((n, l) => n + l.checkpoints.length, 0), 20);
});

// ── machines-logic-levels / 06-active-low-high ─────────────────────────────

test('OPEN DEFECT: the active-high level the lesson quotes depends on the port mode', async () => {
    assert.equal(lesson('machines-logic-levels').exampleId, '06-active-low-high');
    // The bench: an active-low LED from the rail through P1.0, an active-high
    // LED from P1.1 to ground.
    const read = async mode => {
        const {board} = await load('06-active-low-high');
        board.setPin('P1.0', mode, false);
        board.setPin('P1.1', mode, true);
        board.advanceTo(50n * MS);
        const v = terminalVolts(board);
        return {
            low: v['mcu1.P1.0'], high: v['mcu1.P1.1'],
            lowLed: board.ledBrightness('led_low'), highLed: board.ledBrightness('led_high')
        };
    };
    const pushpull = await read('pushpull');
    near(pushpull.low, 0.0725, 5e-4, 'P1.0 driven low, push-pull');
    near(pushpull.high, 4.9275, 5e-4, 'P1.1 driven high, push-pull');
    near(pushpull.lowLed, 0.1449, 5e-4, 'the active-low LED');
    near(pushpull.highLed, 0.1449, 5e-4, 'the active-high LED, push-pull');

    // The 8051's default port mode is quasi-bidirectional: a weak pull-up that
    // cannot source an LED. Same pin, same "high", 2.8 V lower.
    const quasi = await read('quasi');
    near(quasi.low, 0.0725, 5e-4, 'P1.0 driven low is the same in either mode');
    near(quasi.high, 2.1193, 5e-4, 'P1.1 driven high, quasi-bidirectional');
    near(quasi.highLed, 0.0066, 5e-4, 'and the active-high LED is essentially dark');
    assert.ok(quasi.highLed < pushpull.highLed / 20,
        'the two port modes no longer differ on this bench — re-measure Wave 7');
});

// ── machines-gates-registers / 20-shift-register-binary ────────────────────
//
// The OPEN DEFECT sentinel that stood here is GONE, on its own instructions.
// It asserted that the data line never toggles — `bitand val 128 > 0` parsed as
// three variable names, so the 595 was fed a constant zero and all eight LEDs
// stayed dark for the whole 64-second count — and it was written to go RED the
// moment that stopped being true. The upstream repair (prefix bit operators
// rewritten to the dialect's infix form) reached lite in this vendor, the
// sentinel fired, and the lesson's version-2 wording — which told the learner to
// "record that the data line never changes level at all" — became the false
// statement. `machines-gates-registers` is restored to its version-1 checkpoint
// and bumped to version 3.

// ── machines-clocks / ttl-clock-module ─────────────────────────────────────

test('machines-clocks: the oscillator itself is measurable and tunable', async () => {
    assert.equal(lesson('machines-clocks').exampleId, 'ttl-clock-module');
    const measure = async pos => {
        const {board} = await load('ttl-clock-module');
        board.setControl('pot1', pos);
        const net = board.nets.find(n =>
            n.terminals.some(t => t.part === 'u1' && t.terminal === 'output')).id;
        let t = 0n;
        let prev = null;
        const edges = [];
        for (let i = 0; i < 3000 && edges.length < 9; i++) {
            t += 200n * 1000n;               // 200 us
            board.advanceTo(t);
            const hi = board.nodeVoltage(net) > 2.5;
            if (prev !== null && hi !== prev) edges.push({t: Number(t) / 1e6, rise: hi});
            prev = hi;
        }
        assert.ok(edges.length >= 6, `only ${edges.length} edges at pot ${pos}`);
        const periods = [];
        for (let i = 2; i < edges.length; i++) {
            if (edges[i].rise === edges[i - 2].rise) periods.push(edges[i].t - edges[i - 2].t);
        }
        const period = periods.reduce((a, b) => a + b, 0) / periods.length;
        const firstRise = edges.find(e => e.rise);
        const nextFall = edges.find(e => !e.rise && e.t > firstRise.t);
        return {period, high: nextFall.t - firstRise.t};
    };
    const slow = await measure(0.1);
    const mid = await measure(0.5);
    const fast = await measure(0.9);
    near(slow.period, 127.10, 0.5, 'period at pot 10 %');
    near(mid.period, 71.09, 0.5, 'period at pot 50 %');
    near(fast.period, 15.00, 0.5, 'period at pot 90 %');
    for (const [name, m] of [['slow', slow], ['mid', mid], ['fast', fast]]) {
        const duty = (m.high / m.period) * 100;
        assert.ok(duty > 45 && duty < 55, `${name} duty cycle is ${duty.toFixed(1)} %`);
    }
    // One cycle fits the scope's fixed 81.92 ms record only above about 12 Hz.
    assert.ok(slow.period > 81.92, 'the slowest setting no longer overruns the scope record');
    assert.ok(mid.period < 81.92 && fast.period < 81.92);
});

test('OPEN DEFECT: the clock module has no downstream state and its step button drives nothing', async () => {
    const {board} = await load('ttl-clock-module');
    // Nothing on this bench stores state: no flip-flop, no counter, no register.
    const kinds = new Set(board.parts.map(p => p.kind));
    assert.deepEqual([...kinds].sort(), [
        '555', 'button', 'capacitor', 'gnd', 'led', 'potentiometer', 'resistor', 'vcc'
    ], 'the clock module changed parts — re-measure Wave 7; if it grew a flip-flop, ' +
       'restore the downstream-transition half of machines-clocks');

    // The "manual step button" sits on a net with a pull resistor and nothing
    // else: it cannot reach the timer or the LED. This is topology, not timing.
    const btnNet = board.nets.find(n =>
        n.terminals.some(t => t.part === 'btn1' && t.terminal === 'b'));
    assert.deepEqual(btnNet.terminals.map(t => `${t.part}.${t.terminal}`).sort(),
        ['btn1.b', 'r3.a'],
        'the step button now reaches something — restore the single-step half of ' +
        'machines-clocks and delete this test');
    // And reset is strapped to the rail, so the button cannot halt the timer either.
    const resetNet = board.nets.find(n =>
        n.terminals.some(t => t.part === 'u1' && t.terminal === 'reset'));
    assert.ok(resetNet.terminals.some(t => t.part === 'vcc1'),
        'u1.reset is no longer strapped to VCC — re-measure Wave 7');
    // EXPECTED.md still claims otherwise.
    assert.match(readFileSync(path.join(EXAMPLES, 'ttl-clock-module/EXPECTED.md'), 'utf8'),
        /manual step button injects a single\s+pulse/,
        'ttl-clock-module/EXPECTED.md no longer claims the step button works — the example ' +
        'was repaired or the claim withdrawn; re-measure Wave 7');
});

// ── The 6502 / Z80 benches ─────────────────────────────────────────────────

test('machines-memory-maps and machines-address-decode: the map the lessons ask for is produced and displayed', () => {
    assert.equal(lesson('machines-memory-maps').exampleId, 'eater6502-full-build');
    assert.equal(lesson('machines-address-decode').exampleId, 'eater6502-bench');
    for (const id of ['eater6502-bench', 'eater6502-full-build']) {
        const r = extract6502Machine(circuitOf(id));
        assert.ok(r.ok, `${id}: ${(r.reasons || []).join('; ')}`);
        assert.deepEqual(r.lines, [
            'MAP RAM $0000-$3FFF',
            'MAP ROM $8000-$FFFF',
            'CHIP via = W65C22 AT $6000',
            'CHIP acia = W65C51 AT $5000'
        ], `${id}: the extracted map changed — re-measure Wave 7`);
        // Mirrors and the hole: exactly what the lessons ask the learner to derive.
        assert.ok(r.notes.some(n => /via mirrors through \$6000-\$7FFF/.test(n)));
        assert.ok(r.notes.some(n => /acia mirrors through \$5000-\$5FFF/.test(n)));
        assert.ok(r.notes.some(n => /4096 addresses decode to nothing \(open bus\)/.test(n)));
    }
    // And the designer renders all three — lines, notes and reasons — under
    // the "Build Machine" button.
    const designer = readFileSync(path.join(CUI, 'components/CircuitDesigner.jsx'), 'utf8');
    assert.match(designer, /data-build-machine/);
    assert.match(designer, /machineResult\.lines && machineResult\.lines\.map/);
    assert.match(designer, /machineResult\.notes && machineResult\.notes\.length > 0/);
    assert.match(designer, /machineResult\.reasons\.map/);
});

test('machines-contention: the evidence the lesson asks for is exact, down to the address', () => {
    assert.equal(lesson('machines-contention').exampleId, 'eater6502-contention-bug');
    const r = extract6502Machine(circuitOf('eater6502-contention-bug'));
    assert.equal(r.ok, false);
    assert.deepEqual(r.reasons, [
        'bus contention at $2000: ram and via are both selected — the decode must make them exclusive'
    ], 'the contention report changed — re-measure Wave 7');
});

test('OPEN DEFECT: machines-contention observes an event this bench cannot fire', () => {
    // The same app defect Wave 1 recorded for starter-circuit-path and Wave 6
    // for signals-resonance: `circuit-changed` fires only when the derived PIN
    // declarations move, and a 6502 bench has none.
    assert.deepEqual(checkpoint('machines-contention', 'repair').observe, {event: 'circuit-changed'});
    const designer = readFileSync(path.join(CUI, 'components/CircuitDesigner.jsx'), 'utf8');
    assert.match(designer, /circuitToDeclarations/,
        'CircuitDesigner no longer derives declarations to decide whether to notify — ' +
        're-measure and update docs/LESSON-REVIEW-WAVE-7.md');
});

test('OPEN DEFECT: the machine benches boot with an empty ROM — the example program is not the image', () => {
    for (const id of ['machines-6502-execution', 'machines-source-asm', 'machines-interrupts-performance']) {
        assert.match(JSON.stringify(checkpoint(id, lesson(id).checkpoints[1].id).observe),
            /debug-phase/, `${id} no longer observes the debugger`);
    }
    // 1. No example in this wave ships a ROM image: the 28c256 parts carry no
    //    params and no example declares media.
    for (const id of ['eater6502-bench', 'eater6502-blink', 'eater6502-vdp-hello',
        'eater6502-contention-bug', 'eater6502-full-build']) {
        for (const p of circuitOf(id).parts) {
            if (p.kind !== '28c256') continue;
            assert.deepEqual(p.params || {}, {},
                `${id}'s ROM chip now carries an image — re-measure Wave 7`);
        }
    }
    // 2. The runner SKIPS the compile for machine-class targets (so these
    //    lessons, unlike all ten of Wave 5's, need no network) and boots the
    //    extracted machine with an empty ROM, saying so in its status line.
    const runner = readFileSync(path.join(GUI, 'lib/bw-debug/debug-runner.js'), 'utf8');
    assert.match(runner, /selectedKind === 'z80' \|\| selectedKind === 'eater6502'\) \? null : await build\(\)/,
        'the machine path now builds an image — re-measure Wave 7; these lessons may be ' +
        'able to run their own program after all');
    assert.match(runner, /extracted machine booted with an empty ROM — load a program \(presets, file, or ASM tab\)/,
        'the empty-ROM status line changed — re-measure Wave 7');
    // 3. What an empty ROM executes: the reset vector reads $0000 and the CPU
    //    sits on BRK.
    const m = extract6502Machine(circuitOf('eater6502-blink'));
    const adapter = createM6502Adapter({config: {regions: m.regions, chips: m.chips}});
    adapter.attachBoard({advanceTo () {}, setPin () {}});
    const target = createM6502DebugTarget(adapter, {});
    const regs = target.regs();
    assert.equal(regs.pc, 0x0000, 'an empty ROM leaves the reset vector at $0000');
    assert.equal(target.disasm(regs.pc).text, 'BRK #$00');
    // 4. The presets that DO give the learner a program, all bundled, no network.
    const designer = readFileSync(path.join(CUI, 'components/CircuitDesigner.jsx'), 'utf8');
    for (const rom of ['taliforth-py65mon.bin', 'basic.rom', 'lcd-hello.bin', 'z80-mirror.bin']) {
        assert.ok(designer.includes(rom), `the ${rom} preset is gone — re-measure Wave 7`);
    }
});

test('machines-6502-execution: the debugger reports everything the checkpoint asks for', () => {
    // Nearly mis-called: DebugStatus.jsx alone shows none of this. The faces do.
    const m = extract6502Machine(circuitOf('eater6502-blink'));
    const rom = new Uint8Array(readFileSync(
        path.join(GUI, '../static/roms/lcd-hello.bin')));
    assert.equal(rom.length, 32768, 'the LCD Hello preset changed size — re-measure');
    const adapter = createM6502Adapter({config: {regions: m.regions, chips: m.chips}, rom});
    adapter.attachBoard({advanceTo () {}, setPin () {}});
    const target = createM6502DebugTarget(adapter, {});
    assert.deepEqual(target.capabilities().steps, ['insn', 'over', 'out'],
        'the 6502 step granularities changed — re-measure Wave 7');
    assert.deepEqual(target.capabilities().breakpoints, ['code', 'write']);
    const regs = target.regs();
    for (const key of ['pc', 'a', 'x', 'y', 'sp', 'p', 'cycles']) {
        assert.ok(key in regs, `the 6502 register report lost ${key}`);
    }
    assert.equal(regs.pc, 0x8000, 'the preset boots at its ROM base');
    assert.equal(target.disasm(0x8000).text, 'LDA #$FF');
    // And the faces that render them.
    const face = readFileSync(path.join(CUI, 'components/ArchitectureFace.jsx'), 'utf8');
    assert.match(face, /regs\.cycles != null \? `\$\{regs\.cycles\} cyc`/,
        'ArchitectureFace no longer shows the cycle count — re-measure Wave 7');
    assert.match(face, /debugState\.disasm\(r\.pc\)/);
    const drawer = readFileSync(path.join(GUI, 'components/tw-pseudocode/debug-drawer.jsx'), 'utf8');
    assert.match(drawer, /renderMemory/, 'the debug drawer lost its memory view');
    assert.match(drawer, /runner\.readMem\(spec\.id, start, perPage\)/);
});

test('OPEN DEFECT: there is no cycle-level step, and the scope cannot resolve a bus at CPU speed', async () => {
    assert.equal(lesson('machines-buses').exampleId, 'eater6502-bench');
    // "Single-step the clock": the finest CPU step is one INSTRUCTION, and the
    // circuit-side step button advances 50 ms — 50 000 cycles at 1 MHz.
    const m = extract6502Machine(circuitOf('eater6502-bench'));
    const adapter = createM6502Adapter({config: {regions: m.regions, chips: m.chips}});
    adapter.attachBoard({advanceTo () {}, setPin () {}});
    const target = createM6502DebugTarget(adapter, {});
    assert.ok(!target.capabilities().steps.includes('cycle'),
        'a cycle step exists now — restore it to machines-buses and delete this test');
    const designer = readFileSync(path.join(CUI, 'components/CircuitDesigner.jsx'), 'utf8');
    assert.match(designer, /Advance one 50 ms tick/,
        "the circuit-side step button's granularity changed — re-measure Wave 7");
    // And the scope: 10 us per sample against a 1 us bus cycle.
    const {board} = await load('eater6502-bench');
    const netId = board.nets[0].id;
    const handle = board.addScopeChannel({type: 'voltage', netId});
    board.advanceTo(10n * MS);
    assert.equal(Number(board.getScopeData(handle).sampleIntervalNs), 10_000,
        'the scope cadence changed — re-measure Wave 7');
    const cpuClockHz = 1_000_000;   // CLOCK 1000000 in the eater6502 programs
    assert.ok((1e9 / 10_000) < cpuClockHz,
        'the scope now samples faster than the CPU clock — restore the pin-edge route to ' +
        'machines-buses and machines-interrupts-performance and delete this test');
});

test('machines-interrupts-performance: the Z80 bench extracts, and its only bundled program is a shell', () => {
    assert.equal(lesson('machines-interrupts-performance').exampleId, 'z80-bench');
    const r = extractZ80Machine(circuitOf('z80-bench'));
    assert.ok(r.ok, `z80-bench: ${(r.reasons || []).join('; ')}`);
    const rom = r.regions.find(x => x.kind === 'rom');
    const ram = r.regions.find(x => x.kind === 'ram');
    assert.deepEqual([rom.start, rom.end], [0x0000, 0x7fff], 'z80-bench ROM range');
    assert.deepEqual([ram.start, ram.end], [0x8000, 0xffff], 'z80-bench RAM range');
    const runner = readFileSync(path.join(GUI, 'lib/bw-debug/debug-runner.js'), 'utf8');
    assert.match(runner, /loading BBC BASIC/,
        'the Z80 fallback changed — re-measure Wave 7');
    assert.match(runner, /booting extracted Z80 machine/);
});

// ── The lesson copy this review wrote, in both languages ───────────────────

test('the Wave 7 revisions are present, EN and DE, at the content version this review recorded', () => {
    assert.deepEqual(Object.fromEntries(WAVE.lessons.map(l => [l.id, l.version])), {
        'machines-logic-levels': 3,
        // 2 -> 3: the shift-register defect this wave documented was repaired
        // upstream, so the version-2 wording ("record that the data line never
        // changes level at all") became false and the version-1 checkpoint was
        // restored. The OPEN DEFECT sentinel that guarded it is gone, as it asked.
        'machines-gates-registers': 3,
        'machines-clocks': 2,
        'machines-buses': 2,
        'machines-memory-maps': 1,
        'machines-address-decode': 1,
        'machines-6502-execution': 2,
        'machines-source-asm': 2,
        'machines-contention': 2,
        'machines-interrupts-performance': 2
    }, 'a Wave 7 lesson changed content version — update docs/LESSON-REVIEW-WAVE-7.md with it');

    const says = (id, cp, field, en, de) => {
        const copy = checkpoint(id, cp).copy;
        assert.match(copy.en[field], en, `${id}/${cp}: the English ${field} lost its Wave 7 revision`);
        assert.match(copy.de[field], de, `${id}/${cp}: the German ${field} lost its Wave 7 revision`);
    };
    says('machines-logic-levels', 'measure', 'hint', /push-pull|quasi/i, /Push-Pull|quasi/i);
    // machines-gates-registers is deliberately NOT asserted here any more: its
    // Wave 7 revision was a workaround for a defect that no longer exists, and
    // the restored copy is the ORIGINAL version-1 text. What guards it now is the
    // version pin above plus the corpus gates on the repaired example itself.
    says('machines-clocks', 'measure', 'action', /no downstream|nothing downstream/i, /nichts.*nachgelagert|kein.*nachgelagert/i);
    says('machines-buses', 'trace', 'action', /instruction|per-cycle|cycle-level/i, /Befehl|Zyklus/i);
    says('machines-6502-execution', 'step', 'action', /load a program|preset/i, /Programm laden|Preset/i);
    says('machines-source-asm', 'trace', 'hint', /preset|hosted/i, /Preset|gehostet/i);
    says('machines-contention', 'repair', 'hint', /Build Machine/, /Build Machine/);
    says('machines-interrupts-performance', 'measure', 'action', /BBC BASIC|preset/i, /BBC BASIC|Preset/i);
});
