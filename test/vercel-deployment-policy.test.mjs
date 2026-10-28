import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/deploy-daily.yml', 'utf8');

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
