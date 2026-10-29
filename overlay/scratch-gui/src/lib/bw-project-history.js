// Project-structure history: every add, delete, duplicate, rename and reorder of
// a sprite, costume, backdrop or sound becomes one Undo / Redo step on the
// shared project stack (lib/bw-undo-coordinator.js), with a label for the History list.
//
// It wraps the VM methods instead of each button, so every entry point (sprite
// list, costume list, libraries, uploads, the paint "new costume", importers)
// is covered by one place. Undo and Redo call the ORIGINAL methods, so they are
// never recorded themselves.
//
// Targets: undoing a sprite deletion rebuilds the sprite as a NEW target, so
// older steps that name the old target follow `successor` to the new one.

import {recordProjectEdit, clearProjectHistory} from './bw-undo-coordinator.js';
import {syncAnimationResources} from './bw-artwork-bundle.js';

const instrumented = new WeakSet();
const successor = new WeakMap();
let suppress = 0;

const live = (vm, target) => {
    let current = target;
    const seen = new Set();
    while (current && !vm.runtime.targets.includes(current) && successor.has(current) && !seen.has(current)) {
        seen.add(current);
        current = successor.get(current);
    }
    if (!current || !vm.runtime.targets.includes(current)) {
        throw new Error('That sprite is no longer in this project');
    }
    return current;
};

const nameOf = target => (target && target.sprite ? target.sprite.name : '');
const quote = text => `“${String(text).slice(0, 40)}”`;

/** Record only a user title edit; loading a project also sets its title. */
export const changeProjectTitle = (before, after, apply) => {
    const result = apply(after);
    if (!suppress && before !== after) recordProjectEdit({
        label: `Project: Rename ${quote(before)} → ${quote(after)}`,
        undo: () => withoutHistory(() => apply(before)),
        redo: () => withoutHistory(() => apply(after))
    });
    return result;
};

if (typeof globalThis !== 'undefined' && globalThis.__bwGlobalUndo) {
    globalThis.__bwGlobalUndo.changeProjectTitle = changeProjectTitle;
}

/**
 * Run `fn` without recording (bulk operations that record one step themselves).
 * @param {Function} fn work
 * @returns {*} its result
 */
export const withoutHistory = fn => {
    suppress++;
    let result;
    try {
        result = fn();
    } catch (error) {
        suppress--;
        throw error;
    }
    // Restoring a sprite re-adds it asynchronously (vm.addSprite after the
    // export resolves): keep recording off until that has finished too.
    if (result && typeof result.then === 'function') {
        return Promise.resolve(result).finally(() => {
            suppress--;
        });
    }
    suppress--;
    return result;
};

const record = (vm, entry) => {
    if (suppress) return;
    const after = () => {
        try {
            syncAnimationResources(vm);
        } catch (e) { /* artwork registry repair must not block the step */ }
        vm.emitTargetsUpdate();
    };
    recordProjectEdit({
        label: entry.label,
        undo: () => Promise.resolve(withoutHistory(entry.undo)).then(after),
        redo: () => Promise.resolve(withoutHistory(entry.redo)).then(after)
    });
};

// One restore shared by the Edit menu's "Restore" and the history: whichever
// runs first restores; the other does nothing, so nothing is restored twice.
const once = fn => {
    let result = null;
    return (...args) => {
        if (!result) result = Promise.resolve().then(() => fn(...args));
        return result;
    };
};

const addedTarget = (vm, before) => {
    const added = vm.runtime.targets.filter(t => t.isOriginal !== false && !before.has(t));
    return added.length === 1 ? added[0] : null;
};

/**
 * Record a sprite deletion whose restore was built by the caller (artwork-aware).
 * @param {object} vm the VM
 * @param {object} target the deleted target
 * @param {Function} restore resolves with the restored target, true, or false
 * @param {Function} remove deletes a restored target again and returns a new restore
 * @returns {Function} the shared one-shot restore for the Edit menu
 */
export const recordSpriteDeletion = (vm, target, restore, remove) => {
    const quiet = fn => (...args) => withoutHistory(() => fn(...args));
    let current = {target, restore: once(quiet(restore))};
    const undo = () => current.restore().then(restored => {
        if (!restored || restored === true) return;
        successor.set(current.target, restored);
        current = {target: restored, restore: null};
    });
    const redo = () => {
        const doomed = live(vm, current.target);
        current = {target: doomed, restore: once(quiet(remove(doomed)))};
    };
    if (!suppress) {
        recordProjectEdit({label: `Sprites: Remove ${quote(nameOf(target))}`,
            undo: () => withoutHistory(undo), redo: () => withoutHistory(redo)});
    }
    const shared = current.restore;
    // Callers (the Edit menu, tests) see true/false, as from the VM.
    return (...args) => shared(...args).then(result => (result && result !== true ? true : result));
};

