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
import {microbitToPseudocode, MAKECODE_NAMESPACES} from './microbit-translate.js';
import {resolveExtensionNamespaces, extensionSources, unavailableNamespaces} from './extension-namespaces.js';
import {arcadeToPseudocode} from './arcade-translate.js';
import {ev3ToPseudocode} from './ev3-translate.js';
import {adafruitToPseudocode} from './adafruit-translate.js';
import {fetchSharedProject} from './share.js';
import {importDependencyProjectFiles} from './dependency-import.js';
import {fetchNamespaceExtensions} from './extension-ondemand.js';

export {sniffFormat, unpackMakeCodeSource, describeProject} from './embedded-source.js';
export {decodePng} from './png.js';
export {extractMicroPython} from './micropython-hex.js';
export {lzmaDecode} from './lzma.js';
export {parseShareId, fetchSharedProject} from './share.js';
export {microbitToPseudocode} from './microbit-translate.js';
export {arcadeToPseudocode} from './arcade-translate.js';
export {ev3ToPseudocode} from './ev3-translate.js';
export {adafruitToPseudocode} from './adafruit-translate.js';
export {exportToMakeCodeEv3, projectToEv3Ts} from './export-ev3.js';
export {exportToMakeCodeCalliope, projectToCalliopeTs} from './export-calliope.js';
export {parseImageLiteral, parseJres, imageToSvg, ARCADE_PALETTE} from './arcade-assets.js';
export {exportToMakeCode, projectToMakeCodeTs, makeCodeSourceHex} from './export.js';
export {parseMakeCodeTs} from './ts-import.js';

