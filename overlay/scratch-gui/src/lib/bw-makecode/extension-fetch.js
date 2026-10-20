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
 * are skipped, as the vendoring sync does. Dependency editor history is not
 * compiler input; its omission is reported without rewriting pxt.json. This
 * loader is for compilation, not a lossless package/project archive.
 */
import {licenceOf, REDISTRIBUTABLE} from './extension-licence.js';

export const RAW_BASE = 'https://raw.githubusercontent.com/';

/** Bounds on what one compile may fetch. */
// Authentic Arcade projects in the compatibility corpus need ten packages.
// Keep finite graph/file/byte bounds while allowing their complete dependency set.
export const FETCH_LIMITS = Object.freeze({extensions: 16, filesPerExtension: 64,
    bytesPerExtension: 8 * 1024 * 1024, bytesTotal: 32 * 1024 * 1024,
    bytesPerManifest: 256 * 1024, bytesPerLicence: 256 * 1024});

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
    limits = {...FETCH_LIMITS, ...limits};
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`invalid extension fetch limit: ${name}`);
    }
    const extensions = [], refused = [], seen = new Set();
    const queue = unresolvedGithubDependencies(dependencies, target, table);
    let totalBytes = 0;
    // Count bytes as they arrive, before decoding or retaining another chunk.
    // Failed packages still consume the compile's aggregate download budget.
    const readText = async (res, byteLimit, reason) => {
        const maximum = Math.min(byteLimit, limits.bytesTotal - totalBytes);
        const failure = () => new Error(maximum < byteLimit ?
            `extension downloads exceed ${limits.bytesTotal} bytes in total` : reason);
        const header = res.headers && res.headers.get('content-length');
        if (header !== null && header !== undefined && /^\d+$/.test(header) && Number(header) > maximum) {
            if (res.body) await res.body.cancel();
            throw failure();
        }
        let bytes = 0;
        const count = length => {
            bytes += length;
            totalBytes += length;
            if (bytes > maximum) throw failure();
        };
        if (!res.body || typeof res.body.getReader !== 'function') {
            // Fetch adapters without a stream (offline controls, for example).
            const content = await res.text();
            count(new TextEncoder().encode(content).byteLength);
            return {content, bytes};
        }
        const reader = res.body.getReader(), decoder = new TextDecoder();
        const chunks = [];
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                count(chunk.value.byteLength);
                chunks.push(decoder.decode(chunk.value, {stream: true}));
            }
            chunks.push(decoder.decode());
            return {content: chunks.join(''), bytes};
        } catch (err) {
            await reader.cancel().catch(() => {});
            throw err;
        } finally {
            reader.releaseLock();
        }
    };
    const text = async (url, byteLimit, reason) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return readText(res, byteLimit, reason);
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
            const sourceLimitReason = `its sources exceed ${limits.bytesPerExtension} bytes`;
            const manifest = await text(`${base}pxt.json`, Math.min(limits.bytesPerManifest, limits.bytesPerExtension),
                limits.bytesPerManifest < limits.bytesPerExtension ?
                    `its pxt.json exceeds ${limits.bytesPerManifest} bytes` : sourceLimitReason);
            const pxtJson = manifest.content;
            const cfg = JSON.parse(pxtJson);
            const supported = Array.isArray(cfg.supportedTargets) ? cfg.supportedTargets : null;
            if (supported && supported.length && !supported.includes(target)) {
                throw new Error(`it supports ${supported.join(', ')}, not ${target}`);
            }
            const listed = (Array.isArray(cfg.files) ? cfg.files : []).filter(f => !/\.(png|jpe?g|gif)$/i.test(f));
            if (listed.some(f => !safePath(f))) throw new Error('its pxt.json lists a file outside the extension');
            if (listed.length > limits.filesPerExtension) throw new Error(`its pxt.json lists more than ${limits.filesPerExtension} files`);
            const files = {'pxt.json': pxtJson};
            const excludedFiles = [];
            let bytes = manifest.bytes;
            for (const f of listed) {
                if (f === 'pxt.json') continue;
                if (f === '_history') {
                    excludedFiles.push({file: f, reason: 'dependency editor history is not compiler input'});
                    continue;
                }
                const source = await text(base + f, limits.bytesPerExtension - bytes, sourceLimitReason);
                files[f] = source.content;
                bytes += source.bytes;
            }
            let licence = null, licenceFile = null, licenceUrl = null, licenceText = null;
            // Monorepo packages often inherit the repository's root notice.
            for (const licenceBase of base === repositoryBase ? [base] : [base, repositoryBase]) {
                for (const name of ['LICENSE', 'LICENSE.txt', 'LICENSE.md']) {
                    const res = await fetch(licenceBase + name);
                    if (res.ok) {
                        licenceFile = name; licenceUrl = licenceBase + name;
                        const notice = await readText(res, limits.bytesPerLicence,
                            `its licence notice exceeds ${limits.bytesPerLicence} bytes`);
                        licenceText = notice.content;
                        licence = licenceOf(licenceText); break;
                    }
                }
                if (licenceFile) break;
            }
            const sha256 = {};
            for (const [name, content] of Object.entries(files)) sha256[name] = await sha256Hex(content);
            extensions.push({id: dep.id, repo: dep.repo, refs: [dep.ref], targets: [target], files,
                fetched: {base, licence, licenceFile, licenceUrl, licenceText, redistributable: REDISTRIBUTABLE.includes(licence),
                    sha256, sourceBytes: bytes, excludedFiles}});
            // Its own github: dependencies, unless already available.
            for (const next of unresolvedGithubDependencies(cfg.dependencies, target, [...table, ...extensions])) queue.push(next);
        } catch (err) {
            refused.push({id: dep.id, spec: dep.spec, reason: String(err && err.message || err)});
        }
    }
    return {extensions, refused};
}
