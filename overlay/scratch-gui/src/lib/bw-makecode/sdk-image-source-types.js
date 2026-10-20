import {parseCallableType} from './callable-type-syntax.js';

// Type spelling only constrains a producer. It never issues an Image value.
// The parser remains unchanged; this resolver is used only by the explicit
// SDK Image class source proof and preserves actual nominal/generic shadows.
export function createSdkImageSourceTypes(program,lexical,{enabled=false}={}) {
    const scopes=new Map(lexical.functions.map(scope=>[scope.node,scope]));
    const shadowed=owner=>{
        for(let scope=scopes.get(owner)||owner?.names&&owner||lexical.global;scope;scope=scope.parent){
            if((scope.node?.typeParameters||[]).some(parameter=>parameter.name==='Image'))return true;
            if(['class','enum'].includes(scope.names.get('Image')?.kind))return true;
        }
        // Unsupported type declarations cannot silently become the SDK type.
        return (program.body||[]).some(node=>['Interface','TypeAlias','Enum'].includes(node.type)&&node.name==='Image');
    };
    const resolve=(type,owner)=>{
        if(!type)return type;
        if(type.kind==='named')return enabled&&type.name==='Image'&&!shadowed(owner)?{kind:'sdk',name:'Image'}:{...type};
        if(type.kind==='array')return {...type,element:resolve(type.element,owner)};
        if(type.kind==='callable')return {...type,parameters:type.parameters.map(parameter=>({...parameter,type:resolve(parameter.type,owner)})),result:resolve(type.result,owner)};
        return type;
    };
    return {resolve,annotation:(value,owner)=>resolve(parseCallableType(typeof value==='string'?value:value?.text||''),owner)};
}

export function containsSdkImageType(type) {
    return type?.kind==='sdk'&&type.name==='Image'||type?.kind==='callable'&&
        (type.parameters.some(parameter=>containsSdkImageType(parameter.type))||containsSdkImageType(type.result));
}
export function sdkImageRolesForClass(cls,annotation,signature) {
    const fields=[];
    for(const field of cls.fields||[]){const type=annotation(field.typeName);if(type?.kind==='sdk')fields.push({name:field.name,type:'Image',sdkType:type});
        else if(type?.kind==='callable'&&containsSdkImageType(type))fields.push({name:field.name,type:'callable',callableSignature:type});}
    const constructor=(cls.ctor?.params||[]).flatMap((name,index)=>{const type=annotation(cls.ctor.paramTypes?.[name],cls.ctor);return type?.kind==='sdk'?[{index,name,type:'Image',sdkType:type}]:[];});
    const methods=(cls.methods||[]).flatMap(method=>{const type=signature(method);return containsSdkImageType(type)?[{name:method.name,typeParameters:structuredClone(method.typeParameters||[]),callableSignature:type}]:[];});
    return fields.length||constructor.length||methods.length?{fields,constructor,methods}:null;
}
