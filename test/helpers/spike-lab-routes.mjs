// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Run a SPIKE project in the Robot Lab's physics over a NAMED route, headless:
 *
 *   project.json (a SPIKE project, possibly saved against a legacy extension id)
 *   -> the GUI's own load-time migration (lib/spike-project-migration.js, installed on the VM
 *      as vm-manager-hoc.jsx installs it) -> the real Scratch VM (scratch-vm src)
 *   -> the REAL bundled extension the migrated project names (spikeprime, overlay, unchanged)
 *   -> one of three transports to the virtual SPIKE hub:
 *        'web-ble'          lite's Web Bluetooth shim + the SPIKE 3 GATT peripheral
 *                           (virtual-hub/spike-prime-peripheral.js) — what the Lab's Run uses;
 *        'scratchlink-ble'  scratch-vm's Scratch Link socket (util/scratch-link-websocket.js)
 *                           -> lite's Scratch Link BLE double (virtual-hub/scratch-link-ble.js),
 *                           which offers the same registered GATT peripheral;
 *        'scratchlink-bt'   scratch-vm's Scratch Link socket -> lite's SPIKE 2.x RFCOMM double
 *                           (virtual-hub/spike-classic-scratch-link.js), the hub on the
 *                           'legacy-v2' firmware target as the SPIKE panel's profile sets it;
 *        'bridge'           the extension's own `connect to bridge at [URL]` (ws://localhost:8081)
 *                           -> lite's virtual WebSocket relay (bw-sim/transports/virtual-bridge.js,
 *                           text framing) -> the same 2.x REPL double as a byte stream
 *                           (bw-sim/transports/virtual-spike-stream.js), 'legacy-v2' as above;
 *   -> the virtual hub state -> SimSession (the Lab's physics, built as test/helpers/sim-lab-vm.mjs
 *      builds it: prepareModel on the mat, then Jolt) -> sensors back the same way.
 *
 * Time is simulated exactly as in test/helpers/spike-arena-vm.mjs (its FakeClock and settle
 * are reused): the VM is stepped at 30 frames per second and the world ticked by the same frame.
 * Nothing here reimplements a block, a byte of a protocol or the physics. The report is a
 * track of physics observations (bodies, joints, sensor ray origins) next to what the hub
 * reports on each port, so tests judge the world, not the extension's bookkeeping.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {REPO, INTEGRATED, importGuiDependency} from './bw-integrated.mjs';
import {bundledExtensionIds, loadExtensionClass} from './bw-extensions.mjs';
import {SB3Creator, VM, FakeClock, settle, registerVirtualHub, FRAME_MS} from './spike-arena-vm.mjs';

const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib');
const SIM = path.join(LIB, 'bw-sim');
const {SimSession, prepareModel, catalogFrom, hubBodyOf} = await import(path.join(SIM, 'sim-session.js'));
const {loadJolt} = await import(path.join(SIM, 'physics', 'jolt-core.js'));
const {default: installSpikeProjectMigration} = await import(path.join(LIB, 'spike-project-migration.js'));
const {default: installScratchLinkBle} = await import(path.join(LIB, 'virtual-hub', 'scratch-link-ble.js'));
const {default: installVirtualSpikeClassicScratchLink} = await import(path.join(LIB, 'virtual-hub', 'spike-classic-scratch-link.js'));
const {connectVirtualHub} = await import(path.join(LIB, 'virtual-hub', 'connect-virtual-hub.js'));
const {installVirtualBridge, registerVirtualBridge, clearVirtualBridgesForTest} = await import(path.join(SIM, 'transports', 'virtual-bridge.js'));
const {spikeStreamPeripheral} = await import(path.join(SIM, 'transports', 'virtual-spike-stream.js'));
const JSZip = (await importGuiDependency('jszip/lib/index.js')).default;

const nodeRequire = createRequire(import.meta.url);
const Timer = nodeRequire(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'util', 'timer.js'));

export const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
export {FRAME_MS};
export const ROUTES = Object.freeze(['web-ble', 'scratchlink-ble', 'scratchlink-bt', 'bridge']);
export const modelText = file => readFileSync(path.join(REPO, 'overlay', 'scratch-gui', 'static', 'sim-lab', 'models', file), 'utf8');

