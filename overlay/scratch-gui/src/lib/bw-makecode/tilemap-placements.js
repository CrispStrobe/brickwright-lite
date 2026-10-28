/**
 * Sprite placements on a tile map, as the painter edits them.
 *
 * A placement is an ordinary `place Arcade sprite [ID] on tile [LOCATION]`
 * block (arcade_placeOnTile) whose LOCATION is an `Arcade tile location column
 * [COLUMN] row [ROW]` reporter: the runtime, MakeCode export and import already
 * understand it, so the painter only reads and writes those blocks. A map's
 * placements are the ones that run after its `set Arcade tilemap` block in the
 * same script, before the script sets another map: that is the map they place
 * on. Placements built from computed locations or sprites are listed but not
 * editable.
 *
 * The painter stages edits (see stagePlacement/unstage) and writes them with
 * writePlacements when the map is saved, so nothing changes before Save.
 */

const PLACE = 'arcade_placeOnTile';
const LOCATION = 'arcade_tileLocation';
const MAP = 'arcade_setTilemap';

const shadowValue = (blocks, input, opcode, field) => {
    if (!input || input.block !== input.shadow) return null;
    const shadow = blocks[input.shadow];
    return shadow && shadow.opcode === opcode ? shadow.fields?.[field]?.value : null;
};

const cellNumber = value => {
    const number = Number(value);
    return value !== null && String(value).trim() !== '' && Number.isInteger(number) && number >= 0 ? number : null;
};

/** The blocks run after `startId`'s block, depth first, up to the next map. */
const followingBlocks = (blocks, startId) => {
    const out = [];
    const walk = id => {
        for (let current = id; current; current = blocks[current]?.next) {
            const block = blocks[current];
            if (!block || block.opcode === MAP) return false;
            out.push(block);
            for (const [name, input] of Object.entries(block.inputs || {})) {
                if (name.startsWith('SUBSTACK') && input.block && walk(input.block) === false) return false;
            }
        }
        return true;
    };
    walk(blocks[startId]?.next);
    return out;
};

const readPlacement = (target, blocks, block) => {
    const idInput = block.inputs?.ID;
    const variableBlock = idInput && idInput.block !== idInput.shadow ? blocks[idInput.block] : null;
    const variable = variableBlock?.opcode === 'data_variable' ? variableBlock.fields?.VARIABLE : null;
    const locationInput = block.inputs?.LOCATION;
    const location = locationInput && locationInput.block !== locationInput.shadow ? blocks[locationInput.block] : null;
    const column = location?.opcode === LOCATION ?
        cellNumber(shadowValue(blocks, location.inputs?.COLUMN, 'math_number', 'NUM')) : null;
    const row = location?.opcode === LOCATION ?
        cellNumber(shadowValue(blocks, location.inputs?.ROW, 'math_number', 'NUM')) : null;
    const editable = Boolean(variable && column !== null && row !== null);
    return {
        targetId: target.id, blockId: block.id,
        sprite: variable ? {id: variable.id, name: variable.value} : null,
        column, row, editable,
        columnId: editable ? location.inputs.COLUMN.shadow : null,
        rowId: editable ? location.inputs.ROW.shadow : null
    };
};

/**
 * The placements on one map (a findTilemapBlocks reference):
 * [{targetId, blockId, sprite: {id, name} | null, column, row, editable, columnId, rowId}].
 */
export function findMapPlacements (vm, mapRef) {
    if (!mapRef || mapRef.kind === 'legacyLayout') return [];
    const target = vm?.runtime?.getTargetById?.(mapRef.targetId);
    const blocks = target?.blocks?._blocks;
    if (!blocks || blocks[mapRef.blockId]?.opcode !== MAP) return [];
    return followingBlocks(blocks, mapRef.blockId)
        .filter(block => block.opcode === PLACE)
        .map(block => readPlacement(target, blocks, block));
}

/**
 * Sprite variables a new placement on this map may use: variables visible from
 * the map's sprite (its own and the Stage's) that the project already uses as
 * the sprite of an Arcade block. [{id, name}], sorted by name.
 */
export function placeableSprites (vm, mapRef) {
    const target = vm?.runtime?.getTargetById?.(mapRef?.targetId);
    if (!target) return [];
    const stage = vm.runtime.getTargetForStage?.();
    const visible = new Map();
    for (const owner of [stage, target]) {
        for (const variable of Object.values(owner?.variables || {})) {
            if (variable.type === '' || variable.type === undefined) visible.set(variable.id, variable.name);
        }
    }
    const used = new Set();
    for (const each of vm.runtime.targets || []) {
        const blocks = each.blocks?._blocks || {};
        for (const block of Object.values(blocks)) {
            if (!block.opcode?.startsWith('arcade_')) continue;
            const input = block.inputs?.ID;
            const reporter = input && input.block !== input.shadow ? blocks[input.block] : null;
            const id = reporter?.opcode === 'data_variable' ? reporter.fields?.VARIABLE?.id : null;
            if (id && visible.has(id)) used.add(id);
        }
    }
    return [...used].map(id => ({id, name: visible.get(id)}))
        .sort((left, right) => left.name.localeCompare(right.name));
}

const key = entry => entry.blockId || `new:${entry.sprite.id}`;

/**
 * Stage placing `sprite` ({id, name}) on a cell: moves that sprite's editable
 * placement on this map, else adds one. Returns the new staged list.
 */
export function stagePlacement (placements, sprite, column, row) {
    if (!sprite || !Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0) return placements;
    const index = placements.findIndex(entry => !entry.removed && entry.editable && entry.sprite?.id === sprite.id);
    if (index < 0) {
        return [...placements, {targetId: null, blockId: null, sprite: {...sprite}, column, row, editable: true, added: true}];
    }
    return placements.map((entry, i) => i === index ? {...entry, column, row} : entry);
}

