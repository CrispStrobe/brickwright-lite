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
