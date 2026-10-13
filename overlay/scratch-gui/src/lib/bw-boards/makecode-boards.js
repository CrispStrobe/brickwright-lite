/**
 * A multi-board project as MakeCode projects: one per board.
 *
 * Each board's view of the project (model.js) goes through the same exporter a
 * one-board project uses, for that board's own MakeCode target. A board whose
 * device MakeCode does not build is named, not skipped: a pair that silently
 * ran as one board would look like a broken radio.
 */
import {readBoards, boardProject, makeCodeTargetOf} from './model.js';

/**
 * @param {object} project sb3-shaped project JSON with several boards
 * @param {object} opts
 * @param {Function} opts.exportToMakeCode the exporter (lib/bw-makecode)
 * @param {string} [opts.name] the project's name, a prefix of each board's
 * @returns {Array<{name: string, device: string, target: string, files: object}> | null}
 *   null when the project has one board
 * @throws {Error} code NOT_MAKECODE_BOARD, with `board` and `device`
 */
export function boardMakeCodeProjects (project, opts) {
    const boards = readBoards(project);
    if (!boards) return null;
    return boards.map(board => {
        const device = String(board.stc.device || '').toLowerCase();
        const target = makeCodeTargetOf(device);
        if (!target) {
            const err = new Error(`board "${board.name}" is a ${device || 'board with no device'}, which MakeCode does not build`);
            err.code = 'NOT_MAKECODE_BOARD';
            err.board = board.name;
            err.device = device;
            throw err;
        }
        const name = opts.name ? `${opts.name} — ${board.name}` : board.name;
        const files = opts.exportToMakeCode(boardProject(project, board.name), {name}).files;
        if (target === 'calliopemini') {
            // As for a one-board Calliope project: the export's pxt.json is the
            // micro:bit's; the Calliope's firmware base is for its default set.
            const cfg = JSON.parse(files['pxt.json']);
            cfg.dependencies = {core: '*', radio: '*'};
            return {name: board.name, device, target, files: {...files, 'pxt.json': `${JSON.stringify(cfg, null, 4)}\n`}};
        }
        return {name: board.name, device, target, files};
    });
}
