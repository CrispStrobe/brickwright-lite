/** Retained opaque recording/session handles composed with fork lineage. */
import {createForkHistory} from './fork-history.js';

const refusal = (code, details = {}) => ({accepted: false, code, ...details});

export function createForkRecordingStore ({
    maxBranches = 128,
    rootBranchId = 'main',
    rootRecording
} = {}) {
    if (rootRecording === undefined) {
        throw new TypeError('rootRecording is required (null is an allowed opaque handle)');
    }
    const history = createForkHistory({maxBranches, rootBranchId});
    const recordings = new Map([[rootBranchId, rootRecording]]);

    const retained = branchId => {
        const branch = history.summaries().find(item => item.branchId === branchId);
        return branch ? {accepted: true, branch, recording: recordings.get(branchId)} :
            refusal('branch-not-retained', {branchId});
    };

    return {
        prepareFork (request) {
            const prior = history.activeBranch().branchId;
            const prepared = history.prepareFork(request);
            if (!prepared.accepted) return prepared;
            let finished = false;
            return {accepted: true, reservation: Object.freeze({
                branchId: prepared.reservation.branchId,
                commit: recording => {
                    if (finished) return {accepted: false, code: 'reservation-finished'};
                    if (recording === undefined) {
                        return {accepted: false, code: 'recording-required'};
                    }
                    const result = prepared.reservation.commit();
                    finished = true;
                    if (!result.accepted) return result;
                    recordings.set(result.branch.branchId, recording);
                    history.activate(prior);
                    return {accepted: true, branch: result.branch};
                },
                abort: () => {
                    if (finished) return {accepted: false, code: 'reservation-finished'};
                    finished = true;
                    return prepared.reservation.abort();
                }
            })};
        },

        fork ({recording, ...request}) {
            if (recording === undefined) {
                throw new TypeError('fork recording is required (null is an allowed opaque handle)');
            }
            const prepared = this.prepareFork(request);
            return prepared.accepted ? prepared.reservation.commit(recording) : prepared;
        },

        activate (branchId) {
            const result = history.activate(branchId);
            if (!result.accepted) return result;
            return {accepted: true, branch: result.branch, recording: recordings.get(branchId)};
        },

        active () {
            const branch = history.activeBranch();
            return {branch, recording: recordings.get(branch.branchId)};
        },

        recordingFor (branchId) {
            return retained(branchId);
        },

        summaries () {
            return history.summaries();
        },

        evictBeforeCheckpoint (eventCursor) {
            const result = history.evictBeforeCheckpoint(eventCursor);
            for (const branchId of result.removed) recordings.delete(branchId);
            return result;
        },

        retention () {
            return history.retention();
        }
    };
}

export default createForkRecordingStore;
