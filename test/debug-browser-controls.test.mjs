import test from 'node:test';
import assert from 'node:assert/strict';
import {clickPauseUnlessPaused} from '../scripts/lib/debug-browser-controls.mjs';

const pauseFixture = ({phase, disabled = false}) => {
    let clicks = 0;
    const panel = {getAttribute: name => name === 'data-debug-phase' ? phase : null};
    const button = {
        disabled,
        closest: selector => selector === '[data-debug-panel]' ? panel : null,
        click: () => { clicks += 1; }
    };
    return {button, clicks: () => clicks};
};

test('a delayed proof action accepts a program that has already paused itself', () => {
    const fixture = pauseFixture({phase: 'paused', disabled: true});
    assert.equal(clickPauseUnlessPaused(fixture.button), 'already-paused');
    assert.equal(fixture.clicks(), 0, 'a disabled Pause control must not be clicked');
});

test('a running program is paused through its real control', () => {
    const fixture = pauseFixture({phase: 'running'});
    assert.equal(clickPauseUnlessPaused(fixture.button), 'clicked');
    assert.equal(fixture.clicks(), 1);
});

test('a disabled Pause control in any other phase is refused by name', () => {
    const fixture = pauseFixture({phase: 'loading', disabled: true});
    assert.throws(() => clickPauseUnlessPaused(fixture.button),
        /disabled while debugger phase is loading/);
});
