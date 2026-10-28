// Execute synchronous language fixtures using the pinned PXT compiler and
// simulator shims. This harness intentionally rejects asynchronous shims;
// it is not an Arcade frame scheduler or a substitute for browser game tests.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {compile,STATIC} from '../../scripts/lib/pxt-node.mjs';

export async function runPxtCore(source, {images=false} = {}) {
    const files={'main.ts':source};
    if(images){
        // Use the shipped native Image ABI, without starting the screen's
        // background frame loop in this synchronous language harness.
        const bundle=JSON.parse(fs.readFileSync(path.join(STATIC,'arcade/target.json'),'utf8'));
        files['original-screen-shims.d.ts']=bundle.bundledpkgs.screen['shims.d.ts'];
    }
    files['pxt.json']=JSON.stringify({name:'bw-language-oracle',dependencies:{core:'*'},files:Object.keys(files)});
    const built=await compile('arcade',files);
    if(!built.success)throw new Error(JSON.stringify(built.diagnostics));
    const context={console,setTimeout,clearTimeout,setInterval,clearInterval,TextEncoder,TextDecoder,
        performance,window:{addEventListener(){}},document:{},navigator:{}};
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(STATIC,'arcade/sim/pxtsim.js'),'utf8'),context,{timeout:2000});
    const globals={},runtime={setupPerfCounters(){},registerLiveObject(){return ++this.nextId;},nextId:0};
    context.pxsim.runtime=runtime;
    if(images){
        vm.runInContext(fs.readFileSync(path.join(STATIC,'arcade/sim/common-sim.js'),'utf8'),context,{timeout:2000});
        // The Arcade target uses a 4-bit screen; image.create consults only bpp.
        runtime.board={screenState:{bpp:()=>4}};
    }
    const unexpected=()=>{throw new Error('Unexpected asynchronous or debugging PXT operation in synchronous fixture');};
    let done=false;
    context.ectx={runtime,globals,pxsim:context.pxsim,setupYield:reset=>reset(),setupDebugger:()=>[],
        maybeYield:()=>false,checkStack:depth=>{if(depth>1000)throw new Error('PXT fixture stack limit');},
        leave:(frame,result)=>{if(frame.parent){frame.parent.retval=result;return frame.parent;}done=true;return null;},
        oops:unexpected,doNothing(){},isBreakFrame:()=>false,breakpoint:unexpected,trace:unexpected,
        checkResumeConsumed:unexpected,setupResume:unexpected,setupLambda:unexpected,
        checkSubtype:unexpected,failedCast:unexpected,buildResume:unexpected,mkVTable:unexpected,
        bind:unexpected,leaveAccessor:unexpected};
    context.main=vm.runInContext(built.outfiles['binary.js'],context,{timeout:2000})(context.ectx);
    context.finished=()=>done;
    vm.runInContext(`let frame={fn:main,pc:0,depth:0};
        while(!finished()){const next=frame.fn(frame);if(next)frame=next;else if(!finished())throw new Error('PXT fixture suspended');}`,
    context,{timeout:2000});
    return Object.fromEntries(Object.entries(globals).map(([key,value])=>[key.replace(/___\d+$/,''),value]));
}
