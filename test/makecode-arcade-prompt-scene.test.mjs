import test from 'node:test';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import assert from 'node:assert/strict';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {runProgram,stepFrames,clearStrayTimers} from './helpers/bw-vm.mjs';
const code=`let hero=sprites.create(img\`1\`,SpriteKind.Player)
hero.setVelocity(30,0)
let answer=0
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){answer=game.askForNumber("Difficulty?")})`;
const variable=(run,name)=>run.vm.runtime.targets.flatMap(t=>Object.values(t.variables)).find(v=>v.name===name||v.name===name+'_'||v.name==='Game_'+name)?.value;
const press=run=>run.vm.postIOData('keyboard',{key:' ',isDown:true});

test('native text-entry prompt suspends the saved scene until the actual answer arrives',async()=>{
    try {
        const imported=arcadeToPseudocode(code);assert.deepEqual(imported.unsupported,[]);
        const run=await runProgram(imported.code,{frames:4,uploads:imported.costumes});
        const world=run.vm.runtime.bwArcadeDeviceState,actor=world.sprites[variable(run,'hero')];assert.ok(actor);
        let question;run.vm.runtime.on('QUESTION',value=>{if(value!==null)question=value;});
        press(run);await stepFrames(run.vm,4,20);assert.equal(question,'Difficulty?');
        const x=actor._fx;await stepFrames(run.vm,20,20);
        assert.equal(actor._fx,x,'underlying moving actor must remain suspended');
        assert.notEqual(run.vm.runtime.bwArcadeDeviceState,world);
        run.vm.runtime.emit('ANSWER','1');await stepFrames(run.vm,5,20);
        assert.equal(variable(run,'answer'),1);assert.equal(run.vm.runtime.bwArcadeDeviceState,world);
        assert.ok(actor._fx>x);assert.deepEqual(run.errors,[]);
    }finally{clearStrayTimers();}
});

for(const [text,expected] of [['',NaN],['bad',NaN],['1234567',123456],['1.5',1.5]])test('default original number prompt parses '+JSON.stringify(text),async()=>{
    try {
        const imported=arcadeToPseudocode('let answer=game.askForNumber("n")\nanswer+=0');
        const run=await runProgram(imported.code,{frames:3,uploads:imported.costumes});
        run.vm.runtime.emit('ANSWER',text);await stepFrames(run.vm,5,20);
        assert.equal(variable(run,'answer'),expected);assert.deepEqual(run.errors,[]);
    }finally{clearStrayTimers();}
});

function promptHost(ask) {
    const runtime=new EventEmitter();
    runtime.getOpcodeFunction=opcode=>opcode==='sensing_askandwait'?ask:()=> 'reply';
    const arcade=new (loadExtensionClass('arcade'))(runtime)._inst;
    return {runtime,arcade,util:{target:{}}};
}

test('failed text entry restores the caller scene and permits another prompt',async()=>{
    const {arcade,util}=promptHost(()=>{throw new Error('question failed');});
    const original=arcade._state();
    await assert.rejects(arcade.askForString({QUESTION:'one'},util),/question failed/);
    assert.equal(arcade._state(),original);assert.equal(arcade._sceneStack.length,0);
    await assert.rejects(arcade.askForString({QUESTION:'two'},util),/question failed/);
    assert.equal(arcade._state(),original);assert.equal(arcade._textPromptWaits.size,0);
});

for(const event of ['PROJECT_STOP_ALL','RUNTIME_DISPOSED'])test(event+' cancels active and queued prompts without reviving a discarded world',async()=>{
    let asked=0,finish;
    const {runtime,arcade,util}=promptHost(()=>{asked++;return new Promise(resolve=>{finish=resolve;});});
    const first=arcade.askForString({QUESTION:'one'},util);
    const second=arcade.askForString({QUESTION:'two'},util);
    await new Promise(setImmediate);assert.equal(asked,1);
    runtime.emit(event);
    const stopped=arcade._state();
    assert.deepEqual(await Promise.all([first,second]),['','']);
    finish();await new Promise(setImmediate);
    assert.equal(asked,1);assert.equal(arcade._state(),stopped);
    assert.equal(arcade._textPromptWaits.size,0);
    assert.equal(runtime.bwArcadeTextPrompt,null);
});
