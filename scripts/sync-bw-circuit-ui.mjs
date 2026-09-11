#!/usr/bin/env node
// Sync the vendored circuit-designer panel into the overlay.
//
// bw-circuit-ui is the UI half of the simulator: parts palette, wiring canvas, multimeter,
// inference from the project's PIN declarations. It consumes bw-board through an injected
// engine (setEngine), so it does not care where the engine lives — which is what makes it
// vendorable at all.
//
// Same contract as the other sync scripts. Discovers files rather than hardcoding a list,
// and verifies afterwards that every relative import resolves.
//
//   --check      exit non-zero (without writing) if stale, for CI.
//   --dir <path> read from a local checkout instead of over HTTP.
//   --pin        record the source sha in vendor-pins.json. A FILE SYNC NEVER MOVES THE
//                PIN; a pin moves only with --pin, and a sync that would move it without
//                --pin is a refusal that prints old and new sha, before anything is written.

import {readFile, writeFile, mkdir, readdir, unlink} from 'node:fs/promises';
import { guardSource } from './lib-source-guard.mjs';
import { recordPin, localSha, assertPinMoveAllowed } from './lib-pin.mjs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'overlay', 'scratch-gui', 'src', 'lib', 'bw-circuit-ui');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;
// Before anything is written: a sync that would move the pin needs --pin (lib-pin.mjs).
if (!check && srcDir) await assertPinMoveAllowed('bw-circuit-ui', await localSha(srcDir));
if (dirIdx !== -1 && srcDir) guardSource(srcDir);
if (!srcDir) { console.error('needs --dir <bw-circuit-ui checkout> for now'); process.exit(2); }

// main.jsx is the Vite harness entry and has no business in the fork.
const SKIP = new Set(['main.jsx']);

/**
 * WHAT THIS SYNC VENDORS, as ONE list read by BOTH walks.
 *
 * It was two, and they had already drifted: the source walk took
 * `jsx?|json|svg|css` and the orphan walk `jsx?|json|svg`. So a `.css` file
 * deleted upstream was copied down for as long as it existed and then kept
 * forever once it did not -- synced by one list, invisible to the other, with
 * nothing red. Adding `.md` to one of them would have made a second file type
 * behave that way.
 *
 * `.md` is here since 2026-09-11: lite ships 267 SVG part drawings out of
 * `parts-data/`, and the documents that say where that art came from stayed
 * upstream purely because this regex did not name their extension.
 */
const VENDORED_EXT = /\.(jsx?|json|svg|css|md)$/;

async function walk (rel = '') {
    const out = [];
    for (const e of await readdir(path.join(srcDir, 'src', rel), {withFileTypes: true})) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...await walk(r));
        // `.md` IS VENDORED, and it was not until 2026-09-11. Lite ships 267 SVG
        // part drawings out of `parts-data/`, and the three documents that say
        // where that art came from -- ART-PROVENANCE.md (methodology and the
        // datasheet sources per chip), THIRD-PARTY.md (the attribution record,
        // naming wokwi-elements as an MIT style reference and asserting that no
        // paths were copied) and README.md (which reveals that the whole
        // directory is generated from a FOURTH repo, bw-parts, that nothing in
        // vendor-pins.json records) -- stayed upstream because `.md` was not in
        // this regex.
        //
        // That was an exclusion by ACCIDENT rather than by decision: every other
        // file this sync declines is named in SKIP with a reason, and these three
        // were declined by an extension list nobody had revisited. The assets
        // travel; the statement that they are clean should travel with them.
        else if (VENDORED_EXT.test(e.name) && !SKIP.has(e.name)) out.push(r);
    }
    return out.sort();
}

// ── Local-divergence guard ─────────────────────────────────────────────
// The 930000d incident: a sync overwrote weeks of lite-local patches
// that had never been upstreamed, and production regressed wall to wall.
// The sync now records a manifest of what IT last wrote; if the vendored
// tree has since been edited locally, a write refuses and lists the
// files — those patches belong UPSTREAM first (or pass
// --overwrite-local to knowingly discard them).
import { createHash } from 'node:crypto';
const manifestPath = path.join(dest, '.vendor-manifest.json');
const sha = (s) => createHash('sha1').update(s).digest('hex');
const overwriteLocal = process.argv.includes('--overwrite-local');

