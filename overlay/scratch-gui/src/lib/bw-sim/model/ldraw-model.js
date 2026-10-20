// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LDraw model reader/writer for the PlacedModel contract.
// Pure text <-> PlacedModel, no DOM. Handles .ldr and .mpd (first FILE is
// main, type-1 lines referencing other FILE sections are flattened with
// composed transforms). Generates refusals for lossy or malformed lines.
// `0 STEP` lines in the main model become `model.steps` (part ids per building
// step, for instructions/steps.js); a model without them has no `steps` key and
// is written back exactly as before.
//
// Limits, so a hostile or broken file is refused by name rather than hanging the
// page: sub-models nest at most MAX_DEPTH deep (`too-deep`), a model flattens to at
// most MAX_PARTS parts (`too-many-parts`: nothing is opened), and a coordinate
// beyond MAX_COORDINATE LDU is `out-of-range`. A part matrix must be a rotation
// (orthonormal, determinant +1); a mirrored, scaled or sheared one is `bad-matrix`.

import {det3} from '../contracts.js';

/** Port ids a `0 !BW PORT` line may name: hub output letters, and the numbered inputs of the RCX (1–3) and NXT/EV3 (1–4). */
const HUB_PORTS = new Set(['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3', '4']);

/** Deepest sub-model nesting opened (main model = 0). */
export const MAX_DEPTH = 32;
/** Most parts a model may flatten to: ten times the 2,054-part stress model, already far beyond what Build and the physics handle. */
export const MAX_PARTS = 20000;
/** Largest coordinate accepted, in LDU (400 m). */
export const MAX_COORDINATE = 1e6;

/** LDraw's "main colour": a part in it takes the colour its sub-model is placed in. */
const MAIN_COLOUR = 16;
/** First LDraw direct colour (0x2RRGGBB), written in hex as LDraw requires. */
const DIRECT_COLOUR = 0x2000000;
/** An LDraw number: decimal, optional sign, fraction and exponent (no hex, no NaN/Infinity). */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/** Normalize LDraw filename: lower case, forward slashes. */
const normalizeFile = s => s.trim().replace(/\\/g, '/').toLowerCase();

/** Format a number for LDraw: integers without decimal, others up to 6 decimals, never -0. */
const formatNumber = n => {
    if (Object.is(n, -0)) n = 0;
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) < 1e-9) return String(rounded);
    let s = n.toFixed(6);
    s = s.replace(/\.?0+$/, '');
    if (s === '-0') s = '0';
    return s;
};

/** Largest |R·Rᵀ − I| entry a matrix may have and still be read as a rotation. */
const ROTATION_TOLERANCE = 0.02;
/** Below this, a rotation is kept exactly as written (it is one to the precision files carry). */
const ROTATION_EXACT = 1e-5;

/** The largest entry of |R·Rᵀ − I|. */
const orthoError = m => {
    let worst = 0;
    for (let r = 0; r < 3; r++) {
        for (let c = r; c < 3; c++) {
            const dot = m[r * 3] * m[c * 3] + m[r * 3 + 1] * m[c * 3 + 1] + m[r * 3 + 2] * m[c * 3 + 2];
            worst = Math.max(worst, Math.abs(dot - (r === c ? 1 : 0)));
        }
    }
    return worst;
};

/**
 * Whether a matrix is a proper rotation: positive determinant and orthonormal rows within
 * ROTATION_TOLERANCE. Files written with three decimals (MLCad: 0.674 -0.738 …) are off by
 * about 1e-3; a mirror (det −1), a scale or a shear (which can have determinant 1) is not.
 */
const isProperRotation = m => m.every(Number.isFinite) && det3(m) > 0 && orthoError(m) <= ROTATION_TOLERANCE;

/**
 * The rotation a file meant: as written when it is one to ROTATION_EXACT (so our own files read
 * back unchanged), else the nearest rotation (polar decomposition, R ← (R + R⁻ᵀ)/2).
 */
