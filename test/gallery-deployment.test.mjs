import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveGalleryDeployment, assertSameGalleryDeployment, galleryApiGraphql, galleryApiJson, GALLERY_DEPLOYMENT_QUERY} from '../scripts/gallery-deployment.mjs';
import {explainDifference} from '../scripts/sync-gallery-pins.mjs';

const repo = 'CrispStrobe/extensions';
const api = `https://api.github.com/repos/${repo}`;
const base = 'https://crispstrobe.github.io/extensions/';
const sha = digit => digit.repeat(40);
const deployment = (id, source) => ({id, node_id: `deployment-${id}`, sha: source, ref: 'main', task: 'deploy',
    environment: 'github-pages', original_environment: 'github-pages', repository_url: api,
    url: `${api}/deployments/${id}`, statuses_url: `${api}/deployments/${id}/statuses`});
const status = (deployment, state, day = '13') => ({id: deployment.id * 10, node_id: `status-${deployment.id}`, state,
    deployment_url: deployment.url, repository_url: api, environment: 'github-pages',
    environment_url: base, created_at: `2026-10-${day}T09:28:18Z`, updated_at: `2026-10-${day}T09:28:18Z`,
    log_url: `https://github.com/${repo}/actions/runs/${deployment.id}/job/${deployment.id + 100}`});
const run = deployment => ({id: deployment.id, head_sha: deployment.sha, head_branch: 'main',
    repository: {full_name: repo}, path: '.github/workflows/deploy.yml', event: 'push',
    status: 'completed', conclusion: 'success', run_attempt: 1,
    html_url: `https://github.com/${repo}/actions/runs/${deployment.id}`});

const job = deployment => ({id: deployment.id + 100, run_id: deployment.id, run_attempt: 1,
    head_sha: deployment.sha, html_url: status(deployment, 'success').log_url, name: 'deploy',
    status: 'completed', conclusion: 'success',
    steps: [{name: 'Deploy to GitHub Pages', status: 'completed', conclusion: 'success'}]});

function fixture (rows, statuses = rows.map(row => [status(row, 'success')])) {
    const responses = new Map([[`${api}/deployments?environment=github-pages&ref=main&per_page=100&page=1`, rows]]);
    for (const [index, row] of rows.entries()) {
        responses.set(row.url, row);
        responses.set(`${row.statuses_url}?per_page=1`, statuses[index]);
        responses.set(`${api}/actions/runs/${row.id}`, run(row));
        responses.set(`${api}/actions/jobs/${row.id + 100}`, job(row));
    }
    const calls = [];
    return {responses, calls, options: {repo, base, getGraphql: async variables => {
        calls.push('https://api.github.com/graphql');
        const page = variables.after ? Number(variables.after) + 1 : 1;
        const rows = responses.get(`${api}/deployments?environment=github-pages&ref=main&per_page=100&page=${page}`);
        assert.ok(rows, `unexpected GraphQL page ${page}`);
        return {data: {repository: {nameWithOwner: repo, deployments: {
            pageInfo: {hasNextPage: rows.length === 100, endCursor: String(page)},
            nodes: rows.map(row => {
                const latest = responses.get(`${row.statuses_url}?per_page=1`)?.[0];
                return {id: row.node_id, databaseId: row.id, commitOid: row.sha, ref: {name: row.ref},
                    environment: row.environment, originalEnvironment: row.original_environment, task: row.task,
                    latestStatus: latest ? {id: latest.node_id, state: latest.state.toUpperCase(),
                        environment: latest.environment, environmentUrl: latest.environment_url,
                        createdAt: latest.created_at, updatedAt: latest.updated_at, logUrl: latest.log_url} : null};
            })
        }}}};
    }, getJson: async url => {
        calls.push(url);
        assert.ok(responses.has(url), `unexpected request: ${url}`);
        const value = responses.get(url);
        if (value instanceof Error) throw value;
        return structuredClone(value);
    }}};
}

test('queued main replacement keeps the actually successful deployed source', async () => {
    const newer = deployment(2, sha('b')); const deployed = deployment(1, sha('a'));
    const f = fixture([newer, deployed], [[status(newer, 'queued')], [status(deployed, 'success')]]);
    const result = await resolveGalleryDeployment(f.options);
    assert.equal(result.sha, deployed.sha);
    assert.equal(result.deploymentId, 1);
    assert.equal(result.statusId, 10);
    assert.equal(result.runUrl, run(deployed).html_url);
    assert.equal(result.jobApiUrl, `${api}/actions/jobs/${deployed.id + 100}`);
    assert.equal(result.authority, 'public-deployment-status-and-successful-pages-job');
    assert.ok(!f.calls.some(url => url.includes('/pages/')));
    assert.ok(!f.calls.some(url => url.includes('/pages/builds')));
    assert.ok(!f.calls.some(url => url.includes('/commits/main')));
});

