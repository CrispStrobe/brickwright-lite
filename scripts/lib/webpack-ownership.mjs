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

const compilationStats = input => {
    if (input.assets?.length && input.chunks?.length) return input;
    return (input.children || []).find(child => child.assets?.length && child.chunks?.length) || input;
};

const compilationModules = stats => stats.modules?.length ? moduleLeaves(stats.modules) :
    (stats.chunks || []).flatMap(chunk => moduleLeaves(chunk.modules, [chunk.id]));

const isOptionalCodeMirrorGrammar = name =>
    /\/node_modules\/(?:@codemirror\/lang-(?:cpp|python|javascript)|@lezer\/(?:cpp|python|javascript))\//
        .test(stripLoaders(name));

const isLazyPaintEditorModule = name => {
    const normalized = stripLoaders(name);
    return /\/node_modules\/(?:scratch-paint|@scratch\/paper)\//.test(normalized);
};

const svgSanitizerModuleKind = name => {
    const normalized = stripLoaders(name);
    if (/\/scratch-svg-renderer\/src\/index\.js$/.test(normalized)) return 'rendererIndex';
    if (/\/scratch-svg-renderer\/src\/sanitize-svg\.js$/.test(normalized)) return 'sanitizeSvg';
    if (/\/node_modules\/css-tree\//.test(normalized)) return 'cssTree';
    if (/\/node_modules\/mdn-data\//.test(normalized)) return 'mdnData';
    return null;
};

export const forbiddenDosModuleReason = name => {
    const normalized = stripLoaders(name);
    if (/(?:^|\/)(?:avr8js|avr-chips|emu8051|rp2040js?|bbc-z80|z80|mos6502|m6502|w65c02|stm32|arm-thumb|riscv|labwired)(?:[-./]|$)/i
        .test(normalized)) return 'unrelated-cpu-family';
    if (/\/bw-board\/(?:index|devices|boards|register-all|stimulus-catalogue)\.js$/i.test(normalized) ||
        /\/bw-board\/devices\//i.test(normalized)) return 'broad-board-or-device-registry';
    if (/\/bw-board\/(?:mna|ac|sweep|analog|circuit|netlist|solver|spice)(?:[-./]|$)/i.test(normalized)) return 'solver';
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
    const stats = compilationStats(input);
    const chunks = stats.chunks || [];
    const assets = stats.assets || [];
    const modules = compilationModules(stats);
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
        reason: forbiddenDosModuleReason(module.name || module.identifier)
    })).filter(module => module.reason);
    const optionalGrammarModules = modules.filter(module =>
        isOptionalCodeMirrorGrammar(module.name || module.identifier));
    const optionalGrammarIds = new Set(optionalGrammarModules.flatMap(module => module.chunks || [])
        .map(id => String(id)));
    const optionalGrammarChunks = chunks.filter(chunk => optionalGrammarIds.has(String(chunk.id)));
    const optionalGrammarAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => optionalGrammarIds.has(String(id))));
    const lazyPaintModules = modules.filter(module => isLazyPaintEditorModule(module.name || module.identifier));
    const lazyPaintIds = new Set(lazyPaintModules.flatMap(module => module.chunks || []).map(id => String(id)));
    const lazyPaintChunks = chunks.filter(chunk => lazyPaintIds.has(String(chunk.id)));
    const lazyPaintAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => lazyPaintIds.has(String(id))));
    const svgSanitizerModules = modules.map(module => ({
        module,
        kind: svgSanitizerModuleKind(module.name || module.identifier)
    })).filter(entry => entry.kind);
    const svgSanitizerNamedChunks = chunks.filter(chunk => (chunk.names || []).includes('svg-sanitizer'));
    const svgSanitizerNamedIds = new Set(svgSanitizerNamedChunks.map(chunk => String(chunk.id)));
    // Webpack's default async splitChunks puts large vendor dependencies in
    // anonymous sibling chunks in the same chunk group. Those siblings are
    // fetched by the named import and are part of its causal boundary.
    const svgSanitizerDemandIds = new Set(svgSanitizerNamedChunks.flatMap(chunk =>
        [chunk.id, ...(chunk.siblings || [])]).map(id => String(id)));
    const svgSanitizerNamedAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => svgSanitizerNamedIds.has(String(id))));
    const svgSanitizerNamedModules = modules.filter(module =>
        (module.chunks || []).some(id => svgSanitizerNamedIds.has(String(id))));
    const summarizeSvgKind = kind => {
        const kindModules = svgSanitizerModules.filter(entry => entry.kind === kind).map(entry => entry.module);
        const kindIds = new Set(kindModules.flatMap(module => module.chunks || []).map(id => String(id)));
        return {
            found: kindModules.length > 0,
            sourceBytes: kindModules.reduce((sum, module) => sum + (Number(module.size) || 0), 0),
            initial: kindModules.some(module => (module.chunks || []).some(id => initialIds.has(String(id)))),
            demandChunkOwned: kindModules.length > 0 && kindModules.every(module =>
                (module.chunks || []).some(id => svgSanitizerDemandIds.has(String(id)))),
            files: [...new Set(assets.filter(asset => /\.js$/.test(asset.name) &&
                (asset.chunks || []).some(id => kindIds.has(String(id)))).map(asset => asset.name))].sort()
        };
    };
    const svgCssModules = svgSanitizerModules.filter(entry =>
        entry.kind === 'cssTree' || entry.kind === 'mdnData').map(entry => entry.module);
    const svgCssIds = new Set(svgCssModules.flatMap(module => module.chunks || []).map(id => String(id)));
    const svgCssAssets = assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => svgCssIds.has(String(id))));
    const namedPaintStage = name => {
        const stageChunks = chunks.filter(chunk => (chunk.names || []).includes(name));
        const stageIds = new Set(stageChunks.map(chunk => String(chunk.id)));
        const stageAssets = assets.filter(asset =>
            /\.js$/.test(asset.name) && (asset.chunks || []).some(id => stageIds.has(String(id))));
        return {
            found: stageChunks.length > 0,
            initial: stageChunks.some(chunk => chunk.initial),
            files: [...new Set(stageAssets.map(asset => asset.name))].sort()
        };
    };

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
        },
        optionalCodeMirrorGrammars: {
            packages: [...new Set(optionalGrammarModules.map(module =>
                packageOwner(module.name || module.identifier)))].sort(),
            sourceBytes: optionalGrammarModules.reduce((sum, module) => sum + (Number(module.size) || 0), 0),
            initial: optionalGrammarChunks.some(chunk => chunk.initial),
            files: [...new Set(optionalGrammarAssets.map(asset => asset.name))].sort(),
            emittedBytes: optionalGrammarAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0)
        },
        lazyPaintEditor: {
            packages: [...new Set(lazyPaintModules.map(module =>
                packageOwner(module.name || module.identifier)))].sort(),
            sourceBytes: lazyPaintModules.reduce((sum, module) => sum + (Number(module.size) || 0), 0),
            initial: lazyPaintChunks.some(chunk => chunk.initial),
            files: [...new Set(lazyPaintAssets.map(asset => asset.name))].sort(),
            emittedBytes: lazyPaintAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0)
        },
        lazyPaintActivation: {
            reducer: namedPaintStage('paint-reducer'),
            editor: namedPaintStage('paint-editor')
        },
        lazySvgSanitizer: {
            namedChunk: {
                found: svgSanitizerNamedChunks.length > 0,
                initial: svgSanitizerNamedChunks.some(chunk => chunk.initial),
                files: [...new Set(svgSanitizerNamedAssets.map(asset => asset.name))].sort(),
                emittedBytes: svgSanitizerNamedAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0),
                modules: svgSanitizerNamedModules.map(module =>
                    stripLoaders(module.name || module.identifier)).sort(),
                ownsSanitizerEntry: svgSanitizerNamedModules.some(module =>
                    /\/(?:lazy-)?svg-sanitizer(?:\.[cm]?[jt]sx?)?$|\/scratch-svg-renderer\/src\/sanitize-svg\.js$/
                        .test(stripLoaders(module.name || module.identifier)))
            },
            rendererIndex: summarizeSvgKind('rendererIndex'),
            sanitizeSvg: summarizeSvgKind('sanitizeSvg'),
            cssTree: summarizeSvgKind('cssTree'),
            mdnData: summarizeSvgKind('mdnData'),
            cssPayload: {
                sourceBytes: svgCssModules.reduce((sum, module) => sum + (Number(module.size) || 0), 0),
                files: [...new Set(svgCssAssets.map(asset => asset.name))].sort(),
                emittedBytes: svgCssAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0)
            }
        }
    };
};

