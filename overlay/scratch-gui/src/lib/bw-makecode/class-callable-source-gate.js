import {currentParserClassAbsence} from './ts-import.js';
import {proveClassCallableSource,classSdkImageRoles} from './class-callable-source-flow.js';

// Keep the actual completed proof object: source lowering checks its private
// identity and exact input AST. SDK constraints select vocabulary only after
// the complete producer/body proof has succeeded.
export function selectClassCallableSourceProof(program,{sdkImagePrototype=false}={}) {
    if(sdkImagePrototype){const proof=proveClassCallableSource(program,{sdkImagePrototype:true});return {proof,sdkImageEnabled:proof.eligible};}
    const ordinary=proveClassCallableSource(program);
    if(ordinary.eligible)return {proof:ordinary,sdkImageEnabled:false};
    const image=proveClassCallableSource(program,{sdkImagePrototype:true});
    if(image.eligible&&program.body.some(node=>node.type==='Class'&&classSdkImageRoles(image,program,node)))return {proof:image,sdkImageEnabled:true};
    return {proof:ordinary,sdkImageEnabled:false};
}

// Translation consumes only negative eligibility and diagnostics for absence.
// The general selector above retains its actual flow object on every route.
export function selectClassCallableSourceProofForTranslation(program,{sdkImagePrototype=false}={}) {
    if(currentParserClassAbsence(program))return {proof:{eligible:false,unsupported:[]},sdkImageEnabled:false};
    return selectClassCallableSourceProof(program,{sdkImagePrototype});
}

// Eligibility never mutates source or enables a runtime service. The caller
// must still perform strict existing lowering and current-project validation.
export function classCallableSourceGate(program) {
    try {const {proof:{eligible,unsupported}}=selectClassCallableSourceProof(program);return {eligible,unsupported};}
    catch(error){return {eligible:false,unsupported:['Class callable source: '+error.message]};}
}
