#!/usr/bin/env node
// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
/**
 * Print an index of every lane claim (lanes/<YYYY-MM-DD>-<slug>.md), newest
 * first. The index is generated on demand and never committed, so no PR has to
 * regenerate it. `--check` exits 1 when a claim file is malformed.
 *
 * Usage: node scripts/gen-lanes-index.mjs [--out FILE] [--check]
 */
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {listClaims, lanesIndex, lanesProblems} from './lib/lanes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--check')) {
    const problems = lanesProblems(ROOT);
    for (const p of problems) console.log(`  ${p}`);
    console.log(problems.length ? `${problems.length} malformed claim(s)` : `${listClaims(ROOT).length} claim(s), all well formed`);
    process.exit(problems.length ? 1 : 0);
}
const text = lanesIndex(listClaims(ROOT));
const out = args.indexOf('--out');
if (out >= 0) writeFileSync(args[out + 1], text); else process.stdout.write(text);