export const auditWebpackResourceWindow = (input, resources, {from, to, origin}) => {
    const stats = compilationStats(input);
    const assets = (stats.assets || []).filter(asset => /\.js$/.test(asset.name));
    const modules = compilationModules(stats);
    const scripts = (resources || []).filter(resource => resource.kind === 'script' &&
        resource.at >= from && resource.at < to && (!origin || resource.name.startsWith(origin)));
    const matched = [];
    const unmatchedAssets = [];
    const chunkIds = new Set();
    for (const resource of scripts) {
        const pathname = decodeURIComponent(new URL(resource.name).pathname).replace(/^\//, '');
        const asset = assets.find(candidate => pathname === candidate.name || pathname.endsWith(`/${candidate.name}`));
        if (!asset) unmatchedAssets.push(pathname);
        else {
            matched.push(asset.name);
            for (const id of asset.chunks || []) chunkIds.add(String(id));
        }
    }
    const fetchedModules = modules.filter(module =>
        (module.chunks || []).some(id => chunkIds.has(String(id))));
    const forbiddenModules = fetchedModules.map(module => ({
        name: stripLoaders(module.name || module.identifier),
        reason: forbiddenDosModuleReason(module.name || module.identifier)
    })).filter(module => module.reason);
    const bytes = field => scripts.reduce((sum, resource) => sum + (Number(resource[field]) || 0), 0);
    return {
        from, to,
        scripts: scripts.length,
        transferBytes: bytes('transferSize'),
        encodedBodyBytes: bytes('encodedBodySize'),
        decodedBodyBytes: bytes('decodedBodySize'),
        assets: [...new Set(matched)].sort(),
        unmatchedAssets: [...new Set(unmatchedAssets)].sort(),
        owners: sumOwners(fetchedModules),
        forbiddenModules
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

export const assertOptionalCodeMirrorGrammarBoundary = report => {
    const grammar = report.optionalCodeMirrorGrammars;
    const failures = [];
    const expected = ['@codemirror/lang-cpp', '@codemirror/lang-javascript', '@codemirror/lang-python'];
    const missing = expected.filter(owner => !grammar.packages.includes(owner));
    if (missing.length) failures.push(`optional CodeMirror grammar packages are missing: ${missing.join(', ')}`);
    if (grammar.initial) failures.push('an optional CodeMirror grammar became initial JavaScript');
    if (grammar.sourceBytes < 250 * 1024) {
        failures.push(`optional CodeMirror grammar ownership fell below 250 KiB: ${grammar.sourceBytes} bytes`);
    }
    if (grammar.emittedBytes < 100 * 1024) {
        failures.push(`optional CodeMirror grammar assets fell below 100 KiB: ${grammar.emittedBytes} bytes`);
    }
    return failures;
};

export const assertLazyPaintEditorBoundary = report => {
    const paint = report.lazyPaintEditor;
    const failures = [];
    const expected = ['@scratch/paper', 'scratch-paint'];
    const missing = expected.filter(owner => !paint.packages.includes(owner));
    if (missing.length) failures.push(`lazy paint packages are missing: ${missing.join(', ')}`);
    if (paint.initial) failures.push('scratch-paint or @scratch/paper became initial JavaScript');
    if (paint.sourceBytes < 600 * 1024) {
        failures.push(`lazy paint ownership fell below 600 KiB: ${paint.sourceBytes} bytes`);
    }
    if (paint.emittedBytes < 200 * 1024) {
        failures.push(`lazy paint assets fell below 200 KiB: ${paint.emittedBytes} bytes`);
    }
    const activation = report.lazyPaintActivation;
    if (!activation?.reducer?.found) failures.push('the named paint-reducer chunk is missing');
    if (!activation?.editor?.found) failures.push('the named paint-editor chunk is missing');
    if (activation?.reducer?.found && !activation.reducer.files.length) {
        failures.push('the named paint-reducer chunk emitted no JavaScript asset');
    }
    if (activation?.editor?.found && !activation.editor.files.length) {
        failures.push('the named paint-editor chunk emitted no JavaScript asset');
    }
    if (activation?.reducer?.initial) failures.push('paint-reducer became an initial chunk');
    if (activation?.editor?.initial) failures.push('paint-editor became an initial chunk');
    if (activation?.reducer?.files?.some(file => activation.editor.files.includes(file))) {
        failures.push('paint reducer and editor resolve to the same emitted JavaScript asset');
    }
    return failures;
};

export const assertLazySvgSanitizerBoundary = report => {
    const svg = report.lazySvgSanitizer;
    const failures = [];
    if (!svg?.namedChunk?.found) failures.push('the named svg-sanitizer chunk is missing');
    if (svg?.namedChunk?.initial) failures.push('svg-sanitizer became an initial chunk');
    if (svg?.namedChunk?.found && !svg.namedChunk.files.length) {
        failures.push('the named svg-sanitizer chunk emitted no JavaScript asset');
    }
    if (svg?.namedChunk?.found && !svg.namedChunk.ownsSanitizerEntry) {
        failures.push('the named svg-sanitizer chunk does not own a sanitizer bridge or module');
    }
    const expected = [
        ['sanitizeSvg', 'scratch-svg-renderer sanitize-svg'],
        ['cssTree', 'css-tree']
    ];
    for (const [key, label] of expected) {
        if (!svg?.[key]?.found) failures.push(`${label} is missing from webpack ownership`);
        if (svg?.[key]?.initial) failures.push(`${label} became initial JavaScript`);
        if (svg?.[key]?.found && !svg[key].demandChunkOwned) {
            failures.push(`${label} is not owned by the svg-sanitizer demand chunk group`);
        }
    }
    if (svg?.rendererIndex?.initial) {
        failures.push('scratch-svg-renderer barrel/index became initial JavaScript');
    }
    if (svg?.mdnData?.found) {
        failures.push('mdn-data is bundled although SVG sanitation needs no validation lexer');
    }
    const cssEmittedBytes = svg?.cssPayload?.emittedBytes || 0;
    if (cssEmittedBytes < 75 * 1024) {
        failures.push(`the css-tree sanitizer asset fell below 75 KiB: ${cssEmittedBytes} bytes`);
    }
    return failures;
};
