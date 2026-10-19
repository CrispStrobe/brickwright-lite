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
