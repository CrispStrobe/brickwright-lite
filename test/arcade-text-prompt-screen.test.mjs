import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';

// PXT game.askForString / askForNumber draw their own text-entry screen into the
// 160x120 scene frame (libs/game/prompt.ts, numberprompt.ts). These tests read the
// frame the extension composes for that screen.

function host() {
    const runtime = new EventEmitter();
    runtime.getOpcodeFunction = opcode => opcode === 'sensing_askandwait'
        ? () => new Promise(resolve => runtime.once('ANSWER', resolve)) : () => runtime.lastAnswer || '';
    runtime.on('ANSWER', value => { runtime.lastAnswer = value; });
    const arcade = new (loadExtensionClass('arcade'))(runtime)._inst;
    return {runtime, arcade, util: {target: {}}};
}
const frame = arcade => {
    const raw = {width: 160, height: 120, pixels: new Uint8Array(160 * 120)};
    for (const renderable of arcade._renderables.get(arcade._state()) || []) renderable.draw(raw);
    return raw.pixels;
};
const at = (pixels, x, y) => pixels[y * 160 + x];
const settle = () => new Promise(resolve => setImmediate(resolve));
const button = (arcade, name) => { arcade._controllerButtonEdge(1, name, true); arcade._controllerButtonEdge(1, name, false); };

test('the system-keyboard prompt shows the message, an empty input row and the instruction bar', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade.askForString({QUESTION: 'Name?'}, util);
    await settle();
    assert.deepEqual(runtime.bwArcadeTextPrompt, {answerLength: 12, numbersOnly: false});
    const pixels = frame(arcade);
    // Instruction bar: colorBottomBackground (3) along the bottom edge, below the input row.
    assert.equal(at(pixels, 2, 119), 3);
    // Message text: colorPrompt (1) pixels in the top rows.
    assert.ok(pixels.slice(4 * 160, 12 * 160).some(color => color === 1));
    // The first input cell shows the system cursor (colorCursor 7) at its left edge.
    const row = []; for (let y = 0; y < 120; y++) if (at(pixels, 8, y) === 7) row.push(y);
    assert.ok(row.length >= 6, 'blinking cursor visible at the start');
    runtime.emit('ANSWER', 'Zed');
    assert.equal(await pending, 'Zed');
    assert.equal(runtime.bwArcadeTextPrompt, null);
});

test('typed text appears in the input row as it is edited', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade.askForString({QUESTION: 'Name?'}, util);
    await settle();
    const before = frame(arcade);
    runtime.emit('ARCADE_PROMPT_INPUT', 'ab');
    const after = frame(arcade);
    assert.notDeepEqual(Array.from(before), Array.from(after));
    // Text is drawn in colorInputText (1) inside the input area.
    let changed = 0;
    for (let i = 0; i < before.length; i++) if (before[i] !== after[i] && after[i] === 1) changed++;
    assert.ok(changed > 6);
    runtime.emit('ANSWER', 'ab');
    assert.equal(await pending, 'ab');
});

test('a number prompt keeps digits, one leading minus sign and one decimal point', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade.askForNumber({QUESTION: 'n'}, util);
    await settle();
    runtime.emit('ANSWER', '-1.2.3x');
    assert.equal(await pending, -1.23);
});

test('the on-screen keyboard: arrows move, A types, B deletes, shift and OK are in the bottom bar', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade._askForString({QUESTION: 'Go'}, util, 4, false, true);
    await settle();
    assert.equal(arcade._textPromptUi.prompt.useSystemKeyboard, false);
    const start = frame(arcade);
    // The cursor cell (colorCursor 7) is the top-left letter and the bottom bar is colorBottomBackground (3).
    assert.equal(at(start, 8, 119), 3);
    assert.ok(Array.from(start).includes(7));
    button(arcade, 'right'); button(arcade, 'a');   // b
    button(arcade, 'right'); button(arcade, 'a');   // c
    button(arcade, 'b');                            // delete c
    button(arcade, 'down'); button(arcade, 'down'); // row 2, column 2: digit 0
    button(arcade, 'a');
    assert.equal(arcade._textPromptUi.prompt.result, 'b0');
    button(arcade, 'down');                         // bottom bar, left button: shift
    button(arcade, 'a');
    assert.equal(arcade._textPromptUi.prompt.upper, true);
    button(arcade, 'right');                        // OK
    assert.equal(arcade._textPromptUi.prompt.confirmPressed, false);
    button(arcade, 'a');
    assert.equal(await pending, 'b0');
    assert.equal(arcade._textPromptUi, null);
});

test('the on-screen number keyboard uses the calculator layout and rejects a second point', async () => {
    const {arcade, util} = host();
    const pending = arcade._askForString({QUESTION: 'n'}, util, 6, true, true);
    await settle();
    const prompt = arcade._textPromptUi.prompt;
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => prompt.getSymbolForIndex(i)),
        ['7', '8', '9', '4', '5', '6', '1', '2', '3', '-', '0', '.']);
    button(arcade, 'down'); button(arcade, 'down'); button(arcade, 'down'); // bottom symbol row
    button(arcade, 'right'); button(arcade, 'right');                       // '.'
    button(arcade, 'a'); button(arcade, 'a');
    assert.equal(prompt.result, '.');
    button(arcade, 'down');                                                  // OK row
    button(arcade, 'a');
    assert.ok(Number.isNaN(parseFloat(await pending)));
});

test('the cancelled system keyboard hands the prompt to the on-screen keyboard', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade.askForString({QUESTION: 'Hi'}, util);
    await settle();
    runtime.emit('ARCADE_PROMPT_INPUT', 'q');
    runtime.emit('ARCADE_PROMPT_CANCEL');
    await settle();
    const prompt = arcade._textPromptUi.prompt;
    assert.equal(prompt.useSystemKeyboard, false);
    assert.equal(prompt.result, 'q');
    button(arcade, 'a');
    assert.equal(prompt.result, 'qa');
    button(arcade, 'down'); button(arcade, 'down'); button(arcade, 'down'); button(arcade, 'right');
    button(arcade, 'a');
    assert.equal(await pending, 'qa');
});

test('the system keyboard ignores controller buttons', async () => {
    const {runtime, arcade, util} = host();
    const pending = arcade.askForString({QUESTION: 'Hi'}, util);
    await settle();
    button(arcade, 'a'); button(arcade, 'right');
    assert.equal(arcade._textPromptUi.prompt.result, '');
    runtime.emit('ANSWER', 'x');
    assert.equal(await pending, 'x');
});
