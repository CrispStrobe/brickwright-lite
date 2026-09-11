/**
 * THE RESIDUE ATTRIBUTOR — what a declared-divergent vendored file differs from
 * upstream-at-pin BEYOND the divergences the ledger declares.
 *
 * `vendor-identity` forgives a declared file's WHOLE byte-difference (the hole in
 * docs/VENDORING-REGIME.md: `this.cycles += 4` → `+= 5` in a declared file, both
 * mirrors, reds nothing). This computes the REMAINDER: every changed line that no
 * ledger entry claims. `test/vendor-residue-ratchet.test.mjs` ratchets that
 * remainder to zero.
 *
 * ## What the number counts, stated so it cannot drift into meaning something else
 *
 * Contiguous runs of CHANGED, SUBSTANTIVE, UNCLAIMED lines, split by direction
 * (lite-AHEAD = in lite not upstream; lite-BEHIND = in upstream not lite). NOT a
 * line count (churns on whitespace) and NOT a hunk count (hunk boundaries move
 * with the diff algorithm). A run of only structural lines — bare braces, a lone
 * `return n;` — is a diff BOUNDARY ARTIFACT (the line exists in both files and the
 * diff attributed it to one side because a neighbour diverged) and is reported
 * separately, never counted.
 *
 * ## How a line is attributed
 *
 * By its enclosing REGION, not by a single-line anchor that can also match
 * elsewhere. A class method (indentation-based, immune to `hooks = {}` default
 * params; a method's leading JSDoc is part of the method) or a factory API member
 * (brace-only depth inside the object the factory returns). A claim covers a line
 * when the line's region matches the claim AND — for a block claim — the line
 * falls inside the claim's block anchor. Line granularity, not run: a claim that
 * covers PART of a contiguous run must not swallow undeclared residue elsewhere in
 * the run (that is the hole in miniature — a superseded `saveState` throw once hid
 * inside a hunk that also carried declared changes).
 *
 * Deterministic: the diff algorithm is pinned (histogram), so the run set is
 * reproducible; the region map is a pure function of the file.
 */
import {execSync} from 'node:child_process';
import fs from 'node:fs';

const METHOD_DECL = /^ {4}(?:static |get |set |async |\* )*(?:[A-Za-z_$][\w$]*|constructor)\s*\(/;
const METHOD_NAME = /^ {4}(?:static |get |set |async |\* )*([A-Za-z_$][\w$]*|constructor)\s*\(/;
const MEMBER_CLOSE = /^ {4}[}\]]\)?[;,]?\s*$/;

// Catch-all regions are never a single divergence, so a claim on one must carry a
// block; a region-only claim there would over-claim the whole span. Named members
// may be claimed region-only when the entire member is the divergence.
export const CATCH_ALL = new Set(['<module>', '<setup>', '<class-body>', '<api>']);