const asRotation = m => {
    if (orthoError(m) <= ROTATION_EXACT) return m;
    let r = m;
    for (let k = 0; k < 8 && orthoError(r) > 1e-12; k++) {
        const d = det3(r);
        // R⁻ᵀ = cofactor matrix / det.
        const cof = [
            r[4] * r[8] - r[5] * r[7], r[5] * r[6] - r[3] * r[8], r[3] * r[7] - r[4] * r[6],
            r[2] * r[7] - r[1] * r[8], r[0] * r[8] - r[2] * r[6], r[1] * r[6] - r[0] * r[7],
            r[1] * r[5] - r[2] * r[4], r[2] * r[3] - r[0] * r[5], r[0] * r[4] - r[1] * r[3]
        ];
        r = r.map((v, i) => (v + cof[i] / d) / 2);
    }
    return r;
};

/** Whether every coordinate is within MAX_COORDINATE. */
const inRange = v => v.every(x => Math.abs(x) <= MAX_COORDINATE);

/** A colour as LDraw writes it: a direct colour as 0x2RRGGBB, any other as its decimal code. */
const formatColour = c => (Number.isInteger(c) && c >= DIRECT_COLOUR ? `0x${c.toString(16).toUpperCase()}` : String(c));

/** Matrix multiply 3x3 row-major: a * b */
const matMul = (a, b) => [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
];

/** Mat3 * Vec3 */
const matVec = (m, v) => [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

/**
 * Parse a type-1 line into {color, position, rotation, file} or null if not type-1.
 * Returns {color, position:[x,y,z], rotation:[a..i], file} or {error}
 */
const parseType1 = line => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('1')) return null;
    const tokens = trimmed.split(/\s+/);
    if (tokens[0] !== '1') return null;
    if (tokens.length < 15) return {error: 'too few tokens'};
    const colorStr = tokens[1].trim();
    let color;
    if (/^0x[0-9a-f]{1,8}$/i.test(colorStr)) {
        color = Number.parseInt(colorStr, 16);
    } else if (/^\d{1,9}$/.test(colorStr)) {
        color = Number.parseInt(colorStr, 10);
    } else {
        return {error: 'bad color'};
    }
    if (!tokens.slice(2, 14).every(s => NUMBER.test(s))) return {error: 'bad numbers'};
    const nums = tokens.slice(2, 14).map(Number);
    if (nums.some(n => !Number.isFinite(n))) return {error: 'bad numbers'};
    const fileRaw = tokens.slice(14).join(' ').trim();
    if (!fileRaw) return {error: 'missing file'};
    return {
        color,
        position: nums.slice(0, 3),
        rotation: nums.slice(3, 12),
        fileRaw,
        file: normalizeFile(fileRaw),
    };
};

/**
 * Every file name a model's type-1 lines refer to (normalised as parseModel looks them up in
 * the catalog: trimmed, forward slashes, lower case) — parts and an MPD's own sub-models alike.
 * The pane asks this before parsing, to load the rest of the part catalogue when a name is not
 * in the part of it already loaded (sim-lab.js catalogFor).
 * @param {string} text LDraw
 * @returns {Set<string>}
 */
export const referencedFiles = text => {
    const out = new Set();
    for (const line of text.split(/\r?\n/)) {
        const parsed = parseType1(line);
        if (parsed && !parsed.error) out.add(parsed.file);
    }
    return out;
};

/**
 * Parse LDraw text into PlacedModel and refusals.
 * @param {string} text
 * @param {{catalog?: Map|object}} opts
 * @returns {{model: {version:number, parts:Array}, refusals:Array}}
 */
