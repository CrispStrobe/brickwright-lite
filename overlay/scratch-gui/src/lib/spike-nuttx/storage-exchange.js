// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import {decodeReply} from './upload-protocol.js';
export const FLASH_CHECKPOINT_CAPABILITY = 'nuttx-flash-checkpoint/v1';
export const DEFERRED_STORAGE_CAPABILITY = 'nuttx-program-storage-deferred/v1';
const uint32 = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const identity = frame => JSON.stringify([frame.target?.board, frame.target?.firmware,
    frame.target?.transport, frame.target?.imageSha256, frame.lifecycle?.generation,
    frame.lifecycle?.connectionGeneration]);
export function storageMetadata (frame) {
    const data = frame?.lifecycle?.nuttxProgramStorage;
    if (!data || Object.getPrototypeOf(data) !== Object.prototype || Object.keys(data).length !== 5 ||
        !uint32(data.requestSeq) || data.requestSeq === 0 || data.requestSeq % 2 !== 0 ||
        !uint32(data.replySeq) || data.replySeq % 2 !== 0 || ![8, 9].includes(data.operation) ||
        !uint32(data.programId) || data.programId === 0 || typeof data.pending !== 'boolean' ||
        data.pending !== (data.requestSeq !== data.replySeq)) throw new Error('Invalid pending program storage metadata');
    return data;
}
export function flashCheckpointMetadata (frame, sequence, programId) {
    const data = frame?.lifecycle?.nuttxFlashCheckpoint;
    if (!data || Object.getPrototypeOf(data) !== Object.prototype ||
        ![3, 4].includes(Object.keys(data).length) ||
        Object.keys(data).some(key => !['requestSeq', 'programId', 'status', 'error'].includes(key)) ||
        data.requestSeq !== sequence || data.programId !== programId ||
        !['pending', 'durable', 'failed'].includes(data.status) ||
        (data.error !== undefined && (data.status !== 'failed' || typeof data.error !== 'string' ||
            data.error.length > 256))) throw new Error('Invalid or mismatched host flash checkpoint');
    return data;
}
/** One submission, then fresh bounded RPCs. The caller owns serialization and
 * supplies the session identity captured before submission. Never retry writes. */
export async function exchangeStorage ({packet, initialFrame, submit, sample, closed = () => false,
    onFrame = () => {}, now = () => performance.now(), wait = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
    if (!(packet instanceof Uint8Array) || packet.length !== 8 || packet[0] !== 0x70 ||
        packet[1] !== 1 || packet[3] !== 0 || ![8, 9].includes(packet[2])) throw new Error('Invalid storage submission');
    const programId = new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(4, true);
    if (!programId || !initialFrame?.target?.capabilities?.includes(DEFERRED_STORAGE_CAPABILITY)) {
        throw new Error('Deferred program storage is unavailable');
    }
    const previous = initialFrame.lifecycle?.nuttxProgramStorage === undefined ? null : storageMetadata(initialFrame);
    if (previous?.pending) throw new Error('Program storage is already pending');
    const expectedIdentity = identity(initialFrame);
    const durableSave = packet[2] === 8 &&
        initialFrame.target.capabilities.includes(FLASH_CHECKPOINT_CAPABILITY);
    const deadline = now() + 30000;
    const check = () => {
        if (closed()) throw Object.assign(new Error('Program storage cancelled'), {name: 'AbortError'});
        // Reserve the existing native two-second RPC budget. No request may
        // start if its deadline would exceed this storage job's 30-second cap.
        if (now() > deadline) throw new Error('Program storage completion timed out; result is unknown');
    };
    const rpc = async action => {
        check();
        if (deadline - now() < 2000) throw new Error('Program storage completion timed out; result is unknown');
        const result = await action();check();return result;
    };
    let frame = await rpc(() => submit({bytes: Array.from(packet)}));
    let sequence;
    for (;;) {
        check();
        if (identity(frame) !== expectedIdentity || frame.lifecycle?.phase !== 'ready' ||
            !frame.target?.capabilities?.includes(DEFERRED_STORAGE_CAPABILITY)) {
            throw new Error('Program storage session changed or is unavailable');
        }
        const metadata = storageMetadata(frame);
        if (metadata.operation !== packet[2] || metadata.programId !== programId ||
            (sequence !== undefined && metadata.requestSeq !== sequence)) {
            throw new Error('Mismatched program storage request');
        }
        if (sequence === undefined && metadata.requestSeq === previous?.requestSeq) {
            throw new Error('Program storage submission reused the previous request sequence');
        }
        sequence = metadata.requestSeq;
        onFrame(frame);
        if (!metadata.pending) {
            const raw = frame.lifecycle.nuttxProgramReply;
            if (!Array.isArray(raw) || raw.length !== 20 || raw.some(v => !Number.isInteger(v) || v < 0 || v > 255)) {
                throw new Error('Invalid program storage reply');
            }
            const bytes = new Uint8Array(raw);
            const reply = decodeReply(bytes, {op: packet[2], id: programId});
            // A firmware errno remains authoritative and reusable. Successful
            // SAVE additionally waits for a host commit when advertised.
            if (!durableSave || reply.result !== 0) return bytes;
            if (!frame.target.capabilities.includes(FLASH_CHECKPOINT_CAPABILITY)) {
                throw new Error('Host flash checkpoint became unavailable');
            }
            const checkpoint = flashCheckpointMetadata(frame, sequence, programId);
            if (checkpoint.status === 'failed') {
                throw new Error(checkpoint.error || 'Host flash checkpoint failed; previous saved checkpoint retained');
            }
            if (checkpoint.status === 'durable') return bytes;
        }
        // A prior reply, including one with the same op/id, proves nothing
        // until replySeq equals the exact sequence returned by this submit.
        await wait(50);check();
        frame = await rpc(sample);
    }
}
