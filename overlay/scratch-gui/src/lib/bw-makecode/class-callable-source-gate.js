import {proveClassCallableSource} from './class-callable-source-flow.js';

// Eligibility never mutates source or enables a runtime service. The caller
// must still perform strict existing lowering and current-project validation.
export function classCallableSourceGate(program) {
    try {const {eligible,unsupported}=proveClassCallableSource(program);return {eligible,unsupported};}
    catch(error){return {eligible:false,unsupported:['Class callable source: '+error.message]};}
}
