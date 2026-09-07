/**
 * Every fetch that decides what ships names an IMMUTABLE object.
 *
 * THE DEFECT, IN ONE SENTENCE
 * ---------------------------
 * A fetch by mutable name quotes a freshness it does not have.
 *
 * It is not hypothetical here. On 2026-08-23 `sync-bw-board.mjs` fetched
 * `<repo>/master/<file>` from the raw CDN, the CDN served a cached copy of the
 * PREVIOUS commit, the run printed "synced from bw-board@master", and
 * vendor-pins.json was never touched. Every word of that was well-formed. The
 * content was wrong and nothing in the tree recorded which commit had actually
 * arrived. The same shape, four more times, is what this branch closed:
 * `SB3CREATOR_REF='main'` in two sync scripts, a clone with no ref at all, a
 * SEVEN-CHARACTER sha treated as a pin, and 48 `uses:` on publisher-movable
 * tags.
 *
 * WHY THIS IS A CENSUS AND NOT A PATTERN MATCHER
 * ----------------------------------------------
 * A pattern matcher answers "is anything I thought of wrong?". The failure
 * this repo keeps meeting is the fetch site nobody thought of — so the gate
 * asserts the SET of fetch sites equals a declared table, and a site that is
 * new, moved, or reworded is red until somebody writes down which class it is
 * in. Declaring a site is cheap; the point is that it cannot happen silently.
 *
 * THE INSTRUMENT IS CHECKED BEFORE THE SUBJECT
 * ---------------------------------------------
 * Three ways this gate could report a clean sweep over nothing, each closed by
 * a test below:
 *
 *   - the detectors stop matching (a regex edit, a rename): `the detectors
 *     still fire` runs them over a synthetic offender built here in the file.
 *   - the scan walks no files: asserted non-empty, with a floor.
 *   - THE SCAN WALKS THIS FILE. This is not a hypothetical either — the best
 *     finding of the provenance campaign was a gate that walked a tree
 *     containing the prover, so every string-literal target matched itself and
 *     the gate could never fail. This file necessarily contains examples of
 *     exactly what it forbids. It is excluded BY EXACT PATH, that exclusion is
 *     a single named constant, and a test asserts the exclusion list is that
 *     one path and nothing else — so widening it to hide a real offender is a
 *     visible diff and not a quiet one.
 *
 * SCOPE, STATED BECAUSE IT IS NARROWER THAN "every fetch in lite"
 * ---------------------------------------------------------------
 *   - VENDORED trees are excluded (packages/, the vendored lib/ subtrees, the
 *     examples gallery). Their provenance is vendor-pins.json's job; scanning
 *     them would make every vendor bump churn this table for content lite does
 *     not author.
 *   - `.md` is excluded. A clone command in a document is an instruction to a
 *     human, not a fetch the build performs. Those instances are listed in
 *     docs/FETCH-PINNING.md instead of gated here.
 *   - COMMENT LINES are stripped before matching. A URL inside a comment is
 *     prose about a fetch, not a fetch — and without this, the explanation of
 *     a defect trips the gate that forbids it.
 *   - It gates NAMES, not delivery. `sha256`-verified content (the emu8051
 *     WASM) is strictly stronger and is noted where it applies; nothing here
 *     asserts a server sent what it promised.
 */
