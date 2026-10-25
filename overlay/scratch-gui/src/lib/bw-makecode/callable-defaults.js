// PXT binds literal defaults at an absent argument slot. A callback body must
// not turn an explicitly supplied undefined into the default a second time.
export function callableLiteralDefault(node) {
    if(node?.type==='Null')return {supported:true,value:null};
    if(node?.type==='Boolean')return {supported:true,value:node.value};
    if(node?.type==='Number' && Number.isFinite(Number(node.value)))return {supported:true,value:Number(node.value)};
    if(node?.type==='Unary' && ['+','-'].includes(node.op) && node.argument?.type==='Number') {
        const value=(node.op==='-'?-1:1)*Number(node.argument.value);
        if(Number.isFinite(value))return {supported:true,value};
    }
    return {supported:false};
}

export function callableDefaultBody(fn) {
    const defaults=[],unsupported=[];
    for(const entry of fn.parameterDefaults || []) {
        const literal=callableLiteralDefault(entry.value);
        if(!fn.params.includes(entry.name) || !literal.supported || defaults.some(value=>value.name===entry.name))
            unsupported.push('Selected Arcade callable defaults require unique parameters and numbers, null, true or false');
        else defaults.push({name:entry.name,value:literal.value});
    }
    if(unsupported.length || !defaults.length)return {body:fn.body,defaults,unsupported};
    if(fn.parameterDefaultPrologue===false)return {body:fn.body,defaults,unsupported};
    const expected=(fn.parameterDefaults || []).map(({name,value})=>({
        type:'If',test:{type:'Binary',op:'===',left:{type:'Identifier',name},right:{type:'Undefined'}},
        consequent:[{type:'ExpressionStatement',expr:{type:'Assignment',op:'=',left:{type:'Identifier',name},right:value}}],alternate:[]
    }));
    if(fn.parameterDefaultPrologue===true && JSON.stringify(fn.body.slice(0,expected.length))===JSON.stringify(expected))
        return {body:fn.body.slice(expected.length),defaults,unsupported};
    unsupported.push('Callable default metadata does not match its generated initial parameter prologue');
    return {body:fn.body,defaults,unsupported};
}
