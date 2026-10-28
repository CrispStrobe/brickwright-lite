import {validateClassCallablePlan} from './class-callable-plan.js';
import {inspectCallableExportGraph,validateCallableCurrentBodyTypes} from './callable-export-graph.js';

// First half of default export admission. This proves the actual current
// registrations, lexical owners, connected bodies and writers. The complete
// reconstructed program must additionally pass classCallableSourceGate.
export function classCallableDefaultProjectGate(target,project,model,literal) {
    const unsupported=[];
    try {
        if(!project.targets.includes(target)||typeof model?.classCallableProvider!=='function')
            throw Error('missing actual project/class owner');
        const declarations=Object.values(target.blocks||{}).filter(b=>b.opcode==='arcade_declareCallable');
        if(!declarations.length)return {eligible:false,unsupported:[]};
        const envelopes=declarations.map(block=>JSON.parse(literal(block,'METADATA')));
        if(envelopes.some(row=>row.version!==2))return {eligible:false,unsupported:[]};
        const plan=validateClassCallablePlan(envelopes[0].plan);
        if(envelopes.some(row=>JSON.stringify(row.plan)!==JSON.stringify(plan)))throw Error('declarations have different current plans');
        const classes=[...model.classes.values()].filter(cls=>cls.target===target&&!cls.intrinsic);
        if(classes.length!==plan.classes?.length||classes.some(cls=>
            !plan.classes.some(row=>row.name===cls.name&&row.parent===null)||cls.parent||
            cls.fields.some(field=>field.getter||field.setter)))
            throw Error('ordinary class catalogue differs or has unqualified ancestry/accessors');
        // Each declaration/site/procedure and every actual class writer must
        // pass the existing independently grounded current-body provider.
        const sdkImageCandidate=plan.classes.some(row=>row.sdkRoles);
        const classProvider=model.classCallableProvider(target,{sdkImagePrototype:sdkImageCandidate});
        const graph=inspectCallableExportGraph(target,plan,literal,{classProvider});
        validateCallableCurrentBodyTypes(graph,literal);
        return {eligible:true,unsupported:[],graph,sdkImageEnabled:sdkImageCandidate};
    } catch(error) {unsupported.push('Class callable default project: '+error.message);}
    return {eligible:false,unsupported};
}
