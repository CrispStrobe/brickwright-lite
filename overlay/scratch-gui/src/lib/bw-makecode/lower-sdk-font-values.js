import {SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';
import {lowerNumberTextValue} from './lower-number-text-values.js';
import {analyseSourceValueProducers} from './source-value-producers.js';

export function lowerSdkFontValues(program) {
    const analysis=analyseSourceValueProducers(program),unsupported=[...analysis.diagnostics];
    const fields=new Map(SDK_FONT_FIELDS.map(field=>[field.name,field.type]));
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const intrinsic=(name,args,type)=>({type:'Call',callee:{type:'Identifier',name:'__bwSdkFont_'+name},args,bwFontIntrinsic:name,...(type?{bwFontType:type}:{} )});
    const exact=(node,type)=>{const types=analysis.typesAt(node);return types.size===1&&types.has(type);};
    const isFont=node=>exact(node,'Font');
    const sdk={has:analysis.isSdkNamespace};
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const scales=analysis.fontScales.map(node=>({node,receiver:node.args[0]}));
    const texts=analysis.fontSelections.map(node=>({node,argument:node.args[0]}));
    const prints=analysis.fontPrints;
    const types={get:analysis.typesAt},cell=node=>node;
    for(const item of scales){if(!isFont(item.receiver))fail('SDK scaledFont requires a proven current Font producer');const size=types.get(cell(item.node.args[1]));if(size?.size!==1 || !size.has('Number'))fail('SDK scaledFont size requires a proven Number producer');}
    for(const item of texts)if(types.get(item.argument)?.size!==1 || !types.get(item.argument).has('String'))fail('SDK Font selection requires a proven actual String producer');
    for(const {node,center,fontIndex}of prints){if(types.get(cell(node.callee.object))?.size===1&&types.get(cell(node.callee.object)).has('ClassInstance'))continue;if(!types.get(cell(node.callee.object))?.has('Image')&&!types.get(cell(node.args[fontIndex]))?.has('Font'))continue;const exact=(value,type)=>types.get(cell(value))?.size===1&&types.get(cell(value)).has(type);if(node.isNew||node.args.length!==fontIndex+1)fail('SDK Font print requires its exact selected signature');if(!exact(node.callee.object,'Image'))fail('SDK Font print IMAGE requires a proven actual Image producer');if(!exact(node.args[0],'String'))fail('SDK Font print TEXT requires a proven actual String producer');if(!exact(node.args[fontIndex],'Font'))fail('SDK Font print FONT requires a proven actual Font producer');for(const [index,name]of center?[[1,'Y'],[2,'COLOR']]:[[1,'X'],[2,'Y'],[3,'COLOR']])if(!exact(node.args[index],'Number'))fail('SDK Font print '+name+' requires a proven actual Number producer');}
    const rewrite=(node,target=false)=>{
        if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(value=>rewrite(value,target));
        const numberText=lowerNumberTextValue(node,value=>types.get(cell(value)));
        if(numberText?.unsupported)fail(numberText.unsupported);
        if(numberText?.value)return {...numberText.value,left:rewrite(numberText.value.left)};
        if(node.type==='Member'&&fields.has(node.name)&&(types.get(cell(node.object))?.has('Font')||analysis.fontAnnotatedAt(node.object))){
            if(!isFont(cell(node.object))){fail('SDK Font field requires proven actual producer authority');return node;}
            if(target){fail('SDK Font field mutation is not qualified by the read slice');return node;}
            // Keep the existing editable metric selectors for direct SDK constants.
            // Aliases and scaled records still read their actual live Font object.
            if(['charWidth','charHeight'].includes(node.name) && sdk.has(node.object) &&
                ['image.font5','image.font8','image.font12'].includes(path(node.object)))
                return {type:'FontMetric',font:node.object.name,property:node.name};
            return intrinsic('field',[rewrite(node.object),{type:'String',value:node.name}],fields.get(node.name));
        }
        if(node.type==='Call'&&node.callee?.type==='Member'&&types.get(cell(node.callee.object))?.has('GlyphBuffer')&&['setNumber','setByte','write','fill','shift','rotate','packAt'].includes(node.callee.name))fail('SDK Font glyph Buffer mutation is not qualified by the read slice');
        if(node.type==='Member'&&sdk.has(node)&&['image.font5','image.font8','image.font12'].includes(path(node)))return intrinsic('constant',[{type:'String',value:node.name}],'image.Font');
        if(node.type==='Call'&&sdk.has(node.callee)&&['image.getFontForText','image.scaledFont'].includes(path(node.callee))){
            const name=node.callee.name;if(node.isNew||node.args.length!==(name==='scaledFont'?2:1))fail('SDK Font factory requires its exact selected signature');
            return intrinsic(name,node.args.map(arg=>rewrite(arg)),'image.Font');
        }
        if(node.type==='Assignment')return {...node,left:rewrite(node.left,true),right:rewrite(node.right)};
        if(node.type==='Update')return {...node,argument:rewrite(node.argument,true)};
        const result=Object.fromEntries(Object.entries(node).map(([name,value])=>[name,value&&typeof value==='object'?rewrite(value,target):value]));
        if(node.type==='Declaration')result.decls=result.decls.map(decl=>({...decl,...((()=>{const types=analysis.bindingTypesAt(node,decl.name);return types.size===1&&types.has('Font');})()?{bwFontProducer:true}:{})}));
        if(isFont(cell(node)))result.bwFontValue=true;
        return result;
    };
    return {program:rewrite(program),unsupported};
}
