const stripLoaders = name => String(name || '').split('!').at(-1).split('?')[0].replace(/\\/g, '/');
const normalizeAsset = name => String(name || '').split(/[?#]/, 1)[0].replace(/\\/g, '/').replace(/^\.\//, '');
const suffixMatch = (left, right) => {
    const a = normalizeAsset(left);
    const b = normalizeAsset(right);
    return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
};
const compilationStats = input => {
    if (input?.assets?.length && input?.chunks?.length) return input;
    return (input?.children || []).find(child => child.assets?.length && child.chunks?.length) || input;
};
const moduleLeaves = (modules, inheritedChunks = []) => (modules || []).flatMap(module => {
    const chunks = module.chunks?.length ? module.chunks : inheritedChunks;
    return module.modules?.length ? moduleLeaves(module.modules, chunks) : [{...module, chunks}];
});
const compilationModules = stats => stats.modules?.length ? moduleLeaves(stats.modules) :
    (stats.chunks || []).flatMap(chunk => moduleLeaves(chunk.modules, [chunk.id]));
const positiveSize = (value, label) => {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) throw new Error(`${label} has invalid size ${String(value)}`);
    return size;
};
const uniqueMatch = (items, name, label) => {
    const matches = items.filter(item => suffixMatch(item.name, name));
    if (matches.length !== 1) throw new Error(`${label} ${name} matched ${matches.length} assets`);
    return matches[0];
};

export const attributePseudocodeImporter = input => {
    const stats = compilationStats(input);
    if (!stats || typeof stats !== 'object') throw new Error('webpack stats are missing');
    if (typeof stats.hash !== 'string' || !stats.hash) throw new Error('webpack hash is missing');
    const group = stats.namedChunkGroups?.['pseudocode-importer'];
    if (!group) throw new Error('named chunk group pseudocode-importer is missing');
    const groupIds = (group.chunks || []).map(String);
    if (!groupIds.length || new Set(groupIds).size !== groupIds.length) {
        throw new Error('pseudocode-importer has missing or duplicate chunk ids');
    }
    const chunks = stats.chunks || [];
    const chunkMatches = groupIds.map(id => {
        const matches = chunks.filter(chunk => String(chunk.id) === id);
        if (matches.length !== 1) throw new Error(`pseudocode-importer chunk ${id} matched ${matches.length} chunks`);
        if (matches[0].initial) throw new Error(`pseudocode-importer chunk ${id} is initial`);
        return matches[0];
    });
    const groupAssetEntries = (group.assets || []).map(asset =>
        typeof asset === 'string' ? {name: asset, size: undefined} : asset);
    const groupJavaScript = groupAssetEntries.filter(asset => /\.js(?:[?#]|$)/.test(asset.name || ''));
    if (!groupJavaScript.length || new Set(groupJavaScript.map(asset => normalizeAsset(asset.name))).size !==
        groupJavaScript.length) throw new Error('pseudocode-importer group has missing or duplicate JavaScript assets');
    const compilationJavaScript = (stats.assets || []).filter(asset => /\.js(?:[?#]|$)/.test(asset.name || ''));
    const expected = compilationJavaScript.filter(asset => (asset.chunks || []).some(id => groupIds.includes(String(id))));
    if (!expected.length) throw new Error('pseudocode-importer chunks own no JavaScript assets');
    const emittedAssets = groupJavaScript.map(listed => {
        const actual = uniqueMatch(expected, listed.name, 'pseudocode-importer group asset');
        const bytes = positiveSize(actual.size, `pseudocode-importer asset ${actual.name}`);
        if (listed.size !== undefined && Number(listed.size) !== bytes) {
            throw new Error(`pseudocode-importer asset ${listed.name} has mismatched size`);
        }
        return {name: normalizeAsset(actual.name), bytes};
    });
    for (const asset of expected) uniqueMatch(groupJavaScript, asset.name, 'pseudocode-importer compilation asset');
    for (const chunk of chunkMatches) {
        const files = (chunk.files || []).filter(file => /\.js(?:[?#]|$)/.test(file));
        if (!files.length) throw new Error(`pseudocode-importer chunk ${chunk.id} emits no JavaScript file`);
        for (const file of files) uniqueMatch(emittedAssets.map(asset => ({name: asset.name})), file,
            `pseudocode-importer chunk ${chunk.id} file`);
    }
    const modules = compilationModules(stats).filter(module =>
        (module.chunks || []).some(id => groupIds.includes(String(id))));
    const importerModules = modules.filter(module =>
        /(?:^|\/)src\/components\/tw-pseudocode\/pseudocode-importer\.jsx$/.test(
            stripLoaders(module.name || module.identifier)));
    if (importerModules.length !== 1) {
        throw new Error(`expected one pseudocode-importer source module, found ${importerModules.length}`);
    }
    const initialIds = new Set(chunks.filter(chunk => chunk.initial).map(chunk => String(chunk.id)));
    if ((importerModules[0].chunks || []).some(id => initialIds.has(String(id)))) {
        throw new Error('pseudocode-importer source module remains initial');
    }
    const sourceModules = modules.map(module => ({
        name: stripLoaders(module.name || module.identifier),
        bytes: positiveSize(module.size, `pseudocode-importer module ${module.name || module.identifier}`)
    })).sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
    const initialAssets = compilationJavaScript.filter(asset =>
        (asset.chunks || []).some(id => initialIds.has(String(id))));
    const initialBytes = initialAssets.reduce((sum, asset) =>
        sum + positiveSize(asset.size, `initial asset ${asset.name}`), 0);
    return {
        webpackHash: stats.hash,
        chunks: chunkMatches.map(chunk => ({id: chunk.id, names: (chunk.names || []).slice(), initial: false})),
        assets: emittedAssets.sort((a, b) => a.name.localeCompare(b.name)),
        emittedBytes: emittedAssets.reduce((sum, asset) => sum + asset.bytes, 0),
        sourceModules,
        sourceBytes: sourceModules.reduce((sum, module) => sum + module.bytes, 0),
        initialBytes
    };
};

export const P21_EMITTED_FLOOR_BYTES = 75 * 1024;
