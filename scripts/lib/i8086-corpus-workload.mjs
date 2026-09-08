import {I8086Machine} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-machine.js';
import {DOSBOX8086, createDos8086} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-dos.js';
import {assemble} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-asm.js';
import {EMU8086_INC, createEmu8086} from '../../overlay/scratch-gui/src/lib/bw-board/i8086-emu8086.js';

export function setupCorpus(source, name) {
    // These corpus programs only set AH=4Ch. Bubble/insertion leave AL='$';
    // heap's print helpers preserve AX (the measured 14 sift operations).
    const expectedExit = ({'bubble_sort.asm':36,'insertion_sort.asm':36,'heap_sort.asm':14})[name] ?? 0;
    const program = assemble(source.replace(/^[ \t]*include[ \t]+["']?emu8086\.inc["']?[ \t]*$/gim, EMU8086_INC), {name,longJumps:true});
    if (program.errors?.length || !program.bytes?.length) throw new Error(JSON.stringify(program.errors));
    const machine = new I8086Machine(DOSBOX8086);
    return {run(repetitions = 100) {
        let steps = 0, output = '', exitCode = null;
        const started = performance.now();
        for (let i = 0; i < repetitions; i++) {
            machine.cpu.reset(); machine.cycles = 0; machine.mem.fill(0);
            createEmu8086(machine).install();
            const dos = createDos8086(machine).install();
            if (program.format === 'exe') dos.loadExe(program.bytes); else dos.loadCom(program.bytes);
            const verdict = dos.run(1_000_000);
            if (!verdict.terminated || verdict.exhausted || verdict.exitCode !== expectedExit || !dos.stdoutChars || dos.report().unsupported.length) {
                throw new Error(`${name}: did not complete successfully: ${JSON.stringify(dos.report())}`);
            }
            steps += verdict.steps; output += dos.stdout; exitCode = verdict.exitCode;
        }
        const wallMs = performance.now() - started;
        let memoryHash = 2166136261;
        for (const value of machine.mem) memoryHash = Math.imul(memoryHash ^ value,16777619);
        return {scope:'reset, load and execute completed corpus programs; excludes assembly',
            repetitions,steps,output,exitCode,memoryHash:memoryHash >>> 0,wallMs,
            programsPerSecond: repetitions * 1000 / wallMs};
    }};
}
