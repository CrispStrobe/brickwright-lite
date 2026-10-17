// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Editor state: commands, undo/redo, palette (C7 + C4, pure). Pure, no DOM, no three.
//
// One user action is one undo step. Moving or turning a multi-part selection,
// or pasting several parts, is a `moveMany` / `batch` command: its steps run
// against a scratch copy, and only when every one of them is valid does the
// model change, with a single history entry (all or nothing).

import {validatePlacedModel} from '../contracts.js';
import {placePart as snapPlacePart} from './snap.js';

const cloneModel = model => {
    const out = {
        version: model.version,
        parts: model.parts.map(p => ({
            ...p,
            position: p.position.slice(),
            rotation: p.rotation.slice()
        }))
    };
    if (model.groups) out.groups = model.groups.map(g => ({id: g.id, name: g.name, parts: g.parts.slice()}));
    // Building steps from `0 STEP` lines ride along; parts deleted since are skipped where they are read.
    if (model.steps) out.steps = model.steps.map(ids => ids.slice());
    return out;
};

export const groupOf = (model, partId) => {
    if (!model.groups) return null;
    for (const g of model.groups) if (g.parts.includes(partId)) return g;
    return null;
};

export const expandSelection = (model, ids) => {
    if (!model.groups || !ids.length) return ids.slice();
    const set = new Set(ids);
    for (const id of ids) {
        const g = groupOf(model, id);
        if (g) for (const pid of g.parts) set.add(pid);
    }
    return [...set];
};

const isProperRotation = m => {
    const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
    return Math.abs(det - 1) < 1e-6;
};

const nextGroupId = model => {
    let n = 1;
    const ids = new Set((model.groups || []).map(g => g.id));
    while (ids.has(`g${n}`)) n++;
    return `g${n}`;
};

const dissolveSmallGroups = model => {
    if (!model.groups) return;
    model.groups = model.groups.filter(g => g.parts.length >= 2);
    if (model.groups.length === 0) delete model.groups;
};

export const portsForCopies = (model, catalog, parts) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    // Build used ports set from current model
    const used = new Set();
    for (const pl of model.parts) if (pl.port) used.add(pl.port);
    // Free ports in order A..F not used
    const allPorts = ['A','B','C','D','E','F'];
    const free = allPorts.filter(p => !used.has(p));
    const freeSet = new Set(free);
    // For each part in model order, determine its copy's port
    // parts is array of placed parts (with id, part, port, etc.) in model order
    // We need to preserve order as given, but task says "assign in model order"
    // So we should sort parts by their order in model.parts
    const orderIndex = new Map(model.parts.map((pl, i) => [pl.id, i]));
    const sorted = [...parts].sort((a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0));
    // Map from original id to assigned port for quick lookup
    const assigned = new Map();
    for (const part of sorted) {
        const meta = catalogMap.get(part.part);
        const isMotor = !!(meta && meta.motor);
        const isSensor = !!(meta && meta.category === 'sensor');
        if (!isMotor && !isSensor) {
            assigned.set(part.id, undefined);
            continue;
        }
        const origPort = part.port;
        // Check if no other part in model uses this port
        let otherUses = false;
        if (origPort) {
            for (const pl of model.parts) if (pl.id !== part.id && pl.port === origPort) { otherUses = true; break; }
        }
        let chosen;
        if (origPort && !otherUses) {
            // Keep original's port if no other part uses it
            chosen = origPort;
            // If this port was free, remove it from freeSet (now used)
            if (freeSet.has(chosen)) freeSet.delete(chosen);
            // Also, we need to consider that this port is now considered used for subsequent copies
            // But if it was already used by the original, it's already in used, but we have not added it to freeSet, so it's fine
            // However, we need to ensure that if the port was not in freeSet (because it was used by original), we still mark it as now used for future copies (but it's already used, so freeSet doesn't contain it)
            // For the purpose of freeSet, we don't need to add it, just ensure that if it was free, we remove it
        } else {
            // Get first free port in order A..F
            const freeList = allPorts.filter(p => freeSet.has(p));
            chosen = freeList.length ? freeList[0] : undefined;
            if (chosen) freeSet.delete(chosen);
        }
        assigned.set(part.id, chosen);
    }
    // Return ports in the same order as input parts (not sorted), but task says assign in model order, each taking port out of free set
    // The input parts may not be in model order, but we have assigned in model order, so we need to return in input order?
    // The spec says "Copying several parts at once: assign in model order, each assignment taking the port out of the free set."
    // That means the assignment order is model order, but the returned ports should correspond to the input parts in model order?
    // For cloneMany, ids are given, and we will assign ports for each clone in the order of ids as they appear in model.parts, not the order of ids argument.
    // To make it deterministic, we should return ports in the order of the input parts array as sorted by model order.
    // But the caller (cloneMany) will have ids in some order, and we need to map each clone's port correctly.
    // So we can return an array in the order of sorted parts, or we can return a map.
    // Simpler: return array in the order of sorted parts, and the caller can use it in that order.
    // However, the task's example: "a pure helper in editor-state.js, e.g. portsForCopies(model, catalog, parts) => ports[]"
    // It takes parts (array) and returns ports[] (array) corresponding to each part in the same order as parts.
    // And it says "Copying several parts at once: assign in model order, each assignment taking the port out of the free set."
    // That means even if parts are given in arbitrary order, the assignment should be done in model order, but the returned ports should match the input order? Or should the assignment be done in model order but the ports returned in input order?
    // We need to decide.
    // For simplicity, we will assign in model order, but return in input order: we have assigned map from id to port, so we can return ports in input order by mapping each input part's id to assigned port.
    return parts.map(p => assigned.get(p.id));
};

