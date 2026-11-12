// SPDX-License-Identifier: BSD-3-Clause
// Summarize a saved E1 capture without importing the producer or replaying physics.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function summarize(d) {
 if(d?.schema!=='e1.capture.v1'||!Array.isArray(d.bodies)||!Array.isArray(d.contacts)||!d.contacts.length)throw Error('invalid or empty capture');
 const roles=['left_shaft_-1','right_shaft_-1'];
 const frame=d.bodies.find(b=>b.parts.includes('backing_left_0_0'));
 const rollers=roles.map(id=>d.bodies.find(b=>b.parts.includes(id)));
 if(!frame||rollers.some(b=>!b)||new Set([frame,...rollers].map(b=>b.id)).size!==3)throw Error('missing distinct RimRun bodies');
 const lanes=rollers.map(roller=>{
  const contacts=d.contacts.filter(x=>(x.a===frame.id&&x.b===roller.id)||(x.b===frame.id&&x.a===roller.id));
  if(!contacts.length)throw Error('missing roller-frame contact');
  for(const x of contacts)if(!Array.isArray(x.normal)||x.normal.length!==3||!x.normal.every(Number.isFinite)||!Number.isInteger(x.step))throw Error('invalid contact');
  return {roller:roller.id,frame:frame.id,rollerNativeId:roller.native,frameNativeId:frame.native,rollerMotion:roller.motion,frameMotion:frame.motion,edgeEnabled:roller.edge&&frame.edge,contacts:contacts.length,frameFirst:contacts.filter(x=>x.a===frame.id).length,firstStep:contacts[0].step,lastStep:contacts.at(-1).step,exampleNormal:contacts[0].normal};
 });
 return {schema:'e1.contact-summary.v1',finishedAt:d.finishedAt,issueCount:d.issues.length,lanes,boundary:'Listener callback order and body IDs are observed. Native narrow-phase argument order and seam causality require separate verification.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){if(!process.argv[2])throw Error('provide saved capture');console.log(JSON.stringify(summarize(JSON.parse(readFileSync(process.argv[2]))),null,2));}
