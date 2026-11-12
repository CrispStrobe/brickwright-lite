import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {createProjectJsonSnapshot} from '../overlay/scratch-gui/src/lib/bw-makecode/project-json-snapshot.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';

const head = effects => 'let counter=9;let result=-99;let count=-99;let snake:number[];'+
    `function nextLevel(){${effects}let fresh:number[]=[];fresh.push(1);fresh.push(2);snake=fresh;}`+
    'function grow(){counter=counter+1;if(counter>=5){nextLevel();}}';
const tail='game.onPaint(function(){result=snake.indexOf(2);count=snake.length;if(result<0){counter=9;grow();}});';
const program=(effects='',before='')=>head(effects)+before+'grow();while(snake.indexOf(7)<0){snake.push(7);}'+tail;
const create=source=>{
    const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
    const creator=new Creator();creator.parse(imported.code);
    for(const name of ['errors','warnings','unparsed'])assert.deepEqual(creator[name],[],name);
    return creator.project;
};
const decision=original=>{
    const project=createProjectJsonSnapshot(JSON.stringify(original)),authority=createArrayReferenceExportAuthority(project),rows=[];
    for(const target of project.targets)for(const node of Object.values(target.blocks))
        if(['arrays_referenceIndexOf','arrays_referenceLength'].includes(node.opcode))rows.push({target,node});
    assert.ok(rows.length,'actual Array receiver uses are present');
    return rows.map(({target,node})=>authority.validateInput(target,node));
};
const admitted=source=>assert.ok(decision(create(source)).every(result=>result.ok), 'every receiver use is admitted');
const refused=source=>assert.ok(decision(create(source)).some(result=>!result.ok), 'an actual receiver use is refused');

test('closed splash, wait and both sound modes admit publication',()=>{
    const sound='music.sounds(Sounds.PowerUp)';
    admitted(program(`game.splash("Level " + counter);pause(100);music.playSound(${sound});music.playSoundUntilDone(${sound});`));
});

test('an effect argument that reads the unpublished receiver is refused',()=>{
    const project=create(program('game.splash("safe");'));
    const target=project.targets.find(t=>Object.values(t.blocks).some(n=>n.opcode==='arcade_splash'));
    const splash=Object.values(target.blocks).find(n=>n.opcode==='arcade_splash');
    const owner=project.targets.find(t=>Object.values(t.variables||{}).some(v=>v[0]==='snake'));
    const id=Object.keys(owner.variables).find(key=>owner.variables[key][0]==='snake');
    splash.inputs.TITLE=[3,[12,'snake',id],[10,'']];
    assert.ok(decision(project).some(result=>!result.ok),'direct receiver input is refused');
    refused(program('pause(snake.length);'));
});

test('registration, game over and another event entry before publication are refused',()=>{
    refused(program('', 'game.onPaint(function(){count=snake.length;});'));
    refused(program('game.over(false);'));
    refused(program('', 'controller.A.onEvent(ControllerButtonEvent.Pressed,function(){result=snake.indexOf(1);});'));
});

test('actual VM greenFlag clears life and countdown before restarting the source',async()=>{
    const {runProgram,stepFrames,clearStrayTimers}=await import('./helpers/bw-vm.mjs');
    const imported=arcadeToPseudocode('info.setLife(7);info.startCountdown(30);');
    assert.deepEqual(imported.unsupported,[]);
    const run=await runProgram(imported.code,{frames:10,storage:true});
    try{
        assert.deepEqual(run.errors,[]);
        const before=run.vm.runtime.bwArcadeDeviceState;
        assert.equal(before.players[0].life,7);
        assert.equal(before.countdownActive,true);
        run.vm.stopAll();run.vm.greenFlag();
        const reset=run.vm.runtime.bwArcadeDeviceState;
        assert.notEqual(reset,before);
        assert.equal(reset.players?.[0]?.life,undefined);
        assert.notEqual(reset.countdownActive,true);
        await stepFrames(run.vm,10);
        const restarted=run.vm.runtime.bwArcadeDeviceState;
        assert.equal(restarted.players[0].life,7);
        assert.equal(restarted.countdownActive,true);
        assert.deepEqual(run.errors,[]);
    }finally{run.vm.quit();clearStrayTimers();}
});