// WHAT THE DIVERGENCE DOCUMENT DECLARES, read rather than re-derived.
//
// Until 2026-09-08 this script refused to sync at all while ANY vendored file
// differed from the last sync's record -- so ONE intentional divergence blocked
// every future sync of the whole tree, permanently. That is why this tree sat 23
// commits behind: not because anyone decided to hold it back, but because the
// safety had no way to say "this one, on purpose".
//
// The document now has a machine-readable block naming exactly which files
// deliberately differ, so the safety can be per-file instead of all-or-nothing.
// It is READ here rather than duplicated: a second list would go stale on its
// own schedule and disagree with the gate that reads the first one.
const DIVERGENCE_DOC = path.join(here, '..', 'docs', 'VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md');
const divergenceSpec = await readFile(DIVERGENCE_DOC, 'utf8').then(md => {
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    return m ? JSON.parse(m[1]) : {};
}).catch(() => ({}));
const declaredDivergent = new Set([
    ...Object.keys(divergenceSpec.files || {}),
    ...(divergenceSpec.lineLevelOnly?.files ?? [])
]);
// Files lite AUTHORED inside this vendored root. Upstream has no counterpart, so
// the delete pass below -- which removes anything not in the source tree -- would
// take them, and nothing would restore them.
const declaredLiteAuthored = new Set([
    ...Object.keys(divergenceSpec.liteAuthored?.files ?? {}),
    // GENERATED files are kept for the same reason and by the same rule, but they
    // are a different KIND: the sync writes them, so they have no upstream
    // counterpart because they describe THIS copy rather than because lite forked
    // them. Split out of liteAuthored 2026-09-11 so that category can mean one
    // thing and reach zero. Both must survive the delete pass below.
    ...Object.keys(divergenceSpec.generated?.files ?? {})
]);
/**
 * Vendored files upstream keeps at its REPOSITORY ROOT rather than under src/.
 *
 * LICENSE, and it had never been synced by anything: this script walks src/, so
 * the copy in the vendored root was placed by hand once and then left alone. By
 * 2026-09-11 it was not the licence any more -- upstream ships the full 373-line
 * MPL-2.0 text and the vendored copy had become the five-line Exhibit A notice
 * with a copyright line appended. Nothing could see that, because the identity
 * gate resolved vendored paths under src/ too and skipped it as "upstream does
 * not have this file".
 *
 * READ FROM THE LEDGER, not repeated here: the same `rootSourced` declaration
 * the gate uses to decide what to COMPARE is what this uses to decide what to
 * COPY, so the two cannot disagree about which files those are.
 */
