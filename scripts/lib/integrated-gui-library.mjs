/** The CLI uses the same copied sources and normal package scope as the GUI.
 * Inspect only; never integrate, install, compile or repair during conversion.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const MODEL = 'scratch-vm/src/util/bw-procedure-constraint-model.js';
const MODEL_FILE = 'src/util/bw-procedure-constraint-model.js';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const failure = (reason, cause) => Object.assign(new Error(
    `CLI_INTEGRATED_GUI_REQUIRED: ${reason}. Run source integration and install the declared GUI dependencies; no frontend build is required.`,
    {cause}), {code: 'NO_RUNTIME', prerequisite: 'CLI_INTEGRATED_GUI_REQUIRED'});

function ownedFiles (root) {
    const out = [];
    for (const name of fs.readdirSync(root).sort()) {
        const file = path.join(root, name), stat = fs.lstatSync(file);
        if (stat.isSymbolicLink()) throw new Error(`owned library source is a symlink: ${file}`);
        if (stat.isDirectory()) for (const rel of ownedFiles(file)) out.push(`${name}/${rel}`);
        else if (stat.isFile()) out.push(name);
        else throw new Error(`owned library source is not a regular file: ${file}`);
    }
    return out;
}

export function integratedGuiLibrary (root) {
    root = path.resolve(root);
    const gui = path.join(root, 'packages/scratch-gui');
    const owned = path.join(root, 'overlay/scratch-gui/src/lib');
    const installed = path.join(gui, 'src/lib');
    let admitted = null;
    function inspect () {
        try {
            const pkg = json(path.join(gui, 'package.json'));
            if (pkg.name !== 'scratch-gui' || pkg.dependencies?.['scratch-vm'] !== '4.8.115')
                throw new Error('integrated GUI package/declaration differs from the pinned installation');
            // integrate.mjs copies this directory verbatim. Generated src/generated
            // files and transformed VM engine files are deliberately outside it.
            const files = ownedFiles(owned);
            if (!files.length) throw new Error('owned GUI libraries are absent');
            const hashes = [];
            for (const rel of files) {
                const source = fs.readFileSync(path.join(owned, rel));
                const actual = path.join(installed, rel);
                if (!fs.lstatSync(actual).isFile() || fs.realpathSync(actual) !== path.join(fs.realpathSync(installed), rel))
                    throw new Error(`integrated owned library is redirected: ${rel}`);
                if (!source.equals(fs.readFileSync(actual))) throw new Error(`stale integrated owned library: ${rel}`);
                hashes.push([rel, hash(source)]);
            }
            const require = createRequire(path.join(gui, 'package.json'));
            // Resolve from the actual GUI owner, without a loader, alias or error fallback.
            const model = fs.realpathSync(require.resolve(MODEL));
            const vm = fs.realpathSync(path.join(gui, 'node_modules/scratch-vm'));
            const vmPackage = json(path.join(vm, 'package.json'));
            if (vmPackage.name !== 'scratch-vm' || vmPackage.version !== '4.8.115' ||
                vmPackage.exports?.[`./${MODEL_FILE}`] !== `./${MODEL_FILE}` ||
                model !== path.join(vm, MODEL_FILE)) throw new Error('canonical VM package/model export is conflicting');
            const sourceModel = fs.readFileSync(path.join(root, 'overlay/scratch-vm', MODEL_FILE));
            if (!sourceModel.equals(fs.readFileSync(model))) throw new Error('installed canonical VM model is stale');
            const current = {gui: fs.realpathSync(gui), libraries: fs.realpathSync(installed), vm, model,
                libraryHashes: hashes, modelSHA256: hash(sourceModel), guiVersion: pkg.version, vmVersion: vmPackage.version};
            if (admitted && JSON.stringify(current) !== JSON.stringify(admitted))
                throw new Error('integrated library source identity changed during this conversion');
            admitted = current;
            return current;
        } catch (cause) {
            throw failure(cause.message, cause);
        }
    }
    return {
        inspect,
        async import (rel) {
            if (typeof rel !== 'string' || !rel || rel.includes('\\') || path.isAbsolute(rel) ||
                rel.split('/').some(part => part === '..' || part === '.' || !part))
                throw failure('invalid owned library path');
            const state = inspect();
            if (!state.libraryHashes.some(([name]) => name === rel)) throw failure(`not an owned GUI library: ${rel}`);
            return import(pathToFileURL(path.join(state.libraries, rel)).href);
        }
    };
}
