/** Bounded, renderer-neutral timing view over canonical debugger events. */

const CONTROL = new Set(['m1', 'mreq', 'iorq', 'rd', 'wr', 'rfsh', 'halt', 'wait',
    'int', 'nmi', 'irq', 'reset', 'clock', 'clk', 'rw', 'sync', 'ready', 'hold', 'hlda']);
const GROUP_ORDER = Object.freeze({address: 0, data: 1, control: 2, pin: 3});
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const ordinal = value => {
    if (typeof value === 'bigint' && value >= 0n) return value;
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
    if (typeof value === 'string' && /^0x[0-9a-f]+$/i.test(value)) return BigInt(value);
    return null;
};
const clone = value => structuredClone(value);
const canonical = value => {
    if (typeof value === 'bigint') return `0x${value.toString(16)}`;
    if (Array.isArray(value)) return value.map(canonical);
    if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
};
const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
};
const laneGroup = name => name === 'address' ? 'address' : name === 'data' ? 'data' :
    CONTROL.has(name.toLowerCase()) ? 'control' : 'pin';
const digital = value => typeof value === 'boolean' || typeof value === 'bigint' ||
    (Number.isSafeInteger(value) && value >= 0);
const normalizedValue = value => typeof value === 'boolean' ? Number(value) : value;

