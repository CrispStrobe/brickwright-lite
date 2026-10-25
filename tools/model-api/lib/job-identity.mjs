// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHmac, timingSafeEqual} from 'node:crypto';
import {ApiError} from './protocol.mjs';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export const WORKFLOW = /^[A-Za-z0-9_.-]+\.yml$/;
export const REVISION = /^[a-f0-9]{40}$/;
export const TERMINAL = Symbol('trusted model worker terminal observation');
const refused = new WeakSet();
/** Only a trusted backend may attest that it never invoked the dispatch POST. */
export function beforeDispatchRefusal(error) {
    if (!(error instanceof Error)) error = new ApiError(503, 'worker-unavailable', 'Worker preflight refused');
    refused.add(error); return error;
}
export const isBeforeDispatchRefusal = error => error instanceof Error && refused.has(error);
export function workerIdentity(job) {
    if (!job || !UUID.test(job.id) || !/^[a-f0-9]{32}$/.test(job.owner) || !/^[a-f0-9]{32}$/.test(job.nonce) ||
        !REPOSITORY.test(job.repository) || !WORKFLOW.test(job.workflow) || !REVISION.test(job.workerRevision)) {
        throw new ApiError(503, 'invalid-job-identity', 'Invalid worker identity');
    }
    return [job.repository, job.workflow, job.id, job.owner, job.nonce, job.workerRevision];
}
export function dispatchTag(master, job) {
    return createHmac('sha256', master).update('brickwright-model-dispatch-v1\0').update(JSON.stringify(workerIdentity(job))).digest('hex');
}
export function verifyDispatchTag(master, job) {
    workerIdentity(job);
    if (typeof job.correlation !== 'string' || !/^[a-f0-9]{64}$/.test(job.correlation) ||
        !timingSafeEqual(Buffer.from(dispatchTag(master, job), 'hex'), Buffer.from(job.correlation, 'hex'))) {
        throw new ApiError(503, 'invalid-job-identity', 'Invalid worker correlation');
    }
}
export function terminalMatches(job, state) {
    const proof = state?.[TERMINAL];
    return proof?.source === 'github-actions' && Number.isSafeInteger(proof.runId) && proof.runId > 0 && (job.runId === null || proof.runId === job.runId) &&
        ['repository', 'workflow', 'id', 'owner', 'nonce', 'workerRevision', 'correlation'].every(key => proof[key] === job[key]) &&
        ['success', 'failure', 'cancelled', 'timed_out', 'neutral', 'skipped', 'action_required', 'stale', 'startup_failure'].includes(proof.conclusion);
}
