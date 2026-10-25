// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {createGateway} from '../lib/gateway.mjs';
import {githubBackend} from '../lib/github.mjs';
import {githubAdmissionStore} from '../lib/github-admission-store.mjs';
import {createAdmission} from '../lib/admission.mjs';
import {authenticate, masterFromHex} from '../lib/crypto.mjs';
import {readBody, reply, applyCors} from '../lib/http.mjs';
import {ApiError} from '../lib/protocol.mjs';
export default async function handler(req, res) {
    try {
        if (applyCors(req, res, (process.env.MODEL_API_ALLOWED_ORIGINS || 'https://crispstrobe.github.io').split(',').map(s => s.trim()).filter(Boolean))) return;
        const rawTokens = process.env.MODEL_API_AGENT_TOKENS || '[]';
        if (rawTokens.length > 65536) throw new ApiError(503, 'configuration', 'Invalid token configuration');
        const tokens = JSON.parse(rawTokens);
        // Refuse unauthorized callers before consuming a body or contacting any store/backend.
        authenticate(req.headers.authorization, tokens);
        const master = masterFromHex(process.env.MODEL_API_MASTER_KEY);
        const backend = githubBackend({repository: process.env.MODEL_API_REPOSITORY || 'CrispStrobe/brickwright-lite', workflow: 'model-measurements.yml',
            ref: process.env.MODEL_API_REF, workerRevision: process.env.MODEL_API_WORKER_REVISION, token: process.env.MODEL_API_GITHUB_TOKEN, master});
        const store = githubAdmissionStore({repository: process.env.MODEL_API_ADMISSION_REPOSITORY, owner: backend.repository.split('/')[0],
            ref: process.env.MODEL_API_ADMISSION_BRANCH, token: process.env.MODEL_API_ADMISSION_TOKEN});
        const admission = createAdmission({master, store, epoch: process.env.MODEL_API_ADMISSION_EPOCH, repository: backend.repository, workflow: backend.workflow});
        const gateway = createGateway({tokens, master, backend, admission}), url = new URL(req.url, 'https://model-api.invalid'), route = url.searchParams.get('route');
        const path = route !== null ? '/v1/' + route : url.pathname.replace(/^\/api/, '');
        const result = await gateway({method: req.method, path, authorization: req.headers.authorization, body: req.method === 'POST' ? await readBody(req, {res}) : undefined});
        reply(res, result.status, result.body);
    } catch (error) {
        reply(res, error instanceof ApiError ? error.status : 503, {error: {code: error instanceof ApiError ? error.code : 'configuration',
            message: error instanceof ApiError ? error.message : 'Measurement service is not configured'}});
    }
}