export const parseModel = (text, {catalog} = {}) => {
    const catalogMap = catalog instanceof Map ? catalog : (catalog && typeof catalog === 'object' ? new Map(Object.entries(catalog)) : null);
    const refusals = [];
    const parts = [];

    // Split lines preserving line numbers, handle CRLF/LF
    const rawLines = text.split(/\r?\n/);
    // We need to handle that text may end with CRLF, split will produce trailing empty string — keep it but ignore empty lines later
    // Detect MPD: any line matching /^0\s+FILE\s+/i
    const hasMpd = rawLines.some(l => /^\s*0\s+FILE\s+/i.test(l));

    const fileSections = new Map();
    /** A FILE section; the first of two with one name wins (as in LDraw editors). */
    const addSection = (name, lines) => {
        const key = normalizeFile(name);
        if (fileSections.has(key)) return;
        const org = lines.map(l => /^\s*0\s+!LDRAW_ORG\s+(\S+)/i.exec(l.text)).find(Boolean);
        const isPart = org ? /^(?:Unofficial_)?(?:Part|Subpart|Primitive|8_Primitive|48_Primitive|Shortcut)\b/i.test(org[1]) :
            /\.dat$/.test(key);
        fileSections.set(key, {name, lines, isPart});
    };
    let mainLines = [];
    let firstFileName = null;

    if (hasMpd) {
        // Parse MPD sections
        let currentFile = null;
        let currentLines = [];
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const lineNo = i + 1;
            const trimmed = line.trim();
            const fileMatch = trimmed.match(/^0\s+FILE\s+(.+?)\s*$/i);
            if (fileMatch) {
                if (currentFile !== null) {
                    addSection(currentFile, currentLines);
                }
                currentFile = fileMatch[1].trim();
                if (!firstFileName) firstFileName = currentFile;
                currentLines = [];
                continue;
            }
            const noFileMatch = /^0\s+NOFILE\s*$/i.test(trimmed);
            if (noFileMatch) {
                if (currentFile !== null) {
                    addSection(currentFile, currentLines);
                    currentFile = null;
                    currentLines = [];
                }
                continue;
            }
            if (currentFile !== null) {
                currentLines.push({text: line, lineNo});
            } else {
                // Lines before first FILE are ignored (MPD header)
            }
        }
        if (currentFile !== null) {
            addSection(currentFile, currentLines);
        }
        if (firstFileName) {
            const mainSec = fileSections.get(normalizeFile(firstFileName));
            mainLines = mainSec ? mainSec.lines : [];
        }
    } else {
        // Single model: all lines are main
        mainLines = rawLines.map((text, idx) => ({text, lineNo: idx + 1}));
    }

    // Helper to check if file is sub-model (exists in fileSections)
    // An embedded part (a `.dat` section, or one whose `!LDRAW_ORG` says Part, Subpart,
    // Primitive or Shortcut: the MPD way to ship an unofficial part) is a part, not a sub-model:
    // placed as the catalog's part of that name, or refused once as unknown — never opened up
    // into the primitives it is drawn from.
    const isSubModel = file => fileSections.has(file) && !fileSections.get(file).isPart;

    // State for main model
    let pendingPort = null; // string or null
    let pendingId = null;
    let pendingGroup = null; // groupId or null
    const seenIds = new Set();
    // Ids the main model gives explicitly: a generated id (p<n>) never takes one of them.
    const reservedIds = new Set();
    for (const {text: line} of mainLines) {
        const m = /^\s*0\s+!BW\s+ID\s+(.+?)\s*$/i.exec(line);
        if (m) reservedIds.add(m[1]);
    }
    let nextId = 1;
    const generatedId = () => {
        let id;
        do id = `p${nextId++}`; while (seenIds.has(id) || reservedIds.has(id));
        return id;
    };
    const groupsById = new Map(); // id -> {id, name, parts: []}
    const groupOrder = []; // to preserve order
    const belts = []; // `0 !BW BELT id band part…` lines, checked against the parts at the end
    const partToGroup = new Map(); // partId -> groupId (for checking duplicate part in two groups)
    // Building steps: `0 STEP` (or `0 ROTSTEP …`) in the main model ends a step (instructions/steps.js).
    const steps = [];
    let stepParts = [];
    let sawStep = false;
    // Work done flattening sub-models (lines visited), bounded so a sub-model placing another
    // twice, 30 levels deep, is refused rather than expanded to a billion parts.
    let work = 0;
    let overflow = false;
    const WORK_LIMIT = 4 * MAX_PARTS;

    /** The placement of a type-1 line inside a parent placed at (parentPos, parentRot). */
    const compose = (parentPos, parentRot, parsed) => {
        const offset = matVec(parentRot, parsed.position);
        return {
            position: [parentPos[0] + offset[0], parentPos[1] + offset[1], parentPos[2] + offset[2]],
            rotation: matMul(parentRot, parsed.rotation),
        };
    };

    /**
     * The leaf parts of sub-model `subFileName` placed at (parentPos, parentRot) in colour
     * `parentColor` (a part in colour 16 inside it takes that colour). `path` is the line
     * numbers (1-based within each section) of the instances leading here, for the ids;
     * `visited` the sub-models on the way down (a sub-model inside itself is a cycle). The
     * parts are appended to `result`.
     */
    const flattenSubModel = (subFileName, parentPos, parentRot, parentColor, path, visited, depth, result) => {
        const norm = normalizeFile(subFileName);
        const sec = fileSections.get(norm);
        if (!sec) return result;
        let localPendingPort = null;
        let localPendingId = null;
        for (let i = 0; i < sec.lines.length; i++) {
            if (overflow) return result;
            if (++work > WORK_LIMIT) {
                overflow = true;
                return result;
            }
            const {text: line, lineNo} = sec.lines[i];
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (/^0\s+!BW\s+PORT\s+/i.test(trimmed)) {
                const m = trimmed.match(/^0\s+!BW\s+PORT\s+(.+?)\s*$/i);
                const val = m ? m[1].trim() : '';
                if (!HUB_PORTS.has(val)) {
                    refusals.push({line: lineNo, code: 'bad-port', message: `Bad port '${val}' at line ${lineNo}`});
                    localPendingPort = null;
                } else {
                    localPendingPort = val;
                }
                continue;
            }
            if (/^0\s+!BW\s+ID\s+/i.test(trimmed)) {
                const m = trimmed.match(/^0\s+!BW\s+ID\s+(.+?)\s*$/i);
                const val = m ? m[1].trim() : '';
                if (!val) {
                    refusals.push({line: lineNo, code: 'unparsable', message: `Bad ID at line ${lineNo}`});
                    localPendingId = null;
                } else {
                    localPendingId = val;
                }
                continue;
            }
            const parsed = parseType1(line);
            if (parsed && !parsed.error) {
                const pendingPortHere = localPendingPort;
                const pendingIdHere = localPendingId;
                localPendingPort = null;
                localPendingId = null;
                if (!isProperRotation(parsed.rotation)) {
                    refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                    continue;
                }
                parsed.rotation = asRotation(parsed.rotation);
                const placed = compose(parentPos, parentRot, parsed);
                if (!inRange(parsed.position) || !inRange(placed.position)) {
                    refusals.push({line: lineNo, code: 'out-of-range', message: `Line ${lineNo} places something more than ${MAX_COORDINATE} LDU away`});
                    continue;
                }
                const color = parsed.color === MAIN_COLOUR ? parentColor : parsed.color;
                if (isSubModel(parsed.file)) {
                    // A nested sub-model: its own port/id lines do not apply to its parts.
                    if (visited.has(parsed.file)) {
                        refusals.push({line: lineNo, code: 'cycle', message: `Cycle detected at '${parsed.fileRaw}'`});
                        continue;
                    }
                    if (depth + 1 > MAX_DEPTH) {
                        refusals.push({line: lineNo, code: 'too-deep', message: `Line ${lineNo} nests sub-models more than ${MAX_DEPTH} deep`});
                        continue;
                    }
                    // `path` and `visited` are the way down: extended for the call, restored after.
                    path.push(i + 1);
                    visited.add(parsed.file);
                    flattenSubModel(parsed.file, placed.position, placed.rotation, color, path, visited, depth + 1, result);
                    visited.delete(parsed.file);
                    path.pop();
                    continue;
                }
                if (catalogMap && !catalogMap.has(parsed.file)) {
                    refusals.push({line: lineNo, code: 'unknown-part', message: `Unknown part '${parsed.fileRaw}' at line ${lineNo}`});
                    continue;
                }
                // Id: an explicit !BW ID (once), else one from the path of instances.
                let id = `${norm}#${path.join('_')}_${i + 1}`;
                if (pendingIdHere && !seenIds.has(pendingIdHere)) {
                    id = pendingIdHere;
                } else if (pendingIdHere) {
                    refusals.push({line: lineNo, code: 'duplicate-id', message: `Duplicate id '${pendingIdHere}' at line ${lineNo}`, parts: [id]});
                }
                while (seenIds.has(id) || reservedIds.has(id)) id = `${id}'`;
                seenIds.add(id);
                const part = {id, part: parsed.file, color, position: placed.position, rotation: placed.rotation};
                if (pendingPortHere) part.port = pendingPortHere;
                result.push(part);
                if (parts.length + result.length > MAX_PARTS) {
                    overflow = true;
                    return result;
                }
            } else if (/^[2-5]\s/.test(trimmed)) {
                // Loose geometry inside a sub-model: drawn by the sub-model, not a part (ignored).
                continue;
            } else if (trimmed.startsWith('0')) {
                // Other meta or comment (0 FILE/NOFILE do not reach here).
                continue;
            } else {
                refusals.push({line: lineNo, code: 'unparsable', message: `Unparsable line ${lineNo}: ${trimmed}`});
                localPendingPort = null;
                localPendingId = null;
            }
        }
        return result;
    };

    const mainName = firstFileName ? normalizeFile(firstFileName) : null;
    /** A main-model line was not placed: what was pending for it does not pass to the next part. */
    const dropPending = () => {
        pendingPort = null;
        pendingId = null;
        pendingGroup = null;
    };

    // Process main model lines
    for (let idx = 0; idx < mainLines.length && !overflow; idx++) {
        const {text: line, lineNo} = mainLines[idx];
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (/^0\s+(?:STEP|ROTSTEP)(?:\s|$)/i.test(trimmed)) {
            if (stepParts.length) steps.push(stepParts);
            stepParts = [];
            sawStep = true;
            continue;
        }
        // Check for !BW PORT
        if (/^0\s+!BW\s+PORT\s+/i.test(trimmed)) {
            const m = trimmed.match(/^0\s+!BW\s+PORT\s+(.+?)\s*$/i);
            const val = m ? m[1].trim() : '';
            if (!HUB_PORTS.has(val)) {
                refusals.push({line: lineNo, code: 'bad-port', message: `Bad port '${val}' at line ${lineNo}`});
                pendingPort = null;
            } else {
                pendingPort = val;
            }
            continue;
        }
        if (/^0\s+!BW\s+ID\s+/i.test(trimmed)) {
            const m = trimmed.match(/^0\s+!BW\s+ID\s+(.+?)\s*$/i);
            const val = m ? m[1].trim() : '';
            if (!val) {
                refusals.push({line: lineNo, code: 'unparsable', message: `Bad ID at line ${lineNo}`});
                pendingId = null;
            } else {
                pendingId = val;
            }
            continue;
        }
        if (/^0\s+!BW\s+BELT(\s|$)/i.test(trimmed)) {
            const words = trimmed.split(/\s+/).slice(3);
            if (words.length < 4) refusals.push({line: lineNo, code: 'bad-belt', message: `Bad BELT at line ${lineNo}`});
            else belts.push({line: lineNo, id: words[0], band: words[1], around: words.slice(2)});
            continue;
        }
        if (/^0\s+!BW\s+GROUP(\s|$)/i.test(trimmed)) {
            const m = trimmed.match(/^0\s+!BW\s+GROUP\s+(\S+)\s+(.+?)\s*$/i);
            if (!m) {
                refusals.push({line: lineNo, code: 'bad-group', message: `Bad GROUP at line ${lineNo}`});
            } else {
                const gid = m[1].trim();
                const gname = m[2].trim();
                if (!gid || !gname) {
                    refusals.push({line: lineNo, code: 'bad-group', message: `Bad GROUP at line ${lineNo}`});
                } else if (groupsById.has(gid)) {
                    refusals.push({line: lineNo, code: 'duplicate-group', message: `Duplicate group '${gid}' at line ${lineNo}`});
                } else {
                    const g = {id: gid, name: gname, parts: []};
                    groupsById.set(gid, g);
                    groupOrder.push(gid);
                }
            }
            continue;
        }
        if (/^0\s+!BW\s+IN(\s|$)/i.test(trimmed)) {
            const m = trimmed.match(/^0\s+!BW\s+IN\s+(\S+)\s*$/i);
            if (!m) {
                refusals.push({line: lineNo, code: 'bad-group', message: `Bad IN at line ${lineNo}`});
                pendingGroup = null;
            } else {
                const gid = m[1].trim();
                if (!groupsById.has(gid)) {
                    refusals.push({line: lineNo, code: 'unknown-group', message: `Unknown group '${gid}' at line ${lineNo}`});
                    pendingGroup = null;
                } else {
                    pendingGroup = gid;
                }
            }
            continue;
        }
        const parsed = parseType1(line);
        if (parsed && !parsed.error) {
            if (!isProperRotation(parsed.rotation)) {
                refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                dropPending();
                continue;
            }
            parsed.rotation = asRotation(parsed.rotation);
            if (!inRange(parsed.position)) {
                refusals.push({line: lineNo, code: 'out-of-range', message: `Line ${lineNo} places something more than ${MAX_COORDINATE} LDU away`});
                dropPending();
                continue;
            }
            if (isSubModel(parsed.file)) {
                // A sub-model instance is not a part: the port, id and group meant for it do not
                // pass to its parts (they get ids from their path) nor to the next part.
                dropPending();
                if (parsed.file === mainName) {
                    refusals.push({line: lineNo, code: 'cycle', message: `Cycle detected at '${parsed.fileRaw}'`});
                    continue;
                }
                const subParts = flattenSubModel(parsed.file, parsed.position, parsed.rotation, parsed.color, [idx + 1],
                    new Set([mainName, parsed.file]), 1, []);
                for (const p of subParts) {
                    parts.push(p);
                    stepParts.push(p.id);
                }
                continue;
            }
            if (catalogMap && !catalogMap.has(parsed.file)) {
                refusals.push({line: lineNo, code: 'unknown-part', message: `Unknown part '${parsed.fileRaw}' at line ${lineNo}`});
                dropPending();
                continue;
            }
            if (++work > WORK_LIMIT) {
                overflow = true;
                break;
            }
            // Determine id
            let id;
            if (pendingId && !seenIds.has(pendingId)) {
                id = pendingId;
            } else {
                id = generatedId();
                if (pendingId) refusals.push({line: lineNo, code: 'duplicate-id', message: `Duplicate id '${pendingId}' at line ${lineNo}`, parts: [id]});
            }
            seenIds.add(id);
            const part = {id, part: parsed.file, color: parsed.color, position: parsed.position, rotation: parsed.rotation};
            if (pendingPort) part.port = pendingPort;
            if (pendingGroup) {
                const g = groupsById.get(pendingGroup);
                if (partToGroup.has(id)) {
                    refusals.push({line: lineNo, code: 'bad-group', message: `Part '${id}' is in two groups at line ${lineNo}`, parts: [id]});
                } else {
                    g.parts.push(id);
                    partToGroup.set(id, pendingGroup);
                }
            }
            pendingPort = null;
            pendingId = null;
            pendingGroup = null;
            parts.push(part);
            stepParts.push(id);
            continue;
        }
        if (/^[2-5]\s/.test(trimmed)) {
            refusals.push({line: lineNo, code: 'loose-geometry', message: `Loose geometry at line ${lineNo}`});
            dropPending();
            continue;
        }
        // Any other meta or comment (0 Name, 0 Author, …) is ignored and leaves what is pending
        // for the next part: `0 !BW PORT` applies to the next type-1 line.
        if (trimmed.startsWith('0')) continue;
        refusals.push({line: lineNo, code: 'unparsable', message: `Unparsable line ${lineNo}: ${trimmed}`});
        dropPending();
    }

    if (overflow || parts.length > MAX_PARTS) {
        // Not half a model: nothing is opened, and the one note says why.
        return {
            model: {version: 1, parts: []},
            refusals: [{line: 0, code: 'too-many-parts', message: `The model has more than ${MAX_PARTS} parts (sub-models included)`}]
        };
    }

    const model = {version: 1, parts};
    if (groupOrder.length > 0) {
        model.groups = groupOrder.map(gid => groupsById.get(gid));
        // Remove empty groups (should not happen, but for safety, filter out groups with 0 parts? But spec says groups with <2 dissolve, but parser should keep whatever was defined, even if empty, and let validator catch it)
        // We keep all groups as defined, even if empty, so that malformed ones are visible
    }
    if (belts.length) {
        // A rubber band round a part the file does not have, or a second band with one id, is not opened.
        const ids = new Set(parts.map(p => p.id));
        const kept = [];
        for (const b of belts) {
            const missing = b.around.filter(id => !ids.has(id));
            if (missing.length) refusals.push({line: b.line, code: 'bad-belt', message: `Rubber band '${b.id}' goes round unknown parts ${missing.join(', ')}`, parts: missing});
            else if (kept.some(k => k.id === b.id)) refusals.push({line: b.line, code: 'bad-belt', message: `Duplicate rubber band '${b.id}' at line ${b.line}`});
            else kept.push({id: b.id, band: b.band, around: b.around});
        }
        if (kept.length) model.belts = kept;
    }
    if (sawStep) {
        // Parts after the last STEP line are the last step; steps with no parts are dropped.
        if (stepParts.length) steps.push(stepParts);
        if (steps.length) model.steps = steps;
    }
    return {model, refusals};
};

