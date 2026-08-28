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
