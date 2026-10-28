import {parseMakeCodeTs} from './ts-import.js';

// Decode the factory representation without dropping the wall layer or scale.
export const decodeTilemap = (node, imageOf, pathOf) => {
    if (node?.type !== 'Call' || pathOf(node.callee) !== 'tiles.createTilemap' || node.args.length !== 4) return null;
    const [buffer, wallNode, tileNodes, scaleNode] = node.args;
    if (buffer?.type !== 'Template' || buffer.tag !== 'hex' || tileNodes?.type !== 'Array') return null;
    const hex = buffer.value.replace(/\s/g, '');
    if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
    const bytes = (hex.match(/../g) || []).map(value => parseInt(value, 16));
    const columns = bytes[0] | bytes[1] << 8, rows = bytes[2] | bytes[3] << 8;
    if (!columns || !rows || columns * rows > 65536 || bytes.length !== 4 + columns * rows) return null;
    const walls = imageOf(wallNode);
    const images = tileNodes.items.map(imageOf);
    const scale = {'TileScale.Four':4,'TileScale.Eight':8,'TileScale.Sixteen':16,'TileScale.ThirtyTwo':32}[pathOf(scaleNode)] ||
        (scaleNode?.type === 'Number' && [2,3,4,5].includes(Number(scaleNode.value)) ? 1 << Number(scaleNode.value) : 0);
    if (!scale || !walls || walls.width !== columns || walls.height !== rows || !images.length || images.some(image => !image) || bytes.slice(4).some(index => index >= images.length)) return null;
    return {columns, rows, tileSize:scale, indices:bytes.slice(4), walls:Array.from(walls.pixels, pixel => pixel === 2 ? 1 : 0),
        images:images.map(image=>({width:image.width,height:image.height,pixels:Array.from(image.pixels),
            ...(image.tileId ? {tileId: image.tileId, displayName: image.displayName || image.tileId.split('.').pop()} : {})}))};
};

const nativeFactoryRegistries = new WeakMap();
const nodePath = node => node?.type === 'Identifier' ? node.name : node?.type === 'Member' ? `${nodePath(node.object)}.${node.name}` : '';
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Decode only the generated, unconditional switch factory form. In particular,
// an unrecognized return is not evidence that a missing name returns null.
export const parseNativeTilemapFactories = (generated, imageOf) => {
    const factories = [], unsupported = [];
    let ast;
    try { ast = parseMakeCodeTs(generated); } catch (error) {
        return {factories, unsupported: [`generated asset factory source could not be parsed: ${error.message}`]};
    }
    const passiveValue = node => !node || ['Null','Undefined','Boolean','Number','String','Identifier','Member'].includes(node.type) ||
        (node.type === 'Template' && ['img','hex'].includes(node.tag) && !node.value.includes('${')) ||
        (node.type === 'Array' && node.items.every(passiveValue)) ||
        (node.type === 'Call' && nodePath(node.callee) === 'image.ofBuffer' && node.args.length === 1 &&
            node.args[0]?.type === 'Template' && node.args[0].tag === 'hex' && passiveValue(node.args[0]));
    const passiveFactoryBody = (body, parameter) => body.every(statement => statement.type === 'Break' ||
        (statement.type === 'Return' && passiveValue(statement.value)) ||
        (statement.type === 'Switch' && ((statement.discriminant?.type === 'Identifier' && statement.discriminant.name === parameter) || (statement.discriminant?.type === 'Call' && nodePath(statement.discriminant.callee) === 'helpers.stringTrim' && statement.discriminant.args.length === 1 && statement.discriminant.args[0]?.type === 'Identifier' && statement.discriminant.args[0].name === parameter)) && statement.cases.every(c => (!c.test || c.test.type === 'String') && passiveFactoryBody(c.body, parameter))));
    const accept = (call, unconditional) => {
        const deprecated = nodePath(call.callee) === 'helpers.registerTilemapFactory';
        const kind = deprecated ? {type:'String',value:'tilemap'} : call.args[0];
        if (!unconditional || kind?.type !== 'String' || call.args.length !== (deprecated ? 1 : 2)) {
            unsupported.push('tilemap factory registration must have an unconditional literal kind and callback'); return;
        }
        const callback = call.args[deprecated ? 0 : 1], parameter = callback?.params?.[0];
        if(kind.value !== 'tilemap') {
            if(callback?.type !== 'FunctionExpression' || callback.params.length !== 1 || !passiveFactoryBody(callback.body, parameter))
                unsupported.push('generated non-tilemap factory has dynamic effects; tilemap registry absence cannot be certified');
            return;
        }
        if (callback?.type !== 'FunctionExpression' || callback.params.length !== 1 || callback.body.length < 1 || callback.body.length > 2) {
            unsupported.push('tilemap factory requires a generated single-parameter switch callback'); return;
        }
        const sw = callback.body[0], tail = callback.body[1];
        const trimmed = sw?.discriminant?.type === 'Call' && nodePath(sw.discriminant.callee) === 'helpers.stringTrim' &&
            sw.discriminant.args.length === 1 && sw.discriminant.args[0]?.type === 'Identifier' && sw.discriminant.args[0].name === parameter;
        if (sw?.type !== 'Switch' || (!trimmed && !(sw.discriminant?.type === 'Identifier' && sw.discriminant.name === parameter)) ||
            (tail && !(tail.type === 'Return' && (!tail.value || ['Null','Undefined'].includes(tail.value.type))))) {
            unsupported.push('tilemap factory requires a literal-name switch without dynamic effects'); return;
        }
        let valid = true;
        const cases = sw.cases.map(c => {
            if (c.test && c.test.type !== 'String') valid = false;
            if (c.body.length > 1) valid = false;
            const statement = c.body[0];
            let value;
            if (!statement || statement.type === 'Break') value = undefined;
            else if (statement.type === 'Return' && (!statement.value || ['Null','Undefined'].includes(statement.value.type))) value = null;
            else if (statement.type === 'Return') {
                value = decodeTilemap(statement.value, imageOf, nodePath);
                if (!value) valid = false;
            } else valid = false;
            return {name:c.test?.value ?? null, empty:!statement, value};
        });
        if (!valid || cases.filter(c => c.name === null).length > 1) {
            unsupported.push('tilemap factory requires a readable literal tile map; dynamic cases and side effects are unsupported'); return;
        }
        factories.push({names:cases.filter(c => c.name !== null).map(c => c.name), lookup(name) {
            const key = trimmed ? name.trim() : name;
            let i = cases.findIndex(c => c.name === key);
            if (i < 0) i = cases.findIndex(c => c.name === null);
            if (i < 0) return null;
            while (cases[i]?.empty) i++;
            return cases[i]?.value || null;
        }});
    };
    const walk = (node, unconditional = false) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Program' || node.type === 'Namespace') { for (const item of node.body) walk(item, unconditional || node.type === 'Program'); return; }
        if (node.type === 'Declaration' && unconditional) {
            if((node.decls || []).some(declaration => !passiveValue(declaration.init)))
                unsupported.push('generated asset declaration has dynamic effects; tilemap registry absence cannot be certified');
            return;
        }
        if (node.type === 'ExpressionStatement') {
            if(unconditional && !(node.expr?.type === 'Call' && ['helpers._registerFactory','helpers.registerTilemapFactory'].includes(nodePath(node.expr.callee))))
                unsupported.push('generated asset source has an unsupported top-level effect');
            walk(node.expr, unconditional); return;
        }
        if (node.type === 'Call' && ['helpers._registerFactory','helpers.registerTilemapFactory'].includes(nodePath(node.callee))) {
            accept(node, unconditional); return;
        }
        if(unconditional)unsupported.push(`generated asset source contains an unsupported top-level ${node.type}`);
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child => walk(child, false));
            else if (value && typeof value === 'object') walk(value, false);
        }
    };
    walk(ast);
    return {factories, unsupported};
};

