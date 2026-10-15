import {createRequire} from 'node:module';
const require=createRequire(new URL('../../packages/scratch-gui/package.json',import.meta.url));
const parse=source=>require('@babel/parser').parse(source,{sourceType:'script'});
const shape=node=>JSON.stringify(node,(key,value)=>['start','end','loc','extra','leadingComments','trailingComments','innerComments'].includes(key)?undefined:value);
const statements=source=>parse('function expected(){'+source+'}').program.body[0].body.body;
const expectedEntry='const bwConstraintEntry = bwProcedureEntry.entry(this.runtime, procedureCode, args, util);';
const expectedBind='if (bwConstraintEntry) bwProcedureEntry.bind(this.runtime, util.thread, util.thread.target, procedureCode, util.stackFrame.params, bwConstraintEntry.values, args, util);';
const isCall=(node,object,property)=>node?.type==='CallExpression'&&node.callee.type==='MemberExpression'&&
    !node.callee.computed&&node.callee.object.name===object&&node.callee.property.name===property;

export function patchProcedureConstraints(source) {
    const ast=parse(source),imports=ast.program.body.filter(node=>node.type==='VariableDeclaration'&&
        node.declarations.some(declaration=>declaration.id.name==='bwProcedureEntry'));
    const classes=ast.program.body.filter(node=>node.type==='ClassDeclaration'&&node.id.name==='Scratch3ProcedureBlocks');
    const methods=classes.length===1?classes[0].body.body.filter(node=>node.type==='ClassMethod'&&node.key.name==='call'):[];
    if(methods.length!==1||methods[0].params.map(node=>node.name).join(',')!=='args,util')
        throw Error('procedure constraint installer requires the actual stock call method');
    const body=methods[0].body.body;
    if(body.length!==1||body[0].type!=='IfStatement'||body[0].alternate||
        shape(body[0].test)!==shape(statements('if (!util.stackFrame.executed) {}')[0].test))
        throw Error('stock procedure execution guard differs');
    const sequence=body[0].consequent.body;
    const init=sequence.filter(node=>node.type==='ExpressionStatement'&&isCall(node.expression,'util','initParams'));
    const start=sequence.filter(node=>node.type==='ExpressionStatement'&&isCall(node.expression,'util','startProcedure'));
    const loops=sequence.filter(node=>node.type==='ForStatement');
    if(init.length!==1||start.length!==1||loops.length!==1||init[0].expression.arguments.length||
        shape(start[0])!==shape(statements('util.startProcedure(procedureCode);')[0]))
        throw Error('stock procedure parameter installation shape differs');
    const loop=loops[0];
    const original=statements('for (let i=0;i<paramIds.length;i++){if(Object.prototype.hasOwnProperty.call(args,paramIds[i])){util.pushParam(paramNames[i],args[paramIds[i]]);}else{util.pushParam(paramNames[i],paramDefaults[i]);}}')[0];
    const checked=statements('for (let i=0;i<paramIds.length;i++){if(bwConstraintEntry){util.pushParam(paramNames[i],bwConstraintEntry.values[i]);}else if(Object.prototype.hasOwnProperty.call(args,paramIds[i])){util.pushParam(paramNames[i],args[paramIds[i]]);}else{util.pushParam(paramNames[i],paramDefaults[i]);}}')[0];
    const entries=sequence.filter(node=>node.type==='VariableDeclaration'&&node.declarations.some(declaration=>declaration.id.name==='bwConstraintEntry'));
    if(imports.length) {
        const expectedImport=parse("const bwProcedureEntry = require('../util/bw-procedure-entry');").program.body[0];
        const binds=sequence.filter(node=>shape(node)===shape(statements(expectedBind)[0]));
        if(imports.length!==1||shape(imports[0])!==shape(expectedImport)||entries.length!==1||
            shape(entries[0])!==shape(statements(expectedEntry)[0])||binds.length!==1||shape(loop)!==shape(checked)||
            sequence.indexOf(entries[0])>=sequence.indexOf(init[0])||sequence.indexOf(binds[0])<=sequence.indexOf(loop)||
            sequence.indexOf(binds[0])>=sequence.indexOf(start[0]))
            throw Error('procedure constraint executable hooks incomplete');
        return source;
    }
    if(entries.length||shape(loop)!==shape(original))throw Error('stock procedure loop differs before constraint installation');
    const edits=[
        [0,0,"const bwProcedureEntry = require('../util/bw-procedure-entry');\n"],
        [init[0].start,init[0].start,expectedEntry+'\n            '],
        [loop.start,loop.end,source.slice(loop.start,loop.end).replace('if (Object.prototype.hasOwnProperty.call(args, paramIds[i])) {',
            'if (bwConstraintEntry) {\n                    util.pushParam(paramNames[i], bwConstraintEntry.values[i]);\n                } else if (Object.prototype.hasOwnProperty.call(args, paramIds[i])) {')],
        [start[0].start,start[0].start,expectedBind+'\n            ']
    ];
    for(const[a,b,text]of edits.sort((x,y)=>y[0]-x[0]))source=source.slice(0,a)+text+source.slice(b);
    parse(source);
    return patchProcedureConstraints(source);
}
