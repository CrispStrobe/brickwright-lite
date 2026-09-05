/** Pure selected-event inspection over retained recorder values; never reads a live target. */

const clone = value => structuredClone(value);
const refusal = (code, reason, details = {}) => Object.freeze({accepted: false, code, reason, ...details});

const freezeView = value => Object.freeze(value);

export function createSelectedEventInspectionStore ({maxMemoryChanges = 256, maxRegisters = 256} = {}) {
    if (!Number.isSafeInteger(maxMemoryChanges) || maxMemoryChanges < 1) {
        throw new RangeError('maxMemoryChanges must be a positive safe integer');
    }
    if (!Number.isSafeInteger(maxRegisters) || maxRegisters < 1) {
        throw new RangeError('maxRegisters must be a positive safe integer');
    }
    let events = [];
    let checkpoints = [];
    let selected = null;

    function load (recording) {
        if (!recording || !Array.isArray(recording.events) || !Array.isArray(recording.checkpoints)) {
            throw new TypeError('inspection recording requires event and checkpoint arrays');
        }
        const nextEvents = clone(recording.events);
        // Checkpoint snapshots are target-owned opaque payloads. Retain only
        // canonical anchor metadata so inspection cannot accidentally invoke,
        // decode, or expose device state.
        const nextCheckpoints = recording.checkpoints.map(checkpoint => ({
            id: checkpoint?.id ?? null,
            eventCursor: checkpoint?.eventCursor,
            time: clone(checkpoint?.time)
        }));
        for (let index = 0; index < nextEvents.length; index++) {
            const event = nextEvents[index];
            if (!Number.isSafeInteger(event?.seq) || event.seq < 0 ||
                (index && event.seq <= nextEvents[index - 1].seq)) {
                throw new TypeError('inspection events require strictly increasing non-negative seq values');
            }
        }
        for (let index = 0; index < nextCheckpoints.length; index++) {
            const checkpoint = nextCheckpoints[index];
            if (!Number.isSafeInteger(checkpoint?.eventCursor) || checkpoint.eventCursor < 0 ||
                (index && checkpoint.eventCursor < nextCheckpoints[index - 1].eventCursor)) {
                throw new TypeError('inspection checkpoints require ordered non-negative event cursors');
            }
        }
        events = nextEvents;
        checkpoints = nextCheckpoints;
        selected = null;
        return status();
    }

    function status () {
        return freezeView({loaded: checkpoints.length > 0, selectedCursor: selected,
            firstCursor: checkpoints[0]?.eventCursor ?? null,
            lastCursor: events.length ? events.at(-1).seq + 1 : checkpoints.at(-1)?.eventCursor ?? null});
    }

    function select (eventCursor) {
        if (!Number.isSafeInteger(eventCursor) || eventCursor < 0) {
            return refusal('invalid-inspection-cursor', 'event cursor must be a non-negative safe integer');
        }
        if (!checkpoints.length) return refusal('inspection-unavailable', 'no retained checkpoint anchors inspection');
        const first = checkpoints[0].eventCursor;
        const last = events.length ? events.at(-1).seq + 1 : checkpoints.at(-1).eventCursor;
        if (eventCursor < first || eventCursor > last) {
            return refusal('inspection-cursor-not-retained', 'event cursor is outside retained recording',
                {eventCursor, firstCursor: first, lastCursor: last});
        }
        let anchor = null;
        let exact = null;
        let previous = null;
        for (const checkpoint of checkpoints) {
            if (checkpoint.eventCursor > eventCursor) break;
            previous = anchor;
            anchor = checkpoint;
            if (checkpoint.eventCursor === eventCursor) exact = checkpoint;
        }
        if (!anchor) return refusal('inspection-anchor-missing', 'no checkpoint precedes the selected cursor');
        const baseline = exact && previous ? previous : anchor;
        const prefix = events.filter(event => event.seq >= baseline.eventCursor && event.seq < eventCursor);
        const instructionEvent = [...prefix].reverse().find(event => event.kind === 'instruction') ?? null;

        const registerChanges = new Map();
        for (const event of prefix) {
            const changes = event.changes?.registers;
            if (!changes || typeof changes !== 'object' || Array.isArray(changes)) continue;
            for (const [name, raw] of Object.entries(changes)) {
                if (!raw || typeof raw !== 'object' || !Object.hasOwn(raw, 'before') ||
                    !(Object.hasOwn(raw, 'after') || Object.hasOwn(raw, 'value'))) continue;
                const after = Object.hasOwn(raw, 'after') ? raw.after : raw.value;
                const prior = registerChanges.get(name);
                registerChanges.set(name, {before: prior ? prior.before : clone(raw.before), after: clone(after)});
            }
        }
        const writes = prefix.filter(event => event.kind === 'memory' &&
            event.memory?.direction === 'write').map(event => ({seq: event.seq,
            time: clone(event.time), memory: clone(event.memory), fidelity: event.fidelity ?? null}));
        const truncatedMemoryChanges = Math.max(0, writes.length - maxMemoryChanges);
        const memoryChanges = writes.slice(-maxMemoryChanges);
        const rawRegisters = instructionEvent?.registersAfter;
        const registerNames = rawRegisters && typeof rawRegisters === 'object' && !Array.isArray(rawRegisters) ?
            Object.keys(rawRegisters) : [];
        const fullRegisters = registerNames.length > 0 && registerNames.length <= maxRegisters ?
            freezeView({available: true, refusal: null, values: freezeView(clone(rawRegisters)),
                provenance: freezeView({eventSeq: instructionEvent.seq,
                    fidelity: instructionEvent.fidelity ?? null})}) :
            freezeView({available: false,
                refusal: registerNames.length > maxRegisters ?
                    `canonical register snapshot exceeds ${maxRegisters} entries` :
                    'latest canonical instruction retire contains no full register snapshot',
                values: null, provenance: null});
        selected = eventCursor;
        return freezeView({accepted: true, eventCursor, anchor: freezeView({id: baseline.id ?? null,
            eventCursor: baseline.eventCursor, time: clone(baseline.time)}),
        registers: freezeView({full: fullRegisters, changes: freezeView({available: registerChanges.size > 0,
            refusal: registerChanges.size ? null : 'canonical events contain no register-change evidence',
            values: freezeView(Object.fromEntries(registerChanges))})}),
        disassembly: instructionEvent ? freezeView({eventSeq: instructionEvent.seq,
            pcBefore: instructionEvent.pcBefore ?? instructionEvent.instruction?.address ?? null,
            pcAfter: instructionEvent.pcAfter ?? null,
            instruction: clone(instructionEvent.instruction ?? null),
            fidelity: instructionEvent.fidelity ?? null}) : null,
        memory: freezeView({changes: Object.freeze(memoryChanges), truncated: truncatedMemoryChanges})});
    }

    return Object.freeze({load, select, status, clear () {
        events = []; checkpoints = []; selected = null; return status();
    }});
}

export default createSelectedEventInspectionStore;
