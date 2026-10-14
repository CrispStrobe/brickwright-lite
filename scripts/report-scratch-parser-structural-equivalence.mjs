#!/usr/bin/env node
/** P16c: measure structural equivalence in AJV's four compiled validator graphs. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PARSER = path.join(ROOT, 'packages', 'scratch-gui', 'node_modules', 'scratch-parser');
const LIB = path.join(PARSER, 'lib');
const parserRequire = createRequire(path.join(PARSER, 'package.json'));
const roots = [
    ['sb2-project', 'sb2_schema.json'],
    ['sb3-project', 'sb3_schema.json'],
    ['sb2-sprite', 'sprite2_schema.json'],
    ['sb3-sprite', 'sprite3_schema.json']
];
const expectedHashes = {
    'sb2_definitions.json': '41058e96e3c07ced125e588fdc9aac991d2e904003e0fba57b19e6e2862e2a40',
    'sb3_definitions.json': 'd233759589afd530a0d0e68fd6b1d8c1bf897b70c2fb503e08082404ca61c02a',
    'sb2_schema.json': '3d12ecb5495bbaf2c4c8b12991660bda67f6270d812bd45b77f326dd623011d9',
    'sb3_schema.json': '471c37663546e54ede6f7975f58b0e432520c6924195980d4897113bcb246d46',
    'sprite2_schema.json': 'ad57500d5e969aae54f5da2cd7f82614e05da6d7351b8338203114c6832a24f8',
    'sprite3_schema.json': '821e4c04972af894d42f22ac9d6233eb3de3d9b34ef8fc41b977018132bbeff5'
};
const hash = value => createHash('sha256').update(value).digest('hex');
const readSchema = filename => JSON.parse(readFileSync(path.join(LIB, filename), 'utf8'));

const parserVersion = parserRequire('./package.json').version;
const ajvVersion = parserRequire('ajv/package.json').version;
if (parserVersion !== '5.2.1' || ajvVersion !== '6.12.6') {
    throw new Error(`expected scratch-parser 5.2.1 / AJV 6.12.6, got ${parserVersion} / ${ajvVersion}`);
}
for (const [filename, expected] of Object.entries(expectedHashes)) {
    const actual = hash(readFileSync(path.join(LIB, filename)));
    if (actual !== expected) throw new Error(`${filename} hash drift: expected ${expected}, got ${actual}`);
}

const Ajv = parserRequire('ajv');
const ajv = new Ajv({sourceCode: true});
ajv.addSchema(readSchema('sb2_definitions.json')).addSchema(readSchema('sb3_definitions.json'));
const validators = roots.map(([name, filename]) => ({name, validate: ajv.compile(readSchema(filename))}));

const nodes = [];
const ids = new Map();
const visit = validate => {
    if (ids.has(validate)) return ids.get(validate);
    const id = nodes.length;
    ids.set(validate, id);
    nodes.push(validate);
    for (const reference of validate.refVal || []) if (typeof reference === 'function') visit(reference);
    return id;
};
for (const {validate} of validators) visit(validate);

const localKey = validate => JSON.stringify({
    body: validate.toString().replace(/\/\*# sourceURL=.*?\*\//g, ''),
    schema: validate.schema,
    patterns: validate.source?.patterns || [],
    defaults: validate.source?.defaults || [],
    refs: (validate.refVal || []).map(reference => typeof reference === 'function' ? 'function' : reference)
});
const locals = nodes.map(localKey);
const partition = keys => {
    const ordered = [...new Set(keys)].sort();
    const byKey = new Map(ordered.map((key, index) => [key, index]));
    return keys.map(key => byKey.get(key));
};
let classes = partition(locals);
let rounds = 0;
for (;;) {
    rounds++;
    const refined = partition(nodes.map((validate, id) => JSON.stringify({
        local: locals[id],
        references: (validate.refVal || []).map(reference =>
            typeof reference === 'function' ? classes[ids.get(reference)] : reference)
    })));
    if (refined.every((value, index) => value === classes[index])) break;
    classes = refined;
    if (rounds > nodes.length + 1) throw new Error('graph partition did not converge');
}

const members = new Map();
for (const [id, classId] of classes.entries()) {
    if (!members.has(classId)) members.set(classId, []);
    members.get(classId).push(id);
}
const byteLength = value => Buffer.byteLength(value);
const rawFunctionBytes = nodes.reduce((sum, validate) => sum + byteLength(validate.toString()), 0);
const representativeBytes = [...members.values()].reduce((sum, group) => {
    const validate = nodes[group[0]];
    return sum + byteLength(validate.toString()) + byteLength(JSON.stringify(validate.schema)) +
        byteLength(JSON.stringify(validate.source?.patterns || [])) +
        byteLength(JSON.stringify(validate.source?.defaults || []));
}, 0);
const repeatedClasses = [...members.entries()].filter(([, group]) => group.length > 1)
    .map(([classId, group]) => ({classId, count: group.length, nodes: group,
        representativeBytes: byteLength(nodes[group[0]].toString())}))
    .sort((a, b) => b.count - a.count || b.representativeBytes - a.representativeBytes);
const report = {
    schema: 'brickwright/p16c-structural-equivalence/v1',
    versions: {'scratch-parser': parserVersion, ajv: ajvVersion},
    roots: validators.map(({name, validate}) => ({name, node: ids.get(validate), classId: classes[ids.get(validate)]})),
    nodes: nodes.length,
    classes: members.size,
    repeatedClassCount: repeatedClasses.length,
    refinementRounds: rounds,
    rawFunctionBytes,
    representativeBytes,
    sourceCeilingBytes: 160 * 1024,
    plausible: representativeBytes <= 160 * 1024,
    repeatedClasses
};
console.log(JSON.stringify(report, null, 2));
if (!report.plausible) process.exitCode = 2;
