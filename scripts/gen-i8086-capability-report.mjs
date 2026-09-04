#!/usr/bin/env node
/** Generate the reviewable 8086/80186 capability statement from shipped evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs/generated/I8086-CAPABILITY-REPORT.md');
const rel = p => path.relative(root, p).replaceAll(path.sep, '/');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function capture(text, re, label) {
    const match = text.match(re);
    if (!match) throw new Error(`8086 capability evidence disappeared: ${label}`);
    return match.slice(1);
}

const fmt = n => Number(String(n).replaceAll(',', '')).toLocaleString('en-US');

export function buildI8086CapabilityReport() {
    const cpu = read('overlay/scratch-gui/src/lib/bw-board/i8086.js');
    const disasm = read('overlay/scratch-gui/src/lib/bw-board/i8086-disasm.js');
    const machine = read('overlay/scratch-gui/src/lib/bw-board/i8086-machine.js');
    const runner = read('overlay/scratch-gui/src/lib/bw-debug/debug-runner.js');
    const ciVerifier = read('scripts/verify-bw-board-ci.mjs');
    const browserGate = read('scripts/verify-i8086-browser.mjs');
    const browserBench = read('scripts/bench-i8086-browser.mjs');
    const buildWorkflow = read('.github/workflows/build.yml');
    const pins = JSON.parse(read('vendor-pins.json'));

    const [cpuFiles, cpuVectors] = capture(cpu,
        /STATUS: VECTOR-COMPLETE[^\n]*?(\d+)\/\1 files, ([\d,]+) vectors/,
        '8086 vector-complete status');
    const [v20Vectors] = capture(cpu, /runs ([\d,]+)\/\1 vectors from the[\s\S]{0,80}\*\*v20\*\* suite/,
        '80186/V20 execution-vector total');
    const [disasm8086Vectors] = capture(disasm, /every one of its ([\d,]+) vectors/,
        '8086 disassembly-vector total');
    const [disasm186Vectors] = capture(disasm, /\*\*(\d[\d,]+)\/\1 on text and length\*\*/,
        '80186/V20 disassembly-vector total');
    capture(cpu, /variant:\s*\n?\s*\*?\s*'80186'/, '80186 selectable core variant');
    capture(machine, /@property \{'8086'\|'80186'\}/, 'machine CPU variant contract');
    capture(cpu, /Accuracy tier: architectural state/, 'instruction-level accuracy boundary');
    capture(machine, /Execution is instruction-stepped/, 'machine timing boundary');
    for (const job of ['test', 'vectors', 'corpus', 'vectors186']) {
        capture(ciVerifier, new RegExp(`^    ${job}: \\[`, 'm'), `upstream CI ${job} requirement`);
    }
    capture(buildWorkflow,
        /npm run verify:bwboard-ci[\s\S]*?npm run vendor/,
        'upstream evidence precedes vendoring');
    capture(browserGate, /the 8086 journey made no hosted compiler request/,
        'offline 8086 browser journey');
    const [minimumSamples, minimumRatio] = capture(browserBench,
        /samples\.length < (\d+) \|\| ratio < ([\d.]+)/,
        'browser performance acceptance floor');
    capture(browserBench, /pumpBreakdown: summarizeI8086Pump\(samples\)/,
        'browser pump phase breakdown');
    capture(browserBench, /setupTimeline: timeline/,
        'browser setup and steady-state attribution');
    const [wallBudgetMs, maxQuantumNs] = capture(runner,
        /targetKind === 'i8086' \? \{wallBudgetMs: (\d+), maxQuantumNs: ([\d_]+)\}/,
        '8086 adaptive pump budget');
    const [snapshotMs] = capture(runner, /DEBUG_LIVE_SNAPSHOT_MS = (\d+)/,
        'debug live-snapshot interval');

    const imports = [...machine.matchAll(/^import \{ ([A-Za-z0-9]+) \} from '\.\/(.+\.js)';$/gm)]
        .map(([, symbol, file]) => ({symbol, file}));
    const wanted = new Map([
        ['I8255', 'parallel I/O'], ['I8254', 'timer'], ['I8259', 'interrupt controller'],
        ['I8251', 'serial'], ['I8237', 'DMA'], ['UPD765', 'floppy'],
        ['CGACard', 'CGA'], ['EGACard', 'EGA'], ['VGACard', 'VGA'],
        ['HerculesCard', 'Hercules'], ['PCSpeaker', 'PC speaker'],
        ['SBDSP', 'Sound Blaster DSP'], ['YM3812', 'OPL2']
    ]);
    const devices = imports.filter(x => wanted.has(x.symbol));
    if (devices.length !== wanted.size) {
        const found = new Set(devices.map(x => x.symbol));
        throw new Error(`8086 machine device inventory changed: missing ${[...wanted.keys()].filter(x => !found.has(x)).join(', ')}`);
    }

    const testGroups = [
        ['Assembly → machine → screen', 'test/i8086-asm-examples.test.mjs'],
        ['C → 80186 → DOS result', 'test/c-to-8086.test.mjs'],
        ['Pseudocode execution and refusals', 'test/pseudocode-8086.test.mjs'],
        ['Pin, ADC, timer, speaker and display paths', 'test/pseudocode-8086-pins.test.mjs'],
        ['Chip configuration propagation', 'test/i8086-chips-wiring.test.mjs'],
        ['Keyboard scan-code routing', 'test/i8086-keyboard-routing.test.mjs']
    ].map(([claim, file]) => {
        const source = read(file);
        const sites = (source.match(/\btest\s*\(/g) || []).length;
        if (!sites) throw new Error(`8086 capability evidence has no test declarations: ${file}`);
        return {claim, file, sites};
    });

    const limitations = [
        ['CPU timing', 'Instruction-level architectural state; no prefetch/BIU or T-state schedule', 'overlay/scratch-gui/src/lib/bw-board/i8086.js', /NOT modeled, deliberately: the prefetch queue and the BIU/],
        ['8088 BIU experiment', 'Orders bus operations, but omits wait states, DMA stealing and exact transfer T-states', 'overlay/scratch-gui/src/lib/bw-board/i8088-biu.js', /WHAT THIS DOES NOT MODEL/],
        ['8255', 'Mode 0 exact; modes 1/2 fall back with a warning and no handshake IRQ', 'overlay/scratch-gui/src/lib/bw-board/i8255.js', /MODES 1 AND 2 ARE NOT MODELLED/],
        ['8254', 'Modes 0/2/3/4; no modes 1/5, BCD, or sub-instruction timing', 'overlay/scratch-gui/src/lib/bw-board/i8254.js', /NO MODES 1 OR 5/],
        ['8259', 'One fixed-priority controller; no rotation, poll, cascade, or trigger-mode distinction', 'overlay/scratch-gui/src/lib/bw-board/i8259.js', /NO PRIORITY ROTATION/],
        ['8251', 'Byte protocol only; no bit timing, parity/framing, or synchronous data path', 'overlay/scratch-gui/src/lib/bw-board/i8251.js', /NO BIT TIMING/],
        ['8237', 'Programmer-visible transfer model without bus-cycle arbitration', 'overlay/scratch-gui/src/lib/bw-board/i8237.js', /programmer-visible register model, cycle-count-free/i],
        ['uPD765', 'Sector-level phase machine; no magnetic encoding or physical drive timing', 'overlay/scratch-gui/src/lib/bw-board/upd765.js', /ACCURACY TIER: SECTOR-LEVEL, PHASE-EXACT/],
        ['Video', 'Useful CGA/EGA/VGA/Hercules subsets; frame cadence is not scanline/cycle exact', 'overlay/scratch-gui/src/lib/bw-board/vga-card.js', /NOT THE RASTER/],
        ['OPL2', 'Pitch and envelope-shape target, not chip-identical timbre', 'overlay/scratch-gui/src/lib/bw-board/ym3812.js', /PITCH AND ENVELOPE SHAPE, not timbre/],
        ['Sound Blaster', 'SB 1.x/2.0 8-bit mono subset; no SB16, mixer, or ADC', 'overlay/scratch-gui/src/lib/bw-board/sb-dsp.js', /NOT a 16-bit SB16/]
    ];
    for (const [, , file, anchor] of limitations) capture(read(file), anchor, `${file} accuracy boundary`);

    const rows = devices.map(({symbol, file}) => `| ${wanted.get(symbol)} | \`${file}\` | shipped in \`I8086Machine\` |`).join('\n');
    const tests = testGroups.map(({claim, file, sites}) => `| ${claim} | \`${file}\` | ${sites} declared test site${sites === 1 ? '' : 's'} |`).join('\n');
    const limits = limitations.map(([area, boundary, file]) => `| ${area} | ${boundary} | \`${file}\` |`).join('\n');

    return `# 8086/80186 capability report

Generated by \`scripts/gen-i8086-capability-report.mjs\` from the vendored engine and Lite tests. Do not hand-edit. A normal \`npm test\` run checks that this file matches its evidence.

Vendored engine: \`CrispStrobe/bw-board@${pins['bw-board']}\`.

## CPU evidence

| Surface | Result recorded by the pinned engine | Evidence scope |
|---|---:|---|
| 8086 execution | **${cpuFiles}/${cpuFiles} opcode files; ${fmt(cpuVectors)}/${fmt(cpuVectors)} vectors** | Hardware-generated SingleStepTests architectural end state; cycles excluded |
| 8086 disassembly | **${fmt(disasm8086Vectors)}/${fmt(disasm8086Vectors)} text and length** | Same hardware-derived corpus |
| 80186 execution additions | **${fmt(v20Vectors)}/${fmt(v20Vectors)} usable V20 vectors** | NEC V20 oracle for shared 80186 encodings; not a V20-compatibility claim |
| 80186 disassembly | **${fmt(disasm186Vectors)}/${fmt(disasm186Vectors)} text and length** | V20 disassembly strings, with documented syntax exclusions |

The selectable instruction variants are **8086** and **80186**. The same instruction sets serve 8088 and 80188 machines respectively; their external bus width is outside this instruction-stepped core. This is not a 80286-or-later emulator.

The vector totals above are declarations carried by the pinned, byte-verified engine source and maintained by its upstream grinders. Networked product and release builds run \`npm run verify:bwboard-ci\`, which requires successful upstream \`test\`, \`vectors\`, \`corpus\`, and \`vectors186\` jobs at this exact SHA. Lite does not download the large vector corpora during its own test run. Its local tests instead protect the integration surfaces below.

## Release and browser gates

The upstream-CI verifier fails closed on missing, partial, wrong-SHA or unreachable GitHub evidence and runs before \`npm run vendor\`. It checks named successful steps inside all four required jobs, rather than accepting a workflow's overall badge.

The production-browser gate exercises local assembly with the hosted compiler blocked, DOS-bench startup, CGA pixels, keyboard input and the 8255 face. The companion desktop/mobile benchmark retains a JSON receipt, splits pump time into emulator execution, board advancement and debug/UI publication, and attributes long tasks and script resources across named setup, attach, first-render and steady-pump windows. It rejects fewer than **${minimumSamples}** useful pump samples or less than **${minimumRatio}x XT real time**. Those are regression floors, not claims that every device matches one benchmark runner.

The shipped 8086 runner also bounds one browser callback to **${wallBudgetMs} ms**, with a maximum simulated-time quantum of **${Number(maxQuantumNs.replaceAll('_', '')).toLocaleString('en-US')} ns**, carrying debt forward. Progress-only debug snapshots are built at most every **${snapshotMs} ms**; semantic transitions and failures remain immediate.

## Lite integration evidence

| Claim | Test evidence | Static declaration count |
|---|---|---:|
${tests}

Counts are test declaration sites, not claimed pass totals. The current run result is supplied by the test runner; this document deliberately cannot turn an old run into a permanent green badge.

## Machine inventory

This inventory is extracted from \`i8086-machine.js\` imports; generation fails if the declared set and the machine diverge.

| Device | Module | Status |
|---|---|---|
${rows}

The framebuffer renderer and DOS/BIOS service layer also ship as \`i8086-cga.js\` and \`i8086-dos.js\`. Real-ROM boot acceptance (including MS-DOS) belongs to the pinned upstream system suite; it is not relabelled here as a Lite-local test.

## Accuracy boundaries

| Area | Current boundary | Source of truth |
|---|---|---|
${limits}

These are intentional boundaries, not an exhaustive bug list. The module headers remain authoritative and generation fails when a named boundary disappears, forcing this summary to be reviewed alongside the implementation.
`;
}

export function checkI8086CapabilityReport() {
    const expected = buildI8086CapabilityReport();
    const actual = fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '';
    if (actual !== expected) throw new Error(`${rel(output)} is stale; run npm run gen:8086-report`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (process.argv.includes('--check')) {
        checkI8086CapabilityReport();
        console.log(`${rel(output)} is current`);
    } else {
        fs.mkdirSync(path.dirname(output), {recursive: true});
        fs.writeFileSync(output, buildI8086CapabilityReport());
        console.log(`wrote ${rel(output)}`);
    }
}
