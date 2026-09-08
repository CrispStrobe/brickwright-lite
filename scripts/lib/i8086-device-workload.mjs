import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {DOSBOX8086} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-dos.js';

export const deviceCases = ['dispatch', 'pit-idle', 'pit-active', 'pit-three', 'cga', 'pit-cga'];
const instructionCycles = [4,8,12,16,25,10,17,3];
export function setupDevices(name) {
    if (!deviceCases.includes(name)) throw new Error('Unknown device workload');
    const hasPit = name.startsWith('pit');
    const chips = [];
    if (hasPit) chips.push({kind:'pit', name:'pit1', at:0x40});
    if (name.includes('cga')) chips.push({kind:'cga', name:'cga1', at:0x3d0});
    const machine = new I8086Machine({...DOSBOX8086, chips});
    let events = 0, eventHash = 0;
    const event = value => { events++; eventHash = Math.imul(eventHash ^ value, 16777619) >>> 0; };
    if (name === 'dispatch') {
        machine.attachDevice('counter', {cycles:0, advance(n) { this.cycles += n; }});
    }
    if (hasPit) {
        const pit = machine.chips.pit1;
        pit.hooks.onOutput = (channel, level) => event(machine.cycles ^ channel << 8 ^ level ^ pit.counters[0].ce);
        if (name !== 'pit-idle') for (let i = 0; i < (name === 'pit-three' ? 3 : 1); i++) {
            pit.write(3, i << 6 | 0x36); pit.write(i, 0); pit.write(i, 0);
        }
    }
    if (machine.chips.cga1) machine.chips.cga1.hooks.onVSync = () => event(machine.cycles);
    return {run(iterations = 500000) {
        const before = performance.now();
        // Representative varied instruction costs; no wrappers/timers per device.
        for (let i = 0; i < iterations; i++) {
            const n = instructionCycles[i & 7];
            machine.cycles += n; machine._advanceChips(n);
        }
        const wallMs = performance.now() - before;
        return {wallMs, nsPerAdvance: wallMs * 1e6 / iterations,
            state: {cycles: machine.cycles, events, eventHash,
                pit: machine.chips.pit1?.getState(), frac: machine.chips.pit1?._frac,
                cga: machine.chips.cga1?.getState(), dispatch: machine.devices?.counter.cycles}};
    }};
}