const rootSourced = divergenceSpec.rootSourced ?? {};
if (!check) {
    const manifest = await readFile(manifestPath, 'utf8').then(JSON.parse).catch(() => null);
    if (manifest) {
        const diverged = [];
        const converged = [];
        const declaredKept = [];
        const declaredMoved = [];
        for (const [rel, hash] of Object.entries(manifest)) {
            const cur = await readFile(path.join(dest, rel), 'utf8').catch(() => null);
            if (cur === null || sha(cur) === hash) continue;
            // THE MANIFEST HASH IS A RECORD; THE INCOMING FILE IS THE THING.
            //
            // A vendored file that ALREADY EQUALS what this sync is about to
            // write cannot be carrying a local edit the write would destroy,
            // whatever the record says. Comparing only against the manifest
            // asks "did the last sync write this content?" when the question
            // is "would this sync lose anything?" -- a proxy standing in for
            // the state, which is species 33 of GATES-THAT-CANNOT-FAIL.
            //
            // AND IT HAD DEADLOCKED THE RE-VENDOR. Measured 2026-09-08: five
            // manifest hashes were stale, and THREE of the five files --
            // BoardCanvas.jsx, hooks/useBoard.js, interaction/transform.js --
            // were byte-identical to upstream at both the pin and the tip, so
            // they carried no local edit at all. Their patches had been
            // upstreamed exactly as this document's step 2 instructs, which
            // converged the files; but the manifest is only rewritten by a
            // SUCCESSFUL sync, and the sync refused because the manifest was
            // stale. The remedy the refusal prescribes was the thing that
            // caused it, and the lane had been stuck behind that since.
            const incoming = await readFile(path.join(srcDir, 'src', rel), 'utf8').catch(() => null);
            if (incoming !== null && cur === incoming) { converged.push(rel); continue; }
            if (declaredDivergent.has(rel)) {
                // A DECLARED DIVERGENCE IS NOT A SURPRISE, but it is only safe to
                // keep while UPSTREAM HAS NOT MOVED THE FILE. The manifest hash is
                // the content the last sync wrote, which IS upstream's content at
                // that time -- so incoming === that hash means upstream has not
                // touched it since, and keeping lite's version loses nothing.
                // If it differs, upstream has done work that keeping the file
                // would silently drop, and silence is the thing this refusal is
                // for. Signal derived from data already on disk; no extra tree.
                (sha(incoming ?? '') === hash ? declaredKept : declaredMoved).push(rel);
                continue;
            }
            diverged.push(rel);
        }
        // Reported, never silent: a file cleared here means the manifest is out
        // of date about it, and this run is what brings the record back in step.
        if (converged.length) {
            console.log(`  ${converged.length} file(s) match the incoming copy exactly, so the stale ` +
                'manifest entry is the only thing that differed -- these are NOT local edits:');
            for (const f of converged) console.log(`    converged ${f}`);
        }
        if (declaredKept.length) {
            console.log(`  ${declaredKept.length} declared divergence(s) kept -- upstream has not ` +
                'touched these since the last sync, so nothing is lost by keeping lite\'s copy:');
            for (const f of declaredKept) console.log(`    kept ${f} (declared in ${path.relative(path.join(here, '..'), DIVERGENCE_DOC)})`);
        }
        if (declaredMoved.length && !overwriteLocal) {
            console.error(`REFUSING to sync: ${declaredMoved.length} DECLARED divergence(s) have moved upstream:`);
            for (const f of declaredMoved) console.error(`  moved ${f}`);
            console.error('\nThese files are declared as deliberate divergences, so this sync would');
            console.error('normally keep them -- but upstream has changed them since the last sync,');
            console.error('and keeping them would silently drop that work. Reconcile each: take');
            console.error("upstream's version if lite's edit is superseded (then REMOVE the entry from");
            console.error('the divergence document, which is what makes this sync take the file), or');
            console.error('port upstream\'s change into lite\'s copy by hand and re-run.');
            process.exit(3);
        }
        if (diverged.length && !overwriteLocal) {
            console.error(`REFUSING to sync: ${diverged.length} vendored file(s) carry LOCAL edits not present at the last sync:`);
            for (const f of diverged) console.error(`  local ${f}`);
            console.error('\nUpstream these patches to bw-circuit-ui first, then re-sync.');
            console.error('To knowingly DISCARD them instead: --overwrite-local');
            // THE FLAG IS THE HAZARD, not the divergence. A refusal that names
            // files and not stakes invites the one-word way past it, so point
            // at what is actually at risk. Measured 2026-09-04: VdpScreen.jsx
            // carries the 8086 keyboard path (browser key -> IBM PC set-1
            // scancode, through the 8255's port A with IRQ1) that upstream has
            // never had, so discarding is not recoverable from upstream.
            console.error('\nBEFORE you reach for that flag: docs/VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md');
            console.error('names what each file diverges by. VdpScreen.jsx holds the 8086 keyboard');
            console.error('path, which upstream has never had — --overwrite-local deletes it.');
            console.error('CircuitDesigner.jsx diverges BOTH ways (19 lines ahead, 46 behind), so');
            console.error('neither side can be taken wholesale.');
            process.exit(3);
        }
        if (diverged.length) console.error(`--overwrite-local: discarding local edits in ${diverged.length} file(s)`);
    }
}

let stale = 0;
const files = [...await walk(), ...Object.keys(rootSourced)];
const written = {};
for (const rel of files) {
    const out = path.join(dest, rel);
    const next = await readFile(
        rootSourced[rel]
            ? path.join(srcDir, rootSourced[rel])
            : path.join(srcDir, 'src', rel), 'utf8');
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current === next) { console.log(`  ok    ${rel}`); written[rel] = sha(next); continue; }
    // A declared divergence is kept, and the manifest records WHAT IS ON DISK
    // rather than what upstream holds. Recording the incoming hash for a file we
    // did not write is how the manifest goes stale about a file, which is the
    // deadlock this script was in until this morning.
    if (!check && declaredDivergent.has(rel) && current !== null) {
        console.log(`  kept  ${rel} (declared divergence)`);
        written[rel] = sha(current);
        continue;
    }
    stale++;
    if (check) { console.log(`  STALE ${rel}`); continue; }
    await mkdir(path.dirname(out), {recursive: true});
    await writeFile(out, next);
    written[rel] = sha(next);
    console.log(`  wrote ${rel}`);
}
if (!check) await writeFile(manifestPath, JSON.stringify(written, null, 1));

