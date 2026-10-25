// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError} from './protocol.mjs';
import {ARTIFACT_BYTES, boundedJson, boundedResponseBytes, cancelResponse, newContext, remaining} from './bounded-http.mjs';
import {boundedResultArchive} from './bounded-result.mjs';
import {REPOSITORY, WORKFLOW, REVISION, TERMINAL, verifyDispatchTag, beforeDispatchRefusal} from './job-identity.mjs';
const terminalConclusions = new Set(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'stale', 'startup_failure']);
export function githubBackend({repository, workflow, ref, workerRevision, token, master, fetchImpl = fetch}) {
    if (!REPOSITORY.test(repository) || !WORKFLOW.test(workflow) || typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(ref) ||
        ref.includes('..') || !REVISION.test(workerRevision) || !token || !Buffer.isBuffer(master) || master.length !== 32) {
        throw new ApiError(503, 'configuration', 'Qualified worker configuration is incomplete');
    }
    const root = 'https://api.github.com/repos/' + repository;
    const headers = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10'};
    const failed = () => new ApiError(503, 'worker-unavailable', 'GitHub worker request failed');
    const missing = () => new ApiError(404, 'not-found', 'Job not found');
    async function response(path, options, context) {
        return fetchImpl(root + path, {...options, headers: {...headers, ...options?.headers}, redirect: 'error', signal: AbortSignal.timeout(remaining(context))});
    }
    async function json(path, context, limit = 256 * 1024) {
        const r = await response(path, {}, context);
        if (r.status !== 200) { cancelResponse(r); throw failed(); }
        return boundedJson(r, {limit, context});
    }
    const sameRepo = value => typeof value === 'string' && value.toLowerCase() === repository.toLowerCase();
    function identity(job) {
        verifyDispatchTag(master, job);
        if (job.repository !== repository || job.workflow !== workflow) throw missing();
    }
    const title = job => 'model-measure:' + job.id + ':' + job.correlation;
    async function runFor(job, context) {
        identity(job);
        const cacheKey = job.id + ':' + job.correlation;
        if (context.runs?.has(cacheKey)) return context.runs.get(cacheKey);
        let run;
        if (job.runId !== null) {
            if (!Number.isSafeInteger(job.runId) || job.runId < 1) throw missing();
            run = await json('/actions/runs/' + job.runId, context);
        } else {
            const q = new URLSearchParams({event: 'workflow_dispatch', per_page: '100',
                created: new Date(job.createdAt - 60000).toISOString() + '..' + new Date(job.createdAt + 60000).toISOString()});
            const page = await json('/actions/workflows/' + workflow + '/runs?' + q, context, 2 * 1024 * 1024);
            if (!Array.isArray(page.workflow_runs) || page.workflow_runs.length > 100) throw failed();
            const matches = page.workflow_runs.filter(r => r.display_title === title(job));
            if (matches.length > 1) throw missing();
            run = matches[0];
        }
        if (!run) return null;
        if (run.event !== 'workflow_dispatch' || run.path !== '.github/workflows/' + workflow || !Number.isSafeInteger(run.id) || run.id < 1 ||
            !sameRepo(run.repository?.full_name) || !sameRepo(run.head_repository?.full_name)) throw missing();
        if (run.display_title !== title(job)) {
            if (run.status !== 'completed' && run.display_title === 'Submitted model measurements' && Date.now() - job.createdAt < 60000) return null;
            throw missing();
        }
        if (run.head_sha !== job.workerRevision || (job.runId !== null && run.id !== job.runId) ||
            !['queued', 'requested', 'waiting', 'pending', 'in_progress', 'completed'].includes(run.status)) throw missing();
        // Cache only the admitted identity/status fields, never an arbitrary API object.
        const held = Object.freeze({id: run.id, status: run.status, conclusion: run.conclusion ?? null, head_sha: run.head_sha});
        context.runs?.set(cacheKey, held);
        return held;
    }
    async function qualifiedRef(context) {
        // workflow_dispatch accepts branch/tag NAMES, not a presumed raw commit SHA.
        const tag = await json('/git/ref/tags/' + encodeURIComponent(ref), context);
        if (tag.ref !== 'refs/tags/' + ref || tag.object?.type !== 'commit' || tag.object.sha !== workerRevision) throw failed();
        const branch = await response('/git/ref/heads/' + encodeURIComponent(ref), {}, context);
        if (branch.status !== 404) { cancelResponse(branch); throw new ApiError(503, 'ambiguous-worker-ref', 'Worker tag has an ambiguous branch reference'); }
        cancelResponse(branch);
    }
    return Object.freeze({
        repository, workflow, workerRevision,
        async submit(job, envelope, context = newContext()) {
            try {
                identity(job);
                if (job.workerRevision !== workerRevision) throw failed();
                await qualifiedRef(context); remaining(context);
            } catch (error) { throw beforeDispatchRefusal(error); }
            // After this call begins, any transport/response failure is indeterminate and retains admission.
            const r = await response('/actions/workflows/' + workflow + '/dispatches', {method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ref, inputs: {request_id: job.id, request_tag: job.correlation, envelope}})}, context);
            if (r.status === 204) return null;
            if (r.status !== 200) { cancelResponse(r); throw failed(); }
            const data = await boundedJson(r, {limit: 64 * 1024, context});
            return Number.isSafeInteger(data.workflow_run_id) && data.workflow_run_id > 0 ? data.workflow_run_id : null;
        },
        async status(job, context = newContext()) {
            const run = await runFor(job, context);
            if (!run) return {status: 'queued'};
            const state = {status: run.status === 'completed' ? (run.conclusion === 'success' ? 'completed' : 'failed') : run.status,
                runId: run.id, conclusion: run.conclusion, workerWorkflowRevision: run.head_sha};
            if (run.status === 'completed' && terminalConclusions.has(run.conclusion)) Object.defineProperty(state, TERMINAL, {
                value: Object.freeze({source: 'github-actions', ...Object.fromEntries(['repository', 'workflow', 'id', 'owner', 'nonce', 'workerRevision', 'correlation'].map(key => [key, job[key]])),
                    runId: run.id, conclusion: run.conclusion})
            });
            return state;
        },
        async result(job, context = newContext()) {
            const run = await runFor(job, context);
            if (!run || run.status !== 'completed') throw new ApiError(409, 'not-ready', 'Job has not completed');
            const data = await json('/actions/runs/' + run.id + '/artifacts?per_page=100', context);
            if (!Array.isArray(data.artifacts) || data.artifacts.length > 100) throw failed();
            const matches = data.artifacts.filter(a => a.name === 'model-measure-' + job.id && !a.expired);
            if (matches.length !== 1) throw new ApiError(410, 'result-unavailable', 'No unique retained measurement artifact');
            const artifact = matches[0];
            if (!Number.isSafeInteger(artifact.size_in_bytes) || artifact.size_in_bytes < 1 || artifact.size_in_bytes > ARTIFACT_BYTES) {
                throw new ApiError(503, 'result-too-large', 'Artifact metadata exceeds the result limit');
            }
            if (!Number.isSafeInteger(artifact.id) || artifact.id < 1 || (artifact.workflow_run &&
                (artifact.workflow_run.id !== run.id || artifact.workflow_run.head_sha !== job.workerRevision))) throw missing();
            const first = await fetchImpl(root + '/actions/artifacts/' + artifact.id + '/zip', {headers, redirect: 'manual', signal: AbortSignal.timeout(remaining(context))});
            let downloaded = first;
            if (first.status === 302) {
                let url; try { url = new URL(first.headers.get('location')); } catch { cancelResponse(first); throw failed(); }
                if (url.protocol !== 'https:' || url.username || url.password || url.port ||
                    !/(?:\.blob\.core\.windows\.net|\.actions\.githubusercontent\.com|\.githubusercontent\.com)$/.test(url.hostname)) { cancelResponse(first); throw failed(); }
                cancelResponse(first);
                downloaded = await fetchImpl(url, {redirect: 'error', signal: AbortSignal.timeout(remaining(context))});
            }
            if (downloaded.status !== 200) { cancelResponse(downloaded); throw failed(); }
            const bytes = await boundedResponseBytes(downloaded, {context});
            return boundedResultArchive(bytes, {context});
        }
    });
}
