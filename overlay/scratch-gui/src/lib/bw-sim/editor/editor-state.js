// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// Editor state: commands, undo/redo, palette (C7 + C4, pure). Pure, no DOM, no three.

import {validatePlacedModel} from '../contracts.js';
import {placePart as snapPlacePart} from './snap.js';

const cloneModel = model => ({
    version: model.version,
    parts: model.parts.map(p => ({
        ...p,
        position: p.position.slice(),
        rotation: p.rotation.slice()
    }))
});

export const createEditor = ({model, catalog}) => {
    const catalogMap = catalog instanceof Map ? catalog : new Map(Object.entries(catalog || {}));
    let current = cloneModel(model);
    const undoStack = [];
    const redoStack = [];
    const subs = new Set();

    const notify = () => {
        for (const fn of subs) fn(cloneModel(current));
    };

    const pushHistory = prev => {
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
            } else if (cmd.type === 'clone') {
                const {id, offset} = cmd;
                const orig = current.parts.find(p => p.id === id);
                if (!orig) throw new Error(`unknown id '${id}'`);
                const off = offset || [40, 0, 0];
                const newPos = [orig.position[0] + off[0], orig.position[1] + off[1], orig.position[2] + off[2]];
                next = snapPlacePart(current, {part: orig.part, position: newPos, rotation: orig.rotation.slice(), color: orig.color, port: orig.port});
                // Handle color/port for clone as well (snapPlacePart doesn't handle color, so we set it)
                const last = next.parts[next.parts.length - 1];
                if (orig.color !== undefined) last.color = orig.color;
                if (orig.port) last.port = orig.port;
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

    return editor;
};
