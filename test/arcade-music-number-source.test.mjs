import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {createOrdinaryMusicNumberSource,MUSIC_NUMBER_RUNTIME_SHA256} from '../overlay/scratch-gui/src/lib/bw-makecode/ordinary-music-number-source.js';
import {analyseSourceValueProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/source-value-producers.js';
import {GENERATED_HELPER_PROFILES} from '../overlay/scratch-gui/src/lib/bw-makecode/generated-helper-recognition.js';
import {nativeArrayAddHelperSource} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-helper-source.js';
import {inspectNativeArrayBinaryDomains} from '../overlay/scratch-gui/src/lib/bw-makecode/native-array-binary-domain.js';

const getters=program=>{
    const found=[];
    const visit=node=>{
        if(!node||typeof node!=='object')return;
        if(node.type==='Call'&&node.callee?.object?.name==='music'&&['tempo','volume'].includes(node.callee.name))found.push(node);
        for(const [key,value]of Object.entries(node))if(!['originalBody','parameterDefaults'].includes(key)){
            if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
        }
    };visit(program);return found;
};
const observe=source=>{
    const program=parseMakeCodeTs(source,{retainCallableMetadata:true});
    return {program,calls:getters(program),profile:createOrdinaryMusicNumberSource(program),
        graph:analyseSourceValueProducers(program,{unboundIsOpaque:true,ordinaryPrimitiveSdkNumbers:true})};
};

test('music Number result profile binds the actual generated mixer identity',()=>{
    const bytes=readFileSync(new URL('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/music-pxt.js',import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),MUSIC_NUMBER_RUNTIME_SHA256);
});

test('tempo and volume normal results are Number without certifying their inputs',()=>{
    for(const source of ['let n=music.tempo()+1','music.setVolume(90);let n=music.volume()+1',
        'music.setTempo("bad");let n=music.tempo()+1',
        'function update(){music.changeTempoBy(1)}game.onUpdate(update);let n=music.tempo()+1']){
        const {profile,graph,calls}=observe(source);assert.ok(calls.length);
        for(const call of calls){assert.equal(profile.has(call),true,profile.reason);assert.deepEqual([...graph.typesAt(call)],['Number']);}
    }
    const {program,graph}=observe('let input="bad";music.setTempo(input);let n=music.tempo()+1');
    const input=program.body[1].expr.args[0];assert.deepEqual([...graph.typesAt(input)],['String']);
});

test('music result proof refuses mutable dependencies, hidden defaults and foreign effects',()=>{
    const prefixes=[
        'Math.max=()=>"bad";','Math.clamp=()=>"bad";',
        'let dependency=Math;','let mixer=music;','let getter=music.tempo;',
        'music.tempo=()=>"bad";','music["tempo"]=()=>"bad";',
        'function unused(){Math.max=()=>"bad"}',
        'function f(x:any=(music.tempo=function(){return "bad"})){}f();',
        'game.onUpdate(function(x:any=(music.tempo=function(){return "bad"})){});',
        'game.onUpdate=function(f:any){music.tempo=()=>"bad"};',
        'control.runInParallel=function(f:any){music.tempo=()=>"bad"};',
        'console.log=function(){music.tempo=()=>"bad"};',
        'Number=function(){music.tempo=()=>"bad";return 1};Number(0);',
        'let unknown=foreignValue;','foreignEffect();',
        'let img:any=function(){music.tempo=()=>"bad"};let picture=img`1`;',
        'assets.image=()=>"bad";','namespace hidden {music.tempo=()=>"bad"}',
        'let playable:any=null;music.play(playable,music.PlaybackMode.InBackground);'
    ];
    for(const prefix of prefixes){
        const {profile,calls,graph}=observe(prefix+'let n=music.tempo()+1');
        assert.ok(calls.length,prefix);
        for(const call of calls){assert.equal(profile.has(call),false,prefix);assert.notDeepEqual([...graph.typesAt(call)],['Number'],prefix);}
    }
});

test('future executable AST forms cannot silently bypass the effect census',()=>{
    const program=parseMakeCodeTs('let n=music.tempo()');
    program.body.unshift({type:'OpaqueEffect',raw:'music.tempo=()=>"bad"'});
    const profile=createOrdinaryMusicNumberSource(program);
    assert.equal(profile.has(getters(program)[0]),false);
});

test('native helper projection cannot erase default effects before music admission',()=>{
    const profile=GENERATED_HELPER_PROFILES.ordinary;
    const helper=nativeArrayAddHelperSource('__bwBinaryAdd',true,true);
    const inspect=prefix=>{
        // An unrelated Array prevents the existing Array-free ordinary-+
        // fallback from legitimately accepting an unknown getter result.
        const program=parseMakeCodeTs(helper+';'+prefix+'let values=[1];let n=__bwBinaryAdd(music.tempo(),1)',
            {...profile,parameterDefaults:false,retainCallableMetadata:false,retainPrimitiveProcedureDefaults:false});
        return {program,proof:inspectNativeArrayBinaryDomains(program,profile)};
    };
    const positive=inspect('');assert.equal(positive.proof.reason,null);assert.equal(positive.proof.helpers.size,1);
    const hidden=inspect('function f(x:any=(music.tempo=function(){return "bad"})){}f();');
    const fn=hidden.program.body.find(node=>node.name==='f');
    assert.equal(fn.parameterDefaults,undefined);assert.equal(fn.params.parameterDefaults.length,1);
    // Refusal may occur earlier in generated-helper admission; absence of a
    // diagnostic reason never grants a helper/result certificate.
    assert.equal(hidden.proof.helpers.size,0);
});

test('observed source changes permanently revoke profile and propagated Number facts',()=>{
    const {program,calls,profile,graph}=observe('let n=music.tempo()+1');
    assert.equal(profile.has(calls[0]),true);assert.deepEqual([...graph.typesAt(calls[0])],['Number']);
    const old=program.body[0].decls[0].name;program.body[0].decls[0].name='edited';
    assert.equal(profile.current(),false);assert.deepEqual([...graph.typesAt(calls[0])],[]);
    program.body[0].decls[0].name=old;
    assert.equal(profile.current(),false);assert.equal(profile.has(calls[0]),false);
    assert.deepEqual([...graph.typesAt(calls[0])],[]);
});

test('observed intrinsic replacement permanently revokes a music result profile',()=>{
    const {calls,profile,graph}=observe('let n=music.volume()+1');
    assert.equal(profile.has(calls[0]),true);
    const original=Object.getOwnPropertyDescriptor(Math,'max');
    try{
        Object.defineProperty(Math,'max',{...original,value:()=> 'bad'});
        assert.equal(profile.current(),false);assert.deepEqual([...graph.typesAt(calls[0])],[]);
    }finally{Object.defineProperty(Math,'max',original);}
    assert.equal(profile.current(),false);assert.deepEqual([...graph.typesAt(calls[0])],[]);
});

test('Array APIs cannot retain music-derived Number facts after consumed proof expiry',()=>{
    const program=parseMakeCodeTs('let values=[music.tempo()];let alias=values');
    const call=getters(program)[0],read=program.body[1].decls[0].init;
    const graph=analyseSourceValueProducers(program,{arrayValues:true,arrayEffectSites:true,
        ordinaryPrimitiveSdkNumbers:true,unboundIsOpaque:true});
    assert.deepEqual([...graph.typesAt(call)],['Number']);
    assert.deepEqual([...graph.arrayElementTypesAt(read)],['Number']);
    assert.equal(graph.arrayMapReceiverSafeAt(read),true);
    const before=program.body[0].decls[0].name;program.body[0].decls[0].name='edited';
    assert.deepEqual([...graph.typesAt(call)],[]);
    program.body[0].decls[0].name=before;
    assert.deepEqual([...graph.arrayElementTypesAt(read)],[]);
    assert.deepEqual(graph.arrayAllocationsAt(read),[]);
    assert.deepEqual(graph.possibleArrayAllocationsAt(read),[]);
    assert.equal(graph.arrayMapReceiverSafeAt(read),false);
    assert.equal(graph.isInitializedAt(read),false);
    assert.ok(graph.arrayConstraintErrorsAt(read).length);
});
