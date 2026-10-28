/** Installed upstream source, distinct from owned overlay and prepared GUI dependencies. */
import path from 'node:path';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const checkout = fileURLToPath(new URL('../../', import.meta.url));
const root = process.env.BW_PACKAGE_ROOT ? path.resolve(process.env.BW_PACKAGE_ROOT) : checkout;
if (process.env.BW_PACKAGE_ROOT) process.stderr.write(`[bw gate] upstream packages explicitly read from ${root} (BW_PACKAGE_ROOT).\n`);

export function createPackageSourceResolver (packageRoot) {
    return specifier => {
        const name = specifier.split('/')[0];
        if (!['bw-board', 'bw-circuit-ui'].includes(name)) throw new Error(`Not an upstream source package: ${specifier}`);
        const manifest = path.join(packageRoot, 'node_modules', name, 'package.json');
        if (!existsSync(manifest)) throw new Error(`Missing root-installed upstream package: ${manifest}`);
        // Package self-resolution honors its exports without searching a sibling/GUI registry.
        return createRequire(manifest).resolve(specifier);
    };
}

export const packageSourceFile = createPackageSourceResolver(root);
export const packageSourceRoot = name => path.dirname(packageSourceFile(`${name}/index.js`));
export const importPackageSource = specifier => import(pathToFileURL(packageSourceFile(specifier)).href);
