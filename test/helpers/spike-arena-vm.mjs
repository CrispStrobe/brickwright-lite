// SPDX-License-Identifier: BSD-3-Clause
/**
 * Run a lite SPIKE program (`DEVICE SPIKE` .bw) against the SPIKE arena,
 * headless, through the SAME path the browser takes:
 *
 *   SB3Creator.parse -> generateSB3 -> the real Scratch VM (scratch-vm src)
 *   -> the real bundled spikeprime extension (overlay, as shipped)
 *   -> Web Bluetooth (lite's shim) -> the virtual SPIKE hub's BLE peripheral
 *   -> the hub's motor model -> the arena bridge -> the world -> sensors back.
 *
 * Nothing here reimplements a block, a protocol or the physics. The two
 * deliberate deviations from the browser, stated:
 *
 *  1. Time is simulated. Date.now, setTimeout and setInterval are replaced by a
 *     fake clock for the run, the VM is stepped by hand at 30 frames per second
 *     (Scratch's compatibility rate), and the arena is ticked by the same frame
 *     time. The extension's own timers (its rate limiter, its estimated waits)
 *     therefore see the same time the world does, and the run is reproducible.
 *  2. The sequencer's work budget is counted in checks, not milliseconds: with a
 *     frozen clock a `forever` loop would otherwise never yield. Each timer
 *     read inside the sequencer costs 1 ms of its 25 ms budget.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED, importSource, importGuiDependency} from './bw-integrated.mjs';
import {bundledExtensionIds, loadExtensionClass} from './bw-extensions.mjs';

const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib');
export const FRAME_MS = 1000 / 30;

// The extension and the Web Bluetooth shim expect a browser-shaped global.
const browserGlobals = () => {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.navigator || !('bluetooth' in globalThis.navigator)) {
        Object.defineProperty(globalThis, 'navigator', {value: {language: 'en', languages: ['en']}, configurable: true, writable: true});
    }
    if (!globalThis.document) globalThis.document = {documentElement: {lang: 'en'}};
    if (!globalThis.localStorage) globalThis.localStorage = {getItem: () => null, setItem: () => {}};
    if (!globalThis.addEventListener) globalThis.addEventListener = () => {};
    if (!globalThis.removeEventListener) globalThis.removeEventListener = () => {};
    if (!globalThis.alert) globalThis.alert = () => {};
    if (!globalThis.btoa) globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64');
    if (!globalThis.atob) globalThis.atob = value => Buffer.from(value, 'base64').toString('binary');
};

// The VM first: scratch-svg-renderer's DOMPurify misreads a node global named
// `window` as a browser, so the browser-shaped globals come after it.
export const SB3Creator = (await importSource('src/lib/sb3-creator.js')).default;
export const VM = (await importGuiDependency('scratch-vm/src/index.js')).default;
browserGlobals();
const nodeRequire = createRequire(import.meta.url);
const Timer = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'util', 'timer.js'));

const {default: installWebBluetooth, clearVirtualPeripheralsForTest} =
    await import(path.join(LIB, 'virtual-hub', 'web-bluetooth-shim.js'));
const {registerVirtualSpikePrime} = await import(path.join(LIB, 'virtual-hub', 'spike-prime-peripheral.js'));
export const {default: HubState} = await import(path.join(LIB, 'virtual-hub', 'spike-hub-state.js'));
export const {ArenaHubBridge} = await import(path.join(LIB, 'spike-arena', 'arena-hub-bridge.js'));
const {VmStepClock, frameSimMs} = await import(path.join(LIB, 'spike-arena', 'arena-clock.js'));

const SPIKE_DIR = bundledExtensionIds().get('spikeprime');
if (!SPIKE_DIR) throw new Error('no bundled spikeprime extension');
const SpikeExtension = loadExtensionClass(SPIKE_DIR);

/** A clock the whole run shares: Date.now, setTimeout, setInterval. */
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
    /** Runs every timer due up to now + ms, in time order, then settles promises. */
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

/** Lets every queued promise continuation run (not a timer: setImmediate is the real one). */
const realSetImmediate = globalThis.setImmediate;
const settle = async () => { for (let i = 0; i < 3; i++) await new Promise(resolve => realSetImmediate(resolve)); };

/**
 * Runs one program against one challenge.
 * @param {string} source DEVICE SPIKE .bw text
 * @param {object} world a validated challenge world
 * @returns {Promise<{verdict, snapshot, frames, calls, hub, unsupported}>}
 */
/**
 * @param {object} [options]
 * @param {function} [options.vmStepsOn] run the browser pane's frame loop
 *   instead of lockstep: animation frames arrive every FRAME_MS of wall time,
 *   and the VM gets a step only on frames where vmStepsOn(frameIndex) is true
 *   (a loaded runner whose VM interval stalls or falls behind its rAF). A
 *   number is a step COUNT for that frame: 2 is two VM steps in the same
 *   millisecond (a loaded browser firing its setInterval back to back). Each
 *   frame's simulated time comes from the pane's own rule, frameSimMs
 *   (lib/spike-arena/arena-clock.js).
 * @param {number} [options.maxFrames] frame budget for the pane loop
 * @param {boolean} [options.stepClock] with vmStepsOn: install the pane's
 *   VmStepClock (true, what ships) or leave it off so frameSimMs falls back to
 *   wall-clock frame deltas (false, the rule before #518)
 */
