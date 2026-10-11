/**
 * Tile map editing for imported (and new) MakeCode Arcade levels.
 *
 * A level lives in a `set Arcade tilemap [DATA]` block as JSON text in the
 * representation `tilemap-values.js` decodes and exports:
 * {columns, rows, tileSize, indices, walls, images}. Tile 0 is the empty tile.
 * These functions find those blocks, edit the data without mutating it (so
 * an undo history is a list of values), and write the result back into the
 * block the level came from. The painter UI (tilemap-editor.jsx) is a view
 * over them.
 */
import {validTileId} from './tile-assets.js';
import {tilemapSource} from './tilemap-values.js';

export const TILE_SIZES = Object.freeze([4, 8, 16, 32]);
export const MAX_TILES = 256;
export const MAX_CELLS = 65536;
const HISTORY_LIMIT = 100;

const blankImage = size => ({width: size, height: size, pixels: new Array(size * size).fill(0)});
const copyImage = image => ({width: image.width, height: image.height, pixels: Array.from(image.pixels),
    ...(validTileId(image.tileId) ? {tileId: image.tileId} : {}),
    ...(typeof image.displayName === 'string' ? {displayName: image.displayName} : {})});

/** A plain-array copy of tile map data, or null when it is not editable data. */
export function normalizeTilemap (data) {
    if (!data || typeof data !== 'object') return null;
    const out = {
        columns: data.columns, rows: data.rows, tileSize: data.tileSize,
        indices: Array.from(data.indices || []), walls: Array.from(data.walls || [], wall => (wall ? 1 : 0)),
        images: Array.from(data.images || [], image => (image && image.pixels ? copyImage(image) : image))
    };
    return tilemapSource(out) ? out : null;
}

/** Parse a block's DATA text; null when it is empty, `null` or not a valid map. */
export function parseTilemapText (text) {
    try {
        return normalizeTilemap(JSON.parse(String(text)));
    } catch (e) {
        return null;
    }
}

export const tilemapText = data => JSON.stringify(normalizeTilemap(data));

/** A new, empty level: every cell tile 0, no walls, one blank tile. */
export function createTilemap ({columns = 10, rows = 8, tileSize = 16} = {}) {
    if (!TILE_SIZES.includes(tileSize)) throw new Error(`tile size must be one of ${TILE_SIZES.join(', ')}`);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows > MAX_CELLS) {
        throw new Error('a tile map needs at least one cell and at most 65536');
    }
    return {columns, rows, tileSize, indices: new Array(columns * rows).fill(0),
        walls: new Array(columns * rows).fill(0), images: [blankImage(tileSize)]};
}

const inside = (data, column, row) => Number.isInteger(column) && Number.isInteger(row) &&
    column >= 0 && row >= 0 && column < data.columns && row < data.rows;

/** Put tile `index` in one cell. */
export function paintCell (data, column, row, index) {
    if (!inside(data, column, row) || !Number.isInteger(index) || index < 0 || index >= data.images.length) return data;
    const at = row * data.columns + column;
    if (data.indices[at] === index) return data;
    const indices = data.indices.slice();
    indices[at] = index;
    return {...data, indices};
}

export const eraseCell = (data, column, row) => paintCell(data, column, row, 0);

/** Replace the connected region of equal tiles around a cell with tile `index`. */
export function fillCells (data, column, row, index) {
    if (!inside(data, column, row) || !Number.isInteger(index) || index < 0 || index >= data.images.length) return data;
    const from = data.indices[row * data.columns + column];
    if (from === index) return data;
    const indices = data.indices.slice();
    const stack = [[column, row]];
    while (stack.length) {
        const [c, r] = stack.pop();
        if (!inside(data, c, r) || indices[r * data.columns + c] !== from) continue;
        indices[r * data.columns + c] = index;
        stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }
    return {...data, indices};
}

/** Mark or clear a wall on one cell; walls are a layer of their own. */
export function setWall (data, column, row, wall) {
    if (!inside(data, column, row)) return data;
    const at = row * data.columns + column;
    const value = wall ? 1 : 0;
    if (data.walls[at] === value) return data;
    const walls = data.walls.slice();
    walls[at] = value;
    return {...data, walls};
}

