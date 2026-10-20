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
//
// Beyond those, any part of the whole LDraw catalogue can be added (the palette's
// "+"): fetched from the ldraw-stl mirror (ldraw/ldraw-catalog.js), derived in a
// worker (part-meta/catalog-parts.js), kept on this device and put in the same
// CATALOG. BW_REMOTE_PARTS_POLICY=deny (webpack.config.js) builds an app without it.

import CORE_PARTS from './part-meta/parts.json?core';
import {catalogFrom} from './sim-session.js';
import {createLazyCatalog} from './model/lazy-catalog.js';
import {PhysicsClient} from './physics/physics-client.js';
import {upgradePartMeta, validatePartMeta} from './contracts.js';
import {BUILTIN_KINDS} from './kinds/index.js';
import {MIN_ENGAGE_LDU} from './kinds/pin-axle.js';
import {referencedFiles} from './model/ldraw-model.js';
import {openLDrawCatalog} from './ldraw/ldraw-catalog.js';
import {fetchLDrawClosure, setLDrawFallback, vendoredFiles} from './ldraw/ldraw-fetch.js';
import {createCatalogPartStore, creditOf} from './part-meta/catalog-store.js';

export {SimSession, prepareModel, MODELS, MODELS_BASE, PROGRAMS_BASE} from './sim-session.js';
export {SimLabClock} from './sim-clock.js';
export {createRobotLabApi} from './api/robot-lab-api.js';
export {isPortPart} from './contracts.js';
export {fetchLDrawClosure, fetchModelDrawing, LDRAW_BASE} from './ldraw/ldraw-fetch.js';
export {connectVirtualSpike} from '../virtual-hub/connect-virtual-spike.js';
// Radio hubs (LWP3, WeDo 2.0): the scene's hubs offered to the LEGO extensions, and the connect that picks one.
export {connectVirtualHub} from '../virtual-hub/connect-virtual-hub.js';
export {registerRobotLabBlePeripherals} from '../virtual-hub/lab-ble-peripherals.js';
export {createSimView3D, WebGLUnavailableError, webglAvailable} from './view/sim-view3d.js';
export {robotLabRcxTarget, ROBOT_LAB_RCX_TARGET} from './hubs/rcx/rcx-lab-target.js';
export {registerRcxTarget, selectRcxTarget, rcxTargetOf, TOWER_TARGET} from '../rcx/rcx-targets.js';
export {ev3ClassicPeripheral, EV3_PERIPHERAL_ID} from './hubs/ev3/ev3-peripheral.js';
export {nxtClassicPeripheral, NXT_PERIPHERAL_ID} from './hubs/nxt/nxt-peripheral.js';
export {registerVirtualClassicPeripheral} from '../virtual-hub/bt-classic-registry.js';
export {vmBlocksOf} from './blocks-example.js';
export {openFirmwareRoute, desktopRenodeCapabilities, lockstepAvailable, firmwareRouteReady, compileRouteProgram} from './routes/renode-lockstep/index.js';
export {createEditor, partsByIdOf} from './editor/editor-state.js';
export {colorPalette, rotationToDegrees, degreesToRotation} from './editor/editor-parity.js';
export {selectionPivot} from './editor/transform-math.js';
export {createEditorView3D, DEFAULT_COLOR} from './editor/editor-view3d.js';
export {snapCandidates, pairedParts} from './editor/snap.js';
export {paletteFrom, searchPalette, searchCatalogue, pushRecent, partNumber} from './editor/palette.js';
export {createPartThumbnails} from './view/part-thumbnails.js';
export {serializeModel, parseModel} from './model/ldraw-model.js';
export {openModelFile, saveModelFile, mergeImportIssues, OPEN_ACCEPT, SAVE_FORMATS} from './model/model-file.js';
export {modelInsight, insightOf, portItems, runBlockers} from './mech/insight.js';
export {parseLDConfig} from './view/ldraw-colors.js';
export {MATS, createMat, ovalCentreAt, distanceToOvalCentre} from './world/mats.js';
export {CHALLENGES, challengesFor, createChallengeRun, betterResult} from './world/challenges.js';
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

