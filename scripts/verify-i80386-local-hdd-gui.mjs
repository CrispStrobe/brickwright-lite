#!/usr/bin/env node
// Served-GUI proof: the real Machine Manager file inputs boot an owned 386 HDD.
// No DOS, Windows, or other third-party media is included in this fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'http://127.0.0.1:8777/';
const screenshot = process.env.PROOF_SCREENSHOT || null;
const marker = 'GUI LOCAL HDD BOOT OK';
// Hand-assembled 16-bit boot sector: set DS=0/ES=B800, STOSW the marker in
// text VRAM, then HLT. The string starts at physical 7C1Ch.
const prefix = Buffer.from('fa31c08ed8b800b88ec031ffbe1c7cac84c07405b41fabebf6f4ebfd', 'hex');
const disk = Buffer.alloc(512 * 4 * 17);
prefix.copy(disk);
disk.write(marker + '\0', prefix.length, 'ascii');
disk[510] = 0x55; disk[511] = 0xaa;
const conf = Buffer.from('[cpu]\ncputype=auto\n[autoexec]\n'
    + 'imgmount c "owned-boot.img" -t hdd -size 512,17,4,1\n');
const browser = await chromium.launch({headless: true});
try {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 30000});
    const dismiss = page.getByTestId('bw-starter-backdrop').getByRole('button', {name: 'Not now'});
    if (await dismiss.count()) await dismiss.click();
    await page.getByRole('tab', {name: 'Code'}).click();
    const toggle = page.locator('[data-right-pane-toggle]');
    if (await toggle.count() && await toggle.getAttribute('aria-pressed') === 'false') await toggle.click();
    await page.evaluate(() => {
        window.__guiMediaProof = [];
        window.addEventListener('bw-machine-media-load', event =>
            window.__guiMediaProof.push({kind: event.detail?.kind,
                slot: event.detail?.slotId, length: event.detail?.bytes?.length}));
        window.dispatchEvent(new Event('bw-open-machine-manager'));
    });
    await page.getByTestId('bw-machine-manager').waitFor();
    await page.getByTestId('bw-mm-local-disk').setInputFiles({name: 'owned-boot.img',
        mimeType: 'application/octet-stream', buffer: disk});
    await page.getByTestId('bw-mm-local-conf').setInputFiles({name: 'owned.conf',
        mimeType: 'text/plain', buffer: conf});
    await page.waitForFunction(() => document.querySelector('[data-testid="bw-mm-import-text"]')
        ?.value.includes('cputype=auto'));
    await page.getByTestId('bw-mm-local-run').click();
    await page.waitForFunction(() => {
        const regs = window.__benchTarget?.regs?.();
        const canvas = document.querySelector('[data-testid="bw-machine-canvas"]');
        return regs?.halted && regs.pc === 0x7c1a && regs.di === 2 * 21 &&
            canvas?.width === 720 && canvas?.height === 400;
    }, undefined, {timeout: 45000});
    const proof = await page.evaluate(() => {
        const target = window.__benchTarget;
        const frame = target.video();
        const canvas = document.querySelector('[data-testid="bw-machine-canvas"]');
        const pixels = canvas.getContext('2d').getImageData(0, 0, 720, 400).data;
        return {regs: target.regs(), mode: frame.mode, why: frame.why,
            width: frame.width, height: frame.height,
            media: window.__guiMediaProof,
            painted: Array.from(pixels.slice(0, 720 * 16 * 4)).every((v, i) => v === frame.rgba[i]),
            nonBlack: Array.from(pixels.slice(0, 720 * 16 * 4)).some((v, i) => (i % 4) !== 3 && v !== 0)};
    });
    assert.ok(proof.media.some(e => e.kind === 'i80386' && e.slot === 'hdd' &&
        e.length === disk.length), 'Machine Manager dispatched the selected local HDD');
    assert.equal(proof.mode, 3);
    assert.equal(proof.why, '386 VGA text planes');
    assert.equal(proof.painted, true, 'Widgets canvas contains the guest VGA frame');
    assert.equal(proof.nonBlack, true, 'the guest wrote visible text pixels');
    assert.deepEqual(errors, [], 'no browser script error');
    if (screenshot) writeFileSync(screenshot,
        await page.getByTestId('bw-machine-canvas').screenshot());
    const boardPin = JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url)))['bw-board'];
    console.log(JSON.stringify({ok: true, boardPin, diskSha256:
        createHash('sha256').update(disk).digest('hex'), confSha256:
        createHash('sha256').update(conf).digest('hex'), pc: proof.regs.pc,
        cycles: proof.regs.cycles, mode: proof.mode, canvas: [proof.width, proof.height],
        marker, screenshot: screenshot || null}));
} finally {
    await browser.close();
}