// Delete vendored files that no longer exist upstream. Without this, a
// rename (e.g. hobby_gearmotor → gearmotor) leaves both names live, and
// nothing says which is real. The LICENSE file placed in this directory
// for MPL-2.0 compliance is not a vendored source file and must survive.
if (!check) {
    // The manifest is generated into the destination and therefore has no
    // upstream counterpart. Keep it so the next sync can detect Lite-local
    // edits instead of silently losing its baseline after every successful run.
    // KEEP WAS A HARDCODED PAIR AND IT DELETED A LOAD-BEARING FILE.
    //
    // It listed LICENSE and .vendor-manifest.json -- two of the THREE files lite
    // authors inside this root. The third, intro-doc.jsx, was not on it, so the
    // first sync that ever got this far removed it. Measured 2026-09-08, and only
    // seen because it happened: components/ExamplesBrowser.jsx imports
    // '../intro-doc.jsx' for INTRO_L10N, LEVEL_LABELS, LEVEL_COLORS, parseIntro
    // and renderMarkdown, so the delete left an import pointing at nothing.
    //
    // It had never fired before because the refusal above stopped every sync of
    // this tree, so unblocking the sync is what exposed it -- a hazard that had
    // been sitting behind a permanent stop.
    //
    // The list is now DERIVED from the same document that declares them, so the
    // inventory and the protection cannot disagree: adding a lite-authored file
    // without declaring it means the gate refuses it, and declaring it means this
    // pass keeps it. The two hardcoded names stay as a FLOOR for the case where
    // the document cannot be read at all -- losing the manifest would destroy the
    // baseline the local-edit detection depends on.
    const KEEP = new Set(['LICENSE', '.vendor-manifest.json', ...declaredLiteAuthored]);
    async function walkDest (rel = '') {
        const out = [];
        for (const e of await readdir(path.join(dest, rel), {withFileTypes: true})) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) out.push(...await walkDest(r));
            else if (VENDORED_EXT.test(e.name)) out.push(r);
        }
        return out;
    }
    const sourceSet = new Set(files);
    let deleted = 0;
    for (const rel of await walkDest()) {
        if (KEEP.has(path.basename(rel))) continue;
        if (!sourceSet.has(rel)) {
            await unlink(path.join(dest, rel));
            console.log(`  DELETE ${rel}`);
            deleted++;
        }
    }
    if (deleted) console.log(`  removed ${deleted} file(s) no longer upstream`);
}

if (!check) {
    const have = new Set(files);
    const allowed = new Set(['react', 'react-dom', 'prop-types', '@lit/react', 'lit', '@wokwi/elements']); // react-dom: createPortal for the intro reader modal (deliberate, 2026-08-16)
    for (const rel of files) {
        const src = await readFile(path.join(dest, rel), 'utf8');
        // Only a real module specifier counts: a `from '...'` clause, or a
        // side-effect `import '...'`. The previous pattern took the first
        // quoted string on any line starting with import/export, so
        //     export function ExamplesBrowser({ examples, lang = 'en' })
        // was read as importing a package called "en" and the whole vendor
        // aborted. A gate that blocks correct code is as costly as one that
        // passes wrong code — this one blocked every re-vendor, which is the
        // only path anything reaches users by.
        for (const m of src.matchAll(
            /^\s*(?:import|export)\b[^\n]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm
        )) {
            const spec = m[1] || m[2];
            if (spec.startsWith('.')) {
                // resolve relative to this file, allowing an omitted .js/.jsx extension
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
                const ok = have.has(target) || have.has(`${target}.js`) || have.has(`${target}.jsx`) || have.has(`${target}.css`);
                if (!ok) throw new Error(`${rel} imports ${spec}, which was not vendored`);
            } else if (![...allowed].some(a => spec === a || spec.startsWith(`${a}/`))) {
                throw new Error(`${rel} imports an unexpected package "${spec}" — add it to the allow-list and to integrate.mjs deliberately`);
            }
        }
    }
    console.log(`  checked ${files.length} files: imports resolve, only allow-listed packages`);
}
if (check && stale) { console.error(`\n${stale} stale — run: npm run sync:circuitui`); process.exit(1); }
// "synced." named nothing at all — not the commit, not even the checkout. This
// script is --dir-only, so the sha is free to obtain and there was no reason
// for the sentence to be contentless.
const sourceSha = srcDir ? await localSha(srcDir) : null;
console.log(check ? '\nvendored panel up to date.'
    : `\nsynced from bw-circuit-ui@${sourceSha} (local checkout ${srcDir}). Next: npm run integrate`);

// Record the upstream commit this sync captured, so vendor-freshness CI
// compares against the PIN, not a moving HEAD (bump = re-run this sync).
if (!check && srcDir) {
    try {
        await recordPin('bw-circuit-ui', sourceSha);
    } catch (e) { console.warn(`  (pin not recorded: ${e.message})`); }
}
