/**
 * The toolchain manager is the first user-visible surface for a decision that
 * until now lived in a URL parameter and a localStorage key. These assert the
 * things that make it a manager rather than a toggle, and the one thing that
 * makes it lawful: the licence is disclosed where the download is decided.
 *
 * Source-level, because the panel is built imperatively (the same shape as
 * capability-diagnostics.js) and the behaviour that needs a browser — a real
 * download, cancelled and resumed — is asserted in test/toolchain-download.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(p, 'utf8');
const MANAGER = 'overlay/scratch-gui/src/lib/toolchain-manager.js';
const MENU = 'overlay/scratch-gui/src/components/menu-bar/settings-menu.jsx';
const BOOT = 'overlay/scratch-gui/src/playground/render-gui.jsx';

test('the manager is reachable from the Settings menu, not only from a URL', () => {
    const menu = read(MENU);
    assert.match(menu, /emit\('bw-open-toolchain-manager'\)/,
        'no Settings entry opens the manager — the switch would still be console-only');
    const boot = read(BOOT);
    assert.match(boot, /initToolchainManager/,
        'the listener is never registered, so the menu item would do nothing');
    assert.match(read(MANAGER), /addEventListener\('bw-open-toolchain-manager'/);
});

test('it offers both routes and says what each COSTS, not just its name', () => {
    const src = read(MANAGER);
    assert.match(src, /bw-toolchain-mode-online/);
    assert.match(src, /bw-toolchain-mode-local/);
    // A label that only names a mode leaves the user to guess the consequence.
    assert.match(src, /sent to the compiler service/i, 'the online row must say where the program goes');
    assert.match(src, /offline/i, 'the local row must say what it buys');
    assert.match(src, /1\.7 MB/, 'and what it costs to download');
});

test('THE LICENCE IS DISCLOSED WHERE THE DOWNLOAD IS DECIDED', () => {
    const src = read(MANAGER);
    assert.match(src, /GPL-2\.0-or-later/, 'the licence must be named, not implied');
    assert.match(src, /SDCC \(Small Device C Compiler\) 4\.5\.0/, 'and the software and version named');
    assert.match(src, /not the licence of this application/i,
        'the point is the DIFFERENCE from this app, which is why it downloads separately');
    assert.match(src, /github\.com\/CrispStrobe\/sdcc-wasm/,
        'the written offer of source must be reachable from here');
    assert.match(src, /bw-toolchain-licence/, 'and findable by a gate');
});

test('it is a manager: progress, stop, resume, remove', () => {
    const src = read(MANAGER);
    for (const [what, re] of [
        ['a download control', /bw-toolchain-download/],
        ['a stop control', /bw-toolchain-stop/],
        ['a remove control', /bw-toolchain-remove/],
        ['real progress', /onProgress/],
        ['an abort signal', /AbortController|signal: controller\.signal/],
        ['resume after stopping', /continues from here/i]
    ]) assert.match(src, re, `the manager has no ${what}`);
    // Weighted, because two of nine files are 62% of the wire.
    assert.match(src, /bytesDone/, 'progress must be by bytes, or the bar stalls on the big file');
});

test('the two settings cannot disagree after an action', () => {
    const src = read(MANAGER);
    // Downloading it is a request to use it; removing it means it cannot be used.
    assert.match(src, /setToolchainMode\('local'\)/,
        'a completed download must select the local route, or the download was pointless');
    assert.match(src, /setToolchainMode\('online'\)/,
        'removing it must leave the online route, or every build fails with the toolchain absent');
});

test('closing the window does not cancel a download', () => {
    const src = read(MANAGER);
    const close = src.slice(src.indexOf('export const closePanel'), src.indexOf('export const openPanel'));
    assert.equal(/abort\(\)/.test(close), false,
        'closing a dialog is not a decision about the download; a half-finished one resumes anyway');
});
