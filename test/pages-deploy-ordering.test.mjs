/**
 * The shape of build.yml that keeps Pages from publishing a mismatched tree,
 * pinned as a test instead of as a comment.
 *
 * ROADMAP §2.1 carries a warning paid for in downtime: a previous attempt at
 * the deploy-starvation fix **took the live site down**. The mechanism was a
 * per-JOB split. Artifact names are unique within a RUN, not across runs, so
 * two jobs of one run writing `github-pages` — or a deploy job resolving that
 * name while a sibling job was still uploading — publishes an `index.html` from
 * one tree beside chunks from another. That is what went out: an index naming
 * 404 chunks.
 *
 * The 2026-08-30 fix runs builds in PARALLEL (one concurrency group per commit,
 * so no push is cancelled while queued) and serializes only the deploy. That is
 * safe for one structural reason: separate RUNS cannot see each other's
 * artifacts. Each run's `github-pages` artifact is scoped to its own
 * GITHUB_RUN_ID and `deploy-pages` resolves it there.
 *
 * "Safe for a structural reason" is precisely the kind of belief that decays.
 * The working rules in ROADMAP say it: pin a belief as a test, or it stops
 * being re-established. So this file re-establishes it every run —
 *
 *   - exactly one upload of the Pages artifact, in the job that builds it;
 *   - the deploy job never downloads an artifact by name;
 *   - pushes are grouped per COMMIT, so a queued run is never cancelled;
 *   - the deploy carries the one shared group, and an ordering guard.
 *
 * The parsing is deliberately structural rather than a set of greps over the
 * whole file: `grep -c upload-pages-artifact` cannot tell which job a step is
 * in, and "which job" is the entire hazard.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = resolve(repo, '.github/workflows/build.yml');
const src = readFileSync(workflow, 'utf8');

/**
 * Split the file into `jobs:` blocks without a YAML parser.
 *
 * There is no yaml package on the root import path in CI (the root install is
 * `npm install --no-save playwright`), and adding one to reach four facts about
 * a file with a fixed layout is a dependency for the sake of elegance. The
 * layout is regular: `jobs:` at column 0, job ids at column 2, everything else
 * deeper. The parse asserts what it found before anything is concluded from it.
 */
function jobs () {
    const lines = src.split('\n');
    const start = lines.findIndex((l) => l === 'jobs:');
    assert.ok(start >= 0, 'build.yml has no top-level `jobs:` — the parse is wrong, not the file');
    const found = new Map();
    let current = null;
    for (let i = start + 1; i < lines.length; i++) {
        const line = lines[i];
        if (/^\S/.test(line) && line.trim() !== '') break;   // left the jobs block
        const head = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(line);
        if (head) {
            current = head[1];
            found.set(current, []);
        } else if (current) {
            found.get(current).push(line);
        }
    }
    return new Map([...found].map(([k, v]) => [k, v.join('\n')]));
}

const JOBS = jobs();

test('the parse found the jobs it is about to reason over', () => {
    // Instrument before subject. A parse that silently matched nothing turns
    // every assertion below into a clean sweep over an empty set, which is the
    // best possible news from the worst possible cause.
    for (const id of ['build', 'deploy', 'verify-gui']) {
        assert.ok(JOBS.has(id), `build.yml has no \`${id}\` job (parsed: ${[...JOBS.keys()].join(', ')})`);
    }
    assert.ok(JOBS.get('build').length > 2000,
        'the `build` job parsed as almost nothing — the block splitter is broken');
});

test('the Pages artifact is uploaded exactly once, by the job that built it', () => {
    const uploads = [...JOBS].filter(([, body]) => body.includes('upload-pages-artifact'));
    assert.deepEqual(uploads.map(([id]) => id), ['build'],
        'the Pages artifact must be uploaded by exactly one job, and it must be the job ' +
        'that produced the tree. Two jobs of one run writing `github-pages` is how an ' +
        'index.html from one tree got published beside chunks from another.');
    const count = (JOBS.get('build').match(/upload-pages-artifact/g) || []).length;
    assert.equal(count, 1, `the build job uploads the Pages artifact ${count} times; it must be once`);
});

test('the deploy job never resolves an artifact by name', () => {
    const deploy = JOBS.get('deploy');
    assert.ok(!/download-artifact/.test(deploy),
        'the deploy job downloads an artifact. `deploy-pages` takes the artifact from its ' +
        'OWN run; fetching one by name is the cross-run lookup that can pick up a different ' +
        'tree, and it is the shape that took the site down.');
    assert.ok(!/upload-pages-artifact/.test(deploy),
        'the deploy job uploads a Pages artifact — the build and the upload must stay together');
    // `needs: build` or `needs: [build, corpus]` — the corpus job (the lesson walks,
    // split out of build on 2026-09-05) is a second gate on publication, not a
    // second producer: the artifact still comes from `build` alone.
    assert.match(deploy, /needs:\s*(?:build|\[\s*build\b[^\]]*\])/,
        'the deploy job must depend on the build job that produced its artifact');
});

test('a push to main is never cancelled while queued', () => {
    const top = src.slice(0, src.indexOf('\njobs:'));
    const group = /^concurrency:\n\s+group:\s*(.+)$/m.exec(top);
    assert.ok(group, 'build.yml has no top-level concurrency group');
    assert.match(group[1], /github\.sha/,
        'the push side of the concurrency group must be keyed on the COMMIT. Keyed on the ' +
        'ref, all of main shares one group and GitHub holds exactly one pending entry: a ' +
        'third push cancels the second while it is still queued. Measured over the 200 most ' +
        'recent main runs, 62 were cancelled with ZERO JOBS — no runner, no verdict.');
});

test('the deploy is serialized and refuses to publish an older tree', () => {
    const deploy = JOBS.get('deploy');
    // Anchored to end-of-line on purpose. `pages-deploy-${{ github.sha }}` is a
    // per-commit group wearing the shared group's name, and it serializes
    // nothing; a prefix match calls it compliant. Found by mutating this test.
    assert.match(deploy, /concurrency:\n\s+group:\s*pages-deploy\s*$/m,
        'the deploy job must carry the shared concurrency group. Serializing publication is ' +
        'the part that was always required; serializing validation is the part that starved ' +
        'the queue.');
    assert.match(deploy, /deployments:\s*read/,
        'the ordering guard reads the github-pages deployment history and needs the scope');

    // The guard, and the two things it must not lose. Filtering our own sha is
    // not a refinement: `environment: github-pages` creates this job's own
    // deployment record before any step runs, so an unfiltered guard reads
    // itself, concludes it is current, and republishes an older tree. That was
    // measured in the scratch repo, and it moved a live site backwards.
    assert.match(deploy, /select\(\.sha\s*!=\s*\$ours\)/,
        'the ordering guard must exclude this job\'s OWN deployment record, which GitHub ' +
        'creates when the job starts. Without the filter it reads itself and always deploys.');
    assert.match(deploy, /if:\s*steps\.order\.outputs\.stale\s*!=\s*'true'/,
        'the deploy step must be gated on the ordering guard, or the guard is a log line');
});

test('the post-deploy smoke test only runs when this run published', () => {
    const verify = JOBS.get('verify-gui');
    assert.match(verify, /needs\.deploy\.outputs\.deployed\s*==\s*'true'/,
        'verify-gui smoke-tests the LIVE site. When this run stood down for a newer commit, ' +
        'the live site is somebody else\'s tree, and the verdict would be attributed to ours.');
});
