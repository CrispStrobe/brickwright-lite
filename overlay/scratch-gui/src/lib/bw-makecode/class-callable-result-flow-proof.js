// Lowering metadata comes only from a completed source producer proof. The
// actual current Blocks body must be checked independently during execution
// and export; this inert certificate cannot issue a completion permission.
import {classResultFlowCertificate,classMethodSourceSignature,classCallableReflectionSource} from './class-callable-source-flow.js';
export function withClassResultFlowProof(program,proof) {
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    const reflection=node=>{
        if(!node||typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(reflection);
        const out=Object.fromEntries(Object.entries(node).map(([key,value])=>[key,key==='originalBody'?value:reflection(value)]));
        if(node.type==='Unary'&&node.op==='typeof'&&classCallableReflectionSource(proof,program,node))out.bwSourceCallableTypeOf=true;
        return out;
    };
    return {...program,body:program.body.map(node=>node.type==='Class'?{...reflection(node),
        methods:node.methods.map(method=>{
            const flow=classResultFlowCertificate(proof,program,method);
            const signature=classMethodSourceSignature(proof,program,method);
            return {...reflection(method),bwClassCallableSignature:signature,...(flow?{bwClassResultFlow:structuredClone(flow)}:{})};
        })}:reflection(node))};
}
