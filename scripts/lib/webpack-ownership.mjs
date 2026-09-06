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

const TUTORIAL_LIBRARY_CHUNK = 'tutorial-library';
export const TUTORIAL_LIBRARY_EAGER_INITIAL_BYTES = 4521229;
export const TUTORIAL_LIBRARY_MIN_INITIAL_REDUCTION_BYTES = 75 * 1024;

const TUTORIAL_LIBRARY_BODY_SUFFIXES = [
    '/src/lib/libraries/decks/index.jsx',
    '/src/lib/libraries/decks/en-steps.js',
    '/src/lib/libraries/decks/translate-image.js',
    '/src/lib/libraries/decks/translate-video.js',
    '/src/lib/libraries/tutorial-tags.js',
    '/src/components/cards/cards.jsx',
    '/src/containers/cards.jsx',
    '/src/containers/tips-library.jsx'
];

const isTutorialLibraryBodyModule = name => {
    const normalized = stripLoaders(name);
    return TUTORIAL_LIBRARY_BODY_SUFFIXES.some(suffix => normalized.endsWith(suffix));
};

const isTutorialLibraryMetadataModule = name =>
    /\/src\/lib\/libraries\/decks\/metadata\.js$/.test(stripLoaders(name));

const tutorialLibraryForbiddenReason = name => {
    const normalized = stripLoaders(name);
    if (/\/src\/components\/(?:library|library-item)\//.test(normalized) ||
        /\/src\/containers\/library-item\.jsx$/.test(normalized)) return 'generic-library-ui';
    if (/\/src\/lib\/libraries\/extensions\/index\.jsx$/.test(normalized)) return 'extension-registry';
    if (/\/src\/lib\/libraries\/(?:backdrops|costumes|sounds|sprites)\.json$/.test(normalized)) {
        return 'p6-asset-manifest';
    }
    if (isTutorialLibraryMetadataModule(normalized)) return 'compact-deck-metadata';
    return null;
};

const uniqueAssets = assets => {
    const unique = new Map();
    for (const asset of assets || []) {
        const existing = unique.get(asset.name);
        if (!existing) {
            unique.set(asset.name, {...asset, chunks: [...new Set(asset.chunks || [])]});
        } else {
            existing.size = Math.max(Number(existing.size) || 0, Number(asset.size) || 0);
            existing.chunks = [...new Set([...(existing.chunks || []), ...(asset.chunks || [])])];
        }
    }
    return [...unique.values()];
};

