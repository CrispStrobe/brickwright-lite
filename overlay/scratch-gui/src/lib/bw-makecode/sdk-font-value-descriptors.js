// Font is the selected SDK's structural record interface, not a source class.
// This internal descriptor is field/type metadata; it grants no constructor,
// inheritance, source namespace identity or mutation admission by itself.
export const SDK_FONT_RECORD_NAME = '__bwSDK_Font';
export const SDK_FONT_PUBLIC_TYPE = 'image.Font';
export const SDK_FONT_FIELDS = Object.freeze([
    Object.freeze({name:'charWidth',type:'number',readonly:false,visibility:'public'}),
    Object.freeze({name:'charHeight',type:'number',readonly:false,visibility:'public'}),
    Object.freeze({name:'data',type:'Buffer',readonly:false,visibility:'public'}),
    Object.freeze({name:'multiplier',type:'number',readonly:false,visibility:'public',optional:true})
]);
export const SDK_FONT_RECORD = Object.freeze({name:SDK_FONT_RECORD_NAME,publicType:SDK_FONT_PUBLIC_TYPE,
    record:true,constructible:false,inheritable:false,fields:SDK_FONT_FIELDS});
export const sdkFontRecordType = name => name===SDK_FONT_PUBLIC_TYPE?SDK_FONT_RECORD_NAME:name;
export const sdkFontPublicType = name => name===SDK_FONT_RECORD_NAME?SDK_FONT_PUBLIC_TYPE:name;
