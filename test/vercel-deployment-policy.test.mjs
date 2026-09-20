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

test('Vercel production deploy is manual plus nightly at 02:00 Berlin time', () => {
    assert.match(workflow, /^\s{2}workflow_dispatch:\s*$/m);
    assert.match(workflow, /^\s{2}schedule:\s*$/m);
    assert.match(workflow, /^\s{4}- cron: ['"]0 2 \* \* \*['"]\s*$/m);
    assert.match(workflow, /^\s{6}timezone: Europe\/Berlin\s*$/m);
    assert.doesNotMatch(workflow, /^\s{2}push:\s*$/m);
});

test('every Vercel production run deploys the current main checkout', () => {
    assert.match(workflow, /^\s{10}ref: main\s*$/m);
    assert.match(workflow, /vercel build --prod/);
    assert.match(workflow, /vercel deploy --prebuilt --prod/);
    assert.match(workflow, /git ls-remote origin refs\/heads\/main/,
        'main can advance during the build, so freshness must be checked immediately before publication');
    // The verdict used to be a step output consumed by `if:`. It is now an
    // inline comparison inside a retry loop, because a single attempt that
    // skipped the publish still exited 0 -- on 2026-09-20 three dispatches in
    // a row published nothing and all reported success. What the policy
    // actually requires is unchanged and asserted here directly: the publish
    // must be guarded by the post-build comparison, never reached otherwise.
    assert.match(workflow, /if \[ "\$local_sha" = "\$remote_sha" \]; then\s*\n\s*vercel deploy --prebuilt --prod/,
        'the production publish must be guarded by the post-build freshness comparison');
    // And the gap that let a skip masquerade as a deploy: a run that never
    // wins the race must fail, not exit 0 having published nothing.
    assert.match(workflow, /::error::main advanced during all/,
        'a run that never publishes must say so as an error');
    assert.match(workflow, /\n\s*exit 1\s*$/m,
        'a run that never publishes must fail, so that green means published');
    // The adjacency check above pins THE guarded publish; it cannot see a
    // SECOND one. An unguarded `vercel deploy` added elsewhere in this job —
    // a fallback after the loop, say — would satisfy every assertion above
    // while shipping exactly the stale tree the comparison exists to stop.
    // So the publish site is required to be unique, which is what makes
    // "published" imply "guarded" rather than only "guarded somewhere".
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