if (!globalThis.self) globalThis.self = globalThis; // scratch-vm's Scratch Link socket factory reads `self`

/**
 * A page WebSocket for URLs no virtual double claims: it never opens (as a machine without
 * Scratch Link: the connection attempt simply does not answer). scratch-vm's socket opens ws://
 * and wss:// together and keeps whichever opens first; only the loopback one is the RFCOMM
 * double's, so the other must exist without opening.
 */
class SilentWebSocket {
    constructor (url) { this.url = String(url); this.readyState = 0; }
    send () { throw new Error('no real Scratch Link in this test'); }
    close () { this.readyState = 3; }
    addEventListener () {}
    removeEventListener () {}
}
SilentWebSocket.CONNECTING = 0; SilentWebSocket.OPEN = 1; SilentWebSocket.CLOSING = 2; SilentWebSocket.CLOSED = 3;

/** project.json of a DEVICE SPIKE pseudocode program, as SB3Creator generates it (spikeprime opcodes). */
export async function projectFromSource (source) {
    const creator = new SB3Creator();
    creator.parse(source);
    const zip = await JSZip.loadAsync(Buffer.from(await (await creator.generateSB3()).arrayBuffer()));
    return JSON.parse(await zip.file('project.json').async('string'));
}

/**
 * Re-labels a generated spikeprime project as one saved against `legacyId`: every
 * `spikeprime_<op>` opcode becomes `<legacyId>_<renames[op] || op>`, the extensions list names
 * the legacy id. This AUTHORS the legacy file; the migration under test then has to undo it.
 */
export function asLegacyProject (project, legacyId, renames = {}) {
    const copy = structuredClone(project);
    for (const target of copy.targets) {
        for (const block of Object.values(target.blocks || {})) {
            if (!block || typeof block.opcode !== 'string' || !block.opcode.startsWith('spikeprime_')) continue;
            const op = block.opcode.slice('spikeprime_'.length);
            block.opcode = `${legacyId}_${renames[op] || op}`;
        }
    }
    copy.extensions = (copy.extensions || []).map(id => (id === 'spikeprime' ? legacyId : id));
    return copy;
}

/** Rotate v by the unit quaternion [x, y, z, w]. */
const quatRotate = ([x, y, z, w], v) => {
    const ix = w * v[0] + y * v[2] - z * v[1];
    const iy = w * v[1] + z * v[0] - x * v[2];
    const iz = w * v[2] + x * v[1] - y * v[0];
    const iw = -x * v[0] - y * v[1] - z * v[2];
    return [ix * w - iw * x - iy * z + iz * y, iy * w - iw * y - iz * x + ix * z, iz * w - iw * z - ix * y + iy * x];
};

/**
 * @param {object} project a parsed project.json (any SPIKE extension id it names)
 * @param {object} options
 * @param {'web-ble'|'scratchlink-ble'|'scratchlink-bt'} options.route
 * @param {string} options.modelText LDraw text
 * @param {string|null} [options.mat]
 * @param {number} options.timeLimitMs simulated time after the green flag
 * @param {function} [options.stopWhen] (track) => true ends early
 * @returns {Promise<{track, mechanism, hubId, issues, requested, loadedOpcodes, hub, calls, frames, connectedProtocol, sockets}>}
 *   requested: every extension id the VM asked the manager for; loadedOpcodes: the opcodes the VM
 *   holds after load (post-migration); connectedProtocol: the router's protocol ('spike3' | 'repl');
 *   sockets: every WebSocket the page opened ({url, by: the class that answered it})
 */
