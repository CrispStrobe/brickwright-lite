/**
 * THE PIN-MOVE CHAIN ENUMERATES ITSELF (plan T9).
 *
 * A vendor pin bump must regenerate every document that carries the pin —
 * on 2026-09-07 lego-be's bw-board move had to regenerate FOUR (the census
 * snapshot + census-snapshot.js, the matrix doc, the ROM provenance, the 8086
 * capability report) and the fourth was found by CI, not by any checklist.
 * Keeping a checklist is keeping a second list. This test derives the set:
 * no tracked file may carry a full 40-hex sha of a bw-board, sb3-creator or
 * bw-circuit-ui commit other than the CURRENT pins in vendor-pins.json.
 *
 * Two sources of "a sha of theirs", each with its own reach:
 *   1. PREVIOUS PIN VALUES, from `git log -p -- vendor-pins.json` — every sha
 *      the file ever held. Runs wherever the pins file's history is present;
 *      a checkout too shallow to hold it (CI's default depth-1) is refused BY
 *      NAME rather than passed on an empty set (build.yml deepens the history
 *      without blobs before the unit step for exactly this).
 *   2. THE REPOS' WHOLE HISTORY, when a checkout or a bare/blobless clone is
 *      reachable: BW_BOARD_DIR / SB3_CREATOR_DIR / BW_CIRCUIT_UI_DIR (working
 *      checkouts, the convention of bw-board-census and i8086-bios-provenance)
 *      or BW_VENDOR_HISTORY_DIR holding <repo>.git bare clones (what build.yml
 *      makes, ~1 s each without blobs). Unset → that half is SKIPPED by name.
 *
 * Exempt BY ROLE, and why each class is history rather than a reference:
 *   - ledgers (LANES.md and lanes/*, CI-POINTERS.md, HISTORY.md, ROADMAP.md, PLAN.md, BLOCKED.md,
 *     HANDOFF.md): records of what happened; a sha there is dated.
 *   - docs prose (docs/**.md EXCEPT docs/generated/**): narrative cites the
 *     commit it discusses. docs/generated is the opposite — it is one of the
 *     four documents this test exists to keep current.
 *   - comment lines in code (// * # in .js/.mjs/.jsx/.ts/.yml/.sh): notes
 *     beside code, e.g. "pin moved 4134b86 -> ... -> 5d17288" in a test. The
 *     CODE line beside them is not exempt.
 *   - one FIELD by role, and this one is CHECKED, not assumed: the ROM
 *     provenance manifest's `lastTouchedBy.sha` is the bios.asm commit that
 *     last changed the ROM's source. It is exempt here because a different
 *     test owns it — test/i8086-bios-provenance.test.mjs asserts, against real
 *     bw-board history when BW_BOARD_DIR is set, that the manifest's source sha
 *     is an ancestor of the pin and that behindPinBy is the true count. On
 *     main today that field is 7b8d1404, the one non-pin sha outside prose and
 *     ledgers. Every other sha in that manifest must be the pin.
 *   - three exact frozen executable admission constants have source-bound
 *     historical roles, listed in frozen-control-pin-admissions.json. Whole
 *     file bytes/mode/Git blob are independently checked; only the supported
 *     token can keep its shipped previous pin. Other code remains current.
 *     Their old-candidate admission is preserved, never upgraded to a current
 *     qualification by this exception.
 *   - run receipts (docs/receipts/*.json and original model-source READMEs)
 *     are their own role, and it
 *     is NARROWER than a ledger. A receipt is evidence of what was measured
 *     at a named pin (the Doom browser receipt's boardPin is the bw-board pin
 *     it ran against, which a later bump replaced). Rewriting that sha on a
 *     pin bump would falsify the receipt: it would claim a measurement at a
 *     pin nobody measured. So a receipt may carry the current pin OR any
 *     previous pin of a vendored repo. What it may NOT carry is a vendored-
 *     repo commit that was never a pin: that is a receipt citing a source the
 *     lite tree never shipped, and it stays red. The limit, stated: "never a
 *     pin" is only recognisable when the repo-history half runs (the three
 *     *_DIR checkouts or BW_VENDOR_HISTORY_DIR); without it such a sha is an
 *     unknown hex string, invisible here as it is in every other role.
 *   - packages/** is not scanned: packages/scratch-gui/src is a byte-identical
 *     mirror of overlay/ (test/overlay-packages-pairs holds it) and the rest is
 *     upstream Scratch, whose CHANGELOGs carry thousands of shas of their own.
 *
 * What this cannot see, stated: a sha assembled from parts (a prefix constant
 * plus a suffix, a short sha widened at runtime) is out of reach of a by-name
 * scan, the same limit the doc-trigger and ROM censuses carry.
 *
 * Red names the file, the line, the stale sha, the repo, and which pin it was
 * (replaced in which lite commit, on which date) or that it was never a pin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, existsSync, lstatSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PINS = path.join(ROOT, 'vendor-pins.json');
const REPOS = ['bw-board', 'sb3-creator', 'bw-circuit-ui'];
const SCOPED_PINS = ['stc-compiler-flasher', 'arrays-values', 'circuitplayground', 'wedo2unified', 'spikeprime',
    'ev3comprehensive', 'legoboostunified', 'legonxt', 'legopoweredup'];
const ENV_DIR = {'bw-board': 'BW_BOARD_DIR', 'sb3-creator': 'SB3_CREATOR_DIR', 'bw-circuit-ui': 'BW_CIRCUIT_UI_DIR'};
const PROVENANCE = 'overlay/scratch-gui/static/roms/i8086-bios.provenance.json';
const HEX40 = /\b[0-9a-f]{40}\b/g;

// These consumed-study inputs describe a measured historical runtime. They
// cannot follow today's installed packages without falsifying that evidence.
// The role is admitted only for these exact complete-file bytes; changing even
// a comment refuses. Ordinary source and never-pinned receipt checks stay live.
export const SEALED_STUDY_FILES = Object.freeze({
    '.github/workflows/reference-qualified-instruments.yml': '657110ef93474d26f03dc1ae2fa8b8ce49063f8288ef65550fb0c558f0a9cd29',
    'scripts/lib/reference-qualified-circuits.mjs': '6efaeccdcb7aa855715020420dc9714f56c6f023a277f34a373aaf8f640bc341',
    'scripts/read-reference-qualified-instruments.py': 'b4fda49432bfc5cea9ad6ee81fea413c2acaa0dd551aeb48f959e0f35b2c491c',
    'docs/receipts/reference-qualified-v2-ui-package.json': 'aa2e7cdd01c31f9622339ebccf16fcd5c3728d497903b4230fbd1842fd1ddc16'
});


import {explainGitFailure} from './helpers/git-absence.mjs';

// `git` from PATH: the same AMBIENT-BINDING shape i8086-bios-provenance keeps
// and defuses — every use below proves git answered before anything is judged.
// gate-shapes-allow
const git = (cwd, ...args) => execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', cwd, ...args], {encoding: 'utf8', maxBuffer: 64 << 20});

/** `git`, but a missing-blob failure explains itself instead of reading as a pin defect. */
const gitReadingContent = (cwd, ...args) => {
    try {
        return git(cwd, ...args);
    } catch (e) {
        const why = explainGitFailure(`${e.message || ''} ${e.stderr || ''}`);
        if (why) throw new Error(why);
        throw e;
    }
};

