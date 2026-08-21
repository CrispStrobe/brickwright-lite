#!/usr/bin/env node
/** Browser regressions for physical Circuit Designer rendering and placement. */
import {chromium} from 'playwright';

const url = process.env.PROOF_URL || 'https://crispstrobe.github.io/brickwright-lite/';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const failures = [];
const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures.push(name);
};

try {
    await page.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('bw-starter-v1-complete', '1');
        sessionStorage.clear();
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 60000});
    await page.waitForSelector('[role="tab"]', {timeout: 60000});

    const paneToggle = page.locator('[data-right-pane-toggle]');
    check('fresh workspace starts with the optional right pane minimized',
        await paneToggle.getAttribute('aria-pressed') === 'false');

    await page.getByRole('tab', {name: /Circuit/}).click();
    const designer = page.locator('.bw-circuit-designer:visible').last();
    await designer.waitFor({state: 'visible', timeout: 60000});
    check('fresh Circuit Designer starts with Instruments minimized',
        await designer.locator('[data-instruments-column]').count() === 0 &&
        await designer.getByRole('button', {name: 'Expand instruments panel'}).count() === 1);

    const found = await page.evaluate(() => {
        const root = document.querySelector('[class*="gui_body"]') || document.querySelector('[class*="gui"]');
        const key = Object.keys(root || {}).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
        const queue = key ? [root[key]] : [];
        for (let i = 0; i < 10000 && queue.length; i++) {
            const fiber = queue.shift();
            if (fiber?.stateNode?.loadExample && Object.hasOwn(fiber.stateNode.state || {}, 'circuitData')) {
                window.__bwRenderingCircuitTab = fiber.stateNode;
                return true;
            }
            if (fiber?.child) queue.push(fiber.child);
            if (fiber?.sibling) queue.push(fiber.sibling);
        }
        return false;
    });
    check('Circuit host is available to the rendering gate', found);

    const load = async parts => {
        await page.evaluate(value => new Promise(resolve => {
            window.__bwRenderingCircuitTab.setState({
                circuitData: {vcc: 5, parts: value, wires: [], holeWires: [], fileOnly: true}
            }, resolve);
        }), parts);
        await page.waitForTimeout(250);
    };

    await load([{id: 'uno', kind: 'arduino_uno', params: {}, x: 520, y: 260, rotation: 0}]);
    await designer.locator('foreignObject[data-board-face="arduino_uno"] wokwi-arduino-uno').waitFor({timeout: 10000});
    const alignment = await designer.evaluate(root => {
        const face = root.querySelector('foreignObject[data-board-face="arduino_uno"]');
        const outline = root.querySelector('g[data-board-face="arduino_uno"] > rect');
        const art = face?.querySelector('wokwi-arduino-uno')?.shadowRoot?.querySelector('svg');
        const box = element => {
            const r = element.getBoundingClientRect();
            return {x: r.x, y: r.y, w: r.width, h: r.height};
        };
        return {face: box(face), outline: box(outline), art: box(art)};
    });
    check('Arduino artwork and its selection outline stay aligned',
        ['x', 'y', 'w', 'h'].every(key => Math.abs(alignment.face[key] - alignment.outline[key]) <= 1.5) &&
        alignment.art.w >= alignment.face.w * 0.9 && alignment.art.h >= alignment.face.h * 0.9,
        JSON.stringify(alignment));

    await load([{id: 'bb', kind: 'breadboard', params: {}, x: 520, y: 330, rotation: 0}]);
    const holes = await designer.evaluate(root => {
        const xs = [...root.querySelectorAll('[data-breadboard="bb"] [data-hole^="a"]')]
            .map(hole => Number(hole.getAttribute('cx')));
        return {xs, rail: root.querySelectorAll('[data-breadboard="bb"] [data-hole^="t+"]').length};
    });
    check('full breadboard has 63 consecutive terminal and rail holes',
        holes.xs.length === 63 && holes.rail === 63 &&
        holes.xs.every((x, index) => index === 0 || Math.abs(x - holes.xs[index - 1] - 14) < 0.01),
        `${holes.xs.length}/${holes.rail}`);

    await load([]);
    const canvas = await designer.locator('[data-canvas]').boundingBox();
    for (const [label, width] of [['Breadboard ½', 460], ['Breadboard mini', 278]]) {
        await designer.getByText(label, {exact: true}).click();
        await page.mouse.move(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.55);
        const ghost = designer.locator('[data-placement-ghost="breadboard"] rect').first();
        await ghost.waitFor({timeout: 3000});
        check(`${label} placement preview keeps its physical size`, Number(await ghost.getAttribute('width')) === width,
            await ghost.getAttribute('width'));
        // Commit the synthetic placement so the interaction machine returns
        // to idle before arming the next palette item. Sending Escape to the
        // page did not reach BoardCanvas unless its focusable wrapper happened
        // to own focus, leaving the half-board ghost armed in CI.
        await page.mouse.click(canvas.x + canvas.width * 0.55, canvas.y + canvas.height * 0.55);
        await ghost.waitFor({state: 'hidden', timeout: 3000});
        await load([]);
    }

    await load([
        {id: 'bb', kind: 'breadboard', params: {}, x: 520, y: 330, rotation: 0},
        {id: 'tiny', kind: 'attiny13', params: {}, x: 520, y: 330, rotation: 0}
    ]);
    const tiny = designer.locator('[data-dip-body="attiny13"]');
    const tinyBox = await tiny.boundingBox();
    await page.mouse.click(tinyBox.x + tinyBox.width / 2, tinyBox.y + tinyBox.height / 2);
    check('ATtiny13 remains selectable above a breadboard',
        await designer.locator('[data-selection-actions]').count() === 1);

    await load([{id: 'bb', kind: 'breadboard', params: {}, x: 520, y: 330, rotation: 0}]);
    for (const kind of ['Arduino Nano', 'Raspberry Pi Pico']) {
        await designer.getByRole('button', {name: kind, exact: true}).click();
        await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        const ghost = designer.locator('[data-placement-ghost]');
        await ghost.waitFor({timeout: 3000});
        const zOrder = await ghost.evaluate(node => {
            const board = node.ownerSVGElement.querySelector('[data-breadboard]');
            return !!(board.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        const width = Number(await ghost.locator('rect').first().getAttribute('width'));
        check(`${kind} placement stays above the breadboard at physical scale`, zOrder && width > 100,
            `z=${zOrder} width=${width}`);
        await page.keyboard.press('Escape');
    }

    // Exercise the exact owner-reported regression as shipped, not merely a
    // synthetic board. Its Pico bench used to contain a forest of redundant
    // supply drops, overlapping generated bodies, and no flyback diode.
    const motorBench = await page.evaluate(async () => {
        const response = await fetch('examples/10-motor-speed/circuit.pico.json');
        if (!response.ok) throw new Error(`motor bench HTTP ${response.status}`);
        return response.json();
    });
    const generatedPower = motorBench.wires.filter(wire => wire.genPower);
    check('Motor speed Pico bench has one supply and one ground feed',
        generatedPower.length === 2,
        `${generatedPower.length} generated power wires`);
    check('Motor speed Pico bench ships with flyback protection',
        motorBench.parts.some(part => part.kind === 'diode'));
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), motorBench);
    await designer.locator('[data-board-face="pi_pico"]').waitFor({state: 'visible', timeout: 10000});
    check('Motor speed Pico bench renders its controller face',
        await designer.locator('[data-board-face="pi_pico"]:visible').count() === 1);
} finally {
    await browser.close();
}

if (failures.length) {
    console.error(`\n${failures.length} circuit rendering regression(s): ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nCircuit rendering browser gate passed.');
