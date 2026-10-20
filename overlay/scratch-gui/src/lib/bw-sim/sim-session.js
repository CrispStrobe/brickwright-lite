// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// One Sim Lab run: LDraw text → PlacedModel (model/ldraw-model.js) →
// CompiledMechanism (mech/compile.js) → physics core (physics/jolt-core.js) →
// the model's hub, as a VirtualHub of its family (hubs/, through the port
// boundary in hub-bridge.js). The Sim Lab pane owns one session
// at a time; everything here is DOM-free so the same sequence runs headless
// in tests.
//
// What the user sees as a list is collected, never thrown away (the repo's
// "refusals are listed" rule): model refusals (an unknown part, loose
// geometry, a mirrored part) and compiler diagnostics (a motor without a
// port, an unsupported gear) both end up in `issues`.
//
// Where the physics runs (ROADMAP §4.9, docs/SIM-LAB-PLAN.md "§4.9 The physics
// worker"): given a PhysicsClient for physics/physics-worker.js, in that Web
// Worker — the hubs and their controllers stay here, and each tick's
// steps come back as frames the hubs replay (sim-worker-protocol.js);
// otherwise (node, no Worker, the worker could not load Jolt) on the main
// thread, as before. Both give the same numbers; `worker` says which one runs.
//
// A scene with a NON-REWINDABLE hub (exportState().nonRewindable: an emulated
// firmware, hubs/spike/spike-firmware-hub.js) never goes to the worker — a
// batch there may be redone from a Jolt checkpoint, and an emulator cannot be
// rewound (docs/ROBOT-LAB-SPIKE-EMULATION.md §2.3, owner answer Q1/D3). It
// runs on this thread through the lockstep runner (routes/renode-lockstep/
// runner.js), one physics step per exchange; `lockstep` says so, and
// `realTimeFactor` how fast the emulator lets simulated time go.

import {autoPorts} from './hubs/auto-ports.js';
import {parseModel} from './model/ldraw-model.js';
import {compile} from './mech/compile.js';
import {mechanismIssues} from './mech/insight.js';
import {loadJolt, createPhysicsCore} from './physics/jolt-core.js';
import {SimHubBridge, HubReplay, STEP_MS} from './hub-bridge.js';
import {MirrorCore} from './sim-worker-protocol.js';
import {hubRegistry, LAB_DIRECT_ID} from './hubs/index.js';
import {upgradePartMeta, partHubProfile} from './contracts.js';
import {createMat} from './world/mats.js';
import {placeOnStart, driveAnchor} from './world/place.js';
import {LockstepRunner, isNonRewindable, L3_HUB_NEEDS_LOCKSTEP} from './routes/renode-lockstep/runner.js';

/**
 * The part catalog from part-meta/parts.json's parsed content. The caller
 * imports the JSON (webpack bundles it into the Sim Lab chunk; tests read the
 * file), so this module stays loadable by node --test without JSON modules.
 * Every entry comes out as PartMeta v2: a v1 file (a user's catalog, an old
 * fixture) is upgraded entry by entry (contracts.js upgradePartMeta).
 */
export const catalogFrom = partsJson => new Map(partsJson.parts.map(p => [p.part, upgradePartMeta(p)]));

/**
 * Reference models shipped in static/sim-lab/models/ (file name → titles). A model
 * may name an example program in static/sim-lab/programs/ (DEVICE SPIKE text; for the
 * RCX, NQC source `.nqc`; DEVICE EV3 text; legonxt blocks `.blocks.json`) and
 * the mat it is meant for: the pane offers to load it into the Code tab.
 */
