// Browser-native diagnostic workload. This bypasses UI pacing deliberately;
// production UI latency remains the responsibility of bench-i8086-browser.mjs.
import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {createDos8086, DOSBOX8086} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-dos.js';
import {createI8086DebugTarget} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-debug.js';
import {assemble} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';

const bodies = {
    mixed: `ADD AX, BX
        XOR AX, 5A5AH
        MOV [SI], AX
        INC SI
        INC SI
        CMP SI, 0300H
        JB IN_RANGE
        MOV SI, 0200H
    IN_RANGE:`,
    words: `MOV AX, [SI]
        ADD AX, BX
        MOV [SI], AX
        PUSH AX
        POP DX`,
    strings: `PUSH CX
        MOV CX, 32
        MOV SI, 0200H
        MOV DI, 0400H
        REP MOVSW
        POP CX`,
};

export function setup(layer, workload = 'mixed') {
    if (!bodies[workload]) throw new Error(`Unknown workload ${workload}`);
    if (!['core', 'machine', 'dos', 'debugger', 'peripherals'].includes(layer)) {
        throw new Error(`Unknown layer ${layer}`);
    }
    const source = `ORG 100H
        JMP START
        ORG 110H
    HEARTBEAT DD 0
        ORG 120H
    START:
        MOV AX, 1
        MOV BX, 3
        MOV SI, 0200H
    MAIN:
        MOV CX, 1024
    INNER_LOOP:
        ${bodies[workload]}
        LOOP INNER_LOOP
        ADD WORD PTR [HEARTBEAT], 1
        ADC WORD PTR [HEARTBEAT + 2], 0
        JMP MAIN
        END`;
    const program = assemble(source, {format: 'com'});
    if (program.errors?.length || !program.bytes?.length) throw new Error(JSON.stringify(program.errors));
    const machine = new I8086Machine({...DOSBOX8086, chips: layer === 'peripherals' ? [
        {kind: 'pic', name: 'pic1', at: 0x20},
        {kind: 'pit', name: 'pit1', at: 0x40, irq: 0},
        {kind: 'ppi', name: 'ppi1', at: 0x60},
        {kind: 'cga', name: 'cga1', at: 0x3d0},
    ] : []});
    const dos = createDos8086(machine).install();
    dos.loadCom(program.bytes);
    if (layer === 'peripherals') {
        // Run a real counter while keeping this service-free program's CPU
        // state comparable to the other layers. IRQ delivery has separate tests.
        machine._out(0x21, 0xff);
        machine._out(0x43, 0x36);
        machine._out(0x40, 0);
        machine._out(0x40, 0);
    }
    const cpu = machine.cpu;
    if (layer === 'core') {
        cpu.read = address => machine.mem[address];
        cpu.write = (address, value) => { machine.mem[address] = value; };
    }
    const target = layer === 'debugger' ? createI8086DebugTarget({machine, step: () => dos.step()}) : null;
    target?.run();
    const step = layer === 'core' ? () => { machine.cycles += cpu.step(); } :
        layer === 'dos' ? () => dos.step() : () => machine.step();
    return {
        run(cycles, snapshot = true) {
            const before = machine.cycles;
            const started = performance.now();
            if (target) {
                if (target.runFor(cycles * 1e9 / machine.clockHz) !== 'budget') throw new Error('Unexpected halt');
            } else {
                const deadline = before + cycles;
                while (machine.cycles < deadline) step();
            }
            const wallMs = performance.now() - started;
            if (!snapshot) return {wallMs, cycles: machine.cycles - before};
            const address = (cpu.ds << 4) + 0x110;
            const heartbeat = (machine.mem[address] | machine.mem[address + 1] << 8 |
                machine.mem[address + 2] << 16 | machine.mem[address + 3] << 24) >>> 0;
            const registers = Object.fromEntries(['ax', 'bx', 'cx', 'dx', 'si', 'di', 'sp', 'bp',
                'cs', 'ds', 'es', 'ss', 'ip', 'flags'].map(name => [name, cpu[name]]));
            let memoryHash = 2166136261;
            for (let i = 0; i < machine.mem.length; i++) memoryHash = Math.imul(memoryHash ^ machine.mem[i], 16777619);
            return {wallMs, cycles: machine.cycles - before, totalCycles: machine.cycles,
                realTimeRatio: (machine.cycles - before) * 1000 / machine.clockHz / wallMs,
                heartbeat, registers, memoryHash: memoryHash >>> 0};
        }
    };
}
