// The ambient helper proof admits an outside Array method call only where
// original PXT compiles it as the builtin Array method: on a provable Array, on
// the exact canonical __bwArrayAccess result (declared any[]), or on a formal
// declared any[]. Near misses keep the call unknown, so the proof refuses.
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES as profiles,inspectGeneratedHelperBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {ARRAY_ACCESS_SOURCE} from '../overlay/scratch-gui/src/lib/bw-makecode/legacy-array-values.js';

const ambient=(source,internalNames=[])=>{
    const program=parseMakeCodeTs(source,profiles.ordinary);
    const internal=new Set(program.body.filter(node=>node.type==='FunctionDeclaration'&&internalNames.includes(node.name)));
    return inspectGeneratedHelperBindings(program,profiles.ordinary).ambient(internal);
};
const unknownRow='let row: any = 0\nfunction pick(): any { return row }\nrow = pick()\n';

test('a method on the canonical ArrayAccess result is a builtin Array effect',()=>{
    assert.equal(ambient(ARRAY_ACCESS_SOURCE+'\n'+unknownRow+'__bwArrayAccess(row).push(4)',['__bwArrayAccess']),true);
});

test('ArrayAccess near misses keep the receiver unknown',()=>{
    // Not selected as internal: its body is an ordinary outside function.
    assert.equal(ambient(ARRAY_ACCESS_SOURCE+'\n'+unknownRow+'__bwArrayAccess(row).push(4)'),false);
    // Declared result any: PXT dispatches dynamically, not as the Array builtin.
    const anyResult=ARRAY_ACCESS_SOURCE.replace('): any[] {','): any {');
    assert.notEqual(anyResult,ARRAY_ACCESS_SOURCE);
    assert.equal(ambient(anyResult+'\n'+unknownRow+'__bwArrayAccess(row).push(4)',['__bwArrayAccess']),false);
    // Local declared any: the canonical transport is gone.
    const anyLocal=ARRAY_ACCESS_SOURCE.replace('let array: any[] = value','let array: any = value');
    assert.notEqual(anyLocal,ARRAY_ACCESS_SOURCE);
    assert.equal(ambient(anyLocal+'\n'+unknownRow+'__bwArrayAccess(row).push(4)',['__bwArrayAccess']),false);
    // A method outside the builtin Array set stays refused.
    assert.equal(ambient(ARRAY_ACCESS_SOURCE+'\n'+unknownRow+'__bwArrayAccess(row).fill(4)',['__bwArrayAccess']),false);
});

test('a method on a formal declared any[] is a builtin Array effect; other formals are not',()=>{
    assert.equal(ambient('function add(array: any[], value: any): void { array.push(value) }\nadd([], 1)'),true);
    assert.equal(ambient('function add(array: any, value: any): void { array.push(value) }\nadd([], 1)'),false);
    assert.equal(ambient('function add(array: number, value: any): void { (array as any).push(value) }\nadd(0, 1)'),false);
    // A local of the same name declared any[] is not the formal.
    assert.equal(ambient(unknownRow+'function add(value: any): void { let array: any[] = row\n array.push(value) }\nadd(1)'),false);
});
