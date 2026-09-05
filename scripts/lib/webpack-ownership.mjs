const stripLoaders = name => String(name || '').split('!').at(-1).split('?')[0].replace(/\\/g, '/');

const packageOwner = name => {
    const normalized = stripLoaders(name);
    const marker = '/node_modules/';
    const at = normalized.lastIndexOf(marker);
    if (at >= 0) {
        const parts = normalized.slice(at + marker.length).split('/');
        return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    }
    const src = normalized.match(/(?:^|\/)src\/(lib\/[^/]+|components\/[^/]+|containers|reducers|playground)(?:\/|$)/);
    return src ? `app:${src[1]}` : 'app:other';
};

const moduleLeaves = (modules, inheritedChunks = []) => (modules || []).flatMap(module => {
    const chunks = module.chunks?.length ? module.chunks : inheritedChunks;
    return module.modules?.length ? moduleLeaves(module.modules, chunks) : [{...module, chunks}];
});

const forbiddenReason = name => {
    const normalized = stripLoaders(name);
    if (/(?:^|\/)(?:avr8js|emu8051|rp2040js|bbc-z80|z80|mos6502|m6502|arm-thumb|riscv|labwired)(?:[-./]|$)/i
        .test(normalized)) return 'unrelated-cpu-family';
    if (/\/bw-board\/(?:index|devices|boards)\.js$/i.test(normalized) ||
        /\/bw-board\/devices\//i.test(normalized)) return 'broad-board-or-device-registry';
    if (/\/bw-board\/(?:analog|circuit|netlist|solver|spice)(?:[-./]|$)/i.test(normalized)) return 'solver';
    return null;
};

const sumOwners = modules => {
    const owners = new Map();
    for (const module of modules) {
        const owner = packageOwner(module.name || module.identifier);
        owners.set(owner, (owners.get(owner) || 0) + (Number(module.size) || 0));
    }
    return [...owners].map(([owner, bytes]) => ({owner, bytes}))
        .sort((a, b) => b.bytes - a.bytes || a.owner.localeCompare(b.owner));
};

export const summarizeWebpackOwnership = input => {
    const stats = input.children?.length === 1 ? input.children[0] : input;
    const chunks = stats.chunks || [];
    const assets = stats.assets || [];
    const modules = moduleLeaves(stats.modules);
    const initialIds = new Set(chunks.filter(chunk => chunk.initial).map(chunk => String(chunk.id)));
    const initialModules = modules.filter(module =>
        (module.chunks || []).some(id => initialIds.has(String(id))));
    const initialAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => initialIds.has(String(id))));
    const dosChunks = chunks.filter(chunk => (chunk.names || []).includes('bw-debug-i8086'));
    const dosIds = new Set(dosChunks.map(chunk => String(chunk.id)));
    const dosModules = modules.filter(module => (module.chunks || []).some(id => dosIds.has(String(id))));
    const dosAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => dosIds.has(String(id))));
    const forbiddenModules = dosModules.map(module => ({
        name: stripLoaders(module.name || module.identifier),
        reason: forbiddenReason(module.name || module.identifier)
    })).filter(module => module.reason);

    return {
        schema: 'brickwright/webpack-ownership/v1',
        hash: stats.hash || null,
        initial: {
            bytes: initialAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0),
            assets: initialAssets.map(asset => ({name: asset.name, bytes: Number(asset.size) || 0}))
                .sort((a, b) => b.bytes - a.bytes),
            owners: sumOwners(initialModules)
        },
        largestJavaScriptAssets: assets.filter(asset => /\.js$/.test(asset.name))
            .map(asset => ({name: asset.name, bytes: Number(asset.size) || 0}))
            .sort((a, b) => b.bytes - a.bytes).slice(0, 20),
        dosChunk: {
            found: dosChunks.length > 0,
            initial: dosChunks.some(chunk => chunk.initial),
            files: [...new Set(dosAssets.map(asset => asset.name))].sort(),
            bytes: dosAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0),
            owners: sumOwners(dosModules),
            forbiddenModules
        }
    };
};

export const assertDosChunkBoundary = report => {
    const failures = [];
    if (!report.dosChunk.found) failures.push('the bw-debug-i8086 chunk is missing');
    if (report.dosChunk.initial) failures.push('bw-debug-i8086 became an initial chunk');
    if (report.dosChunk.forbiddenModules.length) {
        failures.push(`bw-debug-i8086 contains unrelated modules: ${report.dosChunk.forbiddenModules
            .map(module => `${module.reason}: ${module.name}`).join(', ')}`);
    }
    return failures;
};