export const currentPins = () => JSON.parse(readFileSync(PINS, 'utf8'));

/** Every sha the pins file ever held, with the lite commit that replaced it. Pure over `git log -p` text. */
/**
 * Former pin values, read out of the diff git prints for vendor-pins.json.
 *
 * A `-` LINE IS NOT PROOF A PIN MOVED, which is the whole reason `currentShas`
 * exists. Any rewrite of the file — a changed indent, a reordered key, a
 * trailing-newline fix — makes git print a `-` line for EVERY pin, including the
 * ones whose value is unchanged. Measured 2026-09-11: `scripts/lib-pin.mjs`
 * wrote the file with `JSON.stringify(pins, null, 1)` where the file uses indent
 * 2, so one bw-board bump reformatted all three lines and put bw-circuit-ui's
 * and sb3-creator's CURRENT shas into this map as "previous pins".
 *
 * What that costs downstream is silent and wrong in both directions: the
 * staleness scan starts reporting live pins as stale, and the fixture that
 * plants "a previous pin" to prove the detector works plants a sha that is still
 * current, finds nothing, and reads as a broken detector.
 *
 * So a sha that IS a current pin is never a previous pin, whatever the diff
 * looked like. That also covers the honest case the indent bug only imitated: a
 * pin moved away and then back.
 */
export const parsePreviousPins = (logText, currentShas = new Set(), allowedKeys = new Set(REPOS)) => {
    const prev = new Map();
    let commit = null;
    for (const line of logText.split('\n')) {
        const c = line.match(/^COMMIT ([0-9a-f]{40}) (\S+)/);
        if (c) { commit = {sha: c[1], date: c[2]}; continue; }
        const m = line.match(/^-\s*"([\w-]+)":\s*"([0-9a-f]{40})"/);
        if (m && allowedKeys.has(m[1]) && commit && !prev.has(m[2]) && !currentShas.has(m[2])) {
            prev.set(m[2], {repo: m[1], replacedIn: commit.sha.slice(0, 9), on: commit.date});
        }
    }
    return prev;
};