export {makeCodeProjectFile} from './project-file.js';
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
    if (/ev3/.test(hint)) return 'ev3';
    if (/adafruit/.test(hint)) return 'adafruit';
    // The target VERSION in this manifest is not a target name, but its
    // board package identifies CPX even when the source uses shared input APIs.
    try {
        const config = JSON.parse(files['pxt.json'] || '{}');
        const boardPackage = config?.dependencies?.['circuit-playground'];
        if (typeof boardPackage === 'string' && boardPackage.trim()) return 'adafruit';
    } catch { /* Malformed metadata supplies no target evidence. */ }
    const source = files['main.ts'] || '';
    const cpxSource = source.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
        text => text.startsWith('`') ? [...text.matchAll(/\$\{([\s\S]*?)\}/g)].map(m => m[1]).join(' ') : ' ');
    if (/\b(motors\.(large|medium)[A-D]|sensors\.(touch|color|ultrasonic|gyro|infrared)[1-4]|brick\.(show|button|setStatusLight))/.test(source)) return 'ev3';
    if (/\b(sprites\.create|scene\.|controller\.|tiles\.|info\.setScore)/.test(source)) return 'arcade';
    if (/\b(light\.|input\.(button[AB]|buttonsAB|switchRight)\b|CPlayPinName\b|music\.(baDing|magicWand|siren)\b)/.test(cpxSource)) return 'adafruit';
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
    let target = opts.target || inferTarget(files);
    // Unknown container metadata is not a positive target identity. Recover
    // CPX from its distinct vocabulary without changing other target routes.
    if (target === 'unknown' && inferTarget(files) === 'adafruit') target = 'adafruit';
    const name = opts.name || '';
    const main = files['main.ts'] || files['main.py'] || '';

    if (target === 'adafruit') {
        const reason = files['main.py'] ? 'main.py — CPX MakeCode Python translation is not implemented'
            : 'CPX source — no main.ts was recovered for translation';
        const translated = files['main.ts'] ? adafruitToPseudocode(files['main.ts'], {name})
            : {code: `DEVICE CPX\n\n# unsupported: ${reason}\n`, unsupported: [reason]};
        return {
            kind: 'makecode', lang: 'pseudocode', code: translated.code,
            source: main, unsupported: translated.unsupported, costumes: [], files,
            project: {target, name, version: opts.version || ''}, note: 'adafruit'
        };
    }

    // A Calliope mini goes through the micro:bit translator on purpose:
    // makecode.calliope.cc is a pxt-microbit derivative, and `basic.*`,
    // `input.*`, `led.*`, `music.*`, `pins.*` and `radio.*` are the same
    // API. What is genuinely Calliope's own — the RGB LED, the image
    // helpers, the LED-sprite game library — is refused by name, so the
    // shared 90% arrives and the rest is visible rather than invented.
    if ((target === 'microbit' || target === 'calliopemini') && files['main.ts']) {
        // Extensions the program uses, declared in its pxt.json or not: their
        // sources are translated with it, and a namespace no extension provides
        // is named in `unsupported`, never dropped.
        const ext = resolveExtensionNamespaces({files, target, extensions: opts.extensions || []});
        const sources = ext.extensions.flatMap(row => extensionSources(row.entry.files).map(f => ({id: row.id, file: f.file, source: f.source})));
        const translated = microbitToPseudocode(files['main.ts'], {name, board: target, extensionSources: sources});
        const missing = [...ext.unresolved, ...unavailableNamespaces({unsupported: translated.unsupported, source: files['main.ts'],
            resolved: ext.extensions, knownCore: MAKECODE_NAMESPACES})];
        const missingMessages = [...new Set([...missing.map(row => row.message), ...(opts.extensionRefusals || []).map(r => r.message)])];
        const code = missingMessages.length ?
            translated.code.replace(/^(DEVICE [^\n]*\n)/, `$1${missingMessages.map(m => `# unsupported: ${m}\n`).join('')}`) : translated.code;
        return {
            kind: 'makecode',
            lang: 'pseudocode',
            code,
            source: main,
            unsupported: [...translated.unsupported, ...missingMessages],
            costumes: [],
            files,
            extensions: ext.extensions.map(({id, spec, via, declared, symbols, entry}) => ({id, spec, via, declared, symbols,
                commit: entry.commit || null, licence: entry.licence || null, holder: entry.holder || null})),
            unavailableExtensions: [...new Set(missing.map(row => row.namespace))],
            project: {target, name, version: opts.version || ''},
            note: 'microbit'
        };
    }
    // An Arcade game becomes a PLAYABLE Scratch project: its sprite model
    // maps onto the stage's closely enough to be worth translating, and
    // its artwork becomes costumes. What does not survive is listed, not
    // dropped — see arcade-translate.js.
    if (target === 'arcade' && files['main.ts']) {
        const translated = arcadeToPseudocode(files, {name, animationResources: opts.animationResources});
        return {
            kind: 'makecode',
            lang: 'pseudocode',
            code: translated.code,
            source: main,
            unsupported: translated.unsupported,
            costumes: translated.costumes,
            animationResources: translated.animationResources,
            warnings: translated.warnings || [],
            sprites: translated.sprites,
            files,
            project: {target, name, version: opts.version || ''},
            note: 'arcade'
        };
    }
    // A LEGO EV3 program becomes DEVICE EV3 pseudocode, whose words are the
    // ev3comprehensive blocks (ev3-translate.js); what has no block is named.
    if (target === 'ev3' && files['main.ts']) {
        const translated = ev3ToPseudocode(files['main.ts'], {name});
        return {
            kind: 'makecode',
            lang: 'pseudocode',
            code: translated.code,
            source: main,
            unsupported: translated.unsupported,
            costumes: [],
            files,
            project: {target, name, version: opts.version || ''},
            note: 'ev3'
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

/** Resolve the CURRENT Arcade dependency graph before translating. The sync
 * reader remains the offline API; this async entrypoint explicitly prepares.
 */
export function importProjectFilesWithDependencies(files = {}, opts = {}) {
    const target = opts.target || inferTarget(files);
    // Extensions the program uses but its pxt.json does not list (or that are not
    // vendored): vendored ones are detected by namespace, synchronously, so the
    // current input is still captured before anything is awaited; with the opt-in
    // fetchExtensions flag the rest are fetched, pinned and licence-checked first.
    const run = fetched => {
        const added = fetched.extensions.length || fetched.refused.length ? {extensions: fetched.extensions, extensionRefusals: fetched.refused} : {};
        const prepared = target === 'arcade' && opts.prepareDependencies !== false ? withNamespaceDependencies(files, target, fetched.extensions) : files;
        return importDependencyProjectFiles(prepared, {...opts, ...added, target}, importProjectFiles)
            .then(result => prepared === files ? result : {...result, files: result.files === prepared ? files : result.files});
    };
    if (opts.fetchExtensions !== true || opts.prepareDependencies === false || typeof files['main.ts'] !== 'string') return run({extensions: [], refused: []});
    return fetchNamespaceExtensions({files, target, fetchExtensions: true, fetch: opts.fetch, cache: opts.extensionCache || null,
        knownCore: MAKECODE_NAMESPACES}).then(run);
}

/** The Arcade project files with the dependencies its namespaces name added to pxt.json. */
function withNamespaceDependencies (files, target, fetched) {
    if (typeof files['main.ts'] !== 'string') return files;
    const found = resolveExtensionNamespaces({files, target, extensions: fetched});
    const dependencies = {...found.dependencies};
    for (const row of found.extensions) if (row.via === 'fetched') dependencies[row.id] = row.spec;
    let cfg = {};
    try { cfg = JSON.parse(files['pxt.json'] || '{}'); } catch { return files; }
    const add = Object.fromEntries(Object.entries(dependencies).filter(([id]) => !cfg.dependencies || !(id in cfg.dependencies)));
    if (files['pxt.json'] && !Object.keys(add).length) return files;
    const next = {...cfg, name: cfg.name || 'project', files: cfg.files || ['main.ts'], dependencies: {device: '*', ...cfg.dependencies, ...add}};
    return {...files, 'pxt.json': JSON.stringify(next)};
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
    const result = await (opts.prepareDependencies === true ? importProjectFilesWithDependencies : importProjectFiles)(shared.files, {
        ...opts,
        animationResources: opts.animationResources,
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
    const format = sniffFormat(bytes, opts);
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

    // A plain AVR hex has no embedded source and never will — it is
    // compiled C++. That is not a failed import, though: if we can RUN it,
    // that is a better answer than "no MakeCode source found". The unpack
    // is tried FIRST so a MakeCode hex is never mistaken for one, and this
    // only ever answers the case where the unpack found nothing.
    let res;
    try {
        res = await unpackMakeCodeSource(bytes, {decodePng, name});
    } catch (noMakeCodeSource) {
        if (format === 'hex') {
            const text = new TextDecoder().decode(bytes);
            const {looksLikeAvrHex} = await import(
                /* webpackChunkName: "bw-arduboy" */ '../bw-arduboy/index.js');
            if (looksLikeAvrHex(text)) {
                return {
                    kind: 'avr-hex',
                    format,
                    lang: 'avr',
                    hex: text,
                    unsupported: [],
                    project: {
                        target: 'arduboy',
                        name: name.replace(/\.[^.]+$/, ''),
                        version: ''
                    }
                };
            }
        }
        throw noMakeCodeSource;
    }
    const project = describeProject(res.meta);
    const files = res.files || {};
    const shaped = await (opts.prepareDependencies === true ? importProjectFilesWithDependencies : importProjectFiles)(files, {
        ...opts,
        animationResources: opts.animationResources,
        target: project.target === 'unknown' ? inferTarget(files) : project.target,
        name: project.name || name,
        version: project.version
    });
    shaped.format = res.format;
    if (!files['main.ts'] && !files['main.py']) shaped.code = res.source;
    return shaped;
}

export default importArtefact;
