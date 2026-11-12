/**
 * Which MakeCode extension does a program's source need?
 *
 * A bare `.ts` (no pxt.json), or one whose pxt.json does not list the
 * dependency, still calls `turtle.forward(1)`. Dropping that call because the
 * extension is not declared silently changes the program, so the top-level
 * names a program uses are looked up here:
 *
 *   1. the extensions this build vendors (extensions-vendored.js), by the
 *      namespaces, enums and classes their sources declare at top level;
 *   2. a curated table of well-known extensions this build does not vendor
 *      (CURATED_ALIASES), consulted by the opt-in fetch (extension-ondemand.js);
 *   3. anything else is reported by name, never dropped: see
 *      unavailableNamespaces().
 *
 * Plain functions, no Node or DOM APIs.
 */
import {VENDORED_EXTENSIONS} from './extensions-vendored.js';

const textOf = file => typeof file === 'string' ? file : file && typeof file.text === 'string' ? file.text : '';

/** Source with comments, strings and template literals blanked (newlines kept). */
export function stripNonCode (source) {
    return String(source).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\[\s\S])*`/g,
        text => text.replace(/[^\n]/g, ' '));
}

/**
 * The names an extension's sources declare at the top level (column 0, after
 * the optional `export`/`declare`): namespaces, enums and classes.
 */
export function declaredSymbols (sources) {
    const out = new Set();
    for (const source of sources) {
        const code = stripNonCode(source);
        for (const m of code.matchAll(/^(?:export\s+)?(?:declare\s+)?(?:const\s+)?(?:namespace|enum|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
    }
    return [...out];
}

/** The `.ts` sources an extension's files list names, in pxt.json order (test files excluded). */
export function extensionSources (files) {
    let listed = [];
    try { listed = JSON.parse(textOf(files['pxt.json'])).files || []; } catch { listed = []; }
    return listed.filter(f => /\.ts$/i.test(f) && !/(^|\/)(test|tests)\.ts$/i.test(f) && !/(^|\/)_locales\//.test(f) &&
        files[f] !== undefined).map(f => ({file: f, source: textOf(files[f])}));
}

/**
 * Names the target's own libraries declare. An extension may augment them
 * (`namespace sprites { ... }`, `namespace SpriteKind { ... }`), which says
 * nothing about the program needing that extension, so they never resolve.
 */
export const CORE_SYMBOLS = new Set(['SpriteKind', 'sprites', 'scene', 'info', 'controller', 'game', 'tiles', 'effects',
    'animation', 'assets', 'color', 'music', 'Math', 'Image', 'Sprite', 'basic', 'input', 'led', 'pins', 'radio', 'images',
    'serial', 'control', 'loops', 'logic', 'text', 'console', 'bluetooth', 'datalogger', 'servos', 'power', 'DisplayMode',
    'Button', 'Dimension', 'Gesture', 'String', 'Array', 'Number', 'Boolean', 'Buffer', 'Note', 'Direction']);

const targetOf = entry => entry.target || (entry.targets && entry.targets[0]) || 'microbit';
const sameFamily = (entry, target) => targetOf(entry) === target ||
    (targetOf(entry) === 'microbit' && target === 'calliopemini');

const indexOf = entries => {
    const map = new Map();
    for (const entry of entries) {
        const files = entry.files || {};
        for (const symbol of declaredSymbols(extensionSources(files).map(f => f.source))) {
            if (CORE_SYMBOLS.has(symbol)) continue;
            if (!map.has(symbol)) map.set(symbol, []);
            map.get(symbol).push(entry);
        }
    }
    return map;
};

/**
 * Top-level name -> vendored extension id, derived from what the vendored
 * sources declare, so adding an extension to the sync adds its aliases.
 */
export const NAMESPACE_ALIASES = Object.freeze(Object.fromEntries(
    [...indexOf(VENDORED_EXTENSIONS)].map(([symbol, entries]) => [symbol, entries.map(e => e.id)])));

/**
 * Extensions MakeCode's approved list offers that this build does not vendor,
 * keyed by the top-level namespace they declare: `repo` is the approved-list
 * key (lower case). Only the opt-in fetch uses it, to find the repository;
 * the namespace must still be declared in the fetched sources. Entries are
 * added when a program in the surveyed corpus needs one.
 */
export const CURATED_ALIASES = Object.freeze({
    grove: {repo: 'seeed-studio/pxt-grove', targets: ['microbit']},
    maqueen: {repo: 'dfrobot/pxt-maqueen', targets: ['microbit']},
    cuteBot: {repo: 'elecfreaks/pxt-cutebot', targets: ['microbit']},
    bitbot: {repo: '4tronix/bitbot', targets: ['microbit']},
    robotbit: {repo: 'kittenbot/pxt-robotbit', targets: ['microbit']},
    kitronik_servo_lite: {repo: 'kitronikltd/pxt-kitronik-servo-lite', targets: ['microbit']}
});

const BUILTIN_GLOBALS = new Set(['Math', 'console', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Date',
    'Symbol', 'Promise', 'Error', 'this', 'super', 'window', 'document', 'globalThis', 'Infinity', 'NaN']);

/** Top-level names the program uses as `name.member`, minus names it declares itself. */
export function usedNames (source) {
    const code = stripNonCode(source);
    const local = new Set();
    for (const m of code.matchAll(/\b(?:let|const|var|function|class|enum|namespace|type|interface)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    // Parameters and destructured names of functions/arrow functions.
    for (const line of code.split('\n')) {
        if (!/\bfunction\b|=>/.test(line)) continue;
        for (const m of line.matchAll(/[(,]\s*([A-Za-z_$][\w$]*)\s*(?::[^,)=]*)?(?=[,)=])/g)) local.add(m[1]);
        for (const m of line.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) local.add(m[1]);
    }
    for (const m of code.matchAll(/\bfor\s*\(\s*(?:let|const|var)\s+([A-Za-z_$][\w$]*)/g)) local.add(m[1]);
    const used = new Map();
    for (const m of code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\.\s*[A-Za-z_$]/g)) {
        const name = m[1];
        if (local.has(name) || BUILTIN_GLOBALS.has(name)) continue;
        used.set(name, (used.get(name) || 0) + 1);
    }
    return used;
}

/** Which dependency ids a pxt.json (text or object) already lists. */
export function declaredDependencies (pxtJson) {
    try {
        const cfg = typeof pxtJson === 'string' ? JSON.parse(pxtJson) : pxtJson;
        const deps = cfg && cfg.dependencies;
        return deps && typeof deps === 'object' && !Array.isArray(deps) ? {...deps} : {};
    } catch { return {}; }
}

/**
 * Resolve the extensions a program needs.
 *
 * @param {object} args
 * @param {Object<string,string>} args.files the project files (main.ts, optional pxt.json)
 * @param {string} args.target 'microbit' | 'arcade' | 'calliopemini' | ...
 * @param {object[]} [args.extensions] more extension entries to resolve against (fetched ones), same shape as the vendored entries
 * @returns {{extensions: object[], dependencies: object, unresolved: {namespace: string, message: string, curated: object|null}[]}}
 *   `extensions` are the entries the program needs ({id, spec, via: 'vendored'|'fetched', declared: bool, symbols});
 *   `dependencies` are the pxt.json dependencies to ADD (detected, not yet declared);
 *   `unresolved` are names that look like extension namespaces and no known extension provides.
 */
export function resolveExtensionNamespaces ({files = {}, target = 'microbit', extensions = []} = {}) {
    const source = Object.entries(files).filter(([name]) => /\.ts$/i.test(name) && !/^__bw/.test(name))
        .map(([, text]) => textOf(text)).join('\n');
    const used = usedNames(source);
    const declared = declaredDependencies(files['pxt.json']);
    const pool = [...extensions, ...VENDORED_EXTENSIONS].filter(entry => sameFamily(entry, target));
    const index = indexOf(pool);
    // The program's own top-level declarations shadow an extension's names.
    const own = new Set(declaredSymbols([source]));
    const picked = new Map(), unresolved = [];
    const ofDeclared = new Set(pool.filter(e => Object.keys(declared).includes(e.id) ||
        Object.values(declared).some(spec => typeof spec === 'string' && e.spec && spec.toLowerCase().replace(/#.*/, '') === e.spec.toLowerCase().replace(/#.*/, ''))).map(e => e.id));
    for (const [name] of used) {
        if (own.has(name)) continue;
        const hit = index.get(name);
        if (hit) {
            const entry = hit.find(e => ofDeclared.has(e.id)) || hit[0];
            const row = picked.get(entry.id) || {id: entry.id, spec: entry.spec, entry, symbols: [],
                via: extensions.includes(entry) ? 'fetched' : 'vendored', declared: ofDeclared.has(entry.id)};
            row.symbols.push(name);
            picked.set(entry.id, row);
        } else if (Object.prototype.hasOwnProperty.call(CURATED_ALIASES, name) && sameFamily({target: CURATED_ALIASES[name].targets?.[0]}, target)) {
            unresolved.push({namespace: name, message: unavailableMessage(name), curated: CURATED_ALIASES[name]});
        }
    }
    const dependencies = {};
    for (const row of picked.values()) if (!row.declared) dependencies[row.id] = row.spec;
    return {extensions: [...picked.values()], dependencies, unresolved};
}

/** The explicit diagnostic for a namespace no extension provides. */
export function unavailableMessage (namespace) {
    return `extension namespace ${namespace} not available`;
}

/**
 * Names a translator reported as unsupported (`turtle.forward()`, ...) whose
 * top-level namespace is not provided by a resolved extension and not declared
 * in the program: the explicit "extension namespace X not available" rows.
 * `knownCore` names are the target's own namespaces (basic, led, ...) and are
 * never reported here.
 */
export function unavailableNamespaces ({unsupported = [], source = '', resolved = [], knownCore = new Set()}) {
    const own = new Set(declaredSymbols([source]));
    const provided = new Set(resolved.flatMap(r => r.symbols || []));
    const out = new Map();
    for (const line of unsupported) {
        const m = /^([A-Za-z_$][\w$]*)\.[A-Za-z_$][\w$]*\s*\(/.exec(String(line));
        if (!m) continue;
        const name = m[1];
        if (own.has(name) || provided.has(name) || knownCore.has(name) || BUILTIN_GLOBALS.has(name)) continue;
        if (usedNames(source).has(name)) out.set(name, unavailableMessage(name));
    }
    return [...out].map(([namespace, message]) => ({namespace, message}));
}
