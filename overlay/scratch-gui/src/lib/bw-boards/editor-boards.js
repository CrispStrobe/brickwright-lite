/**
 * Several boards in the editor: what the board strip above the sprite list
 * needs from a loaded project.
 *
 * The loaded project carries the board list in a Stage comment (model.js). The
 * strip shows one chip per board; choosing one narrows the sprite list to that
 * board's sprites and announces that board's device, so the palette and the
 * panes gate on the board being edited. The project's saved hardware block
 * (`runtime.stc`) is NOT changed: it stays the first board's, which is what a
 * save and the decompiler expect.
 *
 * A project with one board has no list; every function then answers null or
 * returns its input, and the pane renders as it always did.
 */
import {boardsFromComments, ownsSprite} from './model.js';

/**
 * The boards of the loaded project, or null when it has one board.
 * @param {object} runtime the VM runtime
 * @returns {Array<{name: string, stc: object, targets: Array<string>}> | null}
 */
export function runtimeBoards (runtime) {
    const stage = runtime && typeof runtime.getTargetForStage === 'function' ? runtime.getTargetForStage() : null;
    const boards = stage ? boardsFromComments(stage.comments) : null;
    return boards && boards.length > 1 ? boards : null;
}

/**
 * The sprites of one board, in the shape the sprite list takes.
 * @param {object} sprites the editor's sprites, by target id (each has `name` and `order`)
 * @param {Array<object>} boards the list from runtimeBoards
 * @param {number} index the board's position in the list
 * @returns {object} the board's sprites, by target id
 */
export function boardSprites (sprites, boards, index) {
    const own = {};
    for (const id of Object.keys(sprites || {})) {
        if (ownsSprite(boards, index, sprites[id].name)) own[id] = sprites[id];
    }
    return own;
}

/**
 * A position in a board's sprite list as a position among ALL sprites, which is
 * what reordering works in. A drop past the board's last sprite lands right
 * after that sprite, not at the end of the project.
 * @param {object} shown the board's sprites (from boardSprites)
 * @param {number} position a position in the shown list
 * @returns {number} the position among all sprites (unchanged when nothing is shown)
 */
export function projectPosition (shown, position) {
    const orders = Object.values(shown || {}).map(s => s.order)
        .sort((a, b) => a - b);
    if (!orders.length) return position;
    if (position >= orders.length) return orders[orders.length - 1] + (position - orders.length + 1);
    return orders[Math.max(0, position)];
}

/**
 * Announce a board's device the way applying a program's device does: runtime
 * flags, the settings event the panes listen for, and a palette refresh.
 * @param {object} vm the VM
 * @param {object} board a board from runtimeBoards
 * @param {Function} coreOf device id -> core id (or undefined)
 * @returns {string} the device id announced ('' when the board names none)
 */
export function publishBoardDevice (vm, board, coreOf) {
    const device = typeof board?.stc?.device === 'string' ? board.stc.device.toLowerCase() : '';
    const runtime = vm && vm.runtime;
    if (runtime) {
        runtime.bwDeviceCore = (device && coreOf(device)) || null;
        runtime.bwDeviceId = device || null;
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-device-id', value: device}}));
    }
    const manager = vm && vm.extensionManager;
    if (manager && typeof manager.refreshBlocks === 'function') {
        Promise.resolve(manager.refreshBlocks()).catch(() => {});
    }
    return device;
}
