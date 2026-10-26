// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {captureUiScreenshot,captureRenderedModel} from './sim-lab-rendered-model-gate.mjs';

export async function screenshotFontControls(browser,out){
 mkdirSync(out,{recursive:true});
 const fontFile=['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',resolve(process.env.WINDIR||'C:/Windows','Fonts/arial.ttf')].find(existsSync);
 assert.ok(fontFile,'The browser test host needs a system TrueType font');
 const fontBytes=readFileSync(fontFile);
let pendingResponse,releaseSeen;const fontSeen=new Promise(r=>releaseSeen=r);
const server=createServer((req,res)=>{
 if(req.url==='/font.ttf'){pendingResponse=res;releaseSeen();return;}
 res.setHeader('content-type','text/html');
 res.end(req.url==='/child'?'<style>@font-face{font-family:Pending;src:url(/font.ttf)}body{font:20px Pending,Arial}</style><p>Actual pending custom font</p>':'<style>body{font:16px Arial;margin:0}canvas{display:block}</style><canvas width="700" height="400" data-testid="bw-sim-lab-3d-canvas"></canvas><p>Font readiness fixture only</p>');
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port,results=[];
const open=async()=>{const p=await browser.newPage({viewport:{width:900,height:700},serviceWorkers:'block'});await p.goto(url,{waitUntil:'load'});return p;};
let page;try{
 page=await open();await page.evaluate(brokenPromise=>{
  const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,700,400);g.fillStyle='#00aaff';g.fillRect(40,40,600,300);
  // Controlled fixture reproduces only the observed platform promise state.
  // This mutation is never applied to the application or model qualification.
  window.__fixtureFonts=document.fonts;if(brokenPromise)Object.defineProperty(window.__fixtureFonts,'ready',{configurable:true,get:()=>new Promise(()=>{})});
 },browser.browserType().name()==='webkit');
 const pixels=await captureRenderedModel(page,out+'/empty-font-set-fixture.png');assert.ok(pixels.colored>=1000&&pixels.dark>=500);assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,undefined);
 assert.equal(JSON.parse(readFileSync(out+'/empty-font-set-fixture-fonts.json')).mode,browser.browserType().name()==='webkit'?'verified-empty-font-set':'native-font-ready');results.push({test:'pending ready promise with genuinely empty loaded font set captures actual fixture pixels',status:'PASS',pixels});
 await page.evaluate(()=>{document.querySelector('canvas').getContext('2d').clearRect(0,0,700,400);});
 await assert.rejects(()=>captureRenderedModel(page,out+'/blank-must-fail.png'),/model did not paint/);assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,undefined);results.push({test:'the same font-state path still rejects a blank canvas',status:'PASS'});
 await assert.rejects(()=>captureUiScreenshot(page,{timeout:1000},{screenshot:async()=>{assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,browser.browserType().name()==='webkit'?'1':undefined);throw Error('deliberate capture failure');}},out+'/failure-must-restore.png'),/deliberate capture failure/);assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,undefined);results.push({test:'capture failure restores the screenshot environment',status:'PASS'});
 // Root has the controlled empty-set promise state; its child really requests a
 // custom font. Capture must wait for that child even when root is available.
 await page.evaluate(url=>{const f=document.createElement('iframe');f.src=url+'/child';document.body.append(f);},url);await Promise.race([fontSeen,new Promise((_,reject)=>setTimeout(()=>reject(Error('The pending-font fixture did not request its font')),15000))]);
 let completed=false;const shot=captureUiScreenshot(page,{path:out+'/real-pending-child-font.png',timeout:5000}).then(()=>{completed=true;});
 await new Promise(r=>setTimeout(r,1400));assert.equal(completed,false,'a real child font load cannot be ignored');assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,undefined);
 pendingResponse.writeHead(200,{'content-type':'font/ttf'});pendingResponse.end(fontBytes);await shot;
 const fontEvidence=JSON.parse(readFileSync(out+'/real-pending-child-font-fonts.json'));assert.ok(fontEvidence.before.some(s=>s.faces.some(f=>f.status==='loading')));assert.equal(process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY,undefined);results.push({test:'real pending fonts in every frame block capture until their load settles',status:'PASS'});
 process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';await assert.rejects(()=>captureUiScreenshot(page,{timeout:1000}),/External font-readiness bypass/);delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;results.push({test:'an externally supplied bypass cannot qualify a screenshot',status:'PASS'});
 writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',scope:'Screenshot readiness/blank-image regression fixtures only, not a model or physics qualification',results},null,2));console.log('PASS screenshot font availability, pending-font and blank-canvas controls');return results;
}finally{delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;await page?.close();pendingResponse?.destroy();server.close();}

}
