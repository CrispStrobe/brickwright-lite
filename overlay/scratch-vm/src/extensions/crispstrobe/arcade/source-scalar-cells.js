// Source declarations bind stock variable objects, never their displayed values.
const TYPES = new Set(['Number', 'Boolean', 'String', 'Any']);
const OPCODE = 'arcade_declareSourceScalar';
const REFERENCE = 'arcade_declareSourceReference';

module.exports = function createSourceScalarCells(runtime, values, referenceTypes = null) {
    const declaration = block => block?.opcode===OPCODE || referenceTypes && block?.opcode===REFERENCE;
    let generation = 0;
    let active = false;
    const bindings = new Map();
    const originals = () => runtime.targets.filter(target => target.isOriginal !== false);
    const key = (target, block) => `${target.id}:${block.id}`;
    const resolve = (target, block) => {
        const reporter = target.blocks.getBlock(block.inputs?.VARIABLE?.block);
        if (reporter?.opcode !== 'data_variable') {
            throw new Error('Source scalar requires a connected stock variable reporter');
        }
        const id = reporter.fields?.VARIABLE?.id;
        const type = block.fields?.TYPE?.value;
        if (block.inputs?.TYPE) throw new Error('Source scalar type must be a direct field');
        const reference = block.opcode===REFERENCE;
        const typeInfo = reference ? referenceTypes.resolve(type,
            ['Sprite','Image','number[]','boolean[]','string[]','Sprite[]','Image[]'].includes(type) ? new Map() : referenceTypes.catalogue(originals())) : null;
        if (typeof id !== 'string' || !reference && !TYPES.has(type)) {
            throw new Error('Source scalar requires a variable ID and fixed supported type');
        }
        const variable = target.lookupVariableById(id);
        const owner = originals().find(candidate =>
            Object.hasOwn(candidate.variables || {}, id) && candidate.variables[id] === variable);
        if (!owner || !variable || variable.type !== '' || (owner !== target && !owner.isStage)) {
            throw new Error('Source scalar variable is missing, foreign, or not a scalar');
        }
        return {target, block, id, type, typeInfo, reference, variable, owner};
    };
    const invalidate = () => {
        generation++;
        active = false;
        bindings.clear();
    };
    const initialize = () => {
        invalidate();
        const declarations = [];
        for (const target of originals()) {
            for (const hat of Object.values(target.blocks._blocks)) {
                if (hat.opcode !== 'arcade_whenSourceStarts' || !hat.topLevel) continue;
                let block = target.blocks.getBlock(hat.next);
                const visited = new Set();
                while (declaration(block)) {
                    if (visited.has(block)) throw new Error('Cyclic source scalar declaration sequence');
                    visited.add(block);
                    declarations.push(resolve(target, block));
                    block = target.blocks.getBlock(block.next);
                }
            }
        }
        const registered = new Set(declarations.map(binding => binding.block));
        const variables = new Set();
        for (const target of originals()) {
            for (const block of Object.values(target.blocks._blocks)) {
                if (declaration(block) && !registered.has(block)) {
                    throw new Error('Source scalar declarations must precede source initializers');
                }
            }
        }
        for (const binding of declarations) {
            if (variables.has(binding.variable)) throw new Error('Duplicate source scalar declaration');
            variables.add(binding.variable);
        }
        // Commit only after the complete source prelude has passed validation.
        for (const binding of declarations) {
            binding.variable.value = values.encode(undefined);
            bindings.set(key(binding.target, binding.block), {...binding, generation});
        }
        active = true;
    };
    const validateDeclaration = (_args, util) => {
        const target = util?.target;
        const block = target?.blocks.getBlock(util.thread.peekStack());
        const binding = block && bindings.get(key(target, block));
        if (!active || !runtime.targets.includes(target) || !binding ||
            binding.generation !== generation || binding.block !== block) {
            throw new Error('Source scalar declaration has no current prelude binding');
        }
        const current = resolve(target, block);
        if (current.variable !== binding.variable || current.owner !== binding.owner ||
            current.id !== binding.id || current.type !== binding.type || current.reference!==binding.reference ||
            binding.reference && !referenceTypes.same(current.typeInfo,binding.typeInfo)) {
            throw new Error('Source scalar declaration changed after prelude');
        }
        // Executing the portable command never resets an authored assignment.
    };
    const typeOf = (target, id) => {
        if (!active || !runtime.targets.includes(target)) return undefined;
        const variable = target.lookupVariableById(id);
        for (const binding of bindings.values()) {
            if (binding.variable === variable && !binding.reference) return binding.type;
        }
        return undefined;
    };
    const declare = (args,util) => {
        const block=util?.target?.blocks.getBlock(util.thread.peekStack());
        if(block?.opcode!==OPCODE)throw Error('Source scalar declaration needs its current command');
        return validateDeclaration(args,util);
    };
    const declareReference = (args,util) => {
        const block=util?.target?.blocks.getBlock(util.thread.peekStack());
        if(block?.opcode!==REFERENCE)throw Error('Source reference declaration needs its current command');
        return validateDeclaration(args,util);
    };
    return {initialize, invalidate, declare, declareReference, typeOf, dispose: invalidate};
};
