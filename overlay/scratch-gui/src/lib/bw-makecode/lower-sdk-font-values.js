import {SDK_FONT_FIELDS} from './sdk-font-value-descriptors.js';
import {lowerNumberTextValue} from './lower-number-text-values.js';
import {analyseSourceValueProducers} from './source-value-producers.js';
import {observeLoweringInput} from './lowering-input-observation.js';

export function lowerSdkFontValues(program) {
    const analysis=analyseSourceValueProducers(program,{sceneClockNumbers:true}),unsupported=[...analysis.diagnostics];
    return lowerSdkFontValuesWithAnalysis(program,analysis,unsupported);
}

// Complete private lowering on the actual compiler-owned parser/normalizer AST.
// No caller flag, graph callback or retained type fact can select this demand.
export function lowerSdkFontValuesForTranslation(program) {
    if(!fontDemandAbsent(program))return lowerSdkFontValues(program);
    const input=observeLoweringInput(program);
    if(!input||!input.current())return lowerSdkFontValues(program);
    const result=lowerSdkFontValuesWithAnalysis(program,null,[]);
    return input.current()?result:lowerSdkFontValues(program);
}

// Necessary absence only. Held reflection and indexed traversal make an early
// positive-demand rejection cheap without invoking changed realm methods. Only
// the complete operation's later pristine/current observation can accept it.
const fontKeys=Reflect.ownKeys,fontDescriptor=Object.getOwnPropertyDescriptor;
const fontPrototype=Object.getPrototypeOf,fontOwn=Object.hasOwn,fontApply=Reflect.apply,fontDefine=Object.defineProperty;
const FontSet=Set,fontSetHas=Set.prototype.has,fontSetAdd=Set.prototype.add,fontSetDelete=Set.prototype.delete;
const fontArray=Array.isArray,fontStartsWith=String.prototype.startsWith;
const fontObjectPrototype=Object.prototype,fontArrayPrototype=Array.prototype;
const fontData=(object,key)=>{const d=fontDescriptor(object,key);return d&&fontOwn(d,'value')?d.value:undefined;};
const fontAppend=(array,value)=>fontDefine(array,array.length,{value,writable:true,enumerable:true,configurable:true});
const fontStatements=value=>{
    if(!fontArray(value)||fontData(value,'length')>500000)return false;
    for(let i=0;i<fontData(value,'length');i++){
        const statement=fontData(value,i);
        if(!statement||typeof statement!=='object'||typeof fontData(statement,'type')!=='string')return false;
    }
    return true;
};
const fontDemandAbsent=program=>{
    const names=new FontSet(),active=new FontSet(),pending=[{node:program,leave:false,depth:0}];let slots=0;
    const memberNames=new FontSet(),memberList=['font5','font8','font12','getFontForText','scaledFont',
        'charWidth','charHeight','data','multiplier','toString','print','printCenter'];
    for(let i=0;i<memberList.length;i++)fontApply(fontSetAdd,memberNames,[memberList[i]]);
    while(pending.length){
        const item=pending[pending.length-1];pending.length--;const node=item.node;
        if(!node||typeof node!=='object')continue;
        if(item.leave){fontApply(fontSetDelete,active,[node]);continue;}
        if(item.depth>128||fontApply(fontSetHas,active,[node]))return false;
        const prototype=fontPrototype(node);
        if(prototype!==fontObjectPrototype&&prototype!==fontArrayPrototype&&prototype!==null)return false;
        fontApply(fontSetAdd,active,[node]);fontAppend(pending,{node,leave:true});
        const type=fontData(node,'type');
        if(type==='Unknown'||type==='Opaque'||type==='ThrowStatement'||type==='FontMetric')return false;
        // Preserve eager malformed-input errors instead of treating arbitrary
        // own-data records as parser nodes. Complex containers stay eager.
        if(type==='Class'||type==='Switch')return false;
        if(type==='Identifier'&&typeof fontData(node,'name')!=='string')return false;
        if((type==='Program'||type==='Block'||type==='Namespace'||type==='For'||type==='ForOf'||type==='While'||type==='FunctionDeclaration'||type==='FunctionExpression')&&!fontStatements(fontData(node,'body')))return false;
        if(type==='If'){
            const consequent=fontData(node,'consequent'),alternate=fontData(node,'alternate');
            if(consequent!=null&&!fontStatements(consequent)||alternate!=null&&!fontStatements(alternate))return false;
        }
        if(type==='Member'&&fontApply(fontSetHas,memberNames,[fontData(node,'name')]))return false;
        if(type==='FunctionDeclaration'){
            const name=fontData(node,'name');
            if(typeof name!=='string'||!name||fontApply(fontSetHas,names,[name]))return false;
            fontApply(fontSetAdd,names,[name]);
        }
        if(type==='Call'&&!fontArray(fontData(node,'args')))return false;
        if(type==='Declaration'){
            const decls=fontData(node,'decls');if(!fontArray(decls))return false;
            for(let i=0;i<fontData(decls,'length');i++){const decl=fontData(decls,i);if(!decl||typeof decl!=='object'||typeof fontData(decl,'name')!=='string')return false;}
        }
        if(type==='FunctionDeclaration'||type==='FunctionExpression'){
            const params=fontData(node,'params');if(!fontArray(params)||!fontArray(fontData(node,'body')))return false;
            for(let i=0;i<fontData(params,'length');i++)if(typeof fontData(params,i)!=='string')return false;
        }
        const keys=fontKeys(node);if((slots+=keys.length)>500000)return false;
        for(let i=keys.length-1;i>=0;i--){
            const key=keys[i],d=fontDescriptor(node,key);
            if(typeof key!=='string'||!d||!fontOwn(d,'value'))return false;
            const value=d.value;
            if(fontApply(fontStartsWith,key,['bwFont'])||key==='name'&&typeof value==='string'&&
                (fontApply(fontStartsWith,value,['__bwSdkFont_'])||value==='__bwSDK_Font'))return false;
            if(value&&typeof value==='object')fontAppend(pending,{node:value,leave:false,depth:item.depth+1});
        }
    }
    return true;
};

