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



test('OPEN DEFECT: nothing in the debugger displays a call stack', () => {
    // debug-call-stack's `inspect` checkpoint says "Halt inside the procedure,
    // inspect frames and locals, step out". `stepOut` exists as a control; a
    // frames or locals view does not exist anywhere in the debug UI.
    assert.match(PANEL, /stepOut/, 'the step-out control is still there');
    for (const rel of [
        'overlay/scratch-gui/src/lib/bw-circuit-ui/components/DebugStatus.jsx',
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'
    ]) {
        const source = read(rel);
        const rendersFrames = /\{\s*\w*[Ff]rames?\b|callStack|\blocals\b/.test(source);
        assert.ok(!rendersFrames,
            `${rel} now shows frames or locals — re-measure debug-call-stack, ` +
            `update docs/LESSON-REVIEW-WAVE-5.md and its hint, then delete this test.`);
    }
});

test('watchpoints are feature-detected, and the panel gates its UI on them', () => {
    // debug-watches leans on a "watch set". Write watchpoints are offered only
    // when the emu8051 WASM exports _emu_dbg_set_bp_write, which the module's
    // own docs say the build pinned in lite does NOT. Not executed here — the
    // WASM is env-gated — so this pins the mechanism, not the build.
    const emu = TARGETS.find(([n]) => n === 'emu8051-debug')[1];
    assert.match(emu, /_emu_dbg_set_bp_write/, 'watchpoints are still feature-detected');
    assert.match(emu, /breakpoints: hasWatchpoints/);
    assert.match(PANEL, /breakpoints.*includes\('write'\)|canWatch/s,
        'the panel still gates the watchpoint field on the write capability');
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

test('OPEN DEFECT: the debugger needs a hosted compiler, on every device family', () => {
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
    // and it is not gated on device: the map translates board names to chip
    // names for the SAME request rather than choosing a local path for any.
    for (const chip of ['atmega328p', 'rp2040', 'eater6502']) {
        assert.ok(runner.includes(`'${chip}'`), `${chip} no longer routes through COMPILE_TARGET`);
    }

    // The escape hatch is real but undiscoverable from a lesson: an in-bundle
    // SDCC WASM that INTERCEPTS the same fetch, behind a localStorage flag.
    assert.match(runner, /localStorage\.getItem\('bw-use-wasm-compiler'\) === '1'/,
        'the local-compiler opt-in changed — if it became the default, all ten ' +
        'Wave 5 lessons stop needing the network and this test should go');
    assert.ok(existsSync(path.join(ROOT, 'overlay/scratch-gui/src/lib/sdcc-wasm/intercept.js')),
        'the local WASM compiler chunk is gone, so the opt-in leads nowhere');
});