/**
 * Serialize a PlacedModel to LDraw text.
 * @param {{version:number, parts:Array}} model
 * @param {{name?:string, title?:string}} opts
 * @returns {string} LDraw text with CRLF
 */
export const serializeModel = (model, {name = 'model.ldr', title = 'Brickwright model'} = {}) => {
    const lines = [];
    lines.push(`0 ${title}`);
    lines.push(`0 Name: ${name}`);
    lines.push(`0 Author: Brickwright`);
    lines.push(`0 !LDRAW_ORG Unofficial_Model`);
    // Groups: output 0 !BW GROUP lines first
    if (model.groups) {
        for (const g of model.groups) {
            // Escape name? For now, just output as is, but need to handle that name may contain spaces, we output as is
            lines.push(`0 !BW GROUP ${g.id} ${g.name}`);
        }
    }
    // Rubber bands (no LDraw part draws a stretched one): one line each, round parts written below.
    for (const b of model.belts || []) lines.push(`0 !BW BELT ${b.id} ${b.band} ${b.around.join(' ')}`);
    // Build a map from part id to group id for quick lookup
    const partGroupMap = new Map();
    if (model.groups) {
        for (const g of model.groups) {
            for (const pid of g.parts) partGroupMap.set(pid, g.id);
        }
    }
    // Building steps: a `0 STEP` line after each step's last part (only for a model that has steps,
    // so a model without them is written exactly as before).
    const stepOf = new Map();
    if (Array.isArray(model.steps) && model.steps.length) {
        model.steps.forEach((ids, n) => { for (const id of ids) if (!stepOf.has(id)) stepOf.set(id, n); });
    }
    let previousStep;
    for (const p of model.parts) {
        if (stepOf.size) {
            const step = stepOf.has(p.id) ? stepOf.get(p.id) : -1;
            if (previousStep !== undefined && step !== previousStep) lines.push('0 STEP');
            previousStep = step;
        }
        lines.push(`0 !BW ID ${p.id}`);
        const gid = partGroupMap.get(p.id);
        if (gid) lines.push(`0 !BW IN ${gid}`);
        if (p.port) lines.push(`0 !BW PORT ${p.port}`);
        const x = formatNumber(p.position[0]);
        const y = formatNumber(p.position[1]);
        const z = formatNumber(p.position[2]);
        const a = formatNumber(p.rotation[0]);
        const b = formatNumber(p.rotation[1]);
        const c = formatNumber(p.rotation[2]);
        const d = formatNumber(p.rotation[3]);
        const e = formatNumber(p.rotation[4]);
        const f = formatNumber(p.rotation[5]);
        const g = formatNumber(p.rotation[6]);
        const h = formatNumber(p.rotation[7]);
        const i = formatNumber(p.rotation[8]);
        const color = formatColour(p.color ?? MAIN_COLOUR);
        lines.push(`1 ${color} ${x} ${y} ${z} ${a} ${b} ${c} ${d} ${e} ${f} ${g} ${h} ${i} ${p.part}`);
    }
    if (stepOf.size && previousStep !== undefined) lines.push('0 STEP');
    return lines.join('\r\n') + '\r\n';
};
