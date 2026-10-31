import {usedNames, declaredSymbols, CORE_SYMBOLS, NAMESPACE_ALIASES} from './extension-namespaces.js';
import {ARCADE_NAMESPACE_MEMBERS} from './arcade-namespace-members.js';

/**
 * Names a program uses whose source is not part of it: a user namespace or an
 * asset gallery that lived in a file we were not given. PXT would refuse to
 * compile such a name; Brickwright keeps it BY NAME (a qualified path) so
 * export writes the same TypeScript back, and runs it as an inert stand-in
 * (a call is a no-op that reports 0, a value reads 0, an image is a 1x1
 * transparent picture, a callback never fires).
 *
 * A root is external only when nothing the program, the Arcade SDK or a
 * vendored extension declares carries its name.
 */
let externalRoots = new Set();

const SOURCE_FILE = /\.ts$/;

/** SDK namespaces user code commonly extends from another file. */
const SDK_EXTENSIBLE = new Set(['sprites', 'game', 'scene', 'info', 'tiles', 'controller', 'effects']);

/** Compute and install the roots for one translation. Synchronous, set per call. */
export function setExternalRoots (files, source) {
    const declared = new Set(declaredSymbols(Object.entries(files || {})
        .filter(([name, text]) => SOURCE_FILE.test(name) && typeof text === 'string').map(([, text]) => text)));
    const roots = new Set();
    for (const name of usedNames(source).keys()) {
        if (CORE_SYMBOLS.has(name) || declared.has(name) || Object.hasOwn(ARCADE_NAMESPACE_MEMBERS, name) ||
            Object.hasOwn(NAMESPACE_ALIASES, name)) continue;
        roots.add(name);
    }
    externalRoots = roots;
    return roots;
}

export const isExternalRoot = name => externalRoots.has(name);

/** The asset-literal spellings the project may reference without carrying the asset. */
const ASSET_TAGS = /^assets\.(?:image|animation|song|tile|tilemap)$/;

/** The source spelling of an asset literal such as assets.song`name`, or null if it cannot be kept verbatim. */
export const externalAssetText = (tag, value) => ASSET_TAGS.test(String(tag || '')) && /^[^`\\]*$/.test(String(value ?? '').trim()) ?
    `${tag}\`${String(value).trim()}\`` : null;

/** A node standing for an asset the project does not carry: a Member the translator keeps by its literal text. */
export const externalAssetNode = (tag, value) => {
    const text = externalAssetText(tag, value);
    return text ? {type: 'Member', object: {type: 'Identifier', name: '__bwExternalAsset'}, name: text, bwExternalAsset: true} : null;
};

/** The dotted path `a.b.c` of a pure member chain rooted at an external name, else null. */
export function externalPath (node) {
    if (node?.bwExternalAsset) return node.name;
    const parts = [];
    let current = node;
    while (current?.type === 'Member') {
        parts.unshift(current.name);
        current = current.object;
    }
    if (current?.type !== 'Identifier' || !parts.length) return null;
    if (!externalRoots.has(current.name)) {
        // A member a missing file added to an SDK namespace (`namespace sprites { export function f() }`): the SDK
        // does not declare it, and nothing in the program does either.
        const members = Object.hasOwn(ARCADE_NAMESPACE_MEMBERS, current.name) ? ARCADE_NAMESPACE_MEMBERS[current.name] : null;
        if (!members || parts.length !== 1 || !SDK_EXTENSIBLE.has(current.name) || members.some(([name]) => name === parts[0])) return null;
    }
    return [current.name, ...parts].join('.');
}

export const EXTERNAL_NAME = /^(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+|assets\.(?:image|animation|song|tile|tilemap)`[^`\\]*`)$/;
