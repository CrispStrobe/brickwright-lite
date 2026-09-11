// An invariant BETWEEN two copies of i8086-machine.js -- never a property OF each.
//
// `npm run sync:bwboard` would delete 173 lines of lite-only work in this file.
// Everything still constructs. Every test on both sides still passes. That is
// not a gap in either suite: each half is tested against ITSELF, which proves
// both are self-consistent and says nothing about whether they are the SAME,
// which is the only question that matters when one is vendored from the other.
//
// So this test's subject IS the comparison. It cannot pass without reaching
// both the vendored copies and the allow-list that licenses their divergence,
// and -- when the upstream tree is on disk -- upstream too.
//
// The allow-list lives in docs/VENDOR-DIVERGENCE-I8086-MACHINE.md, as a JSON
// block inside the prose that explains it. That is deliberate. The prose
// version of this document recorded the divergence accurately on 2026-09-04
// and was wrong by the next morning, because a document that DESCRIBES a
// divergence has no way to notice when one changes. Now disagreeing is what
// fails, so the doc and the code cannot drift apart.

import {test} from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {execSync} from 'node:child_process';
import {applyVendorRewrites, rewritePairs} from '../scripts/lib/vendor-rewrites.mjs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/VENDOR-DIVERGENCE-I8086-MACHINE.md');
const PINS = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));

