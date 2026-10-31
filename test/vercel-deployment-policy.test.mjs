import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {execFileSync, spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/deploy-daily.yml', 'utf8');

test('the actual publication shell selects validated history and refuses production races', () => {
    // Run the authored workflow step against real Git history. Only the external
    // validation verdict, live HTTP endpoint and Vercel service are fixture doubles;
    // candidate ordering, checkout, both ancestry checks and shell failures are real.
    const marker = '- name: Build and publish the newest validated main';
    const body = workflow.slice(workflow.indexOf(marker)).split('        run: |\n')[1];
    assert.ok(body, 'the publication step is present');
    const shell = body.trimEnd().split('\n').map(line => line.slice(10)).join('\n');
    const root = fs.mkdtempSync(join(tmpdir(), 'bw-vercel-policy-'));
    const git = (cwd, ...args) => execFileSync('/usr/bin/git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    try {
        const origin = join(root, 'origin.git'), seed = join(root, 'seed'), bin = join(root, 'bin');
        fs.mkdirSync(seed); fs.mkdirSync(bin);
        // The workflow and fixture scripts use the same selected Git and Node,
        // regardless of other tools installed on the machine running this test.
        fs.symlinkSync('/usr/bin/git', join(bin, 'git'));
        fs.symlinkSync(process.execPath, join(bin, 'node'));
        git(root, 'init', '--bare', '--initial-branch=main', origin);
        git(seed, 'init', '--initial-branch=main');
        git(seed, 'config', 'user.name', 'Publication test');
        git(seed, 'config', 'user.email', 'publication@example.invalid');
        git(seed, 'config', 'commit.gpgsign', 'false');
        fs.mkdirSync(join(seed, 'scripts'));
        fs.writeFileSync(join(seed, 'scripts/verify-vercel-main-checks.mjs'),
            'process.exit(process.env.BW_TEST_VALIDATED.split(",").includes(process.argv[2]) ? 0 : 1);\n');
        fs.writeFileSync(join(seed, 'scripts/verify-vercel-live-version.mjs'),
            'import fs from "node:fs"; process.exit(fs.readFileSync(process.env.BW_TEST_LIVE,"utf8").trim() === process.argv[2] ? 0 : 1);\n');
        const commits = [];
        for (let i = 0; i < 3; i++) {
            fs.writeFileSync(join(seed, 'version'), String(i));
            git(seed, 'add', 'scripts', 'version');
            git(seed, 'commit', '-qm', `version ${i}`);
            commits.push(git(seed, 'rev-parse', 'HEAD'));
        }
        git(seed, 'remote', 'add', 'origin', origin);
        git(seed, 'push', '-q', 'origin', 'main');
        fs.writeFileSync(join(bin, 'curl'), `#!/usr/bin/env node
const fs = require('node:fs');
console.log(JSON.stringify({commit: fs.readFileSync(process.env.BW_TEST_LIVE, 'utf8').trim()}));
`, {mode: 0o755});
        fs.writeFileSync(join(bin, 'vercel'), `#!/usr/bin/env node
const fs = require('node:fs'), cp = require('node:child_process');
const sha = cp.execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim();
fs.appendFileSync(process.env.BW_TEST_CALLS, process.argv[2] + ' ' + sha + '\\n');
if (process.argv[2] === 'build' && process.env.BW_TEST_MOVE_TO) fs.writeFileSync(process.env.BW_TEST_LIVE, process.env.BW_TEST_MOVE_TO);
if (process.argv[2] === 'deploy') fs.writeFileSync(process.env.BW_TEST_LIVE, sha);
`, {mode: 0o755});
        const [old, green, tip] = commits;
        const cases = [
            {name: 'pending tip', live: old, eligible: green, publish: green, status: 0},
            {name: 'already current', live: green, eligible: green, publish: null, status: 0},
            {name: 'unknown production lineage', live: 'f'.repeat(40), eligible: green, publish: null, status: 128},
            {name: 'newer production during build', live: old, eligible: green, move: tip, publish: null, status: 1},
            {name: 'ancestor production during build', live: old, eligible: tip, move: green, publish: tip, status: 0},
            {name: 'malformed production identity', live: 'bad', eligible: tip, publish: null, status: 1},
            // The membership check once piped rev-list into `grep -q` under pipefail, which
            // failed at random on SIGPIPE; repeat the scenario so a reintroduced race shows up.
            ...Array.from({length: 25}, (_, n) => ({name: `already current, repeat ${n}`, live: green, eligible: green, publish: null, status: 0}))
        ];
        for (const [i, scenario] of cases.entries()) {
            const checkout = join(root, `checkout-${i}`), live = join(root, `live-${i}`), calls = join(root, `calls-${i}`);
            git(root, 'clone', '-q', origin, checkout);
            fs.writeFileSync(live, scenario.live); fs.writeFileSync(calls, '');
            const run = spawnSync('/bin/bash', ['-c', shell], {cwd: checkout, encoding: 'utf8', timeout: 10000,
                env: {...process.env, PATH: `${bin}:/usr/bin:/bin`, GITHUB_RUN_ID: 'fixture', VERCEL_TOKEN: 'fixture',
                    BW_TEST_LIVE: live, BW_TEST_CALLS: calls, BW_TEST_VALIDATED: scenario.eligible,
                    BW_TEST_MOVE_TO: scenario.move || ''}});
            assert.equal(run.status, scenario.status, `${scenario.name}: ${run.stderr}\n${run.stdout}`);
            const published = fs.readFileSync(calls, 'utf8').split('\n').filter(line => line.startsWith('deploy '));
            assert.deepEqual(published, scenario.publish ? [`deploy ${scenario.publish}`] : [], scenario.name);
        }
    } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test('Vercel Git integration cannot deploy pushes or pull requests', () => {
    assert.equal(config.git?.deploymentEnabled, false);
    assert.equal('ignoreCommand' in config, false,
        'an ignored-build command still creates noisy automatic deployments');
    assert.equal(fs.existsSync('scripts/vercel-ignore.sh'), false,
        'the obsolete automatic-deployment workaround returned');
});

test('Vercel production deploy is validated main plus manual and nightly at 02:00 Berlin time', () => {
    assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
    assert.match(workflow, /^\s{2}schedule:\s*$/m);
    assert.match(workflow, /^\s{4}- cron: ['"]0 2 \* \* \*['"]\s*$/m);
    assert.match(workflow, /^\s{6}timezone: Europe\/Berlin\s*$/m);
    assert.doesNotMatch(workflow, /^\s{2}push:\s*$/m);
    assert.match(workflow, /workflows: \["Build \(permissive base\)", "debugger-focused", "vendor-freshness"\]/);
    assert.match(workflow, /workflow_run\.event == 'push'/);
    assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
    assert.match(workflow, /needs\.eligible\.outputs\.ready == 'true'/);
    assert.match(workflow, /--eligibility >> \"\$GITHUB_OUTPUT\"/);
    assert.match(workflow, /VALIDATED_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/,
        'eligibility judges the commit whose validation completed, not whatever main is by then');
    assert.match(workflow, /node scripts\/verify-vercel-main-checks\.mjs "\$local_sha"/);
    assert.match(workflow, /node scripts\/verify-vercel-live-version\.mjs "\$local_sha"/);
});

test('every Vercel production run publishes the newest validated main, never an older tree', () => {
    assert.match(workflow, /^\s{10}ref: main\s*$/m);
    assert.match(workflow, /vercel build --prod/);
    assert.match(workflow, /vercel deploy --prebuilt --prod/);
    assert.doesNotMatch(workflow, /git rev-list[^\n]*\|\s*grep -q/,
        'grep -q closes the pipe early, so under pipefail the check fails nondeterministically (SIGPIPE)');
    // Candidates come only from main's own first-parent history, newest first.
    assert.match(workflow, /git rev-list --first-parent --max-count=\d+ FETCH_HEAD/);
    // Production must never move backwards: what it serves must be an ancestor
    // of the target, checked before the build and again right before publishing.
    assert.match(workflow, /git merge-base --is-ancestor "\$live_sha" "\$target_sha"/);
    assert.match(workflow, /if git merge-base --is-ancestor "\$now_live" "\$local_sha" && \[ "\$now_live" != "\$local_sha" \]; then\s*\n\s*vercel deploy --prebuilt --prod/,
        'the production publish must be guarded by the post-build ancestry comparison');
    // Green means published or already current: a run that cannot validate any
    // recent main commit, or loses the race, fails.
    assert.match(workflow, /::error::no validated main commit found/);
    assert.match(workflow, /::error::production moved to/);
    assert.match(workflow, /\n\s*exit 1\s*$/m,
        'a run that never publishes must fail, so that green means published');
    // The adjacency check above pins THE guarded publish; it cannot see a
    // SECOND one. The publish site must stay unique.
    assert.equal((workflow.match(/vercel deploy --prebuilt --prod/g) || []).length, 1,
        'more than one production publish site — the guard above covers only the first');
    for (const secret of ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) {
        assert.match(workflow, new RegExp(`secrets\\.${secret}`));
    }
});

test('content-hashed bundles are immutable; everything that can change by name is not', () => {
    const rules = config.headers || [];
    const immutable = rules.filter(r => r.headers.some(h =>
        h.key === 'Cache-Control' && /immutable/.test(h.value)));
    assert.ok(immutable.length > 0, 'vercel.json has no immutable Cache-Control rule; every ' +
        'visit revalidates the 3.5 MB boot chunk under max-age=0');
    // The sources use no path-to-regexp params, so they are ordinary regexes.
    const matches = p => immutable.some(r => new RegExp(`^${r.source}$`).test(p));
    for (const hashed of ['/gui.94f22fbe.js', '/chunks/2923.d693e18ac4a80ef5ddd1.js',
        '/chunks/paint-editor.27b9d41482fe552a7c45.js', '/static/assets/icon.3f2a9c1b.svg']) {
        assert.ok(matches(hashed), `${hashed} should be cached immutably`);
    }
    for (const mutable of ['/', '/index.html', '/sw.js', '/chunks/bw-circuit-ui.js',
        '/chunks/ext-music.js', '/examples/index.json', '/static/emu8051.wasm']) {
        assert.ok(!matches(mutable), `${mutable} changes under its own name and must revalidate`);
    }
});

test('the Vercel production build is FLAG-ON, like the deployable GH Pages build', () => {
    const script = fs.readFileSync('scripts/vercel-build.sh', 'utf8');
    assert.match(script, /BW_ENABLE_FPGA=1[^\n]*npm run build/,
        'the deployed site must ship the FPGA surface (the settings toggle) — build.yml is flag-on and Vercel must match');
    assert.match(script, /@yowasp\/yosys/,
        'the in-browser local synthesis tier needs the real yosys package, not the absent-stub');
});

test('the Vercel production build ships the pinned MakeCode runtime, like the Pages build', () => {
    const script = fs.readFileSync('scripts/vercel-build.sh', 'utf8');
    const sync = script.indexOf('node scripts/sync-makecode-runtime.mjs');
    assert.ok(sync >= 0, 'without static/makecode/ every MakeCode share link fails with target.json: HTTP 404');
    assert.ok(script.indexOf('node scripts/integrate.mjs') < sync, 'integrate.mjs clears the synced runtime, so sync after it');
    assert.ok(sync < script.indexOf('npm run build'), 'webpack copies static/ into the build, so sync before it');
});
