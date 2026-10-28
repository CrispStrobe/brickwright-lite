// Scoring/control-flow contracts of the pinned original carnival code. Host
// doubles observe calls, not pixels or native VM/gameplay equivalence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
const initialize = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/carnival-pxt.js');

function harness ({scores = [2], best = 0, elapsed = 100, low, storage = new Map()} = {}) {
    const players = Array.from({length: 4}, (_, i) => ({score: scores[i]}));
    const trace = [], dialogs = [], callbacks = [], countdowns = [];
    if (low !== undefined) storage.set('low-score', low);
    const info = {score: () => players[0].score ?? (players[0].score = 0), highScore: () => best,
        setScore: value => { players[0].score = value; trace.push(['score', value]); },
        saveHighScore: () => { best = players[0].score; trace.push(['high', best]); },
        onCountdownEnd: callback => callbacks.push(callback), startCountdown: seconds => countdowns.push(seconds)};
    players.forEach((state, i) => { info['player' + (i + 1)] = {getState: () => state}; });
    const image = () => ({height: 46, printCenter: (text, y, color, font) => trace.push(['text', text, y, color, font]),
        drawTransparentImage: () => {}});
    class BaseDialog {
        constructor () { this.image = image(); dialogs.push(this); }
        clearInterior () {}
        drawCursorRow () { trace.push(['cursor']); }
    }
    const effects = Object.fromEntries(['confetti', 'melt', 'hearts'].map(name => [name,
        {startScreenEffect: () => trace.push(['effect', name])}]));
    const sound = {play: async () => { trace.push(['sound']); }};
    const host = {game: {BaseDialog, currentScene: () => ({millis: () => elapsed}),
        popScene: async () => { trace.push(['pop']); }, pushScene: async () => { trace.push(['push']); },
        over: async (win, effect) => { trace.push(['over', win, effect]); },
        waitAnyButton: async () => { trace.push(['button']); }, setGameOverSound: (...a) => trace.push(['configureSound', ...a])},
    info, effects, settings: {readNumber: key => storage.get(key), writeNumber: (key, value) => {
        storage.set(key, value); trace.push(['write', key, value]); }},
    control: {timer1: {millis: () => elapsed}, reset: () => { trace.push(['reset']); }},
    scene: {HUD_Z: 100, setBackgroundImage: () => { trace.push(['background']); },
        createRenderable: (z, draw) => { trace.push(['renderable', z]); draw({drawTransparentImage: () => {}}); }},
    music: {powerUp: sound}, screen: {width: 160, height: 120, isMono: false, clone: () => image()},
    image: {font5: 'font5', font8: 'font8'}, img: () => image(),
    pause: async ms => { trace.push(['pause', ms]); }};
    return {...initialize(host), trace, dialogs, callbacks, countdowns, players, effects, storage};
}

for (const [style, message] of [['Win', 'You Win!'], ['Score', 'Great Score!'], ['Timed', 'Great Time!']]) {
    test('original carnival ' + style + ' scoring and custom dialog', async () => {
        const h = harness({elapsed: 3400});
        await h.carnival.onGameOverExpanded(h.carnival.WinTypes[style]);
        assert.equal(h.dialogs[0].messageText, message);
        assert.equal(h.dialogs[0].score, style === 'Timed' ? 3 : 2);
        assert.equal(h.dialogs[0].newBest, true);
        assert.equal(h.dialogs[0].cursorOn, true);
        assert.deepEqual(h.trace.filter(t => t[0] === 'pause'), [['pause', 400], ['pause', 500]]);
        assert.deepEqual(h.trace.slice(-2), [['button'], ['reset']]);
    });
}

