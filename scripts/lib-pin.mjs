// Resolve a ref to an immutable sha, and record what was taken.
//
// THE DEFECT THIS EXISTS TO REMOVE
// --------------------------------
// A fetch by mutable name quotes a freshness it does not have. It bit this
// repo for real on 2026-08-23: `sync-bw-board.mjs` fetched
// `raw.githubusercontent.com/.../master/...`, the raw CDN served a cached
// copy of the PREVIOUS commit, the run printed "synced from bw-board@master",
// and vendor-pins.json was never touched. Every part of that sentence was
// well-formed and the content was wrong, with nothing in the tree recording
// which commit had actually been vendored.
//
// Three properties make it not happen again, and all three are needed:
//
//   1. RESOLVE the name to a 40-hex sha through the commits API, which is not
//      the raw CDN and answers with the current head.
//   2. FETCH sha-addressed. A sha-addressed raw URL is immutable, so the cache
//      cannot lie about it — this is what turns (1) from a label into content.
//   3. RECORD the resolved sha where a later reader can find it. A sync that
//      vendored correctly but wrote no sha leaves the next person guessing,
//      which is the state the 2026-08-23 incident was discovered in.
//
// There is deliberately NO fallback to the mutable name on resolution failure.
// Falling back is how the defect returns: the run would keep working, keep
// printing a branch name, and be wrong again in exactly the way that cost a
// day. A failed resolve is a failed sync.

import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const FULL_SHA = /^[0-9a-f]{40}$/;

const here = path.dirname(fileURLToPath(import.meta.url));
export const PINS_FILE = path.join(here, '..', 'vendor-pins.json');

const ghHeaders = () => {
    const h = {accept: 'application/vnd.github+json'};
    // Unauthenticated api.github.com is 60 requests/hour PER IP, which a busy
    // Actions runner shares with everyone else on that IP. In CI the token is
    // there for the taking; locally its absence is fine at this call volume.
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (token) h.authorization = `Bearer ${token}`;
    return h;
};

/**
 * Fetch with backoff on the two failures that are worth retrying.
 *
 * raw.githubusercontent rate-limits CI bursts — HTTP 429 killed two deploys on
 * 2026-08-17 after the ancestry check had already passed.
 */
export async function fetchRetry (url, {headers = {}, attempts = 4, log = console.log} = {}) {
    for (let attempt = 1; ; attempt++) {
        const res = await fetch(url, {headers});
        if (res.ok) return res;
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt >= attempts) {
            const e = new Error(`HTTP ${res.status} (after ${attempt} attempt${attempt > 1 ? 's' : ''})`);
            e.status = res.status;
            throw e;
        }
        const ra = Number(res.headers.get('retry-after')) || 0;
        const delay = Math.max(ra * 1000, attempt * 20_000);
        log(`  retry ${url}: HTTP ${res.status}, waiting ${Math.round(delay / 1000)}s (attempt ${attempt}/${attempts - 1})`);
        await new Promise(r => setTimeout(r, delay));
    }
}

/**
 * Every blob path in a repo at a sha — the whole tree, one request.
 *
 * WHY THIS EXISTS. The sync used a HAND-WRITTEN file list in remote mode: 26
 * entries against 120 files actually vendored. The 94 it omitted included the
 * entire 8086 tier, they were never fetched and never compared, and the check
 * still printed "vendored engine up to date". A manifest maintained by hand
 * drifts silently and reports success while it does.
 *
 * TRUNCATION IS AN ERROR, NOT A RESULT. GitHub caps a recursive tree response
 * and sets `truncated: true` when it does. A partial list here would recreate
 * the exact defect this replaces -- fewer files than exist, no complaint -- so
 * it throws instead of returning what fitted.
 *
 * @param {string} repo `owner/name`
 * @param {string} sha  a full commit sha (a branch name would reintroduce the
 *   mutable-ref hazard resolveRef exists to close)
 * @returns {Promise<string[]>} every blob path, repo-relative
 */
export async function listTree (repo, sha) {
    const res = await fetchRetry(
        `https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`,
        {headers: ghHeaders()});
    const json = await res.json();
    if (json.truncated) {
        throw new Error(`tree listing for ${repo}@${sha} was TRUNCATED by the API — `
            + 'a partial list would silently vendor fewer files than exist');
    }
    return json.tree.filter((e) => e.type === 'blob').map((e) => e.path);
}

/**
 * `CrispStrobe/bw-board`, `master` → a 40-hex sha.
 *
 * A ref that is ALREADY a full sha is returned untouched and unfetched: it is
 * immutable by construction and the network cannot make it more so. An
 * ABBREVIATED sha is not treated as immutable — see resolveRef's caller in
 * sync-emu8051-wasm.mjs and the note in docs/FETCH-PINNING.md; git's own
 * abbreviation is only unique within one repository at one moment.
 */
export async function resolveRef (repo, ref) {
    if (FULL_SHA.test(ref)) return {sha: ref, resolved: false};
    let res;
    try {
        res = await fetchRetry(`https://api.github.com/repos/${repo}/commits/${ref}`, {headers: ghHeaders()});
    } catch (e) {
        throw new Error(
            `cannot resolve ${repo}@${ref} to a commit sha via the commits API: ${e.message}.\n` +
            'Refusing to fetch by the mutable name instead: the raw CDN caches branch URLs, ' +
            'so that path silently vendors an older commit while printing the branch name ' +
            '(bitten 2026-08-23). Fix the ref, or pass --dir with a local checkout.');
    }
    const {sha} = await res.json();
    if (!FULL_SHA.test(sha || '')) {
        throw new Error(`${repo}@${ref}: commits API returned ${JSON.stringify(sha)}, not a 40-hex sha`);
    }
    return {sha, resolved: true};
}

/**
 * Write the resolved sha into vendor-pins.json.
 *
 * Called on the NO-OP path too. A sync that found nothing to write has still
 * established that lite's tree matches this commit, and that is exactly the
 * fact the pin records — leaving it unwritten there is how a correct tree keeps
 * a stale pin.
 */
export async function recordPin (name, sha, {pinsFile = PINS_FILE, log = console.log} = {}) {
    if (!FULL_SHA.test(sha || '')) {
        throw new Error(`refusing to pin ${name} to ${JSON.stringify(sha)} — not a 40-hex sha`);
    }
    const pins = await readFile(pinsFile, 'utf8').then(JSON.parse).catch(() => ({}));
    if (pins[name] === sha) { log(`  pin unchanged: ${name}@${sha}`); return sha; }
    pins[name] = sha;
    await writeFile(pinsFile, JSON.stringify(pins, null, 1) + '\n');
    log(`  pinned ${name}@${sha}`);
    return sha;
}

/** The sha of a local checkout, for --dir mode. */
export async function localSha (dir) {
    const {execSync} = await import('node:child_process');
    return execSync(`git -C ${JSON.stringify(dir)} rev-parse HEAD`).toString().trim();
}
