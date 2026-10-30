import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {GENERATED_HELPER_PROFILES,inspectGeneratedHelperBindings} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource,inspectNativeArrayAddHelpers} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';

const profile=GENERATED_HELPER_PROFILES.ordinary;
const source='class Box {constructor(public readonly n:number, protected label:string="kept"){this.n=n}}';
const parse=()=>parseMakeCodeTs(source,profile);

test('constructor parameter-property fields own primitive modifier arrays without changing parser metadata',()=>{
    const program=parse(),cls=program.body.find(node=>node.type==='Class');
    const properties=cls.ctor.parameterProperties;
    assert.equal(properties,cls.ctor.params.parameterProperties,'actual retained parameter provenance remains shared metadata');
    assert.deepEqual(cls.ctor.params,['n','label']);
    assert.deepEqual(cls.ctor.parameterDefaults,[{name:'label',value:{type:'String',value:'kept'}}]);
    assert.equal(cls.ctor.parameterDefaults,cls.ctor.params.parameterDefaults);
    for(const [index,expected]of [[0,{name:'n',typeName:'number',modifiers:['public','readonly']}],[1,{name:'label',typeName:'string',modifiers:['protected']}]] ){
        const field=cls.fields[index],property=properties[index];
        assert.deepEqual(property,expected);
        assert.deepEqual(field,{...expected,init:null,isStatic:false,parameterProperty:true});
        assert.notEqual(field.modifiers,property.modifiers,'synthetic field must not reuse executable-walk metadata array');
    }
    const before=structuredClone(properties);cls.fields[0].modifiers.push('private');
    assert.deepEqual(properties,before,'editing synthetic field metadata does not edit constructor parameter provenance');
    assert.equal(cls.ctor.body[0].type,'If','actual default prologue is retained');
    assert.equal(cls.ctor.body[1].expr.left.name,'n','parameter property assignment remains in actual constructor');
    assert.equal(cls.ctor.originalBody[0].expr.left.name,'n','actual authored body is retained');
});

test('actual parameter properties permit complete native helper proof while shared executable nodes remain refused',()=>{
    const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
    const text=helper+';'+source+';let value=__bwBinaryAdd(1,2)';
    const program=parseMakeCodeTs(text,profile),proof=inspectNativeArrayAddHelpers(program,profile);
    assert.equal(proof.current(),true);assert.equal(proof.helpers.size,1);
    const cls=program.body.find(node=>node.type==='Class'),before=cls.fields[0].modifiers[0];
    cls.fields[0].modifiers[0]='private';assert.equal(proof.current(),false,'scalar metadata remains in actual source snapshot');
    cls.fields[0].modifiers[0]=before;
    assert.equal(inspectNativeArrayAddHelpers(program,profile).helpers.size,1,'fresh restored source can be inspected');
    const shared=parseMakeCodeTs(text,profile),call=shared.body.find(node=>node.type==='Declaration').decls[0].init;
    call.args[1]=call.args[0];
    assert.equal(inspectGeneratedHelperBindings(shared,profile).isCurrent(),false,'shared executable operand identity still refuses');
});
