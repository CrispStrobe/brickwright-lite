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
const SNIPPET = '/* snippet ';
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
export function explainDifference (repo, served) {
    const inserts = [];
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

        if (at(served, s, L10N) || at(served, s, SNIPPET)) {
            const probe = repo.subarray(r, Math.min(r + PROBE, repo.length));
            const resume = served.indexOf(probe, s);
            if (resume < 0) {
                return {ok: false, reason: `after a generated block the repo file never resumes ` +
                    `(looking for ${JSON.stringify(probe.toString('utf8', 0, 40))})`};
            }
            inserts.push({marker: at(served, s, L10N) ? 'l10n' : 'snippet', bytes: resume - s});
            s = resume;
            continue;
        }

        return {ok: false, reason: `served byte ${s} is not a generated block: ` +
            `${JSON.stringify(served.toString('utf8', s, s + 48))}`};
    }
    if (s < served.length && ![L10N, DEP_OPEN, SNIPPET].some(m => at(served, s, m))) {
        return {ok: false, reason: `${served.length - s} trailing served bytes are not a generated block`};
    }
    return {ok: true, identical: inserts.length === 0, inserts};
}

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
    const {sha: commit} = await resolveRef(REPO, REF);
    if (!FULL_SHA.test(commit)) throw new Error(`resolveRef gave a non-sha: ${commit}`);
    console.log(`${REPO}@${REF} -> ${commit}`);

    const index = JSON.parse((await bytesOf(INDEX)).toString('utf8'));
    const slugs = index.extensions.map(e => e.slug).filter(Boolean).sort();
    console.log(`gallery index lists ${slugs.length} extensions`);

    const rows = await pool(slugs, async slug => {
        const raw = `https://raw.githubusercontent.com/${REPO}/${commit}/${repoPath(slug)}`;
        const live = `${BASE}${slug}.js`;
        try {
            const [a, b] = await Promise.all([bytesOf(raw), bytesOf(live)]);
            return {slug, repo: sha256(a), served: sha256(b), diff: explainDifference(a, b)};
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

    // Refusing to pin what we cannot explain is the whole point. An extension
    // whose served bytes are not "the reviewed file plus translations" is
    // exactly the case this file exists to catch, so it stays unpinned — which
    // means the loader will ask before running it, not that it disappears.
    if (unexplained.length && !has('--allow-unexplained')) {
        throw new Error(`${unexplained.length} extension(s) are served with changes this script cannot ` +
            `account for (listed above). Look at one before deciding: --allow-unexplained pins them anyway.`);
    }

    const pinned = [...good, ...(has('--allow-unexplained') ? unexplained : [])]
        .sort((a, b) => a.slug.localeCompare(b.slug));
    const next = {
        _comment: 'Generated by scripts/sync-gallery-pins.mjs — see docs/EXTENSION-SECURITY.md task 1. Do not hand-edit.',
        repo: REPO,
        commit,
        base: BASE,
        // served: what the loader hashes. repo: what a human reviewed at `commit`.
        // l10n: true when the two differ only by the site's injected translations.
        extensions: Object.fromEntries(pinned.map(r =>
            [r.slug, {served: r.served, repo: r.repo, l10n: !r.diff.identical}]))
    };

    const prev = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{"extensions":{}}'));
    const changed = pinned.filter(r => prev.extensions[r.slug] && prev.extensions[r.slug].served !== r.served);
    const added = pinned.filter(r => !prev.extensions[r.slug]);
    const dropped = Object.keys(prev.extensions).filter(s => !next.extensions[s]);

    if (has('--check')) {
        const drift = changed.length + added.length + dropped.length;
        console.log(drift
            ? `DRIFT: ${changed.length} changed, ${added.length} added, ${dropped.length} dropped`
            : `up to date at ${commit.slice(0, 12)} (${pinned.length} pinned)`);
        // Advisory on purpose. The gallery is someone else's publishing schedule;
        // a legitimate upstream release must not turn an unrelated PR's CI red.
        return;
    }

    await writeFile(OUT, `${JSON.stringify(next, null, 2)}\n`);
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
        `${failed.length ? `, ${failed.length} unreachable and therefore NOT pinned` : ''}`);
}

// Importable without running: test/gallery-pins.test.mjs exercises
// explainDifference directly, and must not kick off 240 network fetches.
if (process.argv[1] && process.argv[1].endsWith('sync-gallery-pins.mjs')) {
    main().catch(e => {
        console.error(`sync-gallery-pins failed: ${e.message}`);
        process.exit(1);
    });
}