// A null analysis is available only inside the completed absence operation.
// All real graph-derived positive branches remain in this one shared engine.
function lowerSdkFontValuesWithAnalysis(program,analysis,unsupported) {
    const fields=new Map(SDK_FONT_FIELDS.map(field=>[field.name,field.type]));
    const fail=message=>{if(!unsupported.includes(message))unsupported.push(message);};
    const intrinsic=(name,args,type)=>({type:'Call',callee:{type:'Identifier',name:'__bwSdkFont_'+name},args,bwFontIntrinsic:name,...(type?{bwFontType:type}:{} )});
    const exact=(node,type)=>{if(analysis===null)return false;const types=analysis.typesAt(node);return types.size===1&&types.has(type);};
    const isFont=node=>exact(node,'Font');
    const sdk={has:analysis!==null?analysis.isSdkNamespace:()=>false};
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const scales=analysis!==null?analysis.fontScales.map(node=>({node,receiver:node.args[0]})):[];
    const texts=analysis!==null?analysis.fontSelections.map(node=>({node,argument:node.args[0]})):[];
    const prints=analysis!==null?analysis.fontPrints:[];
    const types={get:analysis!==null?analysis.typesAt:()=>new Set()},cell=node=>node;
    for(const item of scales){if(!isFont(item.receiver))fail('SDK scaledFont requires a proven current Font producer');const size=types.get(cell(item.node.args[1]));if(size?.size!==1 || !size.has('Number'))fail('SDK scaledFont size requires a proven Number producer');}
    for(const item of texts)if(types.get(item.argument)?.size!==1 || !types.get(item.argument).has('String'))fail('SDK Font selection requires a proven actual String producer');
    for(const {node,center,fontIndex}of prints){if(types.get(cell(node.callee.object))?.size===1&&types.get(cell(node.callee.object)).has('ClassInstance'))continue;if(!types.get(cell(node.callee.object))?.has('Image')&&!types.get(cell(node.args[fontIndex]))?.has('Font'))continue;const exact=(value,type)=>types.get(cell(value))?.size===1&&types.get(cell(value)).has(type);if(node.isNew||node.args.length!==fontIndex+1)fail('SDK Font print requires its exact selected signature');if(!exact(node.callee.object,'Image'))fail('SDK Font print IMAGE requires a proven actual Image producer');if(!exact(node.args[0],'String'))fail('SDK Font print TEXT requires a proven actual String producer');if(!exact(node.args[fontIndex],'Font'))fail('SDK Font print FONT requires a proven actual Font producer');for(const [index,name]of center?[[1,'Y'],[2,'COLOR']]:[[1,'X'],[2,'Y'],[3,'COLOR']])if(!exact(node.args[index],'Number'))fail('SDK Font print '+name+' requires a proven actual Number producer');}
    const rewrite=(node,target=false)=>{
        if(!node||typeof node!=='object')return node;if(Array.isArray(node))return node.map(value=>rewrite(value,target));
        const numberText=lowerNumberTextValue(node,value=>types.get(cell(value)));
        if(numberText?.unsupported)fail(numberText.unsupported);
        if(numberText?.value)return {...numberText.value,left:rewrite(numberText.value.left)};
        if(node.type==='Member'&&fields.has(node.name)&&(types.get(cell(node.object))?.has('Font')||analysis?.fontAnnotatedAt(node.object))){
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
        if(node.type==='Declaration')result.decls=result.decls.map(decl=>({...decl,...((()=>{const types=analysis!==null?analysis.bindingTypesAt(node,decl.name):new Set();return types.size===1&&types.has('Font');})()?{bwFontProducer:true}:{})}));
        if(isFont(cell(node)))result.bwFontValue=true;
        return result;
    };
    return {program:rewrite(program),unsupported};
}
