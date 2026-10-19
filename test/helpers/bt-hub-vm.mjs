// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Run a program for an EV3 or NXT in the Robot Lab, headless, through the path the browser takes
 * (docs/ROBOT-LAB-EV3-NXT.md):
 *
 *   the program (DEVICE EV3 text through SB3Creator, or a project's blocks) -> the real Scratch VM
 *   -> the REAL bundled extension (ev3comprehensive, legonxt; the stock `ev3` built in)
 *   -> the VM's own Scratch Link socket (scratch-vm's ScratchLinkWebSocket, dialling a WebSocket)
 *   -> the BT-classic registry's socket (lib/virtual-hub/bt-classic-registry.js)
 *   -> the virtual brick's session (hubs/ev3/ev3-peripheral.js, hubs/nxt/nxt-peripheral.js)
 *   -> the brick behind the VirtualHub boundary -> the Jolt physics -> sensors back.
 *
 * Time is simulated as in test/helpers/spike-arena-vm.mjs (its FakeClock: Date.now and the timers
 * follow the world; the VM steps at 30 frames per second). The one network-shaped thing is the
 * Scratch Link socket pair the VM opens: the loopback one is the registry's, the other
 * (wss://device-manager.scratch.mit.edu) is a stub that fails at once, as it does with no Scratch
 * Link installed.
 */
import path from 'node:path';
import {readFileSync} from 'node:fs';
import {REPO} from './bw-integrated.mjs';
import {VM, SB3Creator, FakeClock, settle, FRAME_MS} from './spike-arena-vm.mjs';
import {bundledExtensionIds, loadExtensionClass} from './bw-extensions.mjs';
import {createRequire} from 'node:module';
import {INTEGRATED} from './bw-integrated.mjs';

const LIB = path.join(REPO, 'overlay', 'scratch-gui', 'src', 'lib');
const SIM = path.join(LIB, 'bw-sim');
const {SimSession, catalogFrom} = await import(path.join(SIM, 'sim-session.js'));
const {registerVirtualClassicPeripheral, clearVirtualClassicPeripheralsForTest, installVirtualClassicScratchLink} =
    await import(path.join(LIB, 'virtual-hub', 'bt-classic-registry.js'));
const {connectVirtualBtHub} = await import(path.join(LIB, 'virtual-hub', 'connect-virtual-bt-hub.js'));
const {ev3ClassicPeripheral, EV3_PERIPHERAL_ID} = await import(path.join(SIM, 'hubs', 'ev3', 'ev3-peripheral.js'));
const {nxtClassicPeripheral, NXT_PERIPHERAL_ID} = await import(path.join(SIM, 'hubs', 'nxt', 'nxt-peripheral.js'));
const Timer = createRequire(import.meta.url)(path.join(INTEGRATED, 'node_modules', 'scratch-vm', 'src', 'util', 'timer.js'));

export const CATALOG = catalogFrom(JSON.parse(readFileSync(path.join(SIM, 'part-meta', 'parts.json'), 'utf8')));
export {FRAME_MS};

/** The Scratch Link endpoint that is not loopback: no Scratch Link here, so it fails at once. */
class NoScratchLink {
    constructor (url) {
        this.url = url;
        this.readyState = 0;
        setTimeout(() => {
            this.readyState = 3;
            if (this.onerror) this.onerror({type: 'error'});
            if (this.onclose) this.onclose({code: 1006});
        }, 0);
    }

    close () { this.readyState = 3; }

    send () { throw new Error('no Scratch Link'); }
}

/**
 * A project for blocks of one sprite (the `.blocks.json` examples): a stage and a sprite.
 * @param {{extensions: string[], blocks: object}} program
 */
export const projectOfBlocks = program => ({
    targets: [
        {isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {}, comments: {}, currentCostume: 0,
            costumes: [{name: 'backdrop1', dataFormat: 'svg', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 240, rotationCenterY: 180}],
            sounds: [], volume: 100, layerOrder: 0, tempo: 60, videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null},
        {isStage: false, name: 'Robot', variables: {}, lists: {}, broadcasts: {}, blocks: program.blocks, comments: {}, currentCostume: 0,
            costumes: [{name: 'costume1', dataFormat: 'svg', assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg', rotationCenterX: 0, rotationCenterY: 0}],
            sounds: [], volume: 100, layerOrder: 1, visible: true, x: 0, y: 0, size: 100, direction: 90, draggable: false,
            rotationStyle: 'all around'}
    ],
    monitors: [],
    extensions: program.extensions,
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'brickwright-test'}
});

/**
 * @param {object} program {bw: DEVICE EV3 text} | {project: project JSON}
 * @param {object} options
 * @param {string} options.modelText LDraw of the scene
 * @param {string|null} [options.mat]
 * @param {'ev3'|'nxt'} options.profile the brick
 * @param {string} options.extensionId the extension the program's blocks are ('ev3comprehensive', 'ev3', 'legonxt')
 * @param {number} options.timeLimitMs
 * @param {function} [options.stopWhen] (frame, track, hub) => true ends the run
 * @param {boolean} [options.connect] false: leave the connection to the test
 * @returns {Promise<{track, hub, session, vm, extension, connectError}>}
 */
export async function runOnBtHub (program, {modelText, mat = null, profile, extensionId, timeLimitMs, stopWhen = null, connect = true}) {
    // The stock extensions' base64 helper reads `self` (a browser's global).
    if (!globalThis.self) globalThis.self = globalThis;
    const clock = new FakeClock(1.7e12);
    clock.install();
    clearVirtualClassicPeripheralsForTest();
    const savedWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = NoScratchLink;
    installVirtualClassicScratchLink({host: globalThis, NativeWebSocket: NoScratchLink});
    let vm = null;
    let session = null;
    try {
        const {session: made, issues} = await SimSession.fromText(modelText, {hubState: null, catalog: CATALOG, mat});
        if (!made) throw new Error(`the model does not compile: ${JSON.stringify(issues)}`);
        session = made;
        const entry = session.hubs.find(h => h.profile === profile);
        if (!entry) throw new Error(`the scene has no ${profile}`);
        const hub = entry.hub;
        const debug = process.env.BT_HUB_DEBUG ? {onCommand: (trace, frame, error) => process.stderr.write(`EV3 ${frame.type.toString(16)} ${trace.map(x => x.op).join(',')} ${error || ''}\n`),
            onTelegram: (t, r) => process.stderr.write(`NXT ${[...t].map(b => b.toString(16)).join(' ')} -> ${r.status}\n`)} : {};
        registerVirtualClassicPeripheral(profile === 'ev3' ? ev3ClassicPeripheral(() => hub, debug) : nxtClassicPeripheral(() => hub, debug));

        vm = new VM();
        let extension = null;
        const manager = vm.extensionManager;
        const original = manager.loadExtensionURL.bind(manager);
        const bundled = bundledExtensionIds();
        manager.loadExtensionURL = id => {
            if (process.env.BT_HUB_DEBUG) process.stderr.write(`loadExtensionURL ${id}\n`);
            const dir = bundled.get(String(id));
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
        vm.setCompatibilityMode(true);
        vm.runtime.currentStepTime = FRAME_MS;
        let budget = 0;
        vm.runtime.sequencer.timer = new Timer({now: () => budget++});

        let connectError = null;
        if (connect) {
            try {
                await connectVirtualBtHub({vm, extensionId, peripheralId: profile === 'ev3' ? EV3_PERIPHERAL_ID : NXT_PERIPHERAL_ID,
                    wait: ms => clock.advance(ms)});
            } catch (error) {
                connectError = error;
            }
            await clock.advance(100);
        }
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
            if (stopWhen && stopWhen(point, track, hub)) break;
        }
        return {track, hub, session, vm, extension, connectError};
    } finally {
        try { if (vm) { vm.stopAll(); vm.quit(); } } catch { /* noop */ }
        session?.dispose();
        clearVirtualClassicPeripheralsForTest();
        globalThis.WebSocket = savedWebSocket;
        clock.uninstall();
    }
}
