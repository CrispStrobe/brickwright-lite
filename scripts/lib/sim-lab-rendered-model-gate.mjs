// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';

// Decode the screenshot itself. Compressed PNG bytes and DOM port badges do
// not establish that WebGL drew the model. This gate is for the colored
// authored mechanics examples, whose visible parts cover far more pixels.
export const renderedModelPixels = (page,png,box) => page.evaluate(async ({encoded,box})=>{
 const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
 const scale=image.width/window.innerWidth,canvas=document.createElement('canvas');
 canvas.width=Math.round(box.width*scale);canvas.height=Math.round(box.height*scale);
 const context=canvas.getContext('2d',{willReadFrequently:true});
 context.drawImage(image,Math.round(box.x*scale),Math.round(box.y*scale),canvas.width,canvas.height,0,0,canvas.width,canvas.height);
 const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let colored=0,dark=0;
 for(let i=0;i<pixels.length;i+=4){const lo=Math.min(pixels[i],pixels[i+1],pixels[i+2]),hi=Math.max(pixels[i],pixels[i+1],pixels[i+2]);
  if(hi-lo>60&&hi>100&&lo<160)colored++;if(hi<80)dark++;}
 return {colored,dark,width:canvas.width,height:canvas.height};
},{encoded:png.toString('base64'),box});

export async function captureRenderedModel(page,path){
 const started=Date.now(),budgetMs=5000,attempts=[],stem=path.replace(/\.png$/,'');
 for(let attempt=1;;attempt++){
  const box=await page.getByTestId('bw-sim-lab-3d-canvas').boundingBox();assert.ok(box,'visible model canvas');
  const shot=await page.screenshot({timeout:budgetMs}),pixels=await renderedModelPixels(page,shot,box);
  const elapsedMs=Date.now()-started,visible=pixels.colored>=1000&&pixels.dark>=500;
  attempts.push({attempt,elapsedMs,...pixels,visible});
  writeFileSync(stem+'-paint.json',JSON.stringify({budgetMs,minimumColoredPixels:1000,minimumDarkPixels:500,attempts},null,2)+'\n');
  if(visible){writeFileSync(path,shot);return pixels;}
  writeFileSync(stem+'-blank-'+String(attempt).padStart(3,'0')+'.png',shot);
  assert.ok(elapsedMs<budgetMs,`model did not paint within ${budgetMs} ms: ${JSON.stringify(pixels)}`);
  // Observe the ordinary frame loop after layout; never force a render or pose.
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(done)));
 }
}