/** Change the map's dimensions, keeping the top-left cells; new cells are empty. */
export function resizeTilemap (data, columns, rows) {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1 || columns * rows > MAX_CELLS) return data;
    if (columns === data.columns && rows === data.rows) return data;
    const indices = new Array(columns * rows).fill(0), walls = new Array(columns * rows).fill(0);
    for (let r = 0; r < Math.min(rows, data.rows); r++) {
        for (let c = 0; c < Math.min(columns, data.columns); c++) {
            indices[r * columns + c] = data.indices[r * data.columns + c];
            walls[r * columns + c] = data.walls[r * data.columns + c];
        }
    }
    return {...data, columns, rows, indices, walls};
}

/** Crop or pad an image to size×size at its top-left (Arcade tiles do not stretch). */
const fitImage = (image, size) => {
    const out = blankImage(size);
    for (let y = 0; y < Math.min(size, image.height); y++) {
        for (let x = 0; x < Math.min(size, image.width); x++) out.pixels[y * size + x] = image.pixels[y * image.width + x];
    }
    return out;
};

/** Change the tile size; every tile image is cropped or padded to it. */
export function setTileSize (data, tileSize) {
    if (!TILE_SIZES.includes(tileSize) || tileSize === data.tileSize) return data;
    return {...data, tileSize, images: data.images.map(image => ({...copyImage(image), ...fitImage(image, tileSize)}))};
}

/** Add a tile (blank, or a copy of `image` fitted to the tile size); returns {data, index}. */
export function addTile (data, image = null) {
    if (data.images.length >= MAX_TILES) return {data, index: -1};
    const tile = image ? fitImage(image, data.tileSize) : blankImage(data.tileSize);
    return {data: {...data, images: [...data.images, tile]}, index: data.images.length};
}

/** Remove a tile; cells using it become empty and later tiles shift down. Tile 0 stays. */
export function removeTile (data, index) {
    if (!Number.isInteger(index) || index < 1 || index >= data.images.length) return data;
    return {...data,
        images: data.images.filter((_, i) => i !== index),
        indices: data.indices.map(value => (value === index ? 0 : value > index ? value - 1 : value))};
}

/** Replace one tile's pixels (fitted to the tile size). */
export function setTileImage (data, index, image) {
    if (!Number.isInteger(index) || index < 0 || index >= data.images.length || !image) return data;
    const images = data.images.slice();
    images[index] = {...copyImage(data.images[index]), ...fitImage(image, data.tileSize)};
    return {...data, images};
}

/** Rename a tile's editable label; its stable resource ID survives the edit. */
export function renameTile (data, index, displayName) {
    if (!data.images[index] || typeof displayName !== 'string' || !displayName.trim() || displayName.length > 128 ||
        data.images.some((image, i) => i !== index && image.displayName === displayName.trim())) return data;
    const images = data.images.slice();
    images[index] = {...images[index], displayName: displayName.trim()};
    return {...data, images};
}

/** Set one pixel of one tile. */
export function paintTilePixel (data, index, x, y, colour) {
    const image = data.images[index];
    if (!image || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= image.width || y >= image.height ||
        !Number.isInteger(colour) || colour < 0 || colour > 15 || image.pixels[y * image.width + x] === colour) return data;
    const pixels = image.pixels.slice();
    pixels[y * image.width + x] = colour;
    const images = data.images.slice();
    images[index] = {...image, pixels};
    return {...data, images};
}

/** An undo history of map values: {past, present, future}. */
export const createHistory = present => ({past: [], present, future: []});

export function commit (history, next) {
    if (next === history.present) return history;
    return {past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: []};
}

export function undo (history) {
    if (!history.past.length) return history;
    return {past: history.past.slice(0, -1), present: history.past[history.past.length - 1],
        future: [history.present, ...history.future]};
}

export function redo (history) {
    if (!history.future.length) return history;
    return {past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1)};
}

/**
 * Every `set Arcade tilemap` block in the project:
 * [{targetId, targetName, blockId, shadowId, data, editable}]. A block whose
 * DATA is a reporter, or text that is not a map, is listed but not editable.
 */
