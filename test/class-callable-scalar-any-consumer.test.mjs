import test from 'node:test';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {proveClassCallableSource} from '../overlay/scratch-gui/src/lib/bw-makecode/class-callable-source-flow.js';
import {source as imageSource} from './fixtures/arcade/sdk-image-class-callables.mjs';
import {source as callableSource} from './fixtures/arcade-class-callable-source.mjs';

const parse = text => parseMakeCodeTs(text, {
    parameterDefaults: true,
    retainParentheses: true,
    retainClassHeritage: true,
    retainCallableMetadata: true
});
const prove = text => proveClassCallableSource(parse(text), {sdkImagePrototype: true});
const sourceWith = text => imageSource + '\n' + text;
const imageOptions = {classCallablePrototype: true, sdkImagePrototype: true};

test('ordinary callable source accepts concrete scalar producers for a named Any consumer unchanged', () => {
    const cases = [
        ['Number', 'let scalar:any=0;let result:number=scalar;'],
        ['String', 'let scalar:any="value";let result:string=scalar;'],
        ['Boolean', 'let scalar:any=true;let result:boolean=scalar;'],
        ['Undefined', 'let scalar:any=undefined;let result:undefined=scalar;']
    ];
    for (const [label, text] of cases) {
        const proof = prove(sourceWith(text));
        assert.deepEqual({eligible: proof.eligible, unsupported: proof.unsupported}, {eligible: true, unsupported: []}, label);
    }
});

test('Any stays a constraint across conditional scalar writers and does not hide a later String', () => {
    const conditional = prove(sourceWith('let scalar:any=0;let enabled=true;if(enabled){scalar="value";}else{scalar=false;}'));
    assert.deepEqual({eligible: conditional.eligible, unsupported: conditional.unsupported}, {eligible: true, unsupported: []});

    const changedWriter = prove(sourceWith('let scalar:any=0;scalar="later";let numeric:number=scalar;'));
    assert.equal(changedWriter.eligible, false);
    assert.match(changedWriter.unsupported.join(' '), /initializer numeric has an incompatible actual producer/);
});

test('Any does not discard unknown, generic, or non-scalar producers', () => {
    const unknownAlternative = prove(sourceWith('let scalar:any=0;let enabled=true;if(enabled){scalar=missing as any;}'));
    assert.equal(unknownAlternative.eligible, false);
    assert.match(unknownAlternative.unsupported.join(' '), /unresolved lexical value missing/);

    const genericOrigin = proveClassCallableSource(parse(callableSource.replace(
        'return action(this.state)', 'let result:any=action(this.state);return result'
    )));
    assert.equal(genericOrigin.eligible, false);
    assert.match(genericOrigin.unsupported.join(' '), /initializer result narrows an unbound generic result/);

    const objectProducer = prove(sourceWith('class Other{value:number;constructor(){this.value=1;}}let scalar:any=new Other();'));
    assert.equal(objectProducer.eligible, false);
    assert.match(objectProducer.unsupported.join(' '), /initializer scalar has an incompatible actual producer/);

    const noScalarProducer = prove(sourceWith('let scalar:any;let numeric:number=scalar;'));
    assert.equal(noScalarProducer.eligible, false);
    assert.match(noScalarProducer.unsupported.join(' '), /initializer numeric has an incompatible actual producer/);
});

test('the original Image fixture survives importer, Creator Code feedback, current export, and fresh source import', () => {
    const imported = arcadeToPseudocode(imageSource, {sdkImagePrototype: true});
    assert.deepEqual(imported.unsupported, []);
    assert.deepEqual(imported.warnings, []);

    const creator = new Creator();
    creator.parse(imported.code);
    assert.deepEqual(creator.errors, []);
    assert.deepEqual(creator.warnings, []);
    const initial = projectToArcade(creator.project, imageOptions);
    assert.deepEqual(initial.unsupported, []);
    assert.deepEqual(initial.warnings, []);

    const feedbackCreator = new Creator();
    feedbackCreator.parse(creator.decompile(structuredClone(creator.project)));
    assert.deepEqual(feedbackCreator.errors, []);
    assert.deepEqual(feedbackCreator.warnings, []);
    const current = projectToArcade(feedbackCreator.project, imageOptions);
    assert.deepEqual(current.unsupported, []);
    assert.deepEqual(current.warnings, []);
    for (const expression of [
        'picture.apply((input: Image)',
        'holder.read',
        'width = copied.width',
        'height = captured.height',
        'image.create(2, 2)'
    ]) assert.ok(current.ts.includes(expression), expression);

    const fresh = arcadeToPseudocode(current.files, {sdkImagePrototype: true});
    assert.deepEqual(fresh.unsupported, []);
    assert.deepEqual(fresh.warnings, []);
    assert.match(fresh.code, /GLOBAL width/);
    assert.match(fresh.code, /GLOBAL height/);
});
