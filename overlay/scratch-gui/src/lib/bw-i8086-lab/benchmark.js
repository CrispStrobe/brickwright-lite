// Isolated, fixed-input benchmark. No project, device, DOM or debugger access.
import {I8086} from 'bw-board/i8086.js';
import {assemble} from 'bw-board/i8086-asm.js';
import {createRegisterBlockExperiment} from './register-block-experiment.js';

export const WORKLOADS = Object.freeze({
    registers: 'Register-only counted loop (best case for Wasm)',
    mixed: 'Mixed arithmetic and RAM',
    strings: 'REP word copies'
});
const bodies = {
    registers: 'ADD AX, BX\nXOR AX, 5A5AH\nINC BX\nINC DX\nADD AX, DX\nDEC BX\nXOR DX, AX\nINC AX\nADD BX, AX\nXOR AX, DX\nDEC DX\nINC BX',
    mixed: 'ADD AX, BX\nXOR AX, 5A5AH\nMOV [0600H], AX\nINC BX',
    strings: 'PUSH CX\nMOV CX, 32\nMOV SI, 0400H\nMOV DI, 0600H\nREP MOVSW\nPOP CX'
};
const registers = ['ax','bx','cx','dx','sp','bp','si','di','cs','ds','es','ss','ip','flags','cycles'];
const yieldToUI = () => new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); };
    channel.port2.postMessage(null);
});
const checkCancelled = signal => { if (signal?.aborted) throw new Error('Benchmark cancelled'); };

async function measure (bytes, mode, cycles, signal) {
    const mem = new Uint8Array(1 << 20);
    mem.fill(0x5a, 0x400, 0x440);
    mem.set(bytes, 0x100);
    const cpu = new I8086({read: a => mem[a], write: (a, v) => { mem[a] = v; }});
    cpu.cs = cpu.ds = cpu.es = cpu.ss = 0; cpu.ip = 0x100; cpu.sp = 0xfffe;
    cpu.ax = 1; cpu.bx = 3;
    const executor = mode === 'js' ? null : createRegisterBlockExperiment(cpu, mem, mode,
        {loopOnly: mode === 'wasm'});
    let wallMs = 0;
    // Sum execution slices only: cooperative yields, setup and hashes are not timed.
    for (let deadline = 20000; deadline <= cycles; deadline += 20000) {
        checkCancelled(signal);
        const start = performance.now();
        if (executor) executor.runUntil(deadline);
        else while (cpu.cycles < deadline) cpu.step();
        wallMs += performance.now() - start;
        await yieldToUI();
    }
    checkCancelled(signal);
    let hash = 2166136261;
    for (const byte of mem) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    const state = {registers: registers.map(name => cpu[name]), memoryHash: hash};
    if (!(cpu.cycles >= cycles && wallMs > 0)) throw new Error('Benchmark made no measurable progress');
    return {wallMs, realTimeRatio: cpu.cycles / 5000 / wallMs, state,
        stats: executor ? {...executor.stats} : null};
}

export async function compareSandbox ({workload = 'registers', signal, onProgress = () => {}, cycles = 1000000} = {}) {
    if (!Object.hasOwn(bodies, workload)) throw new Error('Unknown bundled workload');
    if (!Number.isInteger(cycles) || cycles < 20000 || cycles > 2000000 || cycles % 20000) {
        throw new Error('Invalid bounded benchmark budget');
    }
    const program = assemble(`ORG 100H\nMAIN: MOV CX, 1024\nINNER:\n${bodies[workload]}\nLOOP INNER\nJMP MAIN\nEND`, {format: 'com'});
    if (program.errors?.length || !program.bytes?.length) throw new Error('Bundled program failed assembly');
    const modes = typeof WebAssembly === 'object' ? ['js','decoded','wasm'] : ['js','decoded'];
    const samples = Object.fromEntries(modes.map(mode => [mode, []]));
    const warmup = {};
    let reference;
    // One warmup and three fresh-instance repetitions, alternating execution order.
    for (let repetition = 0; repetition < 4; repetition++) {
        for (const mode of repetition % 2 ? [...modes].reverse() : modes) {
            checkCancelled(signal);
            onProgress(`${repetition ? `Sample ${repetition}/3` : 'Warmup'}: ${mode}`);
            const result = await measure(program.bytes, mode, cycles, signal);
            const serialized = JSON.stringify(result.state);
            if (reference && reference !== serialized) throw new Error(`Correctness mismatch: ${mode}; results rejected`);
            reference = serialized;
            if (repetition) samples[mode].push(result);
            else warmup[mode] = result.wallMs;
        }
    }
    const rows = modes.map(mode => {
        const times = samples[mode].map(x => x.wallMs).sort((a,b) => a-b);
        const rates = samples[mode].map(x => x.realTimeRatio).sort((a,b) => a-b);
        return {mode, medianMs: times[1], minMs: times[0], maxMs: times[2], realTimeRatio: rates[1],
            warmupMs: warmup[mode], samples: samples[mode], correctness: 'matched'};
    });
    for (const row of rows) row.speedup = rows[0].medianMs / row.medianMs;
    return {workload, cycles, rows, unavailable: modes.includes('wasm') ? [] : ['wasm'],
        scope: 'Bundled bare-CPU workload, 5 MHz guest; execution and compilation timed, setup/yields/hash excluded. No project or device integration.'};
}
