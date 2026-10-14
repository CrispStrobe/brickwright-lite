const refusal = (code, reason, details = {}) => ({accepted: false, code, reason, ...details});

/** Map one selected retire event to the existing verified restore/replay path. */
export function createSelectedEventSeekCoordinator ({canReverse, reverseToEvent, onAccepted = () => {}}) {
    const status = event => {
        const capability = canReverse();
        if (!capability.accepted) return capability;
        if (!event) return refusal('no-selected-event', 'Select a recorded instruction first');
        if (event.kind !== 'instruction' || event.phase !== 'retire') {
            return refusal('not-instruction-boundary',
                'The selected event is not a complete instruction-retire boundary',
                {selectedSeq: event.seq, kind: event.kind, phase: event.phase});
        }
        if (!Number.isSafeInteger(event.seq) || event.seq < 0 || event.seq === Number.MAX_SAFE_INTEGER) {
            return refusal('invalid-event-cursor', 'The selected event cannot form a safe replay cursor');
        }
        return {accepted: true, selectedSeq: event.seq, eventCursor: event.seq + 1};
    };
    return {
        status,
        seek (event) {
            const ready = status(event);
            if (!ready.accepted) return ready;
            const result = reverseToEvent(ready.eventCursor);
            if (!result.accepted) return result;
            onAccepted(ready.eventCursor);
            return {...result, selectedSeq: ready.selectedSeq, eventCursor: ready.eventCursor};
        }
    };
}

export default createSelectedEventSeekCoordinator;
