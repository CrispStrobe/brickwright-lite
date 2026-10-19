// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Run a program for a LEGO radio hub — Powered Up / BOOST (LWP3) or WeDo 2.0 — in the Robot
 * Lab, headless, through the path the browser takes when the pane's Run is pressed
 * (docs/ROBOT-LAB-HUBS-PLAN.md P3):
 *
 *   pseudocode (`pup …`, `boost …`, `wedo …` words, lib/legoHubsDialect.js) -> SB3Creator
 *   -> the real Scratch VM -> the REAL bundled extension (legopoweredup, legoboostunified,
 *   wedo2unified; overlay, unchanged) -> Web Bluetooth (lite's shim) or a Scratch Link BLE
 *   socket (lite's double) -> the virtual peripheral (virtual-hub/lab-ble-peripherals.js)
 *   -> the hub's protocol and controller (bw-sim/hubs/lwp3, hubs/wedo2) -> the Robot Lab's
 *   physics (SimSession, Jolt) -> encoders and sensors back the same way.
 *
 * As test/helpers/spike-arena-vm.mjs: time is simulated (Date.now and the timers are one fake
 * clock, the VM is stepped at 30 frames per second and the world ticked by the same frame), so
 * the extension's own waits run on the world's time and a run is reproducible. Nothing here
 * reimplements a block, a byte of a protocol or the physics.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED, importSource, importGuiDependency} from './bw-integrated.mjs';
import {bundledExtensionIds, loadExtensionClass} from './bw-extensions.mjs';

const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib');
const SIM = path.join(LIB, 'bw-sim');
export const FRAME_MS = 1000 / 30;

export const Creator = (await importSource('src/lib/sb3-creator-register-art.js')).default;
export const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;

// Browser-shaped globals the extensions and the shim expect (after the VM: see spike-arena-vm.mjs).
if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.navigator || !('bluetooth' in globalThis.navigator)) {
    Object.defineProperty(globalThis, 'navigator', {value: {language: 'en', languages: ['en']}, configurable: true, writable: true});
}
if (!globalThis.document) globalThis.document = {documentElement: {lang: 'en'}};
if (!globalThis.localStorage) globalThis.localStorage = {getItem: () => null, setItem: () => {}};
if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
if (!globalThis.removeEventListener) globalThis.removeEventListener = () => {};
if (!globalThis.alert) globalThis.alert = () => {};
// scratch-vm's Scratch Link socket factory reads `self.Scratch` (the page's Safari helper).
if (!globalThis.self) globalThis.self = globalThis;

const nodeRequire = createRequire(import.meta.url);
const Timer = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'util', 'timer.js'));

const {default: installWebBluetooth, clearVirtualPeripheralsForTest} = await import(path.join(LIB, 'virtual-hub', 'web-bluetooth-shim.js'));
const {default: installScratchLinkBle} = await import(path.join(LIB, 'virtual-hub', 'scratch-link-ble.js'));
const {connectVirtualHub} = await import(path.join(LIB, 'virtual-hub', 'connect-virtual-hub.js'));
const {registerRobotLabBlePeripherals} = await import(path.join(LIB, 'virtual-hub', 'lab-ble-peripherals.js'));
const {SimSession, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));

export const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
export const modelText = file => readFileSync(path.join(REPO, 'overlay', 'scratch-gui', 'static', 'sim-lab', 'models', file), 'latin1');
export const programText = file => readFileSync(path.join(REPO, 'overlay', 'scratch-gui', 'static', 'sim-lab', 'programs', file), 'utf8');

/** The three extensions and how a host connects each (the pane's table: sim-lab-pane.jsx). */
export const HUB_EXTENSIONS = Object.freeze(['legopoweredup', 'legoboostunified', 'wedo2unified']);

/** A clock the whole run shares: Date.now, setTimeout, setInterval (as spike-arena-vm.mjs's). */
class FakeClock {
    constructor (start) { this.now = start; this.timers = new Map(); this.nextId = 1; }
    install () {
        this.saved = {now: Date.now, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
            setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval};
        Date.now = () => this.now;
        const add = (fn, ms, args, repeat) => {
            const id = this.nextId++;
            this.timers.set(id, {fn, args, at: this.now + Math.max(0, Number(ms) || 0), every: repeat ? Math.max(1, Number(ms) || 0) : 0});
            return {id, unref () { return this; }, ref () { return this; }, hasRef: () => false, [Symbol.toPrimitive]: () => id};
        };
        const clear = handle => { if (handle !== undefined && handle !== null) this.timers.delete(Number(handle.id ?? handle)); };
        globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, false);
        globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, true);
        globalThis.clearTimeout = clear;
        globalThis.clearInterval = clear;
    }
    uninstall () {
        Date.now = this.saved.now;
        Object.assign(globalThis, {setTimeout: this.saved.setTimeout, clearTimeout: this.saved.clearTimeout,
            setInterval: this.saved.setInterval, clearInterval: this.saved.clearInterval});
        this.timers.clear();
    }
    async advance (ms) {
        const end = this.now + ms;
        for (;;) {
            let next = null;
            for (const [id, timer] of this.timers) if (timer.at <= end && (!next || timer.at < next[1].at)) next = [id, timer];
            if (!next) break;
            const [id, timer] = next;
            this.now = Math.max(this.now, timer.at);
            if (timer.every) timer.at += timer.every; else this.timers.delete(id);
            try { timer.fn(...timer.args); } catch { /* a timer's error is its own */ }
            await settle();
        }
        this.now = end;
        await settle();
    }
}

