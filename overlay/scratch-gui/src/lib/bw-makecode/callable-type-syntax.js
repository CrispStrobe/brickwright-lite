// A bounded callable signature grammar. Unknown type syntax stays unsupported.
// Names are resolved through the owner's lexical namespace graph.
export function parseCallableType(text) {
    if (typeof text !== 'string') return null;
    const tokens = text.match(/=>|[A-Za-z_]\w*|\S/g) || [];
    let position = 0;
    const peek = value => tokens[position] === value;
    const take = value => peek(value) && (++position, true);
    const identifier = () => {
        if (!/^[A-Za-z_]\w*$/.test(tokens[position] || '')) throw new Error('Expected callable type name');
        return tokens[position++];
    };
    const type = () => {
        let result;
        if (take('(')) {
            const saved = position;
            try {
                const parameters = [];
                if (!peek(')')) do {
                    const name = identifier(), optional = take('?');
                    if (!take(':')) throw new Error('Callable signature requires typed parameters');
                    parameters.push({name, optional, type:type()});
                } while (take(','));
                if (!take(')') || !take('=>')) throw new Error('Expected callable arrow');
                if (new Set(parameters.map(param => param.name)).size !== parameters.length)
                    throw new Error('Duplicate callable signature parameters');
                let optionalSeen = false;
                for (const param of parameters) {
                    if (optionalSeen && !param.optional) throw new Error('Required callable parameter after optional parameter');
                    optionalSeen ||= param.optional;
                }
                result = {kind:'callable', parameters, result:type()};
            } catch (error) {
                position = saved;
                result = type();
                if (!take(')')) throw error;
            }
        } else {
            let name = identifier();
            while (take('.')) name += '.' + identifier();
            result = {kind:'named', name};
        }
        while (take('[')) {
            if (!take(']')) throw new Error('Expected callable array suffix');
            result = {kind:'array', element:result};
        }
        return result;
    };
    try {
        const result = type();
        if (position !== tokens.length) return null;
        return result;
    } catch { return null; }
}

export function mapCallableType(type, resolveName) {
    if (type.kind === 'sdk') return {...type};
    if (type.kind === 'named') return {...type, name:resolveName(type.name)};
    if (type.kind === 'array') return {...type, element:mapCallableType(type.element,resolveName)};
    return {...type, parameters:type.parameters.map(param => ({...param,type:mapCallableType(param.type,resolveName)})),
        result:mapCallableType(type.result,resolveName)};
}

export function renderCallableType(type) {
    if (type.kind === 'sdk') {if(type.name!=='Image'||Reflect.ownKeys(type).length!==2)throw Error('Unqualified SDK callable type');return 'Image';}
    if (type.kind === 'named') return type.name;
    if (type.kind === 'array') return (type.element.kind === 'callable' ? '('+renderCallableType(type.element)+')' : renderCallableType(type.element))+'[]';
    return '('+type.parameters.map(param => param.name+(param.optional?'?':'')+': '+renderCallableType(param.type)).join(', ')+') => '+renderCallableType(type.result);
}