/**
 * Wrap the VM's structural methods once.
 * @param {object} vm the scratch-vm instance
 * @returns {object} the same vm
 */
export const instrumentProjectHistory = vm => {
    if (!vm || instrumented.has(vm)) return vm;
    instrumented.add(vm);
    vm.bwProjectHistory = true;
    const raw = {};
    const wrap = (name, fn) => {
        if (typeof vm[name] !== 'function') return;
        raw[name] = vm[name].bind(vm);
        vm[name] = (...args) => (suppress ? raw[name](...args) : fn(...args));
    };

    let projectGeneration = 0;
    let sharing = Promise.resolve();
    const load = vm.loadProject.bind(vm);
    vm.loadProject = (...args) => load(...args).then(result => {
        projectGeneration++;
        sharing = Promise.resolve();
        clearProjectHistory();
        return result;
    });

    // Serialize copies so two simultaneous drags into the same sprite are two
    // independent steps, rather than both snapshots claiming the same blocks.
    wrap('shareBlocksToTarget', (blocks, targetId, fromTargetId) => {
        const generation = projectGeneration;
        const copied = JSON.parse(JSON.stringify(blocks));
        const copy = () => {
            // A queued drag belongs to the project in which it was requested.
            if (generation !== projectGeneration) return;
            const target = vm.runtime.getTargetById(targetId);
            if (!target) return raw.shareBlocksToTarget(copied, targetId, fromTargetId);
            const before = new Set(Object.keys(target.blocks._blocks));
            const variableKeys = new Map(vm.runtime.targets.map(t => [t, new Set(Object.keys(t.variables))]));
            const result = raw.shareBlocksToTarget(copied, targetId, fromTargetId);
            // The VM resolves variable conflicts synchronously before loading
            // extensions; capture exactly those creations before another edit.
            const variables = vm.runtime.targets.flatMap(owner => Object.values(owner.variables)
                .filter(v => !variableKeys.get(owner)?.has(v.id)).map(v => ({owner, id: v.id,
                    name: v.name, type: v.type, isCloud: v.isCloud, value: JSON.parse(JSON.stringify(v.value))})));
            return Promise.resolve(result).then(value => {
                // Extension loading may finish after another project replaced
                // the target. Never repopulate its cleared History with old work.
                if (generation !== projectGeneration || !vm.runtime.targets.includes(target)) return value;
                const added = Object.values(target.blocks._blocks).filter(b => !before.has(b.id));
                // A foreign asynchronous import may overlap unrelated edits.
                // Never delete those edits as though this copy had made them.
                if (!added.length || added.length !== copied.length) return value;
                const saved = JSON.parse(JSON.stringify(added));
                const refresh = current => {
                    current.blocks.updateTargetSpecificBlocks(current.isStage);
                    if (vm.editingTarget === current) vm.emitWorkspaceUpdate();
                };
                record(vm, {
                    label: `Blocks: Copy to ${quote(nameOf(target))}`,
                    undo: () => {
                        const current = live(vm, target);
                        for (const block of saved) current.blocks.deleteBlock(block.id);
                        for (const v of variables) live(vm, v.owner).deleteVariable(v.id);
                        refresh(current);
                    },
                    redo: () => {
                        const current = live(vm, target);
                        for (const v of variables) {
                            const owner = live(vm, v.owner);
                            owner.createVariable(v.id, v.name, v.type, v.isCloud);
                            owner.variables[v.id].value = JSON.parse(JSON.stringify(v.value));
                        }
                        for (const block of saved) current.blocks.createBlock(JSON.parse(JSON.stringify(block)));
                        refresh(current);
                    }
                });
                return value;
            });
        };
        const result = sharing.then(copy);
        sharing = result.catch(() => {});
        return result;
    });

    // ---- sprites ----
    const deleteSpriteRaw = targetId => {
        const restore = raw.deleteSprite(targetId);
        return () => {
            const before = new Set(vm.runtime.targets);
            return Promise.resolve(restore()).then(() => addedTarget(vm, before) || true);
        };
    };
    wrap('deleteSprite', targetId => {
        const target = vm.runtime.getTargetById(targetId);
        const restore = deleteSpriteRaw(targetId);
        return recordSpriteDeletion(vm, target, restore, doomed => deleteSpriteRaw(doomed.id));
    });
    const recordAddedSprite = (label, before) => {
        const added = addedTarget(vm, before);
        if (!added) return;
        let state = {target: added, restore: null};
        record(vm, {
            label: `Sprites: ${label} ${quote(nameOf(added))}`,
            undo: () => {
                const doomed = live(vm, state.target);
                state = {target: doomed, restore: deleteSpriteRaw(doomed.id)};
            },
            redo: () => state.restore().then(restored => {
                if (restored && restored !== true) {
                    successor.set(state.target, restored);
                    state = {target: restored, restore: null};
                }
            })
        });
    };
    wrap('addSprite', (...args) => {
        const before = new Set(vm.runtime.targets);
        return raw.addSprite(...args).then(result => {
            recordAddedSprite('Add', before);
            return result;
        });
    });
    wrap('duplicateSprite', (...args) => {
        const before = new Set(vm.runtime.targets);
        return raw.duplicateSprite(...args).then(result => {
            recordAddedSprite('Duplicate', before);
            return result;
        });
    });
    wrap('renameSprite', (targetId, newName) => {
        const target = vm.runtime.getTargetById(targetId);
        const oldName = nameOf(target);
        const result = raw.renameSprite(targetId, newName);
        const name = nameOf(target);
        if (target && name !== oldName) {
            record(vm, {
                label: `Sprites: Rename ${quote(oldName)} → ${quote(name)}`,
                undo: () => raw.renameSprite(live(vm, target).id, oldName),
                redo: () => raw.renameSprite(live(vm, target).id, name)
            });
        }
        return result;
    });
    wrap('reorderTarget', (from, to) => {
        const result = raw.reorderTarget(from, to);
        if (result) {
            const moved = vm.runtime.targets[to];
            const at = () => vm.runtime.targets.indexOf(live(vm, moved));
            record(vm, {
                label: `Sprites: Reorder ${quote(nameOf(moved))}`,
                undo: () => raw.reorderTarget(at(), from),
                redo: () => raw.reorderTarget(at(), to)
            });
        }
        return result;
    });

    // ---- sprite position and properties ----
    // A drag on the stage is one step (start to drop); a field in the sprite
    // info pane (x, y, size, direction, show/hide, draggable, rotation style)
    // is one step per change. Clones are not recorded: they do not outlive a run.
    const INFO_KEYS = ['x', 'y', 'size', 'direction', 'visible', 'draggable', 'rotationStyle'];
    let dragStart = null;
    wrap('startDrag', targetId => {
        const target = vm.runtime.getTargetById(targetId);
        dragStart = target && target.isOriginal && target.isSprite() ? {target, x: target.x, y: target.y} : null;
        return raw.startDrag(targetId);
    });
    wrap('stopDrag', targetId => {
        const result = raw.stopDrag(targetId);
        const start = dragStart;
        dragStart = null;
        const target = start && start.target;
        if (target && target.id === targetId && (target.x !== start.x || target.y !== start.y)) {
            const from = {x: start.x, y: start.y}, to = {x: target.x, y: target.y};
            record(vm, {label: `Stage: Move ${quote(nameOf(target))}`,
                undo: () => live(vm, target).setXY(from.x, from.y),
                redo: () => live(vm, target).setXY(to.x, to.y)});
        }
        return result;
    });
    wrap('postSpriteInfo', data => {
        const target = vm.editingTarget;
        if (vm._dragTarget || !target || !target.isOriginal || !data) return raw.postSpriteInfo(data);
        const keys = Object.keys(data).filter(key => INFO_KEYS.includes(key));
        const read = () => Object.fromEntries(keys.map(key => [key, target[key]]));
        const before = read();
        const result = raw.postSpriteInfo(data);
        const after = read();
        if (keys.some(key => before[key] !== after[key])) {
            record(vm, {label: `Sprites: Change ${keys.join(', ')} of ${quote(nameOf(target))}`,
                undo: () => live(vm, target).postSpriteInfo(before),
                redo: () => live(vm, target).postSpriteInfo(after)});
        }
        return result;
    });

    // ---- costumes and sounds share one shape ----
    const kinds = {
        costume: {list: t => t.sprite.costumes, add: (t, item, i) => t.addCostume(item, i),
            remove: (t, i) => t.deleteCostume(i), rename: (t, i, n) => t.renameCostume(i, n),
            reorder: (t, a, b) => t.reorderCostume(a, b)},
        sound: {list: t => t.sprite.sounds, add: (t, item, i) => t.addSound(item, i),
            remove: (t, i) => t.deleteSound(i), rename: (t, i, n) => t.renameSound(i, n),
            reorder: (t, a, b) => t.reorderSound(a, b)}
    };
    const area = (kind, target) => (kind === 'sound' ? 'Sounds' : target && target.isStage ? 'Backdrops' : 'Costumes');
    const recordAdded = (kind, verb, target, before) => {
        const k = kinds[kind];
        const added = k.list(target).filter(item => !before.includes(item));
        if (added.length !== 1) return;
        const item = added[0];
        let index = -1;
        record(vm, {
            label: `${area(kind, target)}: ${verb} ${quote(item.name)}`,
            undo: () => {
                const t = live(vm, target);
                index = k.list(t).indexOf(item);
                if (index < 0 || !k.remove(t, index)) {
                    throw new Error(`The ${kind} ${quote(item.name)} cannot be removed (a sprite needs one costume)`);
                }
            },
            redo: () => k.add(live(vm, target), item, index)
        });
    };
    const wrapAdd = (name, kind, verb, targetOf) => wrap(name, (...args) => {
        const target = targetOf(...args);
        const before = target ? kinds[kind].list(target).slice() : [];
        const result = raw[name](...args);
        return Promise.resolve(result).then(value => {
            if (target) recordAdded(kind, verb, target, before);
            return value;
        });
    });
    const byIdOrEditing = id => (id ? vm.runtime.getTargetById(id) : vm.editingTarget);
    wrapAdd('addCostume', 'costume', 'Add', (md5ext, costume, targetId) => byIdOrEditing(targetId));
    wrapAdd('addBackdrop', 'costume', 'Add', () => vm.runtime.getTargetForStage());
    wrapAdd('duplicateCostume', 'costume', 'Duplicate', () => vm.editingTarget);
    wrapAdd('addSound', 'sound', 'Add', (sound, targetId) => byIdOrEditing(targetId));
    wrapAdd('duplicateSound', 'sound', 'Duplicate', () => vm.editingTarget);

    const wrapDelete = (name, kind) => wrap(name, index => {
        const target = vm.editingTarget;
        const k = kinds[kind];
        const item = target && k.list(target)[index];
        const restore = raw[name](index);
        if (!restore || !item) return restore;
        let deleted = true;
        const put = () => {
            if (!deleted) return;
            deleted = false;
            k.add(live(vm, target), item, index);
            vm.emitTargetsUpdate();
        };
        record(vm, {
            label: `${area(kind, target)}: Remove ${quote(item.name)}`,
            undo: put,
            redo: () => {
                const t = live(vm, target);
                const at = k.list(t).indexOf(item);
                if (at < 0 || !k.remove(t, at)) throw new Error(`The ${kind} ${quote(item.name)} cannot be removed`);
                deleted = true;
            }
        });
        // The Edit menu's single Restore and the history restore the same item once.
        return put;
    });
    wrapDelete('deleteCostume', 'costume');
    wrapDelete('deleteSound', 'sound');

    const wrapRename = (name, kind) => wrap(name, (index, newName) => {
        const target = vm.editingTarget;
        const k = kinds[kind];
        const item = target && k.list(target)[index];
        const oldName = item && item.name;
        const result = raw[name](index, newName);
        if (item && item.name !== oldName) {
            const renamed = item.name;
            const rename = value => () => {
                const t = live(vm, target);
                k.rename(t, k.list(t).indexOf(item), value);
            };
            record(vm, {label: `${area(kind, target)}: Rename ${quote(oldName)} → ${quote(renamed)}`,
                undo: rename(oldName), redo: rename(renamed)});
        }
        return result;
    });
    wrapRename('renameCostume', 'costume');
    wrapRename('renameSound', 'sound');

    const wrapReorder = (name, kind) => wrap(name, (targetId, from, to) => {
        const target = vm.runtime.getTargetById(targetId);
        const k = kinds[kind];
        const item = target && k.list(target)[from];
        const result = raw[name](targetId, from, to);
        if (result && item) {
            const move = toIndex => () => {
                const t = live(vm, target);
                k.reorder(t, k.list(t).indexOf(item), toIndex);
            };
            record(vm, {label: `${area(kind, target)}: Reorder ${quote(item.name)}`, undo: move(from), redo: move(to)});
        }
        return result;
    });
    wrapReorder('reorderCostume', 'costume');
    wrapReorder('reorderSound', 'sound');
    return vm;
};