/** Role of a tracked file for this test: 'ledger' | 'receipt' | 'docs-prose' | 'skip' | 'code'. */
export const roleOf = file => {
    if (Object.hasOwn(SEALED_STUDY_FILES, file)) return 'receipt';
    if (/^(LANES|HISTORY|ROADMAP|PLAN|BLOCKED|HANDOFF|CI-POINTERS)\.md$/.test(file) || /^lanes\/[^/]+\.(md|tsv)$/.test(file)) return 'ledger';
    if (/^docs\/generated\//.test(file)) return 'code';
    // A dated run receipt records the pin it was MEASURED at; moving that sha
    // on a pin bump would falsify the evidence. Its own role rather than
    // 'ledger' because it is still judged: previous pins pass, a vendored
    // commit that was never a pin does not (see the header).
    if (/^docs\/receipts\/[^/]+\.json$/.test(file)) return 'receipt';
    // Original model-source READMEs record checks at a fixed app snapshot.
    // They keep that measured pin, with the same never-pinned-SHA rejection
    // as run receipts. Executable/model/JSON siblings remain current inputs.
    if (/^test\/fixtures\/model-files\/[^/]+-source\/README\.(txt|md)$/.test(file)) return 'receipt';
    // This imported source archive also records its capture's compiler pin.
    if (['test/fixtures/model-files/crossglide-source/SOURCES.txt', 'test/fixtures/model-files/resonance-lab-source/SOURCES.txt', 'test/helpers/resonance/original-inputs.json'].includes(file)) return 'receipt';
    if (/^docs\/.*\.md$/.test(file)) return 'docs-prose';
    // An example's prose cites where its circuit was generated and
    // bench-verified, e.g. "verified in bw-circuit-ui at revision <sha>". That
    // is narrative about a commit, which is exactly why docs/**.md is exempt;
    // the only difference is which directory the prose lives in. Moving the sha
    // on a pin bump would claim a verification nobody performed.
    if (/^overlay\/scratch-gui\/examples\/.*\.md$/.test(file)) return 'docs-prose';
    if (/^packages\//.test(file)) return 'skip';
    return 'code';
};
const COMMENT = /^\s*(\/\/|\*|\/\*|#(?!!))/;
const CODE_EXT = /\.(m?js|cjs|jsx|ts|yml|yaml|sh)$/;

/**
 * Judge one file's text. Pure; the mutation tests plant shas through it.
 * @param {string} file - repo-relative path
 * @param {string} text
 * @param {{current: Set<string>, previous: Map<string, object>, history: Map<string, string>}} known
 * @returns {Array<{file: string, line: number, sha: string, repo: string, was: string}>}
 */
export const judgeFile = (file, text, known, frozenAdmissions = new Map()) => {
    const role = roleOf(file);
    if (role !== 'code' && role !== 'receipt') return [];
    if (Object.hasOwn(SEALED_STUDY_FILES, file)) {
        assert.equal(createHash('sha256').update(text).digest('hex'), SEALED_STUDY_FILES[file],
            `${file}: sealed completed-study source changed; preserve the consumed experiment`);
    }
    let body = text;
    if (file === PROVENANCE) {
        // the one history FIELD, exempt by role (see header); everything else in the manifest must be the pin
        try { const m = JSON.parse(text); if (m.source && m.source.lastTouchedBy && m.source.lastTouchedBy.sha) body = text.split(m.source.lastTouchedBy.sha).join('<lastTouchedBy>'); } catch { /* judged as text */ }
    }
    const admission = frozenAdmissions.get(file);
    if (admission) {
        assert.equal(createHash('sha256').update(text).digest('hex'), admission.sha256, 'frozen bytes remain bound at judgment');
        assert.equal(blobOf(Buffer.from(text)), admission.gitBlob);
    }
    if (admission && known.previous.get(admission.value)?.repo === admission.repo) {
        // Only a fully source-bound constant token is historical. Every other
        // byte, including another old pin on this line, remains ordinary code.
        const bytes = Buffer.from(body);
        assert.equal(bytes.subarray(...admission.span).toString(), admission.value);
        body = Buffer.concat([bytes.subarray(0, admission.span[0]), Buffer.alloc(40, 32), bytes.subarray(admission.span[1])]).toString();
    }
    const out = [];
    body.split('\n').forEach((line, i) => {
        if (CODE_EXT.test(file) && COMMENT.test(line)) return;
        for (const m of line.matchAll(HEX40)) {
            const sha = m[0];
            if (known.current.has(sha)) continue;
            const p = known.previous.get(sha);
            if (p && role === 'receipt') continue;   // the pin it was measured at: history, kept as evidence
            const repo = p ? p.repo : known.history.get(sha);
            if (!repo) continue;
            out.push({file, line: i + 1, sha, repo, was: p ? `the ${p.repo} pin until lite ${p.replacedIn} (${p.on})`
                : `a ${repo} commit that was never a pin${role === 'receipt' ? ' (a receipt may record only a pin, current or previous)' : ''}`});
        }
    });
    return out;
};

// Frozen executable contracts keep their original candidate refusal. This is
// an exact constant role, never a file exemption or permission to run them on
// a newer candidate. Roles are code-owned; the receipt cannot add a role.
const FROZEN_ADMISSIONS = 'docs/receipts/frozen-control-pin-admissions.json';
const FROZEN_SCOPE = 'Exact frozen executable admission/reference contracts, not current supplier inputs or runtime qualification. Controllers remain unchanged and cannot qualify a new candidate.';
// The robot WebKit controller key is joined from parts: a literal path here
// would make the browser-scope census treat every sim-lab gate as a
// prerequisite of all shards (this test is reachable from a prerequisite step).
const frozenRoles = new Map([
    [['scripts', 'qualify-robot-model-webkit.mjs'].join('/'), {field:'FROZEN.producerSha', pattern:/^    "producerSha": "([0-9a-f]{40})",$/gm}],
    ['scripts/read-i80386-hdd-gui-originals.py', {field:'SB3', pattern:/^SB3 = '([0-9a-f]{40})'$/gm}],
    ['scripts/run-i80386-hdd-gui-actual.py', {field:'SB3', pattern:/^SB3 = '([0-9a-f]{40})'$/gm}]
]);
const exactFields = (value, keys) => {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
};
const blobOf = bytes => createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
export function validateFrozenAdmissions(manifest, observations, knownPins, pins) {
    exactFields(manifest, ['schema','scope','files']);
    assert.equal(manifest.schema, 'bw.frozen-control-pin-admissions.v1');
    assert.equal(manifest.scope, FROZEN_SCOPE);
    assert.ok(Array.isArray(manifest.files));
    assert.equal(manifest.files.length, frozenRoles.size);
    const admitted = new Map();
    for (const row of manifest.files) {
        exactFields(row, ['file','mode','sha256','gitBlob','field','repo','value','span']);
        const role = frozenRoles.get(row.file);
        assert.ok(role && !admitted.has(row.file), 'unique supported frozen file role');
        assert.equal(row.field, role.field); assert.equal(row.repo, 'sb3-creator');
        assert.equal(row.mode, '100644');
        assert.match(row.sha256, /^[0-9a-f]{64}$/); assert.match(row.gitBlob, /^[0-9a-f]{40}$/);
        assert.match(row.value, /^[0-9a-f]{40}$/);
        assert.ok(pins[row.repo] === row.value || knownPins.previous.get(row.value)?.repo === row.repo,
            'frozen admission is a shipped pin of its exact supplier');
        const observed = observations.get(row.file);
        assert.ok(observed && observed.regular, 'actual regular frozen file');
        assert.equal(observed.mode, row.mode); assert.equal(observed.gitBlob, row.gitBlob);
        const bytes = observed.bytes;
        assert.ok(Buffer.isBuffer(bytes));
        assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
        assert.equal(blobOf(bytes), row.gitBlob, 'whole live bytes equal the tracked Git blob');
        const text = bytes.toString('utf8'), matches = [...text.matchAll(new RegExp(role.pattern))];
        assert.equal(matches.length, 1, 'one exact supported constant declaration');
        const match = matches[0], start = Buffer.byteLength(text.slice(0, match.index + match[0].indexOf(match[1])));
        assert.equal(match[1], row.value);
        assert.deepEqual(row.span, [start, start + 40], 'exact constant token byte span');
        admitted.set(row.file, row);
    }
    assert.deepEqual([...admitted.keys()].sort(), [...frozenRoles.keys()].sort());
    return admitted;
}
function parseFrozenAdmissionReceipt(text) {
    const manifest = JSON.parse(text);
    assert.equal(text, JSON.stringify(manifest, null, 2) + '\n', 'canonical receipt excludes duplicate or ambiguous JSON keys');
    return manifest;
}
function frozenAdmissionInventory() {
    const manifest = parseFrozenAdmissionReceipt(readFileSync(path.join(ROOT, FROZEN_ADMISSIONS), 'utf8'));
    const observations = new Map();
    for (const file of frozenRoles.keys()) {
        const stat = lstatSync(path.join(ROOT, file));
        const entries = git(ROOT, 'ls-files', '--stage', '-z', '--', file).split('\0').filter(Boolean);
        assert.equal(entries.length, 1, 'one tracked frozen file');
        const match = /^(100644|100755) ([0-9a-f]{40}) 0\t(.+)$/.exec(entries[0]);
        assert.ok(match && match[3] === file, 'regular stage-zero tracked frozen file');
        observations.set(file, {regular:stat.isFile(), mode:stat.mode & 0o111 ? '100755' : '100644',
            gitBlob:match[2], bytes:readFileSync(path.join(ROOT, file))});
        assert.equal(match[1], observations.get(file).mode, 'live/tracked file mode');
    }
    return validateFrozenAdmissions(manifest, observations, known, currentPins());
}

const formatFindings = f => f.map(x => `${x.file}:${x.line}  ${x.sha.slice(0, 9)}  ${x.was}; current ${x.repo} pin is ${currentPins()[x.repo].slice(0, 9)}`).join('\n  ');

// ---- sources ---------------------------------------------------------------

const previousPinsFromHistory = () => {
    const count = Number(git(ROOT, 'rev-list', '--count', 'HEAD', '--', 'vendor-pins.json').trim());
    const shallow = git(ROOT, 'rev-parse', '--is-shallow-repository').trim() === 'true';
    // `-p` reads file CONTENT, which is the operation that needs blobs a
    // blobless clone has not fetched yet.
    const log = gitReadingContent(ROOT, 'log', '-p', '--format=COMMIT %H %ad', '--date=short', '--', 'vendor-pins.json');
    return {count, shallow, previous: parsePreviousPins(log, new Set(Object.values(currentPins())))};
};

const repoHistory = () => {
    const history = new Map();
    const where = {};
    for (const repo of REPOS) {
        const dir = process.env[ENV_DIR[repo]] || (process.env.BW_VENDOR_HISTORY_DIR && [`${repo}.git`, repo].map(d => path.join(process.env.BW_VENDOR_HISTORY_DIR, d)).find(existsSync)) || '';
        if (!dir) continue;
        const head = git(dir, 'rev-parse', 'HEAD').trim();
        assert.match(head, /^[0-9a-f]{40}$/, `${dir} is set for ${repo} but git could not read a HEAD there`);
        const shas = git(dir, 'rev-list', '--all').split('\n').filter(Boolean);
        assert.ok(shas.length > 100, `${dir} holds only ${shas.length} commits for ${repo} — not its history`);
        for (const s of shas) history.set(s, repo);
        where[repo] = `${dir} (${shas.length} commits)`;
    }
    return {history, where};
};

const trackedCodeFiles = () => git(ROOT, 'ls-files', '-z').split('\0').filter(f => f && roleOf(f) === 'code');

// ---- the gate --------------------------------------------------------------

const {count, shallow, previous} = previousPinsFromHistory();
const {history, where} = repoHistory();
const current = new Set(REPOS.map(repo => currentPins()[repo]));
const known = {current, previous, history};

// A scoped key is admitted only with the source bytes its receipt names.
const requireWeDo2Receipt = (pins, bundles, moduleSource) => {
    assert.match(pins.wedo2unified || '', /^[0-9a-f]{40}$/);
    const receipt = bundles.files.wedo2unified;
    assert.equal(receipt.repo, 'CrispStrobe/extensions');
    assert.equal(receipt.path, 'extensions/CrispStrobe/lego_wedo2_universal.js');
    assert.equal(receipt.commit, pins.wedo2unified);
    const encoded = moduleSource.match(/module\.exports\s*=\s*makeExt\(("(?:\\.|[^"\\])*")\);?/);
    assert.ok(encoded, 'the shipped WeDo2 module must retain its original source');
    const source = Buffer.from(JSON.parse(encoded[1]), 'utf8');
    assert.equal(source.length, receipt.bytes);
    assert.equal(createHash('sha256').update(source).digest('hex'), receipt.sha256);
};

test('the scoped WeDo2 pin matches the actual bundled source and its receipt', () => {
    requireWeDo2Receipt(currentPins(), JSON.parse(readFileSync(path.join(ROOT,
        'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json'), 'utf8')),
    readFileSync(path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/wedo2unified/index.js'), 'utf8'));
});

test('WeDo2 receipt correlation rejects wrong identity, lengths, hashes and source bytes', () => {
    const source = '// Name: WeDo2\n// By: ExampleAuthor\n// License: MPL-2.0\n';
    const pins = {wedo2unified: 'a'.repeat(40)};
    const bundles = {files: {wedo2unified: {repo: 'CrispStrobe/extensions',
        path: 'extensions/CrispStrobe/lego_wedo2_universal.js', commit: pins.wedo2unified,
        bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex')}}};
    const moduleSource = `module.exports = makeExt(${JSON.stringify(source)});`;
    requireWeDo2Receipt(pins, bundles, moduleSource);
    for (const [field, value] of [['repo', 'Other/extensions'], ['path', 'other.js'],
        ['commit', 'b'.repeat(40)], ['bytes', Buffer.byteLength(source) + 1], ['sha256', '0'.repeat(64)]]) {
        const wrong = structuredClone(bundles); wrong.files.wedo2unified[field] = value;
        assert.throws(() => requireWeDo2Receipt(pins, wrong, moduleSource), undefined, field);
    }
    assert.throws(() => requireWeDo2Receipt({}, bundles, moduleSource));
    assert.throws(() => requireWeDo2Receipt(pins, {files: {}}, moduleSource));
    assert.throws(() => requireWeDo2Receipt(pins, bundles, 'module.exports = broken;'));
    assert.throws(() => requireWeDo2Receipt(pins, bundles,
        `module.exports = makeExt(${JSON.stringify(source.replace('ExampleAuthor', 'SomeoneElse!!'))});`));
});

test('the pins file names three global repos plus explicitly scoped artifact pins', () => {
    const pins = currentPins();
    assert.deepEqual(Object.keys(pins).sort(), [...REPOS, ...SCOPED_PINS].sort());
    for (const [repo, sha] of Object.entries(pins)) assert.match(sha, /^[0-9a-f]{40}$/, `${repo} pin is not a full sha`);
    const bundles = JSON.parse(readFileSync(path.join(ROOT,
        'overlay/scratch-vm/src/extension-support/bundled-upstream-pins.json'), 'utf8'));
    assert.equal(bundles.files.arrays.commit, pins['arrays-values'], 'scoped Arrays pin must name the actual bundled source');
    assert.equal(bundles.files.arrays.repo, 'CrispStrobe/extensions', 'scoped Arrays source belongs to its declared repository');
    assert.equal(bundles.files.circuitplayground.commit, pins.circuitplayground, 'scoped Circuit Playground pin must name the actual bundled source');
    assert.equal(bundles.files.circuitplayground.repo, 'CrispStrobe/extensions', 'scoped Circuit Playground source belongs to its declared repository');
    for (const repo of REPOS) {
        const sha = pins[repo];
        if (where[repo]) assert.equal(history.get(sha), repo, `${repo}'s pin ${sha.slice(0, 9)} is not a commit in ${where[repo]}`);
    }
});

test('the previous-pin half can see history: the pins file has more than one commit here', () => {
    assert.ok(count > 1 || !shallow, `only ${count} commit(s) of vendor-pins.json are visible and the checkout is shallow — the previous-pin half would pass on an empty set. Deepen the history first (git fetch --unshallow --filter=blob:none; build.yml does this before the unit step).`);
    assert.ok(previous.size >= 1, `history holds ${count} commits of vendor-pins.json but no previous pin value parsed — the parser stopped matching, not the file`);
});

test('no tracked file outside a history role carries a vendored-repo sha other than the current pins', t => {
    // THE SKIPPED SET IS REPORTED, NOT SILENT. This walk once had
    // `if (text.includes(NUL)) continue;` — and for as long as fetch-pinning.test.mjs
    // held a literal NUL, the gate reported CLEAN while an old bw-board pin sat on
    // one of its code lines (lego-be's proof, 2026-09-07). A file with a NUL is text
    // here and is judged like any other; the only files not judged are the ones
    // outside a code role, and the count and reason are printed on every run.
    const frozenAdmissions = frozenAdmissionInventory();
    const findings = [];
    const skipped = {role: 0, unreadable: []};
    const all = git(ROOT, 'ls-files', '-z').split('\0').filter(Boolean);
    let scanned = 0;
    let receipts = 0;
    for (const file of all) {
        const role = roleOf(file);
        if (role !== 'code' && role !== 'receipt') { skipped.role++; continue; }
        if (role === 'receipt') receipts++;
        let text;
        try { text = readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) { skipped.unreadable.push(`${file} (${e.code || e.message})`); continue; }
        scanned++;
        findings.push(...judgeFile(file, text, known, frozenAdmissions));
    }
    t.diagnostic(`judged ${scanned} files (${receipts} receipts, which may also carry a previous pin); skipped ${skipped.role} by role (ledgers, docs prose, packages/) and ${skipped.unreadable.length} unreadable${skipped.unreadable.length ? ': ' + skipped.unreadable.join(', ') : ''}`);
    assert.deepEqual(skipped.unreadable, [], 'tracked files this gate could not read — it cannot say they are clean');
    assert.ok(scanned > 1000, `only ${scanned} files scanned — the walk collapsed`);
    assert.deepEqual(findings, [],
        `stale vendored-repo sha(s) in a file that must carry the CURRENT pin — regenerate the document (or, if the sha is a citation, the file's role is wrong: see the header):\n  ${formatFindings(findings)}`);
});

test('the repo-history half ran, or says by name that it could not', t => {
    if (Object.keys(where).length === 0) {
        t.skip('no vendored-repo history reachable (set BW_BOARD_DIR / SB3_CREATOR_DIR / BW_CIRCUIT_UI_DIR to checkouts, or BW_VENDOR_HISTORY_DIR to a directory of <repo>.git bare clones) — only PREVIOUS PIN values were checked above');
        return;
    }
    for (const repo of REPOS) assert.ok(where[repo], `${repo} history not reachable while the others are: ${JSON.stringify(where)}`);
});

// ---- fire it on purpose ----------------------------------------------------

test('a previous pin planted in a generated document is red, naming the file, the sha and which pin it was', () => {
    // THE FIXTURE ACCUSES ITSELF BEFORE IT ACCUSES THE DETECTOR.
    //
    // Measured 2026-09-11: this case failed `0 !== 1` and read as "the staleness
    // detector is broken". The detector was right. `previous` had been poisoned
    // by a reformat of vendor-pins.json, so the sha this planted was STILL A
    // CURRENT PIN, and finding nothing was the correct answer to the question
    // actually asked.
    //
    // A failing fixture means the subject is wrong OR the plant was degenerate,
    // and the failure text always accuses the subject — it is written from the
    // fixture's point of view. Mutation testing cannot catch that, because the
    // thing is already red and red is what you were hoping for. The only defence
    // is to assert what the fixture PRODUCED before asserting what it concluded.
    const first = [...previous.entries()][0];
    assert.ok(first, 'fixture: no previous pin exists to plant, so this case proves nothing '
        + 'about the detector — see previousPinsFromHistory');
    const [sha, meta] = first;
    assert.ok(!REPOS.map(repo => currentPins()[repo]).includes(sha),
        `fixture: the "previous" pin ${sha.slice(0, 9)} is STILL A CURRENT PIN, so planting `
        + 'it is planting nothing stale and finding nothing is correct. The defect is in the '
        + 'previous-pin map, not in the detector this case is about.');
    const doc = `docs/generated/I8086-CAPABILITY-REPORT.md`;
    const original = readFileSync(path.join(ROOT, doc), 'utf8');
    const text = original.replace(currentPins()['bw-board'], sha);
    assert.notEqual(text, original,
        `fixture: the plant was a NO-OP — ${doc} does not contain the current bw-board pin, `
        + 'so nothing was replaced and the document under test is unmodified');
    const f = judgeFile(doc, text, known);
    assert.equal(f.length, 1, 'exactly the planted sha');
    assert.equal(f[0].sha, sha);
    assert.match(f[0].was, new RegExp(`the ${meta.repo} pin until lite ${meta.replacedIn}`));
    assert.match(formatFindings(f), new RegExp(`^${doc}:\\d+  ${sha.slice(0, 9)}  the ${meta.repo} pin until lite ${meta.replacedIn} \\(${meta.on}\\); current ${meta.repo} pin is`));
});

test('the same sha in a ledger, in docs prose, or on a comment line is history and is not reported', () => {
    const [sha] = [...previous.entries()][0];
    assert.deepEqual(judgeFile('LANES.md', `| row | ${sha} |`, known), []);
    assert.deepEqual(judgeFile('docs/SOMETHING.md', `measured at ${sha}`, known), []);
    assert.deepEqual(judgeFile('overlay/scratch-gui/examples/example/intro.md',
        `bench-verified at ${sha}`, known), []);
    assert.deepEqual(judgeFile('test/x.test.mjs', `// pin moved ${sha} -> now`, known), []);
    assert.equal(judgeFile('test/x.test.mjs', `const PIN = '${sha}';`, known).length, 1, 'the code line beside the comment is not exempt');
    assert.equal(judgeFile('docs/generated/report.md', `Vendored engine: \`x@${sha}\``, known).length, 1, 'docs/generated is not prose');
});

test('a receipt keeps the previous pin it was measured at; the same sha outside a receipt is still red', () => {
    const [sha, meta] = [...previous.entries()][0];
    const receipt = `{\n  "boardPin": "${sha}"\n}`;
    assert.equal(roleOf('docs/receipts/2026-01-01-run.json'), 'receipt');
    assert.deepEqual(judgeFile('docs/receipts/2026-01-01-run.json', receipt, known), [], 'a receipt recording a previous pin is evidence, not staleness');
    // the real receipt that motivated the role: it was measured at a bw-board pin a later bump replaced
    const doom = 'docs/receipts/2026-09-28-i80386-doom-widgets-browser.json';
    const doomText = readFileSync(path.join(ROOT, doom), 'utf8');
    const doomPin = JSON.parse(doomText).source.boardPin;
    assert.ok(previous.has(doomPin) || current.has(doomPin), `fixture: ${doom} boardPin ${doomPin.slice(0, 9)} is no longer a known pin, so this case proves nothing`);
    assert.deepEqual(judgeFile(doom, doomText, known), []);
    // the same bytes anywhere that must carry the CURRENT pin are still reported
    for (const file of ['docs/generated/run.json', 'scripts/run.json', 'docs/receipts/nested/run.json', 'docs/receipts-2026.json']) {
        const f = judgeFile(file, receipt, known);
        assert.equal(f.length, 1, `${file} is not a receipt and must not inherit its exemption`);
        assert.match(f[0].was, new RegExp(`the ${meta.repo} pin until lite ${meta.replacedIn}`));
    }
});

test('a receipt still may not carry a vendored-repo commit that was never a pin', () => {
    // synthetic history so this runs with or without the *_DIR checkouts
    const neverPin = 'f'.repeat(40);
    const k = {...known, history: new Map([...known.history, [neverPin, 'bw-board']])};
    assert.ok(!k.current.has(neverPin) && !k.previous.has(neverPin), 'fixture: the planted sha must be neither a current nor a previous pin');
    const f = judgeFile('docs/receipts/2026-01-01-run.json', `{"boardPin":"${neverPin}"}`, k);
    assert.equal(f.length, 1);
    assert.match(f[0].was, /a bw-board commit that was never a pin \(a receipt may record only a pin/);
});

test('the provenance manifest: lastTouchedBy.sha is exempt by role, any other non-pin sha is not', () => {
    const real = JSON.parse(readFileSync(path.join(ROOT, PROVENANCE), 'utf8'));
    assert.deepEqual(judgeFile(PROVENANCE, JSON.stringify(real), known), [], 'today\'s manifest is at the pin');
    const [sha] = [...previous.entries()][0];
    const stale = JSON.parse(JSON.stringify(real)); stale.pinAtBuild = sha;
    assert.equal(judgeFile(PROVENANCE, JSON.stringify(stale), known).length, 1, 'a stale pinAtBuild is reported');
});

test('the previous-pin parser reads the diff shape git prints, and ignores everything else', () => {
    const log = 'COMMIT aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 2026-09-07\n-  "bw-board": "1111111111111111111111111111111111111111",\n+  "bw-board": "2222222222222222222222222222222222222222",\nCOMMIT bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2026-09-06\n-  "sb3-creator": "3333333333333333333333333333333333333333"\n+  "sb3-creator": "4444444444444444444444444444444444444444"\n';
    const p = parsePreviousPins(log);
    assert.deepEqual([...p.keys()], ['1'.repeat(40), '3'.repeat(40)]);
    assert.deepEqual(p.get('1'.repeat(40)), {repo: 'bw-board', replacedIn: 'aaaaaaaaa', on: '2026-09-07'});
});

test('global previous-pin parsing excludes scoped flasher history at the parsing boundary', () => {
    const globalOld = '1111111111111111111111111111111111111111';
    const flasherOld = '2222222222222222222222222222222222222222';
    const log = `COMMIT ${'a'.repeat(40)} 2026-09-13\n-  "bw-board": "${globalOld}"\n-  "stc-compiler-flasher": "${flasherOld}"`;
    const global = parsePreviousPins(log, new Set(), new Set(REPOS));
    assert.deepEqual([...global.keys()], [globalOld]);
    const scoped = parsePreviousPins(log, new Set(), new Set(SCOPED_PINS));
    assert.deepEqual([...scoped.keys()], [flasherOld]);
    const globalKnown = {current, previous: global, history: new Map()};
    assert.deepEqual(judgeFile('test/independent-stc.js', `const SHA = '${flasherOld}';`, globalKnown), [],
        'a former scoped flasher pin leaked into the global judge');
    assert.deepEqual(judgeFile('test/independent-stc.js',
        `const SHA = '${currentPins()['stc-compiler-flasher']}';`, globalKnown), [],
    'the current scoped flasher pin leaked into the global judge');
    assert.deepEqual(judgeFile('test/independent-stc.js',
        `const SHA = '79df4b6d37c78e463f5c1d8caa3cfaa7712935ad';`, globalKnown), [],
    'an independent hosted-target stc revision entered global pin authority');
});

test('a REFORMAT of the pins file does not invent previous pins for pins that never moved', () => {
    // THE DEFECT THIS EXISTS FOR, measured 2026-09-11. `scripts/lib-pin.mjs`
    // wrote vendor-pins.json with `JSON.stringify(pins, null, 1)` while the file
    // uses indent 2, so every --pin run rewrote all three lines. Git prints a `-`
    // for each, and two pins that had not moved at all entered the previous-pin
    // map — while still being the current pins.
    //
    // Nothing connected the whitespace default to the three tests it broke. This
    // is the connection, stated as the invariant rather than as the indent: a
    // current pin is never a previous pin.
    const current = {'bw-board': 'b'.repeat(40), 'sb3-creator': 'c'.repeat(40)};
    const reformatted = [
        'COMMIT ' + 'a'.repeat(40) + ' 2026-09-11',
        '-  "bw-board": "' + 'd'.repeat(40) + '",',     // really moved
        '-  "sb3-creator": "' + 'c'.repeat(40) + '"',   // only reindented
        '+ "bw-board": "' + 'b'.repeat(40) + '",',
        '+ "sb3-creator": "' + 'c'.repeat(40) + '"'
    ].join('\n');

    const naive = parsePreviousPins(reformatted);
    assert.ok(naive.has('c'.repeat(40)),
        'fixture: the unguarded parser did NOT pick up the reindented line, so this case '
        + 'is not reproducing the defect and proves nothing about the guard');

    const guarded = parsePreviousPins(reformatted, new Set(Object.values(current)));
    assert.deepEqual([...guarded.keys()], ['d'.repeat(40)],
        'a pin that only changed INDENTATION is being reported as a former pin. Every '
        + 'downstream reader then treats a live sha as stale, and the fixture that plants '
        + '"a previous pin" plants one that is still current and finds nothing.');
    assert.equal(guarded.get('d'.repeat(40)).repo, 'bw-board',
        'the one pin that really moved lost its repo name to the filter');
});

test('the pins file keeps the indentation its own history is diffed against', () => {
    // Not a style rule. The previous-pin map is read out of `git log -p` on this
    // file, so its FORMATTING is an input to a gate. A writer using a different
    // indent reformats every line and manufactures the finding above. Asserted
    // here so the two cannot drift apart again in silence.
    const raw = readFileSync(path.join(ROOT, 'vendor-pins.json'), 'utf8');
    assert.equal(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n',
        'vendor-pins.json is not `JSON.stringify(pins, null, 2)` + newline. Whatever wrote '
        + 'it last uses a different shape, so the next pin bump will rewrite every line and '
        + 'put unchanged pins into the previous-pin map. Fix the WRITER '
        + '(scripts/lib-pin.mjs), not this file.');
});


test('an original model-source README retains its actual historical measurement pin', () => {
    const file = 'test/fixtures/model-files/axis-plotter-source/README.txt';
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    const measured = /app's pinned sb3-creator revision is:\s*([0-9a-f]{40})/.exec(text)?.[1];
    assert.ok(measured, 'the original records its measured compiler pin');
    assert.ok(previous.has(measured), 'the original measurement retains a previous shipped pin');
    assert.equal(roleOf(file), 'receipt');
    assert.deepEqual(judgeFile(file, text, known), []);
    for (const sibling of ['original.ldr', 'setup.mjs', 'snapshot.json', 'nested/README.txt']) {
        const active = `test/fixtures/model-files/axis-plotter-source/${sibling}`;
        assert.equal(roleOf(active), 'code');
        assert.equal(judgeFile(active, `measured at ${measured}`, known).length, 1,
            'the historical pin must still fail in an active input');
    }
});

test('original source README receipts still reject never-pinned supplier commits', () => {
    const neverPin = 'f'.repeat(40);
    const k = {...known, history: new Map([...known.history, [neverPin, 'sb3-creator']])};
    assert.ok(!k.current.has(neverPin) && !k.previous.has(neverPin));
    for (const extension of ['txt', 'md']) {
        const file = `test/fixtures/model-files/archived-source/README.${extension}`;
        const findings = judgeFile(file, `measured at ${neverPin}`, k);
        assert.equal(roleOf(file), 'receipt');
        assert.equal(findings.length, 1);
        assert.match(findings[0].was, /never a pin/);
    }
    assert.equal(roleOf('test/fixtures/model-files/active/README.txt'), 'code');
    assert.equal(roleOf('test/fixtures/README.txt'), 'code');
});

test('the captured Crossglide provenance keeps its actual historical compiler pin', () => {
    const file = 'test/fixtures/model-files/crossglide-source/SOURCES.txt';
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    const measured = /Registered compiler revision:\s*([0-9a-f]{40})/.exec(text)?.[1];
    assert.ok(measured, 'the captured document records its compiler revision');
    assert.ok(previous.has(measured), 'the capture records a previously shipped pin');
    assert.equal(roleOf(file), 'receipt');
    assert.deepEqual(judgeFile(file, text, known), []);
    for (const active of [
        'test/fixtures/model-files/crossglide-source/active.json',
        'test/fixtures/model-files/crossglide-source/SOURCES.md',
        'test/fixtures/model-files/crossglide-source/nested/SOURCES.txt',
        'test/fixtures/model-files/other-source/SOURCES.txt'
    ]) {
        assert.equal(roleOf(active), 'code');
        assert.equal(judgeFile(active, text, known).length, 1);
    }
});

test('the captured Crossglide provenance still rejects a never-pinned supplier commit', () => {
    const file = 'test/fixtures/model-files/crossglide-source/SOURCES.txt';
    const neverPin = 'f'.repeat(40);
    const k = {...known, history: new Map([...known.history, [neverPin, 'sb3-creator']])};
    assert.ok(!k.current.has(neverPin) && !k.previous.has(neverPin));
    const findings = judgeFile(file, `Registered compiler revision:\n${neverPin}`, k);
    assert.equal(findings.length, 1);
    assert.match(findings[0].was, /never a pin/);
});


test('captured Resonance source receipts preserve actual old pins but refuse invented supplier commits', () => {
 const oldPin=JSON.parse(readFileSync(path.join(ROOT,'test/helpers/resonance/original-inputs.json'),'utf8')).originalCompilerPin,neverPin='f'.repeat(40);
 const k={...known,history:new Map([...known.history,[neverPin,'sb3-creator']])};
 for(const file of ['test/fixtures/model-files/resonance-lab-source/SOURCES.txt','test/helpers/resonance/original-inputs.json']){
  assert.equal(roleOf(file),'receipt');assert.ok(previous.has(oldPin));
  assert.deepEqual(judgeFile(file,readFileSync(path.join(ROOT,file),'utf8'),known),[]);
  const findings=judgeFile(file,neverPin,k);assert.equal(findings.length,1);assert.match(findings[0].was,/never a pin/);
 }
 assert.equal(roleOf('test/helpers/resonance/active.json'),'code');
 assert.equal(roleOf('test/fixtures/model-files/resonance-lab-source/active.json'),'code');
});


test('frozen historical admission inventory remains exact independently of current-pin scanning', () => {
    const admitted = frozenAdmissionInventory();
    assert.equal(admitted.size, 3);
    for (const [file, row] of admitted) {
        assert.equal(roleOf(file), 'code');
        assert.deepEqual(judgeFile(file, readFileSync(path.join(ROOT, file), 'utf8'), known, admitted), []);
        assert.ok(currentPins()[row.repo] === row.value || previous.get(row.value)?.repo === row.repo,
            'actual frozen value remains a shipped pin of its supplier');
    }
});

// Negative controls use an explicit later-pin context, including when the
// repository legitimately rolls back to the frozen pin. This never changes
// the live inventory or the real whole-repository judgment above.
const frozenHistoricalTestContext = manifest => {
    const old = manifest.files[0].value, next = old === '0'.repeat(40) ? '1'.repeat(40) : '0'.repeat(40);
    const pins = {...currentPins(), 'sb3-creator':next}, previous = new Map(known.previous);
    for (const row of manifest.files) previous.set(row.value, {repo:row.repo});
    return {pins, known:{...known, current:new Set(Object.values(pins)), previous}};
};

test('frozen admission bindings reject source, inventory, schema and unshipped-value mutations', () => {
    const original = parseFrozenAdmissionReceipt(readFileSync(path.join(ROOT, FROZEN_ADMISSIONS), 'utf8'));
    const observe = () => new Map(original.files.map(row => [row.file, {regular:true, mode:row.mode,
        gitBlob:row.gitBlob, bytes:readFileSync(path.join(ROOT, row.file))}]));
    const context = frozenHistoricalTestContext(original);
    const validate = (manifest, observations = observe(), k = context.known) => validateFrozenAdmissions(manifest, observations, k, context.pins);
    assert.equal(validate(original).size, 3);
    for (const mutate of [
        m => {m.extra = true;}, m => {m.schema = 'foreign';}, m => {delete m.files;},
        m => {m.files.pop();}, m => {m.files[1] = structuredClone(m.files[0]);},
        m => {m.files[0].file = 'scripts/copied-controller.mjs';},
        m => {m.files[0].file = './' + m.files[0].file;},
        m => {m.files[0].field = 'other';}, m => {m.files[0].repo = 'bw-board';},
        m => {m.files[0].mode = '100755';}, m => {m.files[0].sha256 = '0'.repeat(64);},
        m => {m.files[0].gitBlob = '0'.repeat(40);}, m => {m.files[0].span[0]++;},
        m => {m.files[0].value = 'f'.repeat(40);}, m => {m.files[0].extra = true;}
    ]) {
        const manifest = structuredClone(original); mutate(manifest);
        assert.throws(() => validate(manifest), undefined, String(mutate));
    }
    for (const mutate of [
        o => {o.regular = false;}, o => {o.mode = '100755';}, o => {o.gitBlob = '0'.repeat(40);},
        o => {o.bytes = Buffer.concat([o.bytes, Buffer.from('\n')]);},
        o => {o.bytes = Buffer.from(o.bytes.toString().replace(original.files[0].value, context.pins['sb3-creator']));}
    ]) {
        const observations = observe(); mutate(observations.get(original.files[0].file));
        assert.throws(() => validate(original, observations), undefined, String(mutate));
    }
    const observations = observe(); observations.delete(original.files[0].file);
    assert.throws(() => validate(original, observations));
    const duplicateJSON = JSON.stringify(original).replace('"schema":', '"schema":"duplicate","schema":');
    assert.throws(() => parseFrozenAdmissionReceipt(duplicateJSON));
    const wrongSupplier = {...context.known, previous:new Map(context.known.previous)};
    wrongSupplier.previous.set(original.files[0].value, {repo:'bw-board'});
    assert.throws(() => validate(original, observe(), wrongSupplier));
    const never = 'f'.repeat(40), invented = structuredClone(original), row = invented.files[0];
    const observed = observe(), before = observed.get(row.file).bytes;
    const bytes = Buffer.concat([before.subarray(0,row.span[0]),Buffer.from(never),before.subarray(row.span[1])]);
    row.value=never;row.sha256=createHash('sha256').update(bytes).digest('hex');row.gitBlob=blobOf(bytes);
    observed.set(row.file,{regular:true,mode:row.mode,gitBlob:row.gitBlob,bytes});
    const neverKnown={...context.known,previous:new Map(context.known.previous),history:new Map(context.known.history)};
    neverKnown.previous.delete(never);neverKnown.history.set(never,'sb3-creator');
    assert.throws(()=>validate(invented,observed,neverKnown),/shipped pin/,'a consistently rebound never-shipped token still cannot gain this role');
    const currentPinsContext={...context.pins,'sb3-creator':original.files[0].value};
    const currentKnown={...context.known,current:new Set(Object.values(currentPinsContext)),previous:new Map(context.known.previous)};
    currentKnown.previous.delete(original.files[0].value);
    const currentAdmission=validateFrozenAdmissions(original,observe(),currentKnown,currentPinsContext);
    assert.equal(currentAdmission.size,3,'frozen contract remains valid when its pin is current');
    const first=original.files[0];
    assert.deepEqual(judgeFile(first.file,observe().get(first.file).bytes.toString(),currentKnown,currentAdmission),[]);

});

test('one frozen constant token never exempts another active pin or a copied controller', () => {
    const manifest = parseFrozenAdmissionReceipt(readFileSync(path.join(ROOT, FROZEN_ADMISSIONS), 'utf8'));
    const row = manifest.files[0], bytes = readFileSync(path.join(ROOT, row.file));
    const context=frozenHistoricalTestContext(manifest);
    const observations = new Map(manifest.files.map(r => [r.file, {regular:true, mode:r.mode,
        gitBlob:r.gitBlob, bytes:readFileSync(path.join(ROOT, r.file))}]));
    const rebound = (m, raw) => {
        const changed = m.files[0];
        changed.sha256 = createHash('sha256').update(raw).digest('hex'); changed.gitBlob = blobOf(raw);
        observations.set(changed.file, {regular:true, mode:changed.mode, gitBlob:changed.gitBlob, bytes:raw});
        return validateFrozenAdmissions(m, observations, context.known, context.pins);
    };
    // Even if a proposed new receipt binds the changed whole file, only the
    // supported token has this role. A second active old pin still fails.
    const extra = Buffer.concat([bytes, Buffer.from(`\nconst activeSupplier = "${row.value}";\n`)]);
    const admitted = rebound(structuredClone(manifest), extra);
    assert.equal(judgeFile(row.file, extra.toString(), context.known, admitted).length, 1);
    assert.equal(judgeFile('scripts/copied-controller.mjs', bytes.toString(), context.known, admitted).length, 1);
    assert.throws(() => judgeFile(row.file, extra.toString(), known, frozenAdmissionInventory()));
    const duplicate = Buffer.concat([bytes, Buffer.from(`\n    "producerSha": "${row.value}",\n`)]);
    assert.throws(() => rebound(structuredClone(manifest), duplicate));
    const never = 'f'.repeat(40), k = {...known, history:new Map([...known.history, [never,'sb3-creator']])};
    const wrong = structuredClone(manifest); wrong.files[0].value = never;
    assert.ok(!known.current.has(never) && !known.previous.has(never));
    assert.throws(() => validateFrozenAdmissions(wrong, observations, k, currentPins()));
});

for (const file of Object.keys(SEALED_STUDY_FILES)) {
    test(`completed-study historical role requires exact sealed bytes: ${file}`, () => {
        const text = readFileSync(path.join(ROOT, file), 'utf8');
        assert.equal(roleOf(file), 'receipt');
        assert.deepEqual(judgeFile(file, text, known), []);
        assert.throws(() => judgeFile(file, text + '\n', known), /sealed completed-study source changed/);
        const former = previous.keys().next().value;
        assert.ok(former, 'history authority is populated');
        assert.equal(judgeFile('scripts/current-package-authority.mjs',
            `const PIN = '${former}';`, known).length, 1, 'ordinary current code still rejects a former pin');
    });
}
