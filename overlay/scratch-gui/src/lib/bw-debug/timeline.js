/** Bounded, target-neutral selection model for synchronized debugger panes. */

const clone = value => structuredClone(value);

const refusal = (code, details = {}) => ({accepted: false, code, ...details});
const ordinal = value => {
    if (typeof value === 'bigint' && value >= 0n) return value;
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value);
    return null;
};

export function createDebugTimeline ({capacity = 4096} = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
        throw new TypeError('timeline capacity must be a positive safe integer');
    }
    let events = [];
    let gaps = [];
    let selectedSeq = null;
    let evicted = 0;

    const selection = () => events.find(event => ordinal(event.seq) === ordinal(selectedSeq)) || null;
    const selectIndex = index => {
        if (index < 0 || index >= events.length) return refusal('event-not-retained');
        selectedSeq = events[index].seq;
        return {accepted: true, event: clone(events[index])};
    };

    return {
        append (batch) {
            if (!Array.isArray(batch)) throw new TypeError('timeline append requires an event array');
            for (const event of batch) {
                if (event?.kind === 'gap') {
                    if (!Number.isSafeInteger(event.dropped) || event.dropped < 1 ||
                        ordinal(event.beforeSeq) == null) {
                        throw new TypeError('timeline gaps require dropped and beforeSeq integers');
                    }
                    gaps.push(clone(event));
                    if (gaps.length > capacity) gaps.splice(0, gaps.length - capacity);
                    continue;
                }
                if (!event || ordinal(event.seq) == null) {
                    throw new TypeError('timeline events require a non-negative ordinal seq');
                }
                const previous = events.at(-1)?.seq;
                if (previous != null && ordinal(event.seq) <= ordinal(previous)) {
                    throw new RangeError(`timeline seq ${event.seq} does not follow ${previous}`);
                }
                events.push(clone(event));
                if (selectedSeq == null) selectedSeq = event.seq;
            }
            if (events.length > capacity) {
                const remove = events.length - capacity;
                events.splice(0, remove);
                evicted += remove;
                if (selection() == null) selectedSeq = events[0]?.seq ?? null;
            }
            return this.state();
        },

        selectEvent (seq) {
            if (ordinal(seq) == null) return refusal('invalid-event-sequence', {seq});
            const index = events.findIndex(event => ordinal(event.seq) === ordinal(seq));
            return selectIndex(index);
        },

        /** Select the newest retained event strictly before a recorder cursor. */
        seekCursor (cursor) {
            const value = ordinal(cursor);
            if (value == null) return refusal('invalid-event-cursor', {cursor});
            let candidate = -1;
            for (let index = 0; index < events.length; index++) {
                if (ordinal(events[index].seq) < value) candidate = index;
                else break;
            }
            return candidate < 0 ? refusal('cursor-not-retained', {cursor}) : selectIndex(candidate);
        },

        seekTime ({domain, ticks}) {
            if (typeof domain !== 'string' || (typeof ticks !== 'number' && typeof ticks !== 'bigint')) {
                return refusal('invalid-time');
            }
            let candidate = -1;
            for (let index = 0; index < events.length; index++) {
                const time = events[index].time;
                if (time?.domain !== domain) continue;
                try {
                    if (BigInt(time.ticks) <= BigInt(ticks)) candidate = index;
                    else break;
                } catch {
                    return refusal('invalid-time');
                }
            }
            return candidate < 0 ? refusal('time-not-retained', {domain, ticks}) : selectIndex(candidate);
        },

        older () {
            const index = events.findIndex(event => ordinal(event.seq) === ordinal(selectedSeq));
            return selectIndex(index - 1);
        },

        newer () {
            const index = events.findIndex(event => ordinal(event.seq) === ordinal(selectedSeq));
            return selectIndex(index + 1);
        },

        latest () {
            return selectIndex(events.length - 1);
        },

        state () {
            const event = selection();
            return {
                capacity,
                retained: events.length,
                evicted,
                firstSeq: events[0]?.seq ?? null,
                lastSeq: events.at(-1)?.seq ?? null,
                selectedSeq,
                selectedEvent: event ? clone(event) : null,
                gaps: gaps.map(clone)
            };
        },

        range () {
            return events.map(clone);
        },

        clear () {
            events = [];
            gaps = [];
            selectedSeq = null;
            evicted = 0;
        }
    };
}
