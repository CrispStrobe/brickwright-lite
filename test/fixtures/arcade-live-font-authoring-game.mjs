// Owned live font metric GUI acceptance fixture.
import {liveFontMetricsCase} from './arcade-live-font-metrics-case.mjs';
export function fontAuthoringFiles(variant='baseline'){
 if(!['baseline','blocks','code'].includes(variant))throw new Error('Unknown font authoring variant');
 const property=variant==='blocks'?'charWidth':'charHeight',font=variant==='baseline'?'font5':'font8';
 const source=liveFontMetricsCase.source.replace('let h5=image.font5.charHeight',`let h5=image.${font}.${property}`)+'scene.setBackgroundImage(surface);';
 return {'main.ts':source,'pxt.json':JSON.stringify({name:'Owned live font authoring',dependencies:{device:'*'},files:['main.ts'],preferredEditor:'tsprj'})};
}
export function fontAuthoringSample(variant){if(!['baseline','blocks','code'].includes(variant))throw new Error('Unknown font authoring variant');return {...liveFontMetricsCase.expected,h5:variant==='blocks'?6:variant==='code'?8:5};}

export function fontOriginalSample(files,variant){
 const source=files['main.ts'];return Object.fromEntries(Object.entries(fontAuthoringSample(variant)).map(([name,value])=>{
  const matches=[...source.matchAll(new RegExp('\\b(?:let|var|const)\\s+((?:Game_)*'+name+')\\b','g'))];
  if(matches.length!==1)throw new Error('Original font observable declaration missing or ambiguous: '+name);
  return [matches[0][1],value];
 }));
}
