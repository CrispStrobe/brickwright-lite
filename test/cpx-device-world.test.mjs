/**
 * The Circuit Playground Express device world (task A9 phase 1) read against
 * MakeCode's own Circuit Playground simulator.
 *
 * Each scenario is one MakeCode program run twice on the same virtual clock:
 * in pxt-adafruit 1.6.8's simulator (scripts/lib/makecode-adafruit-sim.mjs,
 * the reference the owner chose) and through Lite's `circuitplayground`
 * extension — the vendored bundle the GUI loads — driven word by word
 * (scripts/lib/cpx-extension-run.mjs). What the ring emits at each snapshot
 * and every tone the speaker plays must be the same.
 *
 * Sparkle is the one animation left out: it picks pixels with Math.random in
 * both, so no two runs agree with each other, let alone across the two.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compileAdafruit, runAdafruitSim, adafruitSimAvailable} from '../scripts/lib/makecode-adafruit-sim.mjs';
import {runCpxExtension} from '../scripts/lib/cpx-extension-run.mjs';

const skip = adafruitSimAvailable() ? false
    : 'MakeCode runtime not synced (npm run sync:makecode): no pxt-adafruit simulator to compare with';

const hex = c => `#${(c >>> 0).toString(16).padStart(6, '0')}`;
const ANIMATION_TS = {
    rainbow: 'rainbowAnimation', runningLights: 'runningLightsAnimation', comet: 'cometAnimation',
    colorWipe: 'colorWipeAnimation', theaterChase: 'theaterChaseAnimation'
};
const hat = (opcode, match, body) => (op, fields, ext) => {
    if (op === `circuitplayground_${opcode}` && Object.entries(match).every(([k, v]) => fields[k] === v)) body(ext);
};

const SCENARIOS = [
    {name: 'set all pixels at the starting brightness (16)', ts: 'light.setAll(0xff0000)',
        drive: async e => { e.setall({COLOR: 'red'}); }, at: [50]},
    {name: 'full brightness sends the buffer unscaled', ts: 'light.setBrightness(255)\nlight.setAll(0xff0000)\nlight.setPixelColor(2, 0x00ff00)',
        drive: async e => { e.setbrightness({BRIGHTNESS: 255}); e.setall({COLOR: 'red'}); e.setpixel({INDEX: 2, COLOR: 'green'}); }, at: [50]},
    {name: 'a gradient at brightness 100', ts: 'light.setBrightness(100)\nlight.setGradient(0xff0000, 0x0000ff)',
        drive: async e => { e.setbrightness({BRIGHTNESS: 100}); e.setgradient({START: 'red', END: 'blue'}); }, at: [50]},
    {name: 'graph half way', ts: 'light.setBrightness(255)\nlight.graph(5, 10)',
        drive: async e => { e.setbrightness({BRIGHTNESS: 255}); e.graph({VALUE: 5, HIGH: 10}); }, at: [50]},
    {name: 'hsv, fade and rgb colours', ts: 'light.setBrightness(255)\nlight.setPixelColor(0, light.hsv(85, 255, 255))\n'
        + 'light.setPixelColor(1, light.fade(0xffffff, 128))\nlight.setPixelColor(2, light.rgb(10, 20, 30))',
    drive: async e => {
        e.setbrightness({BRIGHTNESS: 255});
        e.setpixel({INDEX: 0, COLOR: e.hsv({H: 85, S: 255, V: 255})});
        e.setpixel({INDEX: 1, COLOR: e.fade({COLOR: 'white', BRIGHTNESS: 128})});
        e.setpixel({INDEX: 2, COLOR: e.rgb({R: 10, G: 20, B: 30})});
    }, at: [50]},
    {name: 'show ring', ts: 'light.setBrightness(255)\nlight.showRing("red green blue yellow purple white orange pink red green")',
        drive: async e => {
            e.setbrightness({BRIGHTNESS: 255});
            await e.showring({COLORS: 'red green blue yellow purple white orange pink red green'});
        }, at: [100, 600]},
    ...Object.entries(ANIMATION_TS).map(([value, member]) => ({
        name: `the ${value} animation, frame by frame`,
        ts: `light.setBrightness(255)\nlight.showAnimation(light.${member}, 1000)`,
        drive: async e => { e.setbrightness({BRIGHTNESS: 255}); await e.showanimation({ANIMATION: value, MS: 1000}); },
        at: [30, 130, 330, 530, 990]
    })),
    {name: 'tones, a rest, tempo and a beat', ts: 'music.playTone(262, 100)\nmusic.rest(50)\nmusic.setTempo(60)\n'
        + 'music.playTone(440, music.beat(BeatFraction.Quarter))',
    drive: async e => {
        await e.playtone({FREQUENCY: 262, MS: 100});
        await e.rest({MS: 50});
        e.settempo({BPM: 60});
        await e.playtone({FREQUENCY: 440, MS: e.beat({FRACTION: 'quarter'})});
    }, at: [], ms: 2000, sound: true},
    ...['powerUp', 'powerDown', 'jumpUp', 'magicWand', 'siren', 'wawawawaa'].map(sound => ({
        name: `the ${sound} sound, note by note`,
        ts: `music.playSoundUntilDone(music.sounds(Sounds.${sound[0].toUpperCase()}${sound.slice(1)}))`,
        drive: async e => { await e.playsounduntildone({SOUND: sound}); }, at: [], ms: 4000, sound: true
    })),
    {name: 'button A click', ts: 'light.setBrightness(255)\ninput.buttonA.onEvent(ButtonEvent.Click, function () { light.setAll(0x0000ff) })',
        drive: async e => { e.setbrightness({BRIGHTNESS: 255}); },
        onHat: hat('whenbutton', {BUTTON: 'A', EVENT: 'click'}, e => e.setall({COLOR: 'blue'})),
        inputs: [{t: 200, button: 'A', down: true}, {t: 300, button: 'A', down: false}], at: [250, 500], lit: [500]},
    {name: 'a long press is a long click, not a click', ts: 'light.setBrightness(255)\n'
        + 'input.buttonA.onEvent(ButtonEvent.Click, function () { light.setAll(0xff0000) })\n'
        + 'input.buttonA.onEvent(ButtonEvent.LongClick, function () { light.setAll(0x00ff00) })',
    drive: async e => { e.setbrightness({BRIGHTNESS: 255}); },
    onHat: (op, f, e) => {
        hat('whenbutton', {BUTTON: 'A', EVENT: 'click'}, x => x.setall({COLOR: 'red'}))(op, f, e);
        hat('whenbutton', {BUTTON: 'A', EVENT: 'longClick'}, x => x.setall({COLOR: 'green'}))(op, f, e);
    },
    inputs: [{t: 100, button: 'A', down: true}, {t: 1300, button: 'A', down: false}], at: [1500], lit: [1500], ms: 2000},
    // The switch starts on the RIGHT in pxt-adafruit (switchRight() is true),
    // so moving it right first would raise nothing: left, then right again.
    {name: 'the slide switch moved left, then right', ts: 'light.setBrightness(255)\n'
        + 'input.onSwitchMoved(SwitchDirection.Left, function () { light.setAll(0xffff00) })\n'
        + 'input.onSwitchMoved(SwitchDirection.Right, function () { light.setAll(0x00ffff) })',
    drive: async e => { e.setbrightness({BRIGHTNESS: 255}); },
    onHat: (op, f, e) => {
        hat('whenswitch', {DIRECTION: 'left'}, x => x.setall({COLOR: 'yellow'}))(op, f, e);
        hat('whenswitch', {DIRECTION: 'right'}, x => x.setall({COLOR: '#00ffff'}))(op, f, e);
    },
    inputs: [{t: 200, switchRight: false}, {t: 600, switchRight: true}], at: [100, 400, 800], lit: [400, 800]},
    {name: 'a dark light level', ts: 'light.setBrightness(255)\n'
        + 'input.onLightConditionChanged(LightCondition.Dark, function () { light.setAll(0x00ff00) })',
    drive: async e => { e.setbrightness({BRIGHTNESS: 255}); },
    onHat: hat('whenlight', {CONDITION: 'dark'}, e => e.setall({COLOR: 'green'})),
    inputs: [{t: 200, light: 10}], at: [100, 400], lit: [400]},
    {name: 'a loud sound', ts: 'light.setBrightness(255)\ninput.onLoudSound(function () { light.setAll(0xff00ff) })',
        drive: async e => { e.setbrightness({BRIGHTNESS: 255}); },
        onHat: hat('whenloudsound', {}, e => e.setall({COLOR: '#ff00ff'})),
        inputs: [{t: 200, sound: 250}], at: [100, 400], lit: [400]}
];

for (const s of SCENARIOS) {
    test(`CPX device world vs MakeCode's simulator: ${s.name}`, {skip}, async () => {
        const opts = {ms: s.ms || 1200, at: s.at, inputs: s.inputs || []};
        const sim = await runAdafruitSim(await compileAdafruit(s.ts), opts);
        assert.equal(sim.error, null, `the reference simulator failed: ${sim.error}`);
        const ext = await runCpxExtension(s.drive, {...opts, onHat: s.onHat});
        assert.equal(ext.error, null, `the extension failed: ${ext.error}`);
        for (const t of s.at) {
            assert.deepEqual(ext.frames[t].map(hex), sim.frames[t].map(hex), `the ring at ${t} ms`);
        }
        // Not vacuous: a reference frame that is all off would match a ring
        // that never drew anything.
        for (const t of s.lit || s.at.slice(-1)) {
            assert.ok(sim.frames[t].some(c => c !== 0), `the reference ring at ${t} ms is dark; the scenario tests nothing`);
        }
        // The audible notes: pxt's mixer queues no instruction for a rest (it
        // is a pause), so a rest shows as the gap before the next note. Pitch
        // and duration must be equal; a start may lag by the 1 ms the sound
        // queue pauses between notes (inaudible), so it is held to 2 ms per
        // note plus 5 — which still catches a rest of the wrong length.
        const notes = r => r.tones.filter(x => x.frequency > 0);
        const want = notes(sim);
        const got = notes(ext);
        assert.deepEqual(got.map(x => [x.frequency, x.ms]), want.map(x => [x.frequency, x.ms]),
            'every audible note, in order, with its duration');
        got.forEach((x, i) => assert.ok(Math.abs(x.t - want[i].t) <= (2 * i) + 5,
            `note ${i} starts at ${x.t} ms, MakeCode's at ${want[i].t} ms`));
        if (s.sound) assert.ok(want.length > 0, 'the reference played no tone; the scenario tests nothing');
    });
}
