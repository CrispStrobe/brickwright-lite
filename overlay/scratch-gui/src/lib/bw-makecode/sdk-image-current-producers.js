// Facts from actual connected factory/clone blocks. Signature constraints are
// checked separately against every ingress and reconstructed current body.
export function currentSdkImageProducer(target,block,inputType,literalResource=null) {
    if(!block||!Object.values(target.blocks||{}).includes(block))return null;
    const id=Object.entries(target.blocks).find(([,row])=>row===block)?.[0],parent=target.blocks[block.parent];
    if(!parent||block.topLevel||block.shadow||block.next||!Object.values(parent.inputs||{}).some(input=>input[1]===id))return null;
    const sdk=()=>({kind:'sdk',name:'Image'});
    const constant=name=>{
        const input=block.inputs?.[name],slot=input?.[1];
        if(!input||![1,3].includes(input[0]))return null;
        let value;
        if(Array.isArray(slot)&&[4,5,6,7,8].includes(slot[0])&&slot.length===2)value=slot[1];
        else if(typeof slot==='string'){
            const leaf=target.blocks[slot];
            if(!leaf||leaf.opcode!=='math_number'||!leaf.shadow||leaf.parent!==Object.entries(target.blocks).find(([,row])=>row===block)?.[0]||
                Object.keys(leaf.inputs||{}).length||Object.keys(leaf.fields||{}).some(key=>key!=='NUM'))return null;
            value=leaf.fields.NUM?.[0];
        }else return null;
        if(!['number','string'].includes(typeof value))return null;
        const number=Number(value);return Number.isFinite(number)&& (number|0)>=0&&(number|0)<=2000?number:null;
    };
    if(block.opcode==='arcade_frameImage')return literalResource?.(target,block)?sdk():null;
    if(block.opcode==='arcade_createImage'){
        if(Object.keys(block.inputs||{}).some(key=>!['WIDTH','HEIGHT'].includes(key))||Object.keys(block.fields||{}).length)return null;
        return constant('WIDTH')!==null&&constant('HEIGHT')!==null?sdk():null;
    }
    if(block.opcode==='arcade_cloneImage'){
        if(Object.keys(block.inputs||{}).length!==1||!block.inputs.IMAGE||Object.keys(block.fields||{}).length)return null;
        const image=inputType('IMAGE');return image?.kind==='sdk'&&image.name==='Image'?sdk():null;
    }
    return null;
}

export function currentSdkImageRoles(cls) {
    const has=type=>type?.kind==='sdk'||type?.kind==='callable'&&(type.parameters.some(parameter=>has(parameter.type))||has(type.result));
    return {
        fields:cls.fields.filter(field=>field.valueKind==='sdk'||field.valueKind==='callable'&&has(field.callableSignature)).map(field=>field.valueKind==='sdk'?{name:field.name,type:field.type,sdkType:field.sdkType}:{name:field.name,type:field.type,callableSignature:field.callableSignature}).sort((a,b)=>a.name.localeCompare(b.name)),
        constructor:cls.parameters.flatMap((parameter,index)=>parameter.sdkType?[{index,name:parameter.name,type:parameter.type,sdkType:parameter.sdkType}]:[]),
        methods:cls.methods.filter(method=>has(method.callableSignature)).map(method=>({name:method.name,typeParameters:method.typeParameters,callableSignature:method.callableSignature})).sort((a,b)=>a.name.localeCompare(b.name))
    };
}
