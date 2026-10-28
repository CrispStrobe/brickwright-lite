import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Read the selected original declarations independently of native kind lookup.
// This is an original source-initializer oracle, not a PXT guest timing witness.
const source = JSON.parse(readFileSync(new URL('../../packages/scratch-gui/static/makecode/arcade/target.json', import.meta.url))).bundledpkgs.game['spritekind.ts'];
assert.equal(createHash('sha256').update(source).digest('hex'),
    'de733abb60f73a70f32134af4a1fc72f4de24e1c9b175069d74b5cdf1c112567', 'selected original SpriteKind source');
// This hash-bound namespace contains one type annotation and export modifiers;
// erase only that declaration syntax, retaining its actual initializer bodies.
// It is an independent source oracle, not a general TypeScript transpiler.
const namespace = source.match(/namespace SpriteKind \{([\s\S]*)\}\s*$/);
assert.ok(namespace, 'selected original kind namespace');
assert.equal((namespace[1].match(/let nextKind: number;/g) || []).length, 1);
const body = namespace[1].replace('let nextKind: number;', 'let nextKind;')
    .replace(/\bexport (?=function |const )/g, '');
const original = runInNewContext(`(function () {${body}\nreturn {Player, Projectile, Food, Enemy};})()`);
export const ORIGINAL_SPRITE_KINDS = Object.freeze(Object.fromEntries(
    ['Player', 'Projectile', 'Food', 'Enemy'].map(name => [name, original[name]])));