/** Stage removing one placement (by list index). */
export function unstagePlacement (placements, index) {
    const entry = placements[index];
    if (!entry || !entry.editable) return placements;
    return entry.added ? placements.filter((_, i) => i !== index) :
        placements.map((each, i) => i === index ? {...each, removed: true} : each);
}

/** True when the staged list differs from the placements read from the blocks. */
export function placementsChanged (original, staged) {
    if (original.length !== staged.length) return true;
    return staged.some((entry, i) => entry.added || entry.removed || key(entry) !== key(original[i]) ||
        entry.column !== original[i].column || entry.row !== original[i].row);
}

const newBlockId = blocks => {
    let id;
    do { id = `bwPlace${Math.random().toString(36).slice(2, 12)}`; } while (blocks.getBlock(id));
    return id;
};

/** Detach `block` from its chain, joining what follows it to what preceded it. */
const unlink = (blocks, block) => {
    const parentId = block.parent;
    const nextId = block.next;
    const parent = parentId ? blocks.getBlock(parentId) : null;
    const inputName = parent && parent.next !== block.id ?
        Object.keys(parent.inputs || {}).find(name => parent.inputs[name].block === block.id) : undefined;
    if (nextId) blocks.moveBlock({id: nextId, oldParent: block.id, newCoordinate: {x: 0, y: 0}});
    if (parentId) blocks.moveBlock({id: block.id, oldParent: parentId, oldInput: inputName, newCoordinate: {x: 0, y: 0}});
    if (nextId && parentId) blocks.moveBlock({id: nextId, newParent: parentId, newInput: inputName});
};

/** Insert the existing unattached command `id` directly after `afterId`. */
const insertAfter = (blocks, afterId, id) => {
    const nextId = blocks.getBlock(afterId).next;
    if (nextId) blocks.moveBlock({id: nextId, oldParent: afterId, newCoordinate: {x: 0, y: 0}});
    blocks.moveBlock({id, newParent: afterId});
    if (nextId) blocks.moveBlock({id: nextId, newParent: id});
};

const createPlacementBlock = (blocks, sprite, column, row) => {
    const ids = {place: newBlockId(blocks)};
    for (const name of ['idShadow', 'variable', 'locationShadow', 'location', 'column', 'row']) ids[name] = newBlockId(blocks);
    const command = (id, opcode, inputs, fields, parent, shadow) =>
        blocks.createBlock({id, opcode, inputs, fields, next: null, parent, shadow, topLevel: false});
    command(ids.idShadow, 'text', {}, {TEXT: {name: 'TEXT', value: ''}}, ids.place, true);
    command(ids.variable, 'data_variable', {},
        {VARIABLE: {name: 'VARIABLE', value: sprite.name, id: sprite.id, variableType: ''}}, ids.place, false);
    command(ids.locationShadow, 'math_number', {}, {NUM: {name: 'NUM', value: '0'}}, ids.place, true);
    command(ids.column, 'math_number', {}, {NUM: {name: 'NUM', value: String(column)}}, ids.location, true);
    command(ids.row, 'math_number', {}, {NUM: {name: 'NUM', value: String(row)}}, ids.location, true);
    command(ids.location, LOCATION, {COLUMN: {name: 'COLUMN', block: ids.column, shadow: ids.column},
        ROW: {name: 'ROW', block: ids.row, shadow: ids.row}}, {}, ids.place, false);
    command(ids.place, PLACE, {ID: {name: 'ID', block: ids.variable, shadow: ids.idShadow},
        LOCATION: {name: 'LOCATION', block: ids.location, shadow: ids.locationShadow}}, {}, null, false);
    return ids.place;
};

/**
 * Write a staged placement list for a map. Refuses, changing nothing, when the
 * blocks no longer hold the placements the list was staged from. Returns the
 * placements as read back from the blocks, or null.
 */
export function writePlacements (vm, mapRef, original, staged) {
    const target = vm?.runtime?.getTargetById?.(mapRef?.targetId);
    const blocks = target?.blocks;
    if (!blocks?.createBlock || !blocks.moveBlock) return null;
    const current = findMapPlacements(vm, mapRef);
    const same = current.length === original.length && current.every((entry, i) => entry.blockId === original[i].blockId &&
        entry.column === original[i].column && entry.row === original[i].row && entry.sprite?.id === original[i].sprite?.id);
    if (!same) return null;
    for (const entry of staged) {
        if (entry.added || !entry.editable) continue;
        if (entry.removed) {
            const block = blocks.getBlock(entry.blockId);
            unlink(blocks, block);
            blocks.deleteBlock(entry.blockId);
            continue;
        }
        const before = original.find(each => each.blockId === entry.blockId);
        if (before.column !== entry.column) {
            blocks.changeBlock({id: entry.columnId, element: 'field', name: 'NUM', value: String(entry.column)}, vm.runtime);
        }
        if (before.row !== entry.row) {
            blocks.changeBlock({id: entry.rowId, element: 'field', name: 'NUM', value: String(entry.row)}, vm.runtime);
        }
    }
    // Added placements run right after the map, in the order they were placed.
    let after = mapRef.blockId;
    for (const entry of staged.filter(each => each.added)) {
        const id = createPlacementBlock(blocks, entry.sprite, entry.column, entry.row);
        insertAfter(blocks, after, id);
        after = id;
    }
    vm.runtime.emitProjectChanged?.();
    if (vm.editingTarget && vm.editingTarget.id === target.id) vm.emitWorkspaceUpdate?.();
    return findMapPlacements(vm, mapRef);
}