// ---- the LDraw catalogue ("+") ----------------------------------------------------

/** Whether this build may fetch parts from the LDraw catalogue (BW_REMOTE_PARTS_POLICY). */
export const CATALOGUE_PARTS = process.env.BW_REMOTE_PARTS_POLICY !== 'deny';
/** The palette category of catalogue parts that connect to nothing (part-meta/catalog-parts.js). */
export const DECORATION = 'decoration';
const DERIVE_TIMEOUT_MS = 20000;
const store = createCatalogPartStore(typeof localStorage === 'undefined' ? null : localStorage);
let catalogue = null;
let vendored = null;

/**
 * Files a catalogue part needs come from the catalogue. The fallback is set only once the
 * catalogue is in use (opened, or parts were added on this device before): a learner who
 * never presses "+" fetches nothing more than before.
 */
const useCatalogueFallback = () => setLDrawFallback({
    get library () { return ldrawCatalogue(); },
    get local () { return (vendored = vendored || vendoredFiles().catch(() => null)); }
});

/** The whole LDraw catalogue (ldraw-stl mirror), opened once. */
export const ldrawCatalogue = () => {
    if (!CATALOGUE_PARTS) return Promise.reject(new Error('this build does not fetch parts from the LDraw catalogue'));
    if (!catalogue) {
        catalogue = openLDrawCatalog();
        catalogue.catch(() => { catalogue = null; }); // a failed open (offline) may be tried again
        useCatalogueFallback();
    }
    return catalogue;
};

// The parts added on this device are in the catalogue from the start (their geometry
// comes from the LDraw catalogue when a model or the palette first needs it).
if (CATALOGUE_PARTS) {
    const added = store.all();
    for (const {part, meta} of added) if (!parts.catalog.has(part)) parts.catalog.set(part, upgradePartMeta(meta));
    if (added.length) useCatalogueFallback();
}

const CHECK = {validate: validatePartMeta, kinds: BUILTIN_KINDS.connectors, minEngage: MIN_ENGAGE_LDU};

/** The deriver (part-meta/catalog-parts.js, with derive.js), loaded the first time a part is added. */
const deriver = () => import(/* webpackChunkName: "bw-sim-catalog-parts" */ './part-meta/catalog-parts.js');

/** catalog-parts.js in a worker, given up after DERIVE_TIMEOUT_MS (inline where there are no workers). */
const deriveCatalogPart = async (part, files) => {
    const read = p => files.get(p.toLowerCase());
    const {catalogPartMeta, decorationMeta} = await deriver();
    let worker = null;
    if (typeof Worker === 'function') {
        try {
            worker = new Worker(/* webpackChunkName: "bw-sim-catalog-worker" */ new URL('./part-meta/catalog-worker.js', import.meta.url));
        } catch (_) {
            worker = null;
        }
    }
    if (!worker) return catalogPartMeta(part, read, CHECK);
    return new Promise(resolve => {
        // A part the deriver cannot finish in time (or that crashes it) is still offered, as decoration.
        const asDecoration = why => {
            worker.terminate();
            let meta = null;
            try { meta = decorationMeta(part, read, (read(`parts/${part.toLowerCase()}`) || '').split(/\r?\n/, 1)[0].replace(/^0\s*/, '')); } catch (_) { meta = null; }
            resolve(meta ? {meta: {...meta, catalogue: true}, decoration: true, why: [why]} : {meta: null, decoration: false, why: [why]});
        };
        const timer = setTimeout(() => asDecoration(`deriving took longer than ${DERIVE_TIMEOUT_MS / 1000} s`), DERIVE_TIMEOUT_MS);
        worker.onmessage = e => {
            clearTimeout(timer);
            if (!e.data.ok) { asDecoration(`the deriver failed: ${e.data.error}`); return; }
            worker.terminate();
            resolve(e.data.result);
        };
        worker.onerror = e => { clearTimeout(timer); asDecoration(`the deriver failed: ${e.message || 'worker error'}`); };
        worker.postMessage({part, files: [...files]});
    });
};

