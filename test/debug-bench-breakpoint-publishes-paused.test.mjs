// A machine-bench breakpoint hit must publish "paused" by itself.
// wireMachineBench used to hand createDebugSession onHalt/onRun callbacks the
// session never calls (it reports through onChange only). The target halted at
// the breakpoint and the pump stopped, but no snapshot followed, so the panel
// said "running" until an unrelated click re-rendered it. Found by the 386
// forward-debug probe (row 0x7C13 clicked, Run, never paused). The Z80 bench
// shares the wiring, so it is the fixture here; pause/resume stay covered.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createDebugRunner} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

function browserShims () {
    const events = new EventTarget();
    const saved = {window: globalThis.window, document: globalThis.document,
        raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame};
    globalThis.window = Object.assign(Object.create(globalThis), {
        addEventListener: events.addEventListener.bind(events),
        removeEventListener: events.removeEventListener.bind(events),
        dispatchEvent: events.dispatchEvent.bind(events)
    });
    globalThis.document ??= {baseURI: 'http://localhost/'};
    globalThis.requestAnimationFrame = fn => setTimeout(() => fn(Date.now()), 16);
    globalThis.cancelAnimationFrame = clearTimeout;
    return () => {
        globalThis.window = saved.window;
        globalThis.requestAnimationFrame = saved.raf;
        globalThis.cancelAnimationFrame = saved.caf;
        if (saved.document === undefined) delete globalThis.document;
    };
}
const until = async (fn, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 10)); }
    return false;
};

async function breakpointPublishes (createDebugRunner) {
    const restore = browserShims();
    const seen = [];
    const vm = {runtime: {stc: {device: 'z80', pins: []}, targets: [], on () {}, off () {}, emit () {}}};
    // 0000: nop ; 0001: jp 0000  -- a tight loop the breakpoint at 0001 must catch.
    const runner = createDebugRunner({vm, targetKind: 'z80',
        bootMedia: {slot: 'rom', bytes: Uint8Array.of(0x00, 0xc3, 0x00, 0x00), name: 'loop'},
        onChange: ui => seen.push(ui.phase)});
    try {
        await runner.start();
        assert.ok(await until(() => runner.state().phase === 'running'), 'bench runs: ' + seen.join(',') + ' ' + runner.state().message);
        runner.pause();
        assert.ok(await until(() => seen.at(-1) === 'paused'), 'explicit pause still publishes paused');
        assert.equal(runner.toggleAddressBreakpoint(1), true);
        runner.resume();
        assert.ok(await until(() => seen.at(-1) === 'running'), 'resume publishes running');
        const mark = seen.length;
        // No further UI action: only the breakpoint hit may produce "paused".
        assert.ok(await until(() => seen.slice(mark).includes('paused')),
            `breakpoint hit published paused by itself: ${seen.slice(mark).join(',')}`);
        assert.equal(globalThis.window.__benchTarget?.state?.() ?? 'halted', 'halted');
    } finally {
        runner.destroy();
        restore();
    }
}

test('a bench breakpoint hit publishes paused with no other UI action, and resume publishes running',
    () => breakpointPublishes(createDebugRunner));

test('mutation check: restoring the ignored onHalt/onRun wiring makes the hit invisible again', async () => {
    const url = new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url);
    const src = readFileSync(url, 'utf8');
    const start = src.indexOf('            onChange: (st) => {\n                if (st.halted && !benchHalted) {');
    const end = src.indexOf('                } else emit();\n            },\n', start);
    assert.ok(start > 0 && end > start, 'fix anchor');
    const mutant = src.slice(0, start) +
        "            onHalt: () => setStatus('paused'),\n            onRun: () => setStatus('running'),\n" +
        src.slice(end + '                } else emit();\n            },\n'.length);
    const file = fileURLToPath(url).replace(/debug-runner\.js$/, `debug-runner.mutant-${process.pid}.js`);
    writeFileSync(file, mutant);
    try {
        const mod = await import(pathToFileURL(file).href);
        await assert.rejects(breakpointPublishes(mod.createDebugRunner), /breakpoint hit published paused by itself/);
    } finally {
        rmSync(file, {force: true});
    }
});

test('mutation check: the fix is the onChange publication, not a stray re-render', () => {
    const src = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js', import.meta.url), 'utf8');
    const start = src.indexOf('function wireMachineBench(');
    const body = src.slice(start, src.indexOf('\n    }\n', start));
    assert.match(body, /createDebugSession\(target, \{[\s\S]*?onChange: \(st\) =>/);
    assert.doesNotMatch(body, /\bonHalt:|\bonRun:/, 'createDebugSession has no onHalt/onRun options');
});
