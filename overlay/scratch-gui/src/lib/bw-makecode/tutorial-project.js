/** Assemble an offline native project from PXT tutorial input fences.
 * Keep the caller's saved program exact; never execute tutorial code or fetch
 * package dependencies. Package/customts blocks are project inputs, not prose.
 */
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const fileMap = value => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.values(value).every(text => typeof text === 'string');
const safeName = name => name && !name.startsWith('/') && !name.includes('\\') &&
    !name.split('/').some(part => !part || part === '.' || part === '..');

// A tutorial package fence may name a repository without a revision while its
// saved asset project's pxt.json pins that same repository. Retain that exact
// pin. Different repositories or two different explicit revisions conflict.
const mergePackage = (previous, next, name) => {
    if (previous === next) return previous;
    const github = value => value.match(/^github:([^#]+?)(?:#([^#]+))?$/);
    const before = github(previous), after = github(next);
    if (before && after && before[1].toLowerCase() === after[1].toLowerCase()) {
        if (before[2] && !after[2]) return previous;
        if (!before[2] && after[2]) return next;
    }
    throw new Error(`Conflicting tutorial package: ${name}`);
};

const inputFences = markdown => {
    if (typeof markdown !== 'string') throw new Error('Tutorial must be text.');
    const fences = [];
    let fence = null;
    for (const raw of markdown.match(/[^\n]*(?:\n|$)/g) || []) {
        if (!raw) continue;
        const line = raw.replace(/\r?\n$/, '');
        if (fence) {
            const close = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
            if (close && close[1][0] === fence.mark[0] && close[1].length >= fence.mark.length) {
                fences.push(fence);fence = null;
            } else { fence.lines.push(line);fence.raw += raw; }
        } else {
            const open = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
            if (open) fence = {mark: open[1], language: open[2].trim(), lines: [], raw: ''};
        }
    }
    if (fence && ['assetjson', 'package', 'customts', 'jres'].includes(fence.language)) throw new Error(`Unclosed ${fence.language} input fence.`);
    return fences;
};

export const hasTutorialJres = markdown => inputFences(markdown).some(block => block.language === 'jres');

export function tutorialProjectFiles(markdown, mainSource, {
    name = 'Recovered tutorial', target = 'arcade', jresToTypeScript
} = {}) {
    if (typeof mainSource !== 'string') throw new Error('Tutorial and main.ts must be text.');
    const fences = inputFences(markdown);
    const files = Object.create(null), dependencies = Object.create(null);
    let customCount = 0;
    const add = (filename, text) => {
        if (!safeName(filename)) throw new Error(`Invalid tutorial file name: ${filename}`);
        if (own(files, filename) && files[filename] !== text) throw new Error(`Conflicting tutorial file: ${filename}`);
        files[filename] = text;
    };
    for (const block of fences) {
        const text = block.language === 'jres' ? block.raw : block.lines.join('\n');
        if (block.language === 'assetjson') {
            let assets;
            try { assets = JSON.parse(text); } catch (error) { throw new Error(`Invalid assetjson: ${error.message}`); }
            if (!fileMap(assets)) throw new Error('assetjson must contain a text file map.');
            for (const [filename, content] of Object.entries(assets)) add(filename, content);
        } else if (block.language === 'customts') {
            add(`tutorial.custom.${++customCount}.ts`, text + '\n');
        } else if (block.language === 'jres') {
            let resources;
            try { resources = JSON.parse(text); } catch (error) { throw new Error(`Invalid jres: ${error.message}`); }
            if (!resources || typeof resources !== 'object' || Array.isArray(resources)) throw new Error('jres must contain a resource object.');
            if (typeof jresToTypeScript !== 'function') throw new Error('Standalone tutorial jres requires the original PXT tilemap generator.');
            const generated = jresToTypeScript(text);
            if (typeof generated !== 'string') throw new Error('Original PXT tilemap generator must return TypeScript text.');
            // These are PXT's original standalone tutorial resource filenames.
            // The emitter supplies factory aliases and exact map/wall bytes.
            // Conflicting assetjson resources remain a refusal, never a merge.
            add('tilemap.g.jres', text);
            add('tilemap.g.ts', generated);
        } else if (block.language === 'package') {
            for (const raw of block.lines) {
                const line = raw.trim();
                if (!line || line.startsWith('//') || line.startsWith('#')) continue;
                const entry = line.match(/^([\w-]+)(?:\s*=\s*(\S+))?$/);
                if (!entry) throw new Error(`Invalid tutorial package entry: ${line}`);
                const version = entry[2] || '*';
                dependencies[entry[1]] = own(dependencies, entry[1]) ?
                    mergePackage(dependencies[entry[1]], version, entry[1]) : version;
            }
        }
    }
    let config = {};
    if (own(files, 'pxt.json')) {
        try { config = JSON.parse(files['pxt.json']); } catch (error) { throw new Error(`Invalid tutorial pxt.json: ${error.message}`); }
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Tutorial pxt.json must be an object.');
    }
    if (config.dependencies !== undefined && !fileMap(config.dependencies)) throw new Error('Tutorial dependencies must be a text map.');
    const deps = {...(config.dependencies || (target === 'microbit' ? {core: '*'} : {device: '*'}))};
    for (const [key, value] of Object.entries(dependencies)) {
        deps[key] = own(deps, key) ? mergePackage(deps[key], value, key) : value;
    }
    // assetjson often carries the tutorial template's main.ts. The explicitly
    // selected saved snippet supersedes it; all other asset bytes stay exact.
    files['main.ts'] = mainSource;
    const ordered = config.files === undefined ? [] : config.files;
    if (!Array.isArray(ordered) || !ordered.every(filename => typeof filename === 'string' && safeName(filename))) throw new Error('Tutorial files must be valid file names.');
    const missing = ordered.filter(filename => !own(files, filename));
    if (missing.length) throw new Error(`Tutorial input files are missing: ${missing.join(', ')}`);
    files['pxt.json'] = JSON.stringify({...config, name: config.name || name, dependencies: deps,
        files: [...new Set([...ordered, ...Object.keys(files).filter(filename => filename !== 'pxt.json')])]}, null, 2) + '\n';
    return {files, dependencies: deps, customFiles: Object.keys(files).filter(filename => /^tutorial\.custom\./.test(filename))};
}


/** Version-bound documentation recovery policy, never used for authored .mkcd
 * imports. This is a projection of a selected snippet plus retained tutorial
 * inputs, not an export observed from the original editor. The original editor
 * regenerates art code after loading JRES; this helper preserves its four saved
 * art inputs without pretending to have executed that generation.
 */
export const TUTORIAL_EDITOR_POLICY = 'pxt-13.2.1';
export function tutorialEditorProjectFiles(markdown, mainSource, {
    name = 'Recovered tutorial', target = 'arcade', targetBundle, targetBundleSHA256, jresToTypeScript
} = {}) {
    if (typeof markdown !== 'string' || typeof mainSource !== 'string') throw new Error('Tutorial and selected main.ts must be text.');
    if (target !== 'arcade' || targetBundle?.id !== target || targetBundle?.versions?.pxt !== '13.2.1' || targetBundle?.versions?.target !== '4.2.1' ||
        !/^[a-f0-9]{64}$/.test(targetBundleSHA256 || '')) {
        throw new Error('Tutorial editor policy requires the actual Arcade 4.2.1 / PXT 13.2.1 target snapshot and its SHA256.');
    }
    const template = targetBundle.blocksprj;
    if (!template || !fileMap(template.files) || !fileMap(template.config?.dependencies) ||
        !Array.isArray(template.config.files) || !template.config.files.every(safeName)) {
        throw new Error('Tutorial editor policy requires actual target blocksprj files and dependencies.');
    }
    const files = Object.assign(Object.create(null), template.files);
    const config = JSON.parse(JSON.stringify(template.config));
    const dependencies = {...config.dependencies};
    const artNames = ['tilemap.g.jres', 'tilemap.g.ts', 'images.g.jres', 'images.g.ts'];
    const blocks = [...markdown.matchAll(/``` *(assetjson|customts|jres|simtheme)\s*\n([\s\S]*?)\n```/gim)];
    const last = language => blocks.filter(match => match[1].toLowerCase() === language).at(-1)?.[2];
    const assets = last('assetjson');
    if (assets !== undefined) {
        const parsed = JSON.parse(assets);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tutorial assetjson must be an object.');
        for (const key of artNames) if (own(parsed, key)) {
            if (typeof parsed[key] !== 'string') throw new Error(`Tutorial art input must be text: ${key}`);
            files[key] = parsed[key];
        }
    }
    const standaloneJres = last('jres');
    if (standaloneJres !== undefined) {
        const parsed = JSON.parse(standaloneJres);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Tutorial jres must contain a resource object.');
        if (typeof jresToTypeScript !== 'function') throw new Error('Standalone tutorial jres requires the original PXT tilemap generator.');
        const generated = jresToTypeScript(standaloneJres);
        if (typeof generated !== 'string') throw new Error('Original PXT tilemap generator must return TypeScript text.');
        // Actual editor prefers standalone tutorial JRES over the asset snapshot.
        files['tilemap.g.jres'] = standaloneJres;
        files['tilemap.g.ts'] = generated;
    }
    const simTheme = last('simtheme');
    if (simTheme !== undefined) {
        const parsed = JSON.parse(simTheme);
        if (parsed?.theme) config.theme = parsed.theme;
        if (parsed?.palette) config.palette = parsed.palette;
    }
    const customTs = last('customts');
    if (customTs !== undefined) files['tutorial.custom.ts'] = customTs;
    const packages = /```package\s+((.|\s)+?)\s*```/i.exec(markdown);
    if (packages) for (const raw of packages[1].split('\n')) {
        const compact = raw.replace(/\s*/g, '');
        if (!compact) continue;
        const parts = compact.split('=');
        if (parts.length > 2 || !/^[\w-]+$/.test(parts[0])) throw new Error(`Unsupported tutorial package entry: ${raw}`);
        const version = parts[1] || '*';
        if (version.toLowerCase() === 'remove') delete dependencies[parts[0]];
        else dependencies[parts[0]] = version;
    }
    files['main.ts'] = mainSource;
    const ordered = [...new Set([...config.files, ...artNames.filter(key => own(files, key)),
        ...(customTs !== undefined ? ['tutorial.custom.ts'] : [])])];
    if (ordered.some(key => !own(files, key))) throw new Error('Actual target template references missing files.');
    files['pxt.json'] = JSON.stringify({...config, name, dependencies, files: ordered}, null, 2) + '\n';
    return {files, dependencies, customFiles: customTs === undefined ? [] : ['tutorial.custom.ts'],
        assembly: {policy: TUTORIAL_EDITOR_POLICY, pxtCommit: 'c40f412dc5bebb915a5891cd62fe956e198fb194',
            targetVersions: {...targetBundle.versions}, targetBundleSHA256, mode: 'selected-snippet-with-tutorial-inputs',
            originalEditorExport: false, assetCodeRegenerated: false,
            sourceOrder: 'actual target file order, saved art inputs, actual custom helper; SDK-generated final order unqualified'}};
}
