// Probe THE crucial runtime unknown (MICROBIT-NATIVE Stage 3, the task's named
// risk): does the shipped WASM sim deliver serial_input to a MicroPython program
// blocked in input(), so a debug HALT can be resumed over serial?
//
// Requires the built app served (PROOF_URL, default http://localhost:8661/) so
// the sim assets under static/microbit-sim/ are reachable. Embeds its own
// harness page (an iframe + a serial bridge) via setContent, so it needs no
// committed harness file.
//
// FINDINGS, verified 2026-08-19 by driving the real sim from Playwright:
//   1. HALT works: the instrumented _bw_pos prints \x1e!<n> and BLOCKS in input().
//   2. The sim's input() is a COOKED terminal, not a raw pipe:
//        - it completes only on '\r' (CR); a bare '\n' (LF) never returns
//          → the program deadlocks silently;
//        - it STRIPS the RS byte '\x1e' before returning, so sending '\x1es\r'
//          makes input() return 's', not '\x1es'.
//   3. With the host sending CR (this repo's controller does) AND the codegen
//      comparing the RS-stripped char (c[-1:] == 's'/'c', the required one-line
//      upstream fix to _bw_pos), the FULL round-trip works: halt → step (resume
//      + re-halt at the next block) → continue (run to end).
//
// This probe uses the CORRECTED _bw_pos (the upstream fix) so it is a green
// regression guard for the mechanism + the host CR terminator. Against the
// as-currently-shipped _bw_pos (`c == '\x1es'`) the resume DEADLOCKS — that is
// the bug this probe documents and the reason the host alone cannot fix it.
import {chromium} from 'playwright';

const URL = process.env.PROOF_URL || 'http://localhost:8661/';
const RS = '\x1e';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// The instrumented program, with the CORRECTED _bw_pos (compares c[-1:], the
// RS-stripped command char). Two blocks: block 0 is a breakpoint (halts).
const PROG = [
    '_bw_step = 0',
    'def _bw_pos(n, bp=0):',
    '    global _bw_step',
    "    print('\\x1e' + str(n))",
    '    if bp or _bw_step:',
    '        _bw_step = 0',
    "        print('\\x1e!' + str(n))",
    '        while True:',
    '            try:',
    '                c = input()',
    '            except Exception:',
    '                return',
    '            c = c[-1:]',                  // tolerate the sim stripping \x1e
    "            if c == 's':",
    '                _bw_step = 1',
    '                return',
    "            if c == 'c':",
    '                return',
    '_bw_pos(0, 1)',
    "print('AFTER_0')",
    '_bw_pos(1, 0)',
    "print('AFTER_1')",
    "print('DONE')"
].join('\n');

const HARNESS = `<!DOCTYPE html><meta charset=utf-8>
<iframe id=sim src="${URL}static/microbit-sim/simulator.html"
        sandbox="allow-scripts allow-same-origin" style="width:400px;height:400px;border:0"></iframe>
<script>
  window.__serial=''; window.__ready=false; window.__pending=null;
  const sim=document.getElementById('sim');
  window.addEventListener('message', e=>{
    if(e.source!==sim.contentWindow) return;
    const d=e.data||{};
    if(d.kind==='ready') window.__ready=true;
    if(d.kind==='serial_output'&&typeof d.data==='string') window.__serial+=d.data;
    if(d.kind==='request_flash'&&window.__pending) window.__flash(window.__pending);
  });
  window.__flash=code=>sim.contentWindow.postMessage({kind:'flash',filesystem:{'main.py':new TextEncoder().encode(code)}},'*');
  window.__serialIn=t=>sim.contentWindow.postMessage({kind:'serial_input',data:t},'*');
</script>`;

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    // Serve the harness from the SAME origin as the sim so postMessage source
    // checks line up.
    await page.route(`${URL}__harness`, route =>
        route.fulfill({contentType: 'text/html', body: HARNESS}));
    await page.goto(`${URL}__harness`);
    await page.waitForFunction(() => window.__ready === true, null, {timeout: 20000});
    console.log('  ok: sim ready');

    // The sim needs its AudioContext created from a REAL user gesture (the play
    // button) before start() runs — same as the app. Set pending, click play.
    await page.evaluate((code) => { window.__pending = code; }, PROG);
    await page.frameLocator('#sim').locator('.play-button').click();

    const has = async (sub, ms = 8000) => {
        const t0 = Date.now();
        for (;;) {
            if ((await page.evaluate(() => window.__serial)).includes(sub)) return true;
            if (Date.now() - t0 > ms) return false;
            await sleep(150);
        }
    };

    const halted = await has(`${RS}!0`);
    console.log(halted ? '  ok: HALT — \\x1e!0 received, program blocked in input()'
        : '  FAIL: never halted at the breakpoint');
    const notYet = !(await page.evaluate(() => window.__serial)).includes('AFTER_0');
    console.log(notYet ? '  ok: did NOT run past the breakpoint before resume'
        : '  FAIL: ran past the breakpoint without a resume');

    await page.evaluate((s) => window.__serialIn(s), `${RS}s\r`);   // STEP (CR!)
    const stepped = await has('AFTER_0');
    console.log(stepped ? '  ok: STEP resumed a blocked input() — AFTER_0 printed (CRUCIAL UNKNOWN: CONFIRMED)'
        : '  FAIL: STEP did not resume (serial_input not delivered / wrong terminator)');
    const reHalt = await has(`${RS}!1`);
    console.log(reHalt ? '  ok: step re-halted at the next block (\\x1e!1) — the latch works'
        : '  FAIL: step did not re-halt at the next block');

    await page.evaluate((s) => window.__serialIn(s), `${RS}c\r`);   // CONTINUE (CR!)
    const done = await has('DONE');
    console.log(done ? '  ok: CONTINUE ran to completion — AFTER_1 / DONE printed'
        : '  FAIL: CONTINUE did not resume to completion');

    const raw = await page.evaluate(() => window.__serial);
    console.log('\n  raw serial (RS shown as <RS>): '
        + JSON.stringify(raw).replace(/\\u001e/g, '<RS>'));

    const pass = halted && notYet && stepped && reHalt && done;
    console.log(pass ? '\nRESUME PROBE PASSED (mechanism + host CR terminator verified end-to-end)'
        : '\nRESUME PROBE FAILED');
    await browser.close();
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