test('completion timestamp outranks deployment creation/listing order and persistent successes', async () => {
    const newer = deployment(2, sha('b')); const older = deployment(1, sha('a'));
    const f = fixture([newer, older], [[status(newer, 'success', '12')], [status(older, 'success', '13')]]);
    assert.equal((await resolveGalleryDeployment(f.options)).sha, older.sha);
});

for (const state of ['queued', 'pending', 'waiting', 'in_progress', 'failure', 'error', 'inactive']) {
    test(`latest ${state} is never promoted by historical success`, async () => {
        const row = deployment(1, sha('a'));
        const f = fixture([row], [[status(row, state)]]);
        await assert.rejects(resolveGalleryDeployment(f.options), /no completed successful/);
    });
}

test('new deployment without status is not a completion; missing all success refuses', async () => {
    const row = deployment(1, sha('a'));
    const f = fixture([row], [[]]);
    await assert.rejects(resolveGalleryDeployment(f.options), /no completed successful/);
});

test('invalid identity, status and run receipts fail closed', async t => {
    for (const [label, mutate] of [
        ['SHA', f => f.responses.values().next().value[0].sha = 'abc'],
        ['ref', f => f.responses.values().next().value[0].ref = 'gh-pages'],
        ['environment', f => f.responses.values().next().value[0].environment = 'evil'],
        ['repository', f => f.responses.values().next().value[0].repository_url = 'https://api.github.com/repos/other/gallery'],
        ['task', f => f.responses.values().next().value[0].task = 'other'],
        ['statuses URL', f => f.responses.values().next().value[0].statuses_url = 'https://evil.example/status'],
        ['status identity', f => f.responses.get(`${api}/deployments/1/statuses?per_page=1`)[0].deployment_url = `${api}/deployments/2`],
        ['timestamp', f => f.responses.get(`${api}/deployments/1/statuses?per_page=1`)[0].updated_at = 'yesterday'],
        ['site URL', f => f.responses.get(`${api}/deployments/1/statuses?per_page=1`)[0].environment_url = 'https://evil.example/'],
        ['run URL', f => f.responses.get(`${api}/deployments/1/statuses?per_page=1`)[0].log_url = 'https://github.com/other/gallery/actions/runs/1/job/101'],
        ['run source', f => f.responses.get(`${api}/actions/runs/1`).head_sha = sha('b')],
        ['run workflow', f => f.responses.get(`${api}/actions/runs/1`).path = '.github/workflows/unreviewed.yml'],
        ['run conclusion', f => f.responses.get(`${api}/actions/runs/1`).conclusion = 'failure'],
        ['run repository', f => f.responses.get(`${api}/actions/runs/1`).repository.full_name = 'other/gallery'],
        ['run event', f => f.responses.get(`${api}/actions/runs/1`).event = 'pull_request'],
        ['job conclusion', f => f.responses.get(`${api}/actions/jobs/101`).conclusion = 'failure'],
        ['job source', f => f.responses.get(`${api}/actions/jobs/101`).head_sha = sha('b')],
        ['job run', f => f.responses.get(`${api}/actions/jobs/101`).run_id = 2],
        ['job attempt', f => f.responses.get(`${api}/actions/jobs/101`).run_attempt = 2],
        ['job URL', f => f.responses.get(`${api}/actions/jobs/101`).html_url = 'https://evil.example/job'],
        ['job profile', f => f.responses.get(`${api}/actions/jobs/101`).name = 'build'],
        ['Pages step missing', f => f.responses.get(`${api}/actions/jobs/101`).steps = []],
        ['Pages step failure', f => f.responses.get(`${api}/actions/jobs/101`).steps[0].conclusion = 'failure'],
        ['Pages step duplicate', f => f.responses.get(`${api}/actions/jobs/101`).steps.push(f.responses.get(`${api}/actions/jobs/101`).steps[0])],
        ['permissions failure', f => f.responses.set(`${api}/actions/runs/1`, Error('HTTP403 permissions'))]
    ]) {
        await t.test(label, async () => {
            const f = fixture([deployment(1, sha('a'))]); mutate(f);
            await assert.rejects(resolveGalleryDeployment(f.options));
        });
    }
});

test('ambiguous completion timestamps and incomplete pagination refuse', async () => {
    const f = fixture([deployment(1, sha('a')), deployment(2, sha('b'))]);
    await assert.rejects(resolveGalleryDeployment(f.options), /ambiguous/);
    const rows = Array.from({length: 100}, (_, i) => deployment(i + 1, sha('a')));
    const full = fixture(rows);
    await assert.rejects(resolveGalleryDeployment({...full.options, maxPages: 1}), /pagination limit/);
});

