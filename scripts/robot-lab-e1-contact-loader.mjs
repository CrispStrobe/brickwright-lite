// SPDX-License-Identifier: BSD-3-Clause
// Diagnostic-only loader: run only with robot-lab-e1-contact-capture.mjs.
export async function load(url,context,nextLoad){
 const result=await nextLoad(url,context);
 if(!url.endsWith('/overlay/scratch-gui/src/lib/bw-sim/physics/jolt-core.js'))return result;
 let source=String(result.source);
 function replaceOnce(a,b){if(source.split(a).length!==2)throw Error('instrumentation anchor mismatch');source=source.replace(a,b);}
 replaceOnce('stepHz = 120, recordContacts = false','stepHz = 120, recordContacts = true');
 replaceOnce('const body = bodyInterface.CreateBody(bcs);','bcs.mEnhancedInternalEdgeRemoval = true;\n        const body = bodyInterface.CreateBody(bcs);');
 replaceOnce('bodyMap.set(b.id, { body, bodyID, motionType, layer, shape,','globalThis.__e1.bodies.push({id:b.id, native:bodyID.GetIndexAndSequenceNumber(), motion:b.motion, parts:b.parts, colliders:b.colliders.length, edge:body.GetEnhancedInternalEdgeRemoval()});\n        bodyMap.set(b.id, { body, bodyID, motionType, layer, shape,');
 replaceOnce('contactListener.OnContactAdded = (b1, b2) => note(b1, b2);\n        contactListener.OnContactPersisted = (b1, b2) => note(b1, b2);',`const capture = (p1,p2,pm) => { note(p1,p2); const a=J.wrapPointer(p1,J.Body), b=J.wrapPointer(p2,J.Body), m=J.wrapPointer(pm,J.ContactManifold), n=m.mWorldSpaceNormal; const id1=a.GetID().GetIndexAndSequenceNumber(), id2=b.GetID().GetIndexAndSequenceNumber(); if(globalThis.__e1.contacts.length>=100000)throw Error('contact cap'); globalThis.__e1.contacts.push({step:timeSteps,id1,id2,a:bodyIdOfIndex.get(id1),b:bodyIdOfIndex.get(id2),normal:[n.GetX(),n.GetY(),n.GetZ()]}); };\n        contactListener.OnContactAdded = capture;\n        contactListener.OnContactPersisted = capture;`);
 return {...result,source,shortCircuit:true};
}
