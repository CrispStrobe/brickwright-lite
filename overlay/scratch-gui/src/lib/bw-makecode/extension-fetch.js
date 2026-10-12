/**
 * On-demand MakeCode extensions: a project's `github:` dependencies that this
 * build does not vendor are fetched from GitHub when the project is compiled,
 * so MakeCode's own compiler and simulator can run it as MakeCode would.
 *
 * Fetched sources are used in this browser only, for the compile that asked for
 * them; they are never stored or shipped with the app. Each fetched extension
 * reports the licence its LICENSE file states (or that none was found), so the
 * page can say what it ran. Builds with BW_REMOTE_EXTENSIONS_POLICY=deny do not
 * fetch (distribution-policy.js).
 *
 * Files come from raw.githubusercontent.com, which serves cross-origin reads, at
 * the ref the dependency names (a tag, a branch or a commit; none = the default
 * branch). Only the files the extension's pxt.json lists are taken; image files
 * are skipped, as the vendoring sync does.
 */
import {licenceOf, REDISTRIBUTABLE} from './extension-licence.js';

export const RAW_BASE = 'https://raw.githubusercontent.com/';

/** Bounds on what one compile may fetch. */
export const FETCH_LIMITS = Object.freeze({extensions: 8, filesPerExtension: 64, bytesPerExtension: 1024 * 1024});

const SPEC = /^github:([A-Za-z0-9][\w.-]*\/[\w.-]+?(?:\/[\w.-]+)*)(?:\.git)?\/?(?:#([\w./-]+))?$/i;

/** `github:owner/repo[/package/path]#ref` → {repo (lower case), ref ('' = default branch)}, else null. */
export function parseGithubSpec (spec) {
    const m = SPEC.exec(String(spec || '').trim());
    if (!m) return null;
    if (m[1].split('/').some(part => !part || part === '.' || part === '..')) return null;
    const ref = m[2] || '';
    if (ref && ref.split('/').some(part => !part || part === '.' || part === '..')) return null;
    return {repo: m[1].toLowerCase(), ref};
}

/** A path a pxt.json may list: relative, no `..`, no backslashes. */
const safePath = file => typeof file === 'string' && file.length > 0 && file.length < 200 &&
    !file.startsWith('/') && !file.includes('\\') && !file.split('/').some(part => !part || part === '.' || part === '..');

const isTableHit = (table, repo, ref, target) => table.some(e =>
    e.repo === repo && e.refs.includes(ref) && e.targets.includes(target));

/**
 * The github: dependencies (transitively, through what the table serves) that
 * the table does not answer: [{id, spec, repo, ref}].
 */
export function unresolvedGithubDependencies (dependencies, target, table) {
    const out = [];
    for (const [id, spec] of Object.entries(dependencies || {})) {
        const parsed = parseGithubSpec(spec);
        if (!/^github:/i.test(String(spec))) continue;
        if (!parsed) { out.push({id, spec: String(spec), repo: null, ref: null}); continue; }
        if (!isTableHit(table, parsed.repo, parsed.ref, target)) out.push({id, spec: String(spec), ...parsed});
    }
    return out;
}

async function sha256Hex (text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetch the extensions a project needs and the table does not have.
 *
 * @param {object} args
 * @param {object} args.dependencies the project's pxt.json dependencies
 * @param {string} args.target the pxt target id (microbit, arcade, ...)
 * @param {object[]} args.table the extensions already available (EXTENSION_TABLE shape)
 * @param {Function} [args.fetch] fetch(url) → Response (default: the page's fetch, called unbound-safely)
 * @returns {Promise<{extensions: object[], refused: {id: string, spec: string, reason: string}[]}>}
 *   `extensions` in the EXTENSION_TABLE shape, plus `fetched: {base, licence, redistributable,
 *   licenceFile, sha256}` describing what was taken.
 */
export async function fetchMakeCodeExtensions ({dependencies, target, table, fetch = url => globalThis.fetch(url), limits = FETCH_LIMITS}) {
    const extensions = [], refused = [], seen = new Set();
    const queue = unresolvedGithubDependencies(dependencies, target, table);
    const text = async url => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return res.text();
    };
    while (queue.length) {
        const dep = queue.shift();
        const key = `${dep.repo}#${dep.ref}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (!dep.repo) { refused.push({id: dep.id, spec: dep.spec, reason: 'not a github:owner/repo[/package/path]#ref dependency'}); continue; }
        if (extensions.length >= limits.extensions) { refused.push({id: dep.id, spec: dep.spec, reason: `more than ${limits.extensions} extensions to fetch`}); continue; }
        // A package subfolder follows the ref in GitHub raw URLs, but remains
        // part of the package identity used by PXT's dependency resolver.
        const parts = dep.repo.split('/');
        const repositoryBase = `${RAW_BASE}${parts.slice(0, 2).join('/')}/${dep.ref || 'HEAD'}/`;
        const base = repositoryBase + (parts.length > 2 ? parts.slice(2).join('/') + '/' : '');
        try {
            const pxtJson = await text(`${base}pxt.json`);
            const cfg = JSON.parse(pxtJson);
            const supported = Array.isArray(cfg.supportedTargets) ? cfg.supportedTargets : null;
            if (supported && supported.length && !supported.includes(target)) {
                throw new Error(`it supports ${supported.join(', ')}, not ${target}`);
            }
            const listed = (Array.isArray(cfg.files) ? cfg.files : []).filter(f => !/\.(png|jpe?g|gif)$/i.test(f));
            if (listed.some(f => !safePath(f))) throw new Error('its pxt.json lists a file outside the extension');
            if (listed.length > limits.filesPerExtension) throw new Error(`its pxt.json lists more than ${limits.filesPerExtension} files`);
            const files = {'pxt.json': pxtJson};
            let bytes = pxtJson.length;
            for (const f of listed) {
                if (f === 'pxt.json') continue;
                files[f] = await text(base + f);
                bytes += files[f].length;
                if (bytes > limits.bytesPerExtension) throw new Error(`its sources exceed ${limits.bytesPerExtension} bytes`);
            }
            let licence = null, licenceFile = null, licenceUrl = null;
            // Monorepo packages often inherit the repository's root notice.
            for (const licenceBase of base === repositoryBase ? [base] : [base, repositoryBase]) {
                for (const name of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) {
                    const res = await fetch(licenceBase + name);
                    if (res.ok) {
                        licenceFile = name; licenceUrl = licenceBase + name;
                        licence = licenceOf(await res.text()); break;
                    }
                }
                if (licenceFile) break;
            }
            const sha256 = {};
            for (const [name, content] of Object.entries(files)) sha256[name] = await sha256Hex(content);
            extensions.push({id: dep.id, repo: dep.repo, refs: [dep.ref], targets: [target], files,
                fetched: {base, licence, licenceFile, licenceUrl, redistributable: REDISTRIBUTABLE.includes(licence), sha256}});
            // Its own github: dependencies, unless already available.
            for (const next of unresolvedGithubDependencies(cfg.dependencies, target, [...table, ...extensions])) queue.push(next);
        } catch (err) {
            refused.push({id: dep.id, spec: dep.spec, reason: String(err && err.message || err)});
        }
    }
    return {extensions, refused};
}
