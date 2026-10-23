// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHmac, timingSafeEqual} from 'node:crypto';
import {ApiError} from './protocol.mjs';
import {newContext, remaining} from './bounded-http.mjs';
import {workerIdentity, verifyDispatchTag, terminalMatches, isBeforeDispatchRefusal, REPOSITORY, WORKFLOW} from './job-identity.mjs';
export const LEDGER_BYTES = 16384;
export const DEFAULT_QUOTA = Object.freeze({global: 8, perOwner: 2});
const MAX_RETRIES = 4;
const RECORD_KEYS = ['id', 'owner', 'nonce', 'createdAt', 'runId', 'repository', 'workflow', 'workerRevision', 'correlation'];
const unavailable = () => new ApiError(503, 'admission-unavailable', 'Job admission is unavailable');
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
function policyOf({epoch, repository, workflow, global = 8, perOwner = 2}) {
    if (typeof epoch !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(epoch) || !REPOSITORY.test(repository) || !WORKFLOW.test(workflow) ||
        !Number.isSafeInteger(global) || global < 1 || global > 16 || !Number.isSafeInteger(perOwner) || perOwner < 1 || perOwner > 4 || perOwner > global) throw unavailable();
    return Object.freeze({epoch, repository, workflow, global, perOwner});
}
function mac(master, value) {
    return createHmac('sha256', master).update('brickwright-model-admission-v1\0').update(JSON.stringify(value)).digest('hex');
}
function encode(master, policy, revision, active) {
    const value = {schema: 'bw.model-api.admission.v1', policy, revision, active};
    const bytes = Buffer.from(JSON.stringify({...value, mac: mac(master, value)}) + '\n');
    if (bytes.length > LEDGER_BYTES) throw unavailable();
    return bytes;
}
/** Pure operator preparation only. No file/store creation or network operation occurs here. */
export function initialAdmissionDocument({master, ...options}) {
    if (!Buffer.isBuffer(master) || master.length !== 32) throw unavailable();
    return encode(master, policyOf(options), 0, []);
}
export function createAdmission({master, store, ...options}) {
    if (!Buffer.isBuffer(master) || master.length !== 32 || typeof store?.read !== 'function' || typeof store?.write !== 'function') throw unavailable();
    const policy = policyOf(options);
    function record(job) {
        workerIdentity(job); verifyDispatchTag(master, job);
        if (job.repository !== policy.repository || job.workflow !== policy.workflow || !Number.isSafeInteger(job.createdAt) || job.createdAt < 0 ||
            (job.runId !== null && (!Number.isSafeInteger(job.runId) || job.runId < 1))) throw unavailable();
        return Object.fromEntries(RECORD_KEYS.map(key => [key, job[key]]));
    }
    function decode(bytes) {
        if (!Buffer.isBuffer(bytes) || bytes.length > LEDGER_BYTES) throw unavailable();
        let value;
        try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); } catch { throw unavailable(); }
        if (!exactKeys(value, ['schema', 'policy', 'revision', 'active', 'mac']) || value.schema !== 'bw.model-api.admission.v1' ||
            JSON.stringify(value.policy) !== JSON.stringify(policy) || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision >= Number.MAX_SAFE_INTEGER ||
            !Array.isArray(value.active) || value.active.length > policy.global || typeof value.mac !== 'string' || !/^[a-f0-9]{64}$/.test(value.mac)) throw unavailable();
        const ids = new Set(), owners = new Map(), active = [];
        for (const item of value.active) {
            if (!exactKeys(item, RECORD_KEYS)) throw unavailable();
            const next = record(item);
            if (ids.has(next.id)) throw unavailable();
            ids.add(next.id); owners.set(next.owner, (owners.get(next.owner) || 0) + 1);
            if (owners.get(next.owner) > policy.perOwner) throw unavailable();
            active.push(next);
        }
        active.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const expected = encode(master, policy, value.revision, active);
        // Canonical bytes reject duplicate keys, reordered records and unauthenticated rewrites.
        if (expected.length !== bytes.length || !timingSafeEqual(expected, bytes)) throw unavailable();
        return {revision: value.revision, active};
    }
    async function mutate(change, context = newContext(), onWrite = () => {}) {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            remaining(context);
            const held = await store.read(context), value = decode(held.bytes);
            if (!change(value.active)) return false;
            value.active.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
            const next = encode(master, policy, value.revision + 1, value.active);
            onWrite();
            const accepted = await store.write(held.sha, next, context);
            if (accepted === true) return true;
            if (accepted !== false) throw unavailable();
        }
        throw new ApiError(503, 'admission-contention', 'Job admission is busy; try later');
    }
    const same = (a, b) => ['id', 'owner', 'nonce', 'createdAt', 'repository', 'workflow', 'workerRevision', 'correlation'].every(key => a[key] === b[key]);
    const remove = (job, context) => mutate(active => {
        const at = active.findIndex(item => item.id === job.id);
        if (at < 0) return false;
        if (!same(active[at], job)) throw unavailable();
        active.splice(at, 1); return true;
    }, context);
    const cleanup = async (job, primary) => {
        try { await remove(job, {deadline: Date.now() + 2000, runs: new Map()}); }
        catch (secondary) { try { primary.admissionCleanupError = secondary; } catch { /* Preserve primary. */ } }
    };
    return Object.freeze({
        policy,
        async acceptedJobs(context = newContext()) {
            const value = decode((await store.read(context)).bytes);
            return value.active.map(job => Object.freeze({...job}));
        },
        async releaseTerminal(job, state, context = newContext()) {
            record(job);
            if (!terminalMatches(job, state)) return false;
            return remove(job, context);
        },
        async reconcile(backend, context = newContext()) {
            const active = await this.acceptedJobs(context);
            // A bounded batch of four; absence/expiry/unknown/error never releases a reservation.
            for (let at = 0; at < active.length; at += 4) {
                remaining(context);
                const batch = active.slice(at, at + 4);
                const states = await Promise.allSettled(batch.map(job => backend.status(job, context)));
                for (let i = 0; i < batch.length; i++) if (states[i].status === 'fulfilled') await this.releaseTerminal(batch[i], states[i].value, context);
            }
        },
        async submit(job, submit, context = newContext()) {
            const held = Object.freeze(record(job));
            let wrote = false;
            try {
                await mutate(active => {
                    if (active.some(item => item.id === held.id)) throw new ApiError(409, 'already-admitted', 'Job is already admitted');
                    if (active.length >= policy.global || active.filter(item => item.owner === held.owner).length >= policy.perOwner) {
                        throw new ApiError(429, 'busy', 'The accepted job limit is reached');
                    }
                    active.push({...held}); return true;
                }, context, () => { wrote = true; });
            } catch (error) {
                // No dispatch has been invoked on this path. Clean only our exact nonce after an uncertain CAS acknowledgement.
                if (wrote && error.code !== 'admission-contention') await cleanup(held, error);
                throw error;
            }
            try { return await submit(); }
            catch (error) {
                // Once a dispatch POST may have happened, even expiry/network failure retains the slot.
                if (isBeforeDispatchRefusal(error)) await cleanup(held, error);
                throw error;
            }
        }
    });
}
