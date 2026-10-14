import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';

// Read the selected original declarations independently of native kind lookup.
// This is an original source-initializer oracle, not a PXT guest timing witness.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = JSON.parse(readFileSync(new URL('../../packages/scratch-gui/static/makecode/arcade/target.json', import.meta.url))).bundledpkgs.game['spritekind.ts'];
assert.equal(createHash('sha256').update(source).digest('hex'),
    'de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567', 'selected original SpriteKind source');
const emitted = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2018}, reportDiagnostics: true});
assert.equal(emitted.diagnostics.some(d => d.category === ts.DiagnosticCategory.Error), false);
const original = runInNewContext(emitted.outputText + '\nSpriteKind');
export const ORIGINAL_SPRITE_KINDS = Object.freeze(Object.fromEntries(
    ['Player', 'Projectile', 'Food', 'Enemy'].map(name => [name, original[name]])));
