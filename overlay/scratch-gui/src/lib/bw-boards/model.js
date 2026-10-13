/**
 * Several boards in one project.
 *
 * A board is a layer above sprites: it has its own hardware block (`stc`), its
 * own program and its own sprites. The compiler writes the list as
 * `project.boards = [{name, stc, targets}]` and, because scratch-vm's
 * serializer drops every top-level key it does not know, mirrors it into a
 * Stage comment. This module reads that list from either place and answers the
 * one question every consumer has: WHICH TARGETS ARE THIS BOARD'S.
 *
 * A project with one board has no list. Every function here then says so
 * (`null`, or the project itself) and the caller does what it always did.
 */

/** Marker of the Stage comment that carries the list (the compiler's BOARDS_MAGIC). */
export const BOARDS_MAGIC = '_stcboards_';

const wellFormed = boards => Array.isArray(boards) && boards.length > 0 && boards.every(b =>
    b && typeof b.name === 'string' && b.stc && typeof b.stc === 'object' && Array.isArray(b.targets));

/**
 * The boards of a project, or null when it has one board.
 * @param {object} project sb3-shaped project JSON
 * @returns {Array<{name: string, stc: object, targets: Array<string>}> | null}
 */
export function readBoards (project) {
    if (!project) return null;
    if (Array.isArray(project.boards)) return wellFormed(project.boards) ? project.boards : null;
    const stage = Array.isArray(project.targets) ? project.targets.find(t => t.isStage) : null;
    if (!stage || !stage.comments) return null;
    for (const comment of Object.values(stage.comments)) {
        const text = comment && typeof comment.text === 'string' ? comment.text : '';
        const at = text.indexOf(BOARDS_MAGIC);
        if (at === -1) continue;
        try {
            const boards = JSON.parse(text.slice(at + BOARDS_MAGIC.length));
            return wellFormed(boards) ? boards : null;
        } catch {
            return null; // a corrupt comment is no list, not an invented one
        }
    }
    return null;
}

/**
 * The targets of one board, in project order.
 *
 * The first board owns the Stage and every sprite no board lists (a sprite
 * added in the editor belongs somewhere, and the first board is where the
 * decompiler writes it). A later board owns exactly the sprites it lists; the
 * one named after the board holds the scripts written directly under its header.
 * @param {object} project sb3-shaped project JSON
 * @param {Array<object>} boards the list from readBoards
 * @param {string} name the board's name
 * @returns {Array<object>} targets (empty when no board has that name)
 */
export function boardTargets (project, boards, name) {
    const index = boards.findIndex(b => b.name === name);
    if (index < 0) return [];
    const claimed = new Set();
    boards.forEach((b, i) => {
        if (i) claimed.add(b.name);
        for (const n of b.targets) claimed.add(n);
    });
    const own = new Set(boards[index].targets);
    return (project.targets || []).filter(t => {
        if (t.isStage) return index === 0;
        if (own.has(t.name)) return true;
        return index === 0 && !claimed.has(t.name);
    });
}

/**
 * One board's view of the project: its targets and its hardware block, in the
 * shape every single-board consumer (an exporter, a code generator) already
 * takes. The project itself is returned when it has one board.
 * @param {object} project sb3-shaped project JSON
 * @param {string} [name] the board; the first board when omitted
 * @returns {object | null} null when the project has boards and none has that name
 */
export function boardProject (project, name) {
    const boards = readBoards(project);
    if (!boards) return project;
    const board = name === undefined ? boards[0] : boards.find(b => b.name === name);
    if (!board) return null;
    const view = {...project, targets: boardTargets(project, boards, board.name), stc: board.stc};
    delete view.boards;
    return view;
}

/** The MakeCode target a board's device compiles for, or null when it is not a MakeCode board. */
export function makeCodeTargetOf (device) {
    return {microbit: 'microbit', calliopemini: 'calliopemini'}[String(device || '').toLowerCase()] || null;
}
