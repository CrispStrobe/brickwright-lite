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
const program = ({arg = `("${KEY}")`, compare = KEY, fallback = '', op = '==', before = '', inThen = '', ifLine = null, elseBlock = '', writer = ''} = {}) => `DEVICE ARCADE
GLOBAL frames
GLOBAL first
GLOBAL key = "${KEY}"
SPRITE Game:
WHEN arcade source starts:
  declare arcade source reference frames as "Image[]"
  declare arcade source reference first as "Image[]"
  hide
  arcade set local __bwPxtValue1 to (new array reference from ("[]"))
  mutate array reference (arcade local __bwPxtValue1) op "push" index (0) value ((0 + (1)))
  set frames to (arcade local __bwPxtValue1)
  set first to (arcade call function "lookup %s" arguments (arcade function argument ${arg} rest ("[]")))
  arcade log (item (0) of array reference (first))
  arcade log length of array reference (first)
DEFINE lookup (id):
  declare arcade procedure "lookup %s" parameter "id" as String
${before}${writer}  ${ifLine || `IF compare value (arcade local id) op "${op}" with ("${compare}") THEN:`}
${inThen}    arcade return value (frames)
${elseBlock}${fallback}  arcade log calculate value ("Animation resource unavailable: ") op "+" with (arcade local id)
  arcade return value (undefined value)
`;
const arrayRefusals = source => {
    const creator = new Creator(); creator.parse(source); assert.deepEqual(creator.warnings, []);
    return projectToArcade(creator.project).unsupported.filter(reason => ARRAY_REFUSAL.test(reason));
};

test('a matching constant lookup argument yields only the returned Array', () => {
    assert.deepEqual(arrayRefusals(program()), []);
    assert.deepEqual(arrayRefusals(program({op: '==='})), []);
});
const refused = {
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
