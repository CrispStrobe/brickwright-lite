// Bounded hosted permission diagnostic: credentials are never printed.
import {GALLERY_DEPLOYMENT_QUERY, resolveGalleryDeployment} from './gallery-deployment.mjs';
const repo = 'CrispStrobe/extensions';
const api = `https://api.github.com/repos/${repo}`;
const sha = 'c13f4a9d81cdb8276dd3b9e75535f57c1e30b8da';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('hosted GITHUB_TOKEN is required for this diagnostic');
const probes = [];
async function request (label, url, authenticated, body) {
    const headers = {accept: 'application/vnd.github+json'};
    if (authenticated) headers.authorization = `Bearer ${token}`;
    if (body) headers['content-type'] = 'application/json';
    const response = await fetch(url, {headers, ...(body ? {method: 'POST', body: JSON.stringify(body)} : {})});
    const data = await response.json();
    probes.push({label, authenticated, status: response.status,
        rateLimit: response.headers.get('x-ratelimit-limit'),
        ...(data.errors ? {errors: data.errors.map(error => ({type: error.type, message: error.message}))} : {}),
        ...(Array.isArray(data) ? {count: data.length} : {}),
        ...(data.status ? {deploymentStatus: data.status} : {}),
        ...(data.data?.repository ? {repository: data.data.repository.nameWithOwner,
            deploymentCount: data.data.repository.deployments?.nodes?.length,
            hasNextPage: data.data.repository.deployments?.pageInfo?.hasNextPage} : {})});
}
for (const authenticated of [false, true]) {
    await request('public-deployments', `${api}/deployments?environment=github-pages&ref=main&per_page=100`, authenticated);
    await request('public-deployment-status', `${api}/deployments/7033811059/statuses?per_page=1`, authenticated);
    await request('public-successful-workflow', `${api}/actions/runs/38366687053`, authenticated);
    await request('pages-commit-status', `${api}/pages/deployments/${sha}`, authenticated);
}
await request('GraphQL-deployment-census', 'https://api.github.com/graphql', true,
    {query: GALLERY_DEPLOYMENT_QUERY, variables: {owner: 'CrispStrobe', name: 'extensions', environment: 'github-pages', after: null}});
let resolver;
try {resolver = {ok: true, receipt: await resolveGalleryDeployment({repo, base: 'https://crispstrobe.github.io/extensions/'})};}
catch (error) {resolver = {ok: false, message: error.message};}
console.log(JSON.stringify({probes, resolver}, null, 2));