export const MODELS = Object.freeze([
    {file: 'driving-base.ldr', title: {en: 'SPIKE driving base', de: 'SPIKE-Fahrbasis'}},
    {file: 'line-follower.ldr', title: {en: 'Line follower', de: 'Linienfolger'},
        example: 'line-follower.bw', mat: 'line-oval'},
    {file: 'wall-stopper.ldr', title: {en: 'Wall stopper', de: 'Wandstopper'},
        example: 'wall-stopper.bw', mat: 'wall'},
    {file: 'colour-explorer.ldr', title: {en: 'Colour explorer', de: 'Farbentdecker'},
        example: 'colour-explorer.bw', mat: 'colour-zones'},
    // The same robot a second time, with its Sumo program: `id` keys the entry (the pane lists by it).
    {id: 'sumo', file: 'colour-explorer.ldr', title: {en: 'Sumo ring', de: 'Sumo-Ring'},
        example: 'sumo.bw', mat: 'sumo'},
    {file: 'forklift.ldr', title: {en: 'Forklift', de: 'Gabelstapler'},
        example: 'forklift.bw', mat: 'warehouse'},
    {file: 'maze-runner.ldr', title: {en: 'Maze runner', de: 'Labyrinth-Läufer'},
        example: 'maze.bw', mat: 'maze'},
    // Gear mechanics (docs/ROBOT-LAB-ARCHITECTURE.md §1.2): a shifting gearbox and a differential, on a stand.
    {file: 'gearbox.ldr', title: {en: 'Two-speed gearbox', de: 'Zweigang-Schaltgetriebe'},
        example: 'gearbox.bw'},
    {file: 'differential.ldr', title: {en: 'Differential', de: 'Differenzialgetriebe'},
        example: 'differential.bw'},
    // Flexible parts (docs/ROBOT-LAB-UX.md §11): a chain from the motor's 8T to a 24T.
    {file: 'chain-drive.ldr', title: {en: 'Chain drive', de: 'Kettenantrieb'},
        example: 'chain-drive.bw'},
    // Pneumatics v1 (docs/ROBOT-LAB-UX.md §16): motor A turns a valve's lever; hoses feed a cylinder.
    {file: 'pneumatic-press.ldr', title: {en: 'Pneumatic cylinder', de: 'Pneumatikzylinder'},
        example: 'pneumatic-press.bw'},
    // Pen and paper (architecture M15): the driving base, its castor ball a pen.
    {file: 'drawing-robot.ldr', title: {en: 'Drawing robot', de: 'Malroboter'},
        example: 'drawing-robot.bw', mat: 'plain'},
    {file: 'excavator.ldr', title: {en: 'Excavator', de: 'Bagger'},
        example: 'excavator.bw', mat: 'plain'},
    // The LEGO MINDSTORMS RCX (hubs/rcx/, docs/ROBOT-LAB-RCX.md): its examples are NQC (`.nqc`), compiled
    // by nqc-wasm and downloaded to the Lab's RCX, where the clean-room bytecode VM runs them.
    {file: 'rcx-bumper-car.ldr', title: {en: 'RCX bumper car', de: 'RCX-Rempelauto'},
        example: 'rcx-bumper-car.nqc', mat: 'wall'},
    {id: 'rcx-line-follower', file: 'rcx-bumper-car.ldr', title: {en: 'RCX line follower', de: 'RCX-Linienfolger'},
        example: 'rcx-line-follower.nqc', mat: 'line-oval'},
    // MINDSTORMS EV3 and NXT (hubs/ev3/, hubs/nxt/, docs/ROBOT-LAB-EV3-NXT.md): their blocks reach the
    // Lab's brick as direct commands over the Scratch Link BT-classic registry. The EV3's example is
    // DEVICE EV3 text (the ev3comprehensive blocks); the NXT's, legonxt blocks (`.blocks.json`: a
    // sprite's script, added to the editing sprite) — the NXT has no DEVICE words yet.
    {file: 'ev3-wall-stopper.ldr', title: {en: 'EV3 wall stopper', de: 'EV3-Wandstopper'},
        example: 'ev3-wall-stopper.bw', mat: 'wall'},
    {file: 'nxt-bumper-bot.ldr', title: {en: 'NXT bumper bot', de: 'NXT-Rempelroboter'},
        example: 'nxt-bumper-bot.blocks.json', mat: 'wall'},
    // No hub at all: the Robot Lab's own lab-direct hub owns the motor, and its example steers it
    // with `lab` words (docs/SIM-LAB.md "Steering the Lab").
    {file: 'motor-bench.ldr', title: {en: 'Motor bench (no hub)', de: 'Motorprüfstand (ohne Hub)'},
        example: 'motor-bench.bw'},
    // LEGO radio hubs (hubs/lwp3, hubs/wedo2; docs/LWP3-VIRTUAL-HUB-NOTES.md): their examples are written in the
    // pup / boost / wedo words (lib/legoHubsDialect.js), which ⇦ To blocks turns into the real LEGO extensions'
    // blocks; Run connects those blocks to the scene's hub over Web Bluetooth or Scratch Link.
    {file: 'technic-hub-bench.ldr', title: {en: 'Technic Hub motor bench (Powered Up)', de: 'Technic-Hub-Motorprüfstand (Powered Up)'},
        example: 'technic-hub-bench.bw'},
    {file: 'boost-rover.ldr', title: {en: 'BOOST rover (Move Hub)', de: 'BOOST-Rover (Move Hub)'},
        example: 'boost-rover.bw', mat: 'plain'},
    {file: 'wedo-milo.ldr', title: {en: 'WeDo 2.0 rover with motion sensor', de: 'WeDo-2.0-Rover mit Bewegungssensor'},
        example: 'wedo-milo.bw', mat: 'wall'}
]);
export const MODELS_BASE = 'static/sim-lab/models/';
export const PROGRAMS_BASE = 'static/sim-lab/programs/';