export const createEditor = ({model, catalog}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    let current = cloneModel(model);
    const undoStack = [];
    const redoStack = [];
    const subs = new Set();

    // > 0 while a batch runs its steps: they neither notify nor record history.
    let batching = 0;

    const notify = () => {
        if (batching) return;
        for (const fn of subs) fn(cloneModel(current));
    };

    const pushHistory = prev => {
        if (batching) return;
        undoStack.push(cloneModel(prev));
        redoStack.length = 0;
    };

    const editor = {
        get model() { return cloneModel(current); },
        get canUndo() { return undoStack.length > 0; },
        get canRedo() { return redoStack.length > 0; },
        subscribe(fn) {
            subs.add(fn);
            return () => subs.delete(fn);
        },
        apply(cmd) {
            // moveMany has two shapes, both ONE undo step: `moves: [{id, position, rotation}]` (the build
            // view's gizmo and drags) runs as an all-or-nothing batch of moves; `ids` + `delta` or `poses`
            // (group moves) is handled below.
            if (cmd && (cmd.type === 'batch' || (cmd.type === 'moveMany' && Array.isArray(cmd.moves)))) return applyBatch(cmd);
            const prev = cloneModel(current);
            let next;
            if (cmd.type === 'place') {
                const {part, position, rotation, color, port} = cmd;
                if (!catalogMap.has(part)) throw new Error(`unknown part '${part}'`);
                if (!Array.isArray(position) || position.length !== 3) throw new Error('bad position');
                if (!Array.isArray(rotation) || rotation.length !== 9) throw new Error('bad rotation');
                if (color !== undefined && !(Number.isInteger(color) && color >= 0)) throw new Error(`bad colour ${color}`);
                if (port !== undefined && port !== null) {
                    const meta = catalogMap.get(part);
                    const isMotor = !!meta.motor;
                    const isSensor = meta.category === 'sensor';
                    if (!isMotor && !isSensor) throw new Error(`port on non-motor/sensor part '${part}'`);
                    if (!['A','B','C','D','E','F'].includes(port)) throw new Error(`bad port '${port}'`);
                }
                next = snapPlacePart(current, {part, position, rotation, color, port});
                // snapPlacePart handles id generation, but we need to handle color/port
                // Our snapPlacePart currently only handles part, position, rotation, id, port, not color
                // We need to handle color manually: the last part in next should have color/port
                const last = next.parts[next.parts.length - 1];
                if (color !== undefined) last.color = color;
                if (port !== undefined && port !== null) last.port = port;
                if (port === null && last.port) delete last.port;
            } else if (cmd.type === 'move') {
                const {id, position, rotation} = cmd;
                const idx = current.parts.findIndex(p => p.id === id);
                if (idx === -1) throw new Error(`unknown id '${id}'`);
                if (!Array.isArray(position) || position.length !== 3) throw new Error('bad position');
                if (!Array.isArray(rotation) || rotation.length !== 9) throw new Error('bad rotation');
                next = cloneModel(current);
                next.parts[idx].position = position.slice();
                next.parts[idx].rotation = rotation.slice();
            } else if (cmd.type === 'delete') {
                const {id} = cmd;
                const idx = current.parts.findIndex(p => p.id === id);
                if (idx === -1) throw new Error(`unknown id '${id}'`);
                next = cloneModel(current);
                next.parts.splice(idx, 1);
                // Remove from groups, dissolve small
                if (next.groups) {
                    for (const g of next.groups) {
                        const i = g.parts.indexOf(id);
                        if (i !== -1) g.parts.splice(i, 1);
                    }
                    dissolveSmallGroups(next);
                }
            } else if (cmd.type === 'clone') {
                const {id, offset} = cmd;
                const orig = current.parts.find(p => p.id === id);
                if (!orig) throw new Error(`unknown id '${id}'`);
                const off = offset || [40, 0, 0];
                const newPos = [orig.position[0] + off[0], orig.position[1] + off[1], orig.position[2] + off[2]];
                const ports = portsForCopies(current, catalogMap, [orig]);
                const port = ports[0];
                next = snapPlacePart(current, {part: orig.part, position: newPos, rotation: orig.rotation.slice(), color: orig.color, port});
                // Handle color/port for clone as well (snapPlacePart doesn't handle color, so we set it)
                const last = next.parts[next.parts.length - 1];
                if (orig.color !== undefined) last.color = orig.color;
                if (port) last.port = port; else if (last.port) delete last.port;
                // If original was in a group, clones currently not in group; but single clone doesn't create new group (needs >=2)
                // So we don't handle group for single clone here; cloneMany will handle multi
            } else if (cmd.type === 'group') {
                const {ids, name} = cmd;
                if (!Array.isArray(ids) || ids.length < 2) throw new Error('group needs at least 2 parts');
                for (const pid of ids) if (!current.parts.some(p => p.id === pid)) throw new Error(`unknown id '${pid}'`);
                next = cloneModel(current);
                // Collect all parts that should be in the new group: ids plus any parts from old groups that contain any of ids (merge)
                const toMerge = new Set(ids);
                const oldGroupsToRemove = new Set();
                if (next.groups) {
                    for (const g of next.groups) {
                        if (g.parts.some(pid => ids.includes(pid))) {
                            for (const pid of g.parts) toMerge.add(pid);
                            oldGroupsToRemove.add(g.id);
                        }
                    }
                    if (oldGroupsToRemove.size) next.groups = next.groups.filter(g => !oldGroupsToRemove.has(g.id));
                }
                const newParts = [...toMerge];
                const gid = nextGroupId(next);
                const gname = name || `Group ${gid}`;
                if (!next.groups) next.groups = [];
                next.groups.push({id: gid, name: gname, parts: newParts});
            } else if (cmd.type === 'ungroup') {
                const {id} = cmd;
                if (!current.groups || !current.groups.some(g => g.id === id)) throw new Error(`unknown group '${id}'`);
                next = cloneModel(current);
                next.groups = next.groups.filter(g => g.id !== id);
                if (next.groups.length === 0) delete next.groups;
            } else if (cmd.type === 'renameGroup') {
                const {id, name} = cmd;
                if (!current.groups || !current.groups.some(g => g.id === id)) throw new Error(`unknown group '${id}'`);
                if (typeof name !== 'string' || !name) throw new Error('bad name');
                next = cloneModel(current);
                const g = next.groups.find(x => x.id === id);
                g.name = name;
            } else if (cmd.type === 'moveMany') {
                const {ids, delta, poses} = cmd;
                if (!Array.isArray(ids) || ids.length === 0) throw new Error('moveMany needs ids');
                for (const pid of ids) if (!current.parts.some(p => p.id === pid)) throw new Error(`unknown id '${pid}'`);
                if (delta !== undefined) {
                    if (!Array.isArray(delta) || delta.length !== 3) throw new Error('bad delta');
                }
                if (poses !== undefined) {
                    if (!Array.isArray(poses)) throw new Error('bad poses');
                    for (const po of poses) {
                        if (!po.id || !Array.isArray(po.position) || po.position.length !== 3) throw new Error('bad pose position');
                        if (!Array.isArray(po.rotation) || po.rotation.length !== 9) throw new Error('bad pose rotation');
                        if (!isProperRotation(po.rotation)) throw new Error('bad rotation det');
                        if (!ids.includes(po.id)) throw new Error(`pose id '${po.id}' not in ids`);
                    }
                }
                if (delta === undefined && poses === undefined) throw new Error('moveMany needs delta or poses');
                next = cloneModel(current);
                if (poses) {
                    for (const po of poses) {
                        const idx = next.parts.findIndex(p => p.id === po.id);
                        next.parts[idx].position = po.position.slice();
                        next.parts[idx].rotation = po.rotation.slice();
                    }
                } else {
                    for (const pid of ids) {
                        const idx = next.parts.findIndex(p => p.id === pid);
                        next.parts[idx].position = [next.parts[idx].position[0] + delta[0], next.parts[idx].position[1] + delta[1], next.parts[idx].position[2] + delta[2]];
                    }
                }
            } else if (cmd.type === 'deleteMany') {
                const {ids} = cmd;
                if (!Array.isArray(ids) || ids.length === 0) throw new Error('deleteMany needs ids');
                for (const pid of ids) if (!current.parts.some(p => p.id === pid)) throw new Error(`unknown id '${pid}'`);
                next = cloneModel(current);
                const delSet = new Set(ids);
                next.parts = next.parts.filter(p => !delSet.has(p.id));
                if (next.groups) {
                    for (const g of next.groups) g.parts = g.parts.filter(pid => !delSet.has(pid));
                    dissolveSmallGroups(next);
                }
            } else if (cmd.type === 'cloneMany') {
                const {ids, offset} = cmd;
                if (!Array.isArray(ids) || ids.length === 0) throw new Error('cloneMany needs ids');
                for (const pid of ids) if (!current.parts.some(p => p.id === pid)) throw new Error(`unknown id '${pid}'`);
                const off = offset || [40, 0, 0];
                if (!Array.isArray(off) || off.length !== 3) throw new Error('bad offset');
                next = cloneModel(current);
                // Determine ports for copies using helper (in model order)
                const partsToCopy = ids.map(pid => current.parts.find(p => p.id === pid));
                const ports = portsForCopies(current, catalogMap, partsToCopy);
                const idToPort = new Map();
                for (let i = 0; i < ids.length; i++) idToPort.set(ids[i], ports[i]);
                // Map from original id to new cloned part
                const clones = [];
                const origToCloneId = new Map();
                for (const pid of ids) {
                    const orig = current.parts.find(p => p.id === pid);
                    const port = idToPort.get(pid);
                    const newPos = [orig.position[0] + off[0], orig.position[1] + off[1], orig.position[2] + off[2]];
                    const cloned = snapPlacePart(next, {part: orig.part, position: newPos, rotation: orig.rotation.slice(), color: orig.color, port});
                    const last = cloned.parts[cloned.parts.length - 1];
                    if (orig.color !== undefined) last.color = orig.color;
                    if (port) last.port = port; else if (last.port) delete last.port;
                    // snapPlacePart already set next to cloned, but we need to track new id
                    // The new part is the last in cloned.parts
                    const newId = last.id;
                    clones.push({origId: pid, newId});
                    origToCloneId.set(pid, newId);
                    next = cloned;
                }
                // Handle groups: clones keep their group structure, a cloned group becomes a new group
                if (current.groups) {
                    // Find groups that are touched by the cloned ids
                    const touchedGroups = current.groups.filter(g => g.parts.some(pid => ids.includes(pid)));
                    for (const og of touchedGroups) {
                        const clonedParts = og.parts.filter(pid => ids.includes(pid)).map(pid => origToCloneId.get(pid));
                        if (clonedParts.length >= 2) {
                            const newGid = nextGroupId(next);
                            if (!next.groups) next.groups = [];
                            next.groups.push({id: newGid, name: og.name, parts: clonedParts});
                        } else if (clonedParts.length === 1) {
                            // Single cloned part from a group doesn't form a group (needs >=2), so leave ungrouped
                        }
                    }
                }
            } else if (cmd.type === 'recolor') {
                const {id, color} = cmd;
                const idx = current.parts.findIndex(p => p.id === id);
                if (idx === -1) throw new Error(`unknown id '${id}'`);
                if (!(Number.isInteger(color) && color >= 0)) throw new Error(`bad colour ${color}`);
                next = cloneModel(current);
                next.parts[idx].color = color;
            } else if (cmd.type === 'setPort') {
                const {id, port} = cmd;
                const idx = current.parts.findIndex(p => p.id === id);
                if (idx === -1) throw new Error(`unknown id '${id}'`);
                const meta = catalogMap.get(current.parts[idx].part);
                if (port !== null && port !== undefined) {
                    const isMotor = !!meta.motor;
                    const isSensor = meta.category === 'sensor';
                    if (!isMotor && !isSensor) throw new Error(`port on non-motor/sensor part '${current.parts[idx].part}'`);
                    if (!['A','B','C','D','E','F'].includes(port)) throw new Error(`bad port '${port}'`);
                }
                next = cloneModel(current);
                if (port === null || port === undefined) delete next.parts[idx].port;
                else next.parts[idx].port = port;
            } else {
                throw new Error(`unknown command type '${cmd.type}'`);
            }

            // Validate the new model
            const errs = validatePlacedModel(next, catalog);
            if (errs.length) throw new Error(errs[0]);

            pushHistory(prev);
            current = next;
            notify();
            return cloneModel(current);
        },
        undo() {
            if (!undoStack.length) return cloneModel(current);
            redoStack.push(cloneModel(current));
            current = undoStack.pop();
            notify();
            return cloneModel(current);
        },
        redo() {
            if (!redoStack.length) return cloneModel(current);
            undoStack.push(cloneModel(current));
            current = redoStack.pop();
            notify();
            return cloneModel(current);
        }
    };

    /**
     * `{type: 'batch', commands: [...]}` or `{type: 'moveMany', moves: [{id, position, rotation}]}`:
     * all steps or none, one undo entry, one notification.
     */
    const applyBatch = cmd => {
        const steps = cmd.type === 'moveMany' ?
            (Array.isArray(cmd.moves) ? cmd.moves.map(m => ({...m, type: 'move'})) : null) :
            (Array.isArray(cmd.commands) ? cmd.commands : null);
        if (!steps || !steps.length) throw new Error(`${cmd.type}: needs at least one step`);
        if (cmd.type === 'moveMany') {
            const ids = steps.map(s => s.id);
            if (new Set(ids).size !== ids.length) throw new Error('moveMany: a part is moved twice');
        }
        const prev = cloneModel(current);
        batching++;
        try {
            for (const step of steps) editor.apply(step);
        } catch (error) {
            current = prev;
            throw error;
        } finally {
            batching--;
        }
        pushHistory(prev);
        notify();
        return cloneModel(current);
    };

    return editor;
};
