/**
 * One door for "the user gave us a file that came out of some other
 * editor" — a MakeCode .hex/.uf2/.elf/.png, or a micro:bit MicroPython
 * .hex from python.microbit.org.
 *
 * WHAT THE CALLER GETS, AND WHY IT IS SHAPED LIKE THIS
 * ---------------------------------------------------
 * The Code tab already thinks in {lang, code}: one buffer per language,
 * routed by file extension. An imported artefact resolves to exactly
 * that pair plus the provenance needed to say something true in the
 * status line — because the interesting cases are the ones where we can
 * read the file but cannot yet run it, and a status line that admits
 * that is worth more than a silent half-import.
 *
 * The three honest outcomes:
 *   micropython — the .py is the program; our simulator runs it as-is.
 *   makecode     — the project source is recovered; what we DO with it
 *                  depends on the target (see `note`).
 *   (throw)      — a file we can name but not read, e.g. a CircuitPython
 *                  UF2, which carries no source at all.
 *
 * @module
 */

import {
    sniffFormat,
    unpackMakeCodeSource,
    describeProject
} from './embedded-source.js';
import {decodePng} from './png.js';
import {extractMicroPython} from './micropython-hex.js';

export {sniffFormat, unpackMakeCodeSource, describeProject} from './embedded-source.js';
export {decodePng} from './png.js';
export {extractMicroPython} from './micropython-hex.js';
export {lzmaDecode} from './lzma.js';
export {parseShareId, fetchSharedProject} from './share.js';

export {IMPORT_ACCEPT, isImportableArtefact} from './accept.js';

/**
 * The main entry point in the file's own name.
 *
 * @param {Uint8Array} bytes
 * @param {object} [opts]
 * @param {string} [opts.name] the filename, for messages only
 * @returns {Promise<{
 *   kind: 'micropython'|'makecode',
 *   format: string,
 *   lang: string,
 *   code: string,
 *   files: Object<string, string>,
 *   project: {target: string, name: string, version: string},
 *   note: string
 * }>}
 */
export async function importArtefact (bytes, opts = {}) {
    const format = sniffFormat(bytes);
    const name = opts.name || '';

    // MicroPython first, and only for hexes: it is a cheap fixed-address
    // check, and a hex that has a Python script in it is never also a
    // MakeCode project. Getting this order wrong would mean offering to
    // "convert" a program we could simply have run.
    if (format === 'hex') {
        const upy = extractMicroPython(bytes);
        if (upy) {
            const main = upy.files['main.py'] || Object.values(upy.files)[0] || '';
            return {
                kind: 'micropython',
                format,
                lang: 'micropython',
                code: main,
                files: upy.files,
                project: {target: 'microbit', name: name.replace(/\.[^.]+$/, ''), version: ''},
                note: upy.variant === 'appended' ? 'appended-script' : 'filesystem'
            };
        }
    }

    const res = await unpackMakeCodeSource(bytes, {decodePng});
    const project = describeProject(res.meta);
    const files = res.files || {};
    const main = files['main.ts'] || files['main.py'] || res.source;
    const lang = files['main.ts'] ? 'javascript' : (files['main.py'] ? 'micropython' : 'javascript');

    return {
        kind: 'makecode',
        format: res.format,
        lang,
        code: main,
        files,
        project: {target: project.target, name: project.name || name, version: project.version},
        note: project.target === 'arcade' ? 'arcade' : 'microbit'
    };
}

export default importArtefact;
