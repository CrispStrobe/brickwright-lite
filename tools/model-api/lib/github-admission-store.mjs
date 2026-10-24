// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createHash} from 'node:crypto';
import {ApiError} from './protocol.mjs';
import {boundedJson, cancelResponse, newContext, remaining} from './bounded-http.mjs';
import {LEDGER_BYTES} from './admission.mjs';
import {REPOSITORY} from './job-identity.mjs';
const PATH = 'model-api-admission.json';
export const gitBlobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const unavailable = () => new ApiError(503, 'admission-unavailable', 'Private job admission is unavailable');
/** Update-only adapter. Repository/ledger initialization is a separately reviewed operator action. */
export function githubAdmissionStore({repository, owner, ref, token, fetchImpl = fetch}) {
    if (!REPOSITORY.test(repository) || typeof owner !== 'string' || repository.split('/')[0].toLowerCase() !== owner.toLowerCase() ||
        typeof ref !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(ref) || ref.includes('..') || !token) throw unavailable();
    const root = 'https://api.github.com/repos/' + repository;
    const headers = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10'};
    async function request(path, options, context) {
        return fetchImpl(root + path, {...options, headers: {...headers, ...options?.headers}, redirect: 'error', signal: AbortSignal.timeout(remaining(context))});
    }
    async function privateRepository(context) {
        const response = await request('', {}, context);
        if (!response.ok) { cancelResponse(response); throw unavailable(); }
        const meta = await boundedJson(response, {limit: 128 * 1024, context, code: 'admission-unavailable'});
        if (meta.private !== true || typeof meta.full_name !== 'string' || meta.full_name.toLowerCase() !== repository.toLowerCase() ||
            typeof meta.owner?.login !== 'string' || meta.owner.login.toLowerCase() !== owner.toLowerCase() || meta.permissions?.push !== true) throw unavailable();
    }
    return Object.freeze({
        async read(context = newContext()) {
            await privateRepository(context);
            const response = await request('/contents/' + PATH + '?' + new URLSearchParams({ref}), {}, context);
            if (response.status !== 200) { cancelResponse(response); throw unavailable(); }
            const item = await boundedJson(response, {limit: 64 * 1024, context, code: 'admission-unavailable'});
            if (item.type !== 'file' || item.path !== PATH || item.encoding !== 'base64' || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > LEDGER_BYTES ||
                typeof item.sha !== 'string' || !/^[a-f0-9]{40}$/.test(item.sha) || typeof item.content !== 'string' || item.content.length > 24000) throw unavailable();
            const compact = item.content.replace(/[\r\n]/g, '');
            if (compact.length !== 4 * Math.ceil(item.size / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) throw unavailable();
            const bytes = Buffer.from(compact, 'base64');
            if (bytes.length !== item.size || bytes.toString('base64') !== compact || gitBlobSha(bytes) !== item.sha) throw unavailable();
            return Object.freeze({sha: item.sha, bytes});
        },
        async write(sha, bytes, context = newContext()) {
            if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha) || !Buffer.isBuffer(bytes) || bytes.length > LEDGER_BYTES) throw unavailable();
            await privateRepository(context);
            const response = await request('/contents/' + PATH, {method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({message: 'Update bounded model API admission', branch: ref, sha, content: bytes.toString('base64')})}, context);
            if (response.status === 409) { cancelResponse(response); return false; }
            // Never accept a creation (201), missing file or ambiguous acknowledgement.
            if (response.status !== 200) { cancelResponse(response); throw unavailable(); }
            const result = await boundedJson(response, {limit: 64 * 1024, context, code: 'admission-unavailable'});
            if (result.content?.sha !== gitBlobSha(bytes) || !/^[a-f0-9]{40}$/.test(result.commit?.sha || '')) throw unavailable();
            return true;
        }
    });
}
