// SPDX-License-Identifier: BSD-3-Clause
/**
 * The SPIKE arena pane offers every unit (task D2), rendered for real with
 * react-test-renderer: the pane component as shipped, its real lib modules,
 * and the real unit files served by a fetch over overlay/scratch-gui/static.
 *
 * It holds what the headless run tests cannot: that the pane LISTS the units
 * from static/spike-arena/units.json, that picking one loads its missions,
 * that a mission can be started and runs to a verdict on the pane's own frame
 * loop, that a staged mission shows its stages and the verdict's partial
 * credit, and that 'bw-spike-arena-select' can name a unit. No program is
 * loaded (there is no VM here), so a started mission runs out of time: that
 * is the verdict this file expects, and it proves the mission ran.
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

async function loadPane () {
    const sourceUrl = new URL('../overlay/scratch-gui/src/components/tw-pseudocode/spike-arena-pane.jsx', import.meta.url);
    // Beside the source, so its relative imports of lib/ resolve to the real modules.
    const tempUrl = new URL(`./spike-arena-pane-test-${randomUUID()}.mjs`, sourceUrl);
    const reactUrl = pathToFileURL(guiRequire.resolve('react')).href;
    const source = (await readFile(sourceUrl, 'utf8')).replace("from 'react'", `from '${reactUrl}'`)
        .replace("from 'scratch-vm/src/extension-support/native-renode-capability.js'",
            `from '${new URL('../overlay/scratch-vm/src/extension-support/native-renode-capability.js', import.meta.url).href}'`);
    const transformed = babel.transformSync(source, {
        filename: 'spike-arena-pane.jsx', babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-react'), {runtime: 'classic'}]]
    }).code;
    await writeFile(tempUrl, transformed);
    try { return (await import(tempUrl.href)).default; } finally { await unlink(tempUrl); }
}

/** A browser-shaped global for the pane: events, animation frames on demand, and fetch over static/. */
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
    const fetched = [];
    globalThis.fetch = async url => {
        fetched.push(url);
        try {
            const text = await readFile(join(STATIC_ROOT, url), 'utf8');
            return {ok: true, status: 200, json: async () => JSON.parse(text), text: async () => text};
        } catch {
            return {ok: false, status: 404};
        }
    };
    let now = 1000;
    return {
        win, fetched,
        /** Runs n animation frames, 33 ms of wall time apart. */
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

const byTestId = (renderer, id) => renderer.root.findAll(node => node.props['data-testid'] === id && typeof node.type === 'string');
const one = (renderer, id) => {
    const found = byTestId(renderer, id);
    assert.equal(found.length, 1, `exactly one ${id}`);
    return found[0];
};
const settle = async (predicate, what) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    }
    assert.fail(`never: ${what}`);
};
const optionTexts = select => select.findAllByType('option').map(o => o.props.children);

test('the pane lists every unit, opens one, and runs a mission to a verdict', async () => {
    const browser = installBrowser();
    let renderer;
    try {
        const Pane = await loadPane();
        const index = JSON.parse(await readFile(join(STATIC_ROOT, 'static/spike-arena/units.json'), 'utf8'));
        await act(async () => { renderer = create(React.createElement(Pane, {locale: 'en'})); });
        await settle(() => optionTexts(one(renderer, 'bw-spike-arena-unit')).length === index.units.length, 'every unit listed');

        const titles = await Promise.all(index.units.map(async id =>
            JSON.parse(await readFile(join(STATIC_ROOT, `static/spike-arena/${id}/unit.json`), 'utf8')).title.en));
        assert.deepEqual(optionTexts(one(renderer, 'bw-spike-arena-unit')), titles, 'the unit list, in units.json order');
        assert.equal(one(renderer, 'bw-spike-arena-unit').props.value, 'rover-basics', 'the starter unit opens first');
        assert.equal(browser.win.__bwSpikeArena.unit, 'rover-basics');

        // Open "Sensors in depth" from the unit picker.
        await act(async () => { one(renderer, 'bw-spike-arena-unit').props.onChange({target: {value: 'sensors-in-depth'}}); });
        await settle(() => browser.win.__bwSpikeArena.unit === 'sensors-in-depth' && browser.win.__bwSpikeArena.status === 'ready',
            'the sensors unit opened');
        const sensors = JSON.parse(await readFile(join(STATIC_ROOT, 'static/spike-arena/sensors-in-depth/unit.json'), 'utf8'));
        assert.equal(optionTexts(one(renderer, 'bw-spike-arena-select')).length, sensors.challenges.length);
        assert.equal(browser.win.__bwSpikeArena._pane.world.id, sensors.challenges[0]);
        assert.ok(browser.fetched.includes(`static/spike-arena/sensors-in-depth/${sensors.challenges[0]}.json`));

        // Start it. There is no program, so the world runs and time runs out.
        await act(async () => { await one(renderer, 'bw-spike-arena-start').props.onClick(); });
        assert.equal(browser.win.__bwSpikeArena.status, 'running');
        const limit = browser.win.__bwSpikeArena._pane.world.timeLimitMs;
        await browser.frames(Math.ceil(limit / (1000 / 30)) + 30);
        const banner = one(renderer, 'bw-spike-arena-banner');
        assert.deepEqual([banner.props['data-verdict'], banner.props['data-reason']], ['fail', 'fail.timeLimit']);
        assert.equal(browser.win.__bwSpikeArena.verdict.timeMs, limit, 'the mission ran its whole time on the pane clock');
    } finally {
        if (renderer) await act(async () => renderer.unmount());
        browser.restore();
    }
});

