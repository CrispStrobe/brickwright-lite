/**
 * Wave 5 — "Debug with evidence" — rests on the debugger, not on the solver.
 *
 * Every other wave asks whether a CIRCUIT can produce an observation, and
 * `scripts/lesson-bench.mjs` answers by solving it. Wave 5's checkpoints ask
 * whether the DEBUGGER can show something: a call stack, a task's deadline, a
 * watch, a conditional halt. So this file checks the debugger's surface the
 * same way — against what the code actually produces and renders, not against
 * what the feature is called.
 *
 * WHAT THIS CANNOT DO, stated plainly: it does not drive a live debug session.
 * emu8051 needs its WASM build and a compiled firmware, both env-gated, so the
 * findings here are contract-level — the producer emits X, the consumer reads Y
 * — rather than "I watched the panel". Where that distinction changes what can
 * be claimed, the test says so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const TARGETS = ['emu8051-debug', 'avr8js-debug', 'rp2040js-debug']
    .map(n => [n, read(`overlay/scratch-gui/src/lib/bw-board/${n}.js`)]);
const PANEL = read('overlay/scratch-gui/src/lib/bw-circuit-ui/components/DebugStatus.jsx');

test('conditional breakpoints accept the syntax debug-conditional-breakpoints teaches', async () => {
    const {parseCondition} = await import(
        path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/condition.js'));
    // The lesson's hint says "the app's simple comparison syntax, such as counter = 5".
    const ok = parseCondition('counter = 5');
    assert.deepEqual(ok.names, ['counter']);
    assert.equal(ok.test({counter: 5}), true);
    assert.equal(ok.test({counter: 4}), false);

    // Its `halt` checkpoint asks the learner to "deliberately test a misspelled
    // variable". That must PARSE (it is a legal name) and then never fire —
    // which is the experience the lesson wants them to diagnose.
    const typo = parseCondition('countr = 5');
    assert.deepEqual(typo.names, ['countr']);
    assert.equal(typo.test({counter: 5}), false, 'a misspelling must silently never match');

    // And an unparseable expression is refused WITH A REASON rather than
    // defaulting to always-true or always-false. It returns {error} rather than
    // throwing — checked, because I first asserted a throw and the gate caught me.
    const refused = parseCondition('counter * 2 > 5');
    assert.match(refused.error, /neither a number nor a variable/);
    assert.equal(refused.test, undefined, 'a refused condition must expose no evaluator');
});



// Was an OPEN DEFECT: "nothing in the debugger displays a call stack". It
// fired on its own terms on 2026-08-29 and was retired per its own
// instruction — debug-call-stack re-measured, LESSON-REVIEW-WAVE-5.md updated,
// the hint rewritten (v3, EN and DE).
//
// What replaced it is deliberately NOT "a frames pane exists". The defect was
// half right in a way that matters: on the C target there IS no call stack,
// because the program is a cooperative scheduler and not a stack machine. A
// pane that filled the gap with a plausible list would have been worse than
// the gap. So what is pinned here is the REFUSAL — that the pane says a call
// stack does not exist on this target, in words, rather than rendering one.
test('the frames view exists, and refuses to invent a call stack the C target does not have', async () => {
    assert.match(PANEL, /stepOut/, 'the step-out control is still there');

    const panel = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx');
    assert.match(panel, /DebugFrames/, 'the debug panel mounts the frames pane');

    const {deriveFrames} = await import(
        path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/frames.js'));

    // A C-target session: two cooperative tasks, no stack machine anywhere.
    const runner = {
        symbols: () => ({scheduler: {tasks: [{name: 'task0', state: {addr: 0x0A}}]}}),
        state: () => ({session: {tasks: [{task: 'task0', state: 1, until: 250}]}}),
        variables: () => [{name: 'counter', value: 3, where: 'iram 0x30'}]
    };
    const view = deriveFrames(runner);
    assert.equal(view.kind, 'scheduler');
    // null, not []. An empty array reads as "no frames right now", which would
    // claim frames exist and happen to be absent.
    assert.equal(view.callStack, null,
        'the pane must not present a call stack for a cooperative scheduler');
    assert.match(view.why, /cooperative scheduler, not a stack machine/,
        'and it must SAY why, in the words the lesson hint now uses');
    assert.match(view.why, /Step Out/,
        'naming what to do instead — which is exactly debug-call-stack v3');
    // The position that DOES exist is shown, with the address that makes it
    // checkable. That address lives only in the symbol table.
    assert.equal(view.frames[0].task, 'task0');
    assert.equal(view.frames[0].stateAddr, 0x0A);
});

test('watchpoints are feature-detected, and the panel gates its UI on them', () => {
    // CORRECTED 2026-08-29, and the correction is the point. This test used to
    // carry the sentence "which the module's own docs say the build pinned in
    // lite does NOT" — taken from a comment in emu8051-debug.js rather than
    // from the binary. Instantiated, the pinned build exported
    // _emu_dbg_set_bp_write all along. D29's row, this note and the
    // debug-watches hint were all written around a claim nobody had checked.
    //
    // The mechanism is still worth pinning; the BUILD claim is now made where
    // it can be measured, in test/debug-watchpoint-cycle.test.mjs, which loads
    // the vendored artifact and asks it.
    const emu = TARGETS.find(([n]) => n === 'emu8051-debug')[1];
    assert.match(emu, /_emu_dbg_set_bp_write/, 'watchpoints are still feature-detected');
    assert.match(emu, /breakpoints: hasWatchpoints/);
    assert.match(PANEL, /breakpoints.*includes\('write'\)|canWatch/s,
        'the panel still gates the watchpoint field on the write capability');

    // And the consumer half, which was the real defect: DebugStatus renders
    // the field only when handed `onAddWatchpoint`, and lite's debugState
    // never set it — so the field could not appear whatever the emulator
    // supported. Producer-must-assert-consumer, from the consumer's side.
    const tab = read('overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx');
    assert.match(tab, /addWatchpoint:/,
        'lite must actually supply addWatchpoint, or the vendored field stays invisible');
});

test('every Wave 5 bench ships the parts and program its lesson needs', async () => {
    const EX = path.join(ROOT, 'overlay/scratch-gui/examples');
    const raw = JSON.parse(read('overlay/scratch-gui/examples/index.json'));
    const index = new Map((Array.isArray(raw) ? raw : raw.examples).map(e => [e.id, e]));
    const wave = JSON.parse(read(
        'overlay/scratch-gui/src/components/gui/lesson-waves/debugging-5.json')).lessons;
    assert.equal(wave.length, 10);
    for (const lesson of wave) {
        const entry = index.get(lesson.exampleId);
        assert.ok(entry, `${lesson.id} names ${lesson.exampleId}, absent from the index`);
        for (const key of ['circuit', 'program']) {
            const rel = entry.files?.[key];
            assert.ok(rel, `${lesson.exampleId} declares no ${key}`);
            assert.ok(readFileSync(path.join(EX, rel), 'utf8').length > 0);
        }
    }
    // The three lessons whose checkpoints turn on a press need a button on the bench.
    for (const [exampleId, lessonId] of [['26-debounce', 'debug-reproduce-minimize'],
        ['05-counter', 'debug-watches'], ['avr05-button-led', 'debug-pins-signals']]) {
        const circuit = JSON.parse(readFileSync(
            path.join(EX, index.get(exampleId).files.circuit), 'utf8'));
        assert.ok(circuit.parts.some(p => p.kind === 'button'),
            `${lessonId} asks for a press but ${exampleId} has no button`);
    }
});

test('the debugger compiles supported 8051 targets locally and names hosted families', () => {
    // Missed on the first Wave 5 pass, because I checked what the debugger can
    // SHOW and not whether it can START. `debug-runner.js` lists "build the
    // image over the network" among the four things only a browser can do, and
    // the fetch is unconditional: every device Wave 5 uses — stc12c5a60s2,
    // atmega328p (Uno/Nano), rp2040 (Pico) — routes through the same
    // POST /compile. A browser cannot run SDCC, and the symbol table the
    // debugger joins its yield map against comes from the linker, so this is
    // not incidental.
    const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
    assert.match(runner, /compilerUrl = 'https:\/\/stc-compiler\.vercel\.app'/,
        'the default compiler URL moved — re-check whether the debugger still ' +
        'needs the network, then update docs/LESSON-REVIEW-WAVE-5.md');
    assert.match(runner, /await fetch\(`\$\{compilerUrl\}\/compile`/);
    // Non-8051 families retain the hosted service explicitly.
    for (const chip of ['atmega328p', 'rp2040', 'eater6502']) {
        assert.ok(runner.includes(`'${chip}'`), `${chip} no longer routes through COMPILE_TARGET`);
    }

    // The five mcs51 variants are routed through the lazy local compiler by
    // default. A supported-target chunk failure must abort before hosted fetch.
    for (const chip of ['stc12c5a60s2', 'stc12c5a16s2', 'stc15f2k60s2', 'stc15w408as', 'stc89c52rc']) {
        assert.ok(runner.includes(`'${chip}'`), `${chip} is absent from LOCAL_8051_TARGETS`);
    }
    assert.match(runner, /if \(LOCAL_8051_TARGETS\.has\(compileTarget\)\) await installWasmCompilerRouting/);
    assert.doesNotMatch(runner, /bw-use-wasm-compiler/,
        'the repaired local compiler must not regress behind an undiscoverable flag');
    assert.ok(existsSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/sdcc-wasm/intercept.js')),
        'the local WASM compiler chunk is gone, so the opt-in leads nowhere');
});