/**
 * Adds one part of the LDraw catalogue to CATALOG (and keeps it on this device).
 * Its LDraw files go into `into` (the editor's file map) BEFORE the part enters CATALOG:
 * the palette draws a new part's picture in the next frame, and a picture drawn
 * without its files would cache an empty geometry (view/part-geometry.js) for good.
 * @param {string} part e.g. '3001.dat'
 * @param {{into?: Map<string, string>}} [options]
 * @returns {Promise<{meta: object, decoration: boolean, why: string[], files: Map<string, string>}>}
 *          `files` is the part's LDraw closure (the pane adds it to the editor's files);
 *          `why` says, for a decoration, why it joins nothing
 */
export const addCatalogPart = async (part, {into = null} = {}) => {
    const lib = await ldrawCatalogue();
    const closure = await fetchLDrawClosure([part]);
    if (!closure.files.has(`parts/${part.toLowerCase()}`)) throw new Error(`${part} is not in the LDraw catalogue`);
    const result = await deriveCatalogPart(part, closure.files);
    if (!result.meta) throw new Error(result.why[0] || `${part} has no geometry`);
    const credits = closure.fromCatalogue.map(p => creditOf(p, closure.files.get(p)));
    store.put(part, {meta: result.meta, decoration: result.decoration, why: result.why, library: lib.tag, credits});
    if (into) for (const [path, text] of closure.files) into.set(path, text);
    parts.catalog.set(part, upgradePartMeta(result.meta));
    return {meta: parts.catalog.get(part), decoration: result.decoration, why: result.why, files: closure.files};
};

/** The parts added from the LDraw catalogue on this device, with the attribution of their files. */
export const catalogueParts = () => (CATALOGUE_PARTS ? store.all() : []);

/** Removes an added part from this device (a model naming it derives it again when opened). */
export const removeCatalogPart = part => {
    store.remove(part);
    parts.catalog.delete(part);
};

/**
 * CATALOG holding every part an LDraw text names: the rest loaded first when one is not in
 * the core, and a part no catalogue piece has is derived from the LDraw catalogue (a model
 * made with an added part, opened on another device). Parts still unknown stay unknown:
 * the session names them.
 */
export const catalogFor = async text => {
    const catalog = await parts.catalogFor(text);
    if (!CATALOGUE_PARTS) return catalog;
    // A part an MPD embeds under its own name ('42099 - 52731.dat', an unofficial copy) is derived as the library
    // part it names (model/ldraw-model.js knownAs then maps the embedded name to it).
    const named = name => /^.+? - (.+\.dat)$/i.exec(name)?.[1].toLowerCase() || name;
    const unknown = [...new Set([...referencedFiles(text)].map(named))].filter(name => !catalog.has(name) && /\.dat$/i.test(name));
    if (!unknown.length) return catalog;
    let lib;
    try {
        lib = await ldrawCatalogue();
    } catch (_) {
        return catalog; // offline: the session reports the parts it cannot find
    }
    // Several at a time (DERIVE_AT_ONCE): one after the other, each part's file waves and its deriver's start-up made a
    // big set wait 9 s of mostly idle time (the 4x4 Off-Roader: 62 parts, 2,400 small requests).
    const todo = unknown.filter(name => lib.has(`parts/${name.toLowerCase()}`));
    let next = 0;
    const lane = async () => {
        while (next < todo.length) {
            const name = todo[next++];
            try {
                await addCatalogPart(name);
            } catch (_) { /* named by the session as an unknown part */ }
        }
    };
    await Promise.all(Array.from({length: Math.min(DERIVE_AT_ONCE, todo.length)}, lane));
    return catalog;
};

/** Parts derived at the same time when a model names several the catalogue lacks: the cores but one, at most 6. */
const DERIVE_AT_ONCE = Math.max(1, Math.min(6, ((globalThis.navigator && globalThis.navigator.hardwareConcurrency) || 2) - 1));

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
