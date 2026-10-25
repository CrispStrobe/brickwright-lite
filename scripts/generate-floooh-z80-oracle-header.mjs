#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_CYCLE_QUALIFICATION !== '1') {
    throw new Error('Z80 oracle generation is CI-only; set BW_ALLOW_LOCAL_CYCLE_QUALIFICATION=1 explicitly');
}

const root = resolve(process.env.Z80_ORACLE_ROOT || '');
const output = resolve(process.env.Z80_ORACLE_HEADER || 'oracle-vectors.h');
const manifest = JSON.parse(readFileSync(new URL('../test/fixtures/cycle-core-candidates.json', import.meta.url)));
const oracle = manifest.candidates.z80.oracle;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = oracle.vectorPaths;
const perFile = 8;
const vectors = [];
const receipts = [];

for (const file of files) {
    const bytes = readFileSync(join(root, file));
    const actual = sha256(bytes);
    if (actual !== oracle.sourceSha256[file]) throw new Error(`oracle hash mismatch: ${file}: ${actual}`);
    const all = JSON.parse(bytes);
    const eligible = all.filter(v => v.initial?.ei === 0 && v.initial?.p === 0 && v.initial?.q === 0);
    if (eligible.length < perFile) throw new Error(`oracle shard too small: ${file}`);
    const selected = [];
    for (let i = 0; i < perFile; i++) selected.push(eligible[Math.floor(i * eligible.length / perFile)]);
    vectors.push(...selected);
    receipts.push({file, sha256: actual, available: all.length, eligible: eligible.length, selected: selected.length});
}

const n = value => Number(value) >>> 0;
const setState = (prefix, s) => [
    `${prefix}.cpu.pc=${n(s.pc)}; ${prefix}.cpu.sp=${n(s.sp)};`,
    `${prefix}.cpu.a=${n(s.a)}; ${prefix}.cpu.f=${n(s.f)}; ${prefix}.cpu.b=${n(s.b)}; ${prefix}.cpu.c=${n(s.c)};`,
    `${prefix}.cpu.d=${n(s.d)}; ${prefix}.cpu.e=${n(s.e)}; ${prefix}.cpu.h=${n(s.h)}; ${prefix}.cpu.l=${n(s.l)};`,
    `${prefix}.cpu.i=${n(s.i)}; ${prefix}.cpu.r=${n(s.r)}; ${prefix}.cpu.wz=${n(s.wz)};`,
    `${prefix}.cpu.ix=${n(s.ix)}; ${prefix}.cpu.iy=${n(s.iy)};`,
    `${prefix}.cpu.af2=${n(s.af_)}; ${prefix}.cpu.bc2=${n(s.bc_)}; ${prefix}.cpu.de2=${n(s.de_)}; ${prefix}.cpu.hl2=${n(s.hl_)};`,
    `${prefix}.cpu.im=${n(s.im)}; ${prefix}.cpu.iff1=${!!s.iff1}; ${prefix}.cpu.iff2=${!!s.iff2};`
].join('\n');
const compareState = (prefix, s, overlappedFetch = false) => [
    `${overlappedFetch ? `((${prefix}.cpu.pc-1)&65535)` : `${prefix}.cpu.pc`}==${n(s.pc)}`,
    ['sp','a','f','b','c','d','e','h','l','i','r','wz','ix','iy','im','iff1','iff2']
        .flat().map(k => `${prefix}.cpu.${k}==${n(s[k])}`).join(' && '),
    `${prefix}.cpu.af2==${n(s.af_)} && ${prefix}.cpu.bc2==${n(s.bc_)} && ` +
        `${prefix}.cpu.de2==${n(s.de_)} && ${prefix}.cpu.hl2==${n(s.hl_)}`,
    ...(s.ram || []).map(([a, v]) => `${prefix}.mem[${n(a)}]==${n(v)}`)
].join(' && ');

const functions = vectors.map((v, index) => `
static bool oracle_${index}(void) {
    machine_t m; memset(&m, 0, sizeof(m)); m.pins=z80_init(&m.cpu);
    ${setState('m', v.initial)}
    ${(v.initial.ram || []).map(([a, x]) => `m.mem[${n(a)}]=${n(x)};`).join(' ')}
    m.pins=z80_prefetch(&m.cpu, m.cpu.pc);
    unsigned ticks=0; bool entered_instruction=false;
    do {
        service(&m); ticks++;
        if (!z80_opdone(&m.cpu)) entered_instruction=true;
    } while (!(entered_instruction && z80_opdone(&m.cpu)) && ticks<${v.cycles.length + 4});
    oracle_last_ticks=ticks-1; /* discard prefetch's synthetic step-0 transition */
    oracle_last_timing=(oracle_last_ticks==${v.cycles.length});
    /* z80_opdone is observable in the overlapped next M1/T2. PC already
       points beyond that prefetched byte, so compare pc-1 to the oracle's
       instruction boundary while retaining the real core state for replay. */
    return entered_instruction && ${compareState('m', v.final, true)};
}`);
const calls = vectors.map((v, index) => `{ bool state_ok=oracle_${index}();
        if (state_ok) passed++;
        if (oracle_last_timing) timing_passed++;
        if ((!state_ok || !oracle_last_timing) && !*first_failure) {
            *first_failure="${v.name}";
            *first_failure_kind=state_ok ? "cycle-count" : "architectural-state";
            *first_expected_ticks=${v.cycles.length}; *first_actual_ticks=oracle_last_ticks;
        }
    }`).join('\n    ');
const header = `/* Generated only from hash-verified SingleStepTests JSON. */
#define Z80_ORACLE_VECTOR_COUNT ${vectors.length}u
static unsigned oracle_last_ticks;
static bool oracle_last_timing;
${functions.join('\n')}
static unsigned run_oracle_corpus(const char **first_failure, const char **first_failure_kind,
        unsigned *timing_passed_out, unsigned *first_expected_ticks, unsigned *first_actual_ticks) {
    unsigned passed=0, timing_passed=0; *first_failure=NULL; *first_failure_kind=NULL;
    *first_expected_ticks=0; *first_actual_ticks=0;
    ${calls}
    *timing_passed_out=timing_passed;
    return passed;
}
`;
writeFileSync(output, header);
console.log(JSON.stringify({schema: 1, commit: oracle.commit, vectorCount: vectors.length, files: receipts}));