/**
 * Parse and compile LDraw text. Never throws for bad user input: problems
 * come back in `issues`, and `mechanism` is null when nothing can run.
 * @returns {{model: object, mechanism: object|null, issues: {severity: string, code: string, message: string, line?: number}[]}}
 */
/**
 * @param {string} text LDraw
 * @param {Map} catalog
 * @param {{mat?: string, autoPorts?: boolean}} [options] autoPorts (default: a file from elsewhere, one without our
 *        `0 Author: Brickwright`): unplugged motors and sensors go into free ports (hubs/auto-ports.js), in the model
 *        itself, so Build shows them and a port the builder takes out later stays out; mat: a mat id (bw-sim/world/mats.js): the floor shows it, the colour
 *        sensor reads it, a mat with a start pose gets the model placed on that pose, and a mat's
 *        obstacles (a wall) become static bodies the robot and the distance sensor meet
 * @returns {{model, runModel, mechanism, issues}} `model` is the model as authored (what Build edits
 *          and the project saves); `runModel` is where it stands on the mat (what is simulated and drawn)
 */
/** A file we wrote ourselves (serializeModel's header): its ports are as the builder left them, unplugged ones too. */
const OWN_FILE = /^0 Author: Brickwright\s*$/m;

export const prepareModel = (text, catalog, {mat = null, autoPorts: plugIn = !OWN_FILE.test(text)} = {}) => {
    const {model: parsedModel, refusals} = parseModel(text, {catalog});
    const issues = refusals.map(r => ({severity: 'warning', ...r}));
    if (parsedModel.parts.length === 0) {
        issues.push({severity: 'error', code: 'empty-model', message: 'The model has no parts the Sim Lab knows.', parts: []});
        return {model: parsedModel, runModel: parsedModel, mechanism: null, issues};
    }
    const matDef = mat ? createMat(mat) : null;
    const start = matDef ? matDef.startPose : null;
    // Motors and sensors the file left unplugged go into the hub's free ports (hubs/auto-ports.js).
    const {model: wired, plugged} = plugIn ? autoPorts(parsedModel, catalog, hubRegistry) : {model: parsedModel, plugged: []};
    const model = wired;
    if (plugged.length) {
        issues.push({severity: 'info', code: 'ports-plugged', parts: plugged.map(p => p.part),
            message: `Plugged in: ${plugged.map(p => `${p.part} → ${p.port}`).join(', ')}`});
    }
    const runModel = start ? placeOnStart(wired, start, driveAnchor(wired, catalog)) : wired;
    // A mat's obstacles (a wall) are static bodies of the scene, compiled with the model.
    // ...and its loads (a pallet: world/objects.js) dynamic bodies the model moves by contact.
    const mechanism = compile(runModel, catalog, {version: 2, ...(matDef ? {mat, ...(matDef.obstacles.length ? {obstacles: matDef.obstacles} : {}),
        ...(matDef.loads.length ? {loads: matDef.loads} : {})} : {})});
    issues.push(...mechanismIssues(mechanism));
    return {model, runModel, mechanism, issues};
};