// A factory `create*Target()` returns one object literal whose properties are the
// API members. Scope member detection to the SHALLOWEST `return {` (nested
// member-returns and setup object literals sit deeper/earlier); count ONLY braces
// for depth (parens/brackets are not member nesting, and mixing them collides
// member-close with object-close).
const factoryRegionMap = (src) => {
    const lines = src.split('\n');
    const region = new Array(lines.length + 1).fill('<module>');
    let apiLine = -1, apiIndent = Infinity;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(\s*)return \{\s*$/);
        if (m && m[1].length < apiIndent) { apiIndent = m[1].length; apiLine = i; }
    }
    let facLine = -1;
    for (let i = apiLine; i >= 0; i--) {
        if (/^(export\s+)?(default\s+)?(async\s+)?function\s+\w+|^(export\s+)?const\s+\w+\s*=\s*\(?.*=>\s*\{?/.test(lines[i])) { facLine = i; break; }
    }
    for (let i = (facLine < 0 ? 0 : facLine); i < apiLine; i++) region[i + 1] = '<setup>';
    if (apiLine < 0) return {region, nLines: lines.length};
    const memberDecl = /^\s+(?:async\s+|get\s+|set\s+|\*\s*)?([A-Za-z_$][\w$]*)\s*[(:]/;
    const braces = (s) => { let d = 0; for (const ch of s) { if (ch === '{') d++; else if (ch === '}') d--; } return d; };
    let depth = 0, cur = '<api>';
    for (let i = apiLine; i < lines.length; i++) {
        const line = lines[i];
        if (depth === 1) { const mm = line.match(memberDecl); cur = mm ? mm[1] : '<api>'; }
        region[i + 1] = depth >= 1 ? cur : region[i + 1];
        depth += braces(line);
        if (depth <= 0) return {region, nLines: lines.length};
    }
    return {region, nLines: lines.length};
};

// A class module: members at 4-space indent, bodies closing at `    }`; internal
// blocks close deeper. Each member's leading JSDoc/comment block is back-assigned
// to it — a removed method's doc is part of the removal, not free class-body.
export const regionMap = (src) => {
    const classStart = src.split('\n').findIndex(l => /^(export\s+)?(default\s+)?class\s/.test(l));
    if (classStart < 0) return factoryRegionMap(src);
    const lines = src.split('\n');
    const region = new Array(lines.length + 1).fill('<module>');
    let cur = '<module>', inMethod = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const inClassBody = i > classStart;
        if (!inMethod && inClassBody && METHOD_DECL.test(line)) {
            cur = line.match(METHOD_NAME)[1]; inMethod = true; region[i + 1] = cur; continue;
        }
        if (inMethod) {
            region[i + 1] = cur;
            if (MEMBER_CLOSE.test(line)) { inMethod = false; cur = '<module>'; }
            continue;
        }
        region[i + 1] = inClassBody ? '<class-body>' : '<module>';
    }
    const isDocOrBlank = (s) => s.trim() === '' || /^\s*(\/\*\*|\*\/?|\/\/|\*)/.test(s);
    for (let i = 1; i <= lines.length; i++) {
        if (region[i] !== '<class-body>' && region[i] !== '<module>') {
            let j = i - 1;
            while (j >= 1 && region[j] === '<class-body>' && isDocOrBlank(lines[j - 1])) { region[j] = region[i]; j--; }
        }
    }
    return {region, nLines: lines.length};
};

// regionOf(1-basedLine) for a source string. Used by the ledger migration to
// DERIVE an entry's region by running the attributor rather than by inspection.
export const regionOfLineFactory = (src) => {
    const {region} = regionMap(src);
    return (line) => region[line] ?? '<module>';
};

// `git diff -U0 --diff-algorithm=histogram` → changed 1-based line numbers each side.
const diffRanges = (upPath, litePath) => {
    let out;
    try {
        out = execSync(`git diff --no-index --unified=0 --diff-algorithm=histogram ${JSON.stringify(upPath)} ${JSON.stringify(litePath)}`,
            {encoding: 'utf8', maxBuffer: 1 << 24});
    } catch (e) { out = e.stdout || ''; }
    const added = [], removed = [];
    for (const line of out.split('\n')) {
        const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!m) continue;
        const upStart = +m[1], upCount = m[2] === undefined ? 1 : +m[2];
        const liteStart = +m[3], liteCount = m[4] === undefined ? 1 : +m[4];
        for (let i = 0; i < upCount; i++) removed.push(upStart + i);
        for (let i = 0; i < liteCount; i++) added.push(liteStart + i);
    }
    return {added, removed};
};

const STRUCTURAL = /^(?:[{}()\[\];,]*|return\s+\w+;|break;|continue;|else\s*\{?|\}\s*else\s*\{|\}\)*;?)$/;

// Contiguous runs (break only on a line-number gap, not a region change, so a
// JSDoc above a removed member stays in one run with it). Each run is tagged with
// the regions it touches and whether it is structural-only (a boundary artifact).
const runsBy = (lineNos, regionArr, direction, srcLines) => {
    const sorted = [...new Set(lineNos)].sort((a, b) => a - b);
    const runs = [];
    let run = null;
    for (const n of sorted) {
        if (run && n === run.end + 1) { run.end = n; run.regions.add(regionArr[n]); }
        else { if (run) runs.push(run); run = {direction, start: n, end: n, regions: new Set([regionArr[n]])}; }
    }
    if (run) runs.push(run);
    for (const r of runs) {
        r.lines = r.end - r.start + 1;
        r.region = regionArr[r.start];
        r.first = (srcLines[r.start - 1] || '').trim();
        r.structuralOnly = true;
        for (let l = r.start; l <= r.end; l++) {
            const t = (srcLines[l - 1] || '').trim();
            if (t && !STRUCTURAL.test(t)) { r.structuralOnly = false; break; }
        }
    }
    return runs;
};

// Lines a set of claims covers, at LINE granularity. A claim covers a line iff
// its region matches (region string, or ∈ regions list) AND — if it has an anchor
// — the line falls within an anchor match. A claim with no anchor covers every
// changed line in its region(s) (region-only; valid only for a named member that
// is wholly the divergence, enforced by callers via CATCH_ALL).
const claimedLineSet = (src, regionArr, claims) => {
    const lineOfOffset = [];
    let ln = 1;
    for (let i = 0; i < src.length; i++) { lineOfOffset[i] = ln; if (src[i] === '\n') ln++; }
    lineOfOffset[src.length] = ln;
    const claimed = new Set();
    const dead = [];
    for (const c of claims) {
        const regs = c.regions ?? (c.region != null ? [c.region] : null);
        const regionOK = (l) => regs ? regs.includes(regionArr[l]) : true;
        if (c.anchor) {
            const re = new RegExp(c.anchor, 'g');
            let m, hit = false;
            while ((m = re.exec(src)) !== null) {
                hit = true;
                const s = lineOfOffset[m.index], e = lineOfOffset[m.index + Math.max(0, m[0].length - 1)];
                for (let l = s; l <= e; l++) if (regionOK(l)) claimed.add(l);
                if (m[0].length === 0) re.lastIndex++;
            }
            if (!hit) dead.push(c.id);
        } else if (regs) {
            for (let l = 1; l < regionArr.length; l++) if (regionOK(l)) claimed.add(l);
        }
    }
    return {claimed, dead};
};