export async function runOnArena (source, world, {extraMs = 0, record = false, vmStepsOn = null, maxFrames: paneFrames = 0, stepClock = true} = {}) {
    const clock = new FakeClock(1.7e12);
    clock.install();
    const calls = new Map();
    const unsupported = [];
    let vm = null;
    let registration = null;
    try {
        clearVirtualPeripheralsForTest();
        const hub = new HubState();
        hub.setSimulationEnabled(true);
        registration = registerVirtualSpikePrime({hubState: hub});
        globalThis.navigator.bluetooth = undefined;
        installWebBluetooth();
        globalThis.__brickwrightChooseVirtualBluetooth = candidates => candidates[0];
        const bridge = new ArenaHubBridge({hubState: hub, world});
        // Every view the checker judged, for replaying under a mutated checker.
        const views = [];
        if (record) {
            const evaluate = bridge.checker.evaluate.bind(bridge.checker);
            bridge.checker.evaluate = view => { views.push(view); return evaluate(view); };
        }

        const creator = new SB3Creator();
        creator.parse(source);
        const buffer = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        vm = new VM();
        let extension = null;
        const manager = vm.extensionManager;
        const original = manager.loadExtensionURL.bind(manager);
        manager.loadExtensionURL = id => {
            if (String(id) !== 'spikeprime') return original(id);
            extension = new SpikeExtension(vm.runtime);
            const names = new Set();
            for (let proto = extension; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
                for (const name of Object.getOwnPropertyNames(proto)) names.add(name);
            }
            for (const name of names) {
                let method;
                try { method = extension[name]; } catch { continue; }
                if (typeof method !== 'function' || name === 'constructor' || name === 'getInfo') continue;
                extension[name] = function (...args) {
                    calls.set(name, (calls.get(name) || 0) + 1);
                    return method.apply(this, args);
                };
            }
            const service = manager._registerInternalExtension(extension);
            manager._loadedExtensions.set('spikeprime', service);
            return Promise.resolve();
        };
        await vm.loadProject(buffer);
        if (creator.project.stc) vm.runtime.stc = creator.project.stc;
        if (!extension) throw new Error('the program does not load the spikeprime extension');
        vm.setCompatibilityMode(true);
        vm.runtime.currentStepTime = FRAME_MS;
        let budget = 0;
        vm.runtime.sequencer.timer = new Timer({now: () => budget++});

        // Connect as the user would: the extension's own connect, over Web
        // Bluetooth (named: node has no Scratch Link for auto to try first).
        extension.setConnectionMode({MODE: 'web-ble'});
        const connecting = extension.connectHub();
        for (let i = 0; i < 200 && !extension.isConnected(); i++) await clock.advance(10);
        await connecting;
        if (!extension.isConnected()) throw new Error('the extension did not connect to the virtual hub');
        await clock.advance(200); // info response, device-notification request
        bridge.reset();
        await clock.advance(FRAME_MS);

        const paneClock = new VmStepClock();
        const pane = typeof vmStepsOn === 'function';
        if (pane && stepClock) paneClock.install(vm.runtime);
        vm.greenFlag();
        let frames = 0;
        let verdict = bridge.verdict;
        const peripheralState = hub.data;
        // Lockstep bounds the loop by simulated time; the starved pane loop takes
        // its bound from the caller, who knows how long the VM is starved.
        const maxFrames = pane && paneFrames ? paneFrames : Math.ceil((world.timeLimitMs + extraMs + 1000) / FRAME_MS);
        let lastFrame = null;
        for (let frame = 0; frame < maxFrames; frame++) {
            await clock.advance(FRAME_MS);
            // vmStepsOn may return a COUNT: a loaded browser's setInterval can
            // fire twice with almost no wall time between, and those steps see
            // the same Date.now().
            const steps = pane ? Number(vmStepsOn(frame)) : 1;
            for (let i = 0; i < steps; i++) {
                vm.runtime._step();
                await settle();
            }
            if (pane) {
                const now = clock.now;
                verdict = bridge.tick(frameSimMs(paneClock, lastFrame, now));
                lastFrame = now;
            } else verdict = bridge.tick(FRAME_MS);
            frames++;
            if (peripheralState.lastUnsupportedPythonTunnel && !unsupported.includes(peripheralState.lastUnsupportedPythonTunnel)) {
                unsupported.push(peripheralState.lastUnsupportedPythonTunnel);
            }
            if (verdict.status !== 'running') break;
        }
        paneClock.uninstall();
        return {verdict, snapshot: bridge.snapshot(), frames, calls, hub, unsupported, views};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        try { if (registration) registration.unregister(); } catch { /* noop */ }
        clock.uninstall();
    }
}

export const readUnitFile = (unit, file) => readFileSync(path.join(REPO, 'overlay', 'scratch-gui', 'static', 'spike-arena', unit, file), 'utf8');