export async function runSpikeProjectInLab (project, {route, modelText: text, mat = null, timeLimitMs, stopWhen = null}) {
    if (!ROUTES.includes(route)) throw new Error(`unknown route ${route}`);
    const {model, runModel, mechanism, issues} = prepareModel(text, CATALOG, {mat});
    if (!mechanism) throw new Error(`the model does not compile: ${JSON.stringify(issues)}`);
    const J = await loadJolt();
    const hubId = hubBodyOf(model, mechanism, CATALOG);
    const hubDef = mechanism.bodies.find(b => b.id === hubId);
    const robotIds = mechanism.bodies.filter(b => b.motion === 'dynamic').map(b => b.id);
    const allSensors = mechanism.sensors || [];

    const clock = new FakeClock(1.7e12);
    clock.install();
    const savedWebSocket = globalThis.WebSocket;
    const calls = new Map();
    const requested = [];
    const sockets = [];
    let vm = null;
    let registration = null;
    let session = null;
    let removeClassicClaim = null;
    try {
        let hub;
        ({hub, registration} = registerVirtualHub());
        globalThis.__brickwrightChooseVirtualBluetooth = undefined; // the connect below installs the pane's chooser
        globalThis.WebSocket = SilentWebSocket;
        if (route === 'scratchlink-bt') {
            // The SPIKE panel's profile selector: a 2.x hub answers on Classic (render-gui.jsx installs the claim at boot).
            hub.setFirmwareTarget('legacy-v2');
            installVirtualSpikeClassicScratchLink(hub, {host: globalThis, NativeWebSocket: SilentWebSocket});
            removeClassicClaim = globalThis.__brickwrightVirtualSpikeClassicClaim;
        }
        if (route === 'scratchlink-ble') installScratchLinkBle(globalThis);
        if (route === 'bridge') {
            hub.setFirmwareTarget('legacy-v2');
            clearVirtualBridgesForTest();
            installVirtualBridge({host: globalThis});
            registerVirtualBridge({port: 8081, framing: 'text', peripheral: spikeStreamPeripheral(hub)});
        }
        // Which sockets the page opened, and what answered each (a double's class, or the silent page socket).
        const Installed = globalThis.WebSocket;
        const Recording = function WebSocket (url, protocols) {
            const socket = protocols === undefined ? new Installed(url) : new Installed(url, protocols);
            sockets.push({url: String(url), by: socket && socket.constructor ? socket.constructor.name : typeof socket});
            return socket;
        };
        Object.assign(Recording, {CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3});
        globalThis.WebSocket = Recording;
        session = new SimSession({hubState: hub, model, runModel, mechanism, catalog: CATALOG, mat, J});

        // The GUI's VM: the migration hook vm-manager-hoc.jsx installs, the bundled extension for the id asked.
        vm = new VM();
        installSpikeProjectMigration(vm);
        const manager = vm.extensionManager;
        const original = manager.loadExtensionURL.bind(manager);
        const ids = bundledExtensionIds();
        let extension = null;
        manager.loadExtensionURL = (id, ...rest) => {
            requested.push(String(id));
            if (String(id) !== 'spikeprime') return original(id, ...rest);
            const Cls = loadExtensionClass(ids.get('spikeprime'));
            extension = new Cls(vm.runtime);
            for (let proto = extension; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
                for (const name of Object.getOwnPropertyNames(proto)) {
                    let method;
                    try { method = extension[name]; } catch { continue; }
                    if (typeof method !== 'function' || name === 'constructor' || name === 'getInfo') continue;
                    extension[name] = function (...args) { calls.set(name, (calls.get(name) || 0) + 1); return method.apply(this, args); };
                }
            }
            manager._loadedExtensions.set('spikeprime', manager._registerInternalExtension(extension));
            return Promise.resolve();
        };
        await vm.loadProject(structuredClone(project));
        const loadedOpcodes = new Set();
        for (const target of vm.runtime.targets) for (const b of Object.values(target.blocks._blocks)) loadedOpcodes.add(b.opcode);
        if (!extension) throw new Error(`the project loaded no spikeprime extension (requested: ${requested.join(', ')})`);
        vm.setCompatibilityMode(true);
        vm.runtime.currentStepTime = FRAME_MS;
        let budget = 0;
        vm.runtime.sequencer.timer = new Timer({now: () => budget++});

        // Connect as the Lab's Run does (sim-lab-pane.jsx run(): connectVirtualSpike, the router's mode, scan),
        // the route named; a Scratch Link route then connects to the peripheral the scan lists, as Scratch's chooser.
        const peripheral = vm.runtime.peripheralExtensions.spikeprime;
        let connectError = null;
        let settled = false;
        // The bridge has no chooser and no Scratch Link: the extension's own `connect to bridge at` block.
        (route === 'bridge' ? Promise.resolve(extension.connectHubAt({URL: 'localhost:8081'})).catch(e => { connectError = e; }) :
        connectVirtualHub({host: globalThis, extensionId: 'SPIKE', hubState: hub, timeoutMs: 10000,
            wait: ms => clock.advance(ms),
            connected: () => vm.getPeripheralIsConnected('spikeprime'),
            disconnect: () => vm.disconnectPeripheral('spikeprime'),
            connect: async () => {
                peripheral.setMode(route);
                if (route === 'web-ble') { await peripheral.scan(); return; }
                const onList = list => {
                    const first = Object.keys(list || {})[0];
                    if (!first) return;
                    vm.runtime.removeListener('PERIPHERAL_LIST_UPDATE', onList);
                    vm.connectPeripheral('spikeprime', first);
                };
                vm.runtime.on('PERIPHERAL_LIST_UPDATE', onList);
                await peripheral.scan();
            }})
            // The RFCOMM route has no GATT chooser: connectVirtualHub's "selected" check cannot hold there.
            .catch(e => { if (!(route === 'scratchlink-bt' && /No connection from SPIKE/.test(e.message) && vm.getPeripheralIsConnected('spikeprime'))) connectError = e; }))
            .finally(() => { settled = true; });
        for (let i = 0; i < 800 && !settled; i++) await clock.advance(25);
        if (!settled) throw new Error(`spikeprime over ${route} did not settle connecting in 20 s of simulated time`);
        if (connectError) throw connectError;
        if (!vm.getPeripheralIsConnected('spikeprime')) throw new Error(`spikeprime did not connect over ${route}`);
        await clock.advance(500);
        const connectedProtocol = peripheral.protocol;

        const carried = p0 => {
            const pose = session.core.bodyPose(hubId);
            const w = quatRotate(pose.rotation, [0, 1, 2].map(i => p0[i] - hubDef.position[i]));
            return w.map((v, i) => v + pose.position[i]);
        };
        const track = [];
        vm.greenFlag();
        const maxFrames = Math.ceil(timeLimitMs / FRAME_MS);
        let frames = 0;
        for (; frames < maxFrames; frames++) {
            await clock.advance(FRAME_MS);
            vm.runtime._step();
            await settle();
            session.tick(FRAME_MS);
            await session.idle();
            const points = {};
            const readings = {};
            for (const s of allSensors) {
                points[s.port] = carried(s.origin);
                readings[s.port] = {...hub.data.sensors['ABCDEF'.indexOf(s.port)]};
            }
            const bodies = {};
            for (const id of robotIds) {
                const p = session.core.bodyPose(id);
                bodies[id] = {position: [...p.position], rotation: [...p.rotation]};
            }
            const busy = {};
            for (const a of mechanism.actuators || []) busy[a.port] = hub.motors.busy(a.port);
            const joints = {};
            for (const j of mechanism.joints) if (j.type === 'hinge' || j.type === 'slider') joints[j.id] = {...session.core.jointState(j.id)};
            track.push({t: session.time, points, readings, bodies, joints, busy});
            if (stopWhen && stopWhen(track)) { frames++; break; }
        }
        return {track, mechanism, hubId, issues, requested, loadedOpcodes, hub, calls, frames, connectedProtocol, sockets};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        try { if (registration) registration.unregister(); } catch { /* noop */ }
        try { if (removeClassicClaim) removeClassicClaim(); } catch { /* noop */ }
        delete globalThis.__brickwrightVirtualSpikeClassicClaim;
        if (route === 'bridge') clearVirtualBridgesForTest();
        globalThis.__brickwrightChooseVirtualBluetooth = undefined;
        globalThis.WebSocket = savedWebSocket;
        session?.dispose();
        clock.uninstall();
    }
}
