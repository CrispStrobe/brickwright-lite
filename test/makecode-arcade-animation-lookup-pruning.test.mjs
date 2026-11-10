import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';

// Call-site pruning of the generated animation lookup shape (row 2g
// animation-export, Array part): `IF id == "<key>" THEN return frames` plus a
// fallback `return undefined`. A matching constant argument yields only the
// frames Array; every deviation keeps the Array refusal.
const KEY = '12345678-1234-4234-8234-123456789abc';
const ARRAY_REFUSAL = /^Array reference .*requires an actual initialized Array producer/;
const program = ({returned = 'frames', arg = `("${KEY}")`, compare = KEY, fallback = '', op = '==', before = '', inThen = '', ifLine = null, elseBlock = '', writer = '', keyInit = ` = "${KEY}"`, keyPre = '', keyPost = '', extra = ''} = {}) => `DEVICE ARCADE
GLOBAL frames
GLOBAL first
GLOBAL key${keyInit}
SPRITE Game:
WHEN arcade source starts:
  declare arcade source reference frames as "Image[]"
  declare arcade source reference first as "Image[]"
  hide
  arcade set local __bwPxtValue1 to (new array reference from ("[]"))
  mutate array reference (arcade local __bwPxtValue1) op "push" index (0) value ((0 + (1)))
  set frames to (arcade local __bwPxtValue1)
${keyPre}  set first to (arcade call function "lookup %s" arguments (arcade function argument ${arg} rest ("[]")))
  arcade log (item (0) of array reference (first))
  arcade log length of array reference (first)
${keyPost}DEFINE lookup (id):
  declare arcade procedure "lookup %s" parameter "id" as String
${before}${writer}  ${ifLine || `IF compare value (arcade local id) op "${op}" with ("${compare}") THEN:`}
${inThen}    arcade return value (${returned})
${elseBlock}${fallback}  arcade log calculate value ("Animation resource unavailable: ") op "+" with (arcade local id)
  arcade return value (undefined value)
DEFINE helper:
  arcade return value ((0 + (1)))
${extra}`;
const arrayRefusals = (source, monitorMode = null) => {
    const creator = new Creator(); creator.parse(source); assert.deepEqual(creator.warnings, []);
    if (monitorMode) {
        const stage = creator.project.targets.find(t => t.isStage), id = Object.keys(stage.variables).find(k => stage.variables[k][0] === 'key');
        const monitor = (creator.project.monitors ||= []).find(m => m.id === id);
        if (monitor) Object.assign(monitor, {mode: monitorMode, visible: true});
        else creator.project.monitors.push({id, mode: monitorMode, opcode: 'data_variable', params: {VARIABLE: 'key'}, spriteName: null, value: KEY, visible: true, sliderMin: 0, sliderMax: 100, isDiscrete: true});
    }
    return projectToArcade(creator.project).unsupported.filter(reason => ARRAY_REFUSAL.test(reason));
};

