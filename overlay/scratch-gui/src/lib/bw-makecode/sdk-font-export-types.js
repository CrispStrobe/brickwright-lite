import {SDK_FONT_RECORD_NAME,SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';

// Interface metadata activates the existing field graph. It never emits a
// class declaration, constructor, initializer or inheritance relationship.
export const sdkFontExportRecords=()=>[{
    name:SDK_FONT_RECORD_NAME,intrinsic:true,record:true,
    fields:SDK_FONT_FIELDS.map(({name,type,readonly,visibility})=>({name,type,readonly,visibility})),
    parameters:[],methods:[],initializer:'',constructor:''
}];
export const SDK_FONT_VALUE_OPCODES=Object.freeze(['arcade_fontValue','arcade_fontForText','arcade_scaleFont']);
export const hasSdkFontValues=project=>project.targets.some(target=>Object.values(target.blocks||{}).some(block=>SDK_FONT_VALUE_OPCODES.includes(block.opcode)));
export function seedSdkFontValueType(block,cell,addType) {
    if(SDK_FONT_VALUE_OPCODES.includes(block.opcode))addType(cell,SDK_FONT_RECORD_NAME);
}