import {test, describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {resolveRef, recordPin, FULL_SHA as LIB_FULL_SHA} from '../scripts/lib-pin.mjs';

const ROOT = path.join(import.meta.dirname, '..');

// THE self-exclusion. One path, named once, asserted below to be the whole of
// the exclusion. See the header.
const THIS_GATE = 'test/fetch-pinning.test.mjs';

const VENDORED = [
    /^packages\//,
    /^node_modules\//,
    /^overlay\/scratch-gui\/src\/lib\/(bw-board|bw-circuit-ui|emu8051|libraries|parts-data)\//,
    /^overlay\/scratch-gui\/src\/lib\/sb3-creator/,
    /^overlay\/scratch-gui\/(examples|static\/microbit-sim)\//,
    /(^|\/)package-lock\.json$/,
    /(^|\/)Cargo\.lock$/
];

const FULL_SHA = /^[0-9a-f]{40}$/;

// A fetch site is a place that resolves an external NAME to CONTENT. These are
// the shapes lite has; a new shape is a reason to add a detector, and adding
// one shows up as new census rows rather than as silence.
const DETECTORS = [
    ['raw', /raw\.githubusercontent\.com\/[^\s'"`)\\]+/g],
    ['codeload', /codeload\.github\.com\/[^\s'"`)\\]+/g],
    ['release', /github\.com\/[^\s'"`)\\]+\/releases\/download\/[^\s'"`)\\]+/g],
    ['archive', /github\.com\/[^\s'"`)\\]+\/archive\/[^\s'"`)\\]+/g],
    // Firmware is not on a GitHub CDN. The Pico ▶ Run path (N3c) fetches the
    // MicroPython UF2 from micropython.org, so the GitHub-only detectors above
    // would sweep clean over it — the exact "fetch site nobody thought of" this
    // census exists to catch. Detected here so it must be classed, not silent.
    ['micropython', /micropython\.org\/[^\s'"`)\\]+/g],
    // The ARM GNU toolchain (N11a) is fetched from developer.arm.com, not a
    // GitHub CDN, so — like the micropython.org row above — the GitHub detectors
    // would sweep clean over a 171 MB download. Detected here so it must be
    // classed, not silent.
    ['arm', /developer\.arm\.com\/[^\s'"`)\\]+/g],
    ['git', /git\s+(?:clone|ls-remote)\s[^\n]*/g],
    // `uses:` is a GitHub Actions keyword, so it is matched ONLY in workflow
    // files and only at the head of a step. An unanchored `/uses:/` reads
    // `refuses: ${…}` in a script and `'…board uses:'` in a component as
    // action references — three false offenders out of a first run, which is
    // its own small lesson about detectors that match on a suffix.
    ['uses', /^[ \t]*-?[ \t]*uses:[ \t]*(\S+)/gm, /^\.github\/workflows\/.*\.ya?ml$/]
];

/**
 * Drop comment LINES only — never mid-line, which would eat `https://`.
 */
const stripComments = (text, file) => {
    const ext = path.extname(file);
    const isCode = ['.mjs', '.js', '.jsx', '.cjs', '.ts', '.rs'].includes(ext);
    const isHash = ['.yml', '.yaml', '.sh', '.toml'].includes(ext);
    if (!isCode && !isHash) return text;
    return text.split('\n').map((line) => {
        const t = line.trim();
        if (isHash && t.startsWith('#')) return '';
        if (isCode && (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))) return '';
        return line;
    }).join('\n');
};

const scanFiles = () => execSync('git ls-files', {cwd: ROOT, maxBuffer: 1 << 28})
    .toString().split('\n').filter(Boolean)
    .filter((f) => f !== THIS_GATE)
    .filter((f) => path.extname(f) !== '.md')
    .filter((f) => !VENDORED.some((r) => r.test(f)));

/**
 * Extensions whose contents this walk is MEANT to scan. Used only to decide
 * which skips are worth reporting -- the walk itself still reads everything,
 * because a fetch site could appear in a file type nobody anticipated.
 */
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json',
    '.yml', '.yaml', '.sh', '.css', '.html', '.svg']);

/**
 * [{file, kind, text}] over the scanned tree, comments stripped.
 *
 * REPORTS WHAT IT SKIPPED, because a scanner's silence is not evidence. Two
 * guards below drop files: one for anything unreadable, one for anything
 * holding a NUL. Until 2026-09-07 both were bare `continue`s, and that is not
 * a small thing: test/pin-move-chain.test.mjs has the same NUL guard and it
 * silently skipped test/fetch-pinning.test.mjs -- THIS FILE -- for as long as
 * this file held a NUL, hiding a stale pin sha inside a file that gate exists
 * to scan. It reported clean the whole time. A file the tooling calls binary
 * is a file your gates do not read, and nothing in the run says so.
 *
 * SURPRISING SKIPS ONLY. The naive remedy -- name every skipped file -- prints
 * about ninety PNG and .bin names here on every run, because `scanFiles`
 * filters .md and the vendored trees but not by extension. A count over the
 * wrong set is a different question, not a smaller answer. So: name the
 * skipped files this walk was MEANT to read, and count the rest.
 *
 * FOR THIS WALK THAT NAMED SET IS CURRENTLY EMPTY, and the reason is worth
 * recording rather than discovering later: the three NUL-bearing source files
 * in this repo all live under `overlay/scratch-gui/src/lib/bw-board/` and
 * `.../bw-circuit-ui/`, which VENDORED already excludes before the NUL guard
 * is reached. So this walk skips 93 binaries and no source. If a NUL ever
 * appears in a file this walk was meant to read, the line names it.
 */
const scanHits = (files, onSkip) => {
    const hits = [];
    const skipped = {unreadable: [], nul: []};
    for (const f of files) {
        let text;
        try { text = readFileSync(path.join(ROOT, f), 'utf8'); }
        catch { skipped.unreadable.push(f); continue; }
        if (text.indexOf('\0') !== -1) { skipped.nul.push(f); continue; }
        const body = stripComments(text, f);
        for (const [kind, re, only] of DETECTORS) {
            if (only && !only.test(f)) continue;
            for (const m of body.matchAll(re)) {
                hits.push({file: f, kind, text: (m[1] ?? m[0]).trim().replace(/\s+/g, ' ')});
            }
        }
    }
    if (onSkip) onSkip(skipped);
    return hits;
};

/** One line per skip class, naming only the files the walk meant to read. */
const describeSkips = ({unreadable, nul}) => {
    const lines = [];
    for (const [what, list] of [['unreadable', unreadable], ['holding a NUL', nul]]) {
        if (!list.length) continue;
        const surprising = list.filter((f) => TEXT_EXT.has(path.extname(f)));
        const rest = list.length - surprising.length;
        lines.push(surprising.length
            ? `skipped ${surprising.length} source file(s) ${what}: ${surprising.join(', ')}`
              + (rest ? ` (and ${rest} non-source file(s))` : '')
            : `skipped ${rest} non-source file(s) ${what}`);
    }
    return lines;
};

// ─── the declared census ──────────────────────────────────────────────────────
//
// Every non-`uses:` fetch site in the tree, with the class that makes it
// immutable — or, for the two that are not, the reason stated instead of
// hidden. `uses:` is not enumerated row-by-row: there are 48 of them and one
// blanket rule ("40-hex, no exceptions") is stronger than 48 rows.
//
// CLASSES
//   sha-const     the ref is a constant in the SAME file, asserted 40-hex below
//   resolved-var  the ref is an interpolation of a variable this file resolved
//                 through the commits API before fetching anything (lib-pin.mjs)
//   shell-pin     the ref is a shell variable read from vendor-pins.json, and
//                 the step itself refuses a value that is not 40-hex
//   resolver      not a content fetch: it reads a NAME to PRODUCE a sha. This
//                 is the fix, not the defect.
//   content-hash  the NAME is mutable (a release tag) but the CONTENT is
//                 sha256-verified against a constant in the same file BEFORE
//                 anything is written. Strictly stronger than sha-addressing,
//                 which authenticates a name and then trusts whatever bytes
//                 arrive: a moved tag, a replaced asset and a compromised CDN
//                 all fail closed here. Not `waived` — nothing is being
//                 excused — and not `sha-const`, because the URL carries a tag.
//   waived        genuinely cannot be sha-addressed; reason required
const CENSUS = [
    {
        file: 'overlay/scratch-gui/src/lib/smallerc-wasm/build.sh',
        kind: 'git',
        text: 'git clone --quiet "$SMALLERC_REPO" "$SRC"',
        class: 'sha-const',
        pin: 'SMALLERC_COMMIT',
        why: 'the clone is immediately checked out to SMALLERC_COMMIT and the script refuses '
           + 'to build unless HEAD equals that full commit SHA.'
    },
    {
        file: '.github/workflows/build.yml',
        kind: 'raw',
        text: 'raw.githubusercontent.com/$repo/$pin/$remote',
        class: 'shell-pin',
        why: 'the overlay-vs-pin guard. $pin comes from vendor-pins.json and the '
           + 'step exits 1 if it is not 40 hex characters. This line used to name '
           + '`master` with a `main` fallback, which made it warn whenever upstream '
           + 'moved and stay silent when the CDN served a stale copy.'
    },
    {
        file: '.github/workflows/build.yml',
        kind: 'git',
        text: 'git clone --filter=blob:none --no-checkout \\',
        class: 'shell-pin',
        why: 'CONTENT, and sha-addressed. The four pin-reader tests -- bw-board-census, '
           + 'vendor-identity and both i8086-bios provenance gates -- read FILES from this '
           + 'tree, so unlike the emu8051 row below it is not an ancestry question. It is '
           + 'pinned the same way the raw-CDN row above is: $PIN comes from vendor-pins.json '
           + 'and the step exits 1 unless it is 40 hex characters. It then checks out that '
           + 'exact sha and RE-READS HEAD, refusing if the tree did not land on it -- a '
           + 'checkout that silently went elsewhere would make all four readers assert '
           + 'against the wrong content and still look green, which is the failure the step '
           + 'exists to end. Added 2026-09-07 with the step itself; before it, those four '
           + 'gates had never run in CI at all and a stale inventory shipped behind their '
           + 'named skips.'
    },
    {
        file: '.github/workflows/build.yml',
        kind: 'git',
        text: 'git clone --bare --filter=blob:none https://github.com/CrispStrobe/emu8051-stc.git /tmp/emu8051-stc.git 2>/dev/null',
        class: 'waived',
        why: 'ANCESTRY, not content. The step asks whether the WASM PIN is a '
           + 'descendant of the crash-fix floor; both endpoints are 40-hex shas '
           + 'and the clone exists only to hold the graph that relates them. '
           + 'There is no ref here to pin — the commits are the argument.'
    },
    {
        file: '.github/workflows/build.yml',
        kind: 'git',
        text: 'git clone --quiet --bare --filter=blob:none "https://github.com/CrispStrobe/$repo.git" "$RUNNER_TEMP/vendor-history/$repo.git"',
        class: 'waived',
        why: 'GRAPH, not content — the same class as the emu8051-stc clone above. '
           + 'test/pin-move-chain.test.mjs (plan T9) asks whether a 40-hex string in '
           + 'the tree is a commit of bw-board, sb3-creator or bw-circuit-ui other '
           + 'than the current pin; the three bare blobless clones exist only to '
           + 'hold the commit graphs that answer it. Nothing fetched here is written '
           + 'into the tree or the build: a stale clone can only make the gate know '
           + 'LESS (a brand-new upstream commit not yet seen), never change what '
           + 'ships. There is no ref to pin — the whole history is the argument.'
    },
    {
        file: 'overlay/scratch-gui/src/lib/offline-assets.js',
        kind: 'release',
        text: 'github.com/CrispStrobe/brickwright-lite/releases/download/library-pack-v1/brickwright-library.zip',
        class: 'waived',
        why: 'OPEN, and listed rather than fixed. A release TAG is movable and a '
           + 'release ASSET can be deleted and re-uploaded under the same name, so '
           + 'this ~40 MB zip is fetched by mutable name and extracted onto the '
           + "user's device with no integrity check (downloads.rs::download_pack_zip "
           + 'hashes nothing). The asset GitHub currently serves is sha256 '
           + 'ca484cfe2161be602b54947217ecc855b7304667fdec833b58b0747314bba436, '
           + '42,054,931 bytes, uploaded 2026-07-08. The fix is to thread that '
           + 'digest through `download_pack_zip` and verify before extracting; it '
           + 'is a Rust change this branch could not build and therefore did not '
           + 'make. See docs/FETCH-PINNING.md section 4.'
    },
    {
        file: 'scripts/sync-bw-board.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${remoteSha}',
        class: 'resolved-var',
        why: 'remoteSha comes from resolveRef() before the first content read.'
    },
    {
        file: 'scripts/sync-flasher.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${sha}/${REL}',
        class: 'resolved-var',
        why: 'sha comes from resolveRef() before the content read; flash.js from stc-compiler.'
    },
    {
        file: 'scripts/sync-gallery-pins.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${commit}/build-snippets/${name}.js',
        class: 'resolved-var',
        why: 'commit comes from resolveRef() before any extension or builder-snippet content is read. '
           + 'The snippets are used to verify the exact generated suffix served by the gallery.'
    },
    {
        file: 'scripts/sync-gallery-pins.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${commit}/${repoPath(slug',
        class: 'resolved-var',
        why: 'commit comes from resolveRef() before the 120-extension content sweep. The resulting '
           + 'served-byte hashes are recorded for runtime verification before evaluation.'
    },
    {
        file: 'scripts/sync-examples.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${remoteSha}',
        class: 'resolved-var',
        why: 'remoteSha comes from resolveRef() before the first content read. '
           + 'This one matters most: the run fetches ~1500 files over many '
           + 'minutes, so a branch-addressed sweep could straddle a push and '
           + 'vendor two different commits into one tree.'
    },
    {
        file: 'scripts/sync-sb3creator.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/${REPO}/${remoteSha}',
        class: 'resolved-var',
        why: 'remoteSha comes from resolveRef() before the first content read.'
    },
    {
        file: 'scripts/sync-emu8051-wasm.mjs',
        kind: 'raw',
        text: 'raw.githubusercontent.com/CrispStrobe/emu8051-stc/${ref}/build/${name}',
        class: 'resolved-var',
        why: 'ref is resolveRef(PIN or --ref). Stronger than sha-addressing on top: '
           + 'EXPECT holds the sha256 of each file and the script refuses to write '
           + 'a binary that does not match.'
    },
    {
        file: 'scripts/sync-labwired-wasm.mjs',
        kind: 'release',
        text: 'github.com/${REPO}/releases/download/${TAG}/${name}',
        class: 'content-hash',
        why: 'The 20 MB labwired-wasm engine, published once as a release asset on bw-board '
           + 'because it is 200x emu8051\'s committed 92 KB and lite has just dropped '
           + '70k tracked files. The tag is movable, so the tag is not what is trusted: '
           + 'EXPECT in that file holds a sha256 per asset and nothing is written unless it '
           + 'matches. PIN records the SOURCE commit the artifact was built from, so the '
           + 'bytes can be re-derived with bw-board\'s scripts/build-labwired-wasm.mjs. It '
           + 'is deliberately NOT in REMOTE_SYNCS below: resolveRef exists to stop a raw-CDN '
           + 'BRANCH url serving a stale commit, and there is no branch here to resolve.'
    },
    {
        file: 'scripts/vendor-forward.mjs',
        kind: 'git',
        text: 'git ls-remote ${url} HEAD`);',
        class: 'resolver',
        why: 'reads the default branch tip to PRODUCE a 40-hex sha, which is then '
           + 'fetched explicitly and asserted to equal what was resolved. Replaces '
           + '`git clone` with no ref at all.'
    },
    {
        file: 'scripts/vendor.mjs',
        kind: 'codeload',
        text: 'codeload.github.com/scratchfoundation/scratch-gui/tar.gz/${GUI_COMMIT}',
        class: 'sha-const',
        why: 'GUI_COMMIT is a 40-hex literal in this file — the last BSD-3 commit '
           + 'of scratch-gui. Asserted below.'
    },
    {
        file: '.github/workflows/deploy-daily.yml',
        kind: 'git',
        text: "git ls-remote origin refs/heads/main | awk '{print $1}')",
        class: 'resolver',
        why: 'reads main\'s HEAD sha to refuse publishing a tree older than what is live: '
           + 'the sha it PRODUCES is compared against the checkout\'s, no content is fetched. '
           + 'The gate was red on main since f4ba84d62 for want of this row.'
    },
    {
        file: 'test/vercel-deployment-policy.test.mjs',
        kind: 'git',
        text: 'git ls-remote origin refs\\/heads\\/main/,',
        class: 'resolver',
        why: 'not a fetch — this is the test that PINS the deploy-daily.yml resolver above, '
           + 'asserting the publish step resolves main -> sha before deploying. The detector '
           + 'matches the assertion regex\'s text; declared here rather than excluding the file '
           + '(which would blind the scan to any real fetch it later gains), and classed with '
           + 'the site it guards.'
    },
    {
        file: 'scripts/probe-pico-micropython.mjs',
        kind: 'micropython',
        text: 'micropython.org/resources/firmware/RPI_PICO-20240222-v1.22.2.uf2',
        class: 'content-hash',
        why: 'The MicroPython v1.22.2 RPI_PICO UF2 the Pico ▶ Run path (N3c) boots. MIT, but a '
           + '650 KB binary in git to serve one target is a bad trade, so it is fetched by exact '
           + 'versioned URL and NEVER committed (it lands in gitignored artifacts/). The URL path '
           + 'names a version+date, effectively immutable by micropython.org convention — but the '
           + 'sha256 pin, NOT the URL, is what decides what ships: ensureFirmware() verifies every '
           + 'byte against FIRMWARE.sha256 in that same file BEFORE writing the cache, and '
           + 're-hashes on every read, so a moved, replaced, or corrupted artefact fails closed. '
           + 'Same discipline as sync-labwired-wasm and sync-emu8051-wasm. Deliberately NOT in '
           + 'REMOTE_SYNCS below: resolveRef resolves a git BRANCH to a sha, and there is no '
           + 'branch here — the version literal IS the immutable name.'
    },
    {
        file: 'scripts/probe-pico-kaluma.mjs',
        kind: 'release',
        text: 'github.com/kaluma-project/kaluma/releases/download/1.2.1/kaluma-rp2-pico-1.2.1.uf2',
        class: 'content-hash',
        why: 'The Kaluma 1.2.1 RP2040 UF2 the N5 investigation boots to answer whether JavaScript '
           + 'runs on the emulated Pico (docs/PICO-KALUMA-BOOT.md). Apache-2.0, but a ~1 MB binary '
           + 'in git to serve one diagnostic is a bad trade, so it is fetched by exact release URL '
           + 'and NEVER committed (it lands in gitignored artifacts/). Unlike the micropython.org '
           + 'row this IS on a GitHub CDN, so the release detector sees it — and a release TAG is '
           + 'movable and an asset can be re-uploaded under the same name, so the URL is not what '
           + 'decides: the sha256 is. ensureFirmware() verifies every byte against FIRMWARE.sha256 '
           + 'in this same file BEFORE writing the cache, and re-hashes on every read, so a moved '
           + 'tag, replaced asset or compromised CDN fails closed. Same discipline as the '
           + 'probe-pico-micropython row and sync-labwired-wasm. Deliberately NOT in REMOTE_SYNCS '
           + 'below: resolveRef resolves a git BRANCH to a sha and there is no branch here — the '
           + 'version tag IS the name, and the hash is the gate.'
    },
    {
        file: 'scripts/sync-arm-toolchain.mjs',
        kind: 'arm',
        text: 'developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-x86_64-arm-none-eabi.tar.xz',
        class: 'content-hash',
        why: 'The ARM GNU embedded toolchain (arm-none-eabi-gcc 13.2.rel1) that compiles generateC\'s '
           + 'Pico output for the EXECUTED C side of the P3 differential (plan N11a). 171 MB, so it is '
           + 'fetched by exact versioned URL and NEVER committed (it lands in gitignored artifacts/). '
           + 'ARM\'s /downloads/gnu/13.2.rel1/ path names a version, effectively immutable by ARM\'s '
           + 'convention — but the sha256, NOT the URL, is what decides: ensureArmToolchain() verifies '
           + 'the download byte-for-byte against ARM_TOOLCHAIN.sha256 BEFORE it extracts, and refuses to '
           + 'unpack on a mismatch, so a moved or replaced artefact fails closed. The pinned version '
           + 'matches the box\'s own arm-none-eabi-gcc, and after extraction the toolchain\'s --version is '
           + 'asserted to contain the pinned string. Same discipline as the probe-pico-micropython UF2 '
           + 'and sync-labwired-wasm. Deliberately NOT in REMOTE_SYNCS below: there is no git branch to '
           + 'resolve — the version literal IS the immutable name, the hash is the gate. Only CI fetches '
           + 'it; locally the box gcc is used and the executed-C leg skips by name when neither is present.'
    }
];

// Constants that must be full shas, and where they live. An abbreviation here
// is the defect that cost seven blind CI commits: `git` will resolve a short
// sha inside one repo at one moment and nothing else will.
const SHA_CONSTANTS = [
    ['scripts/vendor.mjs', /const GUI_COMMIT = '([0-9a-zA-Z]+)'/],
    ['scripts/sync-emu8051-wasm.mjs', /const PIN = '([0-9a-zA-Z]+)'/],
    ['scripts/sync-labwired-wasm.mjs', /const PIN = '([0-9a-zA-Z]+)'/],
    ['.github/workflows/build.yml', /^\s*FLOOR=(\S+)/m]
];

const key = (h) => `${h.file} ${h.kind} ${h.text}`;
const show = (h) => `${h.file}  [${h.kind}]  ${h.text}`;

describe('fetch pinning: every fetch that decides what ships names an immutable object', () => {
    const files = scanFiles();
    let skipNotes = [];
    const hits = scanHits(files, (s) => { skipNotes = describeSkips(s); });

    test('the walk says what it did not scan', (t) => {
        // A scanner that reports only what it FOUND is a scanner whose silence
        // you cannot read. These notes make the skipped set visible on every
        // run, so nobody has to discover it the way it was discovered here --
        // by a NUL byte hiding a stale pin from pin-move-chain's identical
        // guard, in this very file, while both gates reported clean.
        //
        // NOT AN ASSERTION ON THE COUNT. Binaries are legitimately skipped and
        // their number changes with every icon anyone adds; pinning it would be
        // a gate that fails for being right. What is asserted is that the walk
        // ANSWERS the question at all.
        for (const line of skipNotes) t.diagnostic(line);
        assert.ok(Array.isArray(skipNotes),
            'the walk no longer reports its skips -- the instrument went quiet');
        // `/source file/` also matches "non-source file(s)" -- a predicate that
        // matched more than it meant, in the commit adding a report about
        // predicates that skip more than they say. Anchored on the count now.
        const sourceSkips = skipNotes.filter((l) => /skipped \d+ source file/.test(l));
        for (const l of sourceSkips) t.diagnostic(`OPEN DEFECT: ${l}`);
    });

    test('the detectors still fire (instrument before subject)', () => {
        // If a regex is edited into uselessness, every assertion below reports a
        // clean sweep over an empty list. This runs the SAME detectors over a
        // synthetic offender assembled here, so their liveness does not depend
        // on the tree containing an offender — which, after this branch, it
        // does not. The strings are split so this file is not itself an
        // offender under its own patterns.
        const H = 'https://';
        const offender = [
            `const R = "${H}raw.` + 'githubusercontent.com/o/r/main/f.js";',
            `curl ${H}codeload.` + 'github.com/o/r/tar.gz/main',
            `${H}git` + 'hub.com/o/r/releases/download/v1/a.zip',
            `${H}git` + 'hub.com/o/r/archive/main.tar.gz',
            `git clone ${H}git` + 'hub.com/o/r /tmp/r',
            `${H}micropython.` + 'org/resources/firmware/RPI_PICO.uf2',
            `${H}developer.` + 'arm.com/-/media/Files/downloads/gnu/x/binrel/arm-gnu-toolchain.tar.xz',
            'uses: actions/checkout@' + 'v4'
        ].join('\n');
        const fired = new Set();
        for (const [kind, re] of DETECTORS) {
            if (new RegExp(re.source, re.flags).test(offender)) fired.add(kind);
        }
        assert.deepEqual([...fired].sort(), DETECTORS.map(([k]) => k).sort(),
            'a detector matched nothing in a string built to contain one of each. '
            + 'Every result below is therefore meaningless. Fix the pattern first.');
    });

    test('comment stripping removes prose about fetches and nothing else', () => {
        // The other half of the instrument. If stripComments over-reaches, real
        // fetch sites vanish from the census and it goes quietly green.
        const SHA40 = '0123456789012345678901234567890123456789';
        const js = [
            '// git clone https://x/y',
            ' * https://raw.githubusercontent.com/a/b/main/c',
            `const u = "https://raw.githubusercontent.com/a/b/${SHA40}/c";`
        ].join('\n');
        const out = stripComments(js, 'x.mjs');
        assert.equal(out.split('\n').filter((l) => l.trim()).length, 1,
            'stripComments kept or dropped the wrong number of lines');
        assert.ok(out.includes(SHA40),
            'stripComments ate a real fetch site, not a comment');
        const yml = [
            '# uses: actions/checkout@v4',
            `      - uses: actions/checkout@${SHA40}`
        ].join('\n');
        assert.ok(!stripComments(yml, 'x.yml').includes('@v4'),
            'a yaml comment survived stripping');
        assert.ok(stripComments(yml, 'x.yml').includes(`checkout@${SHA40}`),
            'a real yaml step was stripped as if it were a comment');
    });

    test('the scan walks a real tree, and excludes exactly one file: itself', () => {
        assert.ok(files.length >= 400,
            `the scan found only ${files.length} files. Every comparison below is over `
            + 'a set that may be empty for a reason having nothing to do with pinning.');
        assert.ok(!files.includes(THIS_GATE),
            'this gate is scanning ITSELF. It necessarily contains examples of what it '
            + 'forbids, so it would either fail forever or (worse) be silenced by an '
            + 'exclusion broad enough to hide real offenders.');
        // The exclusion is ONE path. Widening it must be a visible diff, not a
        // quiet edit to a pattern.
        const all = execSync('git ls-files', {cwd: ROOT, maxBuffer: 1 << 28})
            .toString().split('\n').filter(Boolean);
        // An UNTRACKED gate is excluded from the walk for the wrong reason: not
        // because the exclusion works, but because git never mentioned it. The
        // assertion below would then compare two empty lists and pass over a
        // gate that is not in the tree it claims to guard.
        assert.ok(all.includes(THIS_GATE),
            `${THIS_GATE} is not tracked by git. Commit it: an untracked gate is not part of `
            + 'the repository it gates, and the self-exclusion check below is vacuous without it.');
        const kept = new Set(files);
        const droppedForSelf = all.filter((f) => !kept.has(f))
            .filter((f) => path.extname(f) !== '.md' && !VENDORED.some((r) => r.test(f)));
        assert.deepEqual(droppedForSelf, [THIS_GATE],
            'the self-exclusion is meant to be exactly one path. These non-vendored, '
            + 'non-markdown files are also being skipped:\n  ' + droppedForSelf.join('\n  '));
    });

    test('every `uses:` in every workflow names a 40-hex action sha, not a movable tag', () => {
        // `@v4` is a tag its publisher REPOINTS. Two green runs can have executed
        // different code with nothing in this repo recording which — and the
        // green line reads the same either way. It is also the supply-chain hole
        // GitHub's own hardening guide names: whoever can move `v4` runs code in
        // jobs that hold this repo's `pages: write`, `id-token: write` and the
        // App Store signing secrets.
        const uses = hits.filter((h) => h.kind === 'uses').map((h) => h.text);
        assert.ok(uses.length >= 48,
            `only ${uses.length} \`uses:\` lines found across the workflows, expected at least 48 — `
            + 'the scan stopped matching and the assertion below would report a clean sweep over nothing.');
        const unpinned = uses.filter((u) => !/@[0-9a-f]{40}$/.test(u));
        assert.deepEqual(unpinned, [],
            'these workflow steps use a MOVABLE ref:\n  ' + unpinned.join('\n  ')
            + '\nPin the full 40-character commit sha and put the version in a trailing '
            + 'comment:\n  gh api repos/<owner>/<repo>/commits/<tag> --jq .sha');
    });

    test('every content-fetch site is in the declared census, and every census row is in the tree', () => {
        // THE GATE THAT CATCHES A NEW MUTABLE FETCH. Not "does it look wrong" —
        // "is it written down". A site nobody classified is red by construction.
        const found = hits.filter((h) => h.kind !== 'uses');
        const declared = new Map(CENSUS.map((r) => [key(r), r]));
        const foundKeys = new Set(found.map(key));

        const undeclared = found.filter((h) => !declared.has(key(h)));
        assert.deepEqual(undeclared.map(show), [],
            'UNDECLARED FETCH SITE(S). Each of these resolves an external name to content '
            + 'and nothing in the tree says whether that name is immutable. Add a row to '
            + 'CENSUS in this file with its class and, if it is `waived`, the reason it '
            + 'cannot be sha-addressed:\n  ' + undeclared.map(show).join('\n  '));

        const vanished = CENSUS.filter((r) => !foundKeys.has(key(r)));
        assert.deepEqual(vanished.map(show), [],
            'these census rows match nothing in the tree. A row that matches nothing is a '
            + 'claim about a fetch site that is not there — the census is then smaller than '
            + 'it reads, and a detector may have stopped matching a site that IS there. '
            + 'Delete the row, or fix what moved:\n  ' + vanished.map(show).join('\n  '));
    });

    test('every waived row states a reason, and the waived set is the three known ones', () => {
        // A waiver with no reason is an exemption. Naming the set keeps a fourth
        // one from joining quietly. Two of the three are GRAPH-ONLY clones
        // (emu8051-stc ancestry; the T9 pin-move histories) — not holes, and
        // docs/FETCH-PINNING.md section 4 says so; the third is the open one.
        const waived = CENSUS.filter((r) => r.class === 'waived');
        for (const r of waived) {
            assert.ok((r.why || '').length > 80,
                `${r.file}: a waived fetch site needs a stated reason, not a class name.`);
        }
        assert.deepEqual(waived.map((r) => r.file).sort(), [
            '.github/workflows/build.yml',
            '.github/workflows/build.yml',
            'overlay/scratch-gui/src/lib/offline-assets.js'
        ], 'the set of fetch sites that cannot be sha-addressed changed. That is either a '
         + 'new hole or a closed one — say which in docs/FETCH-PINNING.md.');
    });

    test('every pin CONSTANT is a full 40-hex sha, never an abbreviation', () => {
        // An abbreviated sha is not an immutable name. Git's abbreviation is
        // unique within ONE repository at ONE moment, it lengthens as the repo
        // grows, and a consumer that cannot resolve it fails in ways that read
        // as something else entirely. `const PIN = '2f1855a'` was the live
        // instance; `FLOOR=85ed23d` sat next to it in CI.
        for (const [file, re] of SHA_CONSTANTS) {
            const src = readFileSync(path.join(ROOT, file), 'utf8');
            const m = src.match(re);
            assert.ok(m, `${file}: the pin constant this gate watches (${re}) is gone. Either it `
                + 'was renamed — update SHA_CONSTANTS — or the pin it protected was deleted.');
            assert.match(m[1], FULL_SHA,
                `${file} pins "${m[1]}", which is not a 40-hex sha. Resolve it with:\n`
                + `  gh api repos/<owner>/<repo>/commits/${m[1]} --jq .sha`);
        }
    });

    test('vendor-pins.json records full shas for every vendored upstream', () => {
        // The pin is the ANSWER to "what did we take". Half an answer is the
        // same defect one level down.
        const pins = JSON.parse(readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8'));
        const names = Object.keys(pins);
        assert.ok(names.length >= 3,
            `vendor-pins.json names only ${names.length} upstreams; expected at least 3 `
            + '(bw-circuit-ui, bw-board, sb3-creator).');
        const bad = names.filter((n) => !FULL_SHA.test(String(pins[n])));
        assert.deepEqual(bad, [],
            'these pins are not 40-hex shas: ' + bad.map((n) => `${n}=${pins[n]}`).join(', '));
    });

    test('every sync script that can fetch remotely resolves the ref before reading content', () => {
        // The structural claim behind `resolved-var`. Without it, a future edit
        // could reintroduce `const RAW = .../${REF}` and the census row would
        // still match on the variable NAME while meaning nothing.
        const REMOTE_SYNCS = ['sync-bw-board.mjs', 'sync-examples.mjs', 'sync-sb3creator.mjs', 'sync-emu8051-wasm.mjs', 'sync-flasher.mjs'];
        for (const f of REMOTE_SYNCS) {
            const src = readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
            assert.match(src, /resolveRef\s*\(/,
                `scripts/${f} fetches from the raw CDN but never calls resolveRef(). A CDN `
                + 'branch URL is cached and can serve an older commit than the name implies.');
            // The `?? REF` shape: a fallback to the mutable name is the whole
            // defect wearing a different hat.
            assert.doesNotMatch(stripComments(src, f), /\?\?\s*REF\b/,
                `scripts/${f} falls back to the mutable REF when resolution fails. One failed `
                + 'API call and every file is served from a cached branch URL again, silently.');
        }
    });
});

describe('lib-pin: the mechanism the `resolved-var` class depends on', () => {
    // The census classifies four fetch sites as safe BECAUSE resolveRef ran
    // first. That is a claim about this module, so it is tested here rather
    // than assumed by the row that leans on it. Both tests are offline.

    test('a full sha is passed through untouched and costs no request', async () => {
        const sha = '0123456789abcdef0123456789abcdef01234567';
        // If this reached the network it would fail: the repo does not exist.
        const got = await resolveRef('no-such-owner/no-such-repo', sha);
        assert.deepEqual(got, {sha, resolved: false});
    });

    test('recordPin refuses anything that is not a 40-hex sha', async () => {
        // The pin is the ANSWER to "what did we take". A short sha there is the
        // same defect one level down, and it is exactly what the old inline
        // pin-writers would have accepted — they wrote whatever `rev-parse`
        // handed back, with no check at all.
        const dir = mkdtempSync(path.join(tmpdir(), 'pin-test-'));
        const file = path.join(dir, 'vendor-pins.json');
        try {
            writeFileSync(file, '{}\n');
            const quiet = () => {};
            await assert.rejects(
                () => recordPin('bw-board', 'a301937', {pinsFile: file, log: quiet}),
                /not a 40-hex sha/);
            assert.equal(readFileSync(file, 'utf8'), '{}\n',
                'recordPin rejected the value and then wrote it anyway');
            // SYNTHETIC, NOT A REAL SHA. This was 'a301937d99...', which happens
            // to be the bw-board pin lite carried until 49ae080a8 -- so T9's
            // pin-move gate reads it as a stale pin in a file that must carry the
            // current one. A fixture that only needs to be 40 hex characters must
            // not be a value that means something elsewhere.
            const good = 'deadbeef'.repeat(5);
            await recordPin('bw-board', good, {pinsFile: file, log: quiet});
            assert.equal(JSON.parse(readFileSync(file, 'utf8'))['bw-board'], good);
        } finally {
            rmSync(dir, {recursive: true, force: true});
        }
    });

    test('the gate and the library agree on what a sha looks like', () => {
        // Two definitions of the same thing drift. If they ever disagree, the
        // gate could pass a value the writer refuses, or the reverse.
        assert.equal(LIB_FULL_SHA.source, FULL_SHA.source);
    });
});
