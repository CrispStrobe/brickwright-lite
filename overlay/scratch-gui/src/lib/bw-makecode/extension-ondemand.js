/**
 * On-the-fly extensions for the namespace-driven import (opt-in).
 *
 * A program uses `foo.bar()` and no vendored extension declares `foo`, or its
 * pxt.json names a `github:` dependency this build does not vendor. With
 * `fetchExtensions: true` (never the default; CI and tests do not set it) the
 * extension is looked up through MakeCode's own registry (the target's
 * `targetconfig` `packages.approvedRepoLib`), resolved to a commit sha through
 * GitHub, fetched at that sha (only the files its pxt.json lists), checked
 * against the commit's tree, and accepted only when its LICENSE, read with its
 * pxt.json `license`, is on the allow-list (extension-licence.js). The full
 * provenance record goes to the cache. Everything refused is returned by name.
 */
import {fetchMakeCodeExtensions, parseGithubSpec} from './extension-fetch.js';
import {VENDORED_EXTENSIONS} from './extensions-vendored.js';
import {CURATED_ALIASES, declaredSymbols, extensionSources, resolveExtensionNamespaces, usedNames,
    declaredDependencies, unavailableMessage} from './extension-namespaces.js';

const REGISTRY_HOST = {microbit: 'https://makecode.microbit.org', calliopemini: 'https://makecode.calliope.cc',
    arcade: 'https://arcade.makecode.com'};
const REGISTRY_TARGET = {calliopemini: 'calliopemini'};

/** The approved repositories of a target: {lower-case repo -> metadata}. */
export async function approvedRepositories ({target, fetch = url => globalThis.fetch(url)}) {
    const host = REGISTRY_HOST[target];
    if (!host) throw new Error(`no extension registry known for target ${target}`);
    const res = await fetch(`${host}/api/config/${REGISTRY_TARGET[target] || target}/targetconfig`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for the ${target} extension registry`);
    const lib = JSON.parse(await res.text())?.packages?.approvedRepoLib;
    if (!lib || typeof lib !== 'object') throw new Error(`the ${target} extension registry lists no approved extensions`);
    return Object.fromEntries(Object.entries(lib).map(([repo, meta]) => [repo.toLowerCase(), meta]));
}

/** Approved repositories whose name suggests the namespace (`pxt-<ns>`, `<ns>`, `arcade-<ns>`), preferred first. */
export function registryCandidates (namespace, approved) {
    const ns = namespace.toLowerCase();
    const names = new Set([ns, `pxt-${ns}`, `arcade-${ns}`, `pxt-${ns}-extension`]);
    const curated = CURATED_ALIASES[namespace]?.repo;
    const hits = Object.entries(approved).filter(([repo]) => repo === curated || names.has(repo.split('/')[1] || ''));
    return hits.sort((a, b) => Number(b[0] === curated) - Number(a[0] === curated) ||
        Number(!!b[1].preferred) - Number(!!a[1].preferred) || a[0].localeCompare(b[0])).map(([repo]) => repo);
}

/** An in-memory cache with the {get, set} shape fetchMakeCodeExtensions takes. */
export const memoryExtensionCache = () => {
    const map = new Map();
    return {get: async key => map.get(key) || null, set: async (key, value) => { map.set(key, value); }, entries: () => [...map]};
};

/**
 * Fetch what a program's namespaces and declared github: dependencies need.
 *
 * @param {object} args
 * @param {Object<string,string>} args.files project files (main.ts, optional pxt.json)
 * @param {string} args.target
 * @param {boolean} [args.fetchExtensions] must be true to touch the network
 * @param {Function} [args.fetch] fetch(url) -> Response
 * @param {{get: Function, set: Function}} [args.cache]
 * @param {Set<string>} [args.knownCore] top-level names that belong to the target, never looked up
 * @returns {Promise<{extensions: object[], refused: {namespace?: string, id?: string, reason: string, message: string}[], disabled?: boolean}>}
 */
export async function fetchNamespaceExtensions ({files = {}, target = 'microbit', fetchExtensions = false, fetch, cache = null,
    knownCore = new Set(), now}) {
    if (fetchExtensions !== true) return {extensions: [], refused: [], disabled: true};
    const doFetch = fetch || (url => globalThis.fetch(url));
    const vendoredIds = new Set(VENDORED_EXTENSIONS.map(e => e.id));
    const extensions = [], refused = [];
    const take = async (dependencies, why) => {
        const result = await fetchMakeCodeExtensions({dependencies, target, table: [], fetch: doFetch, pin: true,
            licencePolicy: 'allow-list', cache, ...(now ? {now} : {})});
        for (const entry of result.extensions) {
            const commit = entry.fetched.commit;
            // The vendored entries' shape, so resolution treats both alike.
            Object.assign(entry, {spec: `github:${entry.repo}#${commit}`, commit, licence: entry.fetched.licence,
                holder: entry.fetched.holder, licenceFile: entry.fetched.licenceFile, licenceText: {text: entry.fetched.licenceText}});
            extensions.push(entry);
        }
        for (const r of result.refused) refused.push({...r, ...why, message: `extension ${r.id} refused: ${r.reason}`});
        return result.extensions;
    };
    // 1. github: dependencies the pxt.json names that are not vendored.
    const declared = declaredDependencies(files['pxt.json']);
    for (const [id, spec] of Object.entries(declared)) {
        if (!/^github:/i.test(String(spec)) || vendoredIds.has(id)) continue;
        const parsed = parseGithubSpec(spec);
        if (parsed && VENDORED_EXTENSIONS.some(e => e.repo.toLowerCase() === parsed.repo)) continue;
        await take({[id]: spec}, {id, declared: true});
    }
    // 2. namespaces nothing vendored provides.
    const source = Object.entries(files).filter(([name]) => /\.ts$/i.test(name)).map(([, text]) => text).join('\n');
    const own = new Set(declaredSymbols([source]));
    const base = resolveExtensionNamespaces({files, target, extensions});
    const provided = new Set(base.extensions.flatMap(row => row.symbols));
    let approved = null;
    for (const [namespace] of usedNames(source)) {
        if (own.has(namespace) || provided.has(namespace) || knownCore.has(namespace)) continue;
        try { approved = approved || await approvedRepositories({target, fetch: doFetch}); }
        catch (error) { refused.push({namespace, reason: String(error.message || error), message: `${unavailableMessage(namespace)}: ${error.message || error}`}); break; }
        const candidates = registryCandidates(namespace, approved);
        if (!candidates.length) continue;           // not an extension: a variable, an object, a core name
        let found = false;
        for (const repo of candidates) {
            const id = repo.split('/')[1];
            const got = await take({[id]: `github:${repo}`}, {namespace});
            const entry = got[0];
            if (!entry) continue;
            if (declaredSymbols(extensionSources(entry.files).map(f => f.source)).includes(namespace)) { found = true; break; }
            extensions.splice(extensions.indexOf(entry), 1);
            refused.push({namespace, id, reason: `${repo} does not declare the namespace ${namespace}`,
                message: `${unavailableMessage(namespace)}: ${repo} does not declare it`});
        }
        if (!found && !refused.some(r => r.namespace === namespace)) {
            refused.push({namespace, reason: 'no approved extension declares it', message: unavailableMessage(namespace)});
        }
    }
    return {extensions, refused};
}