/**
 * The model's hubs as the bridge and the worker take them: [{id, profile, body}] — the
 * hub part's id, its family's profile id (PartMeta v2 `hubProfile`; a v1 hub part: its
 * `hub.profile`, else SPIKE Prime) and the body that carries it (its pose is the IMU).
 * The scene still runs ONE: the hub on the first body that has one (CompiledMechanism
 * v2's hubs[0]). The data carries every hub and each binding's {hub, port}, and the
 * bridge binds several hubs by those (hub-bridge.js hubBindings); running a model's
 * second hub is the multi-hub slice's (R16: a hub picker, a route per hub).
 */
export const hubsOf = (model, mechanism, catalog, {all = false} = {}) => {
    // Every hub (CompiledMechanism v2 hubs[], in body order) when the caller runs several.
    if (all && Array.isArray(mechanism.hubs) && mechanism.hubs.length) {
        return mechanism.hubs.map(h => ({id: h.id, profile: h.profile, body: h.body}));
    }
    // The first hub of CompiledMechanism v2 (the body that carries its housing: a hub with built-in
    // motors, the BOOST Move Hub, is a part of its output bodies too).
    if (Array.isArray(mechanism.hubs) && mechanism.hubs.length) {
        const h = mechanism.hubs[0];
        return [{id: h.id, profile: h.profile, body: h.body}];
    }
    const hubParts = new Map(model.parts.filter(p => partHubProfile(catalog.get(p.part))).map(p => [p.id, partHubProfile(catalog.get(p.part))]));
    const body = mechanism.bodies.find(b => b.parts.some(id => hubParts.has(id)));
    if (!body) return [];
    const id = body.parts.find(partId => hubParts.has(partId));
    return [{id, profile: hubParts.get(id), body: body.id}];
};

/**
 * The hubs a scene runs: the model's (hubsOf), or — for a model with motors or sensors and
 * no hub part — the Robot Lab's own `lab-direct` hub (hubs/lab-direct), which owns them all so
 * blocks, `lab` words and Python/JS can turn them directly through the same port boundary.
 * Its pose is not an IMU (nothing reads it): it rides on the first moving body.
 */
export const sceneHubDefs = (model, mechanism, catalog, {all = false, registry = hubRegistry} = {}) => {
    const defs = hubsOf(model, mechanism, catalog, {all});
    if (defs.length || !registry.has('lab-direct')) return defs;
    const wired = mechanism.joints.some(j => j.motor) || (mechanism.sensors || []).length > 0;
    if (!wired) return [];
    const body = (mechanism.bodies.find(b => b.motion === 'dynamic') || mechanism.bodies[0]).id;
    return [{id: LAB_DIRECT_ID, profile: 'lab-direct', body}];
};

/** The body that carries the (first) hub, or null. */
export const hubBodyOf = (model, mechanism, catalog) => hubsOf(model, mechanism, catalog)[0]?.body ?? null;

/**
 * The scene's hubs as VirtualHubs: `createHub(def)` may supply one (an emulated
 * firmware's, say; it returns null to take the family's default), and the default
 * adapters wrap `hubState` — which only one hub of a scene can do.
 */
