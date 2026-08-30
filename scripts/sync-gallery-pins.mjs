// Record a sha256 for every extension the gallery can hand us, so a runtime
// load is verified against reviewed content instead of trusted by hostname.
//
// WHY THIS EXISTS
// ---------------
// ~120 extensions load from https://crispstrobe.github.io/extensions/ with no
// prompt, and every one of them runs UNSANDBOXED and IN-PROCESS via the
// adapter — with reach into the native bridge on the app builds. The only
// thing standing behind that today is the hostname. A hostname is an identity
// claim, not a content claim: it says who served the bytes, never which bytes.
//
// docs/FETCH-PINNING.md already settled this for build-time fetches after a
// CDN served a cached copy of the previous commit and the run printed success.
// Runtime extension loads were the one place the doctrine was never applied,
// purely because they happen later. This closes that.
//
// THE THREE PROPERTIES, same as lib-pin.mjs
//   1. RESOLVE main to a 40-hex sha through the commits API.
//   2. FETCH sha-addressed from raw.githubusercontent, which is immutable, so
//      what we hash is what the commit contains and no cache can lie about it.
//   3. RECORD the sha256 where the loader can find it, and where a reviewer
//      sees a diff when an extension's bytes change.
//
// AND ONE MORE, because the runtime does not fetch from raw
// ---------------------------------------------------------
// The app loads from the PAGES host, so the pin the loader checks must be the
// pin of what PAGES serves. Pinning the repo alone would have been theatre,
// and measuring said so on the first run: 99 of 120 extensions differ from
// their repo file, because the site's build injects a generated l10n prelude
// (`/* generated l10n code */Scratch.translate.setup({...})`) ahead of the
// source. Only 21 — the ones with no translations — are byte-identical.
//
// So both are recorded, and the difference is not waved through: the served
// bytes must be the reviewed repo bytes with GENERATED BLOCKS INSERTED and
// nothing removed or edited. There are two such blocks, and the second was
// found by this check refusing three extensions rather than by reading the
// site's build — the l10n prelude, and third-party dependencies inlined
// between `/* generated dependency */` and `/* end generated dependency */`
// (the upstream repo pins those by sha256 itself, in
// extension-dependencies.json, which is the same doctrine one repo over).
//
// The walk below is byte-exact and one-directional: every byte of the repo
// file must appear, in order, in the served file. An edit inside the body or a
// deletion leaves the walk unable to resume and the extension goes unpinned —
// which means the loader asks before running it, not that it vanishes.
// The audit trail therefore says: this is commit <sha>'s file, plus generated
// blocks, and nothing else.
//
// The INDEX (extensions-v0.json) is deliberately NOT pinned: it is generated
// into Pages and does not exist in the repo (verified — raw 404s on it), and
// it carries only metadata. Names, blurbs and thumbnails are cosmetic; the
// executable bytes are what this file is about. A gallery entry that is not in
// the pin map is not refused either — it drops to the same confirmation prompt
// an arbitrary URL gets, so a new extension degrades to "ask", never to
// "broken in front of a child".
import {createHash} from 'node:crypto';
import {writeFile, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchRetry, resolveRef, FULL_SHA} from './lib-pin.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'overlay', 'scratch-vm', 'src', 'extension-support', 'gallery-pins.json');
const CENSUS_OUT = path.join(here, '..', 'docs', 'generated', 'GALLERY-CAPABILITY-CENSUS.md');

export const GALLERY_CONTRACT_VERSION = 2;
export const GALLERY_CAPABILITIES = Object.freeze([
    'dom', 'runtime', 'fetch-import', 'websocket', 'web-bluetooth',
    'web-serial', 'web-usb', 'web-hid', 'web-nfc', 'native-bridge', 'nested-worker'
]);
export const BROKER_CAPABILITIES = Object.freeze([
    'project.metadata.read'
]);

