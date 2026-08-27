/**
 * Buttons for things the attached engine cannot do.
 *
 * THE DEFECT THIS GATES
 * ---------------------
 * The debug drawer's "Step Over" and "Step Out" gate on the target's declared
 * capabilities and grey out when unavailable. "Set PC" and "Wipe" sat right
 * beside them and gated on nothing — but ONLY the 8051 target implements
 * setPc/wipe. Every Cortex engine (labwired, rp2040js, stm32f0) and the AVRs
 * do not, so on any of them those two buttons called a method that was not
 * there and threw a TypeError. A dead button is bad; a button that throws is
 * worse, because the failure surfaces far from the press.
 *
 * Contract-level, in the idiom of lesson-debugger-surface.test.mjs: it reads
 * what the code does rather than driving a live session, which needs a WASM
 * build and compiled firmware.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const DRAWER = read('overlay/scratch-gui/src/components/tw-pseudocode/debug-drawer.jsx');
const RUNNER = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');

test('only the 8051 target actually implements setPc and wipe', () => {
    // The premise the rest of this file rests on. If a Cortex target grows a
    // real setPc one day, this fails and the gating below can be relaxed —
    // which is the point of asserting the premise rather than assuming it.
    const cortex = ['labwired-debug', 'rp2040js-debug', 'avr8js-debug']
        .map(n => [n, read(`overlay/scratch-gui/src/lib/bw-board/${n}.js`)]);
    for (const [name, src] of cortex) {
        assert.doesNotMatch(src, /^\s*setPc\s*[(:]/m, `${name} now has setPc — re-read this test`);
        assert.doesNotMatch(src, /^\s*wipe\s*[(:]/m, `${name} now has wipe — re-read this test`);
    }
    assert.match(read('overlay/scratch-gui/src/lib/bw-board/emu8051-debug.js'), /setPc/,
        'the 8051 target is the one that does implement it');
});

test('the drawer disables Set PC and Wipe when the engine lacks them', () => {
    assert.match(DRAWER, /const has = name =>/,
        'no support probe — the buttons are ungated again');
    for (const name of ['setPc', 'wipe']) {
        assert.match(DRAWER, new RegExp(`disabled=\\{!has\\('${name}'\\)\\}`),
            `the ${name} button is not disabled when unsupported`);
    }
    // Greyed out with no explanation is its own bug: the user cannot tell a
    // broken build from an engine that simply does not offer it.
    assert.match(DRAWER, /noSetPc: '[^']+'/, 'no English reason for a disabled Set PC');
    assert.match(DRAWER, /noWipe: '[^']+'/, 'no English reason for a disabled Wipe');
    assert.match(DRAWER, /noSetPc: 'Diese Engine/, 'the reason is not translated');
});

test('the runner refuses rather than throwing, even if the UI slips', () => {
    // Defence in depth: the drawer is not the only caller, and a refusal that
    // reads like the existing "nothing is loaded" one keeps the shape callers
    // already handle.
    assert.match(RUNNER, /supports\(name\)\s*\{\s*return !!\(target && typeof target\[name\] === 'function'\);/,
        'runner.supports is gone — the drawer probe has nothing to ask');
    assert.match(RUNNER, /typeof target\.setPc !== 'function'[\s\S]{0,120}refused/,
        'setPc still calls straight through and can throw');
    assert.match(RUNNER, /typeof target\.wipe !== 'function'[\s\S]{0,80}refused/,
        'wipe still calls straight through and can throw');
});
