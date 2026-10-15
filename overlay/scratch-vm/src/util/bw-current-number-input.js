const primitiveOwner=require('./bw-primitive-owner');
const reporterOwner=require('./bw-cached-primitive-owner');

// Interpret only the Number shadow that actually supplied this synchronous
// primitive input. No declared type or earlier value establishes authority.
module.exports=function currentNumberInput(runtime,args,util,opcode,inputName='VALUE') {
    const original=args[inputName];
    if(!primitiveOwner.permitsNumberInput(opcode,inputName))return original;
    if(typeof original!=='string')return original;
    try {
        const block=primitiveOwner.current(util,args);
        if(block?.opcode!==opcode)return original;
        reporterOwner(runtime,util,args,opcode,[]);
        const container=util.thread.blockContainer,input=container.getBlock(block.inputs?.[inputName]?.block);
        const cached=input&&container._cache?._executeCached?.[input.id],field=input?.fields?.NUM;
        if(input?.opcode!=='math_number'||input.parent!==block.id||!field||String(field.value)!==original||!Number.isFinite(Number(field.value))||
            cached?.id!==input.id||cached.opcode!=='math_number'||cached.fields!==input.fields||cached.inputs!==container.getInputs(input)||
            cached._isShadowBlock!==true||cached._shadowValue!==original||cached._parentValues!==args||cached._parentKey!==inputName)return original;
        return Number(field.value);
    } catch (_) {return original;}
};
