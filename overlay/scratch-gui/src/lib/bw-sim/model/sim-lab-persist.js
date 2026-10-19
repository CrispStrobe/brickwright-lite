// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The Sim Lab model inside the project file (docs/SIM-LAB-PLAN.md C8, D7).
//
// WHY NOT A NEW ZIP ENTRY
// -----------------------
// D7 says "same persistence trick as the circuit designer", and that trick is
// lib/bw-project-bundle.js: every Brickwright surface is ONE typed section of
// `brickwright/state.json` in the .sb3, mirrored to ONE localStorage key that
// the surface reads on mount and flushes on `bw-project-bundle-collect`. The
// circuit is `bw-circuit-autosave` / `circuit`, the arena sandbox is
// `bw-spike-sandbox-v1` / `spikeArena`. The Sim Lab is this key / `simLab`.
// A parallel entry would need its own load order, rollback, refusal alerts and
// "vanilla project clears it" rule; the bundle already has all four.
//
// WHAT IS STORED
// --------------
// `{ldraw, name?, mat?}`: the model as the LDraw text `serializeModel` writes
// (the format of record; it reopens in LeoCAD and Studio), the model's file
// name (it is written into the text's `0 Name:` line, so it is kept to make
// the round trip byte-exact) and the selected mat id, when there is one.
//
// This module has NO imports on purpose: bw-project-bundle.js validates the
// section with it, and that file is on the first load. The LDraw parser and
// the catalog stay in the lazily loaded Sim Lab chunk.

/** The localStorage key the bundle carries and the Sim Lab pane reads. */
export const SIM_LAB_STORAGE_KEY = 'bw-sim-lab-model-v1';

/** Largest stored record, in UTF-8 bytes of its JSON (the bundle's per-section limit). */
export const SIM_LAB_LIMIT = 1024 * 1024;

/** Mat ids are slugs (world/mats.js: `plain`, `line-oval`, `colour-zones`, `wall`). */
const MAT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
// A name ends up in a `0 Name:` line: one line, no control characters.
// eslint-disable-next-line no-control-regex
const NAME = /^[^\u0000-\u001f\u007f]{1,128}$/;
// A type-1 line places a part. Text without one is not a model.
const PART_LINE = /^[ \t]*1[ \t]/m;

/**
 * Whether a model name can be stored as is (and so reopens with the same `0 Name:` line).
 * @param {*} name
 * @returns {boolean}
 */
export const isStorableName = name => typeof name === 'string' && NAME.test(name);

const utf8Size = value => new TextEncoder().encode(value).byteLength;

/**
 * Validate and normalize a stored Sim Lab record. Unknown fields are dropped
 * (a newer writer may add some); a malformed known field is refused.
 * @param {*} value the decoded `simLab` section
 * @returns {{ldraw: string, name?: string, mat?: string}} the record, keys in a fixed order
 * @throws {Error} naming the first problem, prefixed `simLab`
 */
export const simLabRecord = value => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('simLab must be an object');
    }
    const {ldraw, name, mat} = value;
    if (typeof ldraw !== 'string') throw new Error('simLab.ldraw must be a string');
    if (ldraw.includes('\u0000')) throw new Error('simLab.ldraw contains a NUL byte');
    if (!PART_LINE.test(ldraw)) throw new Error('simLab.ldraw places no part (no type-1 line)');
    if (name !== undefined && !isStorableName(name)) {
        throw new Error('simLab.name must be one line of 1-128 printable characters');
    }
    if (mat !== undefined && (typeof mat !== 'string' || !MAT_ID.test(mat))) {
        throw new Error('simLab.mat must be a mat id (lower-case letters, digits, hyphens)');
    }
    const record = {ldraw};
    if (name !== undefined) record.name = name;
    if (mat !== undefined) record.mat = mat;
    if (utf8Size(JSON.stringify(record)) > SIM_LAB_LIMIT) {
        throw new Error(`simLab exceeds ${SIM_LAB_LIMIT} bytes`);
    }
    return record;
};

/**
 * The record for a model's LDraw text, or null when there is no model to keep
 * (the text places no part). A name that cannot be stored is left out rather
 * than failing the save; a mat id that cannot is a programming error.
 * @param {string} ldraw text from serializeModel
 * @param {{name?: string, mat?: string|null}} [options]
 * @returns {{ldraw: string, name?: string, mat?: string}|null}
 */
export const simLabRecordFromText = (ldraw, {name, mat} = {}) => {
    if (typeof ldraw !== 'string' || !PART_LINE.test(ldraw)) return null;
    const value = {ldraw};
    if (isStorableName(name)) value.name = name;
    if (mat !== undefined && mat !== null) value.mat = mat;
    return simLabRecord(value);
};

/**
 * Read the stored value back. Never throws: a malformed value is a listed
 * refusal (the pane shows it under "Notes about this model") and no record.
 * @param {string|null|undefined} raw the localStorage string
 * @returns {{record: object|null, refusals: {severity: string, code: string, message: string}[]}}
 */
export const readSimLabStorage = raw => {
    if (raw === null || raw === undefined) return {record: null, refusals: []};
    let message;
    try {
        if (typeof raw !== 'string') throw new Error('stored value must be a string');
        return {record: simLabRecord(JSON.parse(raw)), refusals: []};
    } catch (error) {
        message = error.message;
    }
    return {record: null, refusals: [{severity: 'warning', code: 'project-model-unreadable',
        message: `The project's Sim Lab model could not be read: ${message}`}]};
};
