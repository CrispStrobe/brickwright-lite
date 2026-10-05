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
        images:images.map(image=>({width:image.width,height:image.height,pixels:Array.from(image.pixels)}))};
};

export const parseNativeTilemaps = (generated, imageOf) => {
    const out = {};
    const pattern = /case\s+"([^"]+)"\s*:\s*return\s+tiles\.createTilemap\(\s*hex`([0-9a-fA-F\s]*)`\s*,\s*img`([\s\S]*?)`\s*,\s*\[([^\]]*)\]\s*,\s*(TileScale\.\w+|[2345])\s*\)/g;
    let match;
    while ((match = pattern.exec(generated))) {
        const [, name, hex, wall, list, scale] = match;
        const imageNodes = list.split(',').map(value => value.trim()).filter(Boolean).map(value => ({type:'Member',name:value.split('.').pop(),object:{type:'Identifier',name:value.split('.').slice(0,-1).join('.')}}));
        const factory = {type:'Call',callee:{type:'Member',name:'createTilemap',object:{type:'Identifier',name:'tiles'}},args:[
            {type:'Template',tag:'hex',value:hex},{type:'Template',tag:'img',value:wall},{type:'Array',items:imageNodes},
            /^\d+$/.test(scale) ? {type:'Number',value:scale} : {type:'Member',object:{type:'Identifier',name:'TileScale'},name:scale.split('.').pop()}]};
        const pathOf = value=>value?.type==='Identifier'?value.name:value?.type==='Member'?`${pathOf(value.object)}.${value.name}`:'';
        const data = decodeTilemap(factory,imageOf,pathOf);
        if (data) out[name] = data;
    }
    return out;
};

export const tilemapSource = data => {
    if (!data || !Number.isInteger(data.columns) || !Number.isInteger(data.rows) || data.columns < 1 || data.rows < 1 || data.columns > 65535 || data.rows > 65535 || data.columns * data.rows > 65536 || ![4,8,16,32].includes(data.tileSize) || !Array.isArray(data.indices) || data.indices.length !== data.columns * data.rows || !Array.isArray(data.walls) || data.walls.length !== data.indices.length || !Array.isArray(data.images) || !data.images.length || data.images.length > 256 || data.indices.some(value=>!Number.isInteger(value)||value<0||value>=data.images.length)) return null;
    const imageSource = image => {
        if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || !Array.isArray(image.pixels) || image.pixels.length !== image.width * image.height || image.pixels.some(value=>!Number.isInteger(value)||value<0||value>15)) return null;
        return 'img`\n' + Array.from({length:image.height},(_,row)=>image.pixels.slice(row*image.width,(row+1)*image.width).map(value=>value?value.toString(16):'.').join(' ')).join('\n')+'\n`';
    };
    const images = data.images.map(imageSource);
    if (images.some(image=>!image)) return null;
    const bytes = [data.columns & 255,data.columns >> 8,data.rows & 255,data.rows >> 8,...data.indices];
    const walls = imageSource({width:data.columns,height:data.rows,pixels:data.walls.map(value=>value?2:0)});
    const scale = {4:'Four',8:'Eight',16:'Sixteen',32:'ThirtyTwo'}[data.tileSize];
    return `tiles.createTilemap(hex\`${bytes.map(value=>value.toString(16).padStart(2,'0')).join('')}\`, ${walls}, [${images.join(', ')}], TileScale.${scale})`;
};
