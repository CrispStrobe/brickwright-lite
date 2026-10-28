// The PicoRV32 RV32I soft-core, offered as a first-class FPGA example.
//
// This is the browser-honest form of "a RISC-V soft-core through the FPGA
// chain": selecting the example loads a real CPU (attosoc, built around
// PicoRV32) and its Tang Nano 20K constraints; pressing Synthesise runs the
// hosted Gowin flow (Yosys -> nextpnr -> gowin_pack) and returns a ~2.7k-cell
// bitstream. These are the CI-durable checks — that the example is registered,
// that it is the REAL core and self-contained, that its pins are the board's,
// that the tab's call path carries it to the service, and that its ISC sources
// clear the hosted-synthesis licence screen. The live end-to-end synthesis is
// proven separately by scripts/verify-soft-core-synth.mjs (a dev instrument, not
// a gate, because it needs the network and ~90s of place-and-route).

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EXAMPLES} from '../overlay/scratch-gui/src/lib/bw-fpga/examples.js';
import {synthesise} from '../overlay/scratch-gui/src/lib/bw-fpga/synthesis.js';
import {detectLicence, screenForHostedSynthesis} from '../overlay/scratch-gui/src/lib/bw-fpga/licence.js';

const soc = EXAMPLES.find(e => e.id === 'picorv32-soc');

test('the PicoRV32 soft-core SoC is a registered FPGA example', () => {
    assert.ok(soc, 'picorv32-soc is in EXAMPLES');
    assert.match(soc.label, /PicoRV32/);
    assert.equal(soc.softCore, true);
    assert.equal(soc.model, null, 'a whole CPU is flash-only — not gate-simulated in the tab');
});

test('its Verilog is the real PicoRV32 core inside the attosoc SoC, self-contained', () => {
    assert.match(soc.verilog, /module attosoc\b/, 'the SoC wrapper');
    assert.match(soc.verilog, /module picorv32\b/, 'the actual core');
    // distinctive PicoRV32 internals — proves it is the core, not a stub with the name
    assert.match(soc.verilog, /PROGADDR_RESET/);
    assert.match(soc.verilog, /cpuregs/);
    // firmware inlined: no external $readmemh data file (the hosted service reads
    // every file as Verilog, so a .hex could not ride along)
    assert.doesNotMatch(soc.verilog, /\$readmemh/, 'the ROM is inlined, not read from a data file');
    assert.match(soc.verilog, /rom\[0\] = 8'h/, 'the firmware is present as an inline ROM init');
});

test('its constraints place clk and the six on-board LEDs on real Tang Nano 20K pins', () => {
    assert.match(soc.cst, /IO_LOC\s+"clk"\s+4\b/, 'clk on the 27 MHz pin');
    for (let i = 0; i < 6; i++) {
        assert.match(soc.cst, new RegExp(`IO_LOC\\s+"led\\[${i}\\]"\\s+${15 + i}\\b`), `led[${i}] on pin ${15 + i}`);
    }
    // narrowed 8 -> 6: no led[6]/led[7] the board cannot route (would be an
    // "Unconstrained IO" nextpnr failure)
    assert.doesNotMatch(soc.cst, /led\[[67]\]/, 'no LED beyond the board\'s six');
});

test('the tab\'s synthesise call path carries the whole CPU and its pins to the service', async () => {
    let sent = null;
    const fetchImpl = async (url, opts) => {
        sent = JSON.parse(opts.body);
        return {status: 200, json: async () => ({contract: 1, ok: true, netlist: {modules: {}}, simNetlist: {}, bitstream: 'deadbeef'})};
    };
    // Exactly what fpga-tab.jsx does: one design.v = the example verilog, constraints
    // = the example cst, no explicit top (Yosys auto-top picks attosoc).
    const r = await synthesise({
        files: [{name: 'design.v', source: soc.verilog}],
        constraints: soc.cst,
        endpoint: 'https://synth.example/api',
        fetchImpl
    });
    assert.equal(r.ok, true, 'the client accepts a well-formed response');
    assert.equal(sent.top, null, 'no top is forced — auto-top picks attosoc');
    assert.match(sent.files[0].source, /module picorv32\b/, 'the CPU reaches the service');
    assert.match(sent.constraints, /"led\[5\]"\s+20/, 'the pin constraints reach the service');
});

test('its ISC sources clear the hosted-synthesis licence screen', () => {
    const det = detectLicence(soc.verilog);
    assert.equal(det.family, 'permissive', 'ISC/MIT prose is permissive');
    const screen = screenForHostedSynthesis([{name: 'design.v', source: soc.verilog}]);
    assert.equal(screen.hostedAllowed, true, 'a permissive core may build on the shared server');
    assert.equal(screen.refusals.length, 0);
    assert.equal(screen.warnings.length, 0, 'a recognised permissive licence draws no "unknown" warning');
});

test('detectLicence reads permissive prose without breaking the copyleft screen', () => {
    // The new permissive-prose path (ISC/MIT header, no SPDX tag)…
    assert.equal(detectLicence('/*\n * Permission to use, copy, modify, and/or distribute this\n * software for any purpose with or without fee is hereby granted\n */').family, 'permissive');
    assert.equal(detectLicence('// Permission is hereby granted, free of charge, to any person obtaining a copy').family, 'permissive');
    // …must not weaken the copyleft refusal that keeps GPL cores off the server.
    assert.equal(detectLicence('Licensed under the terms of the GNU General Public License').family, 'copyleft');
    assert.equal(detectLicence('// SPDX-License-Identifier: GPL-3.0-only').family, 'copyleft');
    assert.equal(detectLicence('module x; endmodule').family, 'unknown');
});
