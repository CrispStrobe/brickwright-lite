#!/usr/bin/env node
// Author through the visible Code editor, then run actual Blocks/controller input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {ARCADE_PALETTE} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {arcadeToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js';
import {compactConversionObservationGraph} from './lib/conversion-audit-core.mjs';
// Let the game run N Arcade frames (about 33 ms each): a wait on the VM's own
// clock, not a wall-clock sleep, so a slow runner cannot cut it short.
const settleFrames=(page,n)=>page.evaluate(n=>new Promise((done,fail)=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const stop=setTimeout(()=>{rt.removeListener('ARCADE_FRAME',f);fail(new Error('no Arcade frames'));},10000);const f=()=>{if(++c>=n){clearTimeout(stop);rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);

const source=`let red=image.create(4,4)
red.fill(2)
let blue=image.create(4,4)
blue.fill(7)
let hero=sprites.create(red,SpriteKind.Player)
let frames=[red,blue]
controller.A.onEvent(ControllerButtonEvent.Pressed,function(){animation.runImageAnimation(hero,frames,100,true)})
controller.B.onEvent(ControllerButtonEvent.Pressed,function(){animation.stopAnimation(animation.AnimationTypes.ImageAnimation,hero)})
controller.right.onEvent(ControllerButtonEvent.Pressed,function(){hero.x+=10})`;
const imported=arcadeToPseudocode(source);assert.deepEqual(imported.unsupported,[]);
const build=path.resolve(import.meta.dirname,'../packages/scratch-gui/build');
const server=createServer(async(req,res)=>{
    try{
        const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
        const name=path.resolve(build,'.'+(url.endsWith('/')?url+'index.html':url));assert.ok(name.startsWith(build+path.sep));
        const bytes=await fs.promises.readFile(name);
        res.writeHead(200,{'content-type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'})[path.extname(name)]||'application/octet-stream'});res.end(bytes);
    }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));let browser,page;const errors=[];
const diagnosticBase=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-animation-browser-current.json';
const saveDiagnostic=async(label,failure=null)=>{
    let actual,observerError;
    try{actual=page?await page.evaluate(()=>{
        const capture=window.__bwAnimationDiagnostic;
        return {current:window.__bwAnimationRead?.(),events:capture?.events,frames:capture?.frames,observerErrors:capture?.observerErrors,
            currentCode:document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.textContent,
            boundary:'Actual values/errors/named clock/frame/input fields only; callable implementations and other private fields unobserved. No product method or primitive replacement.'};
    }):{pageAvailable:false};}catch(error){observerError=error;}
    fs.writeFileSync(diagnosticBase+'.'+label+'.diagnostic.json',JSON.stringify(compactConversionObservationGraph({label,source,imported,actual,observerError,errors,failure}))+'\n',{flag:'wx'});
};
try{
    browser=await chromium.launch();page=await browser.newPage({viewport:{width:1600,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('bw-starter-v1-complete','1');localStorage.setItem('bw-right-pane-hidden','0');});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>!!window.__brickwrightStore?.getState()?.scratchGui?.vm,null,{timeout:60000});
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    const editor=page.locator('[data-testid="bw-code-editor"] .cm-content');
    await editor.waitFor({state:'visible',timeout:30000});await editor.fill(imported.code);
    await page.getByRole('button',{name:'⇦ To blocks',exact:true}).click();
    await page.waitForFunction(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        return vm.runtime.targets.some(t=>Object.values(t.blocks._blocks).some(b=>b.opcode==='arcade_runImageAnimation'));
    },null,{timeout:30000});
    await page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        vm.runtime.on('BLOCKS_ERROR',m=>{window.__bwAnimationErrors??=[];window.__bwAnimationErrors.push(String(m));});
        // Passive diagnostic observers: never wrap current primitives, source
        // methods, keyboard IO or startHats (their identities carry authority).
        const rt=vm.runtime,log=window.__bwAnimationDiagnostic={events:[],frames:[],observerErrors:[]};
        const descriptor=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf,own=Object.hasOwn,keys=Reflect.ownKeys,apply=Reflect.apply;
        const objectPrototype=Object.prototype,arrayPrototype=Array.prototype,bytePrototype=Uint8Array.prototype;
        const weakGet=WeakMap.prototype.get,weakSet=WeakMap.prototype.set,ids=new WeakMap();let nextID=0;
        const entries=Map.prototype.entries,nextEntry=prototype(apply(entries,new Map(),[])).next;
        const object=value=>value!==null&&typeof value==='object';
        const tag=value=>{
            if(typeof value==='function')return {type:'function',identity:'UNOBSERVED',implementation:'UNOBSERVED'};
            if(object(value)){let id=apply(weakGet,ids,[value]);if(id===undefined){id=nextID++;apply(weakSet,ids,[value,id]);}return {type:'object',valueRef:id,prototypeIdentity:'UNOBSERVED',implementation:'UNOBSERVED'};}
            if(typeof value==='symbol')return {type:'symbol',identity:'UNOBSERVED',value:'UNOBSERVED'};
            return {type:typeof value,value};
        };
        const plain=value=>object(value)&&(prototype(value)===objectPrototype||prototype(value)===null);
        const raw=(value,key)=>{if(!object(value))return undefined;const row=descriptor(value,key);return row&&own(row,'value')?row.value:undefined;};
        const field=(value,key)=>{
            if(!object(value))return {key,status:'nonobject',owner:tag(value)};
            const row=descriptor(value,key);if(!row)return {key,status:'absent'};
            return own(row,'value')?{key,status:'own-data',enumerable:row.enumerable,configurable:row.configurable,writable:row.writable,observation:tag(row.value)}:
                {key,status:'accessor-UNOBSERVED',getType:typeof row.get,setType:typeof row.set,implementation:'UNOBSERVED'};
        };
        const fields=(value,names)=>({owner:tag(value),fields:names.map(key=>field(value,key)),prototypeIdentity:'UNOBSERVED'});
        const ownFields=value=>plain(value)?{...fields(value,keys(value).filter(key=>typeof key==='string')),symbolKeyCount:keys(value).filter(key=>typeof key==='symbol').length,symbolIdentities:'UNOBSERVED'}:{owner:tag(value),status:'nonplain-implementation-UNOBSERVED'};
        const reference=value=>({outer:ownFields(value),inner:ownFields(raw(value,'bwReference'))});
        const bytes=value=>{
            if(!object(value)||prototype(value)!==bytePrototype)return {owner:tag(value),status:'native-Uint8-profile-not-observed',contents:'UNOBSERVED'};
            return {owner:tag(value),profile:'native-Uint8-prototype/own-data-descriptors',fields:keys(value).filter(key=>typeof key==='string').map(key=>field(value,key)),pixel0:field(value,'0')};
        };
        const image=value=>plain(value)?{owner:tag(value),shape:fields(value,['width','height','pixels']),pixels:bytes(raw(value,'pixels'))}:{owner:tag(value),status:'nonplain-image-UNOBSERVED'};
        const array=value=>object(value)&&prototype(value)===arrayPrototype?{owner:tag(value),fields:keys(value).filter(key=>typeof key==='string').map(key=>field(value,key)),references:keys(value).filter(key=>typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)).map(key=>({key,...reference(raw(value,key))}))}:{owner:tag(value),status:'native-Array-profile-not-observed'};
        const map=(value,observe)=>{
            if(!object(value))return {owner:tag(value),status:'map-UNOBSERVED'};
            let iterator;try{iterator=apply(entries,value,[]);}catch{return {owner:tag(value),status:'native-map-slot-not-observed'};}
            const rows=[];while(true){const row=apply(nextEntry,iterator,[]);if(row.done)break;rows.push({key:tag(row.value[0]),value:observe(row.value[1]),keyFields:fields(row.value[0],['id'])});}
            return {owner:tag(value),entries:rows};
        };
        const variables=()=>{
            const targets=raw(rt,'targets'),rows=[],values=Object.create(null);
            if(!object(targets)||prototype(targets)!==arrayPrototype)return {targets:tag(targets),rows,values};
            for(const key of keys(targets)){
                if(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key))continue;
                const target=raw(targets,key),table=raw(target,'variables'),row={target:fields(target,['id','name']),variables:[]};
                if(plain(table))for(const id of keys(table)){
                    if(typeof id!=='string')continue;
                    const variable=raw(table,id),name=raw(variable,'name'),value=raw(variable,'value');
                    row.variables.push({id,fields:fields(variable,['id','name','type','value','isCloud']),reference:reference(value)});
                    if(typeof name==='string')values[name.replace(/^Game_/,'')]=value;
                }
                rows.push(row);
            }
            return {rows,values};
        };
        const read=()=>{
            const vars=variables(),state=raw(rt,'bwArcadeDeviceState'),sprites=plain(state)?raw(state,'sprites'):undefined;
            const heroName=vars.values.hero,hero=plain(sprites)&&typeof heroName==='string'?raw(sprites,heroName):undefined;
            const heroImage=plain(hero)?raw(hero,'image'):undefined,phase=raw(rt,'_arcadeFramePhase'),ext=raw(phase,'ext'),epoch=raw(ext,'_programClockEpoch');
            const witness=raw(phase,'sourceProjectWitness');
            return {at:performance.now(),variables:vars.rows,heroVariable:tag(heroName),hero:plain(hero)?fields(hero,['id','x','y','image']):{owner:tag(hero),status:'nonplain-hero-UNOBSERVED'},
                heroImage:image(heroImage),rawPixel0:plain(heroImage)?bytes(raw(heroImage,'pixels')).pixel0:undefined,
                framesVariable:reference(vars.values.frames),images:map(raw(ext,'_images'),image),
                animations:map(raw(ext,'_imageAnimations'),value=>({fields:fields(value,['frames','elapsed','lastFrame','interval','loop']),frames:array(raw(value,'frames'))})),
                buttons:ownFields(raw(state,'buttons')),controllerButtons:ownFields(raw(state,'controllerButtons')),
                buttonStates:ownFields(raw(ext,'_buttonStates')),controllerInputs:ownFields(raw(ext,'_controllerInputs')),
                registeredButtonHandlers:{fields:fields(ext,['_buttonHandlers']),implementation:'UNOBSERVED'},
                authority:{fields:fields(rt,['bwArcadeFrameAuthority','bwDeviceId','stc','bwArcadeProgramClock']),stc:{owner:tag(raw(rt,'stc')),selected:fields(raw(rt,'stc'),['device']),implementation:'UNOBSERVED'},
                    phase:fields(phase,['active','disposed','generation','sourceProjectWitness']),witness:fields(witness,['id']),programClock:fields(epoch,['active','timerAuthority','start','last'])},
                activeElement:document.activeElement?{tag:document.activeElement.tagName,testid:document.activeElement.getAttribute('data-testid')}:null,
                player:document.querySelector('[data-testid="bw-arcade-player"]')?.value,
                controllerDOM:Array.from(document.querySelectorAll('[data-testid="bw-arcade-a"]')).map(button=>({tag:button.tagName,disabled:button.disabled,connected:button.isConnected})),
                runtimeErrors:(window.__bwAnimationErrors||[]).slice(),boundary:'Descriptor-only named data observations; no Scratch primitive, image method, getter, coercion or clock method invoked. Prototype/Function identities and private/STC/callback implementations UNOBSERVED. Plain/native profiles are observer shape conditions, not Proxy proof or value authority.'};
        };
        window.__bwAnimationRead=read;
        const errorFields=value=>({value:tag(value),fields:fields(value,['name','message','stack','cause'])});
        const record=(event,args)=>{try{log.events.push({event,at:performance.now(),args:args.map(value=>({value:tag(value),fields:plain(value)?ownFields(value):fields(value,['name','message','stack','cause'])})),state:read()});}catch(error){log.observerErrors.push({event,error:errorFields(error)});}};
        for(const event of ['ARCADE_CONTROLLER_INPUT','KEY_STATE_CHANGED','ARCADE_PLAYER_BUTTON_EDGE','ARCADE_BUTTON_DOWN','BLOCKS_ERROR'])rt.on(event,(...args)=>record(event,args));
        rt.on('ARCADE_FRAME',(...args)=>{try{log.events.push({event:'ARCADE_FRAME',at:performance.now(),args:args.map(tag)});}catch(error){log.observerErrors.push({event:'ARCADE_FRAME',error:errorFields(error)});}});
        rt.on('ARCADE_FRAME_END',()=>{try{log.frames.push(read());}catch(error){log.observerErrors.push({event:'ARCADE_FRAME_END',error:errorFields(error)});}});
        for(const event of ['pointerdown','pointerup','pointercancel','lostpointercapture','click'])document.addEventListener(event,input=>{
            const button=input.target?.closest?.('[data-testid]');if(!button?.getAttribute('data-testid')?.startsWith('bw-arcade-'))return;
            record('DOM:'+event,[{testid:button.getAttribute('data-testid'),trusted:input.isTrusted,button:input.button,pointerId:input.pointerId,detail:input.detail}]);
        },true);
        vm.runtime.bwDeviceId='arcade';vm.start();
        localStorage.setItem('bw-debug-dock','arcade');window.dispatchEvent(new CustomEvent('bw-settings-change',{detail:{key:'bw-debug-dock',value:'arcade'}}));
    });
    // Use the app's visible green flag, not an injected program or test scheduler.
    await page.locator('[class*="green-flag_green-flag"]').first().click();
    await page.getByTestId('bw-arcade-a').waitFor({state:'visible',timeout:30000});
    const state=()=>page.evaluate(()=>{
        const vm=window.__brickwrightStore.getState().scratchGui.vm;
        const v=Object.fromEntries(vm.runtime.targets.flatMap(t=>Object.values(t.variables)).map(v=>[v.name.replace(/^Game_/,''),v.value]));
        const p=vm.runtime._primitives,hero=vm.runtime.bwArcadeDeviceState?.sprites[v.hero];
        return hero?{x:hero.x,pixel:p.arcade_imagePixel({IMAGE:p.arcade_spriteImage({ID:v.hero}),X:0,Y:0}),errors:window.__bwAnimationErrors||[]}:null;
    });
    await page.waitForFunction(()=>Object.keys(window.__brickwrightStore.getState().scratchGui.vm.runtime.bwArcadeDeviceState?.sprites||{}).length>0,null,{timeout:30000});
    // A click's hat runs on the next VM step and the Arcade frame draws on the
    // one after: wait for both before reading what the click changed.
    const settle=(n=3)=>page.evaluate(n=>new Promise(done=>{const rt=window.__brickwrightStore.getState().scratchGui.vm.runtime;let c=0;const f=()=>{if(++c>=n){rt.removeListener('ARCADE_FRAME',f);requestAnimationFrame(()=>done());}};rt.on('ARCADE_FRAME',f);}),n);
    const initial=await state();assert.equal(initial.pixel,2);
    await page.getByTestId('bw-arcade-a').click();
    const seen=new Set();for(let i=0;i<20;i++){const s=await state();seen.add(s.pixel);await settleFrames(page,2);}
    await saveDiagnostic('before-both-frame-assertion');
    assert.ok(seen.has(2)&&seen.has(7),'controller A advances both actual frame images: '+JSON.stringify([...seen]));
    await page.getByTestId('bw-arcade-b').click();await settle();const stopped=await state();
    await settleFrames(page,11);assert.equal((await state()).pixel,stopped.pixel,'controller B stops image playback');
    await page.getByTestId('bw-arcade-right').click();await settle();assert.equal((await state()).x,initial.x+10);
    const rendered=await page.evaluate(palette=>{
        const renderer=window.__brickwrightStore.getState().scratchGui.vm.runtime.renderer;renderer.draw();
        const canvas=renderer.canvas,copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
        const ctx=copy.getContext('2d');ctx.drawImage(canvas,0,0);const pixels=ctx.getImageData(0,0,copy.width,copy.height).data;
        const count=index=>{const rgb=palette[index].match(/[0-9a-f]{2}/gi).map(v=>parseInt(v,16));let n=0;for(let i=0;i<pixels.length;i+=4)if(rgb.every((v,j)=>pixels[i+j]===v))n++;return n;};
        return {redPixels:count(2),bluePixels:count(7),controllerViewport:!!document.querySelector('[data-testid="bw-arcade-device"] canvas')};
    },ARCADE_PALETTE);
    assert.equal(rendered.redPixels+rendered.bluePixels,144,'actual renderer paints the 4×4 frame at Arcade scale');assert.equal(rendered.controllerViewport,true);
    await page.getByRole('tab',{name:'Code',exact:true}).click();
    await page.getByRole('button',{name:'From blocks ⇨',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[data-testid="bw-code-editor"] .cm-content')?.textContent.includes('arcade animate sprite'),null,{timeout:30000});
    assert.match(await editor.innerText(),/arcade stop animations/);
    assert.deepEqual((await state()).errors,[]);assert.deepEqual(errors,[]);
    const report={generatedAt:new Date().toISOString(),authoring:'visible Code editor → To blocks → green flag → controller pane → From blocks',initial,frameColors:[...seen].sort(),stoppedPixel:stopped.pixel,rendered,final:await state(),errors};
    const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'test-results/arcade-animation-browser-current.json';fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){
    try{await saveDiagnostic('failure',error);}catch(observerError){console.error('ANIMATION_DIAGNOSTIC_SAVE_FAILED',observerError);}
    throw error;
}finally{await browser?.close();await new Promise(done=>server.close(done));}