/** Original helpers._getFactoryInstance tries registered factories in order,
 * accepting the first truthy result, and returns null after all misses. */
export const createNativeTilemapRegistry = (files, imageOf, {fileOrder = Object.keys(files || {})} = {}) => {
    const out = Object.create(null), factories = [], unsupported = [];
    for (const filename of [...new Set([...fileOrder,...Object.keys(files || {})])]) {
        if (!/\.g\.ts$/.test(filename) || typeof files[filename] !== 'string') continue;
        const parsed = parseNativeTilemapFactories(files[filename], imageOf);
        factories.push(...parsed.factories);
        unsupported.push(...parsed.unsupported.map(message => `${filename}: ${message}`));
    }
    const lookup = name => {
        if (unsupported.length) return {value:undefined, unsupported:[...unsupported]};
        for (const factory of factories) { const value = factory.lookup(name); if (value) return {value,unsupported:[]}; }
        return {value:null,unsupported:[]};
    };
    for (const name of new Set(factories.flatMap(factory => factory.names))) {
        const result = lookup(name);
        if (result.value) out[name] = result.value;
    }
    nativeFactoryRegistries.set(out, {lookup});
    return out;
};
export const resolveNativeTilemap = (registry, name) => nativeFactoryRegistries.get(registry)?.lookup(name) ||
    (own(registry || {}, name) ? {value:registry[name],unsupported:[]} : {value:undefined,unsupported:['tilemap factory absence has not been validated']});
export const parseNativeTilemaps = (generated, imageOf) => createNativeTilemapRegistry({'tilemap.g.ts':generated}, imageOf);

export const tilemapSource = (data, tileReference = null) => {
    if (!data || !Number.isInteger(data.columns) || !Number.isInteger(data.rows) || data.columns < 1 || data.rows < 1 || data.columns > 65535 || data.rows > 65535 || data.columns * data.rows > 65536 || ![4,8,16,32].includes(data.tileSize) || !Array.isArray(data.indices) || data.indices.length !== data.columns * data.rows || !Array.isArray(data.walls) || data.walls.length !== data.indices.length || !Array.isArray(data.images) || !data.images.length || data.images.length > 256 || data.indices.some(value=>!Number.isInteger(value)||value<0||value>=data.images.length)) return null;
    const imageSource = image => {
        if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || !Array.isArray(image.pixels) || image.pixels.length !== image.width * image.height || image.pixels.some(value=>!Number.isInteger(value)||value<0||value>15)) return null;
        return 'img`\n' + Array.from({length:image.height},(_,row)=>image.pixels.slice(row*image.width,(row+1)*image.width).map(value=>value?value.toString(16):'.').join(' ')).join('\n')+'\n`';
    };
    const images = data.images.map((image, index) => imageSource(image) && (tileReference ? tileReference(image, index) : imageSource(image)));
    if (images.some(image=>!image)) return null;
    const bytes = [data.columns & 255,data.columns >> 8,data.rows & 255,data.rows >> 8,...data.indices];
    const walls = imageSource({width:data.columns,height:data.rows,pixels:data.walls.map(value=>value?2:0)});
    const scale = {4:'Four',8:'Eight',16:'Sixteen',32:'ThirtyTwo'}[data.tileSize];
    return `tiles.createTilemap(hex\`${bytes.map(value=>value.toString(16).padStart(2,'0')).join('')}\`, ${walls}, [${images.join(', ')}], TileScale.${scale})`;
};
