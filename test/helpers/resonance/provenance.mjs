// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Christian Ströbele (CrispStrobe)
// Read-only source/dependency provenance. No native session is constructed here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const within = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const relative = filename => path.relative(ROOT, filename).replaceAll('\\', '/');

/** The VM helper and loader honor this override, so check it before either is used. */
export function checkedIntegratedRoot(override = process.env.BW_INTEGRATED_ROOT) {
  const expected = path.join(ROOT, 'packages/scratch-gui');
  const selected = override ? path.resolve(override) : expected;
  assert.equal(fs.realpathSync(selected), fs.realpathSync(expected),
    'Resonance qualification refuses an external BW_INTEGRATED_ROOT; use this checkout\'s packages/scratch-gui.');
  return selected;
}

function resolveFile(base) {
  return [base, base + '.js', base + '.mjs', base + '.jsx', base + '.json', path.join(base, 'index.js')]
    .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

/**
 * Conservative relative-import closure of owned entrypoints. Literal imports,
 * reexports and requires are parsed as JavaScript, never guessed from comments
 * or generated source strings. Conditional literal branches are included too.
 * Computed calls are listed, not claimed to be resolved; the caller supplies
 * the actual helper's computed entrypoints explicitly.
 */
export function ownedModuleClosure(entrypoints, integratedRoot = checkedIntegratedRoot()) {
  const require = createRequire(path.join(integratedRoot, 'package.json'));
  const parserPath = require.resolve('@babel/parser');
  const parserPackage = require.resolve('@babel/parser/package.json');
  const {parse} = require(parserPath);
  const vmOverlay = path.join(ROOT, 'overlay/scratch-vm/src');
  const vmInstalled = path.join(integratedRoot, 'node_modules/scratch-vm/src');
  const seen = new Set(), relativeImports = [], bareImports = [], computedImports = [], installedVmImports = [];
  const visit = filename => {
    filename = path.resolve(filename);
    assert.ok(within(path.resolve(ROOT), filename), `Source entry must be inside this checkout: ${filename}`);
    if (seen.has(filename)) return;
    seen.add(filename);
    const bytes = fs.readFileSync(filename, 'utf8');
    if (!/\.(?:m?js|cjs|jsx)$/.test(filename)) return;
    const ast = parse(bytes, {sourceType: 'unambiguous', plugins: ['jsx']});
    const refer = (specifier, kind, line) => {
      const from = relative(filename);
      if (typeof specifier !== 'string') {computedImports.push({from, kind, line}); return;}
      if (!specifier.startsWith('.')) {
        if (!specifier.startsWith('node:')) bareImports.push({from, kind, specifier});
        return;
      }
      const base = path.resolve(path.dirname(filename), specifier);
      const resolved = resolveFile(base);
      if (resolved) {
        relativeImports.push({from, kind, specifier, to: relative(resolved)});
        visit(resolved);
        return;
      }
      // The extension shim intentionally resolves stock VM support from the
      // installed VM, whose entire src tree is independently hash-bound.
      const stock = within(vmOverlay, base) && resolveFile(path.join(vmInstalled, path.relative(vmOverlay, base)));
      assert.ok(stock, `Unresolved relative source import ${specifier} from ${from}`);
      installedVmImports.push({from, kind, specifier,
        to: path.relative(path.dirname(vmInstalled), stock).replaceAll('\\', '/')});
    };
    const walk = node => {
      if (!node || typeof node !== 'object') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
        refer(node.source.value, node.type, node.loc?.start.line);
      } else if (node.type === 'ImportExpression') {
        refer(node.source?.type === 'StringLiteral' ? node.source.value : null, 'import', node.loc?.start.line);
      } else if (node.type === 'CallExpression' &&
          (node.callee?.type === 'Import' || (node.callee?.type === 'Identifier' && node.callee.name === 'require'))) {
        refer(node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : null,
          node.callee.type === 'Import' ? 'import' : 'require', node.loc?.start.line);
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'extra', 'comments', 'tokens'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value?.type) walk(value);
      }
    };
    walk(ast);
  };
  entrypoints.forEach(entry => visit(path.resolve(ROOT, entry)));
  const order = rows => rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {files: [...seen].sort(), relativeImports: order(relativeImports), bareImports: order(bareImports),
    computedImports: order(computedImports), installedVmImports: order(installedVmImports),
    parser: {name: '@babel/parser', version: JSON.parse(fs.readFileSync(parserPackage, 'utf8')).version,
      files: [parserPackage, parserPath]}};
}