test('a matching constant lookup argument yields only the returned Array', () => {
    assert.deepEqual(arrayRefusals(program()), []);
    assert.deepEqual(arrayRefusals(program({op: '==='})), []);
});
// The real re-imported __bwAnimationFreshFrames THEN (second-export input of
// the animation-resources fixture): a fresh local list, pushes of copies of
// constant frame images, then the return of that local.
const FRESH_PUSH = '    mutate array reference (arcade local fresh) op "push" index (0) value (arcade copy image (arcade frame image array "imageImage" index (0) template "image" start 0 count 2))\n';
const FRESH = {inThen: '    arcade set local fresh to (new array reference from ("[]"))\n' + FRESH_PUSH + FRESH_PUSH.replace('index (0)', 'index (1)'), returned: 'arcade local fresh'};
test('a THEN that only builds the returned local list still prunes', () => {
    assert.deepEqual(arrayRefusals(program(FRESH)), []);
});
const refused = {
    // Near-misses of the THEN builder walk.
    'a THEN builder that stores a global': {...FRESH, inThen: FRESH.inThen + '    set frames to (arcade local fresh)\n'},
    'a THEN builder pushing onto a global list': {...FRESH, inThen: FRESH.inThen + '    mutate array reference (frames) op "push" index (0) value ((0 + (2)))\n'},
    'a THEN builder storing a non-fresh value': {...FRESH, inThen: '    arcade set local fresh to (frames)\n', returned: 'arcade local fresh'},
    'a procedure call inside the THEN builder': {...FRESH, inThen: FRESH.inThen + '    CALL: (helper)\n'},
    'a call nested in a pushed value': {...FRESH, inThen: FRESH.inThen + '    mutate array reference (arcade local fresh) op "push" index (0) value (arcade call function "helper" arguments ("[]"))\n'},
    'a nested IF with its own return inside the THEN': {...FRESH, inThen: FRESH.inThen + '    IF compare value (arcade local id) op "==" with ("x") THEN:\n      arcade return value (undefined value)\n'},
    'a return inside the builder before the final return': {...FRESH, inThen: '    arcade set local fresh to (new array reference from ("[]"))\n    arcade return value (frames)\n' + FRESH_PUSH},
    'a THEN builder followed by another statement': {...FRESH, inThen: FRESH.inThen + '    arcade log ("x")\n'},
    'a non-constant argument': {arg: '(key)'},
    'a computed string argument': {arg: `(calculate value ("") op "+" with ("${KEY}"))`},
    'a parameter with another writer in the body': {writer: '  arcade set local id to ("other")\n'},
    // The guard is conservative: any writer of P, even one after the IF.
    'a parameter written in the fallback': {fallback: '  arcade set local id to ("other")\n'},
    'a comparison against a non-literal': {compare: null, ifLine: 'IF compare value (arcade local id) op "==" with (key) THEN:'},
    'an extra statement before the IF': {before: '  arcade log ("x")\n'},
    'an extra statement in the THEN branch': {inThen: '    arcade log ("x")\n'},
    'a different comparison literal': {compare: 'another-key'},
    'a comparison against a non-parameter': {ifLine: `IF compare value (key) op "==" with ("${KEY}") THEN:`},
    'an inequality comparison': {op: '!='},
    'an else branch returning something else': {ifLine: `IF compare value (arcade local id) op "==" with ("${KEY}") THEN:`, elseBlock: '  ELSE:\n    arcade return value (undefined value)\n'}
};
for (const [name, shape] of Object.entries(refused)) test('refuses ' + name, () => {
    assert.ok(arrayRefusals(program(shape)).length > 0, name);
});
// The push onto the String parameter is refused on its own; the call result
// read through `first` must still be refused because no pruning applies.
test('refuses pruning when the THEN builder pushes onto the parameter', () => {
    const reasons = arrayRefusals(program({...FRESH, inThen: FRESH.inThen + '    mutate array reference (arcade local id) op "push" index (0) value ((0 + (2)))\n'}));
    assert.ok(reasons.some(reason => /arrays_reference(Item|Length) ARRAY/.test(reason)), JSON.stringify(reasons));
});

// A global key: the real re-imported (key) shape is `GLOBAL key` (initial 0)
// with one top-level `set key to ("<uuid>")` earlier in the same script.
const KEYED = {arg: '(key)', keyInit: '', keyPre: `  set key to ("${KEY}")\n`};
test('a global key with one earlier literal writer in the same script prunes', () => {
    assert.deepEqual(arrayRefusals(program(KEYED)), []);
    assert.deepEqual(arrayRefusals(program(KEYED), 'default'), []);
});
const keyRefused = {
    'a second writer of the key in another event script': [{...KEYED, extra: `SPRITE Other:\nWHEN flag clicked:\n  set key to ("${KEY}")\n`}],
    'a writer of a different string': [{...KEYED, compare: KEY, keyPre: '  set key to ("other")\n'}],
    'a writer inside an IF before the call': [{...KEYED, keyPre: `  IF compare value (0) op "<" with (1) THEN:\n    set key to ("${KEY}")\n`}],
    'a writer after the call': [{...KEYED, keyPre: '', keyPost: `  set key to ("${KEY}")\n`}],
    'a non-literal (computed) writer': [{...KEYED, keyPre: `  set key to (calculate value ("") op "+" with ("${KEY}"))\n`}],
    'a writer that is a procedure call': [{...KEYED, keyPre: '  set key to (arcade call function "helper" arguments ("[]"))\n'}],
    'a change-by of the key': [{...KEYED, keyPre: KEYED.keyPre + '  change key by 1\n'}],
    'a non-writing block naming the key': [{...KEYED, keyPre: KEYED.keyPre + '  show variable key\n'}],
    'a slider monitor on the key': [KEYED, 'slider'],
    'only the initial value, no writer': [{...KEYED, keyInit: ` = "${KEY}"`, keyPre: ''}]
};
for (const [name, [shape, monitor]] of Object.entries(keyRefused)) test('refuses ' + name, () => {
    assert.ok(arrayRefusals(program(shape), monitor).length > 0, name);
});
