import test from 'node:test';
import assert from 'node:assert/strict';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {adafruitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/adafruit-translate.js';

function parse (source) {
    const translated = adafruitToPseudocode(source);
    const creator = new SB3Creator();
    const project = creator.parse(translated.code);
    assert.deepEqual(creator.warnings, [], translated.code);
    return {...translated, project, blocks: Object.values(project.targets[0].blocks)};
}
const op = (r, name) => r.blocks.filter(b => b.opcode === `circuitplayground_${name}`);

test('CPX ring expressions become real device blocks with numeric colour inputs', () => {
    const r = parse('light.setBrightness(255)\nlight.setAll(light.rgb(10,20,30))\n'
        + 'light.setPixelColor(2, light.hsv(85))\nlight.setGradient(Colors.Red, Colors.Blue)\n'
        + 'light.graph(5,10)\nlight.showRing("red green blue yellow purple white orange pink red green")\nlight.clear()');
    assert.deepEqual(r.unsupported, []);
    for (const name of ['setbrightness', 'setall', 'rgb', 'setpixel', 'hsv', 'setgradient', 'graph', 'showring', 'clearpixels']) {
        assert.equal(op(r, name).length, 1, name);
    }
    const hsv = op(r, 'hsv')[0];
    assert.deepEqual(hsv.inputs.S, [1, [4, '255']]);
    assert.deepEqual(hsv.inputs.V, [1, [4, '255']]);
});

test('CPX sound uses live note/tempo/beat reporters and its own sound menu', () => {
    const r = parse('music.setTempo(60)\nmusic.changeTempoBy(20)\nmusic.setVolume(100)\n'
        + 'music.playTone(music.noteFrequency(Note.C),music.beat(BeatFraction.Quarter))\n'
        + 'music.rest(50)\nmusic.ringTone(440)\nmusic.playSound(music.sounds(Sounds.MagicWand))\n'
        + 'music.playSoundUntilDone(music.sounds(Sounds.Siren))\nmusic.stopAllSounds()');
    assert.deepEqual(r.unsupported, []);
    for (const name of ['settempo', 'changetempo', 'setvolume', 'note', 'beat', 'playtone', 'rest', 'ringtone',
        'playsound', 'playsounduntildone', 'stopsounds']) assert.equal(op(r, name).length, 1, name);
    assert.equal(op(r, 'note')[0].fields.NOTE[0], 'C');
    assert.equal(op(r, 'beat')[0].fields.FRACTION[0], 'quarter');
    assert.equal(op(r, 'playsound')[0].fields.SOUND[0], 'magicWand');
    assert.equal(op(r, 'playsounduntildone')[0].fields.SOUND[0], 'siren');
});

test('CPX handlers bind native hats and preserve their exact event fields', () => {
    const r = parse('input.buttonA.onEvent(ButtonEvent.LongClick,function(){light.clear()})\n'
        + 'input.buttonsAB.onEvent(ButtonEvent.Down,function(){light.clear()})\n'
        + 'input.pinA1.onEvent(ButtonEvent.Click,function(){light.clear()})\n'
        + 'input.onGesture(Gesture.Shake,function(){light.clear()})\n'
        + 'input.onSwitchMoved(SwitchDirection.Left,function(){light.clear()})\n'
        + 'input.onLightConditionChanged(LightCondition.Dark,function(){light.clear()})\n'
        + 'input.onLoudSound(function(){light.clear()})\n'
        + 'input.onTemperatureConditionChanged(TemperatureCondition.Hot,30,TemperatureUnit.Celsius,function(){light.clear()})');
    assert.deepEqual(r.unsupported, []);
    assert.deepEqual(op(r, 'whenbutton').map(b => [b.fields.BUTTON[0], b.fields.EVENT[0]]), [['A', 'longClick'], ['A+B', 'down']]);
    assert.equal(op(r, 'whentouch')[0].fields.PAD[0], 'A1');
    assert.equal(op(r, 'whengesture')[0].fields.GESTURE[0], 'shake');
    assert.equal(op(r, 'whenswitch')[0].fields.DIRECTION[0], 'left');
    assert.equal(op(r, 'whenlight')[0].fields.CONDITION[0], 'dark');
    assert.equal(op(r, 'whenloudsound').length, 1);
    assert.equal(op(r, 'whentemperature')[0].fields.UNIT[0], 'C');
});

test('pinned built-in Melody objects use the same named sound without inventing per-play volume', () => {
    const r = parse('music.baDing.play()\nmusic.siren.playUntilDone()');
    assert.deepEqual(r.unsupported, []);
    assert.equal(op(r, 'playsound')[0].fields.SOUND[0], 'baDing');
    assert.equal(op(r, 'playsounduntildone')[0].fields.SOUND[0], 'siren');
    const refused = adafruitToPseudocode('music.baDing.play(50)');
    assert.ok(refused.unsupported.some(s => s.startsWith('music.baDing.play() — ')));
});

test('CPX animations retain their actual selected animation fields', () => {
    const r = parse('light.showAnimation(light.rainbowAnimation,1000)\n'
        + 'light.showAnimationFrame(light.cometAnimation)\nlight.stopAllAnimations()');
    assert.deepEqual(r.unsupported, []);
    assert.equal(op(r, 'showanimation')[0].fields.ANIMATION[0], 'rainbow');
    assert.equal(op(r, 'showanimationframe')[0].fields.ANIMATION[0], 'comet');
    assert.equal(op(r, 'stopanimations').length, 1);
});

test('CPX boolean reporters remain booleans in conditions', () => {
    const r = parse('if(input.buttonB.isPressed() && input.switchRight()){light.clear()}\n'
        + 'if(input.pinA3.isPressed()){light.clear()}');
    assert.deepEqual(r.unsupported, []);
    assert.equal(op(r, 'isbuttonpressed').length, 1);
    assert.equal(op(r, 'isswitchright').length, 1);
    assert.equal(op(r, 'istouchpressed').length, 1);
    assert.equal(r.blocks.filter(b => b.opcode === 'operator_equals').length, 0);
});

test('ordinary helper results survive procedure lowering without colliding with authored names', () => {
    const r = parse('let shade_result=99\nfunction shade(x:number){return x+1}\nlight.setPixelColor(0,shade(2))');
    assert.deepEqual(r.unsupported, []);
    assert.equal(r.blocks.filter(b => b.opcode === 'procedures_call').length, 1);
    assert.equal(op(r, 'setpixel').length, 1);
    assert.match(r.code, /set shade_result_ to/);
});

for (const source of [
    'network.infraredSendNumber(1)', 'keyboard.type("x")', 'storage.appendLine("x","y")',
    'light.photonForward(1)', 'light.createStrip(pins.A1,10)', 'pins.i2cWriteNumber(1,2,3)',
    'control.raiseEvent(1,2)', 'datalogger.logValue("x",1)', 'settings.writeNumber("x",1)'
]) test(`CPX refusal stays named in code and metadata: ${source}`, () => {
    const r = adafruitToPseudocode(source);
    const name = source.match(/^[\w.]+/)[0];
    assert.ok(r.unsupported.some(s => s.startsWith(`${name}() — `)), JSON.stringify(r));
    for (const refusal of r.unsupported) assert.ok(r.code.includes(`# unsupported: ${refusal}`));
});

test('calls hidden in a refused enclosing construct are individually named', () => {
    const r = adafruitToPseudocode('control.runInBackground(function(){light.setAll(light.rgb(1,2,3))})');
    for (const name of ['control.runInBackground', 'light.setAll', 'light.rgb']) {
        assert.ok(r.unsupported.some(s => s.startsWith(`${name}() — `)), JSON.stringify(r));
    }
});

test('declared API-looking bindings do not acquire CPX device authority', () => {
    const r = adafruitToPseudocode('let light=0\nlight.setAll(0xff0000)');
    assert.ok(r.unsupported.some(s => /light\.setAll.*binding is declared/.test(s)));
    assert.doesNotMatch(r.code, /\n\s+set all pixels/);
});

test('named handler callbacks keep their actual procedure invocation', () => {
    const r = parse('function clearRing(){light.clear()}\ninput.onLoudSound(clearRing)');
    assert.deepEqual(r.unsupported, []);
    assert.equal(op(r, 'whenloudsound').length, 1);
    assert.equal(op(r, 'clearpixels').length, 1);
    const call = r.blocks.find(b => b.opcode === 'procedures_call');
    assert.ok(call);
    assert.equal(r.project.targets[0].blocks[call.parent].opcode, 'circuitplayground_whenloudsound');
});

test('expression-bodied callbacks execute the returned command before leaving', () => {
    const r = parse('input.onLoudSound(()=>light.clear())');
    assert.deepEqual(r.unsupported, []);
    assert.equal(op(r, 'clearpixels').length, 1);
    assert.equal(op(r, 'whenloudsound').length, 1);
    assert.ok(r.blocks.some(b => b.opcode === 'procedures_call'));
});

test('unresolved callbacks and dynamic registration remain named refusals', () => {
    for (const source of ['input.onLoudSound(missing)', 'if(true){input.onLoudSound(()=>light.clear())}']) {
        const r = adafruitToPseudocode(source);
        assert.ok(r.unsupported.some(s => s.startsWith('input.onLoudSound() — ')));
        assert.doesNotMatch(r.code, /^when loud sound:/m);
    }
});

test('unmapped receiver calls retain a reason in both the code and returned refusal list', () => {
    const r = adafruitToPseudocode('let strip=light.createStrip(pins.A1,10)\nstrip.setAll(0xff0000)');
    for (const refusal of r.unsupported) {
        assert.match(refusal, / — \S/);
        assert.ok(r.code.includes(`# unsupported: ${refusal}`));
    }
    assert.ok(r.unsupported.some(s => s.startsWith('strip.setAll() — ')));
});

test('a handler registered after yielding initialization cannot silently become active at Start', () => {
    const r = adafruitToPseudocode('pause(1000)\ninput.onLoudSound(function(){light.setAll(0xff0000)})');
    assert.ok(r.unsupported.some(s => /input\.onLoudSound\(\).*late registration/.test(s)));
    assert.doesNotMatch(r.code, /^when loud sound:/m);
    assert.match(r.code, /wait 1 seconds/);
    assert.ok(r.unsupported.some(s => s.startsWith('light.setAll() — ')));
});

test('the pinned target distinguishes the pewPew Melody from its older Sounds enum', () => {
    const melody = parse('music.pewPew.play()');
    assert.deepEqual(melody.unsupported, []);
    assert.equal(op(melody, 'playsound')[0].fields.SOUND[0], 'pewPew');
    const invalidEnum = adafruitToPseudocode('music.playSound(music.sounds(Sounds.PewPew))');
    assert.ok(invalidEnum.unsupported.some(s => s.startsWith('music.sounds() — ')));
    assert.ok(invalidEnum.unsupported.some(s => s.startsWith('music.playSound() — ')));
});

test('an unmapped animation picker remains individually named inside the refused animation call', () => {
    const r = adafruitToPseudocode('light.showAnimation(light._animationPicker(unknownAnimation),1000)');
    assert.ok(r.unsupported.some(s => s.startsWith('light._animationPicker() — ')));
    assert.ok(r.unsupported.some(s => s.startsWith('light.showAnimation() — ')));
});