test('a staged mission shows its stages and the partial credit; the select event can name a unit', async () => {
    const browser = installBrowser();
    let renderer;
    try {
        const Pane = await loadPane();
        await act(async () => { renderer = create(React.createElement(Pane, {locale: 'de'})); });
        await settle(() => browser.win.__bwSpikeArena?.status === 'ready', 'the pane loaded');
        const capstone = JSON.parse(await readFile(join(STATIC_ROOT, 'static/spike-arena/capstone/cp01-supply-run.json'), 'utf8'));
        await act(async () => {
            browser.win.dispatchEvent(new CustomEvent('bw-spike-arena-select', {detail: {unit: 'capstone', id: capstone.id}}));
        });
        await settle(() => browser.win.__bwSpikeArena._pane.world?.id === capstone.id, 'the capstone opened by event');
        assert.equal(one(renderer, 'bw-spike-arena-unit').props.value, 'capstone');
        const stages = one(renderer, 'bw-spike-arena-stages').findAllByType('li');
        assert.equal(stages.length, capstone.stages.length);
        assert.ok(stages.every(li => li.props['data-met'] === 'false'));
        assert.match(stages[0].props.children, new RegExp(capstone.stages[0].de), 'German stage labels');

        await act(async () => { await one(renderer, 'bw-spike-arena-start').props.onClick(); });
        await browser.frames(Math.ceil(capstone.timeLimitMs / (1000 / 30)) + 30);
        assert.equal(one(renderer, 'bw-spike-arena-banner').props['data-reason'], 'fail.timeLimit');
        assert.equal(one(renderer, 'bw-spike-arena-stages-done').props.children, `Etappen geschafft: 0 von ${capstone.stages.length}`);
    } finally {
        if (renderer) await act(async () => renderer.unmount());
        browser.restore();
    }
});

test('pane clock yields to an external owner and controls await external cancellation',async()=>{
    const browser=installBrowser();let renderer;
    try{
        const Pane=await loadPane();
        await act(async()=>{renderer=create(React.createElement(Pane,{locale:'en'}));});
        await settle(()=>browser.win.__bwSpikeArena.status==='ready','ready arena');
        const pane=browser.win.__bwSpikeArena._pane,hub=pane.hubState;
        let cancellations=0;
        const claim=()=>{
            let resolve;
            const completion=new Promise(r=>{resolve=r;});
            hub.clockOwner='external';
            hub.externalBackend={completion,cancel:()=>{
                cancellations++;hub.clockOwner=null;hub.externalBackend=null;resolve({result:'stopped'});
            }};
            browser.win.__bwSpikeArena.beginExternal();
        };
        await act(async()=>claim());
        const before=pane.bridge.sim.timeMs;
        await browser.frames(10);assert.equal(pane.bridge.sim.timeMs,before,'frame clock cannot double-step Python world');
        await act(async()=>{await pane.pause();});
        assert.equal(cancellations,1);assert.equal(pane.state.status,'paused');assert.equal(hub.clockOwner,null);
        await act(async()=>claim());
        await act(async()=>{await pane.step();});
        assert.equal(cancellations,2);assert.ok(pane.bridge.sim.timeMs>before);
        await act(async()=>claim());
        await act(async()=>{await pane.reset();});
        assert.equal(cancellations,3);assert.equal(pane.bridge.sim.timeMs,0);assert.equal(pane.state.status,'ready');
    }finally{if(renderer)await act(async()=>renderer.unmount());browser.restore();}
});

test('unmount invalidates unit loads before they can publish a late scene', async () => {
    const browser = installBrowser(), Pane = await loadPane();
    const originalFetch = globalThis.fetch; let release, renderer;
    const gate = new Promise(resolve => { release = resolve; });
    globalThis.fetch = async url => {
        const response = await originalFetch(url);
        if (url.endsWith('/unit.json')) await gate;
        return response;
    };
    try {
        await act(async () => { renderer = create(React.createElement(Pane, {locale: 'en'})); });
        const instance = renderer.getInstance();
        let pending;
        await act(async () => { pending = instance.openUnit('capstone'); await new Promise(resolve => setImmediate(resolve)); });
        act(() => renderer.unmount()); renderer = null;
        let updates = 0; instance.setState = () => { updates++; };
        await act(async () => { release(); await pending; });
        assert.equal(instance.disposed, true);
        assert.equal(instance.unitToken, null);
        assert.equal(updates, 0, 'no state publication or onReady callback after unmount');
    } finally { release(); if (renderer) act(() => renderer.unmount()); browser.restore(); }
});