export function createTimingWaveform ({capacity = 4096, maxLanes = 64} = {}) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || !Number.isSafeInteger(maxLanes) || maxLanes < 1) {
        throw new TypeError('waveform capacity and maxLanes must be positive safe integers');
    }
    let rows = [];
    let selectedSeq = null;
    let range = null;
    let trigger = null;
    let dropped = 0;
    const admittedLanes = new Set();

    const indexOf = seq => rows.findIndex(row => row.ordinal === ordinal(seq));
    const visibleBounds = () => {
        if (!rows.length) return [0, -1];
        if (!range) return [0, rows.length - 1];
        return [Math.max(0, indexOf(range.startSeq)), Math.max(0, indexOf(range.endSeq))];
    };
    const selectIndex = index => {
        if (index < 0 || index >= rows.length) return {accepted: false, code: 'waveform-cursor-not-retained'};
        selectedSeq = rows[index].seq;
        return {accepted: true, selectedSeq};
    };
    const laneMap = row => new Map(row.samples.map(sample => [sample.lane, sample.value]));
    const triggerMatch = index => {
        const now = laneMap(rows[index]).get(trigger.lane);
        if (now === undefined) return false;
        const before = index ? laneMap(rows[index - 1]).get(trigger.lane) : undefined;
        if (trigger.edge === 'rising') return before !== undefined && BigInt(before) === 0n && BigInt(now) !== 0n;
        if (trigger.edge === 'falling') return before !== undefined && BigInt(before) !== 0n && BigInt(now) === 0n;
        if (trigger.edge === 'change') return before !== undefined && BigInt(before) !== BigInt(now);
        return trigger.value === undefined || BigInt(now) === BigInt(trigger.value);
    };

    const api = {
        append (events) {
            if (!Array.isArray(events)) throw new TypeError('waveform append requires an event array');
            for (const event of events) {
                const seq = ordinal(event?.seq);
                if (seq === null) throw new TypeError('waveform events require a canonical sequence');
                if (rows.length && seq <= rows.at(-1).ordinal) throw new RangeError('waveform sequence must increase');
                const signals = plain(event.signals) ? event.signals : {};
                const sources = {...signals};
                if (event.memory) {
                    if (sources.address === undefined) sources.address = event.memory.address;
                    if (sources.data === undefined) sources.data = event.memory.value;
                }
                if (event.port) {
                    if (sources.address === undefined) sources.address = event.port.address;
                    if (sources.data === undefined && event.port.value !== undefined) sources.data = event.port.value;
                }
                const candidates = Object.keys(sources).filter(name => digital(sources[name]))
                    .sort((a, b) => GROUP_ORDER[laneGroup(a)] - GROUP_ORDER[laneGroup(b)] || a.localeCompare(b))
                    .filter(name => admittedLanes.has(name) || admittedLanes.size < maxLanes);
                for (const name of candidates) if (admittedLanes.size < maxLanes) admittedLanes.add(name);
                const samples = candidates.filter(name => admittedLanes.has(name))
                    .map(name => ({lane: name, group: laneGroup(name),
                        value: normalizedValue(sources[name])}));
                rows.push({seq: event.seq, ordinal: seq, time: clone(event.time), cpuId: event.cpuId,
                    provenance: event.fidelity, samples});
                if (selectedSeq === null) selectedSeq = event.seq;
            }
            if (rows.length > capacity) {
                const remove = rows.length - capacity; rows.splice(0, remove); dropped += remove;
                if (indexOf(selectedSeq) < 0) selectedSeq = rows[0]?.seq ?? null;
                range = null;
            }
            return api.view();
        },
        selectEvent (seq) {
            const parsed = ordinal(seq);
            if (parsed === null) return {accepted: false, code: 'invalid-waveform-cursor'};
            return selectIndex(indexOf(seq));
        },
        setRange ({startSeq, endSeq}) {
            const start = indexOf(startSeq); const end = indexOf(endSeq);
            if (start < 0 || end < start) return {accepted: false, code: 'waveform-range-not-retained'};
            range = {startSeq: rows[start].seq, endSeq: rows[end].seq};
            return {accepted: true, range: clone(range)};
        },
        zoom (factor) {
            if (!Number.isFinite(factor) || factor <= 0) return {accepted: false, code: 'invalid-waveform-zoom'};
            const [start, end] = visibleBounds(); const size = end - start + 1;
            const next = Math.max(1, Math.min(rows.length, Math.round(size / factor)));
            const center = Math.max(0, indexOf(selectedSeq));
            const left = Math.max(0, Math.min(rows.length - next, center - Math.floor(next / 2)));
            range = rows.length ? {startSeq: rows[left].seq, endSeq: rows[left + next - 1].seq} : null;
            return {accepted: true, range: clone(range)};
        },
        pan (delta) {
            if (!Number.isSafeInteger(delta)) return {accepted: false, code: 'invalid-waveform-pan'};
            const [start, end] = visibleBounds(); const size = end - start + 1;
            const left = Math.max(0, Math.min(rows.length - size, start + delta));
            range = rows.length ? {startSeq: rows[left].seq, endSeq: rows[left + size - 1].seq} : null;
            return {accepted: true, range: clone(range)};
        },
        setTrigger (next) {
            if (!plain(next) || typeof next.lane !== 'string' || !next.lane ||
                (next.edge !== undefined && !['rising', 'falling', 'change'].includes(next.edge)) ||
                (next.value !== undefined && !digital(next.value))) {
                return {accepted: false, code: 'invalid-waveform-trigger'};
            }
            trigger = clone(next); return {accepted: true, trigger: clone(trigger)};
        },
        previousTrigger () {
            if (!trigger) return {accepted: false, code: 'waveform-trigger-not-set'};
            for (let i = indexOf(selectedSeq) - 1; i >= 0; i--) if (triggerMatch(i)) return selectIndex(i);
            return {accepted: false, code: 'waveform-trigger-not-retained'};
        },
        nextTrigger () {
            if (!trigger) return {accepted: false, code: 'waveform-trigger-not-set'};
            for (let i = indexOf(selectedSeq) + 1; i < rows.length; i++) if (triggerMatch(i)) return selectIndex(i);
            return {accepted: false, code: 'waveform-trigger-not-retained'};
        },
        view () {
            const [start, end] = visibleBounds(); const shown = end < start ? [] : rows.slice(start, end + 1);
            const lanes = new Map();
            for (const row of shown) for (const sample of row.samples) lanes.set(sample.lane, sample.group);
            return freeze({schema: 1, capacity, maxLanes, dropped, selectedSeq,
                range: shown.length ? {startSeq: shown[0].seq, endSeq: shown.at(-1).seq} : null,
                trigger: clone(trigger), lanes: [...lanes].map(([id, group]) => ({id, group})),
                samples: shown.map(row => ({seq: row.seq, time: clone(row.time), cpuId: row.cpuId,
                    provenance: row.provenance, values: Object.fromEntries(row.samples.map(x => [x.lane, x.value]))}))});
        },
        exportJSON () { return JSON.stringify(canonical(api.view())); },
        exportVCD () {
            const view = api.view(); const ids = view.lanes.map((_, i) => String.fromCharCode(33 + i));
            const clocks = new Map(view.samples.map(sample => [sample.time?.domain, sample.time?.hz]));
            if (clocks.size > 1 || [...clocks].some(([domain, hz]) => typeof domain !== 'string' ||
                !Number.isSafeInteger(hz) || hz < 1 || ordinal(view.samples[0]?.time?.ticks) === null)) {
                throw new TypeError('VCD export requires one clock domain with an integer frequency');
            }
            const hz = BigInt(view.samples[0]?.time?.hz || 1);
            const widths = view.lanes.map(lane => Math.max(1, ...view.samples.map(sample => {
                const value = sample.values[lane.id];
                return value === undefined ? 1 : BigInt(value).toString(2).length;
            })));
            const lines = ['$date deterministic $end', '$version Brickworks waveform schema 1 $end',
                '$timescale 1ps $end', `$comment clock-domain ${view.samples[0]?.time?.domain || 'empty'} $end`,
                '$scope module debugger $end'];
            view.lanes.forEach((lane, i) => lines.push(`$var wire ${widths[i]} ${ids[i]} ${lane.id.replace(/\s/g, '_')} $end`));
            lines.push('$upscope $end', '$enddefinitions $end');
            view.samples.forEach(sample => {
                const ticks = ordinal(sample.time.ticks);
                if (ticks === null) throw new TypeError('VCD export requires non-negative integer ticks');
                lines.push(`#${ticks * 1_000_000_000_000n / hz}`);
                view.lanes.forEach((lane, i) => {
                    const value = sample.values[lane.id]; if (value === undefined) return;
                    const bits = BigInt(value).toString(2).padStart(widths[i], '0');
                    lines.push(widths[i] === 1 ? `${bits}${ids[i]}` : `b${bits} ${ids[i]}`);
                });
            });
            return `${lines.join('\n')}\n`;
        }
    };
    return api;
}
