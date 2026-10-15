// Lowering metadata comes only from a completed source producer proof. The
// actual current Blocks body must be checked independently during execution
// and export; this inert certificate cannot issue a completion permission.
import {classResultFlowCertificate,classMethodSourceSignature} from './class-callable-source-flow.js';
export function withClassResultFlowProof(program,proof) {
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    return {...program,body:program.body.map(node=>node.type==='Class'?{...node,
        methods:node.methods.map(method=>{
            const flow=classResultFlowCertificate(proof,program,method);
            const signature=classMethodSourceSignature(proof,program,method);
            return {...method,bwClassCallableSignature:signature,...(flow?{bwClassResultFlow:structuredClone(flow)}:{})};
        })}:node)};
}
