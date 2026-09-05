#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import vm from 'node:vm';

const root = resolve(process.env.W65C02_CANDIDATE_ROOT || '');
const files = ['m6502_opcodes.js', 'm65c02_generated_opcodes.js', 'm6502.js'];
const source = files.map(name => readFileSync(join(root, 'component/cpu/m6502', name), 'utf8')).join('\n');
const oracleRoot = resolve(process.env.W65C02_ORACLE_ROOT || '');
const manifest = JSON.parse(readFileSync(new URL('../../test/fixtures/cycle-core-candidates.json', import.meta.url)));
const oracle = manifest.candidates.w65c02.oracle;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const qualificationVectors = [];
const vectorReceipts = [];
for (const path of oracle.vectorPaths || []) {
    const bytes = readFileSync(join(oracleRoot, path));
    const actualHash = sha256(bytes);
    if (actualHash !== oracle.vectorSha256[path]) {
        throw new Error(`W65C02 oracle hash mismatch for ${path}: ${actualHash}`);
    }
    const vectors = JSON.parse(bytes).slice(0, oracle.vectorsPerOpcode);
    if (vectors.length !== oracle.vectorsPerOpcode) {
        throw new Error(`W65C02 oracle shard ${path} has only ${vectors.length} vectors`);
    }
    qualificationVectors.push(...vectors.map(vector => ({path, vector})));
    vectorReceipts.push({path, sha256: actualHash, selected: vectors.length});
}

const context = vm.createContext({
    console: {log() {}},
    dbg: {brk_on_NMIRQ: false, break() { throw new Error('candidate debugger break'); },
        traces: {add() { throw new Error('unexpected trace side effect'); }}},
    D_RESOURCE_TYPES: {M6502: 'm6502'}, TRACERS: {M6502: 'm6502'},
    qualificationVectors, vectorReceipts, oracleExcluded: oracle.excluded,
    hex2: value => Number(value).toString(16).padStart(2, '0'),
    mksigned8: value => (value & 0x80) ? value - 0x100 : value,
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
  const executeVector = item => {
    const test = item.vector;
    const memory = new Uint8Array(65536);
    for (const [address, value] of test.initial.ram) memory[address & 0xffff] = value & 0xff;
    const clock = {trace_cycles: 0};
    const candidate = new m6502_t(m65c02_opcodes_decoded, clock);
    candidate.first_reset = false;
    candidate.regs.TCU = 0;
    candidate.regs.IR = test.initial.ram.find(([address]) => address === test.initial.pc)?.[1];
    candidate.regs.PC = (test.initial.pc + 1) & 0xffff;
    candidate.regs.S = test.initial.s & 0xff;
    candidate.regs.A = test.initial.a & 0xff;
    candidate.regs.X = test.initial.x & 0xff;
    candidate.regs.Y = test.initial.y & 0xff;
    candidate.regs.P.setbyte(test.initial.p & 0xff);
    candidate.regs.new_I = candidate.regs.P.I;
    candidate.pins.Addr = test.initial.pc & 0xffff;
    candidate.pins.D = memory[candidate.pins.Addr];
    candidate.pins.RW = 0;
    const actualCycles = [];
    for (let cycle = 0; cycle < test.cycles.length; cycle++) {
      const address = candidate.pins.Addr & 0xffff;
      if (candidate.pins.RW) {
        memory[address] = candidate.pins.D & 0xff;
        actualCycles.push([address, candidate.pins.D & 0xff, 'write']);
      } else {
        candidate.pins.D = memory[address];
        actualCycles.push([address, candidate.pins.D & 0xff, 'read']);
      }
      candidate.cycle();
    }
    // JSMoo keeps regs.PC one byte beyond the externally visible prefetch
    // address at an instruction boundary; the vector's architectural PC is
    // the address currently presented on the bus.
    const actual = {pc: candidate.pins.Addr & 0xffff, s: candidate.regs.S & 0xff,
      a: candidate.regs.A & 0xff, x: candidate.regs.X & 0xff, y: candidate.regs.Y & 0xff,
      p: candidate.regs.P.getbyte() & 0xff};
    const expected = test.final;
    const registerDiffs = {};
    for (const key of ['pc', 's', 'a', 'x', 'y', 'p']) {
      if (actual[key] !== expected[key]) registerDiffs[key] = {expected: expected[key], actual: actual[key]};
    }
    const memoryDiffs = test.final.ram.filter(([address, value]) => memory[address & 0xffff] !== (value & 0xff))
      .slice(0, 8).map(([address, value]) => ({address, expected: value, actual: memory[address & 0xffff]}));
    const busEqual = JSON.stringify(actualCycles) === JSON.stringify(test.cycles);
    const retireEqual = Object.keys(registerDiffs).length === 0 && memoryDiffs.length === 0;
    const statusOnly = !retireEqual && memoryDiffs.length === 0 && Object.keys(registerDiffs).length === 1 &&
      registerDiffs.p && ((registerDiffs.p.expected ^ registerDiffs.p.actual) === 0x10);
    return {path: item.path, name: test.name, retireEqual, busEqual, statusOnly,
      registerDiffs, memoryDiffs,
      ...(busEqual ? {} : {expectedCycles: test.cycles, actualCycles})};
  };
  const corpusResults = qualificationVectors.map(executeVector);
  const corpusFailures = corpusResults.filter(result => !result.retireEqual || !result.busEqual);
  const perOpcode = vectorReceipts.map(receipt => {
    const results = corpusResults.filter(result => result.path === receipt.path);
    return {path: receipt.path, total: results.length,
      retirePassed: results.filter(result => result.retireEqual).length,
      busPassed: results.filter(result => result.busEqual).length,
      statusLatchOnly: results.filter(result => result.statusOnly && result.busEqual).length};
  });
  // Preserve both failure classes. A simple first-N slice was dominated by
  // the known B-latch mismatch and could hide a later bus discrepancy.
  const failures = [
    ...corpusFailures.filter(result => result.busEqual).slice(0, 6),
    ...corpusFailures.filter(result => !result.busEqual).slice(0, 6)
  ];
  const corpus = {total: corpusResults.length,
    retirePassed: corpusResults.filter(result => result.retireEqual).length,
    busPassed: corpusResults.filter(result => result.busEqual).length,
    statusLatchOnly: corpusResults.filter(result => result.statusOnly && result.busEqual).length,
    failures, perOpcode, vectorReceipts, excluded: oracleExcluded};

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
    busActivity: JSON.parse(first).length > 0, traceEqual, stateEqual, memoryEqual, stateMismatch, corpus};
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
