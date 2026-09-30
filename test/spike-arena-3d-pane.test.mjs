// SPDX-License-Identifier: BSD-3-Clause
/**
 * The arena pane's 2D/3D toggle (task D3), rendered for real with
 * react-test-renderer: the pane component as shipped and its real lib modules.
 *
 *   1. Without WebGL (Node has no canvas at all) the toggle loads the real 3D
 *      module, which refuses, and the pane stays in 2D with the WebGL message,
 *      in English and in German; toggling again tries again.
 *   2. With a 3D view (the real scene builder behind a stand-in for the WebGL
 *      renderer, which Node cannot create), every frame's snapshot goes to the
 *      3D view instead of the canvas, the camera modes reach it, a new mission
 *      rebuilds it, and toggling back disposes it.
 *   3. The one-clock contract at the pane: the same mission run with the 3D
 *      view open and with the 2D canvas ends with the identical verdict and
 *      finishing time. (test/spike-arena-3d.test.mjs holds the same for a real
 *      program in the real VM.)
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const guiRequire = createRequire(join(root, 'packages/scratch-gui/package.json'));
const React = guiRequire('react');
const {create, act} = guiRequire('react-test-renderer');
const babel = guiRequire('@babel/core');
const STATIC_ROOT = join(root, 'overlay/scratch-gui');
const {buildArenaScene} = await import('../overlay/scratch-gui/src/lib/spike-arena/arena-scene3d.js');
const {ARENA_L10N} = await import('../overlay/scratch-gui/src/lib/spike-arena/l10n.js');

async function loadPane () {
    const sourceUrl = new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url);
    // Beside the source, so its relative imports (and its dynamic import of the 3D view) resolve to the real modules.
    const tempUrl = new URL(`./spike-arena-pane-3d-test-${randomUUID()}.mjs`, sourceUrl);
    const reactUrl = pathToFileURL(guiRequire.resolve('react')).href;
    const source = (await readFile(sourceUrl, 'utf8')).replace("from 'react'", `from '${reactUrl}'`);
    const transformed = babel.transformSync(source, {
        filename: 'spike-arena-pane.jsx', babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-react'), {runtime: 'classic'}]]
    }).code;
    await writeFile(tempUrl, transformed);
    try { return (await import(tempUrl.href)).default; } finally { await unlink(tempUrl); }
}

function installBrowser () {
    const saved = {window: globalThis.window, fetch: globalThis.fetch, CustomEvent: globalThis.CustomEvent,
        requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame};
    const listeners = new Map();
    const frames = [];
    const win = {
        devicePixelRatio: 1,
        addEventListener (type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        removeEventListener (type, fn) { listeners.get(type)?.delete(fn); },
        dispatchEvent (event) { for (const fn of listeners.get(event.type) || []) fn(event); return true; }
    };
    globalThis.window = win;
    globalThis.CustomEvent = class { constructor (type, init = {}) { this.type = type; this.detail = init.detail; } };
    globalThis.requestAnimationFrame = fn => { frames.push(fn); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    globalThis.fetch = async url => {
        try {
            const text = await readFile(join(STATIC_ROOT, url), 'utf8');
            return {ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text};
        } catch {
            return {ok: false, status: 404};
        }
    };
    let now = 1000;
    return {
        win,
        async frames (n) {
            for (let i = 0; i < n; i++) {
                const due = frames.splice(0);
                now += 1000 / 30;
                await act(async () => { for (const fn of due) fn(now); });
            }
        },
        restore () { Object.assign(globalThis, saved); for (const [k, v] of Object.entries(saved)) if (v === undefined) delete globalThis[k]; }
    };
}

// Refs: a box with a width for the 3D view's container; no 2D canvas (Node has no 2D context).
const createNodeMock = element => (element.type === 'canvas' ? null : {clientWidth: 400});
const byTestId = (renderer, id) => renderer.root.findAll(node => node.props['data-testid'] === id && typeof node.type === 'string');
const one = (renderer, id) => {
    const found = byTestId(renderer, id);
    assert.equal(found.length, 1, `exactly one ${id}`);
    return found[0];
};
// Bounded by wall time, not turns: the first toggle parses three.js, which takes
// a moment on a loaded runner.
const settle = async (predicate, what, ms = 30000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.fail(`never within ${ms} ms: ${what}`);
};

/** A 3D view module for Node: the real scene builder, a recorder where the WebGL renderer would be. */
const recordingViewModule = log => ({
    createArenaView3D ({world, robot, mode}) {
        const built = buildArenaScene(world, robot);
        const view = {
            world: world.id, modes: [mode], renders: 0, disposed: false, built,
            canvas: {setAttribute (name, value) { view[name] = value; }},
            render (snapshot) { view.renders++; built.update(snapshot); view.last = snapshot; },
            setMode (next) { view.modes.push(next); },
            dispose () { view.disposed = true; built.dispose(); }
        };
        log.push(view);
        return view;
    }
});

/** Runs the open mission from Start to its verdict on the pane's own frame loop. */
const runMission = async (browser, renderer) => {
    await act(async () => { await one(renderer, 'bw-spike-arena-start').props.onClick(); });
    const limit = browser.win.__bwSpikeArena._pane.world.timeLimitMs;
    await browser.frames(Math.ceil(limit / (1000 / 30)) + 30);
    const banner = one(renderer, 'bw-spike-arena-banner');
    return {verdict: banner.props['data-verdict'], reason: banner.props['data-reason'], ...browser.win.__bwSpikeArena.verdict};
};