const realSetImmediate = globalThis.setImmediate;
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => realSetImmediate(resolve)); };

/**
 * Runs `source` against `model` with its hub reached over `transport`.
 * @param {string} source pseudocode using the LEGO hub words
 * @param {object} options
 * @param {string} options.modelText LDraw text
 * @param {string|null} [options.mat]
 * @param {'ble'|'scratchlink'} [options.transport] the extension's connection type
 * @param {number} options.timeLimitMs simulated time after the green flag
 * @param {function} [options.stopWhen] ({session, hub, t}) => true ends early
 * @param {function} [options.onFrame] ({session, hub, t}) after every frame
 * @returns {Promise<{session, hub, extension, extensionId, frames, connectMs, written, received}>}
 */
export async function runLabHubProgram (source, {modelText: text, mat = null, transport = 'ble', timeLimitMs, stopWhen = null, onFrame = null}) {
    const clock = new FakeClock(1.7e12);
    clock.install();
    let vm = null;
    let unregister = null;
    let session = null;
    const savedWebSocket = globalThis.WebSocket;
    try {
        const built = await SimSession.fromText(text, {hubState: null, catalog: CATALOG, mat});
        session = built.session;
        if (!session) throw new Error(`the model does not compile: ${JSON.stringify(built.issues)}`);
        const hub = session.hubs.map(h => h.hub).find(h => h.protocol);
        if (!hub) throw new Error('the model has no radio hub');
        // The shim and the Scratch Link double, as render-gui.jsx installs them; the scene's hub registered as the pane does.
        clearVirtualPeripheralsForTest();
        globalThis.navigator.bluetooth = undefined;
        installWebBluetooth();
        globalThis.WebSocket = class NoScratchLink {
            constructor () { throw new Error('no real Scratch Link in this test'); }
        };
        installScratchLinkBle(globalThis);
        unregister = registerRobotLabBlePeripherals(() => session.hubs.map(h => h.hub));

        const creator = new Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        vm = new VM();
        const manager = vm.extensionManager;
        const original = manager.loadExtensionURL.bind(manager);
        const ids = bundledExtensionIds();
        const extensions = {};
        manager.loadExtensionURL = id => {
            if (!HUB_EXTENSIONS.includes(String(id))) return original(id);
            const Cls = loadExtensionClass(ids.get(String(id)));
            extensions[id] = new Cls(vm.runtime);
            manager._loadedExtensions.set(String(id), manager._registerInternalExtension(extensions[id]));
            return Promise.resolve();
        };
        await vm.loadProject(buffer);
        const extensionId = HUB_EXTENSIONS.find(id => extensions[id]);
        if (!extensionId) throw new Error('the program uses none of the LEGO hub extensions');
        const extension = extensions[extensionId];
        vm.setCompatibilityMode(true);
        vm.runtime.currentStepTime = FRAME_MS;
        let budget = 0;
        vm.runtime.sequencer.timer = new Timer({now: () => budget++});

        // Connect as the pane's Run does: the extension's own connect, the virtual hub chosen.
        extension.setConnectionType({TYPE: transport});
        const t0 = clock.now;
        let connectError = null;
        const connecting = connectVirtualHub({host: globalThis, extensionId, hubState: hub,
            connected: () => Boolean(extension.isConnected()),
            disconnect: () => extension.disconnect(),
            connect: () => Promise.resolve(extension.connect()).catch(e => { connectError = e; }),
            timeoutMs: 10000,
            wait: ms => clock.advance(ms)}).catch(e => { connectError = connectError || e; });
        let settled = false;
        connecting.then(() => { settled = true; });
        // The extension's connect waits on the (fake) clock: advance it until the connection settles.
        for (let i = 0; i < 800 && !settled; i++) await clock.advance(25);
        if (!settled) throw new Error(`${extensionId} did not finish connecting in 20 s of simulated time`);
        if (connectError) throw connectError;
        await clock.advance(500);
        const connectMs = clock.now - t0;

        vm.greenFlag();
        let frames = 0;
        const maxFrames = Math.ceil(timeLimitMs / FRAME_MS);
        for (; frames < maxFrames; frames++) {
            await clock.advance(FRAME_MS);
            vm.runtime._step();
            await settle();
            session.tick(FRAME_MS);
            await session.idle();
            await settle();
            const view = {session, hub, t: session.time};
            if (onFrame) onFrame(view);
            if (stopWhen && stopWhen(view)) { frames++; break; }
        }
        const written = hub.log.filter(e => e.dir === 'down').map(e => e.bytes);
        const received = hub.log.filter(e => e.dir === 'up').map(e => e.bytes);
        return {session, hub, extension, extensionId, frames, connectMs, written, received, vm};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        try { if (unregister) unregister(); } catch { /* noop */ }
        globalThis.__brickwrightChooseVirtualBluetooth = undefined;
        globalThis.WebSocket = savedWebSocket;
        clock.uninstall();
    }
}

