import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isArcadeSimulatorUrl} from '../scripts/lib/arcade-controls.mjs';

const page = readFileSync(new URL('../scripts/makecode/arcade-simulator.html', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../scripts/verify-makecode.mjs', import.meta.url), 'utf8');
const host = readFileSync(new URL('../scripts/makecode/host.html', import.meta.url), 'utf8');

test('actual simulator frame matching accepts PXT identifiers without accepting another origin/path', () => {
    const origin = 'http://127.0.0.1:1234';
    for (const suffix of ['', '#sim-123', '?id=123#sim-123']) {
        assert.equal(isArcadeSimulatorUrl(`${origin}/arcade/sim/simulator.html${suffix}`, origin), true);
    }
    for (const url of ['about:blank', 'not a URL', `${origin}/arcade/sim/host.html`, 'http://example.com/arcade/sim/simulator.html']) {
        assert.equal(isArcadeSimulatorUrl(url, origin), false);
    }
});

test('the PXT Arcade page exposes upstream controls without a replacement input engine', () => {
    assert.match(page, /\.game-buttons, \.game-joystick\s*\{\s*display: flex/);
    assert.doesNotMatch(page, /\.game-buttons, \.game-joystick\s*\{\s*display: none/);
    for (const name of ['button-a', 'button-b', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right']) {
        assert.match(page, new RegExp(`class="${name}"`));
    }
    assert.match(page, /touch-action: none/);
    assert.match(page, /\.label-a, \.label-b\s*\{\s*pointer-events: none/);
    assert.match(page, /\.game-button-svg, \.game-joystick-svg\s*\{\s*width: auto; height: 100%; aspect-ratio: 1/);
    assert.match(page, /grid-template-rows: minmax\(0, 1fr\) auto clamp\(72px, 25vh, 128px\)/);
    assert.match(page, /object-fit: contain/);
    assert.doesNotMatch(page, /dispatchEvent|setPressed|postMessage/);
});

test('production browser acceptance checks actual PXT button press and release', () => {
    assert.match(verifier, /frame\.locator\('\.button-a'\)/);
    assert.match(verifier, /Reflect\.apply\(original, this, args\)/);
    assert.match(verifier, /args\[0\] === window\.pxsim\.Key\.A/);
    assert.match(verifier, /delete board\.handleKeyEvent/);
    assert.doesNotMatch(verifier, /state\.buttonsByPin/);
    assert.match(verifier, /await page\.mouse\.down\(\)/);
    assert.match(verifier, /finally\s*\{\s*await page\.mouse\.up\(\)/);
    assert.match(verifier, /on-screen A presses a real PXT board button/);
    assert.match(verifier, /on-screen A releases the real PXT board button/);
});

test('only Arcade overrides the standalone PXT wrapper height', () => {
    assert.match(host, /html\.bw-arcade-host #sim > \.simframe\s*\{ height: 100%; padding-bottom: 0 !important/);
    assert.match(host, /classList\.toggle\('bw-arcade-host'/);
    assert.match(host, /arcade.*host/);
});
