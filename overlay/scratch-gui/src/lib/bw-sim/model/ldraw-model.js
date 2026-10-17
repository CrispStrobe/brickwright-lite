// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// LDraw model reader/writer for the PlacedModel contract.
// Pure text <-> PlacedModel, no DOM. Handles .ldr and .mpd (first FILE is
// main, type-1 lines referencing other FILE sections are flattened with
// composed transforms). Generates refusals for lossy or malformed lines.

import {det3} from '../contracts.js';

const HUB_PORTS = new Set(['A', 'B', 'C', 'D', 'E', 'F']);

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

/** Check if matrix is proper rotation (det ~1). */
const isProperRotation = m => Math.abs(det3(m) - 1) <= 1e-3;

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
    if (/^0x/i.test(colorStr)) {
        color = Number.parseInt(colorStr, 16);
    } else {
        color = Number.parseInt(colorStr, 10);
    }
    if (!Number.isFinite(color)) return {error: 'bad color'};
    const nums = tokens.slice(2, 14).map(s => parseFloat(s));
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

    let fileSections = new Map();
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
                    fileSections.set(normalizeFile(currentFile), {name: currentFile, lines: currentLines});
                }
                currentFile = fileMatch[1].trim();
                if (!firstFileName) firstFileName = currentFile;
                currentLines = [];
                continue;
            }
            const noFileMatch = /^0\s+NOFILE\s*$/i.test(trimmed);
            if (noFileMatch) {
                if (currentFile !== null) {
                    fileSections.set(normalizeFile(currentFile), {name: currentFile, lines: currentLines});
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
            fileSections.set(normalizeFile(currentFile), {name: currentFile, lines: currentLines});
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
    const isSubModel = file => fileSections.has(file);

    // State for main model
    let pendingPort = null; // string or null
    let pendingId = null;
    let pendingGroup = null; // groupId or null
    let seenIds = new Set();
    let nextId = 1;
    const groupsById = new Map(); // id -> {id, name, parts: []}
    const groupOrder = []; // to preserve order
    const partToGroup = new Map(); // partId -> groupId (for checking duplicate part in two groups)

    // For sub-model flattening, we need to track line index path for ids
    // We will define recursive function to flatten a sub-model file
    const flattenSubModel = (subFileName, parentPos, parentRot, path, visited = new Set()) => {
        const norm = normalizeFile(subFileName);
        if (visited.has(norm)) {
            refusals.push({line: 0, code: 'cycle', message: `Cycle detected at '${subFileName}'`});
            return [];
        }
        visited.add(norm);
        const sec = fileSections.get(norm);
        if (!sec) return [];
        const result = [];
        let localPendingPort = null;
        let localPendingId = null;
        let localSeenIds = new Set(); // for duplicate-id within sub-model? But ids for sub-model parts are path-based, not global sequential, so duplicate check is global?
        // For sub-model, we need to iterate its lines and handle similarly, but without generating top-level p<n> ids, instead path-based
        for (let i = 0; i < sec.lines.length; i++) {
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
            if (/^0\s+FILE\s+/i.test(trimmed) || /^0\s+NOFILE\s*$/i.test(trimmed)) {
                continue;
            }
            const parsed = parseType1(line);
            if (parsed && !parsed.error) {
                // Check if this type-1 is itself a sub-model reference (nested MPD)
                if (isSubModel(parsed.file)) {
                    // Recursively flatten nested sub-model
                    const composedPos = [
                        parentPos[0] + matVec(parentRot, parsed.position)[0],
                        parentPos[1] + matVec(parentRot, parsed.position)[1],
                        parentPos[2] + matVec(parentRot, parsed.position)[2],
                    ];
                    // But we need to compose with current parentPos/parentRot: for nested, parentPos/parentRot are the accumulated transform from top-level
                    // Actually flattenSubModel is called with parentPos/parentRot already composed from ancestors, so we need to compose parsed's transform with that
                    const composedPos2 = [
                        parentPos[0] + matVec(parentRot, parsed.position)[0],
                        parentPos[1] + matVec(parentRot, parsed.position)[1],
                        parentPos[2] + matVec(parentRot, parsed.position)[2],
                    ];
                    const composedRot = matMul(parentRot, parsed.rotation);
                    // For nested, path extends: path + [i+1] (1-based line index within this sub-model)
                    const nestedPath = [...path, i + 1];
                    // Pending port/id for sub-model instance should be consumed but not applied to children (ignore)
                    localPendingPort = null;
                    localPendingId = null;
                    // Check bad-matrix for this sub-model instance instance? The instance's matrix should be checked, but we already composed? Actually the instance's rotation det check should be done before flattening: if bad, we should refusal and skip whole sub-model?
                    // Spec says mirrored/scaled matrices become refusals. For sub-model instance, if its matrix is bad, we should refusal that line and not flatten its children.
                    if (!isProperRotation(parsed.rotation)) {
                        refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                        continue;
                    }
                    const nestedParts = flattenSubModel(parsed.file, composedPos2, composedRot, nestedPath, new Set(visited));
                    result.push(...nestedParts);
                    continue;
                }
                // Real part inside sub-model
                // Check bad-matrix for this leaf part's own rotation (before composing?) The leaf part's rotation det should be checked after composing? Actually the leaf part's own rotation is stored, but after composing with parent, the resulting rotation det = det(parent)*det(leaf) = det(leaf) since parent is proper (we already checked parent). So check leaf's rotation det.
                if (!isProperRotation(parsed.rotation)) {
                    refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                    localPendingPort = null;
                    localPendingId = null;
                    continue;
                }
                if (catalogMap && !catalogMap.has(parsed.file) && !isSubModel(parsed.file)) {
                    refusals.push({line: lineNo, code: 'unknown-part', message: `Unknown part '${parsed.fileRaw}' at line ${lineNo}`});
                    localPendingPort = null;
                    localPendingId = null;
                    continue;
                }
                // Compose position/rotation with parent
                const composedPos = [
                    parentPos[0] + matVec(parentRot, parsed.position)[0],
                    parentPos[1] + matVec(parentRot, parsed.position)[1],
                    parentPos[2] + matVec(parentRot, parsed.position)[2],
                ];
                const composedRot = matMul(parentRot, parsed.rotation);
                // Determine id for this flattened leaf: if explicit !BW ID, use it (with duplicate check), else path-based
                let id;
                if (localPendingId) {
                    if (seenIds.has(localPendingId)) {
                        refusals.push({line: lineNo, code: 'duplicate-id', message: `Duplicate id '${localPendingId}' at line ${lineNo}`});
                        id = `${normalizeFile(subFileName)}#${path.join('_')}_${i + 1}`;
                        // Need to ensure this generated id is unique and not duplicate? It should be unique because path is unique.
                    } else {
                        id = localPendingId;
                        seenIds.add(id);
                    }
                    localPendingId = null;
                } else {
                    id = `${normalizeFile(subFileName)}#${path.join('_')}_${i + 1}`;
                    // Ensure uniqueness (if by chance explicit ID used same as path, but path is unique, so fine)
                    // But need to check if this path id already exists (should not, as path is unique)
                    if (seenIds.has(id)) {
                        // Should not happen, but handle
                        refusals.push({line: lineNo, code: 'duplicate-id', message: `Duplicate id '${id}' at line ${lineNo}`});
                        // Generate sequential fallback? But path is deterministic, duplicate means same path used twice (e.g., sub-model placed twice with same path? But each instance has different main line index, so path differs)
                    } else {
                        seenIds.add(id);
                    }
                }
                // Port
                let port;
                if (localPendingPort) {
                    port = localPendingPort;
                    localPendingPort = null;
                }
                const part = {id, part: parsed.file, color: parsed.color, position: composedPos, rotation: composedRot};
                if (port) part.port = port;
                result.push(part);
                // Clear pending after use (already cleared)
                localPendingPort = null;
                localPendingId = null;
            } else if (trimmed.startsWith('2 ') || trimmed.startsWith('3 ') || trimmed.startsWith('4 ') || trimmed.startsWith('5 ')) {
                // Loose geometry in sub-model: ignore (not refusal per spec)
                continue;
            } else if (trimmed.startsWith('0')) {
                // Other meta or comment, ignore (including 0 Name etc.)
                // But if it's unparsable type-1 (error), we already handled via parsed.error
                continue;
            } else if (trimmed) {
                // Unparsable in sub-model: treat as refusal? Spec says unparsable lines become refusals, but for sub-model we should also treat?
                // We'll push refusal
                refusals.push({line: lineNo, code: 'unparsable', message: `Unparsable line ${lineNo}: ${trimmed}`});
            }
        }
        return result;
    };

    // Process main model lines
    for (let idx = 0; idx < mainLines.length; idx++) {
        const {text: line, lineNo} = mainLines[idx];
        const trimmed = line.trim();
        if (!trimmed) continue;
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
                if (!gid) {
                    refusals.push({line: lineNo, code: 'bad-group', message: `Bad IN at line ${lineNo}`});
                    pendingGroup = null;
                } else if (!groupsById.has(gid)) {
                    refusals.push({line: lineNo, code: 'unknown-group', message: `Unknown group '${gid}' at line ${lineNo}`});
                    pendingGroup = null;
                } else {
                    pendingGroup = gid;
                }
            }
            continue;
        }
        // Check for FILE/NOFILE already handled, but in mainLines they shouldn't appear except as part of MPD sections? In mainLines we already filtered to main section, so no FILE markers should be here.
        // Try parse type-1
        const parsed = parseType1(line);
        if (parsed && !parsed.error) {
            // Check if this is a sub-model reference
            if (isSubModel(parsed.file)) {
                // Validate matrix for sub-model instance
                if (!isProperRotation(parsed.rotation)) {
                    refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                    pendingPort = null;
                    pendingId = null;
                    continue;
                }
                // Sub-model instance: flatten it
                // The instance's own pendingPort/pendingId should be consumed but not applied to children (as per spec, port applies to next type-1 line only; if that line is sub-model, port would apply to sub-model instance, but sub-model instance is not a real part, so ignore)
                // We should check for duplicate-id if pendingId exists for sub-model instance? But sub-model instance id is not used for leaf parts; leaf parts have path-based ids. So we should handle duplicate for the instance? Probably not needed. We'll just consume pendingId/port and ignore.
                if (pendingId) {
                    // If explicit ID for sub-model instance, should we use it as base for path? Spec is unclear. We'll treat it as not used for leaf path, but need to check duplicate for the instance id? However instance itself is not a part, so no id. So we just clear.
                    // But to be safe, we could treat pendingId as not applicable and just clear without duplicate check.
                    pendingId = null;
                }
                pendingPort = null;
                const subParts = flattenSubModel(parsed.file, parsed.position, parsed.rotation, [idx + 1], new Set([normalizeFile(firstFileName)]));
                parts.push(...subParts);
                continue;
            }
            // Real part
            if (!isProperRotation(parsed.rotation)) {
                refusals.push({line: lineNo, code: 'bad-matrix', message: `Bad matrix at line ${lineNo} det=${det3(parsed.rotation).toFixed(4)}`});
                pendingPort = null;
                pendingId = null;
                continue;
            }
            if (catalogMap && !catalogMap.has(parsed.file) && !isSubModel(parsed.file)) {
                refusals.push({line: lineNo, code: 'unknown-part', message: `Unknown part '${parsed.fileRaw}' at line ${lineNo}`});
                pendingPort = null;
                pendingId = null;
                continue;
            }
            // Determine id
            let id;
            if (pendingId) {
                if (seenIds.has(pendingId)) {
                    refusals.push({line: lineNo, code: 'duplicate-id', message: `Duplicate id '${pendingId}' at line ${lineNo}`});
                    id = `p${nextId}`;
                    nextId++;
                } else {
                    id = pendingId;
                    seenIds.add(id);
                }
                pendingId = null;
            } else {
                id = `p${nextId}`;
                nextId++;
                seenIds.add(id);
            }
            const part = {id, part: parsed.file, color: parsed.color, position: parsed.position, rotation: parsed.rotation};
            if (pendingPort) {
                part.port = pendingPort;
                pendingPort = null;
            } else {
                pendingPort = null;
            }
            // Handle pendingGroup
            if (pendingGroup) {
                const g = groupsById.get(pendingGroup);
                if (g) {
                    if (partToGroup.has(id)) {
                        refusals.push({line: lineNo, code: 'bad-group', message: `Part '${id}' is in two groups at line ${lineNo}`});
                    } else {
                        g.parts.push(id);
                        partToGroup.set(id, pendingGroup);
                    }
                }
                pendingGroup = null;
            } else {
                pendingGroup = null;
            }
            parts.push(part);
            continue;
        }
        // Check for loose geometry
        if (/^[2-5]\s/.test(trimmed)) {
            refusals.push({line: lineNo, code: 'loose-geometry', message: `Loose geometry at line ${lineNo}`});
            pendingPort = null;
            pendingId = null;
            continue;
        }
        // Check for other known meta that we ignore (0 Name, 0 Author, etc.)
        if (trimmed.startsWith('0')) {
            // If it's a meta we don't handle, just ignore and clear pending? No, pending should only be cleared when consumed by next type-1, not by other metas.
            // But spec says !BW PORT applies to NEXT type-1 line only. So other lines should not clear it.
            // However if we encounter another 0 line that is not BW, we should keep pending.
            continue;
        }
        // Empty or comment
        if (!trimmed) continue;
        // Unparsable
        if (trimmed) {
            refusals.push({line: lineNo, code: 'unparsable', message: `Unparsable line ${lineNo}: ${trimmed}`});
            pendingPort = null;
            pendingId = null;
        }
    }

    const model = {version: 1, parts};
    if (groupOrder.length > 0) {
        model.groups = groupOrder.map(gid => groupsById.get(gid));
        // Remove empty groups (should not happen, but for safety, filter out groups with 0 parts? But spec says groups with <2 dissolve, but parser should keep whatever was defined, even if empty, and let validator catch it)
        // We keep all groups as defined, even if empty, so that malformed ones are visible
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
    // Build a map from part id to group id for quick lookup
    const partGroupMap = new Map();
    if (model.groups) {
        for (const g of model.groups) {
            for (const pid of g.parts) partGroupMap.set(pid, g.id);
        }
    }
    for (const p of model.parts) {
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
        const color = p.color ?? 16;
        lines.push(`1 ${color} ${x} ${y} ${z} ${a} ${b} ${c} ${d} ${e} ${f} ${g} ${h} ${i} ${p.part}`);
    }
    return lines.join('\r\n') + '\r\n';
};