/**
 * scratch-vm's OWN boost / wedo2 extension (src/extensions/scratch3_boost, scratch3_wedo2, as the
 * GUI bundles them) on the scene's hub: loaded by the VM, connected as the pane's Run connects it
 * (the runtime's peripheral scan over Scratch Link — its io/ble.js — then connectPeripheral on the
 * first peripheral listed, connectVirtualHub choosing the hub), then `steps(extension, wait)` calls
 * its block functions with the world running: `wait(ms)` advances the clock and the world together.
 * @returns {Promise<{session, hub, written, received}>}
 */
export async function runStockHubExtension (extensionId, {modelText: text, mat = null, steps}) {
    const clock = new FakeClock(1.7e12);
    clock.install();
    let vm = null;
    let unregister = null;
    let session = null;
    const savedWebSocket = globalThis.WebSocket;
    try {
        const built = await SimSession.fromText(text, {hubState: null, catalog: CATALOG, mat});
        session = built.session;
        const hub = session.hubs.map(h => h.hub).find(h => h.protocol);
        clearVirtualPeripheralsForTest();
        globalThis.navigator.bluetooth = undefined;
        installWebBluetooth();
        globalThis.WebSocket = class NoScratchLink {
            constructor () { throw new Error('no real Scratch Link in this test'); }
        };
        installScratchLinkBle(globalThis);
        unregister = registerRobotLabBlePeripherals(() => session.hubs.map(h => h.hub));
        vm = new VM();
        await vm.extensionManager.loadExtensionURL(extensionId);
        const serviceName = vm.extensionManager._loadedExtensions.get(extensionId);
        const dispatch = (await importGuiDependency('scratch-vm/src/dispatch/central-dispatch.js')).default;
        const extension = dispatch.services[serviceName];
        const connected = () => vm.getPeripheralIsConnected(extensionId);
        let settled = false;
        let error = null;
        connectVirtualHub({host: globalThis, extensionId, hubState: hub, connected, timeoutMs: 10000,
            disconnect: () => vm.disconnectPeripheral(extensionId), wait: ms => clock.advance(ms),
            connect: () => new Promise(resolve => {
                const onList = list => {
                    const first = Object.keys(list || {})[0];
                    if (!first) return;
                    vm.runtime.removeListener('PERIPHERAL_LIST_UPDATE', onList);
                    vm.connectPeripheral(extensionId, first);
                    resolve();
                };
                vm.runtime.on('PERIPHERAL_LIST_UPDATE', onList);
                vm.scanForPeripheral(extensionId);
            })}).then(() => { settled = true; }, e => { error = e; settled = true; });
        for (let i = 0; i < 800 && !settled; i++) await clock.advance(25);
        if (error) throw error;
        if (!settled) throw new Error(`${extensionId} did not connect`);
        await clock.advance(500);
        /** Simulated time passes for the program and the world together. */
        const wait = async ms => {
            for (let t = 0; t < ms; t += FRAME_MS) {
                await clock.advance(FRAME_MS);
                session.tick(FRAME_MS);
                await session.idle();
                await settle();
            }
        };
        /** Runs a block function to completion while the world runs (a block that waits on the hub). */
        const block = async (promise, maxMs = 10000) => {
            let done = false;
            Promise.resolve(promise).then(() => { done = true; });
            for (let t = 0; t < maxMs && !done; t += FRAME_MS) await wait(FRAME_MS);
            return done;
        };
        await steps(extension, wait, block);
        return {session, hub, written: hub.log.filter(e => e.dir === 'down').map(e => e.bytes),
            received: hub.log.filter(e => e.dir === 'up').map(e => e.bytes)};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        try { if (unregister) unregister(); } catch { /* noop */ }
        globalThis.__brickwrightChooseVirtualBluetooth = undefined;
        globalThis.WebSocket = savedWebSocket;
        clock.uninstall();
    }
}
