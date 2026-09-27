#!/usr/bin/env node
/** Browser regressions for physical Circuit Designer rendering and placement. */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';

const lm324Fixture = JSON.parse(readFileSync(
    new URL('../test/fixtures/lm324-quad-follower.json', import.meta.url), 'utf8'));
const lm741Fixture = JSON.parse(readFileSync(
    new URL('../test/fixtures/lm741-voltage-follower.json', import.meta.url), 'utf8'));
const adp7118Fixture = JSON.parse(readFileSync(
    new URL('../test/fixtures/adp7118-fixed-regulator.json', import.meta.url), 'utf8'));
const lt1763Fixture = JSON.parse(readFileSync(
    new URL('../test/fixtures/lt1763-fixed-regulator.json', import.meta.url), 'utf8'));
const lt1001Fixture = JSON.parse(readFileSync(
    new URL('../test/fixtures/lt1001-precision-follower.json', import.meta.url), 'utf8'));

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
    for (const [kind, paletteKind] of [['Arduino Nano', 'arduino_nano'], ['Raspberry Pi Pico', 'pi_pico']]) {
        await designer.locator(`[data-palette-kind="${paletteKind}"]`).click();
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
        // Finish the placement through the same canvas interaction a user
        // performs. Escape is canvas-scoped, so sending it while the palette
        // card owns focus leaves the old placement armed and races the next
        // palette selection.
        await page.mouse.click(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
        await ghost.waitFor({state: 'hidden', timeout: 3000});
        await load([{id: 'bb', kind: 'breadboard', params: {}, x: 520, y: 330, rotation: 0}]);
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

    // The LM324 crosses both package boundaries this gate is meant to exercise:
    // CUI must bundle the truthful 14-pin face, and its injected Board must solve
    // four independent channels. Node tests can read an unbundled parts-data
    // directory, so this exact browser assertion is what catches a stale static
    // index or a GUI install resolving a different engine.
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), lm324Fixture);
    const lm324Face = designer.locator('[data-dip-body="lm324"][data-dip-label="LM324"]');
    await lm324Face.waitFor({state: 'visible', timeout: 10000});
    const lm324FaceText = await lm324Face.textContent();
    check('LM324 renders as the truthful labelled PDIP-14 face',
        await lm324Face.count() === 1 && /DIP-14/.test(lm324FaceText) &&
        ['1_out', '2_out', '3_out', '4_out', 'vcc', 'gnd'].every(name => lm324FaceText.includes(name)),
        lm324FaceText.replace(/\s+/g, ' ').trim());
    const lm324 = await page.evaluate(() => {
        const circuit = window.__circuit;
        const board = circuit?.board;
        if (!board) return {error: 'CircuitTab did not publish the LM324 board'};
        board.advanceTo(board.timeNs + 1n);
        const values = [];
        for (let channel = 1; channel <= 4; channel++) {
            const terminal = `${channel}_out`;
            const net = board.nets.find(item => item.terminals.some(endpoint =>
                endpoint.part === 'u1' && endpoint.terminal === terminal));
            values.push(net ? board.nodeVoltage(net.id) : null);
        }
        return {values, terminals: circuit.getPart('u1')?.terminals?.length || 0};
    });
    check('browser bundle solves all four physical LM324 channels independently',
        lm324.terminals === 14 && Array.isArray(lm324.values) &&
        lm324.values.every((value, index) =>
            typeof value === 'number' && Math.abs(value - [0.5, 1, 2, 3][index]) < 0.02),
        JSON.stringify(lm324));

    // The LM741 proof is deliberately a dual-supply follower, not merely a
    // palette lookup: it crosses the pinned CUI face and Board behavior through
    // the same production bundle a user loads.
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), lm741Fixture);
    const lm741Face = designer.locator('[data-dip-body="lm741"][data-dip-label="LM741"]');
    await lm741Face.waitFor({state: 'visible', timeout: 10000});
    const lm741FaceText = await lm741Face.textContent();
    check('LM741 renders as the truthful labelled PDIP-8 face',
        await lm741Face.count() === 1 && /DIP-8/.test(lm741FaceText) &&
        ['offset_1', 'inn', 'inp', 'vneg', 'offset_5', 'out', 'vpos', 'nc']
            .every(name => lm741FaceText.includes(name)),
        lm741FaceText.replace(/\s+/g, ' ').trim());
    const lm741 = await page.evaluate(() => {
        const circuit = window.__circuit;
        const board = circuit?.board;
        if (!board) return {error: 'CircuitTab did not publish the LM741 board'};
        board.advanceTo(board.timeNs + 10_000n);
        const net = board.nets.find(item => item.terminals.some(endpoint =>
            endpoint.part === 'u1' && endpoint.terminal === 'out'));
        return {
            output: net ? board.nodeVoltage(net.id) : null,
            terminals: circuit.getPart('u1')?.terminals?.length || 0
        };
    });
    check('browser bundle solves the physical dual-supply LM741 follower',
        lm741.terminals === 8 && typeof lm741.output === 'number' &&
        Math.abs(lm741.output - 1.001) < 0.02,
        JSON.stringify(lm741));

    // This is the complete package chain: the Lite production bundle loads
    // CUI's physical SOIC-8 face and Board's named regulator model from the
    // same fixture, then reads the settled output rather than a static label.
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), adp7118Fixture);
    const adpFace = designer.locator('[data-part-face="adp7118"][data-soic-body="adp7118"]');
    await adpFace.waitFor({state: 'visible', timeout: 10000});
    const adpFaceText = await adpFace.textContent();
    check('ADP7118 renders as the truthful labelled SOIC-8 face',
        await adpFace.count() === 1 && /200mA LDO/.test(adpFaceText) &&
        ['vout_1', 'vout_2', 'sense_adj', 'gnd', 'en', 'ss', 'vin_7', 'vin_8']
            .every(name => adpFaceText.includes(name)),
        adpFaceText.replace(/\s+/g, ' ').trim());
    const adp7118 = await page.evaluate(() => {
        const circuit = window.__circuit;
        const board = circuit?.board;
        if (!board) return {error: 'CircuitTab did not publish the ADP7118 board'};
        board.advanceTo(board.timeNs + 10_000n);
        const net = board.nets.find(item => item.terminals.some(endpoint =>
            endpoint.part === 'u1' && endpoint.terminal === 'vout_1'));
        return {
            output: net ? board.nodeVoltage(net.id) : null,
            terminals: circuit.getPart('u1')?.terminals?.length || 0
        };
    });
    check('browser bundle solves the physical fixed-output ADP7118 regulator',
        adp7118.terminals === 8 && typeof adp7118.output === 'number' &&
        Math.abs(adp7118.output - 5) < 0.002,
        JSON.stringify(adp7118));

    // The final vertical slice: Lite's bundled CUI face and Board model must
    // meet in one real browser circuit, not merely coexist as package files.
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), lt1763Fixture);
    const ltFace = designer.locator('[data-part-face="lt1763"][data-soic-body="lt1763"]');
    await ltFace.waitFor({state: 'visible', timeout: 10000});
    const ltFaceText = await ltFace.textContent();
    check('LT1763 renders as the truthful labelled SO-8 face',
        await ltFace.count() === 1 && /500mA LDO/.test(ltFaceText) &&
        ['out', 'sense_adj', 'gnd_3', 'byp', 'shdn', 'gnd_6', 'gnd_7', 'in']
            .every(name => ltFaceText.includes(name)),
        ltFaceText.replace(/\s+/g, ' ').trim());
    const lt1763 = await page.evaluate(() => {
        const circuit = window.__circuit;
        const board = circuit?.board;
        if (!board) return {error: 'CircuitTab did not publish the LT1763 board'};
        board.advanceTo(board.timeNs + 10_000n);
        const net = board.nets.find(item => item.terminals.some(endpoint =>
            endpoint.part === 'u1' && endpoint.terminal === 'out'));
        return {
            output: net ? board.nodeVoltage(net.id) : null,
            terminals: circuit.getPart('u1')?.terminals?.length || 0
        };
    });
    check('browser bundle solves the physical fixed-output LT1763 regulator',
        lt1763.terminals === 8 && typeof lt1763.output === 'number' &&
        Math.abs(lt1763.output - 5) < 0.003,
        JSON.stringify(lt1763));

    // The precision-amplifier vertical slice must also meet in the production
    // browser bundle: physical face, all package pins and the real Board model.
    await page.evaluate(value => new Promise(resolve => {
        window.__bwRenderingCircuitTab.setState({circuitData: value}, resolve);
    }), lt1001Fixture);
    const lt1001Face = designer.locator('[data-part-face="lt1001"][data-dip-body="lt1001"]');
    await lt1001Face.waitFor({state: 'visible', timeout: 10000});
    const lt1001FaceText = await lt1001Face.textContent();
    check('LT1001 renders as the truthful labelled PDIP-8 face',
        await lt1001Face.count() === 1 && /LT1001/.test(lt1001FaceText) &&
        ['offset_1', 'inn', 'inp', 'vneg', 'offset_5', 'out', 'vpos', 'nc']
            .every(name => lt1001FaceText.includes(name)),
        lt1001FaceText.replace(/\s+/g, ' ').trim());
    const lt1001 = await page.evaluate(() => {
        const circuit = window.__circuit;
        const board = circuit?.board;
        if (!board) return {error: 'CircuitTab did not publish the LT1001 board'};
        board.advanceTo(board.timeNs + 40_000n);
        const net = board.nets.find(item => item.terminals.some(endpoint =>
            endpoint.part === 'u1' && endpoint.terminal === 'out'));
        return {
            output: net ? board.nodeVoltage(net.id) : null,
            terminals: circuit.getPart('u1')?.terminals?.length || 0
        };
    });
    check('browser bundle solves the physical LT1001 precision follower',
        lt1001.terminals === 8 && typeof lt1001.output === 'number' &&
        Math.abs(lt1001.output - 1.00001) < 0.00001,
        JSON.stringify(lt1001));
} finally {
    await browser.close();
}

if (failures.length) {
    console.error(`\n${failures.length} circuit rendering regression(s): ${failures.join(', ')}`);
    process.exit(1);
}
console.log('\nCircuit rendering browser gate passed.');
