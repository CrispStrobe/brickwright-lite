#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Actual source-bound custom-protocol app; no private SPIKE resource run.
import {existsSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,join,dirname} from 'node:path';
import {samdWebdriverRequest} from './lib/samd-webdriver-request.mjs';
import {spawnOwnedDriver} from './lib/owned-driver.mjs';
import {prepareSamdPacket,saveSamdResult,startSamdProcessMemory} from './verify-samd-native-game-browser.mjs';
import {runSamdNativeGame} from './samd-native-game-browser.mjs';
const need=(ok,why)=>{if(!ok)throw new Error(why);};
need(process.argv.length===7,'installed-binary native-receipt frontend fixture fresh-output required');
const [binary,receiptPath,frontend,fixture,out]=process.argv.slice(2).map(v=>resolve(v));
need(!existsSync(out),'fresh installed observation output');
const receipt=JSON.parse(readFileSync(receiptPath));
need(receipt.binarySha256===createHash('sha256').update(readFileSync(binary)).digest('hex'),'actual installed executable receipt');
const packet=await prepareSamdPacket({frontend,fixture});
const nativeDriver=['/usr/bin/WebKitWebDriver','/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebDriver','/usr/bin/webkitwebdriver'].find(existsSync);
need(nativeDriver,'installed WebKit WebDriver required');
const cargoBin=join(process.env.CARGO_HOME||join(process.env.HOME||'','.cargo'),'bin');
const driverBin=[join(cargoBin,'tauri-driver'),'/usr/local/bin/tauri-driver'].find(existsSync);
need(driverBin,'pinned Tauri driver required');
const {child:driver,stop}=spawnOwnedDriver(driverBin,['--port','4444','--native-driver',nativeDriver],{stdio:['ignore','pipe','pipe']});
const driverLogs=[];driver.stdout.on('data',b=>driverLogs.push(String(b)));driver.stderr.on('data',b=>driverLogs.push(String(b)));
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const call=(method,route,body,timeout=10000)=>samdWebdriverRequest(new URL('http://127.0.0.1:4444'+route),method,body,timeout);
let session,finishMemory;
try {
    let ready=false;let expired=false;
    const watchdog=setTimeout(()=>{expired=true;stop();},30000);
    try {
        while(!expired&&!ready) {
            try {await call('GET','/status',undefined,null);ready=true;}catch {if(!ready)await pause(500);}
            need(driver.exitCode===null,'owned Tauri driver exited during startup');
        }
    } finally {clearTimeout(watchdog);}
    need(ready,'Tauri driver startup deadline');
    const created=await call('POST','/session',{capabilities:{alwaysMatch:{'tauri:options':{application:binary}}}},60000);
    session=created?.sessionId;need(session,'actual installed application session required');
    await call('POST',`/session/${session}/timeouts`,{script:4800000});
    let editor;
    for(let attempt=0;attempt<240&&!editor;attempt++) {
        const handles=await call('GET',`/session/${session}/window/handles`);
        for(const handle of handles) {
            await call('POST',`/session/${session}/window`,{handle});
            const identity=await call('POST',`/session/${session}/execute/sync`,{script:'return {native:typeof window.__TAURI_INTERNALS__?.invoke === "function",vm:!!window.__brickwrightStore?.getState()?.scratchGui?.vm?.runtime,href:String(location.href)};',args:[]});
            if(identity.native&&identity.vm&&!identity.href.includes('capability-broker.html')) {editor=handle;break;}
        }
        if(!editor)await pause(500);
    }
    need(editor,'actual installed editor VM startup deadline');
    await call('POST',`/session/${session}/window`,{handle:editor});
    finishMemory=startSamdProcessMemory(driver.pid,'owned Tauri driver and its installed-app/WebKit descendants');
    const result=await call('POST',`/session/${session}/execute/async`,{
        script:`const done=arguments[arguments.length-1];(${runSamdNativeGame.toString()})(arguments[0]).then(value=>done({ok:true,value})).catch(error=>done({ok:false,error:String(error)}));`,args:[packet]
    },4900000);
    need(result?.ok,result?.error||'actual installed guest failed');
    result.value.binary_sha256=receipt.binarySha256;result.value.consumer=receipt.consumer;result.value.ci_checkout=receipt.ciCheckout;
    result.value.observer={commit:execFileSync('/usr/bin/git',['rev-parse','HEAD'],{cwd:dirname(fileURLToPath(import.meta.url)),encoding:'utf8'}).trim(),
        scriptSha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
        transportSha256:createHash('sha256').update(readFileSync(new URL('./lib/samd-webdriver-request.mjs',import.meta.url))).digest('hex')};
    result.value.process_memory=finishMemory();finishMemory=undefined;
    saveSamdResult(out,result.value,true);
    const screenshot=await call('GET',`/session/${session}/screenshot`,undefined,30000);
    writeFileSync(join(out,'actual-installed.png'),Buffer.from(screenshot,'base64'),{flag:'wx'});
    console.log(`SAMD_ACTUAL_INSTALLED_GAME_PASS source=${packet.engineSource} samples=3 binary_sha256=${receipt.binarySha256} physical_capture=false`);
} catch(error) {
    if(!existsSync(out))mkdirSync(out);
    writeFileSync(join(out,'failure.json'),JSON.stringify({actual_guest_qualified:false,error:String(error),stack:error.stack},null,2)+'\n',{flag:'wx'});
    if(session) {
        try {const png=await call('GET',`/session/${session}/screenshot`,undefined,30000);writeFileSync(join(out,'actual-installed-failure.png'),Buffer.from(png,'base64'),{flag:'wx'});}catch {}
    }
    throw error;
} finally {
    if(finishMemory)try{finishMemory();}catch {}
    if(!existsSync(out))mkdirSync(out);
    writeFileSync(join(out,'driver.log'),driverLogs.join(''),{flag:'wx'});
    if(session)await call('DELETE',`/session/${session}`,undefined,10000).catch(()=>{});
    stop();
}
