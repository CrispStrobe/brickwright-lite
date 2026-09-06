/**
 * The browser job is one body run as a matrix of shards, and the shard each
 * gate belongs to is the `matrix.shard == '<name>'` clause in its own `if:`.
 * That clause is the only list. This test holds that the clauses PARTITION
 * the gates — every gate in exactly one existing shard, no shard empty, every
 * companion step (upload, follow-up) on its gate's shard — and that the audit
 * step reads the same partition inside the job.
 *
 * Why (2026-09-06): in series the 41 gates took 13–15 min while build took
 * 5.5 and corpus 2.2, so the run's verdict waited ~8 min on this job. Two
 * shards near 7 min each. What sharding can newly get wrong: a gate with no
 * clause runs in every shard (and upload-artifact v4 refuses the second
 * artifact of a name); a clause naming a shard the matrix lacks never runs and
 * stays green. Both are failed here by name, and again by the audit from the
 * checked-out workflow, so a workflow edit that dodges the unit tests still
 * fails in the job. lego-be's review question, answered in code.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {parseJobs, partition, gateJob, shardsOf, isBrowserStep, SERVE_STEP, AUDIT_STEP} from '../scripts/lib/workflow-gates.mjs';
import {expectedForShard} from '../scripts/audit-job-steps.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const yml = readFileSync(process.env.BW_BUILD_YML || path.join(ROOT, '.github/workflows/build.yml'), 'utf8');
const jobs = parseJobs(yml);
const job = gateJob(jobs);

test('the job holding the gates is a matrix of at least two named shards, fail-fast off, named for the audit', () => {
    assert.ok(job, 'exactly one job body holds the browser gates');
    assert.ok(job.shards.length >= 2, `matrix.shard lists ${JSON.stringify(job.shards)} — sharding needs at least two`);
    assert.equal(new Set(job.shards).size, job.shards.length, 'shard names are distinct');
    const body = yml.slice(yml.indexOf(`\n  ${job.id}:\n`), yml.indexOf('\n    steps:', yml.indexOf(`\n  ${job.id}:\n`)));
    assert.match(body, /fail-fast:\s*false/, 'fail-fast must be off: a red shard cancelling the other reports it as "cancelled" — the signal this fleet misread for a day — and leaves its gates neither run nor cleanly skipped for the audit');
    assert.equal(job.name, `${job.id} (\${{ matrix.shard }})`, 'the leg\'s display name must be explicit and carry the shard, because the API reports the display name and GITHUB_JOB stays the id for every leg');
});

test('the shard clauses partition the gates: each in exactly one existing shard, no shard empty', () => {
    const p = partition(jobs);
    assert.deepEqual(p.unassigned, [], 'gate(s) with NO shard clause — they would run in every shard:\n  ' + p.unassigned.join('\n  '));
    assert.deepEqual(p.multi, [], 'gate(s) with more than one shard clause:\n  ' + p.multi.join('\n  '));
    assert.deepEqual(p.unknownShard, [], 'gate(s) naming a shard the matrix lacks — they would never run and stay green:\n  ' + p.unknownShard.join('\n  '));
    assert.deepEqual(p.emptyShards, [], 'shard(s) with no gates: ' + p.emptyShards.join(', '));
    const total = [...p.byShard.values()].reduce((n, g) => n + g.length, 0);
    const gates = job.steps.filter(s => isBrowserStep(s.name)).length;
    assert.equal(total, gates, 'every gate is counted exactly once across the shards');
    assert.ok(gates >= 30, `only ${gates} gates parsed — the parse is wrong before anything is concluded`);
});

test('every companion step after a gate is on that gate\'s shard, so its upload cannot collide across legs', () => {
    const p = partition(jobs);
    assert.deepEqual(p.companionMismatch, [], 'companion step(s) whose clause differs from the gate they follow:\n  ' + p.companionMismatch.join('\n  '));
});

test('the setup steps carry no shard clause (every leg builds and serves for itself) and the pre-serve gate keeps its place', () => {
    const serveAt = job.steps.findIndex(s => s.name === SERVE_STEP);
    assert.ok(serveAt > 0, 'the serve step exists');
    for (const s of job.steps.slice(0, serveAt)) {
        if (isBrowserStep(s.name)) continue;
        assert.deepEqual(shardsOf(s), [], `setup step "${s.name || 'line ' + s.line}" carries a shard clause — every leg needs install, build, playwright and serve`);
    }
    // lego-be: the native-broker gate is the only one that runs BEFORE serve and must stay there.
    const native = job.steps.findIndex(s => s.name === 'Browser gate — native broker packaged assets');
    assert.ok(native >= 0 && native < serveAt, 'the native broker packaged-assets gate runs before the serve step');
});

test('the audit is the last step, always(), told its leg\'s display name and shard, and reads the same partition', () => {
    const named = job.steps.filter(s => s.name);
    const last = named[named.length - 1];
    assert.equal(last.name, AUDIT_STEP);
    assert.equal(last.ifs, 'always()');
    const auditBlock = yml.slice(yml.indexOf(`- name: ${AUDIT_STEP}`));
    assert.match(auditBlock, /BW_JOB_NAME:\s*browser \(\$\{\{ matrix\.shard \}\}\)/, 'the audit must be handed the leg display name');
    assert.match(auditBlock, /audit-job-steps\.mjs --shard \$\{\{ matrix\.shard \}\}/, 'the audit must be told which shard it is');
    for (const shard of job.shards) {
        const e = expectedForShard(yml, shard);
        assert.ok(e.ok, `the audit's own partition check fails for ${shard}:\n  ${e.problems.join('\n  ')}`);
        assert.ok(e.mine.length > 0 && e.others.length > 0);
    }
});

test('the naming convention the whole apparatus rests on is itself asserted: every step that starts "Browser" is a gate by the em-dash pattern', () => {
    // A gate can leave every check here in two ways nothing else can see:
    // deleted from the body, or renamed out of /^Browser (gates?|benchmark) — /
    // (a hyphen, an en-dash) — after which partition() takes it for a companion
    // and, if it carries the clause of the gate above, accepts it silently. The
    // deletion half is stated, not fixed (an orphan check would need a curated
    // list of scripts that belong to other workflows — a second list, which the
    // matrix form exists to avoid). The rename half is closed here.
    const lookalikes = job.steps.filter(s => /^Browser\b/.test(s.name) && !isBrowserStep(s.name)).map(s => `line ${s.line}: ${s.name}`);
    assert.deepEqual(lookalikes, [], 'step(s) named like a gate but outside the gate pattern — not audited, not budgeted, not partitioned:\n  ' + lookalikes.join('\n  '));
    assert.equal(isBrowserStep('Browser gate - hyphen'), false);
    assert.equal(isBrowserStep('Browser gate – en dash'), false);
    assert.equal(isBrowserStep('Browser gate — em dash'), true);
});

test('a companion of the PRE-serve gate is checked too (synthetic workflow)', () => {
    const mini = [
        'jobs:', '  browser:', '    strategy:', '      matrix:', '        shard: [a, b]', '    steps:',
        '      - name: Browser gate — before serve', "        if: ${{ matrix.shard == 'a' }}",
        '      - uses: actions/upload-artifact@x', '        if: always()',
        '      - name: Serve the built app', '      - name: Browser gate — after', "        if: ${{ matrix.shard == 'b' }}",
        '      - name: Audit — every browser gate ran', '        if: always()', ''
    ].join('\n');
    const p = partition(parseJobs(mini));
    assert.deepEqual(p.unassigned, []);
    assert.equal(p.companionMismatch.length, 1, JSON.stringify(p.companionMismatch));
    assert.match(p.companionMismatch[0], /after a a gate carries \[no clause\]/);
});

test('the invariants can fail, each by name (mutation)', () => {
    const gateName = 'Browser gate — circuit UX';
    const at = yml.indexOf(`- name: ${gateName}\n`);
    assert.ok(at > 0);
    const block = yml.slice(at, yml.indexOf('\n      - ', at + 1));
    // a. drop the clause → unassigned
    const noClause = yml.replace(block, block.replace(/ && matrix\.shard == '[a-z]+'/, ''));
    assert.notEqual(noClause, yml);
    assert.deepEqual(partition(parseJobs(noClause)).unassigned, [gateName]);
    // b. name a shard the matrix lacks → unknownShard
    const ghost = yml.replace(block, block.replace(/matrix\.shard == '[a-z]+'/, "matrix.shard == 'ghost'"));
    assert.deepEqual(partition(parseJobs(ghost)).unknownShard, [`${gateName} (ghost)`]);
    // c. two clauses → multi
    const twice = yml.replace(block, block.replace(/matrix\.shard == '([a-z]+)'/, "matrix.shard == '$1' && matrix.shard == 'light'"));
    assert.deepEqual(partition(parseJobs(twice)).multi.map(m => m.split(' (')[0]), [gateName]);
    // d. every heavy gate moved to light → the heavy shard is empty
    const allLight = yml.replace(/matrix\.shard == 'heavy'/g, "matrix.shard == 'light'");
    assert.deepEqual(partition(parseJobs(allLight)).emptyShards, ['heavy']);
    // e. a companion on the wrong shard
    const uploadAt = yml.indexOf("if: always() && steps.playwright.outcome == 'success' && matrix.shard == 'heavy'");
    assert.ok(uploadAt > 0, 'a heavy companion upload exists to mutate');
    const wrongCompanion = yml.slice(0, uploadAt) + "if: always() && steps.playwright.outcome == 'success' && matrix.shard == 'light'" + yml.slice(uploadAt + "if: always() && steps.playwright.outcome == 'success' && matrix.shard == 'heavy'".length);
    assert.equal(partition(parseJobs(wrongCompanion)).companionMismatch.length, 1);
    // f. the audit sees each of them as a workflow defect, before judging steps
    assert.equal(expectedForShard(noClause, 'heavy').ok, false);
    assert.match(expectedForShard(ghost, 'light').problems.join('\n'), /never run/);
});
