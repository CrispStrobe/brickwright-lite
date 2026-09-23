#!/usr/bin/env node
/**
 * Browser proof (live deploy / flag-on CI artifact): the PicoRV32 RV32I
 * soft-core is a REACHABLE example on the FPGA surface, and selecting it loads
 * the real CPU into the Verilog box with its Tang Nano 20K pin constraints.
 *
 * The three tiers of the soft-core proof, so none pretends to be another:
 *   - test/fpga-soft-core.test.mjs   the example's shape, wiring and licence (offline gate)
 *   - THIS script                    the example reaches a user in a real browser
 *   - scripts/verify-soft-core-synth.mjs   it actually builds to a bitstream (dev, network)
 *
 * Run: PROOF_URL=http://host:port/ node scripts/verify-soft-core-surface.mjs
 * Points at a served flag-on build (CI) or the live deploy. On a flag-off build
 * with no FPGA surface it SKIPS (exit 0), unless BW_FPGA_REQUIRE_SURFACE=1.
 */
import {openFpga} from './drive-fpga.mjs';

const base = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite';
const REQUIRE = process.env.BW_FPGA_REQUIRE_SURFACE === '1';

const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

let ctx;
try {
    ctx = await openFpga(base);
} catch (e) {
    const line = String(e).split('\n')[0];
    if (REQUIRE) { console.error(`FAIL: the FPGA surface was required but did not open — ${line}`); process.exit(1); }
    console.log(`SKIP: no FPGA surface here (flag-off build?) — ${line}`);
    process.exit(0);
}

const {page, close} = ctx;
try {
    const socBtn = page.getByRole('button', {name: /PicoRV32/i}).first();
    const present = (await socBtn.count()) > 0;
    check('the PicoRV32 soft-core is offered as an example on the surface', present);

    if (present) {
        await socBtn.click();
        await page.waitForTimeout(1000);
        // The example fills two textareas: the HDL box and the .cst box. Read them
        // by content rather than order (the layout is free to change).
        const boxes = await page.evaluate(() => [...document.querySelectorAll('textarea')].map(t => t.value || ''));
        const hdl = boxes.find(v => /module\s+picorv32/.test(v)) || boxes.slice().sort((a, b) => b.length - a.length)[0] || '';
        const cst = boxes.find(v => /IO_LOC/.test(v)) || '';
        check('selecting it loads the real PicoRV32 core into the Verilog editor',
            /module\s+picorv32/.test(hdl), `${(hdl.length / 1024) | 0} KB in the box`);
        check('the attosoc SoC wrapper loads with it', /module\s+attosoc/.test(hdl));
        check('its Tang Nano 20K LED constraints load into the .cst box', /"led\[5\]"\s+20/.test(cst));
        await page.screenshot({path: 'artifacts/fpga-surface/soft-core.png'}).catch(() => {});
    }
} finally {
    await close();
}

if (failures.length) {
    console.error(`\nFAIL: ${failures.length} soft-core surface check(s) failed.`);
    process.exit(1);
}
console.log('\nPASS: the PicoRV32 soft-core is reachable and loads in a real browser.');
process.exit(0);
