import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const page = readFileSync(new URL('../scripts/makecode/arcade-simulator.html', import.meta.url), 'utf8');
const verifier = readFileSync(new URL('../scripts/verify-makecode.mjs', import.meta.url), 'utf8');

test('the PXT Arcade page exposes upstream controls without a replacement input engine', () => {
    assert.match(page, /\.game-buttons, \.game-joystick\s*\{\s*display: flex/);
    assert.doesNotMatch(page, /\.game-buttons, \.game-joystick\s*\{\s*display: none/);
    for (const name of ['button-a', 'button-b', 'dpad-up', 'dpad-down', 'dpad-left', 'dpad-right']) {
        assert.match(page, new RegExp(`class="${name}"`));
    }
    assert.match(page, /touch-action: none/);
    assert.match(page, /grid-template-rows: minmax\(0, 1fr\) auto clamp\(72px, 25vh, 128px\)/);
    assert.match(page, /object-fit: contain/);
    assert.doesNotMatch(page, /dispatchEvent|setPressed|postMessage/);
});

test('production browser acceptance checks actual PXT button press and release', () => {
    assert.match(verifier, /frame\.locator\('\.button-a'\)/);
    assert.match(verifier, /state\.buttonsByPin/);
    assert.match(verifier, /await page\.mouse\.down\(\)/);
    assert.match(verifier, /finally\s*\{\s*await page\.mouse\.up\(\)/);
    assert.match(verifier, /on-screen A presses a real PXT board button/);
    assert.match(verifier, /on-screen A releases the real PXT board button/);
});
