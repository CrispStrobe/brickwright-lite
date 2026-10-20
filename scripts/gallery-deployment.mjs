// The gallery is built by the owned Deploy workflow, not the legacy Pages
// branch builder. Resolve the last completed successful deployment; main can
// advance while its replacement build is queued. CDN bytes still have to pass
// the caller's immutable-source attestation.
// Primary API contracts:
// https://docs.github.com/en/graphql/reference/deployments
// https://docs.github.com/en/graphql/reference/repos
// https://docs.github.com/en/rest/deployments/deployments
// https://docs.github.com/en/rest/deployments/statuses
// https://docs.github.com/en/rest/actions/workflow-jobs#get-a-job-for-a-workflow-run
import {fetchRetry, FULL_SHA} from './lib-pin.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const API = 'https://api.github.com';
const execFileP = promisify(execFile);
let localToken;
const githubToken = async () => {
    const supplied = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (supplied) return supplied;
    // Capture the existing local gh login; never echo credentials or include
    // gh output in diagnostics. Hosted jobs provide GITHUB_TOKEN directly.
    localToken ||= execFileP('gh', ['auth', 'token'], {maxBuffer: 16 * 1024})
        .then(({stdout}) => {
            const token = stdout.trim();
            if (!token) throw new Error('missing token');
            return token;
        }).catch(() => { throw new Error('gallery deployment requires GITHUB_TOKEN, GH_TOKEN or an authenticated gh login'); });
    return localToken;
};
const timestamp = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) ||
        !Number.isFinite(Date.parse(value))) throw new Error('invalid deployment status timestamp');
    return Date.parse(value);
};
const id = value => Number.isSafeInteger(value) && value > 0;

