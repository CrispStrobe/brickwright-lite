// Lowering metadata comes only from a completed source producer proof. The
// actual current Blocks body must be checked independently during execution
// and export; this inert certificate cannot issue a completion permission.
import {classResultFlowCertificate,classMethodSourceSignature,classConstructorSourceSignature,classCallableReflectionSource,classSdkImageRoles,classSdkImageValue} from './class-callable-source-flow.js';
import {cloneClassSourceMetadata,ordinaryConstructorParameterProperties} from './class-parameter-property-source.js';
export function withClassResultFlowProof(program,proof) {
    if(proof?.eligible!==true||!proof.resultFlows)return program;
    const methods=new Set(program.body.filter(node=>node.type==='Class').flatMap(node=>node.methods));
    return cloneClassSourceMetadata(program,(node,out)=>{
        if(classSdkImageValue(proof,program,node)){out.bwSdkImageValue=true;out.bwObjectTypes=['image'];}
        if(node.type==='Unary'&&node.op==='typeof'&&classCallableReflectionSource(proof,program,node))out.bwSourceCallableTypeOf=true;
        if(node.type==='Class') {
            const roles=classSdkImageRoles(proof,program,node);if(roles)out.bwSdkImageRoles=roles;
            const constructor=classConstructorSourceSignature(proof,program,node);
            if(constructor)out.ctor.bwClassCallableSignature=constructor;
            if(node.ctor?.parameterProperties?.length&&!ordinaryConstructorParameterProperties(out))
                throw Error('Class lowering lost its actual constructor parameter property correspondence');
        }
        if(methods.has(node)) {
            out.bwClassCallableSignature=classMethodSourceSignature(proof,program,node);
            const flow=classResultFlowCertificate(proof,program,node);
            if(flow)out.bwClassResultFlow=structuredClone(flow);
        }
    });
}
