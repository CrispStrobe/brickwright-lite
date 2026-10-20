// Structural correspondence only. Values still come from executing the actual
// constructor body in the ordinary class producer proof.
const data=(object,key)=>{
    const row=object&&Object.getOwnPropertyDescriptor(object,key);
    return row&&Object.hasOwn(row,'value')?row:null;
};
// Detect only this added slice without reading an accessor before the existing
// lexical helpers run. Empty ordinary constructors retain the prior path.
export function requestsConstructorParameterProperties(program) {
    const body=data(program,'body')?.value;
    if(!Array.isArray(body))return false;
    for(let i=0;i<body.length;i++) {
        const cls=data(body,String(i))?.value;
        if(data(cls,'type')?.value!=='Class')continue;
        const ctorDescriptor=Object.getOwnPropertyDescriptor(cls,'ctor');
        if(ctorDescriptor&&!Object.hasOwn(ctorDescriptor,'value'))return true;
        const ctor=ctorDescriptor?.value,params=data(ctor,'params')?.value;
        for(const object of [ctor,params]) {
            const descriptor=object&&Object.getOwnPropertyDescriptor(object,'parameterProperties');
            if(descriptor&&(!Object.hasOwn(descriptor,'value')||!Array.isArray(descriptor.value)||descriptor.value.length))return true;
        }
        const fields=data(cls,'fields')?.value;
        if(Array.isArray(fields))for(let j=0;j<fields.length;j++)
            if(data(data(fields,String(j))?.value,'parameterProperty')?.value===true)return true;
    }
    return false;
}
export function ordinaryConstructorParameterProperties(cls) {
    const ctor=data(cls,'ctor')?.value,params=data(ctor,'params')?.value;
    const top=data(ctor,'parameterProperties'),hidden=data(params,'parameterProperties');
    if(!Array.isArray(params)||!top||!hidden||!Array.isArray(top.value)||top.value!==hidden.value||
        hidden.enumerable||hidden.configurable||hidden.writable)return false;
    const properties=top.value;
    if(!properties.length)return true;
    if(cls.base||!Array.isArray(cls.fields)||!Array.isArray(ctor.body))return false;
    for(const name of ['optionalParams','parameterDefaults']) {
        const a=data(ctor,name),b=data(params,name);
        if(!a||!b||!Array.isArray(a.value)||a.value!==b.value||a.value.length||
            b.enumerable||b.configurable||b.writable)return false;
    }
    const names=new Set();let last=-1;
    for(let i=0;i<properties.length;i++) {
        const property=properties[i],name=data(property,'name')?.value;
        const modifiers=data(property,'modifiers')?.value,type=data(property,'typeName')?.value;
        const index=params.indexOf(name),annotation=data(ctor.paramTypes,name)?.value;
        if(typeof name!=='string'||names.has(name)||index<=last||
            params.filter(value=>value===name).length!==1||!Array.isArray(modifiers)||!modifiers.length||
            new Set(modifiers).size!==modifiers.length||
            modifiers.some(value=>!['public','private','protected','readonly'].includes(value))||
            modifiers.filter(value=>['public','private','protected'].includes(value)).length>1||
            typeof type!=='string'||annotation?.text!==type||annotation.isArray!==false)return false;
        names.add(name);last=index;
        const fields=cls.fields.filter(field=>field.name===name),field=fields[0];
        if(fields.length!==1||field.parameterProperty!==true||field.init!==null||field.isStatic!==false||
            field.typeName!==type||!Array.isArray(field.modifiers)||field.modifiers.length!==modifiers.length||
            field.modifiers.some((value,j)=>value!==modifiers[j]))return false;
        const statement=ctor.body[i],write=statement?.expr;
        if(statement?.type!=='ExpressionStatement'||write?.type!=='Assignment'||write.op!=='='||
            write.left?.type!=='Member'||write.left.object?.type!=='Identifier'||write.left.object.name!=='this'||
            write.left.name!==name||write.right?.type!=='Identifier'||write.right.name!==name)return false;
    }
    return cls.fields.filter(field=>field.parameterProperty===true).length===properties.length;
}

// Preserve nonenumerable parser roles and shared references during reflection.
// Accessors are never evaluated; their presence is a refusal, not a transfer.
export function cloneClassSourceMetadata(value,decorate) {
    const copies=new WeakMap();
    const clone=node=>{
        if(!node||typeof node!=='object')return node;
        if(copies.has(node))return copies.get(node);
        const prototype=Object.getPrototypeOf(node);
        if(prototype!==Object.prototype&&prototype!==Array.prototype&&prototype!==null)
            throw Error('Class source metadata requires ordinary data objects');
        const out=Array.isArray(node)?[]:Object.create(prototype);copies.set(node,out);
        for(const key of Reflect.ownKeys(node)) {
            if(Array.isArray(node)&&key==='length')continue;
            const descriptor=Object.getOwnPropertyDescriptor(node,key);
            if(!Object.hasOwn(descriptor,'value'))throw Error('Class source metadata requires own data descriptors');
            Object.defineProperty(out,key,{...descriptor,value:key==='originalBody'?descriptor.value:clone(descriptor.value)});
        }
        if(Array.isArray(node))Object.defineProperty(out,'length',Object.getOwnPropertyDescriptor(node,'length'));
        decorate(node,out);return out;
    };
    return clone(value);
}
