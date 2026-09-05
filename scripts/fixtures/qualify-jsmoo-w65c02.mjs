#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import vm from 'node:vm';

const root = resolve(process.env.W65C02_CANDIDATE_ROOT || '');
const files = ['m6502_opcodes.js', 'm65c02_generated_opcodes.js', 'm6502.js'];
const source = files.map(name => readFileSync(join(root, 'component/cpu/m6502', name), 'utf8')).join('\n');

const context = vm.createContext({
    console: {log() {}},
    dbg: {brk_on_NMIRQ: false, break() { throw new Error('candidate debugger break'); },
        traces: {add() { throw new Error('unexpected trace side effect'); }}},
    D_RESOURCE_TYPES: {M6502: 'm6502'}, TRACERS: {M6502: 'm6502'},
    hex2: value => Number(value).toString(16).padStart(2, '0'),
    serialization_helper(out, from, keys) {
        for (const key of keys) {
            const value = from[key];
            out[key] = value && typeof value.serialize === 'function' ? value.serialize() : structuredClone(value);
        }
    },
    deserialization_helper(to, from, keys) {
        for (const key of keys) {
            if (!Object.hasOwn(from, key)) return false;
            const current = to[key];
            if (current && typeof current.deserialize === 'function') {
                if (!current.deserialize(structuredClone(from[key]))) return false;
            } else to[key] = structuredClone(from[key]);
        }
        return true;
    }
});

const harness = `
${source}
(() => {
  const memory = new Uint8Array(65536);
  memory.set([0xa9, 0x2a, 0x8d, 0x00, 0x80, 0x1a, 0x4c, 0x05, 0x02], 0x0200);
  const clock = {trace_cycles: 0};
  let cpu = new m6502_t(m65c02_opcodes_decoded, clock);
  cpu.first_reset = false;
  cpu.regs.IR = 0xea;
  cpu.regs.PC = 0x0201;
  cpu.regs.S = 0xff;
  cpu.regs.new_I = cpu.regs.P.I;
  cpu.pins.Addr = 0x0200;
  cpu.pins.D = memory[0x0200];
  cpu.pins.RW = 0;
  const tick = () => {
    if (cpu.pins.RW) memory[cpu.pins.Addr & 0xffff] = cpu.pins.D & 0xff;
    else cpu.pins.D = memory[cpu.pins.Addr & 0xffff];
    cpu.cycle();
    return [cpu.pins.Addr & 0xffff, cpu.pins.D & 0xff, cpu.pins.RW ? 1 : 0, cpu.regs.TCU];
  };
  const run = count => {
    const trace = [];
    for (let i = 0; i < count; i++) trace.push(tick());
    return JSON.stringify(trace);
  };
  run(5);
  const checkpoint = {cpu: cpu.serialize(), memory: Array.from(memory), pins: cpu.pins.serialize(),
    trace_cycles: clock.trace_cycles};
  const first = run(31);
  const destination = {cpu: cpu.serialize(), memory: Array.from(memory)};
  const restoredClock = {trace_cycles: checkpoint.trace_cycles};
  const restored = new m6502_t(m65c02_opcodes_decoded, restoredClock);
  if (!restored.deserialize(checkpoint.cpu) || !restored.pins.deserialize(checkpoint.pins)) {
    throw new Error('candidate refused its own snapshot');
  }
  memory.set(checkpoint.memory);
  cpu = restored;
  const replay = run(31);
  const traceEqual = first === replay;
  const replayState = cpu.serialize();
  const stateEqual = JSON.stringify(replayState) === JSON.stringify(destination.cpu);
  const differing = (left, right, prefix = '') => {
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return [prefix];
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .flatMap(key => differing(left[key], right[key], prefix ? prefix + '.' + key : key));
  };
  const stateMismatch = differing(destination.cpu, replayState);
  const memoryEqual = JSON.stringify(Array.from(memory)) === JSON.stringify(destination.memory);
  const equal = traceEqual && stateEqual && memoryEqual;
  return {schema: 1, ticks: 36, snapshotReplay: equal, memory8000: memory[0x8000],
    busActivity: JSON.parse(first).length > 0, traceEqual, stateEqual, memoryEqual, stateMismatch};
})()`;

try {
    const report = new vm.Script(harness, {filename: 'pinned-jsmoo-w65c02-qualification.js'})
        .runInContext(context, {timeout: 5000});
    process.stdout.write(`${JSON.stringify(report)}\n`);
    process.exit(report.snapshotReplay && report.busActivity && report.memory8000 === 0x2a ? 0 : 1);
} catch (error) {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
}