/**
 * Residue for one file. `claims` is a flat list of {id, side:'lite'|'upstream',
 * region?|regions?, anchor?}. Returns substantive unclaimed runs each direction,
 * the boundary artifacts, and any dead claims (anchor matched nothing).
 */
export const residueForFile = (upPath, litePath, claims = []) => {
    const up = fs.readFileSync(upPath, 'utf8');
    const lite = fs.readFileSync(litePath, 'utf8');
    const upReg = regionMap(up).region, liteReg = regionMap(lite).region;
    const {added, removed} = diffRanges(upPath, litePath);
    const liteLines = lite.split('\n'), upLines = up.split('\n');
    const liteC = claimedLineSet(lite, liteReg, claims.filter(c => c.side === 'lite'));
    const upC = claimedLineSet(up, upReg, claims.filter(c => c.side === 'upstream'));
    const aheadAll = runsBy(added.filter(n => !liteC.claimed.has(n)), liteReg, 'ahead', liteLines);
    const behindAll = runsBy(removed.filter(n => !upC.claimed.has(n)), upReg, 'behind', upLines);
    return {
        aheadRuns: aheadAll.filter(r => !r.structuralOnly),
        behindRuns: behindAll.filter(r => !r.structuralOnly),
        aheadArtifacts: aheadAll.filter(r => r.structuralOnly),
        behindArtifacts: behindAll.filter(r => r.structuralOnly),
        deadClaims: [...liteC.dead, ...upC.dead],
        totalChanged: {ahead: added.length, behind: removed.length}
    };
};

/**
 * Build the claim list for one file's ledger config. An entry declares where its
 * divergence lives, in any combination of:
 *   region   (string)                 a named member, claimed region-only
 *   regions  (string[])               several named members, region-only
 *   block    (regex, with `region`)   a blocked span inside one region
 *   blocks   ([{region, anchor}])      several blocked spans (for catch-alls, or a
 *                                      removal spanning members at mixed granularity)
 * liteOnly claims lite-AHEAD lines (its `contains` is the block when no `block`/
 * `blocks` is given — a lite-ahead divergence always shares its member with common
 * code, so it is block-scoped). liteRemoved and liteBehind claim lite-BEHIND lines.
 *
 * Returns {claims, missingRegion}: missingRegion names entries declaring no region
 * at all, which the ratchet reds on so the schema cannot be adopted half-way.
 */
export const claimsFromFileCfg = (cfg) => {
    const claims = [];
    const missingRegion = [];
    // liteOnly divergences share a member with common code, so `contains` is the
    // block when no explicit block is given; removals/debts default to region-only.
    const emit = (side, e, defaultAnchor) => {
        const anchor = e.block ?? defaultAnchor;
        let any = false;
        for (const b of e.blocks ?? []) { claims.push({id: e.id, side, region: b.region, anchor: b.anchor}); any = true; }
        if (Array.isArray(e.regions) && e.regions.length) { claims.push({id: e.id, side, regions: e.regions, anchor}); any = true; }
        else if (e.region != null) { claims.push({id: e.id, side, region: e.region, anchor}); any = true; }
        if (!any) missingRegion.push(e.id);
    };
    for (const e of cfg.liteOnly ?? []) emit('lite', e, e.contains);
    for (const e of cfg.liteRemoved ?? []) emit('upstream', e, undefined);
    for (const e of cfg.liteBehind ?? []) emit('upstream', e, undefined);
    return {claims, missingRegion};
};

// A claim on a catch-all region with NO anchor over-claims the whole span; only a
// NAMED member (wholly the divergence) may be claimed region-only. Derived from
// the built claims, so it sees exactly what will be applied.
export const catchAllWithoutBlock = (claims) =>
    [...new Set(claims
        .filter(c => !c.anchor && [c.region, ...(c.regions ?? [])].some(r => CATCH_ALL.has(r)))
        .map(c => c.id))];

if (import.meta.url === `file://${process.argv[1]}`) {
    const [upPath, litePath] = process.argv.slice(2);
    const r = residueForFile(upPath, litePath, []);
    console.log(`changed: ${r.totalChanged.ahead} ahead, ${r.totalChanged.behind} behind`);
    console.log(`RESIDUE (no claims): ${r.aheadRuns.length} ahead + ${r.behindRuns.length} behind runs`);
}