const uniqueModules = modules => {
    const unique = new Map();
    for (const module of modules || []) {
        const key = String(module.identifier || module.name || '');
        const existing = unique.get(key);
        if (!existing) {
            unique.set(key, {...module, chunks: [...new Set(module.chunks || [])]});
        } else {
            existing.size = Math.max(Number(existing.size) || 0, Number(module.size) || 0);
            existing.chunks = [...new Set([...(existing.chunks || []), ...(module.chunks || [])])];
        }
    }
    return [...unique.values()];
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
    const tutorialChunks = chunks.filter(chunk => (chunk.names || []).includes(TUTORIAL_LIBRARY_CHUNK));
    const tutorialIds = new Set(tutorialChunks.map(chunk => String(chunk.id)));
    const tutorialModules = uniqueModules(modules.filter(module =>
        (module.chunks || []).some(id => tutorialIds.has(String(id)))));
    const tutorialAssets = uniqueAssets(assets.filter(asset =>
        /\.js$/.test(asset.name) && (asset.chunks || []).some(id => tutorialIds.has(String(id)))));
    const tutorialBodyModules = uniqueModules(modules.filter(module =>
        isTutorialLibraryBodyModule(module.name || module.identifier)));
    const tutorialMetadataModules = uniqueModules(modules.filter(module =>
        isTutorialLibraryMetadataModule(module.name || module.identifier)));
    const tutorialForbiddenModules = tutorialModules.map(module => ({
        name: stripLoaders(module.name || module.identifier),
        reason: tutorialLibraryForbiddenReason(module.name || module.identifier)
    })).filter(module => module.reason);
    const initialAssetBytes = uniqueAssets(initialAssets)
        .reduce((sum, asset) => sum + (Number(asset.size) || 0), 0);
    const moduleNames = selected => selected.map(module => stripLoaders(module.name || module.identifier)).sort();
    const bodyOutsideNamedChunk = tutorialBodyModules.filter(module =>
        !(module.chunks || []).some(id => tutorialIds.has(String(id))));
    const bodyInInitial = tutorialBodyModules.filter(module =>
        (module.chunks || []).some(id => initialIds.has(String(id))));
    const metadataOutsideInitial = tutorialMetadataModules.filter(module =>
        !(module.chunks || []).some(id => initialIds.has(String(id))));
    const tutorialBodyNames = new Set(moduleNames(tutorialBodyModules));
    const missingBodyModules = TUTORIAL_LIBRARY_BODY_SUFFIXES.filter(suffix =>
        ![...tutorialBodyNames].some(name => name.endsWith(suffix)));

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
        tutorialLibrary: {
            found: tutorialChunks.length === 1,
            namedChunks: tutorialChunks.length,
            initial: tutorialChunks.some(chunk => chunk.initial),
            files: tutorialAssets.map(asset => asset.name).sort(),
            emittedBytes: tutorialAssets.reduce((sum, asset) => sum + (Number(asset.size) || 0), 0),
            sourceBytes: tutorialModules.reduce((sum, module) => sum + (Number(module.size) || 0), 0),
            bodyModules: moduleNames(tutorialBodyModules),
            missingBodyModules,
            bodyInInitial: moduleNames(bodyInInitial),
            bodyOutsideNamedChunk: moduleNames(bodyOutsideNamedChunk),
            metadataModules: moduleNames(tutorialMetadataModules),
            metadataOutsideInitial: moduleNames(metadataOutsideInitial),
            forbiddenModules: tutorialForbiddenModules,
            eagerInitialBaselineBytes: TUTORIAL_LIBRARY_EAGER_INITIAL_BYTES,
            initialBytes: initialAssetBytes,
            initialReductionBytes: TUTORIAL_LIBRARY_EAGER_INITIAL_BYTES - initialAssetBytes,
            minimumInitialReductionBytes: TUTORIAL_LIBRARY_MIN_INITIAL_REDUCTION_BYTES
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

export const assertTutorialLibraryBoundary = report => {
    const tutorial = report.tutorialLibrary;
    const failures = [];
    if (!tutorial.found) {
        failures.push(`expected exactly one named ${TUTORIAL_LIBRARY_CHUNK} chunk; found ${tutorial.namedChunks}`);
    }
    if (tutorial.initial) failures.push(`${TUTORIAL_LIBRARY_CHUNK} became an initial chunk`);
    if (!tutorial.files.length) failures.push(`${TUTORIAL_LIBRARY_CHUNK} emitted no JavaScript asset`);
    if (tutorial.missingBodyModules.length) {
        failures.push(`tutorial deck and Cards/Tips body modules are missing: ${tutorial.missingBodyModules.join(', ')}`);
    }
    if (tutorial.bodyInInitial.length) {
        failures.push(`tutorial deck or Cards/Tips bodies became initial: ${tutorial.bodyInInitial.join(', ')}`);
    }
    if (tutorial.bodyOutsideNamedChunk.length) {
        failures.push(`tutorial bodies escaped ${TUTORIAL_LIBRARY_CHUNK}: ${tutorial.bodyOutsideNamedChunk.join(', ')}`);
    }
    if (!tutorial.metadataModules.length) failures.push('compact deck metadata is missing');
    if (tutorial.metadataOutsideInitial.length) {
        failures.push(`compact deck metadata is not initial: ${tutorial.metadataOutsideInitial.join(', ')}`);
    }
    if (tutorial.forbiddenModules.length) {
        failures.push(`${TUTORIAL_LIBRARY_CHUNK} contains shell/shared modules: ${tutorial.forbiddenModules
            .map(module => `${module.reason}: ${module.name}`).join(', ')}`);
    }
    if (tutorial.initialReductionBytes < tutorial.minimumInitialReductionBytes) {
        failures.push(`tutorial split reduced initial JavaScript by less than 75 KiB: ` +
            `${tutorial.initialReductionBytes} bytes from ${tutorial.eagerInitialBaselineBytes}`);
    }
    return failures;
};