export async function galleryApiJson (url) {
    const headers = {accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
    headers.authorization = `Bearer ${await githubToken()}`;
    return (await fetchRetry(url, {headers})).json();
}

export const GALLERY_DEPLOYMENT_QUERY = `query GalleryDeployment($owner:String!,$name:String!,
    $environment:String!,$after:String) {
    repository(owner:$owner,name:$name) {
        nameWithOwner
        deployments(first:100,environments:[$environment],after:$after,
            orderBy:{field:CREATED_AT,direction:DESC}) {
            pageInfo {hasNextPage endCursor}
            nodes {id databaseId commitOid environment originalEnvironment task ref {name}
                latestStatus {id state createdAt updatedAt environment environmentUrl logUrl}}
        }
    }
}`;

export async function galleryApiGraphql (variables) {
    const token = await githubToken();
    const response = await fetch(`${API}/graphql`, {
        method: 'POST', headers: {accept: 'application/vnd.github+json',
            'content-type': 'application/json', authorization: `Bearer ${token}`},
        body: JSON.stringify({query: GALLERY_DEPLOYMENT_QUERY, variables})
    });
    if (!response.ok) throw new Error(`gallery deployment GraphQL HTTP ${response.status}`);
    return response.json();
}

export async function resolveGalleryDeployment ({repo, base, ref = 'main',
    environment = 'github-pages', workflow = '.github/workflows/deploy.yml',
    getJson = galleryApiJson, getGraphql = galleryApiGraphql, maxPages = 10} = {}) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') ||
        !Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error('invalid gallery deployment policy');
    const repositoryUrl = `${API}/repos/${repo}`;
    const [owner, name] = repo.split('/');
    const deployments = [];
    const cursors = new Set();
    let after = null;
    let complete = false;
    for (let page = 1; page <= maxPages; page++) {
        const result = await getGraphql({owner, name, environment, after});
        if (result.errors?.length || result.data?.repository?.nameWithOwner !== repo) {
            throw new Error('gallery deployment GraphQL errors or repository identity mismatch');
        }
        const connection = result.data.repository.deployments;
        if (!Array.isArray(connection?.nodes) || connection.nodes.length > 100 ||
            typeof connection.pageInfo?.hasNextPage !== 'boolean') {
            throw new Error('invalid gallery deployment GraphQL connection');
        }
        for (const row of connection.nodes) {
            if (!row || !id(row.databaseId) || typeof row.id !== 'string' || !row.id ||
                !FULL_SHA.test(row.commitOid || '') || row.environment !== environment ||
                row.originalEnvironment !== environment) {
                throw new Error('deployment identity differs from the owned gallery policy');
            }
            deployments.push(row);
        }
        if (!connection.pageInfo.hasNextPage) { complete = true; break; }
        after = connection.pageInfo.endCursor;
        if (typeof after !== 'string' || !after || cursors.has(after)) {
            throw new Error('invalid or repeated deployment pagination cursor');
        }
        cursors.add(after);
    }
    if (!complete) throw new Error('deployment pagination limit exhausted; latest completion is unknown');
    if (new Set(deployments.map(row => row.databaseId)).size !== deployments.length ||
        new Set(deployments.map(row => row.id)).size !== deployments.length) {
        throw new Error('deployment listing contains duplicate IDs');
    }
    // Creation order is insufficient: an older queued job can complete later.
    // The batched GraphQL connection includes EVERY candidate's current status.
    const successes = [];
    for (const row of deployments) {
        // This workflow profile deploys main. Legacy gh-pages branch builds are
        // a separate authority and cannot become this profile's source.
        if (row.ref?.name !== ref) continue;
        if (row.task !== 'deploy') throw new Error('deployment task differs from the owned gallery policy');
        const latest = row.latestStatus;
        if (!latest) continue;
        if (typeof latest.id !== 'string' || !latest.id || latest.environment !== environment ||
            !['QUEUED', 'PENDING', 'WAITING', 'IN_PROGRESS', 'SUCCESS', 'FAILURE', 'ERROR', 'INACTIVE'].includes(latest.state)) {
            throw new Error('deployment status identity differs from its request');
        }
        const completed = timestamp(latest.updatedAt);
        timestamp(latest.createdAt);
        if (latest.state === 'SUCCESS') {
            if (latest.environmentUrl !== base) throw new Error('successful deployment points to another Pages site');
            successes.push({row, latest, completed});
        }
    }
    successes.sort((a, b) => b.completed - a.completed);
    if (!successes.length) throw new Error('no completed successful gallery deployment');
    if (successes.length > 1 && successes[0].completed === successes[1].completed) {
        throw new Error('successful gallery deployment completion order is ambiguous');
    }
    const {row, latest} = successes[0];
    const deployment = await getJson(`${repositoryUrl}/deployments/${row.databaseId}`);
    if (deployment.id !== row.databaseId || deployment.node_id !== row.id || deployment.sha !== row.commitOid ||
        deployment.ref !== ref || deployment.task !== 'deploy' || deployment.environment !== environment ||
        deployment.original_environment !== environment || deployment.repository_url !== repositoryUrl ||
        deployment.url !== `${repositoryUrl}/deployments/${row.databaseId}` ||
        deployment.statuses_url !== `${repositoryUrl}/deployments/${row.databaseId}/statuses`) {
        throw new Error('selected deployment REST identity differs from the GraphQL source census');
    }
    const statuses = await getJson(`${deployment.statuses_url}?per_page=1`);
    const status = Array.isArray(statuses) && statuses.length === 1 ? statuses[0] : null;
    if (!status || !id(status.id) || status.node_id !== latest.id || status.state !== 'success' ||
        status.deployment_url !== deployment.url || status.repository_url !== repositoryUrl ||
        status.environment !== environment || status.environment_url !== base || status.log_url !== latest.logUrl ||
        status.updated_at !== latest.updatedAt || status.created_at !== latest.createdAt) {
        throw new Error('selected deployment status changed or differs from the GraphQL completion receipt');
    }
    const escapedRepo = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const runMatch = new RegExp(`^https://github\\.com/${escapedRepo}/actions/runs/(\\d+)/job/(\\d+)$`)
        .exec(status.log_url || '');
    if (!runMatch) throw new Error('successful gallery deployment has no owned workflow job URL');
    const runUrl = `${repositoryUrl}/actions/runs/${runMatch[1]}`;
    const run = await getJson(runUrl);
    if (run.id !== Number(runMatch[1]) || run.repository?.full_name !== repo || run.head_sha !== deployment.sha ||
        !id(run.run_attempt) || run.head_branch !== ref || run.path !== workflow || run.status !== 'completed' || run.conclusion !== 'success' ||
        !['push', 'workflow_dispatch'].includes(run.event) ||
        run.html_url !== `https://github.com/${repo}/actions/runs/${runMatch[1]}`) {
        throw new Error('deployment is not a successful owned main Deploy workflow run');
    }
    // Workflow Pages status-by-SHA is not readable with another repository's
    // CI token. The public deployment status and actual successful Deploy job
    // are the authority: bind the job that produced this status, including the
    // successful Pages step, instead of requesting private Pages permissions.
    const jobUrl = `${repositoryUrl}/actions/jobs/${runMatch[2]}`;
    const job = await getJson(jobUrl);
    const pagesSteps = Array.isArray(job.steps) ? job.steps.filter(step => step.name === 'Deploy to GitHub Pages') : [];
    if (job.id !== Number(runMatch[2]) || job.run_id !== run.id || job.run_attempt !== run.run_attempt ||
        job.head_sha !== deployment.sha || job.html_url !== status.log_url || job.name !== 'deploy' ||
        job.status !== 'completed' || job.conclusion !== 'success' || pagesSteps.length !== 1 ||
        pagesSteps[0].status !== 'completed' || pagesSteps[0].conclusion !== 'success') {
        throw new Error('deployment is not bound to a successful actual Pages workflow job');
    }
    return {
        sha: deployment.sha,
        deploymentId: deployment.id,
        statusId: status.id,
        completedAt: status.updated_at,
        runId: run.id,
        runAttempt: run.run_attempt,
        jobId: job.id,
        authority: 'public-deployment-status-and-successful-pages-job',
        sourceUrl: `https://github.com/${repo}/commit/${deployment.sha}`,
        deploymentUrl: deployment.url,
        statusUrl: `${deployment.statuses_url}/${status.id}`,
        runUrl: run.html_url,
        jobApiUrl: jobUrl,
        jobUrl: job.html_url
    };
}

export function assertSameGalleryDeployment (before, after) {
    if (before.sha !== after.sha || before.deploymentId !== after.deploymentId ||
        before.statusId !== after.statusId || before.runId !== after.runId ||
        before.runAttempt !== after.runAttempt || before.jobId !== after.jobId ||
        before.authority !== after.authority || before.completedAt !== after.completedAt) {
        throw new Error('gallery deployment changed during source attestation; refusing a mixed snapshot');
    }
}
