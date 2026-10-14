// Selected SDK constructor services. Canonical handles are shared with every
// native Sprite factory; this counter guarantees no reuse within this JS realm.
// Fresh-realm saved strings do not carry a runtime lifetime and are not admitted
// as restored live Sprite/class snapshots. Public Sprite.id remains scene-local.
let nextCanonicalSprite = 0;
const specs = [
  {
    "name": "__bwSDK_BaseSprite",
    "intrinsic": "BaseSprite",
    "parent": null,
    "fields": [
      {
        "name": "z",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "id",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      }
    ],
    "parameters": [
      {
        "name": "z",
        "type": "number",
        "optional": false
      }
    ],
    "initializer": "__bwClass___bwSDK_BaseSprite_fields %s",
    "constructor": "__bwClass___bwSDK_BaseSprite_constructor %s %s",
    "methods": []
  },
  {
    "name": "Sprite",
    "intrinsic": "Sprite",
    "parent": "__bwSDK_BaseSprite",
    "fields": [
      {
        "name": "x",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "y",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "vx",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "vy",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "ax",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "ay",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "fx",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "fy",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "width",
        "type": "number",
        "readonly": true,
        "visibility": "public",
        "native": true
      },
      {
        "name": "height",
        "type": "number",
        "readonly": true,
        "visibility": "public",
        "native": true
      },
      {
        "name": "left",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "right",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "top",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "bottom",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "flags",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "lifespan",
        "type": "number",
        "readonly": false,
        "visibility": "public",
        "native": true
      },
      {
        "name": "image",
        "type": "Image",
        "readonly": true,
        "visibility": "public",
        "native": true
      }
    ],
    "parameters": [
      {
        "name": "img",
        "type": "Image",
        "optional": false
      }
    ],
    "initializer": "__bwClass_Sprite_fields %s",
    "constructor": "__bwClass_Sprite_constructor %s %s",
    "methods": [
      {
        "name": "setImage",
        "procedure": "__bwClass_Sprite_setImage %s %s",
        "parameters": [
          {
            "name": "img",
            "type": "Image",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "setFlag",
        "procedure": "__bwClass_Sprite_setFlag %s %s %s",
        "parameters": [
          {"name": "flag", "type": "number", "optional": false},
          {"name": "on", "type": "boolean", "optional": false}
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "setKind",
        "procedure": "__bwClass_Sprite_setKind %s %s",
        "parameters": [
          {
            "name": "value",
            "type": "number",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "kind",
        "procedure": "__bwClass_Sprite_kind %s",
        "parameters": [],
        "returnType": "number",
        "visibility": "public"
      },
      {
        "name": "setPosition",
        "procedure": "__bwClass_Sprite_setPosition %s %s %s",
        "parameters": [
          {
            "name": "x",
            "type": "number",
            "optional": false
          },
          {
            "name": "y",
            "type": "number",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "setVelocity",
        "procedure": "__bwClass_Sprite_setVelocity %s %s %s",
        "parameters": [
          {
            "name": "vx",
            "type": "number",
            "optional": false
          },
          {
            "name": "vy",
            "type": "number",
            "optional": false
          }
        ],
        "returnType": "void",
        "visibility": "public"
      },
      {
        "name": "destroy",
        "procedure": "__bwClass_Sprite_destroy %s",
        "parameters": [],
        "returnType": "void",
        "visibility": "public"
      }
    ]
  },
  {
    "name": "__bwSDK_ExtendableSprite",
    "intrinsic": "ExtendableSprite",
    "parent": "Sprite",
    "fields": [
      {
        "name": "hasCustomDimensions",
        "type": "boolean",
        "readonly": false,
        "visibility": "protected",
        "native": true
      }
    ],
    "parameters": [
      {
        "name": "spriteImage",
        "type": "Image",
        "optional": false
      },
      {
        "name": "kind",
        "type": "number",
        "optional": true
      }
    ],
    "initializer": "__bwClass___bwSDK_ExtendableSprite_fields %s",
    "constructor": "__bwClass___bwSDK_ExtendableSprite_constructor %s %s %s",
    "methods": []
  }
];
const definitions=new Map(specs.map(spec=>[spec.name,Object.freeze({...spec,fields:new Map(spec.fields.map(field=>[field.name,field])),methods:new Map(spec.methods.map(method=>[method.name,method]))})]));
const operations=new Map();
for(const spec of specs){operations.set(spec.initializer,{spec,operation:'fields'});operations.set(spec.constructor,{spec,operation:'constructor'});operations.set(`__bwClass_${spec.name}_superConstructor ${['self',...spec.parameters].map(()=>'%s').join(' ')}`,{spec,operation:'constructor'});for(const method of spec.methods)operations.set(method.procedure,{spec,operation:method.name});}
function create(ext,values){
 const sprite=ref=>{const found=ext._spriteValues.get(String(ref));if(!found)throw new Error('Unknown or stale native Sprite reference');return found;};
 const invoke=(name,args,util,token)=>{
  util={thread:util?.thread,target:util?.target || util?.thread?.target,sequencer:util?.sequencer};
  const found=operations.get(name);if(!found)throw new Error('Unknown SDK Sprite procedure');
  const ref=args[0],s=sprite(ref),op=found.operation;
  const active=()=>{if(util?.thread&&(util.thread.isKilled||!ext._runtime.threads.includes(util.thread)) || !ext._objectHeap.constructionActive(ref,token)){const error=new Error('SDK Sprite construction was cancelled');error.bwObjectCancelled=true;throw error;}};
  if(util?.thread&&(util.thread.isKilled||!ext._runtime.threads.includes(util.thread)))throw new Error('SDK Sprite activation was cancelled');
  if(op==='fields')return;
  if(op==='constructor'){
   active();
   if(found.spec.intrinsic==='BaseSprite'){s.z=Number(args[1]);ext._registerSdkSprite(ref);return;}
   if(found.spec.intrinsic==='ExtendableSprite'){
    const complete=()=>{const scene=ext._state(),handlers=ext._createdHandlers;return chain(callVirtual(ref,'setKind',[args[2]],util,token),()=>{active();scene.physicsEngine.members.push(s);s._creationKind=ext._kindValue(args[2]);return chain(ext._finishSpriteCreation(ref,{...util,sequencer:ext._runtime.sequencer},{state:scene,handlers}),()=>{active();s.hasCustomDimensions=false;});});};
    return chain(invoke('__bwClass_Sprite_constructor %s %s',[ref,args[1]],util,token),complete);
   }
   // BaseSprite registration precedes image rejection and Sprite initialization.
   invoke('__bwClass___bwSDK_BaseSprite_constructor %s %s',[ref,0],util,token);
   const image=ext._image(args[1]);if(!image)throw new Error('Sprite image cannot be undefined or null');
   ext._initializeSdkSprite(ref,image);
   return chain(callVirtual(ref,'setImage',[args[1]],util,token),()=>{active();return chain(callVirtual(ref,'setKind',[-1],util,token),()=>{active();s.layer=1;s.lifespan=undefined;});});
  }
  if(op==='setImage')return ext.setSpriteImage({ID:ref,IMAGE:args[1]});
  if(op==='setFlag'){
   const flags=values.truth(args[2])?values.binary(s.flags,'|',args[1]):values.binary(s.flags,'&',values.unary('~',args[1]));
   // SDK setFlag mutates bits only. The menu primitive's immediate StayInScreen
   // clamp would move the Sprite before the next actual physics phase.
   return ext.setSpriteProperty({ID:ref,PROPERTY:'flags',VALUE:flags},util);
  }
  if(op==='setKind')return ext.setSpriteKind({ID:ref,KIND:args[1]});
  if(op==='kind')return s.kind;
  if(op==='setPosition')return ext.setSpritePosition({ID:ref,X:args[1],Y:args[2]},util);
  if(op==='setVelocity'){ext.setSpriteProperty({ID:ref,PROPERTY:'vx',VALUE:args[1]},util);return ext.setSpriteProperty({ID:ref,PROPERTY:'vy',VALUE:args[2]},util);}
  if(op==='destroy')return ext.destroySprite({ID:ref},util);
  throw new Error('SDK Sprite operation is not qualified: '+op);
 };
 const callVirtual=(ref,name,args,util,token)=>{const method=ext._objectHeap.method(ref,name);return ext._objectProcedure(method.procedure,[ref,...args],util,token);};
 const chain=(value,next)=>value&&typeof value.then==='function'?value.then(next):next();
 return {matches:name=>operations.has(name),invoke,heapHooks:{definition:name=>definitions.get(name),reserve:()=>ext._reserveSdkSprite(),external:ref=>typeof ref==='string'&&ext._spriteValues.has(ref),externalClass:ref=>sprite(ref)._sdkBaseOnly?'__bwSDK_BaseSprite':'Sprite',get(ref,key){const s=sprite(ref);if(key==='image')return s.image?ext._imageHandle(s.image):values.UNDEFINED;if(key==='id')return values.encode(s.pxtId);if(key==='hasCustomDimensions')return values.encode(s.hasCustomDimensions);return values.encode(ext.spriteProperty({ID:ref,PROPERTY:key}));},set(ref,key,value,util){if(key==='id'){sprite(ref).pxtId=Number(value);return;}if(key==='hasCustomDimensions'){sprite(ref).hasCustomDimensions=values.decode(value);return;}return ext.setSpriteProperty({ID:ref,PROPERTY:key,VALUE:value},util);}}};
}
module.exports={create,allocateHandle:()=> 'arcade:'+(++nextCanonicalSprite)};
