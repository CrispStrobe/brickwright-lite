// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import {ApiError} from './protocol.mjs';
export const ARTIFACT_BYTES = 8 * 1024 * 1024;
export const newContext = () => ({deadline: Date.now() + 30000, runs: new Map()});
export function remaining(context = newContext()) {
    const ms = Math.min(20000, context.deadline - Date.now());
    if (!Number.isFinite(ms) || ms <= 0) throw new ApiError(503, 'deadline-exceeded', 'Worker request deadline exceeded');
    return Math.max(1, Math.ceil(ms));
}
export function cancelResponse(response) {
    try { response.body?.cancel().catch(() => {}); } catch { /* Preserve the primary refusal. */ }
}
/** Bound our allocations before copying chunks; the fetch signal also bounds transport lifetime. */
export async function boundedResponseBytes(response, {limit = ARTIFACT_BYTES, context = newContext(), code = 'result-too-large'} = {}) {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > ARTIFACT_BYTES) throw new TypeError('Invalid byte budget');
    const declared = response.headers.get('content-length');
    const overflow = () => new ApiError(503, code, 'Worker response exceeds its byte limit');
    if (declared !== null && (!/^\d{1,16}$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit)) {
        cancelResponse(response); throw overflow();
    }
    if (!response.body || typeof response.body.getReader !== 'function') throw new ApiError(503, 'invalid-response', 'Missing worker response stream');
    const reader = response.body.getReader(), chunks = [];
    let size = 0, done = false, timer;
    const expired = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new ApiError(503, 'deadline-exceeded', 'Worker response deadline exceeded')), remaining(context));
    });
    try {
        for (;;) {
            const item = await Promise.race([reader.read(), expired]);
            if (item.done) { done = true; break; }
            if (!(item.value instanceof Uint8Array)) throw new ApiError(503, 'invalid-response', 'Invalid worker response chunk');
            if (item.value.byteLength > limit - size) throw overflow();
            size += item.value.byteLength;
            chunks.push(Buffer.from(item.value));
        }
        if (declared !== null && size !== Number(declared)) throw new ApiError(503, 'invalid-response', 'Worker response length mismatch');
        return Buffer.concat(chunks, size);
    } finally {
        clearTimeout(timer);
        if (!done) { try { reader.cancel().catch(() => {}); } catch { /* Do not mask a read failure. */ } }
        try { reader.releaseLock(); } catch { /* A pending cancellation is also covered by the fetch deadline. */ }
    }
}
export async function boundedJson(response, options = {}) {
    const bytes = await boundedResponseBytes(response, {limit: 256 * 1024, ...options});
    try { return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
    catch { throw new ApiError(503, 'invalid-response', 'Malformed worker metadata'); }
}
