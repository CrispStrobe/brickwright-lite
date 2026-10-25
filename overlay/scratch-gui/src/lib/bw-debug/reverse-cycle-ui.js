const refusal = reason => Object.freeze({accepted: false, reason});

/** Conservative dock eligibility; execution readiness remains runner-owned. */
export function reverseCycleControlStatus ({provider, capabilities, runnerStatus}) {
    if (!provider || provider.fidelity !== 'recorded' || provider.resumable !== true ||
        provider.checkpoint !== true) {
        return refusal('Reverse Cycle requires a recorded, resumable cycle provider with complete checkpoints');
    }
    if (!(capabilities?.steps || []).includes('cycle')) {
        return refusal('The target does not advertise real cycle stepping');
    }
    if (!runnerStatus || runnerStatus.accepted !== true) {
        return refusal(runnerStatus?.reason || 'No retained recorded cycle boundary is available');
    }
    return Object.freeze({accepted: true});
}

export default reverseCycleControlStatus;
