// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {randomUUID, randomBytes} from 'node:crypto';
import {ApiError, LIMITS, KINDS, validateSubmission, submissionPayload} from './protocol.mjs';
import {authenticate, ownerTag, seal, open, signJob, readJob, sha256} from './crypto.mjs';
import {newContext} from './bounded-http.mjs';
import {workerIdentity, dispatchTag} from './job-identity.mjs';
export function createGateway({tokens, master, backend, admission, now = Date.now}) {
    if (!Array.isArray(tokens) || !tokens.length || !Buffer.isBuffer(master) || master.length !== 32) throw new ApiError(503, 'configuration', 'Service authentication is not configured');
    return async ({method, path, authorization, body}) => {
        try {
            const owner = authenticate(authorization, tokens), tag = ownerTag(master, owner), context = newContext();
            if (method === 'GET' && path === '/v1/capabilities') return {status: 200, body: {version: 1, formats: ['ldr', 'mpd', 'bw'], measurements: KINDS, limits: LIMITS,
                admission: admission ? {global: admission.policy.global, perAgent: admission.policy.perOwner, counts: 'accepted nonterminal or uncertain jobs'} : null,
                execution: 'asynchronous GitHub Actions; fixed worker code', qualification: 'not automatic library admission'}};
            if (method === 'POST' && path === '/v1/runs') {
                if (body === undefined) throw new ApiError(400, 'invalid-json', 'A JSON submission is required');
                const raw = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
                if (Buffer.byteLength(raw) > LIMITS.bodyBytes) throw new ApiError(413, 'too-large', 'Submission exceeds body limit');
                let input;
                try { input = validateSubmission(typeof body === 'object' && !Buffer.isBuffer(body) ? body : JSON.parse(raw)); }
                catch (error) { if (error instanceof SyntaxError) throw new ApiError(400, 'invalid-json', 'Invalid JSON'); throw error; }
                if (!admission) throw new ApiError(503, 'configuration', 'Qualified private job admission is required');
                const normalized = submissionPayload(input);
                const fields = {inputSha256: sha256(JSON.stringify(normalized)), id: randomUUID(), owner: tag, nonce: randomBytes(16).toString('hex'), createdAt: now(), runId: null,
                    repository: backend.repository, workflow: backend.workflow, workerRevision: backend.workerRevision};
                workerIdentity(fields);
                const job = Object.freeze({...fields, correlation: dispatchTag(master, fields)});
                const envelope = seal(master, 'request:' + job.id, {owner: tag, nonce: job.nonce, createdAt: job.createdAt, inputSha256: job.inputSha256, workerRevision: job.workerRevision, repository: job.repository,
                    workflow: job.workflow, correlation: job.correlation, submission: normalized});
                if (Buffer.byteLength(envelope) > LIMITS.compressedBytes) throw new ApiError(413, 'compressed-too-large', 'Compressed submission exceeds the dispatch limit');
                await admission.reconcile(backend, context);
                const runId = await admission.submit(job, () => backend.submit(job, envelope, context), context);
                if (runId !== null && (!Number.isSafeInteger(runId) || runId < 1)) throw new ApiError(503, 'invalid-response', 'Invalid worker dispatch acknowledgement');
                const id = signJob(master, {...job, runId});
                return {status: 202, body: {id, status: 'queued', statusUrl: '/api/v1/runs/' + id, resultUrl: '/api/v1/runs/' + id + '/result'}};
            }
            const match = /^\/v1\/runs\/([^/]+)(\/result)?$/.exec(path);
            if (method === 'GET' && match) {
                const job = readJob(master, match[1], tag, now()), state = await backend.status(job, context);
                if (admission) await admission.releaseTerminal(job, state, context);
                if (match[2]) {
                    const envelope = await backend.result(job, context), result = open(master, 'result:' + job.id, envelope, LIMITS.resultBytes);
                    if (result.requestId !== job.id || ['owner', 'nonce', 'createdAt', 'inputSha256', 'workerRevision', 'repository', 'workflow', 'correlation'].some(key => result[key] !== job[key])) {
                        throw new ApiError(404, 'not-found', 'Job result identity mismatch');
                    }
                    return {status: 200, body: result.report};
                }
                return {status: 200, body: {id: match[1], ...state}};
            }
            throw new ApiError(404, 'not-found', 'Endpoint not found');
        } catch (error) {
            return {status: error instanceof ApiError ? error.status : 503, body: {error: {code: error instanceof ApiError ? error.code : 'service-unavailable',
                message: error instanceof ApiError ? error.message : 'Measurement service unavailable'}}};
        }
    };
}