// CP1 migration is deliberately narrower than the static capability census.
// A slug belongs here only after test/gallery-worker-compat.test.mjs has loaded
// the immutable repository bytes in both adapter-shaped and restricted-worker
// realms and compared registration, getInfo() and a representative opcode.
// Keeping this policy beside the generator prevents a hand-edited pin from
// silently claiming runtime proof that will disappear on the next sync.
export const RUNTIME_WORKER_PROVEN = Object.freeze([
    '-SIPC-/consoles',
    '-SIPC-/time',
    'bitwise',
    'Clay/htmlEncode',
    'cs2627883/numericalencoding',
    'DogeisCut/FormatNumbers',
    'encoding',
    'Lily/Cast',
    'Lily/CommentBlocks',
    'Lily/McUtils',
    'NOname-awa/graphics2d',
    'NOname-awa/more-comparisons',
    'Skyhigh173/bigint',
    'numerical-encoding-2',
    'qxsck/data-analysis',
    'steamworks',
    'text',
    'true-fantom/base',
    'true-fantom/couplers',
    'true-fantom/math',
    'true-fantom/regexp'
]);

export const RUNTIME_WORKER_DEFERRED = Object.freeze({
    'Lily/HackedBlocks': 'runtime corpus found no executable opcode for parity proof',
    'PwLDev/vibration': 'runtime corpus requires unsandboxed navigator.vibrate',
    'TheShovel/LZ-String': 'runtime corpus requires reusable Scratch.external eval/import',
    'ZXMushroom63/searchApi': 'runtime corpus requires unsandboxed page URL search parameters'
});

const REQUIRED_AMBIENT_REQUIREMENTS = Object.freeze({
    'Alestore/nfcwarp': ['web-nfc'],
    'mbw/xml': ['dom']
});

