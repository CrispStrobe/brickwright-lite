// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A stand-in for the ldraw-stl mirror (bw-sim/ldraw/ldraw-catalog.js), for the unit test
// test/bw-sim-ldraw-catalogue.test.mjs and the browser gate sim-lab-catalogue-gate.mjs:
// the vendored LDraw files plus a few parts only "the catalogue" has, laid out like the
// real mirror (one zip of deflated entries cut into chunks, files.json, catalog.json,
// manifest.json), so neither needs the network.

import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/** Parts only the fixture catalogue has: a brick (a vendored brick under another number), a sticker, an alias. */
export const CATALOGUE_ONLY = Object.freeze({
    'parts/zz-sticker.dat': '0 Sticker  1 x  2 Test\n0 Name: zz-sticker.dat\n0 Author: Test Author [tester]\n' +
        '0 !LDRAW_ORG Part UPDATE 2026-01\n0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt\n0 BFC CERTIFY CCW\n' +
        '4 16 -20 -0.25 -10 20 -0.25 -10 20 -0.25 10 -20 -0.25 10\n',
    'parts/zz-brick.dat': '0 Brick  2 x  4 Test Copy\n0 Name: zz-brick.dat\n0 Author: Test Author [tester]\n' +
        '0 !LDRAW_ORG Part UPDATE 2026-01\n0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt\n0 BFC CERTIFY CCW\n' +
        '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n',
    'parts/zz-alias.dat': '0 ~Moved to 3001\n0 Name: zz-alias.dat\n0 Author: [PTadmin]\n0 !LDRAW_ORG Part Alias UPDATE 2026-01\n' +
        '1 16 0 0 0 1 0 0 0 1 0 0 0 1 3001.dat\n'
});

/** The vendored LDraw files (parts/ and p/), library-relative and lower case. */
export const vendoredLDraw = ldrawDir => {
    const out = new Map();
    const walk = rel => {
        for (const e of readdirSync(path.join(ldrawDir, rel), {withFileTypes: true})) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) walk(r);
            else if (/\.dat$/i.test(e.name) && /^(parts|p)\//.test(r)) out.set(r.toLowerCase(), readFileSync(path.join(ldrawDir, r), 'utf8'));
        }
    };
    walk('');
    return out;
};

/**
 * The mirror's files for `texts` (library path -> file text).
 * @returns {{served: Map<string, Buffer>, files: object, chunks: object[], chunkSize: number}}
 */
export const buildCatalogueFixture = (texts, {chunkSize = 16 * 1024} = {}) => {
    const pieces = [];
    const files = {};
    let offset = 0;
    for (const [rel, text] of [...texts].sort(([a], [b]) => a.localeCompare(b))) {
        const name = Buffer.from(`ldraw/${rel}`);
        const data = zlib.deflateRawSync(Buffer.from(text, 'utf8'));
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(8, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt16LE(name.length, 26);
        files[rel] = [offset + 30 + name.length, data.length, Buffer.byteLength(text, 'utf8'), 8];
        pieces.push(local, name, data);
        offset += 30 + name.length + data.length;
    }
    const zip = Buffer.concat(pieces);
    const chunks = [];
    const served = new Map();
    for (let i = 0, n = 0; i < zip.length; i += chunkSize, n++) {
        const file = `ldraw-library.zip.${String(n).padStart(3, '0')}`;
        served.set(file, zip.subarray(i, i + chunkSize));
        chunks.push({file, size: Math.min(chunkSize, zip.length - i)});
    }
    const catalog = [...texts].filter(([rel]) => /^parts\/[^/]+\.dat$/.test(rel)).map(([rel, text]) => {
        const title = text.split(/\r?\n/, 1)[0].replace(/^0\s*/, '').trim();
        return [rel.slice(6, -4), title, title.split(/\s+/)[0], '', 'Part'];
    });
    served.set('files.json', Buffer.from(JSON.stringify(files)));
    served.set('catalog.json', Buffer.from(JSON.stringify({fields: ['name', 'title', 'category', 'keywords', 'type'], parts: catalog})));
    served.set('manifest.json', Buffer.from(JSON.stringify({format: 1, source: {date: '2026-09-30', sha256: 'f'.repeat(64)},
        zip: {bytes: zip.length, sha256: 'a'.repeat(64)}, chunkSize, chunks})));
    return {served, files, chunks, chunkSize};
};
