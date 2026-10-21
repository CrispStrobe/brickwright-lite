// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Run a program for an EV3 or NXT in the Robot Lab over a transport OTHER than Scratch Link:
 *
 *   the program -> the real Scratch VM -> the REAL bundled extension, connected by its own
 *   "set connection mode" / "connect" block methods
 *   -> Web Serial (bw-sim/transports/virtual-serial.js, a navigator.serial double) or a local
 *      WebSocket bridge (bw-sim/transports/virtual-bridge.js)
 *   -> the brick's existing session (hubs/ev3/ev3-peripheral.js, hubs/nxt/nxt-peripheral.js)
 *   -> the brick behind the VirtualHub boundary -> the Jolt physics -> sensors back.
 *
 * Scratch Link is NOT available in these runs: the WebSocket under the bridge fails every URL it
 * does not serve (as with no Scratch Link installed), and no BT-classic peripheral is registered, so
 * a pass cannot have come through the Scratch Link route. Time is the FakeClock of spike-arena-vm.mjs.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED} from './bw-integrated.mjs';
import {VM, SB3Creator, FakeClock, settle, FRAME_MS} from './spike-arena-vm.mjs';
import {bundledExtensionIds, loadExtensionClass} from './bw-extensions.mjs';

const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib');
const SIM = path.join(LIB, 'bw-sim');
const {SimSession, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {ev3ClassicPeripheral} = await import(path.join(SIM, 'hubs', 'ev3', 'ev3-peripheral.js'));
const {nxtClassicPeripheral} = await import(path.join(SIM, 'hubs', 'nxt', 'nxt-peripheral.js'));
const {clearVirtualClassicPeripheralsForTest} = await import(path.join(LIB, 'virtual-hub', 'bt-classic-registry.js'));
const {installVirtualSerial} = await import(path.join(SIM, 'transports', 'virtual-serial.js'));
const {installVirtualBridge, registerVirtualBridge, clearVirtualBridgesForTest} =
    await import(path.join(SIM, 'transports', 'virtual-bridge.js'));
const {installVirtualFetch, registerVirtualHttp, clearVirtualHttpForTest} =
    await import(path.join(SIM, 'transports', 'virtual-http.js'));
const Timer = createRequire(import.meta.url)(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'util', 'timer.js'));

export const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
export {FRAME_MS};

/** Every WebSocket URL the virtual bridge does not serve fails at once (no Scratch Link, no relay). */
class NothingListening {
    constructor (url) {
        this.url = url;
        this.readyState = 0;
        NothingListening.dialled.push(String(url));
        setTimeout(() => {
            this.readyState = 3;
            if (this.onerror) this.onerror({type: 'error'});
            if (this.onclose) this.onclose({code: 1006});
        }, 0);
    }

    close () { this.readyState = 3; }

    send () { throw new Error('nothing is listening'); }

    addEventListener () {}

    removeEventListener () {}
}
NothingListening.dialled = [];

/**
 * @param {object} program {bw: DEVICE text} | {project: project JSON}
 * @param {object} options
 * @param {string} options.modelText
 * @param {string|null} [options.mat]
 * @param {'ev3'|'nxt'} options.profile
 * @param {string} options.extensionId
 * @param {'serial'|'bridge'} options.route
 * @param {{port: number, framing: string}} [options.bridge] the relay the extension dials (route 'bridge')
 * @param {boolean} [options.grantedPort] the serial port counts as already authorised (getPorts())
 * @param {(extension, ctx) => Promise<any>} options.connect the extension's own connect blocks
 * @param {number} options.timeLimitMs
 * @param {function} [options.stopWhen]
 * @param {(hub) => object} [options.peripheralOf] override the brick's peripheral record (controls)
 * @param {{port: number, host?: string, handlerOf: (getHub) => Function}} [options.http] route 'http': the
 *   endpoint the extension fetches, answered by handlerOf(getHub) (e.g. virtual-ev3dev.js)
 * @param {string} [options.extensionDir] the bundled directory when it is not the extension id (ev3dev)
 */
