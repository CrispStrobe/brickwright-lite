const DECISIONS = new Set(['qualify', 'reject']);

/**
 * A rejection is a successful evaluation outcome only when the observed,
 * bounded evidence is exactly the rejection recorded in the manifest.
 */
export function evaluateCandidateDecision(candidate, observation) {
    if (!candidate || !DECISIONS.has(candidate.decision)) {
        return {decisionMatched: false, promotionReady: false, reason: 'invalid manifest decision'};
    }
    if (!observation || observation.evidenceComplete !== true) {
        return {decisionMatched: false, promotionReady: false, reason: 'incomplete evidence'};
    }
    if (candidate.decision === 'qualify') {
        const decisionMatched = observation.qualifies === true;
        return {decisionMatched, promotionReady: decisionMatched,
            reason: decisionMatched ? null : 'candidate failed promotion evidence'};
    }
    if (typeof candidate.rejection !== 'string' || !candidate.rejection ||
        !candidate.expectedRejection || typeof candidate.expectedRejection !== 'object') {
        return {decisionMatched: false, promotionReady: false,
            reason: 'rejection has no bounded expected evidence'};
    }
    const expected = candidate.expectedRejection;
    const observed = observation.rejectionEvidence;
    const decisionMatched = observed && Object.keys(expected).every(key =>
        Object.is(observed[key], expected[key]));
    return {decisionMatched: Boolean(decisionMatched), promotionReady: false,
        reason: decisionMatched ? candidate.rejection : 'observed rejection drifted from manifest'};
}
