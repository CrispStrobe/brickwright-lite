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
import {microbitToPseudocode} from './microbit-translate.js';
import {arcadeToPseudocode} from './arcade-translate.js';
import {fetchSharedProject, parseShareId} from './share.js';

export {sniffFormat, unpackMakeCodeSource, describeProject} from './embedded-source.js';
export {decodePng} from './png.js';
export {extractMicroPython} from './micropython-hex.js';
export {lzmaDecode} from './lzma.js';
export {parseShareId, fetchSharedProject} from './share.js';
export {microbitToPseudocode} from './microbit-translate.js';
export {arcadeToPseudocode} from './arcade-translate.js';
export {parseImageLiteral, parseJres, imageToSvg, ARCADE_PALETTE} from './arcade-assets.js';
export {exportToMakeCode, projectToMakeCodeTs, makeCodeSourceHex} from './export.js';
export {parseMakeCodeTs} from './ts-import.js';

export {IMPORT_ACCEPT, isImportableArtefact} from './accept.js';

/**
 * Which editor a project came from, when nothing authoritative says so.
 *
 * A share link's `pxt.json` carries `targetVersions.target`, which is a
 * VERSION NUMBER, not a target name — so for shares the answer has to
 * come from the URL's host or, failing that, from the vocabulary the
 * code actually uses. Both are better than guessing "microbit" and
 * translating a game against the wrong table.
 *
 * @param {Object<string, string>} files
 * @param {string} [hint] a URL or host the project came from
 * @returns {string}
 */
export function inferTarget (files = {}, hint = '') {
    if (/arcade/.test(hint)) return 'arcade';
    if (/microbit/.test(hint)) return 'microbit';
    if (/calliope/.test(hint)) return 'calliopemini';
    const source = files['main.ts'] || '';
    if (/\b(sprites\.create|scene\.|controller\.|tiles\.|info\.setScore)/.test(source)) return 'arcade';
    if (/\b(basic\.|input\.on|pins\.digital|radio\.|led\.plot)/.test(source)) return 'microbit';
    return 'unknown';
}

/**
 * Shape a recovered project — from a file, a share link, anywhere — into
 * what the Code tab takes. The translation choice lives HERE rather than
 * in each caller so a share and a .hex of the same game cannot end up
 * being treated differently.
 *
 * @param {Object<string, string>} files
 * @param {object} [opts]
 * @param {string} [opts.target]
 * @param {string} [opts.name]
 * @returns {object} the same shape importArtefact returns
 */
export function importProjectFiles (files = {}, opts = {}) {
    const target = opts.target || inferTarget(files);
    const name = opts.name || '';
    const main = files['main.ts'] || files['main.py'] || '';

    if (target === 'microbit' && files['main.ts']) {
        const translated = microbitToPseudocode(files['main.ts'], {name});
        return {
            kind: 'makecode',
            lang: 'pseudocode',
            code: translated.code,
            source: main,
            unsupported: translated.unsupported,
            costumes: [],
            files,
            project: {target, name, version: opts.version || ''},
            note: 'microbit'
        };
    }
    // An Arcade game becomes a PLAYABLE Scratch project: its sprite model
    // maps onto the stage's closely enough to be worth translating, and
    // its artwork becomes costumes. What does not survive is listed, not
    // dropped — see arcade-translate.js.
    if (target === 'arcade' && files['main.ts']) {
        const translated = arcadeToPseudocode(files, {name});
        return {
            kind: 'makecode',
            lang: 'pseudocode',
            code: translated.code,
            source: main,
            unsupported: translated.unsupported,
            costumes: translated.costumes,
            sprites: translated.sprites,
            files,
            project: {target, name, version: opts.version || ''},
            note: 'arcade'
        };
    }
    return {
        kind: 'makecode',
        lang: files['main.py'] ? 'micropython' : 'javascript',
        code: main,
        source: main,
        unsupported: [],
        costumes: [],
        files,
        project: {target, name, version: opts.version || ''},
        note: 'other'
    };
}

/**
 * Import from a MakeCode share link. Needs the network; the file
 * importer is what works offline and in the packaged app.
 *
 * @param {string} input a share URL or bare id
 * @param {object} [opts] passed through to fetchSharedProject
 * @returns {Promise<object>} the same shape importArtefact returns
 */
export async function importShareLink (input, opts = {}) {
    const shared = await fetchSharedProject(input, opts);
    const result = importProjectFiles(shared.files, {
        target: inferTarget(shared.files, String(input)),
        name: shared.meta.name || shared.id
    });
    result.format = 'share';
    result.shareId = shared.id;
    return result;
}

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
 *   source: string,
 *   unsupported: Array<string>,
 *   costumes: Array<{sprite: string, name: string, svg: string, mode: string}>,
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
    const shaped = importProjectFiles(files, {
        target: project.target === 'unknown' ? inferTarget(files) : project.target,
        name: project.name || name,
        version: project.version
    });
    shaped.format = res.format;
    if (!files['main.ts'] && !files['main.py']) shaped.code = res.source;
    return shaped;
}

export default importArtefact;
