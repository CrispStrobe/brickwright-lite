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

import {parseModel} from './model/ldraw-model.js';
import {compile} from './mech/compile.js';
import {mechanismIssues} from './mech/insight.js';
import {loadJolt, createPhysicsCore} from './physics/jolt-core.js';
import {SimHubBridge, HubReplay, STEP_MS} from './hub-bridge.js';
import {MirrorCore} from './sim-worker-protocol.js';
import {hubRegistry} from './hubs/index.js';
import {upgradePartMeta, partHubProfile} from './contracts.js';
import {createMat} from './world/mats.js';
import {placeOnStart, driveAnchor} from './world/place.js';

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
 * may name an example program in static/sim-lab/programs/ (DEVICE SPIKE text) and
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
        example: 'sumo.bw', mat: 'sumo'}
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
 * @param {{mat?: string}} [options] a mat id (bw-sim/world/mats.js): the floor shows it, the colour
 *        sensor reads it, a mat with a start pose gets the model placed on that pose, and a mat's
 *        obstacles (a wall) become static bodies the robot and the distance sensor meet
 * @returns {{model, runModel, mechanism, issues}} `model` is the model as authored (what Build edits
 *          and the project saves); `runModel` is where it stands on the mat (what is simulated and drawn)
 */
export const prepareModel = (text, catalog, {mat = null} = {}) => {
    const {model, refusals} = parseModel(text, {catalog});
    const issues = refusals.map(r => ({severity: 'warning', ...r}));
    if (model.parts.length === 0) {
        issues.push({severity: 'error', code: 'empty-model', message: 'The model has no parts the Sim Lab knows.', parts: []});
        return {model, runModel: model, mechanism: null, issues};
    }
    const matDef = mat ? createMat(mat) : null;
    const start = matDef ? matDef.startPose : null;
    const runModel = start ? placeOnStart(model, start, driveAnchor(model, catalog)) : model;
    // A mat's obstacles (a wall) are static bodies of the scene, compiled with the model.
    const mechanism = compile(runModel, catalog, {version: 2, ...(matDef ? {mat, ...(matDef.obstacles.length ? {obstacles: matDef.obstacles} : {})} : {})});
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
export const hubsOf = (model, mechanism, catalog) => {
    const hubParts = new Map(model.parts.filter(p => partHubProfile(catalog.get(p.part))).map(p => [p.id, partHubProfile(catalog.get(p.part))]));
    const body = mechanism.bodies.find(b => b.parts.some(id => hubParts.has(id)));
    if (!body) return [];
    const id = body.parts.find(partId => hubParts.has(partId));
    return [{id, profile: hubParts.get(id), body: body.id}];
};

/** The body that carries the (first) hub, or null. */
export const hubBodyOf = (model, mechanism, catalog) => hubsOf(model, mechanism, catalog)[0]?.body ?? null;

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
     */
    constructor ({hubState, model, runModel = model, mechanism, catalog, mat = null, J = null, worker = null, loaded = null,
        registry = hubRegistry}) {
        this.model = model;
        /** The model where it stands on the mat — what the physics runs and the view draws. */
        this.runModel = runModel;
        this.mat = mat;
        this.mechanism = mechanism;
        this.hubState = hubState;
        /** [{id, profile, body, hub}]: the model's hubs, each a VirtualHub (hubs/hub-profile.js). */
        this.hubs = hubsOf(model, mechanism, catalog).map(h => ({...h, hub: registry.create(h.profile, {id: h.id, hubState})}));
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
        }
    }

    /**
     * Builds a session from LDraw text; resolves to {session, issues} or {session: null, issues}.
     * With `worker` (a PhysicsClient) the physics runs there; if the worker cannot load the
     * scene, it runs on this thread and `session.workerError` says why.
     */
    static async fromText (text, {hubState, catalog, mat = null, worker = null, registry = hubRegistry}) {
        const {model, runModel, mechanism, issues} = prepareModel(text, catalog, {mat});
        if (!mechanism) return {session: null, issues, model, runModel};
        let workerError = null;
        if (worker) {
            try {
                const loaded = await worker.simLoad({mechanism, hubs: hubsOf(model, mechanism, catalog), stepMs: STEP_MS});
                return {session: new SimSession({hubState, model, runModel, mechanism, catalog, mat, worker, loaded, registry}), issues, model, runModel};
            } catch (error) {
                workerError = error.message || String(error);
            }
        }
        const J = await loadJolt();
        const session = new SimSession({hubState, model, runModel, mechanism, catalog, mat, J, registry});
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
        if (this.bridge) this.bridge.tick(ms);
        else this.core.step(ms / 1000);
        this.time += ms;
        this._advanced();
    }

    /** Resolves when every tick so far has reached the hub (at once on this thread). */
    idle () {
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

    dispose () {
        this._disposed = true;
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
