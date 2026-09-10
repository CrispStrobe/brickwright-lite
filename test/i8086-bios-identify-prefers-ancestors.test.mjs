/**
 * The BIOS recorder must identify the ROM from the line of history this repo
 * VENDORS, not from whichever branch happens to sort first.
 *
 * WHAT WAS MEASURED, 2026-09-10. `identify` listed candidates with
 * `git log --all -- rom/bios.asm`, which reaches every ref and orders by date.
 * Eleven commits touched the source; ten were ancestors of the pin and one,
 * `de39245b` on `feat/x86-backend-lab`, was not — and being the newest it won
 * every walk. Its only change replaces the named constant `BIOS_PIC_ICW4` with
 * its literal `09h`, which assembles to identical bytes, so the ancestor
 * `7b8d1404` reproduced the committed ROM exactly as well. The recorder returned
 * the side-branch commit, the ancestry check refused, and a correct refusal was
 * reported about a ROM that was reproducible all along. Three people worked
 * around it.
 *
 * THE REFUSAL IS NOT WHAT WAS WRONG AND IS NOT RELAXED HERE. Recording a
 * manifest that names a commit the pin does not carry would be a lie about
 * provenance. The third test below is the one that holds that line: when NO
 * ancestor reproduces the bytes, the search still reports the non-ancestor and
 * flags it, so the caller still refuses.
 *
 * WHY THIS TEST IS HERMETIC. It builds its own git repository in a temp
 * directory from lite's OWN vendored `i8086-bios.asm`, so it needs no bw-board
 * checkout and runs in CI, where `BW_BOARD_DIR` is never set.
 *
 * THE TWO COMMITS THAT BOTH REPRODUCE THE ROM DIFFER IN TEXT AND AGREE IN BYTES,
 * which is exactly the real shape and is also the only shape that works. A first
 * version of this file gave them byte-identical sources and committed with
 * `--allow-empty`, and every such commit vanished from the candidate list:
 * `git log -- <path>` reports commits that CHANGED the path, so a commit that
 * changes nothing is not a candidate at all. The perturbation is therefore a
 * COMMENT, measured to assemble to identical bytes, which leaves ordering as the
 * only thing that can decide the answer.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {identify, assembleBios, VENDORED_SOURCE, SOURCE_IN_BW_BOARD} =
    await import(path.join(ROOT, 'scripts/sync-i8086-bios.mjs'));

const sha256 = buf => createHash('sha256').update(buf).digest('hex');
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();

/** A repo with `rom/bios.asm` on a main line and on a side branch. */
const buildRepo = ({mainSources, sideSource}) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'bw-bios-identify-'));
    git(dir, ['init', '-q', '-b', 'master']);
    git(dir, ['config', 'user.email', 'test@example.invalid']);
    git(dir, ['config', 'user.name', 'test']);
    mkdirSync(path.join(dir, path.dirname(SOURCE_IN_BW_BOARD)), {recursive: true});
    const mainShas = [];
    for (const [i, text] of mainSources.entries()) {
        writeFileSync(path.join(dir, SOURCE_IN_BW_BOARD), text);
        git(dir, ['add', SOURCE_IN_BW_BOARD]);
        git(dir, ['commit', '-q', '-m', `main ${i}`]);
        mainShas.push(git(dir, ['rev-parse', 'HEAD']));
    }
    let sideSha = null;
    if (sideSource !== undefined) {
        // Branched from the FIRST main commit, so it is not an ancestor of the
        // tip, and committed last so a date-ordered walk reaches it first —
        // which is the shape the real defect had.
        git(dir, ['checkout', '-q', '-b', 'feat/side', mainShas[0]]);
        writeFileSync(path.join(dir, SOURCE_IN_BW_BOARD), sideSource);
        git(dir, ['add', SOURCE_IN_BW_BOARD]);
        git(dir, ['commit', '-q', '-m', 'side']);
        sideSha = git(dir, ['rev-parse', 'HEAD']);
        git(dir, ['checkout', '-q', 'master']);
    }
    return {dir, mainShas, sideSha, cleanup: () => rmSync(dir, {recursive: true, force: true})};
};

const REAL = readFileSync(VENDORED_SOURCE, 'utf8');
// A source that still assembles but produces DIFFERENT bytes: one character
// inside a message string. Chosen over an instruction edit so the image stays
// valid and `assembleBios`'s own reset-vector checks still pass — a candidate
// that fails to assemble is skipped, which would prove nothing about ordering.
const ALTERED = (() => {
    const m = /db\s+'([^']{4,})'/.exec(REAL);
    assert.ok(m, 'the vendored bios.asm has no quoted string to perturb');
    const swapped = m[1].slice(0, -1) + (m[1].endsWith('.') ? '!' : '.');
    return REAL.replace(m[0], m[0].replace(m[1], swapped));
})();

