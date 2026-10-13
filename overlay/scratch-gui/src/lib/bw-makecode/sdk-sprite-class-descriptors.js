// Bounded selected Arcade4.2.1/PXT13.2.1 intrinsic surface. SDK source hashes and
// original constructor/identity controls bind admission; unknown members stay refused.
export const SDK_SPRITE_CLASS_NODES = [
  {
    "name": "__bwSDK_BaseSprite",
    "sdkIntrinsic": "BaseSprite",
    "fields": [
      {
        "name": "z",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "id",
        "typeName": "number",
        "modifiers": []
      }
    ],
    "methods": [],
    "ctor": {
      "params": [
        "z"
      ],
      "paramTypes": {
        "z": "number"
      }
    }
  },
  {
    "name": "Sprite",
    "sdkIntrinsic": "Sprite",
    "base": "__bwSDK_BaseSprite",
    "fields": [
      {
        "name": "x",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "y",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "vx",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "vy",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "ax",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "ay",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "fx",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "fy",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "width",
        "typeName": "number",
        "modifiers": [
          "readonly"
        ]
      },
      {
        "name": "height",
        "typeName": "number",
        "modifiers": [
          "readonly"
        ]
      },
      {
        "name": "left",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "right",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "top",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "bottom",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "flags",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "lifespan",
        "typeName": "number",
        "modifiers": []
      },
      {
        "name": "image",
        "typeName": "Image",
        "modifiers": [
          "readonly"
        ]
      }
    ],
    "methods": [
      {
        "name": "setImage",
        "params": [
          "img"
        ],
        "paramTypes": {
          "img": "Image"
        },
        "returnType": "void"
      },
      {
        "name": "setKind",
        "params": [
          "value"
        ],
        "paramTypes": {
          "value": "number"
        },
        "returnType": "void"
      },
      {
        "name": "kind",
        "params": [],
        "paramTypes": {},
        "returnType": "number"
      },
      {
        "name": "setPosition",
        "params": [
          "x",
          "y"
        ],
        "paramTypes": {
          "x": "number",
          "y": "number"
        },
        "returnType": "void"
      },
      {
        "name": "setVelocity",
        "params": [
          "vx",
          "vy"
        ],
        "paramTypes": {
          "vx": "number",
          "vy": "number"
        },
        "returnType": "void"
      },
      {
        "name": "destroy",
        "params": [],
        "paramTypes": {},
        "returnType": "void"
      }
    ],
    "ctor": {
      "params": [
        "img"
      ],
      "paramTypes": {
        "img": "Image"
      }
    }
  },
  {
    "name": "__bwSDK_ExtendableSprite",
    "sdkIntrinsic": "ExtendableSprite",
    "base": "Sprite",
    "fields": [
      {
        "name": "hasCustomDimensions",
        "typeName": "boolean",
        "modifiers": [
          "protected"
        ]
      }
    ],
    "methods": [],
    "ctor": {
      "params": [
        "spriteImage",
        "kind"
      ],
      "paramTypes": {
        "spriteImage": "Image",
        "kind": "number"
      },
      "optionalParams": [
        "kind"
      ]
    }
  }
].map(node=>({...node,type:'Class',sdkIntrinsic:node.sdkIntrinsic,unsupported:[],fields:node.fields,methods:node.methods.map(method=>({...method,kind:'method',body:[],optionalParams:[],modifiers:[]})),ctor:{...node.ctor,body:[],originalBody:[],optionalParams:node.ctor.optionalParams||[]}}));
export const sdkSpriteBase = name=>name==='sprites.ExtendableSprite'?'__bwSDK_ExtendableSprite':name;
export const sdkSpritePublicBase = name=>name==='__bwSDK_ExtendableSprite'?'sprites.ExtendableSprite':name==='__bwSDK_BaseSprite'?'sprites.BaseSprite':name;
export const sdkSpriteExportClasses = ()=>SDK_SPRITE_CLASS_NODES.map(node=>({name:node.name,intrinsic:true,parent:node.base,fields:node.fields.map(field=>({name:field.name,type:field.typeName,readonly:field.modifiers.includes('readonly'),visibility:field.modifiers.find(x=>['private','protected'].includes(x))||'public'})),parameters:node.ctor.params.map(name=>({name,type:node.ctor.paramTypes[name],optional:node.ctor.optionalParams.includes(name)})),initializer:`__bwClass_${node.name}_fields %s`,constructor:`__bwClass_${node.name}_constructor ${['self',...node.ctor.params].map(()=>'%s').join(' ')}`,methods:node.methods.map(method=>({name:method.name,procedure:`__bwClass_${node.name}_${method.name} ${['self',...method.params].map(()=>'%s').join(' ')}`,parameters:method.params.map(name=>({name,type:method.paramTypes[name],optional:false})),returnType:method.returnType,visibility:'public'}))}));