const CAPABILITY_PATTERNS = Object.freeze({
    dom: /\b(?:document|DOMParser|XMLSerializer|localStorage|sessionStorage)\b|\bwindow\s*[.[]/,
    runtime: /\bScratch\s*\.\s*(?:vm|runtime)\b|\butil\s*\.\s*(?:runtime|target|thread)\b/,
    'fetch-import': /\bfetch\s*\(|\bimportScripts\s*\(|\bimport\s*\(/,
    websocket: /\bWebSocket\s*\(/,
    'web-bluetooth': /\bnavigator\s*\.\s*bluetooth\b/,
    'web-serial': /\bnavigator\s*\.\s*serial\b/,
    'web-usb': /\bnavigator\s*\.\s*usb\b/,
    'web-hid': /\bnavigator\s*\.\s*hid\b/,
    'web-nfc': /\bNDEFReader\b|\bnavigator\s*\.\s*nfc\b/,
    'native-bridge': /\b__TAURI(?:_INTERNALS)?__\b|\b(?:window\s*\.\s*)?__TAURI__\b|\binvoke\s*\(/,
    'nested-worker': /\b(?:new\s+)?(?:SharedWorker|Worker)\s*\(/
});

export function classifyGallerySource (source) {
    const text = Buffer.isBuffer(source) ? source.toString('utf8') : String(source);
    return GALLERY_CAPABILITIES.filter(name => CAPABILITY_PATTERNS[name].test(text));
}

export function censusEntry (slug, source) {
    const capabilities = classifyGallerySource(source);
    return applyMigrationPolicy(slug, capabilities, {
        identity: `${BASE}${slug}.js`, load: 'url', capabilities, brokerCapabilities: []
    });
}

export function applyMigrationPolicy (slug, capabilities, entry) {
    const workerProven = RUNTIME_WORKER_PROVEN.includes(slug);
    const runtimeDeferral = RUNTIME_WORKER_DEFERRED[slug] || null;
    const missingReviewed = (REQUIRED_AMBIENT_REQUIREMENTS[slug] || [])
        .filter(capability => !capabilities.includes(capability));
    if (missingReviewed.length) {
        throw new Error(`gallery classifier lost reviewed ambient requirement for ${slug}: ` +
            missingReviewed.join(', '));
    }
    if (workerProven && capabilities.length) {
        throw new Error(`runtime-proven worker ${slug} acquired ambient requirements: ${capabilities.join(', ')}`);
    }
    return {
        ...entry,
        brokerCapabilities: Array.isArray(entry.brokerCapabilities) ? entry.brokerCapabilities : [],
        migration: {
            status: capabilities.length || runtimeDeferral ? 'deferred' : (workerProven ? 'worker' : 'candidate'),
            reason: capabilities.length ? `static scan requires review: ${capabilities.join(', ')}` :
                (runtimeDeferral || (workerProven ?
                    'runtime parity proven by gallery worker compatibility corpus' : null))
        }
    };
}

export function validateGalleryContract (document, expectedSlugs) {
    if (document.schemaVersion !== GALLERY_CONTRACT_VERSION) {
        throw new Error(`gallery capability schema must be version ${GALLERY_CONTRACT_VERSION}`);
    }
    const expected = [...expectedSlugs].sort();
    if (new Set(expected).size !== expected.length) throw new Error('gallery census has duplicate identity');
    const actual = Object.keys(document.extensions || {}).sort();
    const missing = expected.filter(slug => !actual.includes(slug));
    const extra = actual.filter(slug => !expected.includes(slug));
    if (missing.length || extra.length) {
        throw new Error(`gallery census identity mismatch: missing [${missing.join(', ')}], ` +
            `unclassified [${extra.join(', ')}]`);
    }
    const identities = new Set();
    for (const slug of actual) {
        const c = document.extensions[slug];
        if (!Array.isArray(c.capabilities) || !Array.isArray(c.brokerCapabilities) || !c.migration) {
            throw new Error(`gallery census missing capability declaration for ${slug}`);
        }
        if (identities.has(c.identity)) throw new Error(`gallery census has duplicate identity: ${c.identity}`);
        identities.add(c.identity);
        if (c.identity !== `${document.base}${slug}.js` || c.load !== 'url') {
            throw new Error(`gallery census identity is not canonical for ${slug}`);
        }
        const unknown = c.capabilities.filter(name => !GALLERY_CAPABILITIES.includes(name));
        if (unknown.length) throw new Error(`gallery census has unknown capability for ${slug}: ${unknown.join(', ')}`);
        const canonical = GALLERY_CAPABILITIES.filter(name => c.capabilities.includes(name));
        if (new Set(c.capabilities).size !== c.capabilities.length ||
            canonical.some((name, i) => name !== c.capabilities[i])) {
            throw new Error(`gallery census capabilities are duplicated or non-canonical for ${slug}`);
        }
        const unknownBroker = c.brokerCapabilities.filter(name => !BROKER_CAPABILITIES.includes(name));
        if (unknownBroker.length) {
            throw new Error(`gallery census has unknown broker capability for ${slug}: ${unknownBroker.join(', ')}`);
        }
        const canonicalBroker = BROKER_CAPABILITIES.filter(name => c.brokerCapabilities.includes(name));
        if (new Set(c.brokerCapabilities).size !== c.brokerCapabilities.length ||
            canonicalBroker.some((name, i) => name !== c.brokerCapabilities[i])) {
            throw new Error(`gallery broker capabilities are duplicated or non-canonical for ${slug}`);
        }
        if (c.migration.status === 'candidate') {
            if (RUNTIME_WORKER_PROVEN.includes(slug)) {
                throw new Error(`runtime-proven gallery entry ${slug} was downgraded from worker`);
            }
            if (RUNTIME_WORKER_DEFERRED[slug]) {
                throw new Error(`runtime-deferred gallery entry ${slug} was downgraded to candidate`);
            }
            if (c.capabilities.length || c.migration.reason !== null) {
                throw new Error(`candidate gallery entry ${slug} widened its declaration`);
            }
        } else if (c.migration.status === 'worker') {
            if (c.capabilities.length || !RUNTIME_WORKER_PROVEN.includes(slug) ||
                c.migration.reason !== 'runtime parity proven by gallery worker compatibility corpus') {
                throw new Error(`worker gallery entry ${slug} lacks generator-owned runtime proof`);
            }
        } else if (c.migration.status === 'deferred') {
            const exactReason = c.capabilities.length ?
                `static scan requires review: ${c.capabilities.join(', ')}` : RUNTIME_WORKER_DEFERRED[slug];
            if (!exactReason || c.migration.reason !== exactReason) {
                throw new Error(`deferred gallery entry ${slug} needs an exact reason`);
            }
        } else throw new Error(`gallery census has unknown migration status for ${slug}`);
    }
    return true;
}

export function renderCensusReport (document) {
    const rows = Object.entries(document.extensions);
    const compatible = rows.filter(([, c]) => c.migration.status === 'candidate').length;
    const migrated = rows.filter(([, c]) => c.migration.status === 'worker').length;
    const counts = Object.fromEntries(GALLERY_CAPABILITIES.map(name =>
        [name, rows.filter(([, c]) => c.capabilities.includes(name)).length]));
    return `# Gallery capability census\n\nGenerated by \`scripts/sync-gallery-pins.mjs\` from immutable ` +
        `\`${document.repo}@${document.commit}\`. Do not hand-edit.\n\n` +
        `Denominator: **${rows.length}/120 URL-loaded pins**; bundled built-ins are excluded. ` +
        `Runtime-proven workers: **${migrated}**; zero-requirement candidates awaiting runtime proof: ` +
        `**${compatible}**; deferred: **${rows.length - compatible - migrated}**. ` +
        `Only the worker cohort claims runtime compatibility.\n\n` +
        `| Capability | Pins |\n|---|---:|\n` +
        GALLERY_CAPABILITIES.map(name => `| ${name} | ${counts[name]} |`).join('\n') + '\n\n' +
        `| Pin | Migration | Measured requirements | Reason |\n|---|---|---|---|\n` +
        rows.map(([slug, c]) => `| ${slug} | ${c.migration.status} | ${c.capabilities.join(', ') || 'none'} | ` +
            `${c.migration.reason || 'zero statically detected ambient requirement'} |`).join('\n') + '\n';
}

const REPO = 'CrispStrobe/extensions';
const REF = 'main';
const BASE = 'https://crispstrobe.github.io/extensions/';
const INDEX = `${BASE}generated-metadata/extensions-v0.json`;
// Where a slug lives inside the repo. Pages serves the repo's extensions/ dir
// at the base URL above, so slug "CrispStrobe/foo" is extensions/CrispStrobe/foo.js.
const repoPath = slug => `extensions/${slug}.js`;

const sha256 = buf => createHash('sha256').update(buf).digest('hex');

// Blocks the site's build injects. A divergence that does not begin with one
// of these is not explainable and the extension is left unpinned.
// The three block kinds the site's build emits, and they are NOT one shape.
//
// l10n is a pure insertion ahead of the source. A dependency is a
// REPLACEMENT: the build swaps `Scratch.external.eval(...)` for the inlined
// library — and helpfully quotes the call it replaced inside its own opener,
// which is what lets the walk below check the swap rather than trust it.
const L10N = '/* generated l10n code */';
// Helper bodies the build appends or splices in, from the repo's build-snippets/.
const SNIPPET_PREFIX = '/* snippet prefix */(function(){var __internal={};' +
    '__internal_setup();/* end snippet prefix */';
const DEP_OPEN = '/* generated dependency -- ';
const DEP_CLOSE = '/* end generated dependency */';
// Enough bytes for "where does the repo file resume" to be unambiguous after
// an insertion. If a probe ever matched early the walk would diverge again
// immediately and the extension would be refused — the failure direction is
// unpinned, never wrongly pinned.
const PROBE = 96;

/**
 * Is `served` the `repo` file with generated blocks applied, and nothing else?
 *
 * Walks both buffers together. On a divergence the served side must open a
 * known generated block:
 *
 *   l10n        — insert; the repo file resumes further along, unconsumed.
 *   dependency  — replace; the opener quotes the source it replaced, and that
 *                 quote must match the repo bytes at this exact position
 *                 BYTE FOR BYTE before we skip past the inlined body.
 *
 * Every repo byte must be consumed in order, so a deletion or an edit inside
 * the body cannot pass — unlike a regex strip, which would happily accept a
 * body rewritten around the markers. The dependency case is the one worth
 * having: without the quote check, `/* generated dependency ... *\/` would be
 * a free pass to substitute any code at all for any call.
 */
export function explainDifference (repo, served, options = {}) {
    const inserts = [];
    const allowedSuffixes = options.allowedSuffixes || [];
    let r = 0;
    let s = 0;
    const at = (buf, i, str) => buf.toString('utf8', i, i + str.length) === str;

    while (r < repo.length) {
        while (r < repo.length && s < served.length && repo[r] === served[s]) {
            r++;
            s++;
        }
        if (r === repo.length) break;

        if (at(served, s, DEP_OPEN)) {
            const quoteStart = s + DEP_OPEN.length;
            const quoteEnd = served.indexOf(' */', quoteStart);
            const close = quoteEnd < 0 ? -1 : served.indexOf(DEP_CLOSE, quoteEnd);
            if (quoteEnd < 0 || close < 0) return {ok: false, reason: 'unterminated generated dependency block'};
            const quoted = served.subarray(quoteStart, quoteEnd);
            // The build trims the whitespace ahead of the call it replaces, so
            // the divergence starts one indent earlier than the quote does.
            let ws = 0;
            while (r + ws < repo.length && /\s/.test(String.fromCharCode(repo[r + ws]))) ws++;
            if (!repo.subarray(r + ws, r + ws + quoted.length).equals(quoted)) {
                return {ok: false, reason: `a generated dependency claims to replace ` +
                    `${JSON.stringify(quoted.toString('utf8', 0, 60))} but the repo file does not say that at ` +
                    `byte ${r + ws} — it says ${JSON.stringify(repo.toString('utf8', r + ws, r + ws + 60))}`};
            }
            inserts.push({marker: 'dependency', bytes: close + DEP_CLOSE.length - s, replaced: quoted.length});
            r += ws + quoted.length;
            s = close + DEP_CLOSE.length;
            continue;
        }

        if (at(served, s, L10N)) {
            const setup = 'Scratch.translate.setup(';
            const bodyStart = s + L10N.length;
            const closeMarker = ');/* end generated l10n code */';
            const bodyEnd = served.indexOf(closeMarker, bodyStart);
            if (bodyEnd < 0 || !at(served, bodyStart, setup)) {
                return {ok: false, reason: 'malformed generated l10n block'};
            }
            try {
                JSON.parse(served.toString('utf8', bodyStart + setup.length, bodyEnd));
            } catch (e) {
                return {ok: false, reason: `generated l10n payload is not JSON: ${e.message}`};
            }
            const end = bodyEnd + closeMarker.length;
            inserts.push({marker: 'l10n', bytes: end - s});
            s = end;
            continue;
        }

        if (at(served, s, SNIPPET_PREFIX)) {
            inserts.push({marker: 'snippet-prefix', bytes: SNIPPET_PREFIX.length});
            s += SNIPPET_PREFIX.length;
            continue;
        }

        return {ok: false, reason: `served byte ${s} is not a generated block: ` +
            `${JSON.stringify(served.toString('utf8', s, s + 48))}`};
    }
    if (s !== served.length) {
        const remaining = served.subarray(s);
        const suffix = allowedSuffixes.find(candidate => remaining.equals(candidate));
        if (suffix) {
            inserts.push({marker: 'snippet-suffix', bytes: suffix.length});
            s = served.length;
        }
    }
    if (s !== served.length) {
        // Once every reviewed byte has been consumed there is nowhere valid
        // for executable output to resume. Merely beginning with a familiar
        // marker is not evidence that the remaining bytes came from the
        // gallery builder; accepting it would turn a marker into a free-form
        // executable suffix.
        return {ok: false, reason: `${served.length - s} trailing served bytes remain after the repo file`};
    }
    return {ok: true, identical: inserts.length === 0, inserts};
}

const snippetSuffix = (names, sources) => {
    let suffix = '/* snippet suffix */function __internal_setup() {';
    for (const name of names) {
        suffix += `/* snippet ${name} */${sources[name]}/* end snippet ${name} */`;
    }
    return Buffer.from(`${suffix}}}({}));/* end snippet suffix */`);
};

const loadAllowedSuffixes = async commit => {
    const names = ['base85decode', 'fzstd'];
    const sources = Object.fromEntries(await Promise.all(names.map(async name => [name,
        (await bytesOf(`https://raw.githubusercontent.com/${REPO}/${commit}/build-snippets/${name}.js`))
            .toString('utf8')])));
    return [
        snippetSuffix(['base85decode'], sources),
        snippetSuffix(['fzstd'], sources),
        snippetSuffix(['base85decode', 'fzstd'], sources)
    ];
};

const args = process.argv.slice(2);
const has = f => args.includes(f);

const CONCURRENCY = 6;
async function pool (items, worker) {
    const out = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({length: Math.min(CONCURRENCY, items.length)}, async () => {
        for (let i = next++; i < items.length; i = next++) out[i] = await worker(items[i], i);
    }));
    return out;
}

// fetchRetry backs off on HTTP status; a THROWN fetch (DNS, reset socket) is
// not a status and slipped straight through. Four extensions were reported
// unreachable on one run and fetched fine on the next, which is exactly that.
const bytesOf = async (url, attempts = 3) => {
    for (let i = 1; ; i++) {
        try {
            return Buffer.from(await (await fetchRetry(url)).arrayBuffer());
        } catch (e) {
            if (i >= attempts || e.status) throw e;
            await new Promise(done => setTimeout(done, 400 * i));
        }
    }
};

async function main () {
    if (has('--migration-only')) {
        const current = JSON.parse(await readFile(OUT, 'utf8'));
        const sourceArg = args.find(arg => arg.startsWith('--source-dir='));
        const sourceDir = sourceArg && sourceArg.slice('--source-dir='.length);
        const extensions = {};
        for (const [slug, pin] of Object.entries(current.extensions)) {
            let capabilities = pin.capabilities;
            if (sourceDir) {
                const source = await readFile(path.join(sourceDir, 'extensions', `${slug}.js`));
                if (sha256(source) !== pin.repo) {
                    throw new Error(`local immutable source differs from reviewed pin for ${slug}`);
                }
                capabilities = classifyGallerySource(source);
            }
            extensions[slug] = applyMigrationPolicy(slug, capabilities, {...pin, capabilities});
        }
        const next = {...current, schemaVersion: GALLERY_CONTRACT_VERSION,
            extensions};
        validateGalleryContract(next, Object.keys(current.extensions));
        await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);
        await writeFile(CENSUS_OUT, renderCensusReport(next));
        console.log(`reclassified ${Object.keys(next.extensions).length} immutable pins with generator-owned policy`);
        return;
    }
    const {sha: commit} = await resolveRef(REPO, REF);
    if (!FULL_SHA.test(commit)) throw new Error(`resolveRef gave a non-sha: ${commit}`);
    console.log(`${REPO}@${REF} -> ${commit}`);

    const index = JSON.parse((await bytesOf(INDEX)).toString('utf8'));
    const allowedSuffixes = await loadAllowedSuffixes(commit);
    const slugs = index.extensions.map(e => e.slug).filter(Boolean).sort();
    const invalidSlugs = slugs.filter(slug =>
        typeof slug !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(slug) ||
        slug.startsWith('/') || slug.split('/').includes('..'));
    if (invalidSlugs.length) {
        throw new Error(`gallery index contains unsafe slug(s): ${invalidSlugs.join(', ')}`);
    }
    if (new Set(slugs).size !== slugs.length) {
        throw new Error('gallery index contains duplicate slugs');
    }
    console.log(`gallery index lists ${slugs.length} extensions`);

    const rows = await pool(slugs, async slug => {
        const raw = `https://raw.githubusercontent.com/${REPO}/${commit}/${repoPath(slug)}`;
        const live = `${BASE}${slug}.js`;
        try {
            const [a, b] = await Promise.all([bytesOf(raw), bytesOf(live)]);
            return {slug, repo: sha256(a), served: sha256(b), source: a,
                diff: explainDifference(a, b, {allowedSuffixes})};
        } catch (e) {
            return {slug, error: e.message};
        }
    });

    const failed = rows.filter(r => r.error);
    const unexplained = rows.filter(r => !r.error && !r.diff.ok);
    const good = rows.filter(r => !r.error && r.diff.ok);

    for (const r of failed) console.log(`  unreachable  ${r.slug}: ${r.error}`);
    for (const r of unexplained) {
        console.log(`  UNEXPLAINED  ${r.slug}: ${r.diff.reason}`);
    }

    // A partial result must never replace a complete pin map. An unreachable
    // file and an unexplained transformation both mean this run cannot attest
    // to the gallery snapshot. Keep the previous file untouched and fail.
    if (failed.length || unexplained.length) {
        throw new Error(`cannot attest gallery snapshot: ${failed.length} unreachable, ` +
            `${unexplained.length} unexplained (listed above)`);
    }

    const pinned = good.sort((a, b) => a.slug.localeCompare(b.slug));
    const next = {
        _comment: 'Generated by scripts/sync-gallery-pins.mjs — see docs/EXTENSION-SECURITY.md task 1. Do not hand-edit.',
        repo: REPO,
        commit,
        base: BASE,
        schemaVersion: GALLERY_CONTRACT_VERSION,
        // served: what the loader hashes. repo: what a human reviewed at `commit`.
        // transformed: true when the reviewed source passed through one or
        // more explicitly checked gallery-builder transformations.
        extensions: Object.fromEntries(pinned.map(r =>
            [r.slug, {served: r.served, repo: r.repo, transformed: !r.diff.identical,
                ...censusEntry(r.slug, r.source)}]))
    };
    validateGalleryContract(next, slugs);

    const prev = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{"extensions":{}}'));
    const changed = pinned.filter(r => prev.extensions[r.slug] && prev.extensions[r.slug].served !== r.served);
    const added = pinned.filter(r => !prev.extensions[r.slug]);
    const dropped = Object.keys(prev.extensions).filter(s => !next.extensions[s]);

    if (has('--check')) {
        // Upstream byte drift remains advisory, but the checked-in authority
        // contract is ours: deletion, snapshot growth without classification,
        // or a hand-widened declaration must make freshness fail closed.
        validateGalleryContract(prev, slugs);
        const declarations = value => JSON.stringify(Object.fromEntries(Object.entries(value.extensions)
            .map(([slug, pin]) => [slug, {
                identity: pin.identity, load: pin.load, capabilities: pin.capabilities, migration: pin.migration
            }])));
        if (declarations(prev) !== declarations(next)) {
            throw new Error('checked-in gallery capability declarations differ from the pinned-source census');
        }
        const report = await readFile(CENSUS_OUT, 'utf8').catch(() => '');
        if (report !== renderCensusReport(prev)) {
            throw new Error('checked-in gallery capability report differs from its contract');
        }
        const drift = changed.length + added.length + dropped.length;
        console.log(drift
            ? `DRIFT: ${changed.length} changed, ${added.length} added, ${dropped.length} dropped`
            : `up to date at ${commit.slice(0, 12)} (${pinned.length} pinned)`);
        // Advisory on purpose. The gallery is someone else's publishing schedule;
        // a legitimate upstream release must not turn an unrelated PR's CI red.
        return;
    }

    await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);
    await writeFile(CENSUS_OUT, renderCensusReport(next));
    for (const r of changed) console.log(`  changed  ${r.slug}`);
    for (const r of added) console.log(`  added    ${r.slug}`);
    for (const s of dropped) console.log(`  dropped  ${s}`);
    const identical = pinned.filter(r => r.diff.identical).length;
    const blocks = pinned.flatMap(r => r.diff.inserts || []).reduce((m, i) => {
        m[i.marker] = (m[i.marker] || 0) + 1;
        return m;
    }, {});
    console.log(`  ${identical} byte-identical to the repo, ${pinned.length - identical} with generated blocks ` +
        `(${Object.entries(blocks).map(([m, n]) => `${n} ${m}`).join(', ') || 'none'})`);
    console.log(`wrote ${path.relative(path.join(here, '..'), OUT)}: ${pinned.length} pinned at ${commit.slice(0, 12)}` +
        '.');
}

// Importable without running: test/gallery-pins.test.mjs exercises
// explainDifference directly, and must not kick off 240 network fetches.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(e => {
        console.error(`sync-gallery-pins failed: ${e.message}`);
        process.exit(1);
    });
}
