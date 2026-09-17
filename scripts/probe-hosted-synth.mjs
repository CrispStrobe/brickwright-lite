#!/usr/bin/env node
/**
 * The differential the plan owes: a hosted backend and the native toolchain must
 * produce the SAME bitstream, or bug reports across the two are unfalsifiable.
 *
 * docs/TANG-NANO.md §5 requires it in those words — "the same bitstream from
 * either, or bug reports become unfalsifiable". §8d and §8e proved the browser
 * chain byte-identical to native; this proves the HOSTED chain is too, against
 * the same recorded hashes the packer gate uses, so all three tiers are pinned
 * to one number.
 *
 * IT IS A PROBE, NOT A CI GATE, for the reason the browser-chain probe is: it
 * needs a live service, and an existence/deployment fact does not regress the
 * way code does. Point it at a deployment and it reports; give it nothing and it
 * says what it needs and exits, rather than failing.
 *
 * What it asserts when it runs: /api/health is ok, a blinky comes back as the
 * reference bitstream byte for byte, and a GPL-3.0 source is refused BY NAME
 * with synthesis never reached — the licence rule this service exists to
 * enforce, checked in production rather than trusted.
 *
 * Usage:
 *   BW_SYNTH_ENDPOINT=https://synth.example.com/api node scripts/probe-hosted-synth.mjs
 */

import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {DESIGNS, FIXTURES, FAMILY} from './probe-pyodide-packer.mjs';

const ENDPOINT = process.env.BW_SYNTH_ENDPOINT || null;
const DEVICE = 'GW2AR-LV18QN88C8/I7';

// The blinky source and constraints that produce DESIGNS.blink.sha256 natively.
// Kept here rather than read from a fixture because the point is to drive the
// service the way the browser client does — Verilog + a .cst in, bitstream out —
// not to replay a pre-made nextpnr netlist.
const BLINK_V = 'module blink(output led); assign led = 1\'b1; endmodule\n';
const BLINK_CST = 'IO_LOC "led" 73;\nIO_PORT "led" IO_TYPE=LVCMOS33;\n';

async function main () {
    if (!ENDPOINT) {
        process.stderr.write(
            'no endpoint. Set BW_SYNTH_ENDPOINT to a deployment\'s /api base, e.g.\n'
            + '  BW_SYNTH_ENDPOINT=https://synth.example.com/api node scripts/probe-hosted-synth.mjs\n');
        process.exit(2);
    }
    const base = ENDPOINT.replace(/\/+$/, '');

    // 1. health must be ok — the selector is fail-closed, so a live service that
    //    cannot do the work must say 503, and we should not go on if it does.
    const health = await (await fetch(`${base}/health`)).json();
    process.stdout.write(`health ok=${health.ok}  tools=${Object.keys(health.toolVersions || {}).join(', ')}\n`);
    if (!health.ok) { process.stderr.write('service is not healthy; stopping.\n'); process.exit(1); }

    // 2. the blinky must come back as the reference bitstream, byte for byte.
    const synRes = await fetch(`${base}/synth`, {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({
            contract: 1, top: 'blink',
            target: {family: FAMILY, device: DEVICE, vopt: 'family'},
            files: [{name: 'blink.v', source: BLINK_V}], constraints: BLINK_CST
        })
    });
    const syn = await synRes.json();
    if (!syn.ok) { process.stderr.write(`synth failed: ${syn.code} ${syn.reason}\n`); process.exit(1); }
    const raw = Buffer.from(syn.bitstream, 'base64');
    const got = createHash('sha256').update(raw).digest('hex');
    const want = DESIGNS.blink.sha256;
    const same = got === want;
    process.stdout.write(
        `blinky ${raw.length} bytes  sha256 ${got}\n`
        + `native was            ${want}\n`
        + `  ${same ? 'IDENTICAL — the hosted tier agrees with native and browser'
            : 'DIFFERENT — a real finding; record which one the hardware accepts'}\n`);

    // 3. the licence rule, in production: a GPL-3.0 source refused by name,
    //    synthesis never reached.
    const gplRes = await fetch(`${base}/synth`, {
        method: 'POST', headers: {'content-type': 'application/json'},
        body: JSON.stringify({
            contract: 1,
            files: [{name: 'g.v', source: '// SPDX-License-Identifier: GPL-3.0-only\nmodule g; endmodule'}],
            constraints: ''
        })
    });
    const gpl = await gplRes.json();
    const refused = gpl.code === 'source-licence-refused'
        && !('bitstream' in gpl)
        && (gpl.refusals || []).some(r => (r.spdx || '').startsWith('GPL'));
    process.stdout.write(
        `licence refusal: code=${gpl.code} alt=${gpl.alternative} `
        + `spdx=${(gpl.refusals || [{}])[0].spdx}\n`
        + `  ${refused ? 'ENFORCED — refused by name, no bitstream returned'
            : 'NOT ENFORCED — this is the rule the service exists for; stop and fix it'}\n`);

    process.exit(same && refused ? 0 : 1);
}

main().catch(e => { process.stderr.write(`probe error: ${e.message}\n`); process.exit(1); });
