// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// One Sim Lab run: LDraw text → PlacedModel (model/ldraw-model.js) →
// CompiledMechanism (mech/compile.js) → physics core (physics/jolt-core.js) →
// the virtual SPIKE hub (hub-bridge.js). The Sim Lab pane owns one session
// at a time; everything here is DOM-free so the same sequence runs headless
// in tests.
//
// What the user sees as a list is collected, never thrown away (the repo's
// "refusals are listed" rule): model refusals (an unknown part, loose
// geometry, a mirrored part) and compiler diagnostics (a motor without a
// port, an unsupported gear) both end up in `issues`.
//
// v1 runs the physics core on the main thread: the reference driving base
// steps in well under a millisecond per 5 ms of simulated time. The worker
// (physics/physics-worker.js) replaces it once the scene grows.

import {parseModel} from './model/ldraw-model.js';
import {compile} from './mech/compile.js';
import {loadJolt, createPhysicsCore} from './physics/jolt-core.js';
import {SimHubBridge, STEP_MS} from './hub-bridge.js';
import {createMat} from './world/mats.js';
import {placeOnStart, driveAnchor} from './world/place.js';

/**
 * The part catalog from part-meta/parts.json's parsed content. The caller
 * imports the JSON (webpack bundles it into the Sim Lab chunk; tests read the
 * file), so this module stays loadable by node --test without JSON modules.
 */
export const catalogFrom = partsJson => new Map(partsJson.parts.map(p => [p.part, p]));

/**
 * Reference models shipped in static/sim-lab/models/ (file name → titles). A model
 * may name an example program in static/sim-lab/programs/ (DEVICE SPIKE text) and
 * the mat it is meant for: the pane offers to load it into the Code tab.
 */
export const MODELS = Object.freeze([
    {file: 'driving-base.ldr', title: {en: 'SPIKE driving base', de: 'SPIKE-Fahrbasis'}},
    {file: 'line-follower.ldr', title: {en: 'Line follower', de: 'Linienfolger'},
        example: 'line-follower.bw', mat: 'line-oval'}
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
        issues.push({severity: 'error', code: 'empty-model', message: 'The model has no parts the Sim Lab knows.'});
        return {model, runModel: model, mechanism: null, issues};
    }
    const matDef = mat ? createMat(mat) : null;
    const start = matDef ? matDef.startPose : null;
    const runModel = start ? placeOnStart(model, start, driveAnchor(model, catalog)) : model;
    // A mat's obstacles (a wall) are static bodies of the scene, compiled with the model.
    const mechanism = compile(runModel, catalog, matDef ? {mat, ...(matDef.obstacles.length ? {obstacles: matDef.obstacles} : {})} : {});
    issues.push(...mechanism.diagnostics);
    const motors = mechanism.joints.filter(j => j.motor).length;
    if (motors === 0) {
        issues.push({severity: 'warning', code: 'no-motor', message: 'No motor is connected to a hub port, so nothing will move on its own.'});
    }
    return {model, runModel, mechanism, issues};
};

/** The body that carries the SPIKE hub (its pose is the IMU), or null. */
export const hubBodyOf = (model, mechanism, catalog) => {
    const hubIds = new Set(model.parts.filter(p => catalog.get(p.part)?.hub).map(p => p.id));
    return mechanism.bodies.find(b => b.parts.some(id => hubIds.has(id)))?.id ?? null;
};

export class SimSession {
    /**
     * @param {object} options
     * @param {object} options.hubState a VirtualSpikeHubState (shared with the arena and the program routes)
     * @param {object} options.model a PlacedModel
     * @param {object} options.mechanism its CompiledMechanism
     * @param {Map} options.catalog part catalog (catalogFrom(parts.json))
     * @param {object} options.J the Jolt namespace (loadJolt())
     */
    constructor ({hubState, model, runModel = model, mechanism, catalog, mat = null, J}) {
        this.model = model;
        /** The model where it stands on the mat — what the physics runs and the view draws. */
        this.runModel = runModel;
        this.mat = mat;
        this.mechanism = mechanism;
        this.core = createPhysicsCore(J, mechanism, {stepHz: 1000 / STEP_MS});
        const hubBody = hubBodyOf(model, mechanism, catalog);
        // Without a hub there is nothing to drive, but the model still falls and settles.
        this.bridge = hubBody ? new SimHubBridge({hubState, core: this.core, mechanism, hubBody}) : null;
        this.time = 0;
    }

    /** Builds a session from LDraw text; resolves to {session, issues} or {session: null, issues}. */
    static async fromText (text, {hubState, catalog, mat = null}) {
        const {model, runModel, mechanism, issues} = prepareModel(text, catalog, {mat});
        if (!mechanism) return {session: null, issues, model, runModel};
        const J = await loadJolt();
        return {session: new SimSession({hubState, model, runModel, mechanism, catalog, mat, J}), issues, model, runModel};
    }

    /** Advance by ms of simulated time (fixed 5 ms steps inside). */
    tick (ms) {
        if (this.bridge) this.bridge.tick(ms);
        else this.core.step(ms / 1000);
        this.time += ms;
    }

    snapshot () { return this.core.snapshot(); }

    dispose () {
        this.bridge?.dispose();
        this.core.destroy();
    }
}
