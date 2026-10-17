// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab chunk's single entry (webpackChunkName "bw-sim-lab"): the pane
// imports this module dynamically, so Jolt's WebAssembly, three.js, the part
// catalog and the scene code are downloaded when a learner first opens the
// Sim Lab and never before (scripts/verify-boot-payload.mjs holds that).
// Bundling parts.json here is the one place a JSON module is imported; the
// pieces below stay loadable by node --test on their own.

import PARTS from './part-meta/parts.json';
import {catalogFrom} from './sim-session.js';

export {SimSession, prepareModel, MODELS, MODELS_BASE} from './sim-session.js';
export {fetchLDrawClosure, LDRAW_BASE} from './ldraw/ldraw-fetch.js';
export {connectVirtualSpike} from '../virtual-hub/connect-virtual-spike.js';
export {createSimView3D, WebGLUnavailableError, webglAvailable} from './view/sim-view3d.js';
export {createEditor} from './editor/editor-state.js';
export {createEditorView3D} from './editor/editor-view3d.js';
export {snapCandidates} from './editor/snap.js';
export {paletteFrom} from './editor/palette.js';
export {serializeModel, parseModel} from './model/ldraw-model.js';
export {parseLDConfig} from './view/ldraw-colors.js';

export const CATALOG = catalogFrom(PARTS);