test('pagination is consumed completely rather than admitting page one', async () => {
    const rows = Array.from({length: 100}, (_, i) => deployment(i + 2, sha('b')));
    const old = deployment(1, sha('a'));
    const f = fixture(rows, rows.map(row => [status(row, 'failure', '12')]));
    f.responses.set(`${api}/deployments?environment=github-pages&ref=main&per_page=100&page=2`, [old]);
    f.responses.set(old.url, old);
    f.responses.set(`${old.statuses_url}?per_page=1`, [status(old, 'success')]);
    f.responses.set(`${api}/actions/runs/1`, run(old));
    f.responses.set(`${api}/actions/jobs/${old.id + 100}`, job(old));
    assert.equal((await resolveGalleryDeployment(f.options)).deploymentId, 1);
});

test('changed deployment authority refuses the whole measurement', async () => {
    const before = await resolveGalleryDeployment(fixture([deployment(1, sha('a'))]).options);
    assertSameGalleryDeployment(before, {...before});
    for (const [key, value] of Object.entries({sha: sha('b'), deploymentId: 2, statusId: 11,
        runId: 2, runAttempt: 2, jobId: 102, authority: 'other', completedAt: '2026-10-14T00:00:00Z'})) {
        assert.throws(() => assertSameGalleryDeployment(before, {...before, [key]: value}), /mixed snapshot/);
    }
});

test('deployed-source selection retains exact-body refusal for mixed CDN source', async () => {
    const deployedSource = Buffer.from('const mode = "old";\n');
    const newerSource = Buffer.from('const mode = "new";\n');
    assert.equal(explainDifference(deployedSource, deployedSource).ok, true);
    assert.equal(explainDifference(deployedSource, newerSource).ok, false);
    assert.equal(explainDifference(deployedSource, Buffer.from('const mode;\n')).ok, false);
});


test('partial GraphQL responses, wrong repository and cursor loops cannot omit candidates', async () => {
    const f = fixture([deployment(1, sha('a'))]);
    for (const result of [
        {errors: [{message: 'permission denied'}], data: {repository: {nameWithOwner: repo}}},
        {data: {repository: {nameWithOwner: 'other/gallery'}}},
        {data: {repository: {nameWithOwner: repo, deployments: {nodes: [], pageInfo: {hasNextPage: true, endCursor: null}}}}}
    ]) await assert.rejects(resolveGalleryDeployment({...f.options, getGraphql: async () => result}));
    await assert.rejects(resolveGalleryDeployment({...f.options, getGraphql: async () => ({data: {
        repository: {nameWithOwner: repo, deployments: {nodes: [], pageInfo: {hasNextPage: true, endCursor: 'same'}}}
    }})}), /repeated/);
});

test('selected REST status must be the same current status from the full GraphQL census', async () => {
    const f = fixture([deployment(1, sha('a'))]);
    const getJson = f.options.getJson;
    await assert.rejects(resolveGalleryDeployment({...f.options, getJson: async url => {
        const result = await getJson(url);
        if (url.includes('/statuses?')) result[0].node_id = 'another-current-status';
        return result;
    }}), /changed or differs/);
});


test('API transports use authenticated fixed endpoints and keep GraphQL errors visible', async t => {
    const priorGitHub = process.env.GITHUB_TOKEN;
    const priorGh = process.env.GH_TOKEN;
    process.env.GITHUB_TOKEN = 'test-placeholder';
    delete process.env.GH_TOKEN;
    const requests = [];
    const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
        requests.push({url, options});
        return {ok: true, json: async () => ({errors: [{message: 'partial denied'}]})};
    });
    try {
        const variables = {owner: 'CrispStrobe', name: 'extensions', environment: 'github-pages', after: null};
        assert.deepEqual(await galleryApiGraphql(variables), {errors: [{message: 'partial denied'}]});
        assert.equal(requests[0].url, 'https://api.github.com/graphql');
        assert.equal(requests[0].options.method, 'POST');
        assert.equal(requests[0].options.headers.authorization, 'Bearer test-placeholder');
        assert.deepEqual(JSON.parse(requests[0].options.body), {query: GALLERY_DEPLOYMENT_QUERY, variables});
        await galleryApiJson(`${api}/actions/jobs/101`);
        assert.equal(requests[1].options.headers.authorization, 'Bearer test-placeholder');
        fetch.mock.mockImplementation(async () => ({ok: false, status: 403}));
        await assert.rejects(galleryApiGraphql(variables), /GraphQL HTTP 403/);
    } finally {
        if (priorGitHub === undefined) delete process.env.GITHUB_TOKEN;
        else process.env.GITHUB_TOKEN = priorGitHub;
        if (priorGh === undefined) delete process.env.GH_TOKEN;
        else process.env.GH_TOKEN = priorGh;
    }
});