const makeHubs = ({defs, registry, hubState, createHub}) => {
    let shared = false;
    return defs.map((h, index) => {
        // The Robot Lab's own hub wraps no hub state and is no firmware's to emulate.
        if (h.profile === 'lab-direct') return {...h, hub: registry.create(h.profile, {id: h.id})};
        const made = createHub ? createHub({...h, index}) : null;
        if (made) return {...h, hub: made};
        if (shared) throw new Error(`hub '${h.id}': two hubs of a scene cannot share one hub state`);
        shared = true;
        return {...h, hub: registry.create(h.profile, {id: h.id, hubState})};
    });
};

/**
 * At most this much simulated time per worker batch. When the worker cannot keep up
 * with real time, the rest is dropped (stats.droppedMs) — as the pane's frame clamp
 * (MAX_FRAME_MS) drops it on the main thread — instead of piling up as lag.
 */
export const MAX_BATCH_STEPS = 20;

export class SimSession {
    /**
     * @param {object} options
     * @param {object} options.hubState the hub's state (SPIKE: a VirtualSpikeHubState, shared with the arena
     *        and the program routes), wrapped by its family's VirtualHub adapter
     * @param {object} [options.registry] the hub registry (default: the built-in families)
     * @param {object} options.model a PlacedModel
     * @param {object} options.mechanism its CompiledMechanism
     * @param {Map} options.catalog part catalog (catalogFrom(parts.json))
     * @param {object} [options.J] the Jolt namespace (loadJolt()): the physics runs on this thread
     * @param {object} [options.worker] a PhysicsClient whose worker has loaded this mechanism
     *        (simLoad), with `loaded` its reply: the physics runs in the worker
     * @param {Function} [options.createHub] ({id, profile, body, index}) => a VirtualHub for that hub,
     *        or null for its family's default adapter on `hubState`. Given, the session runs EVERY
     *        hub of the model (CompiledMechanism v2 hubs[]); absent, the first only (as before R13)
     * @param {object[]} [options.hubs] the hubs, already made (fromText makes them to decide on the worker)
     */
    constructor ({hubState, model, runModel = model, mechanism, catalog, mat = null, J = null, worker = null, loaded = null,
        registry = hubRegistry, createHub = null, hubs: made = null}) {
        this.model = model;
        /** The model where it stands on the mat — what the physics runs and the view draws. */
        this.runModel = runModel;
        this.mat = mat;
        this.mechanism = mechanism;
        /** The part catalogue the model was compiled with (the Robot Lab API reads part kinds from it). */
        this.catalog = catalog;
        this.hubState = hubState;
        /** [{id, profile, body, hub}]: the model's hubs, each a VirtualHub (hubs/hub-profile.js). */
        this.hubs = made || makeHubs({defs: sceneHubDefs(model, mechanism, catalog, {all: Boolean(createHub), registry}), registry, hubState, createHub});
        /** A hub of the scene cannot be rewound: in-thread, one step per lockstep exchange. */
        this.lockstep = this.hubs.some(({hub}) => isNonRewindable(hub));
        if (worker && this.lockstep) {
            throw new Error(`${L3_HUB_NEEDS_LOCKSTEP}: a scene with an emulated hub runs its physics on the main thread, not in the worker`);
        }
        const hubs = this.hubs.map(({hub, body}) => ({hub, body}));
        this.time = 0;
        this.listeners = new Set();
        /** Why a worker was offered but the physics runs here (fromText), or null. */
        this.workerError = null;
        this.worker = Boolean(worker);
        if (worker) {
            this.client = worker;
            this.scene = loaded.scene;
            this.core = new MirrorCore(mechanism, loaded);
            this.bridge = hubs.length ? new HubReplay({hubs, mechanism, readings: loaded.readings || {}}) : null;
            this._steps = 0;
            this._ticks = [];
            this._pendingMs = 0;
            this._inFlight = null;
            this._idle = [];
            /** Round trips, work in the worker, redone batches, replay divergences (always 0), dropped time. */
            this.stats = {batches: 0, steps: 0, redos: 0, diverged: 0, droppedMs: 0,
                roundTripMs: 0, maxRoundTripMs: 0, workerMs: 0, mainMs: 0};
            this.failed = null;
        } else {
            this.core = createPhysicsCore(J, mechanism, {stepHz: 1000 / STEP_MS});
            // Without a hub there is nothing to drive, but the model still falls and settles.
            this.bridge = hubs.length ? new SimHubBridge({hubs, core: this.core, mechanism}) : null;
            this.failed = null;
            if (this.lockstep) {
                this.runner = new LockstepRunner({bridge: this.bridge, hubs: this.hubs.map(({hub}) => hub),
                    onAdvance: runner => { this.time = runner.stats.simulatedMs; this._advanced(); },
                    onFail: error => { this.failed = error; }});
                this.stats = this.runner.stats;
            }
        }
    }

