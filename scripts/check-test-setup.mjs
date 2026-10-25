#!/usr/bin/env node
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Prerequisites only; runtime behavior and overlay freshness have their own gates. */
export function checkTestSetup ({root = ROOT, nodeVersion = process.versions.node,
    integrated = false, integratedRoot = process.env.BW_INTEGRATED_ROOT ||
        path.join(root, 'packages', 'scratch-gui')} = {}) {
    const errors = [];
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    const expected = pkg.engines.node;
    const expectedMajor = Number((/^>?\s*=?\s*(\d+)/.exec(expected) || [])[1]);
    const actualMajor = Number(nodeVersion.split('.')[0]);
    if (!Number.isFinite(expectedMajor) || actualMajor < expectedMajor) {
        errors.push(`Node ${expected} is required; found ${nodeVersion}. ` +
            'Select the version in .nvmrc (for example, nvm use).');
    }
    const zip = path.join(root, 'node_modules/jszip/package.json');
    if (!existsSync(zip) || JSON.parse(readFileSync(zip, 'utf8')).version !== pkg.devDependencies.jszip) {
        errors.push(`Missing root jszip@${pkg.devDependencies.jszip}. Run npm ci --ignore-scripts at the repository root.`);
    }
    if (integrated) {
        for (const file of [
            'package.json', 'src/lib/sb3-creator.js',
            'node_modules/scratch-vm/src/index.js', 'node_modules/jszip/package.json',
            'node_modules/avr8js/package.json', 'node_modules/rp2040js/package.json'
        ]) {
            if (!existsSync(path.join(integratedRoot, file))) {
                errors.push(`Missing integrated prerequisite: ${path.join(integratedRoot, file)}. ` +
                    'Follow README.md#development-and-tests (vendor, integrate, GUI install, overlays).');
            }
        }
    }
    return errors;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--integrated') || args.length > 1) {
        console.error('Usage: node scripts/check-test-setup.mjs [--integrated]');
        process.exitCode = 2;
    } else {
        const errors = checkTestSetup({integrated: args.includes('--integrated')});
        if (errors.length) {
            console.error(errors.join('\n'));
            process.exitCode = 1;
        } else {
            console.log(`Test prerequisites ready: Node ${process.versions.node}, root jszip` +
                (args.includes('--integrated') ? ', integrated GUI runtime.' : '.'));
        }
    }
}
