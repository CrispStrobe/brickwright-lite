// SPDX-License-Identifier: MPL-2.0
// Host bindings around complete original PXT Settings/MessagePack algorithms.
const original=require('./settings-pxt');
const buffers=require('./buffer');
const stringArrays=require('./string-array-settings');
const bytesToBase64=bytes=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return btoa(text);};
const fromBase64=text=>new buffers.PxtBuffer(Array.from(atob(text),c=>c.charCodeAt(0)));
const bindings={control:{createBufferFromUTF8:buffers.fromUTF8,panic(code){const error=new Error('Arcade settings panic '+code);error.settingsPanic=code;throw error;}},
    Buffer:{create:size=>new buffers.PxtBuffer(size)},NumberFormat:buffers.NumberFormat,pins:{sizeOf:buffers.sizeOfNumberFormat}};
const pure=original.initializeSettings({...bindings});
function initialize(state,touched) {
    const board={storedState:state,setStoredState(key,value){touched.add(key);if(value===null)delete state[key];else state[key]=value;}};
    const backend=original.initializeBackend({board:()=>board,U:{uint8ArrayToString:bytes=>{let text='';for(const byte of bytes)text+=String.fromCharCode(byte);return text;},
        stringToUint8Array:text=>Uint8Array.from(text,c=>c.charCodeAt(0))},
        RefBuffer:class {constructor(data){return new buffers.PxtBuffer(data);}},
        RefCollection:class {constructor(){this.data=[];}push(value){this.data.push(value);}}});
    const settings=original.initializeSettings({...bindings,...backend,_set:(key,value)=>backend._set(key,{data:value})}).settings;
    const arrays=stringArrays.initialize(settings);
    settings.writeStringArray=arrays.write;settings.readStringArray=arrays.read;
    return settings;
}
module.exports={initialize,bytesToBase64,fromBase64,packNumbers:nums=>pure.msgpack.packNumberArray(nums),unpackNumbers:bytes=>pure.msgpack.unpackNumberArray(bytes)};
