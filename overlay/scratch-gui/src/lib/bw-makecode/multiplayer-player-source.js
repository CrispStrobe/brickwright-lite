import {staticSdkNamespaceReceivers} from './static-sdk-namespaces.js';

// These are actual SDK operation and callback sites, never type-name evidence.
export function multiplayerPlayerSourceCalls(program) {
    const sdk=staticSdkNamespaceReceivers(program),registrations=[],properties=[],qualifiedRegistrations=new WeakSet(),qualifiedProperties=new WeakSet(),computedWrites=[];
    const path=node=>node?.type==='Identifier'?node.name:node?.type==='Member'?path(node.object)+'.'+node.name:null;
    const root=node=>node?.type==='Identifier'?node:node?.type==='Member'||node?.type==='Index'?root(node.object):null;
    const selectedRoot=node=>{const value=root(node);return value&&['mp','ControllerEvent'].includes(value.name)&&sdk.has(value);};
    let unsafe=false;
    const walk=(node,parent=null)=>{
        if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(value=>walk(value,parent));return;}
        if(node.type==='Namespace'&&['mp','ControllerEvent'].includes(String(node.name).split('.')[0]))unsafe=true;
        const written=node.type==='Assignment'?node.left:node.type==='Update'?node.argument:node.type==='Unary'&&node.op==='delete'?node.argument:null;
        if(written&&selectedRoot(written))unsafe=true;
        if(written?.type==='Member'&&['_index','index','number','getProperty','prototype','__proto__','constructor'].includes(written.name))unsafe=true;
        if(written?.type==='Index'){
            const key=written.index;
            if(key?.type==='String'){if(['_index','index','number','getProperty','prototype','__proto__','constructor'].includes(key.value))unsafe=true;}
            else computedWrites.push(key);
        }
        if(node.type==='Member'&&['prototype','__proto__','constructor'].includes(node.name))unsafe=true;
        if(node.type==='Call'&&node.callee?.type==='Member'&&['setPrototypeOf','defineProperty','defineProperties'].includes(node.callee.name))unsafe=true;
        if(node.type==='Identifier'&&selectedRoot(node)&&!(parent?.type==='Member'&&parent.object===node))unsafe=true;
        if(node.type==='Index'&&selectedRoot(node))unsafe=true;
        const name=path(node);
        if(sdk.has(node)&&node.type==='Member'&&(name==='mp.Player'||name?.startsWith('mp._')))unsafe=true;
        if(sdk.has(node)&&['mp.getPlayerProperty','mp.onControllerEvent'].includes(name)&&!(parent?.type==='Call'&&parent.callee===node))unsafe=true;
        if(sdk.has(node)&&name==='mp.PlayerProperty'&&!(parent?.type==='Member'&&parent.object===node))unsafe=true;
        if(node.type==='Call'&&sdk.has(node.callee)){
            if(path(node.callee)==='mp.onControllerEvent')registrations.push(node);
            if(path(node.callee)==='mp.getPlayerProperty')properties.push(node);
        }
        for(const value of Object.values(node))if(value&&typeof value==='object')walk(value,node);
    };walk(program);
    const plain=node=>!node.isNew&&!node.typeArguments?.length&&node.args?.length===2;
    if(!unsafe){
        for(const call of registrations){
            const [event,handler]=call.args||[],name=handler?.params?.[0],annotation=handler?.paramTypes?.[name];
            if(plain(call)&&sdk.has(event)&&['ControllerEvent.Connected','ControllerEvent.Disconnected'].includes(path(event))&&handler?.type==='FunctionExpression'&&handler.params.length===1&&/^[A-Za-z_$][\w$]*$/.test(name)&&(!annotation||!annotation.isArray&&['','any','mp.Player'].includes(annotation.text)))qualifiedRegistrations.add(call);
        }
        for(const call of properties)if(plain(call)&&sdk.has(call.args[1])&&path(call.args[1])==='mp.PlayerProperty.Number')qualifiedProperties.add(call);
    }
    return Object.freeze({registrations:Object.freeze(registrations),properties:Object.freeze(properties),computedWrites:Object.freeze(computedWrites),isRegistration:node=>qualifiedRegistrations.has(node),isProperty:node=>qualifiedProperties.has(node)});
}