export async function runOverVirtualTransport (program, {modelText, mat = null, profile, extensionId, route, bridge = null,
    grantedPort = false, connect, timeLimitMs, stopWhen = null, peripheralOf = null, http = null, extensionDir = null}) {
    if (!globalThis.self) globalThis.self = globalThis;
    const clock = new FakeClock(1.7e12);
    clock.install();
    clearVirtualClassicPeripheralsForTest();
    clearVirtualBridgesForTest();
    NothingListening.dialled = [];
    const savedWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = NothingListening;
    const restoreBridge = installVirtualBridge({host: globalThis});
    clearVirtualHttpForTest();
    const savedFetch = globalThis.fetch;
    // Nothing on the network answers in these runs, except the virtual endpoint.
    globalThis.fetch = async url => { throw new TypeError(`fetch failed: nothing at ${url}`); };
    const restoreFetch = installVirtualFetch({host: globalThis});
    // Node 20 has no navigator; Node 21+ has one without `serial`. Either way the double is the only serial.
    const hadNavigator = Object.prototype.hasOwnProperty.call(globalThis, 'navigator');
    if (!globalThis.navigator) Object.defineProperty(globalThis, 'navigator', {value: {}, configurable: true, writable: true});
    const traffic = {bytesIn: 0, bytesOut: 0, opens: 0};
    let vm = null;
    let session = null;
    let restoreSerial = () => {};
    try {
        const {session: made, issues} = await SimSession.fromText(modelText, {hubState: null, catalog: CATALOG, mat});
        if (!made) throw new Error(`the model does not compile: ${JSON.stringify(issues)}`);
        session = made;
        const entry = session.hubs.find(h => h.profile === profile);
        if (!entry) throw new Error(`the scene has no ${profile}`);
        const hub = entry.hub;
        const base = peripheralOf ? peripheralOf(hub) :
            (profile === 'ev3' ? ev3ClassicPeripheral(() => hub) : nxtClassicPeripheral(() => hub));
        const counted = {...base, open: link => {
            traffic.opens++;
            const inner = base.open({send: bytes => { traffic.bytesOut += bytes.length; link.send(bytes); }, close: link.close});
            return {receive: bytes => { traffic.bytesIn += bytes.length; inner.receive(bytes); }, close: () => inner.close && inner.close()};
        }};
        if (route === 'http') {
            const handle = http.handlerOf(() => hub);
            registerVirtualHttp({host: http.host, port: http.port, handle: request => {
                traffic.opens = 1;
                traffic.bytesIn += (request.body || '').length + request.path.length;
                return handle(request);
            }});
        } else if (route === 'serial') {
            restoreSerial = installVirtualSerial({host: globalThis.navigator, peripherals: () => [counted], granted: grantedPort});
        } else if (route === 'bridge') {
            registerVirtualBridge({port: bridge.port, framing: bridge.framing, peripheral: counted});
        } else throw new Error(`unknown route ${route}`);

        vm = new VM();
        let extension = null;
        const manager = vm.extensionManager;
        const original = manager.loadExtensionURL.bind(manager);
        const bundled = bundledExtensionIds();
        manager.loadExtensionURL = id => {
            const dir = bundled.get(String(id)) || (String(id) === extensionId ? extensionDir : null);
            if (!dir) return original(id);
            const Cls = loadExtensionClass(dir);
            const instance = new Cls(vm.runtime);
            if (String(id) === extensionId) extension = instance;
            manager._loadedExtensions.set(String(id), manager._registerInternalExtension(instance));
            return Promise.resolve();
        };
        let project;
        if (program.bw) {
            const creator = new SB3Creator();
            creator.parse(program.bw);
            project = Buffer.from(await (await creator.generateSB3()).arrayBuffer());
        } else project = JSON.stringify(program.project);
        await vm.loadProject(project);
        if (!extension) {
            await manager.loadExtensionURL(extensionId);
        }
        vm.setCompatibilityMode(true);
        vm.runtime.currentStepTime = FRAME_MS;
        let budget = 0;
        vm.runtime.sequencer.timer = new Timer({now: () => budget++});

        // The extension's own connect blocks, run while the clock moves (their probes and replies use timers).
        let connected;
        let connectError = null;
        let done = false;
        const pending = Promise.resolve(connect(extension, {clock})).then(v => { connected = v; }, e => { connectError = e; })
            .finally(() => { done = true; });
        for (let i = 0; i < 400 && !done; i++) await clock.advance(25);
        await pending;
        await clock.advance(200);

        vm.greenFlag();
        const track = [];
        const frames = Math.ceil(timeLimitMs / FRAME_MS);
        for (let frame = 0; frame < frames; frame++) {
            await clock.advance(FRAME_MS);
            vm.runtime._step();
            await settle();
            session.tick(FRAME_MS);
            const pose = session.core.bodyPose(entry.body);
            const point = {t: session.time, position: [...pose.position], rotation: [...pose.rotation],
                motors: Object.fromEntries(hub.motorPortIds().map(p => [p, hub.readPort(p).angleDeg])), running: vm.runtime.threads.length > 0};
            track.push(point);
            if (stopWhen && stopWhen(point, track, hub, {vm, extension})) break;
        }
        return {track, hub, session, vm, extension, connected, connectError, traffic, dialled: NothingListening.dialled.slice()};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        session?.dispose();
        restoreSerial();
        clearVirtualBridgesForTest();
        restoreBridge();
        clearVirtualHttpForTest();
        restoreFetch();
        globalThis.fetch = savedFetch;
        globalThis.WebSocket = savedWebSocket;
        if (!hadNavigator) delete globalThis.navigator;
        clock.uninstall();
    }
}