    /**
     * Builds a session from LDraw text; resolves to {session, issues} or {session: null, issues}.
     * With `worker` (a PhysicsClient) the physics runs there; if the worker cannot load the
     * scene, it runs on this thread and `session.workerError` says why.
     */
    static async fromText (text, {hubState, catalog, mat = null, worker = null, registry = hubRegistry, createHub = null}) {
        const {model, runModel, mechanism, issues} = prepareModel(text, catalog, {mat});
        if (!mechanism) return {session: null, issues, model, runModel};
        let workerError = null;
        const defs = sceneHubDefs(model, mechanism, catalog, {all: Boolean(createHub), registry});
        const hubs = makeHubs({defs, registry, hubState, createHub});
        if (worker && hubs.some(({hub}) => isNonRewindable(hub))) {
            // Refused, not failed: the worker stays usable for the next scene.
            workerError = `${L3_HUB_NEEDS_LOCKSTEP}: an emulated hub cannot be rewound, so this scene runs on the main thread`;
            worker = null;
        }
        if (worker) {
            try {
                const loaded = await worker.simLoad({mechanism, hubs: defs, stepMs: STEP_MS});
                return {session: new SimSession({hubState, model, runModel, mechanism, catalog, mat, worker, loaded, registry, hubs}), issues, model, runModel};
            } catch (error) {
                workerError = error.message || String(error);
            }
        }
        const J = await loadJolt();
        const session = new SimSession({hubState, model, runModel, mechanism, catalog, mat, J, registry, hubs});
        session.workerError = workerError;
        return {session, issues, model, runModel};
    }

    /**
     * Advance by ms of simulated time (fixed 5 ms steps inside). On this thread the steps
     * run now; with the worker they are sent as one batch and reach the hub, `time` and
     * the poses when it comes back (idle() waits for that).
     */
    tick (ms) {
        if (this.worker) {
            if (this._disposed || this.failed) return;
            this._pendingMs += ms;
            if (this.bridge) this._steps += this.bridge.due(ms);
            else this._ticks.push(ms);
            this._send();
            return;
        }
        if (this.runner) {
            this.runner.tick(ms);
            return;
        }
        if (this.bridge) this.bridge.tick(ms);
        else this.core.step(ms / 1000);
        this.time += ms;
        this._advanced();
    }

    /** Resolves when every tick so far has reached the hub (at once on this thread). */
    idle () {
        if (this.runner) return this.runner.idle();
        if (!this.worker || (!this._inFlight && !this._due())) return Promise.resolve();
        return new Promise((resolve, reject) => this._idle.push({resolve, reject}));
    }

