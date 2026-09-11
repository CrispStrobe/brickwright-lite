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
 *   - ledgers (LANES.md, HISTORY.md, ROADMAP.md, PLAN.md, BLOCKED.md,
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
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PINS = path.join(ROOT, 'vendor-pins.json');
const REPOS = ['bw-board', 'sb3-creator', 'bw-circuit-ui'];
const ENV_DIR = {'bw-board': 'BW_BOARD_DIR', 'sb3-creator': 'SB3_CREATOR_DIR', 'bw-circuit-ui': 'BW_CIRCUIT_UI_DIR'};
const PROVENANCE = 'overlay/scratch-gui/static/roms/i8086-bios.provenance.json';
const HEX40 = /\b[0-9a-f]{40}\b/g;

// `git` from PATH: the same AMBIENT-BINDING shape i8086-bios-provenance keeps
// and defuses — every use below proves git answered before anything is judged.
// gate-shapes-allow
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], {encoding: 'utf8', maxBuffer: 64 << 20});

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
export const parsePreviousPins = (logText, currentShas = new Set()) => {
    const prev = new Map();
    let commit = null;
    for (const line of logText.split('\n')) {
        const c = line.match(/^COMMIT ([0-9a-f]{40}) (\S+)/);
        if (c) { commit = {sha: c[1], date: c[2]}; continue; }
        const m = line.match(/^-\s*"([\w-]+)":\s*"([0-9a-f]{40})"/);
        if (m && commit && !prev.has(m[2]) && !currentShas.has(m[2])) {
            prev.set(m[2], {repo: m[1], replacedIn: commit.sha.slice(0, 9), on: commit.date});
        }
    }
    return prev;
};

/** Role of a tracked file for this test: 'ledger' | 'docs-prose' | 'skip' | 'code'. */
export const roleOf = file => {
    if (/^(LANES|HISTORY|ROADMAP|PLAN|BLOCKED|HANDOFF)\.md$/.test(file)) return 'ledger';
    if (/^docs\/generated\//.test(file)) return 'code';
    if (/^docs\/.*\.md$/.test(file)) return 'docs-prose';
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
export const judgeFile = (file, text, known) => {
    const role = roleOf(file);
    if (role !== 'code') return [];
    let body = text;
    if (file === PROVENANCE) {
        // the one history FIELD, exempt by role (see header); everything else in the manifest must be the pin
        try { const m = JSON.parse(text); if (m.source && m.source.lastTouchedBy && m.source.lastTouchedBy.sha) body = text.split(m.source.lastTouchedBy.sha).join('<lastTouchedBy>'); } catch { /* judged as text */ }
    }
    const out = [];
    body.split('\n').forEach((line, i) => {
        if (CODE_EXT.test(file) && COMMENT.test(line)) return;
        for (const m of line.matchAll(HEX40)) {
            const sha = m[0];
            if (known.current.has(sha)) continue;
            const p = known.previous.get(sha);
            const repo = p ? p.repo : known.history.get(sha);
            if (!repo) continue;
            out.push({file, line: i + 1, sha, repo, was: p ? `the ${p.repo} pin until lite ${p.replacedIn} (${p.on})` : `a ${repo} commit that was never a pin`});
        }
    });
    return out;
};

const formatFindings = f => f.map(x => `${x.file}:${x.line}  ${x.sha.slice(0, 9)}  ${x.was}; current ${x.repo} pin is ${currentPins()[x.repo].slice(0, 9)}`).join('\n  ');

// ---- sources ---------------------------------------------------------------

const previousPinsFromHistory = () => {
    const count = Number(git(ROOT, 'rev-list', '--count', 'HEAD', '--', 'vendor-pins.json').trim());
    const shallow = git(ROOT, 'rev-parse', '--is-shallow-repository').trim() === 'true';
    const log = git(ROOT, 'log', '-p', '--format=COMMIT %H %ad', '--date=short', '--', 'vendor-pins.json');
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
const current = new Set(Object.values(currentPins()));
const known = {current, previous, history};

test('the pins file is what it says: three repos, full 40-hex shas, every one a commit of its repo where history is reachable', () => {
    const pins = currentPins();
    assert.deepEqual(Object.keys(pins).sort(), [...REPOS].sort());
    for (const [repo, sha] of Object.entries(pins)) {
        assert.match(sha, /^[0-9a-f]{40}$/, `${repo} pin is not a full sha`);
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
    const findings = [];
    const skipped = {role: 0, unreadable: []};
    const all = git(ROOT, 'ls-files', '-z').split('\0').filter(Boolean);
    let scanned = 0;
    for (const file of all) {
        if (roleOf(file) !== 'code') { skipped.role++; continue; }
        let text;
        try { text = readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) { skipped.unreadable.push(`${file} (${e.code || e.message})`); continue; }
        scanned++;
        findings.push(...judgeFile(file, text, known));
    }
    t.diagnostic(`judged ${scanned} files; skipped ${skipped.role} by role (ledgers, docs prose, packages/) and ${skipped.unreadable.length} unreadable${skipped.unreadable.length ? ': ' + skipped.unreadable.join(', ') : ''}`);
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
    assert.ok(!Object.values(currentPins()).includes(sha),
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
    assert.deepEqual(judgeFile('test/x.test.mjs', `// pin moved ${sha} -> now`, known), []);
    assert.equal(judgeFile('test/x.test.mjs', `const PIN = '${sha}';`, known).length, 1, 'the code line beside the comment is not exempt');
    assert.equal(judgeFile('docs/generated/report.md', `Vendored engine: \`x@${sha}\``, known).length, 1, 'docs/generated is not prose');
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
