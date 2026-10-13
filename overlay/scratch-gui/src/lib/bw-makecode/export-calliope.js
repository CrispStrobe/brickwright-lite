/**
 * Blocks -> MakeCode for Calliope mini TypeScript (task A6 of
 * docs/OPEN-TASKS-2026-09-29.md).
 *
 * makecode.calliope.cc is a pxt-microbit derivative and shares the micro:bit
 * API this exporter writes (`basic.*`, `input.*`, `led.*`, `music.*`,
 * `pins.*`, `radio.*`), so the micro:bit walk (export.js's Emitter) is reused
 * whole. Where pxt-calliope differs, this file says so:
 *
 *   - `pauseUntil` (the `wait until` block) is pxt-microbit's own (core
 *     poll.ts); pxt-calliope 3.0.30 has no such function, so a `wait until`
 *     is written as the polling loop it stands for. Measured: the Calliope
 *     corpus program calliope-images.hex failed to compile with
 *     "Cannot find name 'pauseUntil'" until this.
 *   - the new-project packages are pxt-calliope's (`core`, `radio`).
 *
 * @module
 */

import {Emitter, projectToMakeCodeTs, makeCodeSourceHex} from './export.js';

/** How often a `wait until` re-tests its condition, in milliseconds. */
export const CALLIOPE_POLL_MS = 20;

class CalliopeEmitter extends Emitter {
    statement (b, indent, out) {
        if (b.opcode === 'control_wait_until') {
            const pad = '    '.repeat(indent);
            out.push(`${pad}while (!(${this.condition(b, 'CONDITION')})) {`,
                `${pad}    basic.pause(${CALLIOPE_POLL_MS})`,
                `${pad}}`);
            return;
        }
        super.statement(b, indent, out);
    }
}

/** @returns {{ts: string, unsupported: Array<string>}} */
export function projectToCalliopeTs (project) {
    return projectToMakeCodeTs(project, {Emitter: CalliopeEmitter});
}

/**
 * The project as MakeCode for Calliope mini files.
 *
 * @param {object} project an sb3 project
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {{ts: string, files: object, unsupported: Array<string>, hex: string}}
 */
export function exportToMakeCodeCalliope (project, opts = {}) {
    const name = opts.name || 'brickwright';
    const {ts, unsupported} = projectToCalliopeTs(project);
    const files = {
        'main.ts': ts,
        'main.blocks': '',
        'pxt.json': `${JSON.stringify({
            name,
            description: 'Exported from BrickWright',
            dependencies: {core: '*', radio: '*'},
            files: ['main.ts', 'main.blocks', 'pxt.json'],
            preferredEditor: 'tsprj'
        }, null, 4)}\n`,
        'README.md': `# ${name}\n\nExported from BrickWright.\n`
    };
    return {
        ts,
        files,
        unsupported,
        hex: makeCodeSourceHex(files, {name, target: 'calliopemini', editorUrl: 'https://makecode.calliope.cc/'})
    };
}

export default exportToMakeCodeCalliope;
