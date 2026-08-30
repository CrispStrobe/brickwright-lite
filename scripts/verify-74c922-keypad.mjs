#!/usr/bin/env node
/**
 * Production-browser acceptance for the physical keypad -> 74C922 example.
 *
 * The unit suite can prove the encoder model or the keypad switch matrix in
 * isolation. This gate proves the published example uses the real gallery
 * loader, renders both physical parts, and carries real pointer presses across
 * the drawn X/Y wires into the encoder and its five visible LEDs.
 */
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const URL = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const ARTIFACTS = path.resolve('artifacts/74c922-keypad');
const EXPECTED_CHECKS = 19;
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
const pageErrors = [];
const results = [];
const check = (name, ok, detail = '') => {
    results.push({name, ok: Boolean(ok), detail});
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// DOM order is circuit order: DA, then encoder bits A (LSB) through D (MSB).
const LED_IDS = ['led_da', 'led_a', 'led_b', 'led_c', 'led_d'];
const expectedLeds = code => [true, ...[0, 1, 2, 3].map(bit => Boolean(code & (1 << bit)))];

const snapshot = () => page.evaluate((ids) => {
    const board = window.__activeBoard;
    const device = board && board.getDeviceState && board.getDeviceState('enc1');
    const faces = [...document.querySelectorAll('wokwi-led')];
    return {
        encoder: device && device.encoder && {
            registered: device.encoder.registered,
            code: device.encoder.code,
            da: device.encoder.da,
        },
        brightness: board && ids.map(id => board.ledBrightness(id)),
        visible: faces.map(face => Boolean(face.value)),
        visibleBrightness: faces.map(face => Number(face.brightness)),
    };
}, LED_IDS);

const matchesPressed = (state, code) => {
    const want = expectedLeds(code);
    return state && state.encoder && state.encoder.registered === code &&
        state.encoder.code === code && state.encoder.da === 1 &&
        Array.isArray(state.brightness) && state.brightness.length === 5 &&
        state.brightness.every((value, i) => want[i] ? value > 0.01 : value <= 0.01) &&
        state.visible.length === 5 && state.visible.every((value, i) => value === want[i]);
};

const matchesReleased = state => state && state.encoder &&
    state.encoder.registered === null && state.encoder.da === 0 &&
    state.brightness.length === 5 && state.brightness.every(value => value <= 0.01) &&
    state.visible.length === 5 && state.visible.every(value => value === false);

let fatal;
try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(URL, {waitUntil: 'domcontentloaded', timeout: 60000});
    await page.getByRole('tab', {name: /circuit/i}).waitFor({timeout: 60000});
    check('built app loads the Circuit workspace', true);
    await page.getByRole('tab', {name: /circuit/i}).click();

    const published = await page.waitForFunction(() => {
        const gui = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        const key = gui && Object.keys(gui).find(name =>
            name.startsWith('__reactFiber') || name.startsWith('__reactInternalInstance'));
        const queue = key ? [gui[key]] : [];
        for (let i = 0; i < 8000 && queue.length; i++) {
            const fiber = queue.shift();
            const node = fiber && fiber.stateNode;
            if (node && typeof node.loadExample === 'function' && Array.isArray(node.state && node.state.examples)) {
                window.__bw74c922CircuitTab = node;
                return node.state.examples.some(example => example.id === 'logic-74c922-keypad');
            }
            if (fiber && fiber.child) queue.push(fiber.child);
            if (fiber && fiber.sibling) queue.push(fiber.sibling);
        }
        return false;
    }, null, {timeout: 30000});
    check('logic-74c922-keypad is published in the gallery', Boolean(published));

    const loaded = await page.evaluate(async () => {
        const tab = window.__bw74c922CircuitTab;
        const example = tab && tab.state.examples.find(item => item.id === 'logic-74c922-keypad');
        return example ? tab.loadExample(example) : {ok: false, error: 'gallery entry unavailable'};
    });
    check('normal gallery loader opens the physical encoder example', loaded && loaded.ok,
        loaded && loaded.error ? loaded.error : '');

    await page.locator('[data-keypad="kp1"] [data-key-index]').first().waitFor({timeout: 20000});
    await page.locator('[data-part-face="74c922"]').waitFor({state: 'visible', timeout: 10000});
    const faces = {
        keypadKeys: await page.locator('[data-keypad="kp1"] [data-key-index]').count(),
        encoder: await page.locator('[data-part-face="74c922"]').count(),
        leds: await page.locator('wokwi-led').count(),
    };
    check('physical keypad, encoder, and five LED faces render exactly once',
        faces.keypadKeys === 16 && faces.encoder === 1 && faces.leds === 5, JSON.stringify(faces));

    await page.getByRole('radio', {name: /sim mode/i}).click({force: true});
    await page.waitForFunction(() => {
        const board = window.__activeBoard;
        return board && board.getDeviceState && board.getDeviceState('enc1') &&
            typeof board.ledBrightness === 'function';
    }, null, {timeout: 15000});
    check('Sim mode exposes the production board and encoder state', true);

    const scenarios = [
        {label: '1', index: 0, code: 0},
        {label: '6', index: 6, code: 6},
        {label: 'D', index: 15, code: 15},
    ];
    for (const scenario of scenarios) {
        const key = page.locator(`[data-keypad="kp1"] [data-key-index="${scenario.index}"]`);
        await key.hover();
        await page.mouse.down();
        await page.waitForFunction(({code}) => {
            const board = window.__activeBoard;
            const device = board && board.getDeviceState && board.getDeviceState('enc1');
            const encoder = device && device.encoder;
            const want = [true, ...[0, 1, 2, 3].map(bit => Boolean(code & (1 << bit)))];
            const faces = [...document.querySelectorAll('wokwi-led')];
            return encoder && encoder.registered === code && encoder.code === code && encoder.da === 1 &&
                faces.length === 5 && faces.every((face, i) => Boolean(face.value) === want[i]);
        }, {code: scenario.code}, {timeout: 10000});
        const held = await snapshot();
        check(`key ${scenario.label}: encoder registers exact code ${scenario.code} with DA high`,
            held.encoder && held.encoder.registered === scenario.code &&
            held.encoder.code === scenario.code && held.encoder.da === 1, JSON.stringify(held.encoder));
        const want = expectedLeds(scenario.code);
        check(`key ${scenario.label}: solver drives exact DA/A/B/C/D LED pattern`,
            held.brightness && held.brightness.every((value, i) => want[i] ? value > 0.01 : value <= 0.01),
            JSON.stringify(held.brightness));
        check(`key ${scenario.label}: the five visible LED faces show that exact pattern`,
            matchesPressed(held, scenario.code), JSON.stringify(held.visible));

        await page.mouse.up();
        await page.waitForFunction(() => {
            const board = window.__activeBoard;
            const device = board && board.getDeviceState && board.getDeviceState('enc1');
            const encoder = device && device.encoder;
            return encoder && encoder.registered === null && encoder.da === 0 &&
                [...document.querySelectorAll('wokwi-led')].every(face => !face.value);
        }, null, {timeout: 10000});
        const released = await snapshot();
        check(`key ${scenario.label}: release drops DA and clears every visible output`,
            matchesReleased(released), JSON.stringify(released));
    }

    check('journey emits zero page errors', pageErrors.length === 0, pageErrors.join(' | '));
    check(`gate executes its exact ${EXPECTED_CHECKS}-check denominator`,
        results.length + 1 === EXPECTED_CHECKS, `${results.length + 1}/${EXPECTED_CHECKS}`);

    await mkdir(ARTIFACTS, {recursive: true});
    await page.screenshot({path: path.join(ARTIFACTS, 'success.png'), fullPage: true});
} catch (error) {
    fatal = error;
    console.error(error.stack || error.message);
} finally {
    if (fatal || results.some(result => !result.ok) || results.length !== EXPECTED_CHECKS) {
        await mkdir(ARTIFACTS, {recursive: true});
        await page.screenshot({path: path.join(ARTIFACTS, 'failure.png'), fullPage: true}).catch(() => {});
        await writeFile(path.join(ARTIFACTS, 'failure.json'), `${JSON.stringify({
            error: fatal && fatal.message,
            pageErrors,
            denominator: {actual: results.length, expected: EXPECTED_CHECKS},
            results,
            state: await snapshot().catch(error => ({snapshotError: error.message})),
            url: page.url(),
        }, null, 2)}\n`);
    }
    await browser.close();
}

const failures = results.filter(result => !result.ok);
console.log(`\n${results.length - failures.length}/${EXPECTED_CHECKS} checks passed`);
process.exit(fatal || failures.length || results.length !== EXPECTED_CHECKS ? 1 : 0);
