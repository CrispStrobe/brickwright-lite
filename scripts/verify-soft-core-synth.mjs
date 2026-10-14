#!/usr/bin/env node
/**
 * A developer instrument, NOT a CI gate: send the PicoRV32 soft-core example
 * (the `picorv32-soc` entry) through the HOSTED Gowin flow exactly as the FPGA
 * tab does — one `design.v`, the example's `.cst` as constraints, no forced top
 * — and assert the service returns a real Tang Nano 20K bitstream. This is the
 * end-to-end proof that a genuine RISC-V CPU goes through Yosys -> nextpnr ->
 * gowin_pack in the browser's own path. It is not a gate because it needs the
 * network and ~90-160s of place-and-route; the shape and wiring are gated
 * offline by test/fpga-soft-core.test.mjs.
 *
 * Run: node scripts/verify-soft-core-synth.mjs
 *   BW_SYNTHESIS_ENDPOINT   base URL (default the deploy's synth.crispstro.be/api)
 *
 * Exit 0 on a bitstream, 2 if the service is unreachable (a skip, like the
 * ngspice oracle), 1 if it answers but does not build.
 */
import {EXAMPLES} from '../overlay/scratch-gui/src/lib/bw-fpga/examples.js';
import {synthesise, TANG_NANO_20K_TARGET} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesis.js';

const endpoint = process.env.BW_SYNTHESIS_ENDPOINT || 'https://synth.crispstro.be/api';
const soc = EXAMPLES.find(e => e.id === 'picorv32-soc');
if (!soc) { console.error('FAIL: the picorv32-soc example is missing.'); process.exit(1); }

console.log(`Synthesising "${soc.label}" via ${endpoint} (this takes ~1-3 min of place-and-route)…`);
const t0 = Date.now();
const r = await synthesise({
    files: [{name: 'design.v', source: soc.verilog}],
    constraints: soc.cst,
    target: TANG_NANO_20K_TARGET,
    endpoint
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

if (!r.ok && (r.code === 'service-unreachable' || r.code === 'service-error' || r.code === 'no-synthesis-service')) {
    console.log(`SKIP: the synthesis service is not reachable (${r.code}). ${r.reason || ''}`);
    process.exit(2);
}
if (!r.ok) {
    console.error(`FAIL after ${secs}s: ${r.code} — ${r.reason}`);
    if (r.log) console.error('log tail:\n' + String(r.log).slice(-600));
    process.exit(1);
}

const mods = r.netlist && r.netlist.modules ? Object.keys(r.netlist.modules) : [];
let cells = 0;
for (const m of mods) cells += Object.keys(r.netlist.modules[m].cells || {}).length;
const bitstreamLen = r.bitstream ? r.bitstream.length : 0;

console.log(`PASS in ${secs}s: a real RISC-V soft-core built to a Tang Nano 20K bitstream.`);
console.log(`  netlist modules: ${mods.length}   synthesised cells: ${cells}`);
console.log(`  simNetlist: ${r.simNetlist ? 'present (drives the tab board view)' : 'absent'}`);
console.log(`  bitstream: ${bitstreamLen ? bitstreamLen + ' chars' : 'MISSING'}`);
if (!bitstreamLen) { console.error('FAIL: ok but no bitstream.'); process.exit(1); }
process.exit(0);