export function findTilemapBlocks (vm) {
    const found = [];
    for (const target of vm?.runtime?.targets || []) {
        if (target.isOriginal === false) continue;
        const blocks = target.blocks?._blocks || {};
        for (const block of Object.values(blocks)) {
            if (block.opcode !== 'arcade_setTilemap') continue;
            const input = block.inputs?.DATA;
            const shadow = input && input.block === input.shadow ? blocks[input.shadow] : null;
            const text = shadow && shadow.fields?.TEXT ? shadow.fields.TEXT.value : null;
            const data = text === null ? null : parseTilemapText(text);
            found.push({targetId: target.id, targetName: target.getName ? target.getName() : target.sprite?.name,
                blockId: block.id, shadowId: shadow ? shadow.id : null, data, editable: Boolean(data)});
        }
    }
    return found;
}

/** Write a map back into the block it came from. Returns true when written. */
export function writeTilemapBlock (vm, ref, data) {
    const text = normalizeTilemap(data) && tilemapText(data);
    const target = vm?.runtime?.getTargetById?.(ref.targetId);
    const shadow = target?.blocks?.getBlock?.(ref.shadowId);
    if (!text || !shadow || !shadow.fields?.TEXT) return false;
    target.blocks.changeBlock({id: ref.shadowId, element: 'field', name: 'TEXT', value: text}, vm.runtime);
    if (vm.editingTarget && vm.editingTarget.id === target.id && vm.emitWorkspaceUpdate) vm.emitWorkspaceUpdate();
    vm.runtime.emitProjectChanged?.();
    return true;
}

const newBlockId = blocks => {
    let id;
    do { id = `bwTilemap${Math.random().toString(36).slice(2, 12)}`; } while (blocks.getBlock(id));
    return id;
};

/**
 * Start a new level: a `when flag clicked → set Arcade tilemap` script in the
 * given sprite (else the Stage), holding `data`. Loads the Arcade extension if
 * the project does not use it yet. Returns the new block's reference, as
 * findTilemapBlocks lists it.
 */
export async function addTilemapBlock (vm, data, {targetId = null} = {}) {
    const text = normalizeTilemap(data) && tilemapText(data);
    if (!text) throw new Error('Invalid tile map');
    if (typeof vm?.runtime?._primitives?.arcade_setTilemap !== 'function') {
        if (!vm?.extensionManager?.loadExtensionURL) throw new Error('Arcade extension is unavailable');
        await vm.extensionManager.loadExtensionURL('arcade');
        if (typeof vm.runtime._primitives?.arcade_setTilemap !== 'function') throw new Error('Arcade tile map command is unavailable');
    }
    const chosen = targetId && vm.runtime.getTargetById(targetId);
    const target = chosen && !chosen.isStage ? chosen : vm.runtime.getTargetForStage();
    const blocks = target?.blocks;
    if (!blocks?.createBlock || !blocks.moveBlock) throw new Error('No target for the tile map');
    const hatId = newBlockId(blocks), commandId = newBlockId(blocks), textId = newBlockId(blocks);
    const y = 32 + 96 * blocks.getScripts().length;
    blocks.createBlock({id: hatId, opcode: 'event_whenflagclicked', inputs: {}, fields: {}, next: null, parent: null,
        shadow: false, topLevel: true, x: 32, y});
    blocks.createBlock({id: textId, opcode: 'text', inputs: {}, fields: {TEXT: {name: 'TEXT', value: text}}, next: null,
        parent: commandId, shadow: true, topLevel: false});
    blocks.createBlock({id: commandId, opcode: 'arcade_setTilemap', inputs: {DATA: {name: 'DATA', block: textId, shadow: textId}},
        fields: {}, next: null, parent: null, shadow: false, topLevel: false});
    blocks.moveBlock({id: commandId, newParent: hatId});
    vm.runtime.emitProjectChanged?.();
    if (vm.editingTarget && vm.editingTarget.id === target.id) vm.emitWorkspaceUpdate?.();
    return findTilemapBlocks(vm).find(ref => ref.blockId === commandId) || null;
}