// Is `dir` (a checkout, or a `/src` under one) at the PINNED sha for `repo`?
// This gate JUDGES by reading `dir`'s WORKING TREE (see readUpstream), so a dir
// that is NOT at the pin is a peer's feature branch wearing this gate's name --
// the exact red lego-b9 measured on 2026-09-07. gen-bw-board-census.mjs refuses
// off-pin and names both shas; this returns the same fact so callers can too.
// Repo-agnostic on purpose: sb3-creator already has a CI pin-proof though no
// judge-test consumes it yet, and a third caller must inherit this, not a third
// special case.
//
// CI IS NOT EXPOSED, and this is defence in depth rather than a bug fix:
// build.yml ("Fetch the pinned bw-board tree") and vendor-freshness.yml both
// re-read HEAD and refuse off-pin BEFORE setting the env var. This moves that
// proof next to the judgment it guards, so a LOCAL run -- or a future CI path
// that sets the var without copying the YAML check -- is covered by the
// instrument itself. The fleet was NOT judging wrong trees in CI.
const headAtPin = (dir, repo) => {
    const pin = PINS[repo] ?? null;
    let head = null;
    try {
        head = execSync(`git -C ${JSON.stringify(dir)} rev-parse HEAD`,
            {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
    } catch { /* not a git checkout -- head stays null, atPin false */ }
    return {head, pin, atPin: Boolean(pin) && head === pin};
};

const readAllowList = (doc = DOC) => {
    const md = fs.readFileSync(doc, 'utf8');
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(m, `${path.relative(ROOT, doc)} has no \`\`\`json allow-list block -- ` +
        'the test consults that block, so removing it would silently disable this gate');
    return JSON.parse(m[1]);
};

// Every file the allow-list covers, as [filename, entryList] pairs.
const coveredFiles = spec => Object.entries(spec.files);

// The vendored roots that are ACTUALLY PRESENT, which is not the same as the
// roots the doc lists.
//
// CORRECTED 2026-09-05, SAME DAY, AND THE CORRECTION IS THE INTERESTING PART.
//
// I first wrote here that this gate "was green only because of untracked files
// on one machine" and "could never pass in CI". THAT WAS WRONG, and I had the
// evidence to know it before I said it.
//
// What is true: packages/ is gitignored with PARTIAL tracking -- 94 of 127
// files under packages/scratch-gui/src/lib/bw-board are tracked, and the whole
// 8086 support-chip tier is not. Reproduced with `git archive HEAD`, this test
// failed all four subtests.
//
// What is NOT true is the conclusion I drew from that. .gitignore says plainly
// that packages/ is POPULATED, not tracked, and CI does exactly that:
// `npm run vendor` then `node scripts/integrate.mjs`, which copies overlay/
// into packages/. Reproduced with the integrate step, i8086-machine.js is
// present and the existence assertion passes. The 33 untracked files are
// correct to be untracked.
//
// So `git archive HEAD` alone is NOT CI's condition for anything under
// packages/, and treating it as such manufactures a failure. I found a real
// fragility and then described it as a species it was not, having read the
// tar listing but not the .gitignore two lines above the answer.
//
// The fix below is kept, because it is right for a reason that survives the
// correction: the gate should work whether or not packages/ has been
// populated, and it must never count one copy as two.
//
// So: derive the roots from what is on disk, require at least one, and REPORT
// which were found. A root that is absent is a fact, not a reason to skip.
const presentRoots = spec => spec.vendoredRoots.filter(r => fs.existsSync(path.join(ROOT, r)));

// Every present copy of one covered file. May be one path, not two.
const vendoredPaths = (spec, file) => presentRoots(spec)
    .map(r => path.join(ROOT, r, file))
    .filter(p => fs.existsSync(p));

// Species 1 defence: a gate whose corpus is empty passes everything. Assert the
// allow-list is populated BEFORE trusting any result derived from iterating it.
test('the allow-list has a corpus behind it — entries, or identity over the whole tree', () => {
    const spec = readAllowList();
    // NOT A PINNED COUNT. This used to read `>= 8`, which is a number pinned to
    // my own measurement -- so legitimate upstreaming turns it red and the
    // obvious repair is to edit the digit. A floor that is fixed by editing the
    // floor is a convention, not a mechanism. The real coverage check is
    // DERIVED from content, lives in the cross-tree tier below, and cannot be
    // satisfied by changing a number.
    //
    // What survives here is only the species-1 defence: a gate iterating an
    // empty list passes everything, so refuse an empty list. No magic number.
    // THE FLOOR THAT RETIRED ITSELF THE DAY IT MATTERED. This read
    // `coveredFiles(spec).length > 0` -- correct while divergences existed, and
    // a permanent red the moment the list reached the zero this whole apparatus
    // was built to reach. A ratchet whose anti-vacuity check refuses its own
    // goal state cannot be left standing: someone reaching zero deletes the
    // check, and the gate goes vacuous exactly when nothing is left to notice
    // regrowth.
    //
    // So the species-1 defence is made in the right place. AN EMPTY ALLOW-LIST
    // IS FINE; AN EMPTY CORPUS IS NOT. When the list is empty, the claim is
    // discharged by byte-identity over every vendored file instead, and THAT
    // corpus must be non-empty. The schema checks below then run over whichever
    // list exists, plus a fabricated entry that proves they still fire.
    const covered = coveredFiles(spec);
    if (covered.length === 0) {
        const roots = presentRoots(spec);
        assert.ok(roots.length >= 1, 'the allow-list is empty AND no vendored root exists — '
            + 'there is no corpus at all, so nothing here means anything');
        const files = walkFiles(path.join(ROOT, roots[0]));
        assert.ok(files.length > 50,
            `the allow-list is empty and the vendored root holds only ${files.length} file(s). `
            + 'An empty list is the goal; an empty TREE is a broken checkout, and the two '
            + 'look identical to every assertion in this file.');
    }
    for (const [file, cfg] of covered) {
        assert.ok(cfg.liteOnly.length > 0, `${file} is listed with no entries`);
    }
    // The kerotakis lane's rule, enforced rather than suggested: every entry
    // must carry the one sentence a non-programmer could falsify. If nobody
    // can write that sentence for an entry, the entry is protecting something
    // whose loss has no observable consequence -- which is either not worth
    // protecting or not understood, and both want finding out now rather than
    // at the next sync.
    for (const d of coveredFiles(spec).flatMap(([, c]) => c.liteOnly)) {
        assert.ok(d.falsifiable && d.falsifiable.length > 30,
            `allow-list entry '${d.id}' has no 'falsifiable' sentence. Write what BREAKS ` +
            'in terms a non-programmer could check -- not what the diff removes. ' +
            'If you cannot, the entry may be protecting something with no observable effect.');
    }

    assert.ok(presentRoots(spec).length >= 1,
        `none of the vendored roots exist: ${spec.vendoredRoots.join(', ')}`);
    assert.equal(spec.vendoredRoots.length, 2,
        'overlay/ and packages/ are both tracked in this repo; both must be checked. ' +
        'I created a divergence between them once by not force-adding an ignored path.');
    // At least one copy of every covered file must exist. Requiring BOTH is
    // what made this green-here-red-in-CI: packages/ is gitignored and only
    // partially tracked.
    for (const [file] of coveredFiles(spec)) {
        assert.ok(vendoredPaths(spec, file).length >= 1,
            `no vendored copy of ${file} exists under any of ${spec.vendoredRoots.join(', ')}`);
    }
});

test('a sync has not deleted the lite-only work in i8086-machine.js', () => {
    const spec = readAllowList();
    const missing = [];
    for (const [file, cfg] of coveredFiles(spec)) {
        for (const p of vendoredPaths(spec, file)) {
            const src = fs.readFileSync(p, 'utf8');
            for (const d of cfg.liteOnly) {
                if (!new RegExp(d.contains).test(src)) {
                    missing.push(`${d.id} -> ${path.relative(ROOT, p)}\n      what breaks: ${d.falsifiable}`);
                }
            }
        }
    }
    assert.deepEqual(missing, [],
        '\n  LITE-ONLY WORK IS GONE FROM THE VENDORED COPY.\n' +
        '  This is what a sync from bw-board does silently: the machine still\n' +
        '  constructs and no other test fails.\n\n      ' + missing.join('\n      ') +
        '\n\n  If the deletion was intended, delete the entry from the allow-list in\n' +
        '  docs/VENDOR-DIVERGENCE-I8086-MACHINE.md in the same commit.\n');
});

// THE ALLOW-LIST NOW POINTS BOTH WAYS, and until 2026-09-06 it only pointed one.
//
// `liteOnly` entries say "lite has this and upstream does not, so a sync would
// DELETE it". That is nine of the ten divergences in i8086-machine.js. The tenth
// is the inverse -- upstream has the CycleEstimator import and its nine call
// sites, at master AND at the pin, and lite deliberately does not -- and the
// schema had no way to say so. There was no lite-only text for `contains` to
// hold, so the decision was recorded nowhere, for the entire time the nine were
// being carefully maintained beside it. An allow-list that can only describe
// additions will always be missing exactly the entries nobody can write.
//
// So: `liteRemoved` entries carry `absent`, a regex that must NOT match the
// vendored copy. Same falsifiable-sentence rule as the nine, for the same reason.
//
// WHAT THIS HALF CANNOT SEE, stated rather than left to be discovered. A
// `contains` entry is protected from going stale by the `converged` check below:
// if its text arrives upstream it is no longer a divergence and the entry says
// so. The mirror of that for `absent` is "upstream still HAS this", and no
// offline test can check it -- there is no upstream copy here. So a liteRemoved
// entry would keep passing if bw-board ever dropped the cycle estimator, quietly
// protecting nothing. That staleness check belongs in sync-bw-board.mjs, which
// holds the upstream text in both --dir and remote mode. This gate asserts the
// absence; the sync asserts the divergence is still real.
test('a merge has not reintroduced what lite deliberately removed', () => {
    const spec = readAllowList();
    const reintroduced = [];
    let entries = 0;
    for (const [file, cfg] of coveredFiles(spec)) {
        for (const d of cfg.liteRemoved || []) {
            entries++;
            assert.ok(d.falsifiable && d.falsifiable.length > 30,
                `liteRemoved entry '${d.id}' has no 'falsifiable' sentence. A removal needs one ` +
                'as much as an addition: if nobody can say what breaks when it comes back, ' +
                'nobody can say why it went.');
            for (const p of vendoredPaths(spec, file)) {
                if (new RegExp(d.absent).test(fs.readFileSync(p, 'utf8'))) {
                    reintroduced.push(`${d.id} -> ${path.relative(ROOT, p)}` +
                        `\n      what breaks: ${d.falsifiable}`);
                }
            }
        }
    }
    // RETIRED 2026-09-11, IN THE COMMIT THAT EMPTIED THE SET, as this assertion's
    // own message instructed. The last `liteRemoved` entry was the i8086
    // CycleEstimator, and it did not converge -- it DISSOLVED. bw-board 5afadcd
    // made the estimator an injected option instead of a module-scope import, so
    // lite takes i8086-machine.js byte-identical and simply does not pass one.
    // A removal stops being a divergence when the thing removed stops being
    // mandatory, and there is then nothing a merge could put back.
    //
    // The zero is ASSERTED rather than assumed, so this reads as a measured empty
    // set and not as a gate somebody quietly deleted. A new `liteRemoved` entry
    // reds it, and whoever adds one restores the `entries > 0` floor with it --
    // at which point the loop above is live again and this comment goes.
    assert.equal(entries, 0,
        `expected zero liteRemoved entries and found ${entries}. A new removal is a ` +
        'new divergence: give it a `falsifiable` sentence and restore the ' +
        '`entries > 0` floor this comment replaced, so the loop above is held again.');
    assert.deepEqual(reintroduced, [],
        '\n  A MERGE HAS PUT BACK SOMETHING LITE REMOVED ON PURPOSE.\n' +
        '  A three-way merge toward upstream reintroduces these by default --\n' +
        '  they are in upstream, they are not here, so the merge adds them back\n' +
        '  and the reason they went is in the allow-list, not in the diff.\n\n  ' +
        reintroduced.join('\n  ') + '\n');
});

test('the two dual-tracked vendored copies have not drifted apart', t => {
    const spec = readAllowList();
    let compared = 0;
    for (const [file] of coveredFiles(spec)) {
        const paths = vendoredPaths(spec, file);
        if (paths.length < 2) {
            // Not a pass and not a failure: there is only one copy here to
            // compare. Said out loud so "drift check green" is never read as
            // "both copies agree" when only one was present.
            t.diagnostic(`${file}: only ${paths.length} copy present, drift NOT checked`);
            continue;
        }
        compared++;
        const [a, b] = paths.map(p => fs.readFileSync(p, 'utf8'));
        assert.equal(a, b, `the two vendored copies of ${file} differ. ` +
        'These are the same file tracked twice; editing one and not the other is how ' +
            'These are the same file tracked twice; editing one and not the other is how ' +
            'a fix ships in the dev build and not the packaged one.');
    }
    t.diagnostic(`drift compared for ${compared} of ${coveredFiles(spec).length} covered file(s)`);
});

// The external anchor. Tiers 1-3 above are self-contained -- they can be
// satisfied by the lite tree alone, which means they verify that lite still has
// what the doc says it has, NOT that upstream still lacks it. This tier is the
// one that reaches the other side. When the upstream tree is not on disk it does
// NOT pass quietly: a check reports on what it FOUND, never on what exists.
// THE PINNED TREE, resolved the same way the converged-work test below resolves
// it and for the same reasons -- see the long note there about /tmp symlinks and
// about a sibling checkout being a DIRECTORY, not a COMMIT. Factored out rather
// than copied: two resolutions of "which upstream" would be two answers, and the
// one that is wrong would be the one nobody re-read.
const pinnedSrcDir = (envVar = 'BW_BOARD_DIR', repo = 'bw-board') => {
    const candidates = [
        process.env[envVar], // gate-shapes-allow: judged only when this is set, see below
        path.resolve(ROOT, `../../${repo}`),
        path.resolve(ROOT, `../${repo}`)
    ].filter(Boolean);
    const TMP = fs.realpathSync(os.tmpdir());
    const outsideTmp = (d) => {
        try { return !fs.realpathSync(d).startsWith(TMP); } catch { return false; }
    };
    const dir = candidates.map(d => path.join(d, 'src'))
        .filter(d => fs.existsSync(d))
        .filter(d => process.env[envVar] ? true : outsideTmp(d))[0];
    // `pinned` means the tree IS at the pin, not merely that the env var is set:
    // only an explicit env-var dir is a judging candidate, and only when its
    // HEAD equals the pin. Off-pin (or a non-env fallback) SPEAKS, never JUDGES.
    const {head, pin, atPin} = dir && process.env[envVar]
        ? headAtPin(dir, repo)
        : {head: null, pin: PINS[repo] ?? null, atPin: false};
    return {dir, pinned: Boolean(process.env[envVar]) && atPin, head, pin, candidates};
};

// ONE IMPLEMENTATION OF THE BYTE-IDENTITY CLAIM, TWO CORPORA. bw-board and
// bw-circuit-ui are different trees with different manifests and the same
// question, so this is a parameter, not a second copy: a duplicated claim goes
// stale on its own schedule and the pair disagree with nobody noticing, which is
// the failure this whole file exists to prevent.
//
// RECURSIVE, AND EVERY EXTENSION. The first version walked one directory and
// filtered `.js`, which silently excluded bw-board's `devices/` subtree -- 55
// files that no gate compared. Measured before widening: those 55 are all
// byte-identical and the walk adds exactly one undeclared name, LICENSE, now
// declared. bw-circuit-ui is .jsx, .json and .svg and nested throughout, so a
// basename-and-.js walk would have seen almost none of it.
const walkFiles = (root) => {
    const out = [];
    const rec = (dir, prefix) => {
        for (const e of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
            const rel = prefix ? `${prefix}/${e.name}` : e.name;
            if (e.isDirectory()) rec(path.join(dir, e.name), rel);
            else if (e.isFile()) out.push(rel);
        }
    };
    rec(root, '');
    return out;
};

/**
 * Upstream text AS THE SYNC WOULD WRITE IT, which is the question a vendored file
 * should be asked. "Does this match upstream" is a question lite never had a yes
 * to: sync-bw-board.mjs rewrites a deep import on the way in, so the vendored
 * copy differs from upstream by construction and always will.
 *
 * Comparing raw bytes made that sync-authored difference look like lite-only
 * work, so cortex-m0-machine.js had to be DECLARED in an inventory whose own
 * `why` says it records forward-ported work. It carries none -- running
 * `sync-bw-board.mjs --only cortex-m0-machine.js` against a checkout at the pin
 * leaves the file's hash unmoved.
 *
 * Species 37 in its structural form: `--check` said 13, the manifest said 14,
 * both correct, and the gap read exactly like a stale declaration. One
 * instrument, imported by both callers, is the remedy the species prescribes.
 *
 * This is STRICTLY STRONGER than the byte comparison it replaces, not weaker: it
 * still refuses every difference the sync would not have made. The rewrite table
 * is bw-board's; it is a no-op on a tree whose files do not contain that import,
 * which is why one reader serves both upstreams.
 */
// The rewrite depth is derived from where the copy lands, so the reader is
// built for a specific vendored root rather than being global. That is the
// boundary this file's header used to name as reachable-but-unasked: a tree at
// a different nesting depth carrying the same import now gets the right number
// of `../` instead of this one's.
const readerFor = spec => {
    const [root, ...mirrors] = spec.vendoredRoots;
    return u => applyVendorRewrites(fs.readFileSync(u, 'utf8'), root, {repoRoot: ROOT, mirrors});
};

/**
 * NOT EVERY VENDORED FILE COMES FROM UPSTREAM'S src/.
 *
 * This walk compared every vendored path against `<upstream>/src/<same path>`,
 * so a file upstream keeps at its REPOSITORY ROOT had no counterpart to compare
 * against, fell out as "upstream does not have this", and had to be declared as
 * LITE-AUTHORED to keep the gate green. LICENSE was exactly that, in both
 * vendored trees, and the declaration said "attribution, not code -- permanent".
 *
 * IT WAS NOT PERMANENT, IT WAS UNCOMPARED, AND BOTH COPIES HAD DRIFTED.
 * Measured 2026-09-11, the day this mapping was added:
 *
 *   - bw-board/LICENSE had lost its copyright YEAR: upstream publishes
 *     "Copyright (c) 2026 CrispStrobe", the vendored copy said "Copyright (c)
 *     CrispStrobe".
 *   - bw-circuit-ui/LICENSE was not the licence at all. Upstream ships the full
 *     373-line MPL-2.0 text; the vendored copy was the five-line Exhibit A
 *     notice with a copyright line appended -- a POINTER to the licence sitting
 *     under the name of the licence, in a directory whose sync script says in
 *     its own comment that the file is there "for MPL-2.0 compliance".
 *
 * Neither was anyone's decision. They were the consequence of a file that no
 * gate could see, kept quiet by a declaration that explained its absence from
 * the comparison as a property of the file.
 *
 * So the fix is to COMPARE IT, not to declare it. `rootSourced` maps a vendored
 * path to a path relative to the upstream REPOSITORY ROOT; those files then run
 * through exactly the same byte-identity assertion as everything else, and a
 * licence that drifts from the one its author publishes reds like any other
 * divergence.
 */
const classify = (spec, srcDir) => {
    const readUpstream = readerFor(spec);
    const vendorRoot = path.join(ROOT, spec.vendoredRoots[0]);
    const declared = new Set([...Object.keys(spec.files || {}), ...(spec.lineLevelOnly?.files ?? [])]);
    const liteAuthored = spec.liteAuthored?.files ?? {};
    // `srcDir` is `<upstream>/src`; its parent is the upstream repository root.
    const repoRoot = path.dirname(srcDir);
    const rootSourced = spec.rootSourced ?? {};
    const identical = [], diverged = [], undeclared = [], liteOnly = [];
    for (const f of walkFiles(vendorRoot)) {
        const u = rootSourced[f]
            ? path.join(repoRoot, rootSourced[f])
            : path.join(srcDir, f);
        if (!fs.existsSync(u)) { liteOnly.push(f); continue; }
        if (fs.readFileSync(path.join(vendorRoot, f), 'utf8') === readUpstream(u)) identical.push(f);
        else if (declared.has(f)) diverged.push(f);
        else undeclared.push(f);
    }
    return {identical, diverged, undeclared, liteOnly, liteAuthored, declared};
};

// Registered once per upstream. Everything that differs between them is an
// argument; the question, the assertions and their wording are shared, so a
// future fix lands in one place for both trees.
const declaresEveryDivergence = (label, {doc, env, repo, floor}) =>
    test(`no vendored ${label} file diverges from upstream at the pin without being declared`, t => {
    // WHY THIS IS NOT THE TWO INVENTORIES ABOVE, and why it lives in this file
    // rather than in one of its own.
    //
    // The coverage check is IDENTIFIER-based: it sees a file only if lite
    // declares a name upstream does not have. The lineLevelOnly inventory is
    // LINE-based and ONE-DIRECTIONAL -- `lineLost(lite, upstream)` collects
    // lines lite has that upstream lacks, so a file where lite is merely BEHIND
    // upstream is invisible to it. reseat-gate.js was exactly that on
    // 2026-09-06, and it took a hand measurement to find. This asserts the
    // strongest available form, BYTE EQUALITY, and admits a difference only
    // when the manifest names it.
    //
    // It is here, in the file that already walks this tree and resolves this
    // pin, ON PURPOSE. A separate gate answering "does this file match upstream
    // at the pin" would be a SECOND CLAIM about a fact this file already
    // computes, and the two would go stale on different days. The rule this
    // repo applies to documents applies to gates: one authority, mirrors that
    // must agree with it.
    //
    // WHAT WAS REJECTED, because the measurement is the interesting part. The
    // first proposal was: refuse any commit that touches a vendored path unless
    // it also MOVES that upstream's pin. Run over the last 400 commits on main,
    // 29 touch a vendored path and that rule refuses 10 of them -- including
    // e33087191, a legitimate forward-sync that copies upstream content in at a
    // pin already correct, so there is nothing for it to move. One of the ten
    // was a real defect. A gate at one-in-ten precision does not survive; it
    // grows an --allow flag inside a week and then it is decoration.
    //
    // A pin move is a PROXY for convergence. This asks the thing itself: after
    // the commit, IS the content what the recorded pin says it is? Same move as
    // baseForFile -- ask what the content is, not what the commit did.
    const {dir: srcDir, pinned, head, pin, candidates} = pinnedSrcDir(env, repo);
    if (!srcDir) {
        t.diagnostic(`SKIPPED, NOT PASSED: upstream not found. Looked in: ${candidates.join(', ')}.`);
        t.skip('upstream tree not on disk -- byte-identity against the pin NOT verified');
        return;
    }

    const spec = readAllowList(doc);
    const {identical, diverged, undeclared, liteOnly, liteAuthored, declared} = classify(spec, srcDir);

    // Species 1: a corpus of nothing satisfies every assertion below. 133 files
    // as of 2026-09-07; the floor is deliberately far under it, because this
    // guards against an EMPTY read, not against the tree changing size.
    assert.ok(identical.length + diverged.length > floor,
        `only ${identical.length + diverged.length} vendored file(s) were compared against ` +
        `${srcDir} -- that is not this tree, and every assertion below would pass on it`);

    if (!pinned) {
        // Same ruling as the test below: the sibling may SPEAK, it may not
        // JUDGE. A byte difference against an unknown commit is a report about
        // someone's feature branch, not a divergence.
        t.diagnostic(`sibling tree ${srcDir}: ${identical.length} identical, ${diverged.length} ` +
            `declared-divergent, ${undeclared.length} undeclared` +
            `${undeclared.length ? ` (${undeclared.join(', ')})` : ''}, ${liteOnly.length} lite-only`);
        t.skip(process.env[env] && head
            ? `${env} is at ${head.slice(0, 9)} but vendor-pins.json pins ${repo} at ${pin?.slice(0, 9)} -- ` +
                `a sibling checkout at the wrong commit may SPEAK, not JUDGE; check it out at the pin to judge (CI does, proving HEAD==pin)`
            : `a sibling ${repo} checkout was found but its COMMIT is unknown -- set ` +
                `${env} to a checkout at the sha in vendor-pins.json to judge it (CI does)`);
        return;
    }

    assert.deepEqual(undeclared, [],
        '\n  VENDORED FILES THAT DIFFER FROM UPSTREAM AT THE PIN AND ARE DECLARED NOWHERE:\n    ' +
        undeclared.join('\n    ') +
        '\n\n  The pin says these files ARE upstream at that sha. They are not. Either the\n' +
        '  change belongs upstream (send it there and re-pin, which is the rule for\n' +
        '  vendored files), or lite means to keep it -- in which case give it a named\n' +
        '  entry in docs/VENDOR-DIVERGENCE-I8086-MACHINE.md, or add it to lineLevelOnly\n' +
        '  if the difference is only body-level. What is not available is silence: an\n' +
        '  undeclared difference is deleted by the next sync with nothing to say what it\n' +
        '  cost.\n');

    // The reverse direction is just as load-bearing. A declaration is an
    // exemption from byte identity; if the file has converged, that exemption
    // must leave with it. Without this assertion, restoring a retired
    // lineLevelOnly entry passes while the diagnostic still reports zero
    // divergence -- exactly the graveyard shape this inventory forbids for
    // liteAuthored entries below.
    const staleDeclared = [...declared].filter(f => !diverged.includes(f));
    assert.deepEqual(staleDeclared, [],
        '\n  DECLARED VENDOR DIVERGENCES THAT NO LONGER DIVERGE:\n    ' +
        staleDeclared.join('\n    ') +
        '\n\n  Upstream now holds the same bytes. Remove the stale declaration; keeping it\n' +
        '  would let a later local fork reuse an exemption whose reason has expired.\n');

    // CASE FOUR, and it is an INVENTORY, not a refusal of the file's existence.
    // These are lite-authored files living inside a vendored root -- the mirror
    // image of absentByDesign. Making their mere presence a failure would red
    // main over seven files whose intent nobody had established; requiring each
    // to be DECLARED turns them into seven decisions made once. Ratchets the
    // same way the rest of this manifest does: removal is free, addition costs
    // a reason in the same commit.
    // A THIRD KIND, AND IT IS NOT LITE-AUTHORED SOURCE. `.vendor-manifest.json`
    // is written BY the sync as its record of what it last wrote -- the baseline
    // the local-edit detection compares against. Filing it under "files lite
    // authored inside a vendored root" made that category mean two different
    // things, and the reason written beside it had to argue that a generated
    // bookkeeping file was a deliberate piece of lite source.
    //
    // Separating them is what lets `liteAuthored` reach a meaningful zero: with
    // the manifest in the list, the count can never fall below one, so the
    // ratchet's terminal value would have been "1, forever, for a reason that is
    // not a divergence". A number that cannot reach its goal stops being read.
    const generated = spec.generated?.files ?? {};
    const undeclaredLiteOnly = liteOnly.filter(f => !liteAuthored[f] && !generated[f]);
    assert.deepEqual(undeclaredLiteOnly, [],
        '\n  LITE-AUTHORED FILES INSIDE THE VENDORED ROOT, DECLARED NOWHERE:\n    ' +
        undeclaredLiteOnly.join('\n    ') +
        '\n\n  Upstream has no such file, so nothing restores these if a sync removes them\n' +
        '  and no upstream review ever sees them. Add each to liteAuthored.files with a\n' +
        '  reason that says WHY IT LIVES IN A VENDORED DIRECTORY rather than beside the\n' +
        "  code that calls it -- \"a vendored sibling imports it by relative path\" is a\n" +
        '  reason; "it was convenient" is the thing this list exists to surface.\n');

    // And the other direction, or the list becomes a graveyard: every declared
    // entry must still BE a lite-authored file here. One that landed upstream,
    // or moved out of this directory, has to leave the list.
    const stale = [...Object.keys(liteAuthored), ...Object.keys(generated)]
        .filter(f => !liteOnly.includes(f));
    assert.deepEqual(stale, [],
        '\n  liteAuthored ENTRIES THAT NO LONGER DESCRIBE ANYTHING:\n    ' + stale.join('\n    ') +
        '\n\n  The file moved out of the vendored root, or upstream now has it. Either way\n' +
        '  the entry is stale -- remove it. An inventory that can only fail one way\n' +
        '  accumulates exemptions nobody can retire.\n');

    t.diagnostic(`byte-identity vs ${path.basename(path.dirname(srcDir))} at the pin: ` +
        `${identical.length} identical, ${diverged.length} declared-divergent ` +
        `(${diverged.join(', ')}), ${liteOnly.length} lite-authored and declared`);
    });

// bw-board: 162 identical / 19 declared / 8 lite-authored as of 2026-09-07.
declaresEveryDivergence('bw-board', {doc: DOC, env: 'BW_BOARD_DIR', repo: 'bw-board', floor: 50});

// bw-circuit-ui: 676 tracked files, 674 upstream-identical / 0 declared /
// 2 lite-authored at e18dad586. The
// LARGEST vendored tree in the repository and, until 2026-09-07, the one with no
// machine-readable manifest at all -- its divergence document was prose, and the
// prose was wrong in every row: two files it listed as diverging had been
// upstreamed and were byte-identical, the one it described as diverging BOTH
// WAYS was purely lite-ahead, and the largest divergence in the tree was not
// mentioned. Found because vendor-freshness's circuit-designer step had been
// reporting two STALE files for thirteen hours inside a workflow everyone had
// learned to ignore.
declaresEveryDivergence('bw-circuit-ui', {
    doc: path.join(ROOT, 'docs/VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md'),
    env: 'BW_CIRCUIT_UI_DIR', repo: 'bw-circuit-ui', floor: 400,
});

test('upstream has not converged on the lite-only work (needs the bw-board tree)', t => {
    const spec = readAllowList();
    // gate-shapes-allow: the ambient part is WHICH directory, and a wrong answer
    // is now caught by the corpus check below rather than passing as a clean
    // negative. The tier still skips loudly when there is no tree at all.
    const candidates = [
        process.env.BW_BOARD_DIR, // gate-shapes-allow: see the corpus check below
        path.resolve(ROOT, '../../bw-board'),
        path.resolve(ROOT, '../bw-board')
    ].filter(Boolean);
    // NEVER BIND TO A CANDIDATE INSIDE THE SYSTEM TEMP DIR.
    //
    // `path.resolve(ROOT, '../bw-board')` is meant to find a sibling checkout.
    // When ROOT is a reproduction tree at /tmp/clean-checkout-XXXX, that
    // candidate is `/tmp/bw-board` -- and on this box `/tmp/bw-board` is a
    // SYMLINK TO THE REAL REPOSITORY, created weeks ago by someone else. So a
    // run inside a deliberately isolated tree reached straight back out to the
    // host's live bw-board, which defeats the entire point of reproducing a
    // clean checkout.
    //
    // It happened to resolve somewhere real. That is luck: /tmp is shared and
    // world-writable, and the next thing named `bw-board` there could be
    // anything at all. A source sibling is never legitimately inside the
    // system temp directory, so refuse the whole class rather than special-case
    // the symlink.
    //
    // Found because `audit-clean-checkout` reported this file FAILING while the
    // same tree run by hand PASSED -- the two disagreed, and the disagreement
    // was the finding.
    const TMP = fs.realpathSync(os.tmpdir());
    const outsideTmp = (d) => {
        try { return !fs.realpathSync(d).startsWith(TMP); } catch { return false; }
    };
    const srcDir = candidates.map(d => path.join(d, 'src'))
        .filter(d => fs.existsSync(d))
        .filter(d => process.env.BW_BOARD_DIR ? true : outsideTmp(d))[0];
    // A SIBLING CHECKOUT IS A DIRECTORY, NOT A COMMIT — and this comparison is
    // only meaningful against the tree AT THE PIN. The /tmp rule above closed
    // binding to the wrong REPOSITORY; this closes binding to the right
    // repository at the wrong COMMIT, which the corpus check cannot see because
    // the files are all there and all plausible.
    //
    // MEASURED 2026-09-07 (lego-b9): on the VPS both fallbacks resolve to
    // checkouts a peer left on a feature branch (`../../bw-board` at 2e7143a
    // `vocab-lego-be`, `../bw-board` at 5f79057 `fab-cuiB-board`), neither the
    // pin nor upstream's tip. Against those this test went RED with "APPEARED
    // (new divergence nobody has written up): board.js, rp2040-bootrom.js".
    // Against a clone AT THE PIN, in the same worktree, minutes apart: 5/5, no
    // divergence. The red was a report about a peer's branch, wearing this
    // gate's name.
    //
    // So the sibling still gets to SPEAK — the divergence list is real
    // information for whoever has that tree — but it may not JUDGE. Only
    // BW_BOARD_DIR, which by the fleet's convention means the tree at the pin
    // (test/vendor-absent-by-design.test.mjs states it, and CI's
    // "Fetch the pinned bw-board tree" step re-reads HEAD to prove it), decides
    // this gate. Recorded, not judged: the same answer the Costume interactivity
    // ceiling got when its number turned out to be about the runner.
    const {head, pin, atPin} = srcDir && process.env.BW_BOARD_DIR
        ? headAtPin(srcDir, 'bw-board')
        : {head: null, pin: PINS['bw-board'] ?? null, atPin: false};
    const pinned = Boolean(process.env.BW_BOARD_DIR) && atPin;
    if (!srcDir) {
        // Not an assertion failure -- upstream genuinely is not here. But it is
        // reported, and it is NOT counted as the invariant having been checked.
        t.diagnostic(`SKIPPED, NOT PASSED: upstream ${spec.upstreamRepo}/src ` +
            `not found. Looked in: ${candidates.join(', ')}. ` +
            'Set BW_BOARD_DIR to check the cross-tree invariant.');
        t.skip('upstream tree not on disk -- cross-tree invariant NOT verified');
        return;
    }

    // EVERY COVERED FILE, not just the one whose divergence someone wrote up
    // first. The single-file version protected i8086-machine.js and let fifteen
    // others lose 950 lines when I ran the sync for real; scoping a gate to the
    // instance that prompted it is how that happened.
    //
    // AND THE SET OF COVERED FILES IS ITSELF DERIVED. Iterating only the files
    // the list names means DELETING a file from the list deletes its coverage
    // requirement -- I red-proved exactly that and it passed silently, which is
    // the kerotakis lane's "graveyard of stale exemptions" at file granularity:
    // an allow-list that can only fail in one direction. So: scan the vendored
    // tree, find every file that HAS lite-only declarations, and require the
    // list to cover it. Removing an entry can then only be made green by
    // removing the WORK, which is the decision the entry exists to force.
    const summary = [];
    const declaredIn = src => ({
        methods: new Set([...src.matchAll(/^\s{4}(?:static\s+)?([A-Za-z_]\w*)\s*\(/gm)].map(m => m[1])),
        fields: new Set([...src.matchAll(/this\.([A-Za-z_]\w*)\s*=/g)].map(m => m[1]))
    });
    const readUpstream = readerFor(spec);
    const vendorRoot = path.join(ROOT, spec.vendoredRoots[0]);
    const shouldCover = [];
    const liteOnly = []; // vendored files upstream does not have at this pin — reported, not a silent skip
    for (const f of fs.readdirSync(vendorRoot).filter(x => x.endsWith('.js')).sort()) {
        const u = path.join(srcDir, f);
        if (!fs.existsSync(u)) { liteOnly.push(f); continue; }
        const L = declaredIn(fs.readFileSync(path.join(vendorRoot, f), 'utf8'));
        const U = declaredIn(readUpstream(u));
        const upAll = new Set([...U.methods, ...U.fields]);
        const only = [...new Set([...L.methods, ...L.fields])]
            .filter(x => !upAll.has(x) && !spec.notIdentifiers.includes(x));
        if (only.length) shouldCover.push(`${f} (${only.join(', ')})`);
    }
    const uncovered = shouldCover.filter(x => !spec.files[x.split(' ')[0]]);
    if (!pinned) {
        // The tree is of unknown provenance (see the note above). Report what it
        // says, name what it would take to judge, and skip -- a divergence
        // measured against an arbitrary branch is not a divergence.
        t.diagnostic(`sibling tree ${srcDir}: ${shouldCover.length} file(s) carry lite-only work, ` +
            `${uncovered.length} not covered by the allow-list${uncovered.length ? ` (${uncovered.join('; ')})` : ''}; ` +
            `${liteOnly.length} vendored file(s) it does not have${liteOnly.length ? ': ' + liteOnly.join(', ') : ''}`);
        t.skip(process.env.BW_BOARD_DIR && head
            ? `BW_BOARD_DIR is at ${head.slice(0, 9)} but vendor-pins.json pins bw-board at ${pin?.slice(0, 9)} -- ` +
                'a sibling checkout at the wrong commit may SPEAK, not JUDGE; check it out at the pin to judge (CI does, proving HEAD==pin)'
            : 'a sibling bw-board checkout was found but its COMMIT is unknown, and this ' +
                'invariant is only meaningful against the tree at the pin -- set BW_BOARD_DIR to a ' +
                'bw-board checkout at the sha in vendor-pins.json to judge it (CI does)');
        return;
    }
    assert.deepEqual(uncovered, [],
        '\n  FILES WITH LITE-ONLY WORK THAT THE ALLOW-LIST DOES NOT COVER:\n    ' +
        uncovered.join('\n    ') +
        '\n\n  A sync deletes this work and nothing explains what it costs. Add the file\n' +
        '  to the allow-list with a falsifiable sentence per entry. This set is SCANNED\n' +
        '  from the tree, not read from the list, so dropping a file from the list does\n' +
        '  not drop the requirement -- only removing the work does.\n');
    t.diagnostic(`derived: ${shouldCover.length} file(s) carry lite-only work, all covered; ${liteOnly.length} vendored file(s) upstream does not have at this pin, not compared${liteOnly.length ? ': ' + liteOnly.join(', ') : ''}`);

    // THE OTHER 458 LINES. The coverage above is identifier-based, so it sees
    // only files that declare something new. A file whose forward-ported work
    // is entirely in changed method bodies, extra branches or comments is
    // INVISIBLE to it -- and eleven files are in exactly that state, including
    // i8086-debug.js (190 lines) and emu8051-debug.js (170).
    //
    // They are protected by the sync's content-derived guard. But that guard
    // only runs when someone runs the sync, and the whole lesson of this file
    // is that "protected by something that runs elsewhere" is how the fifteen
    // files were lost. This inventory is what makes the SUITE see them.
    //
    // Recorded as a SET, not counts: line counts churn on every ordinary edit
    // and a gate that cries wolf gets deleted. Membership changes rarely and
    // means something both ways.
    const lineLost = (cur, next) => {
        const incoming = new Set(next.split('\n').map(l => l.trim()));
        return cur.split('\n').map(l => l.trim())
            .filter(l => l && l !== '}' && l !== '};' && l !== '{' && !incoming.has(l));
    };
    const namedFiles = new Set(Object.keys(spec.files));
    const actual = [];
    const notCompared = []; // upstream lacks the file, or the allow-list names it — reported below
    for (const f of fs.readdirSync(vendorRoot).filter(x => x.endsWith('.js')).sort()) {
        const u = path.join(srcDir, f);
        if (!fs.existsSync(u) || namedFiles.has(f)) { notCompared.push(f); continue; }
        if (lineLost(fs.readFileSync(path.join(vendorRoot, f), 'utf8'),
            readUpstream(u)).length) actual.push(f);
    }
    const recorded = spec.lineLevelOnly.files;
    const appeared = actual.filter(f => !recorded.includes(f));
    const gone = recorded.filter(f => !actual.includes(f));
    assert.deepEqual({appeared, gone}, {appeared: [], gone: []},
        '\n  THE INVENTORY OF UNDOCUMENTED FORWARD-PORTED WORK HAS MOVED.\n\n' +
        (appeared.length ? `  APPEARED (new divergence nobody has written up): ${appeared.join(', ')}\n` +
            '    A sync now deletes work in these and no entry says what it costs. Either\n' +
            '    give the file a named allow-list entry, or add it here if the work is\n' +
            '    genuinely just body-level and you accept the coarse guard.\n' : '') +
        (gone.length ? `  GONE (no longer diverged): ${gone.join(', ')}\n` +
            '    Upstreamed, or the work was deleted. Remove it from lineLevelOnly.files --\n' +
            '    an inventory that only fails one way becomes a graveyard of stale entries.\n' : ''));
    t.diagnostic(`inventory: ${actual.length} file(s) with line-level-only divergence, as recorded; ${notCompared.length} not compared (upstream lacks the file, or the allow-list names it)`);
    for (const [file, cfg] of coveredFiles(spec)) {
    const found = path.join(srcDir, file);
    if (!fs.existsSync(found)) {
        // Upstream does not have this file at all, so nothing here can have
        // converged. Report it -- a file that vanished upstream is a fact worth
        // seeing, not a silent pass.
        t.diagnostic(`${file}: not present upstream at all -- nothing to compare`);
        continue;
    }
    const up = readUpstream(found);

    // BEFORE trusting a negative result derived from this file, prove the file
    // is the one we mean. Every assertion below is of the form "upstream does
    // NOT contain X" -- and an empty, truncated or simply WRONG file satisfies
    // all of them perfectly. That is species 1 (a gate with no corpus) one
    // layer out: the tier would report "upstream has not converged" having
    // never read upstream. scripts/audit-gate-shapes.mjs flagged the discovery
    // below as AMBIENT-BINDING and was right to -- this is the hole it meant.
    //
    // THE PROPERTIES BELOW ARE IDENTITY, NOT FEATURES, and that distinction was
    // the kerotakis lane's prediction about where the next one of these hides:
    // "something that proves the corpus by a property the corpus can lack for
    // an unrelated reason." My first version asserted upstream contains
    // `ne2000`. Upstream is entitled to drop the NE2000 -- that is a product
    // decision, not a corruption -- and when it did, this check would go red
    // for the wrong reason, someone would read the message, see it was a false
    // alarm, and DELETE THE CHECK. A corpus proof that cries wolf is a corpus
    // proof with a short life.
    //
    // So: prove the file is the module we mean, by things it cannot stop being
    // while still being that module. A file without the class declaration and
    // its export is not a changed i8086-machine.js; it is a different or
    // damaged file. Features are checked separately, in graftedFromUpstream,
    // where a legitimate removal SHOULD be visible as a decision.
    for (const [what, re] of [
        ['at least one export', /^export\s/m],
        ['a plausible amount of source (>100 lines)', /(?:.*\n){100}/]
    ]) {
        assert.match(up, re, `upstream file at ${found} does not contain ${what}. ` +
            'Refusing to conclude anything from it: every check below is a NEGATIVE ' +
            'assertion, which a wrong or truncated file passes trivially.');
    }

    const converged = cfg.liteOnly.filter(d => new RegExp(d.contains).test(up));
    assert.deepEqual(converged.map(d => d.id), [],
        `\n  UPSTREAM NOW HAS WORK THE ALLOW-LIST CALLS LITE-ONLY: ` +
        `${converged.map(d => d.id).join(', ')}.\n` +
        '  The entry is obsolete -- delete it from the allow-list. The doc cannot go\n' +
        '  stale in this direction either, because agreeing with upstream now fails.\n');

    // And the grafted work must still be present on BOTH sides -- the direction
    // that catches a graft being reverted upstream or lost here.
    const lite = fs.readFileSync(vendoredPaths(spec, file)[0], 'utf8');
    for (const g of (cfg.graftedFromUpstream || [])) {
        const re = new RegExp(g.contains);
        assert.ok(re.test(up), `grafted work '${g.id}' is gone from UPSTREAM`);
        assert.ok(re.test(lite), `grafted work '${g.id}' is gone from the vendored copy`);
    }
    // DERIVED COVERAGE, replacing the pinned floor. Extract the identifiers this
    // file DECLARES here and not upstream; every one must be named by some
    // entry. This is self-maintaining in both directions, which is the whole
    // point: delete an entry and its identifier becomes unexplained -- red, by
    // name. Upstream the work and the identifier stops being lite-only, so the
    // entry is no longer required and NOTHING needs editing to stay green.
    //
    // The kerotakis lane's literature-band argument, one domain over: pin to
    // something the outside world determines, not to your own computed number,
    // so a correction elsewhere MOVES your answer instead of BREAKING your
    // test. Upstream is the outside world here.
    // TWO STRATEGIES, CHECKED SEPARATELY. My first version returned one merged
    // Set and asserted its total size -- and that guard did not fire when I
    // broke the method-name regex, because the `this.X =` matches alone kept
    // the total well above the floor. HALF A BROKEN EXTRACTOR STILL REPORTED
    // "ALL COVERED". Found by trying to red-prove the guard and watching it
    // stay green, which is the only reason I know.
    //
    // A sum hides a zero. Each strategy must be shown to have reached
    // something on its own, or its half of the corpus is silently empty.
    const declared = src => ({
        methods: new Set([...src.matchAll(/^\s{4}(?:static\s+)?([A-Za-z_]\w*)\s*\(/gm)].map(m => m[1])),
        fields: new Set([...src.matchAll(/this\.([A-Za-z_]\w*)\s*=/g)].map(m => m[1]))
    });
    const upD = declared(up);
    const liteD = declared(lite);

    // CALIBRATE EACH STRATEGY AGAINST THE OTHER COPY OF THE SAME MODULE, not
    // against a fixed floor. My first version required >10 of each on the
    // upstream side, which is right for a class and WRONG for the debug
    // targets: z80-debug.js is a factory returning an object literal, so it has
    // no `this.X =` at all and zero is the correct answer, not a broken regex.
    // A fixed floor there is a false red, and a false red on a corpus proof is
    // how a corpus proof gets deleted.
    //
    // The two files are the same module, so the invariant that actually holds
    // is BETWEEN them: if one side yields plenty and the other yields nothing,
    // the extractor has stopped matching on that side. If both yield nothing,
    // the module genuinely has none of that construct. Same principle as the
    // rest of this file -- an invariant between two things, never a property
    // of each.
    for (const which of ['methods', 'fields']) {
        const a = liteD[which].size, b = upD[which].size;
        assert.ok(!(a > 10 && b === 0) && !(b > 10 && a === 0),
            `the ${which} extractor found ${a} in the vendored copy of ${file} and ${b} ` +
            'upstream. One side yielding plenty while the other yields nothing means it ' +
            'has stopped matching there -- and an empty half yields an empty lite-only ' +
            'list, which reads as "all covered". Refusing to conclude coverage from it.');
    }
    assert.ok(liteD.methods.size + liteD.fields.size > 0,
        `no declarations of any kind found in the vendored copy of ${file}`);
    const upDecl = new Set([...upD.methods, ...upD.fields]);
    const liteOnlyIds = [...new Set([...liteD.methods, ...liteD.fields])]
        .filter(x => !upDecl.has(x)).sort();

    const described = cfg.liteOnly.map(d => `${d.id} ${d.contains} ${d.why}`).join(' ');
    const unexplained = liteOnlyIds
        .filter(id => !spec.notIdentifiers.includes(id))   // `for (` matches the method regex
        .filter(id => !described.includes(id));
    assert.deepEqual(unexplained, [],
        `\n  ${file}: LITE-ONLY WORK THAT NO ALLOW-LIST ENTRY NAMES: ${unexplained.join(', ')}.\n` +
        '  These are declared here and not upstream, so a sync deletes them, and no\n' +
        '  entry explains what that would cost. Either add an entry (with its\n' +
        '  falsifiable sentence) or, if the work is obsolete, delete it from the file.\n' +
        '  This count is DERIVED, not pinned -- it cannot be fixed by editing a number.\n');

    summary.push(`${file}: ${cfg.liteOnly.length} named, ${liteOnlyIds.length} identifiers`);
    }

    // SAME RETIREMENT, SAME REPAIR. This asserted `summary.length > 0` — which
    // was the species-1 defence while the allow-list had entries, and became a
    // permanent red when it reached zero. The tier's subject is "for each
    // DECLARED lite-only divergence, has upstream converged on it?", and with
    // nothing declared there is genuinely nothing to ask.
    //
    // But "nothing to ask" must not be reported as "asked and found nothing".
    // With an empty list the claim is discharged by BYTE IDENTITY instead: a
    // file identical to upstream cannot contain unexplained lite-only work, and
    // that is a stronger statement than this tier ever made. So assert it, over
    // a corpus that must be large, rather than passing on an empty loop.
    if (summary.length === 0) {
        const {identical, diverged, undeclared, liteOnly} = classify(spec, srcDir);
        assert.ok(identical.length > 50,
            `the allow-list is empty and only ${identical.length} vendored file(s) are `
            + 'byte-identical to upstream. With nothing declared, identity is the ONLY thing '
            + 'discharging this tier, and a corpus this small means the comparison is broken '
            + 'rather than the tree clean.');
        assert.deepEqual([...diverged, ...undeclared, ...liteOnly], [],
            '\n  THE ALLOW-LIST IS EMPTY BUT THE TREE IS NOT A MIRROR.\n' +
            `  declared-divergent: ${diverged.join(', ') || 'none'}\n` +
            `  undeclared:         ${undeclared.join(', ') || 'none'}\n` +
            `  no upstream file:   ${liteOnly.join(', ') || 'none'}\n\n` +
            '  Every vendored file must equal upstream at the pin, because nothing is\n' +
            '  declared to excuse any of them. Send the divergence upstream and take it\n' +
            '  back down; do not re-open the ledger to make this green.\n');
        t.diagnostic(`allow-list empty: discharged by identity over ${identical.length} file(s) at the pin`);
        return;
    }
    // One diagnostic per file: node's TAP writer escapes newlines inside a
    // single diagnostic, so a multi-line summary renders as one long line of
    // literal \n. Six short lines beat one unreadable one.
    t.diagnostic(`cross-tree invariant verified against ${srcDir}, ${summary.length} file(s):`);
    for (const line of summary) t.diagnostic(`  ${line}`);
});

test('every sync rewrite the identity gate forgives is one the trees still need', t => {
    // A FORGIVENESS THAT NO LONGER CORRESPONDS TO ANYTHING IS THE FIRST SPECIES
    // IN A NEW COSTUME. readUpstream lets a vendored file differ from upstream on
    // a line the sync rewrote. Each entry is therefore a small, permanent hole in
    // byte-identity, and the reason it is safe is that the sync REALLY DOES make
    // that change to that text. If upstream stops shipping the pattern -- the
    // import is deleted, the package fixes its exports map, the file goes away --
    // the entry stops describing anything and quietly widens what the gate
    // accepts, forever, for a reason that expired.
    //
    // So each pair must be EXERCISED: some upstream file has to contain the text
    // it rewrites FROM, and the vendored tree the text it rewrites TO. Neither
    // half alone is enough -- a `from` nobody vendors is dead, and a `to` with no
    // upstream source is lite-authored work wearing a rewrite's clothes.
    const {dir: srcDir, pinned, head, pin, candidates} = pinnedSrcDir('BW_BOARD_DIR', 'bw-board');
    if (!srcDir) {
        t.diagnostic(`SKIPPED, NOT PASSED: upstream not found. Looked in: ${candidates.join(', ')}.`);
        t.skip('upstream tree not on disk -- the rewrite table is NOT verified against it');
        return;
    }
    if (!pinned) {
        // This reads srcDir's WORKING TREE too (does upstream still contain the
        // rewrite source text), so an off-pin checkout could call a live rule
        // dead. SPEAK, not JUDGE -- same ruling as the two tests above.
        t.skip(process.env.BW_BOARD_DIR && head
            ? `BW_BOARD_DIR is at ${head.slice(0, 9)} but vendor-pins.json pins bw-board at ${pin?.slice(0, 9)} -- ` +
                'the rewrite table is only meaningful against the tree at the pin; check it out at the pin (CI does)'
            : 'a sibling bw-board checkout was found but its COMMIT is unknown -- set BW_BOARD_DIR to a ' +
                'checkout at the sha in vendor-pins.json to verify the rewrite table (CI does)');
        return;
    }
    const spec = readAllowList();
    const vendorRoot = path.join(ROOT, spec.vendoredRoots[0]);
    const vendored = walkFiles(vendorRoot);

    const dead = [];
    for (const [from, to] of rewritePairs(spec.vendoredRoots[0],
        {repoRoot: ROOT, mirrors: spec.vendoredRoots.slice(1)})) {
        const upstreamHas = vendored.some(f => {
            const u = path.join(srcDir, f);
            return fs.existsSync(u) && fs.readFileSync(u, 'utf8').includes(from);
        });
        const vendoredHas = vendored.some(f =>
            fs.readFileSync(path.join(vendorRoot, f), 'utf8').includes(to));
        if (!upstreamHas || !vendoredHas) {
            dead.push(`${from}\n      -> ${to}\n      upstream has the source text: ${upstreamHas}; ` +
                `the vendored tree has the rewritten text: ${vendoredHas}`);
        }
    }
    assert.deepEqual(dead, [],
        '\n  A SYNC REWRITE NO LONGER DESCRIBES THESE TREES:\n\n    ' + dead.join('\n\n    ') +
        '\n\n  Each entry in scripts/lib/vendor-rewrites.mjs is a permanent exemption from\n' +
        '  byte-identity, safe only while the sync really makes that change to that text.\n' +
        '  One that matches nothing widens what this gate accepts for an expired reason.\n' +
        '  Remove it, or say in the module why the trees stopped showing it.\n');
    t.diagnostic(`${rewritePairs(spec.vendoredRoots[0], {repoRoot: ROOT, mirrors: spec.vendoredRoots.slice(1)}).length} sync rewrite(s), all exercised by both trees`);
});
