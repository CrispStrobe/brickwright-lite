// An assembled ROM delivered twice must boot once (the intermittent
// verify-debug-run-to-inspection timeout). circuit-tab re-dispatches the
// stashed bw-asm-rom-ready detail a frame after the first delivery; the panel
// wrapped every delivery in a fresh media detail, so the media-load identity
// guard never matched and each Run booted two runners, the first torn down
// mid-attach. The failing CI screenshots all read "not running  assembled image
// on the Searle map — no designer board": the first runner's pre-start `ready`
// snapshot, published after the second runner's `running`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDebugRunner} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';

const panel = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx', import.meta.url), 'utf8');
const circuit = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx', import.meta.url), 'utf8');

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
    globalThis.requestAnimationFrame ??= fn => setTimeout(() => fn(Date.now()), 16);
    globalThis.cancelAnimationFrame ??= clearTimeout;
    return () => {
        globalThis.window = saved.window;
        globalThis.requestAnimationFrame = saved.raf;
        globalThis.cancelAnimationFrame = saved.caf;
        if (saved.document === undefined) delete globalThis.document;
    };
}

test('the screenshot state is the gate ROM runner\'s own pre-start ready snapshot', async () => {
    const restore = browserShims();
    const seen = [];
    const vm = {runtime: {stc: {device: 'z80', pins: []}, targets: [], on () {}, off () {}, emit () {}}};
    // The gate's ROM, through the same detail the panel builds for it.
    const runner = createDebugRunner({vm, targetKind: 'z80',
        bootMedia: {slot: 'rom', bytes: Uint8Array.of(0x3e, 0, 0x32, 0, 0x80, 0x3c, 0xc3, 2, 0), name: 'assembled image'},
        onChange: ui => seen.push(`${ui.phase}|${ui.message}`)});
    try {
        await runner.start();
        const ready = seen.indexOf('idle|assembled image on the Searle map — no designer board');
        assert.ok(ready >= 0, seen.join('\n'));
        assert.ok(seen.indexOf('running|', ready) > ready, 'the same runner goes on to run');
        assert.equal(runner.state().phase, 'running');
    } finally {
        runner.destroy();
        restore();
    }
});

test('a repeated ASM delivery is dropped while the runner it booted lives', () => {
    const start = panel.indexOf('    _onAsmRomReady (e) {');
    assert.ok(start > 0);
    const body = panel.slice(start, panel.indexOf('\n    }\n', start));
    const guard = body.search(/if \(e\.detail && e\.detail === this\._lastAsmDetail &&\s+\(this\._runnerPromise \|\| this\.state\.runner\)\) return false;/);
    assert.ok(guard > 0, 'identity guard present');
    assert.ok(guard < body.indexOf('this._onMediaLoad('), 'guard precedes every boot route');
    assert.ok(guard < body.indexOf('this._runSketch('), 'guard precedes the sketch route');
    // The re-dispatch hands back the very same stashed object, so identity matches.
    assert.match(circuit, /window\.__bwPendingMedia = \{type: 'asm', detail: e && e\.detail\};/);
    assert.equal((circuit.match(/pending\.type === 'asm' \? 'bw-asm-rom-ready' : 'bw-machine-media-load',\s+\{detail: pending\.detail\}/g) || []).length, 2);
    // The mount replay passes the stashed detail itself too.
    assert.match(panel, /this\._onAsmRomReady\(\{detail: pending\.detail\}\)/);
});