    /** Calls fn() each time simulated time advances (after the hub has the new step). Returns an unsubscribe. */
    onAdvance (fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    _advanced () {
        for (const fn of [...this.listeners]) fn(this);
    }

    _due () {
        return this.bridge ? this._steps > 0 : this._ticks.length > 0;
    }

    _send () {
        if (this._inFlight || this._disposed || this.failed) return;
        if (!this._due()) {
            // Ticks too short for a step still count as simulated time, as on this thread.
            if (this._pendingMs > 0 && !this._inFlight) { this.time += this._pendingMs; this._pendingMs = 0; this._advanced(); }
            this._settle();
            return;
        }
        let ms = this._pendingMs;
        const batch = {};
        if (this.bridge) {
            let steps = this._steps;
            if (steps > MAX_BATCH_STEPS) {
                this.stats.droppedMs += (steps - MAX_BATCH_STEPS) * STEP_MS;
                steps = MAX_BATCH_STEPS;
                ms = steps * STEP_MS;
            }
            this._steps = 0;
            const hubs = this._exportHubs();
            Object.assign(batch, {steps, hubs, key: this._hubsKey(hubs)});
        } else {
            batch.ticks = this._ticks;
            this._ticks = [];
        }
        this._pendingMs = 0;
        batch.ms = ms;
        this._post(batch, false);
    }

    _post (batch, redo) {
        const sent = this._inFlight = {batch, at: now()};
        this.client.simBatch({scene: this.scene, steps: batch.steps, ticks: batch.ticks, hubs: batch.hubs, redo}).then(
            reply => { if (this._inFlight === sent) this._receive(sent, reply); },
            error => { if (this._inFlight === sent) this._fail(error); });
    }

    _receive (sent, reply) {
        if (this._disposed) return;
        const start = now();
        const {batch} = sent;
        const stats = this.stats;
        const roundTrip = start - sent.at;
        stats.roundTripMs += roundTrip;
        stats.maxRoundTripMs = Math.max(stats.maxRoundTripMs, roundTrip);
        stats.workerMs += reply.workMs || 0;
        if (this.bridge) {
            // Something set a motor while the batch was in flight: in-thread, that command
            // would have reached the hub before these steps. Redo them from the worker's
            // checkpoint with the hubs as they are now.
            const hubs = this._exportHubs();
            const key = this._hubsKey(hubs);
            if (key !== batch.key) {
                stats.redos++;
                Object.assign(batch, {hubs, key});
                stats.mainMs += now() - start;
                this._post(batch, true);
                return;
            }
            stats.diverged += this.bridge.replay(reply.frames);
        }
        this.core.update(reply);
        stats.batches++;
        stats.steps += batch.steps || 0;
        this.time += batch.ms;
        this._inFlight = null;
        stats.mainMs += now() - start;
        this._advanced();
        this._send();
    }

    /** Every hub's exportState(), by hub id (what a batch carries to the worker's mirrors). */
    _exportHubs () {
        const out = {};
        for (const {id, hub} of this.hubs) out[id] = hub.exportState();
        return out;
    }

    /** One comparable key for all hubs' states: equal keys, identical drives. */
    _hubsKey (states) {
        return this.hubs.map(({id, hub}) => hub.stateKey(states[id])).join('\n');
    }

    _settle () {
        if (this._inFlight || this._due()) return;
        const waiting = this._idle;
        this._idle = [];
        for (const w of waiting) w.resolve();
    }

    _fail (error) {
        this.failed = error;
        this._inFlight = null;
        const waiting = this._idle;
        this._idle = [];
        for (const w of waiting) w.reject(error);
        if (typeof console !== 'undefined') console.error('Sim Lab physics worker:', error);
    }

    snapshot () { return this.core.snapshot(); }

    /** Lockstep scenes: simulated ms per wall ms lately (null before it is measured, or without lockstep). */
    get realTimeFactor () {
        return this.runner ? this.runner.realTimeFactor : null;
    }

    dispose () {
        this._disposed = true;
        this.runner?.dispose();
        this.bridge?.dispose();
        if (this.worker) {
            this.client.simDispose(this.scene).catch(() => {});
            this._inFlight = null;
            this._steps = 0;
            this._ticks = [];
            this._settle();
        } else this.core.destroy();
    }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
