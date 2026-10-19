// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab chunk's single entry (webpackChunkName "bw-sim-lab"): the pane
// imports this module dynamically, so three.js, the part catalog and the scene
// code are downloaded when a learner first opens the Sim Lab and never before
// (scripts/verify-boot-payload.mjs holds that). Jolt's WebAssembly is further
// still: the physics worker (its own chunk) loads it, and the main thread only
// when it has to run the physics itself (physics/jolt-core.js loadJolt).
// Bundling parts.json here is the one place a JSON module is imported; the
// pieces below stay loadable by node --test on their own.
//
// The catalogue comes in two pieces (webpack.config.js's parts-subset-loader):
// `?core`, the hand-made parts — every shipped model, the motors, hubs and
// sensors — rides in this chunk; `?derived`, the 200-odd System and Technic parts
// scripts/derive-part-meta.mjs measured from LDraw, is its own chunk
// ("bw-sim-parts"), fetched when Build (the palette) first opens or a model names
// a part the core lacks (catalogFor). Both land in the one CATALOG Map.

import CORE_PARTS from './part-meta/parts.json?core';
import {catalogFrom} from './sim-session.js';
import {createLazyCatalog} from './model/lazy-catalog.js';
import {PhysicsClient} from './physics/physics-client.js';

export {SimSession, prepareModel, MODELS, MODELS_BASE, PROGRAMS_BASE} from './sim-session.js';
export {SimLabClock} from './sim-clock.js';
export {isPortPart} from './contracts.js';
export {fetchLDrawClosure, LDRAW_BASE} from './ldraw/ldraw-fetch.js';
export {connectVirtualSpike} from '../virtual-hub/connect-virtual-spike.js';
export {createSimView3D, WebGLUnavailableError, webglAvailable} from './view/sim-view3d.js';
export {openFirmwareRoute, desktopRenodeCapabilities, lockstepAvailable, firmwareRouteReady, compileRouteProgram} from './routes/renode-lockstep/index.js';
export {createEditor, partsByIdOf} from './editor/editor-state.js';
export {colorPalette, rotationToDegrees, degreesToRotation} from './editor/editor-parity.js';
export {selectionPivot} from './editor/transform-math.js';
export {createEditorView3D, DEFAULT_COLOR} from './editor/editor-view3d.js';
export {snapCandidates, pairedParts} from './editor/snap.js';
export {paletteFrom, searchPalette, pushRecent, partNumber} from './editor/palette.js';
export {createPartThumbnails} from './view/part-thumbnails.js';
export {serializeModel, parseModel} from './model/ldraw-model.js';
export {openModelFile, saveModelFile, mergeImportIssues, OPEN_ACCEPT, SAVE_FORMATS} from './model/model-file.js';
export {modelInsight, insightOf, portItems, runBlockers} from './mech/insight.js';
export {parseLDConfig} from './view/ldraw-colors.js';
export {MATS, createMat, ovalCentreAt, distanceToOvalCentre} from './world/mats.js';
export {buildSteps, stepView, partsList} from './instructions/steps.js';
export {instructionsPrintHtml} from './instructions/print-page.js';
export {createInstructionsView, INSTRUCTIONS_TESTID, HIGHLIGHT as INSTRUCTIONS_HIGHLIGHT} from './view/instructions-view.js';

const parts = createLazyCatalog({
    core: catalogFrom(CORE_PARTS),
    loadRest: () => import(/* webpackChunkName: "bw-sim-parts" */ './part-meta/parts.json?derived').then(m => catalogFrom(m.default || m))
});
/** The part catalogue: the core at first, every part once loadFullCatalog has run (it fills this Map in place). */
export const CATALOG = parts.catalog;
/** Loads the rest of the catalogue into CATALOG, once: Build (the palette) calls it when it opens. */
export const loadFullCatalog = parts.loadFullCatalog;
/** CATALOG holding every part an LDraw text names (the rest loaded first when one is not in the core). */
export const catalogFor = parts.catalogFor;

/**
 * Starts physics-worker.js in a Web Worker (webpack emits it as its own chunk, and
 * Jolt with it), or returns null where there are no workers (node, an old browser):
 * the Sim Lab then runs its physics on the main thread (sim-session.js).
 */
const startPhysicsWorker = () => {
    if (typeof Worker !== 'function') return null;
    try {
        return new Worker(/* webpackChunkName: "bw-sim-physics-worker" */ new URL('./physics-worker.js', import.meta.url));
    } catch (_) {
        return null;
    }
};

/**
 * The physics worker for the pane's sessions (SimSession.fromText's `worker`), or null
 * where there are no Web Workers: the physics then runs on the main thread.
 */
export const startPhysicsClient = () => {
    const worker = startPhysicsWorker();
    return worker ? new PhysicsClient(worker) : null;
};