test('multiplayer has all tied winners and saves the winning score', async () => {
    for (const [scores, message, score] of [
        [[2, 9], 'Player 2 Wins!', 9], [[9, 9], 'Players 1 & 2 Tied!', 9],
        [[-10, -5, -5, -5], 'Players 2 & 3 & 4 Tied!', -5]
    ]) {
        const h = harness({scores});
        await h.carnival.onGameOverExpanded(h.carnival.WinTypes.Multi);
        assert.equal(h.dialogs[0].messageText, message);
        assert.equal(h.dialogs[0].score, score);
        assert.equal(h.dialogs[0].newBest, score > 0);
        assert.equal(h.trace.some(t => t[0] === 'high'), score > 0);
    }
});

test('lose uses the original core game.over path rather than the custom dialog', async () => {
    const h = harness();
    await h.carnival.onGameOverExpanded(h.carnival.WinTypes.Lose);
    assert.deepEqual(h.trace, [['over', false, h.effects.melt]]);
    assert.equal(h.dialogs.length, 0);
});

test('countdown retains its first style/effect while later calls restart its duration', async () => {
    const h = harness();
    h.carnival.startCountdownGame(15, h.carnival.WinTypes.Multi);
    h.carnival.startCountdownGame(2, h.carnival.WinTypes.Lose);
    assert.deepEqual(h.countdowns, [15, 2]);
    assert.equal(h.callbacks.length, 1);
    await h.callbacks[0]();
    assert.equal(h.dialogs[0].messageText, 'Player 1 Wins!');
    assert.deepEqual(h.trace.find(t => t[0] === 'effect'), ['effect', 'confetti']);
    const fresh = harness();
    fresh.carnival.startCountdownGame(1, fresh.carnival.WinTypes.Lose);
    await fresh.callbacks[0]();
    assert.deepEqual(fresh.trace, [['over', false, fresh.effects.melt]], 'a fresh program gets its own initialization');
});

test('explicit countdown effect follows the pinned source melt branch', async () => {
    const h = harness();
    h.carnival.startCountdownGame(1, h.carnival.WinTypes.Win, h.effects.hearts);
    await h.callbacks[0]();
    assert.deepEqual(h.trace.find(t => t[0] === 'effect'), ['effect', 'melt']);
});

test('low-time scoring persists through a fresh module and never replaces a better record', async () => {
    const storage = new Map();
    for (const [elapsed, expected, updated] of [[3400, 3, true], [5100, 3, false], [1200, 1, true]]) {
        const h = harness({storage, elapsed});
        await h.carnival.onGameOverExpanded(h.carnival.WinTypes.Timed);
        assert.equal(storage.get('low-score'), expected);
        assert.equal(h.dialogs[0].best, expected);
        assert.equal(h.dialogs[0].newBest, updated);
    }
});

test('custom scoring preserves the original zero-value defaulting rules', async () => {
    const h = harness({scores: [5]});
    await h.carnival.customGameOverExpanded('Custom', undefined, undefined, h.carnival.ScoreTypes.None, 0);
    assert.equal(h.dialogs[0].score, undefined);
    assert.equal(h.dialogs[0].best, undefined);
    const low = harness({elapsed: 2400});
    await low.carnival.customGameOverExpanded('Time', undefined, undefined, low.carnival.ScoreTypes.LTime, 0);
    assert.equal(low.dialogs[0].score, 2, 'custom zero still uses elapsed time, as the original tests falsiness');
});

test('asynchronous host failures propagate before reset', async () => {
    // Awaited operations must not silently let the project continue/reset when
    // the native host fails. A blocked scene transition needs the same ordering.
    const h = harness();
    const error = new Error('host sound failed');
    // Pass the failing melody through the public custom-game-over function.
    await assert.rejects(h.carnival.customGameOverExpanded('Failure', undefined,
        {play: async () => { throw error; }}, h.carnival.ScoreTypes.None), error);
    assert.ok(!h.trace.some(t => t[0] === 'reset'));
});

test('the generated module matches the pinned source and explicit fiber adaptation', () => {
    const script = new URL('../scripts/generate-arcade-carnival.mjs', import.meta.url);
    const run = spawnSync(process.execPath, [fileURLToPath(script), '--check'], {encoding: 'utf8'});
    assert.equal(run.status, 0, run.stderr);
});