// Different TEXT, identical BYTES — the real defect's shape, where a named
// constant was replaced by its literal. A comment is the smallest version of it
// and is asserted below rather than assumed.
const COMMENTED = '; a comment that emits no bytes\n' + REAL;

const romShaOf = async source => sha256((await assembleBios(source)).bytes);

test('the synthetic pair really does differ in text and agree in bytes', async () => {
    // If this fails every ordering test below is vacuous: the two commits would
    // not both reproduce the ROM, and preferring either would look correct.
    assert.notEqual(COMMENTED, REAL, 'the pair must differ, or one commit is not a candidate');
    assert.equal(await romShaOf(COMMENTED), await romShaOf(REAL),
        'the pair must assemble to the same ROM, or ordering is not what decides the answer');
});

test('the ROM is identified from an ancestor of the pin, not from a newer side branch', async () => {
    // Both sources are byte-identical, so BOTH commits reproduce the ROM. The
    // only thing that can decide the answer is the ordering under test.
    const repo = buildRepo({mainSources: [REAL], sideSource: COMMENTED});
    try {
        const want = await romShaOf(REAL);
        const pin = repo.mainShas[repo.mainShas.length - 1];
        const found = await identify(repo.dir, want, {pin, log: () => {}});
        assert.ok(found, 'no commit reproduced the ROM, so this test proves nothing');
        assert.equal(found.ancestor, true,
            `identify returned ${found.sha.slice(0, 9)}, which is not an ancestor of the pin`);
        assert.notEqual(found.sha, repo.sideSha,
            'identify returned the side-branch commit even though an ancestor reproduces the same bytes');
        assert.ok(repo.mainShas.includes(found.sha), 'the answer is not on the pinned line of history');
    } finally { repo.cleanup(); }
});

test('the newest matching commit still wins AMONG ancestors', async () => {
    // Preferring ancestors must not quietly become "prefer the oldest". Within
    // the ancestors the walk is still newest-first, which is what makes the
    // answer the most recent commit that can have produced the file.
    const repo = buildRepo({mainSources: [COMMENTED, REAL]});
    try {
        const want = await romShaOf(REAL);
        const pin = repo.mainShas[repo.mainShas.length - 1];
        const found = await identify(repo.dir, want, {pin, log: () => {}});
        assert.equal(found.sha, repo.mainShas[repo.mainShas.length - 1],
            'among equally valid ancestors the newest must be returned');
    } finally { repo.cleanup(); }
});

test('when NO ancestor reproduces the bytes the non-ancestor is reported and flagged', async () => {
    // THE REFUSAL IS NOT RELAXED. The caller refuses on `ancestor === false`, so
    // this is the case that must keep reaching it: the bytes are reproducible,
    // but only from a commit the pin does not carry.
    const repo = buildRepo({mainSources: [ALTERED], sideSource: REAL});
    try {
        const want = await romShaOf(REAL);
        const pin = repo.mainShas[repo.mainShas.length - 1];
        const found = await identify(repo.dir, want, {pin, log: () => {}});
        assert.ok(found, 'the side-branch commit reproduces the ROM and must still be found');
        assert.equal(found.sha, repo.sideSha);
        assert.equal(found.ancestor, false,
            'a non-ancestor reported as an ancestor would let the manifest name a commit the pin does not carry');
    } finally { repo.cleanup(); }
});

test('an unidentifiable ROM is still null, not the closest guess', async () => {
    const repo = buildRepo({mainSources: [ALTERED]});
    try {
        const want = await romShaOf(REAL);
        const found = await identify(repo.dir, want, {pin: repo.mainShas[0], log: () => {}});
        assert.equal(found, null, 'identify returned a commit whose source does not reproduce the ROM');
    } finally { repo.cleanup(); }
});

test('a checkout that does not contain the pin says so instead of calling everything a non-ancestor', async () => {
    // Ancestry against a commit the checkout lacks cannot be decided. Answering
    // it anyway marks every candidate a non-ancestor and produces a confident
    // refusal about nothing — so the search says it cannot order, and still
    // finds the ROM.
    const repo = buildRepo({mainSources: [REAL]});
    try {
        const want = await romShaOf(REAL);
        const lines = [];
        const absent = '0'.repeat(40);
        const found = await identify(repo.dir, want, {pin: absent, log: l => lines.push(l)});
        assert.ok(found, 'the ROM is reproducible here and must still be identified');
        assert.match(lines.join('\n'), /does not contain the pin/,
            'the inability to decide ancestry must be stated, not absorbed');
        assert.equal(found.ancestor, false,
            'an undecidable ancestry must not be reported as true');
    } finally { repo.cleanup(); }
});