for (const locale of ['en', 'de']) {
    test(`without WebGL the 3D toggle falls back to 2D and says why (${locale})`, async () => {
        const browser = installBrowser();
        let renderer;
        try {
            const Pane = await loadPane();
            await act(async () => { renderer = create(React.createElement(Pane, {locale}), {createNodeMock}); });
            await settle(() => browser.win.__bwSpikeArena?.status === 'ready', 'the pane loaded');
            const toggle = () => one(renderer, 'bw-spike-arena-view-toggle');
            assert.equal(toggle().props.children, ARENA_L10N[locale].view3d);
            assert.equal(toggle().props['aria-pressed'], false);
            assert.equal(one(renderer, 'bw-spike-arena-3d').props['data-state'], 'off');

            await act(async () => { toggle().props.onClick(); });
            await settle(() => browser.win.__bwSpikeArena.view3d === 'fallback', 'the real 3D module refused');
            assert.equal(browser.win.__bwSpikeArena.view, '2d');
            assert.equal(one(renderer, 'bw-spike-arena-3d').props['data-state'], 'fallback');
            assert.equal(one(renderer, 'bw-spike-arena-3d-message').props.children, ARENA_L10N[locale].webglUnavailable);
            assert.equal(one(renderer, 'bw-spike-arena-canvas').props.hidden, false, 'the 2D canvas stays');
            assert.equal(byTestId(renderer, 'bw-spike-arena-camera').length, 0, 'no camera choice without a 3D view');
            assert.equal(toggle().props.children, ARENA_L10N[locale].view3d, 'the toggle offers 3D again');
            // Asking again asks again (and refuses again), rather than a sticky dead button.
            await act(async () => { toggle().props.onClick(); });
            await settle(() => browser.win.__bwSpikeArena.view3d === 'fallback' && browser.win.__bwSpikeArena.view === '2d', 'refused again');
        } finally {
            if (renderer) await act(async () => renderer.unmount());
            browser.restore();
        }
    });
}

test('the 3D view gets every frame\'s snapshot, the camera modes, a new world; the verdict does not move', async () => {
    const browser = installBrowser();
    let renderer;
    try {
        const Pane = await loadPane();
        await act(async () => { renderer = create(React.createElement(Pane, {locale: 'en'}), {createNodeMock}); });
        await settle(() => browser.win.__bwSpikeArena?.status === 'ready', 'the pane loaded');
        const pane = browser.win.__bwSpikeArena._pane;

        const in2d = await runMission(browser, renderer);
        assert.equal(in2d.reason, 'fail.timeLimit', 'no program: the mission runs out of time');
        await act(async () => { one(renderer, 'bw-spike-arena-reset').props.onClick(); });

        const views = [];
        pane.view3dModule = recordingViewModule(views);
        await act(async () => { one(renderer, 'bw-spike-arena-view-toggle').props.onClick(); });
        await settle(() => browser.win.__bwSpikeArena.view3d === 'webgl', 'the 3D view opened');
        assert.equal(views.length, 1);
        assert.equal(views[0]['aria-label'], ARENA_L10N.en.canvas3dLabel);
        assert.equal(one(renderer, 'bw-spike-arena-canvas').props.hidden, true, 'the 2D canvas gives way');
        assert.equal(one(renderer, 'bw-spike-arena-view-toggle').props.children, ARENA_L10N.en.view2d);
        assert.equal(one(renderer, 'bw-spike-arena-view-toggle').props['aria-pressed'], true);

        await act(async () => { one(renderer, 'bw-spike-arena-camera').props.onChange({target: {value: 'follow'}}); });
        await act(async () => { one(renderer, 'bw-spike-arena-camera').props.onChange({target: {value: 'top'}}); });
        assert.deepEqual(views[0].modes, ['orbit', 'follow', 'top']);

        const before = views[0].renders;
        const in3d = await runMission(browser, renderer);
        assert.ok(views[0].renders - before >= Math.ceil(in3d.timeMs / (1000 / 30)), `a render per frame (${views[0].renders - before})`);
        assert.deepEqual(in3d, in2d, 'the same verdict and finishing time with the 3D view open');
        // The scene saw the run's final snapshot (the world's clock, which runs out
        // the frame the verdict fell in: at or after the verdict's time).
        assert.equal(views[0].last.timeMs, pane.bridge.snapshot().timeMs);
        assert.ok(views[0].last.timeMs >= in3d.timeMs);
        assert.equal(views[0].built.rover.position.x, views[0].last.pose.x * 0.01);

        // Another mission: a new scene for the new world; the old one is disposed.
        await act(async () => { one(renderer, 'bw-spike-arena-select').props.onChange({target: {value: 1}}); });
        await settle(() => views.length === 2, 'the view rebuilt for the new mission');
        assert.equal(views[0].disposed, true);
        assert.equal(views[1].world, pane.world.id);
        assert.equal(views[1].modes[0], 'top', 'the camera choice survives a new mission');

        await act(async () => { one(renderer, 'bw-spike-arena-view-toggle').props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.view, '2d');
        assert.equal(browser.win.__bwSpikeArena.view3d, 'off');
        assert.equal(views[1].disposed, true, 'toggling back disposes the 3D view');
        assert.equal(one(renderer, 'bw-spike-arena-canvas').props.hidden, false);
    } finally {
        if (renderer) await act(async () => renderer.unmount());
        browser.restore();
    }
});
