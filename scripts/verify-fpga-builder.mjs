/**
 * Real-browser proof for the flagged FPGA builder journey.
 *
 * This deliberately requires an already-served exact candidate. A stale local
 * build cannot prove a source checkout, and the FPGA flag and hosted synthesis
 * endpoint are build-time inputs.
 *
 *   PROOF_URL=https://candidate.example/ node scripts/verify-fpga-builder.mjs
 *   FPGA_SKIP_SYNTH=1 ... # visual-only development run; never a release receipt
 */
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL;
if (!url) throw new Error('PROOF_URL is required: point it at the exact flagged candidate artifact');
const skipSynth = process.env.FPGA_SKIP_SYNTH === '1';
const timeout = Number(process.env.FPGA_PROOF_TIMEOUT || 180000);
const artifacts = resolve(process.env.FPGA_PROOF_ARTIFACTS || 'artifacts/fpga-builder');
await mkdir(artifacts, {recursive: true});

const checks = [];
const check = (value, message, detail = '') => {
    checks.push({message, ok: Boolean(value), detail});
    if (!value) throw new Error(`${message}${detail ? `: ${detail}` : ''}`);
    console.log(`  ok: ${message}${detail ? ` — ${detail}` : ''}`);
};

const diagnostics = [];
const browser = await chromium.launch({headless: true});
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', error => diagnostics.push(`pageerror: ${error.stack || error.message}`));
page.on('console', message => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`);
});

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        localStorage.setItem('bw-fpga-enabled', '1');
        window.__fpgaOutputs = [];
        window.addEventListener('bw-fpga-output', event => window.__fpgaOutputs.push(event.detail));
    });
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 90000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    const fpgaTab = page.locator('[role="tab"]', {hasText: /FPGA/i}).first();
    check(await fpgaTab.count() === 1, 'the exact artifact contains the flagged FPGA tab');
    await fpgaTab.click();
    await page.getByRole('heading', {name: /FPGA.*Tang Nano 20K/i}).waitFor({timeout: 30000});

    // The second builder is the React Flow canvas. It starts with a wired AND,
    // so this drives an actual visual model through the model bridge and HDL
    // generator without depending on pixel coordinates.
    const verilogHeading = page.getByRole('heading', {name: /Verilog/i}).first();
    const fullCanvas = verilogHeading.locator('xpath=following-sibling::details[2]');
    check(await fullCanvas.count() === 1, 'the full visual canvas is reachable');
    await fullCanvas.locator('summary').click();
    const canvas = page.getByTestId('bw-fpga-rf-canvas');
    await canvas.waitFor({timeout: 30000});

    const builder = canvas.locator('xpath=..');
    await builder.getByRole('button', {name: /Use as Verilog|Als Verilog verwenden/i}).click();
    await page.waitForFunction(() => [...document.querySelectorAll('textarea')]
        .some(el => /assign\s+w_g\s*=\s*a\s*&\s*b;/.test(el.value)), null, {timeout: 10000});
    const generatedHdl = await page.evaluate(() => [...document.querySelectorAll('textarea')]
        .map(el => el.value).find(value => /assign\s+w_g\s*=\s*a\s*&\s*b;/.test(value)) || '');
    check(/assign\s+w_g\s*=\s*a\s*&\s*b;/.test(generatedHdl),
        'visual AND becomes Verilog in the synthesis input');

    const ramButton = builder.getByTestId('bw-fpga-rf-memory');
    const ramTitle = await ramButton.getAttribute('title');
    check(/synchronous single-port RAM|synchroner Single-Port-RAM/i.test(ramTitle || ''),
        'the RAM action has localized explanatory text', ramTitle || '(missing title)');
    await ramButton.click();
    await builder.getByText('4×4', {exact: true}).waitFor({timeout: 10000});
    check(true, 'adding RAM shows its 4×4 geometry on the live canvas');

    // RAM is intentionally not claimed as live-simulated. Return to the clean
    // AND HDL generated before it was added and prove the production journey.
    if (!skipSynth) {
        await page.getByRole('button', {name: /Wire up a demo board|Demo-Board verdrahten/i}).click();
        await page.locator('[role="tab"]', {hasText: /Circuit/i}).first()
            .waitFor({state: 'visible', timeout: 10000});
        await page.waitForFunction(() => window.__circuit && typeof window.__circuit.addPart === 'function',
            null, {timeout: 15000});
        await fpgaTab.click();
        await page.getByText(/Wired a Tang Nano 20K|Tang Nano 20K.*verdrahtet/i)
            .waitFor({timeout: 10000});
        check(true, 'the FPGA journey creates a persistent demo circuit');

        const synth = page.getByRole('button', {name: /Synthesise|Synthetisieren/i}).first();
        await synth.waitFor({state: 'visible', timeout: 10000});
        await page.waitForFunction(button => !button.disabled, await synth.elementHandle(), {timeout: 30000});
        await synth.click();
        await page.getByRole('link', {name: /Download \.fs/i}).waitFor({timeout});
        check(true, 'visual AND reaches a real bitstream download');
        await page.waitForFunction(() => window.__fpgaOutputs.length > 0, null, {timeout: 30000});
        const outputs = await page.evaluate(() => window.__fpgaOutputs.at(-1));
        check(Array.isArray(outputs?.leds) && outputs.leds.some(led => led.pin === 15),
            'the synthesised AND drives the demo circuit output pin', JSON.stringify(outputs));
    } else {
        console.log('  note: FPGA_SKIP_SYNTH=1 — synthesis and demo-circuit checks intentionally omitted');
    }

    await page.screenshot({path: resolve(artifacts, 'fpga-builder.png'), fullPage: true});
    check(diagnostics.length === 0, 'the journey emits no browser errors', diagnostics.join(' | '));
    await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({url, skipSynth, checks, diagnostics}, null, 2));
    console.log(`FPGA builder browser proof passed (${checks.length} checks).`);
} catch (error) {
    await page.screenshot({path: resolve(artifacts, 'failure.png'), fullPage: true}).catch(() => {});
    await writeFile(resolve(artifacts, 'report.json'), JSON.stringify({url, skipSynth, checks, diagnostics,
        error: error.stack || error.message}, null, 2));
    throw error;
} finally {
    await browser.close();
}
