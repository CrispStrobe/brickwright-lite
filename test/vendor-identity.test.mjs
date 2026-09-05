// An invariant BETWEEN two copies of i8086-machine.js -- never a property OF each.
//
// `npm run sync:bwboard` would delete 173 lines of lite-only work in this file.
// Everything still constructs. Every test on both sides still passes. That is
// not a gap in either suite: each half is tested against ITSELF, which proves
// both are self-consistent and says nothing about whether they are the SAME,
// which is the only question that matters when one is vendored from the other.
//
// So this test's subject IS the comparison. It cannot pass without reaching
// both the vendored copies and the allow-list that licenses their divergence,
// and -- when the upstream tree is on disk -- upstream too.
//
// The allow-list lives in docs/VENDOR-DIVERGENCE-I8086-MACHINE.md, as a JSON
// block inside the prose that explains it. That is deliberate. The prose
// version of this document recorded the divergence accurately on 2026-09-04
// and was wrong by the next morning, because a document that DESCRIBES a
// divergence has no way to notice when one changes. Now disagreeing is what
// fails, so the doc and the code cannot drift apart.

import {test} from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC = path.join(ROOT, 'docs/VENDOR-DIVERGENCE-I8086-MACHINE.md');

const readAllowList = () => {
    const md = fs.readFileSync(DOC, 'utf8');
    const m = md.match(/```json\n([\s\S]*?)\n```/);
    assert.ok(m, `${path.relative(ROOT, DOC)} has no \`\`\`json allow-list block -- ` +
        'the test consults that block, so removing it would silently disable this gate');
    return JSON.parse(m[1]);
};

// Every file the allow-list covers, as [filename, entryList] pairs.
const coveredFiles = spec => Object.entries(spec.files);

// Both dual-tracked copies of one covered file.
const vendoredPaths = (spec, file) => spec.vendoredRoots.map(r => path.join(ROOT, r, file));

// Species 1 defence: a gate whose corpus is empty passes everything. Assert the
// allow-list is populated BEFORE trusting any result derived from iterating it.
test('the vendor allow-list is non-empty and covers both dual-tracked copies', () => {
    const spec = readAllowList();
    // NOT A PINNED COUNT. This used to read `>= 8`, which is a number pinned to
    // my own measurement -- so legitimate upstreaming turns it red and the
    // obvious repair is to edit the digit. A floor that is fixed by editing the
    // floor is a convention, not a mechanism. The real coverage check is
    // DERIVED from content, lives in the cross-tree tier below, and cannot be
    // satisfied by changing a number.
    //
    // What survives here is only the species-1 defence: a gate iterating an
    // empty list passes everything, so refuse an empty list. No magic number.
    assert.ok(coveredFiles(spec).length > 0,
        'the allow-list covers no files. Every check that iterates it would pass vacuously.');
    for (const [file, cfg] of coveredFiles(spec)) {
        assert.ok(cfg.liteOnly.length > 0, `${file} is listed with no entries`);
    }
    // The kerotakis lane's rule, enforced rather than suggested: every entry
    // must carry the one sentence a non-programmer could falsify. If nobody
    // can write that sentence for an entry, the entry is protecting something
    // whose loss has no observable consequence -- which is either not worth
    // protecting or not understood, and both want finding out now rather than
    // at the next sync.
    for (const d of coveredFiles(spec).flatMap(([, c]) => c.liteOnly)) {
        assert.ok(d.falsifiable && d.falsifiable.length > 30,
            `allow-list entry '${d.id}' has no 'falsifiable' sentence. Write what BREAKS ` +
            'in terms a non-programmer could check -- not what the diff removes. ' +
            'If you cannot, the entry may be protecting something with no observable effect.');
    }

    assert.equal(spec.vendoredRoots.length, 2,
        'overlay/ and packages/ are both tracked in this repo; both must be checked. ' +
        'I created a divergence between them once by not force-adding an ignored path.');
    for (const [file] of coveredFiles(spec)) {
        for (const p of vendoredPaths(spec, file)) {
            assert.ok(fs.existsSync(p), `vendored copy missing: ${path.relative(ROOT, p)}`);
        }
    }
});

test('a sync has not deleted the lite-only work in i8086-machine.js', () => {
    const spec = readAllowList();
    const missing = [];
    for (const [file, cfg] of coveredFiles(spec)) {
        for (const p of vendoredPaths(spec, file)) {
            const src = fs.readFileSync(p, 'utf8');
            for (const d of cfg.liteOnly) {
                if (!new RegExp(d.contains).test(src)) {
                    missing.push(`${d.id} -> ${path.relative(ROOT, p)}\n      what breaks: ${d.falsifiable}`);
                }
            }
        }
    }
    assert.deepEqual(missing, [],
        '\n  LITE-ONLY WORK IS GONE FROM THE VENDORED COPY.\n' +
        '  This is what a sync from bw-board does silently: the machine still\n' +
        '  constructs and no other test fails.\n\n      ' + missing.join('\n      ') +
        '\n\n  If the deletion was intended, delete the entry from the allow-list in\n' +
        '  docs/VENDOR-DIVERGENCE-I8086-MACHINE.md in the same commit.\n');
});

test('the two dual-tracked vendored copies have not drifted apart', () => {
    const spec = readAllowList();
    for (const [file] of coveredFiles(spec)) {
        const [a, b] = vendoredPaths(spec, file).map(p => fs.readFileSync(p, 'utf8'));
        assert.equal(a, b, `the two vendored copies of ${file} differ. ` +
        'These are the same file tracked twice; editing one and not the other is how ' +
            'These are the same file tracked twice; editing one and not the other is how ' +
            'a fix ships in the dev build and not the packaged one.');
    }
});

// The external anchor. Tiers 1-3 above are self-contained -- they can be
// satisfied by the lite tree alone, which means they verify that lite still has
// what the doc says it has, NOT that upstream still lacks it. This tier is the
// one that reaches the other side. When the upstream tree is not on disk it does
// NOT pass quietly: a check reports on what it FOUND, never on what exists.
test('upstream has not converged on the lite-only work (needs the bw-board tree)', t => {
    const spec = readAllowList();
    // gate-shapes-allow: the ambient part is WHICH directory, and a wrong answer
    // is now caught by the corpus check below rather than passing as a clean
    // negative. The tier still skips loudly when there is no tree at all.
    const candidates = [
        process.env.BW_BOARD_DIR, // gate-shapes-allow: see the corpus check below
        path.resolve(ROOT, '../../bw-board'),
        path.resolve(ROOT, '../bw-board')
    ].filter(Boolean);
    const srcDir = candidates.map(d => path.join(d, 'src')).find(d => fs.existsSync(d));
    if (!srcDir) {
        // Not an assertion failure -- upstream genuinely is not here. But it is
        // reported, and it is NOT counted as the invariant having been checked.
        t.diagnostic(`SKIPPED, NOT PASSED: upstream ${spec.upstreamRepo}/src ` +
            `not found. Looked in: ${candidates.join(', ')}. ` +
            'Set BW_BOARD_DIR to check the cross-tree invariant.');
        t.skip('upstream tree not on disk -- cross-tree invariant NOT verified');
        return;
    }

    // EVERY COVERED FILE, not just the one whose divergence someone wrote up
    // first. The single-file version protected i8086-machine.js and let fifteen
    // others lose 950 lines when I ran the sync for real; scoping a gate to the
    // instance that prompted it is how that happened.
    //
    // AND THE SET OF COVERED FILES IS ITSELF DERIVED. Iterating only the files
    // the list names means DELETING a file from the list deletes its coverage
    // requirement -- I red-proved exactly that and it passed silently, which is
    // the kerotakis lane's "graveyard of stale exemptions" at file granularity:
    // an allow-list that can only fail in one direction. So: scan the vendored
    // tree, find every file that HAS lite-only declarations, and require the
    // list to cover it. Removing an entry can then only be made green by
    // removing the WORK, which is the decision the entry exists to force.
    const summary = [];
    const declaredIn = src => ({
        methods: new Set([...src.matchAll(/^\s{4}(?:static\s+)?([A-Za-z_]\w*)\s*\(/gm)].map(m => m[1])),
        fields: new Set([...src.matchAll(/this\.([A-Za-z_]\w*)\s*=/g)].map(m => m[1]))
    });
    const vendorRoot = path.join(ROOT, spec.vendoredRoots[0]);
    const shouldCover = [];
    for (const f of fs.readdirSync(vendorRoot).filter(x => x.endsWith('.js')).sort()) {
        const u = path.join(srcDir, f);
        if (!fs.existsSync(u)) continue;
        const L = declaredIn(fs.readFileSync(path.join(vendorRoot, f), 'utf8'));
        const U = declaredIn(fs.readFileSync(u, 'utf8'));
        const upAll = new Set([...U.methods, ...U.fields]);
        const only = [...new Set([...L.methods, ...L.fields])]
            .filter(x => !upAll.has(x) && !spec.notIdentifiers.includes(x));
        if (only.length) shouldCover.push(`${f} (${only.join(', ')})`);
    }
    const uncovered = shouldCover.filter(x => !spec.files[x.split(' ')[0]]);
    assert.deepEqual(uncovered, [],
        '\n  FILES WITH LITE-ONLY WORK THAT THE ALLOW-LIST DOES NOT COVER:\n    ' +
        uncovered.join('\n    ') +
        '\n\n  A sync deletes this work and nothing explains what it costs. Add the file\n' +
        '  to the allow-list with a falsifiable sentence per entry. This set is SCANNED\n' +
        '  from the tree, not read from the list, so dropping a file from the list does\n' +
        '  not drop the requirement -- only removing the work does.\n');
    t.diagnostic(`derived: ${shouldCover.length} file(s) carry lite-only work, all covered`);

    // THE OTHER 458 LINES. The coverage above is identifier-based, so it sees
    // only files that declare something new. A file whose forward-ported work
    // is entirely in changed method bodies, extra branches or comments is
    // INVISIBLE to it -- and eleven files are in exactly that state, including
    // i8086-debug.js (190 lines) and emu8051-debug.js (170).
    //
    // They are protected by the sync's content-derived guard. But that guard
    // only runs when someone runs the sync, and the whole lesson of this file
    // is that "protected by something that runs elsewhere" is how the fifteen
    // files were lost. This inventory is what makes the SUITE see them.
    //
    // Recorded as a SET, not counts: line counts churn on every ordinary edit
    // and a gate that cries wolf gets deleted. Membership changes rarely and
    // means something both ways.
    const lineLost = (cur, next) => {
        const incoming = new Set(next.split('\n').map(l => l.trim()));
        return cur.split('\n').map(l => l.trim())
            .filter(l => l && l !== '}' && l !== '};' && l !== '{' && !incoming.has(l));
    };
    const namedFiles = new Set(Object.keys(spec.files));
    const actual = [];
    for (const f of fs.readdirSync(vendorRoot).filter(x => x.endsWith('.js')).sort()) {
        const u = path.join(srcDir, f);
        if (!fs.existsSync(u) || namedFiles.has(f)) continue;
        if (lineLost(fs.readFileSync(path.join(vendorRoot, f), 'utf8'),
            fs.readFileSync(u, 'utf8')).length) actual.push(f);
    }
    const recorded = spec.lineLevelOnly.files;
    const appeared = actual.filter(f => !recorded.includes(f));
    const gone = recorded.filter(f => !actual.includes(f));
    assert.deepEqual({appeared, gone}, {appeared: [], gone: []},
        '\n  THE INVENTORY OF UNDOCUMENTED FORWARD-PORTED WORK HAS MOVED.\n\n' +
        (appeared.length ? `  APPEARED (new divergence nobody has written up): ${appeared.join(', ')}\n` +
            '    A sync now deletes work in these and no entry says what it costs. Either\n' +
            '    give the file a named allow-list entry, or add it here if the work is\n' +
            '    genuinely just body-level and you accept the coarse guard.\n' : '') +
        (gone.length ? `  GONE (no longer diverged): ${gone.join(', ')}\n` +
            '    Upstreamed, or the work was deleted. Remove it from lineLevelOnly.files --\n' +
            '    an inventory that only fails one way becomes a graveyard of stale entries.\n' : ''));
    t.diagnostic(`inventory: ${actual.length} file(s) with line-level-only divergence, as recorded`);
    for (const [file, cfg] of coveredFiles(spec)) {
    const found = path.join(srcDir, file);
    if (!fs.existsSync(found)) {
        // Upstream does not have this file at all, so nothing here can have
        // converged. Report it -- a file that vanished upstream is a fact worth
        // seeing, not a silent pass.
        t.diagnostic(`${file}: not present upstream at all -- nothing to compare`);
        continue;
    }
    const up = fs.readFileSync(found, 'utf8');

    // BEFORE trusting a negative result derived from this file, prove the file
    // is the one we mean. Every assertion below is of the form "upstream does
    // NOT contain X" -- and an empty, truncated or simply WRONG file satisfies
    // all of them perfectly. That is species 1 (a gate with no corpus) one
    // layer out: the tier would report "upstream has not converged" having
    // never read upstream. scripts/audit-gate-shapes.mjs flagged the discovery
    // below as AMBIENT-BINDING and was right to -- this is the hole it meant.
    //
    // THE PROPERTIES BELOW ARE IDENTITY, NOT FEATURES, and that distinction was
    // the kerotakis lane's prediction about where the next one of these hides:
    // "something that proves the corpus by a property the corpus can lack for
    // an unrelated reason." My first version asserted upstream contains
    // `ne2000`. Upstream is entitled to drop the NE2000 -- that is a product
    // decision, not a corruption -- and when it did, this check would go red
    // for the wrong reason, someone would read the message, see it was a false
    // alarm, and DELETE THE CHECK. A corpus proof that cries wolf is a corpus
    // proof with a short life.
    //
    // So: prove the file is the module we mean, by things it cannot stop being
    // while still being that module. A file without the class declaration and
    // its export is not a changed i8086-machine.js; it is a different or
    // damaged file. Features are checked separately, in graftedFromUpstream,
    // where a legitimate removal SHOULD be visible as a decision.
    for (const [what, re] of [
        ['at least one export', /^export\s/m],
        ['a plausible amount of source (>100 lines)', /(?:.*\n){100}/]
    ]) {
        assert.match(up, re, `upstream file at ${found} does not contain ${what}. ` +
            'Refusing to conclude anything from it: every check below is a NEGATIVE ' +
            'assertion, which a wrong or truncated file passes trivially.');
    }

    const converged = cfg.liteOnly.filter(d => new RegExp(d.contains).test(up));
    assert.deepEqual(converged.map(d => d.id), [],
        `\n  UPSTREAM NOW HAS WORK THE ALLOW-LIST CALLS LITE-ONLY: ` +
        `${converged.map(d => d.id).join(', ')}.\n` +
        '  The entry is obsolete -- delete it from the allow-list. The doc cannot go\n' +
        '  stale in this direction either, because agreeing with upstream now fails.\n');

    // And the grafted work must still be present on BOTH sides -- the direction
    // that catches a graft being reverted upstream or lost here.
    const lite = fs.readFileSync(vendoredPaths(spec, file)[0], 'utf8');
    for (const g of (cfg.graftedFromUpstream || [])) {
        const re = new RegExp(g.contains);
        assert.ok(re.test(up), `grafted work '${g.id}' is gone from UPSTREAM`);
        assert.ok(re.test(lite), `grafted work '${g.id}' is gone from the vendored copy`);
    }
    // DERIVED COVERAGE, replacing the pinned floor. Extract the identifiers this
    // file DECLARES here and not upstream; every one must be named by some
    // entry. This is self-maintaining in both directions, which is the whole
    // point: delete an entry and its identifier becomes unexplained -- red, by
    // name. Upstream the work and the identifier stops being lite-only, so the
    // entry is no longer required and NOTHING needs editing to stay green.
    //
    // The kerotakis lane's literature-band argument, one domain over: pin to
    // something the outside world determines, not to your own computed number,
    // so a correction elsewhere MOVES your answer instead of BREAKING your
    // test. Upstream is the outside world here.
    // TWO STRATEGIES, CHECKED SEPARATELY. My first version returned one merged
    // Set and asserted its total size -- and that guard did not fire when I
    // broke the method-name regex, because the `this.X =` matches alone kept
    // the total well above the floor. HALF A BROKEN EXTRACTOR STILL REPORTED
    // "ALL COVERED". Found by trying to red-prove the guard and watching it
    // stay green, which is the only reason I know.
    //
    // A sum hides a zero. Each strategy must be shown to have reached
    // something on its own, or its half of the corpus is silently empty.
    const declared = src => ({
        methods: new Set([...src.matchAll(/^\s{4}(?:static\s+)?([A-Za-z_]\w*)\s*\(/gm)].map(m => m[1])),
        fields: new Set([...src.matchAll(/this\.([A-Za-z_]\w*)\s*=/g)].map(m => m[1]))
    });
    const upD = declared(up);
    const liteD = declared(lite);

    // CALIBRATE EACH STRATEGY AGAINST THE OTHER COPY OF THE SAME MODULE, not
    // against a fixed floor. My first version required >10 of each on the
    // upstream side, which is right for a class and WRONG for the debug
    // targets: z80-debug.js is a factory returning an object literal, so it has
    // no `this.X =` at all and zero is the correct answer, not a broken regex.
    // A fixed floor there is a false red, and a false red on a corpus proof is
    // how a corpus proof gets deleted.
    //
    // The two files are the same module, so the invariant that actually holds
    // is BETWEEN them: if one side yields plenty and the other yields nothing,
    // the extractor has stopped matching on that side. If both yield nothing,
    // the module genuinely has none of that construct. Same principle as the
    // rest of this file -- an invariant between two things, never a property
    // of each.
    for (const which of ['methods', 'fields']) {
        const a = liteD[which].size, b = upD[which].size;
        assert.ok(!(a > 10 && b === 0) && !(b > 10 && a === 0),
            `the ${which} extractor found ${a} in the vendored copy of ${file} and ${b} ` +
            'upstream. One side yielding plenty while the other yields nothing means it ' +
            'has stopped matching there -- and an empty half yields an empty lite-only ' +
            'list, which reads as "all covered". Refusing to conclude coverage from it.');
    }
    assert.ok(liteD.methods.size + liteD.fields.size > 0,
        `no declarations of any kind found in the vendored copy of ${file}`);
    const upDecl = new Set([...upD.methods, ...upD.fields]);
    const liteOnlyIds = [...new Set([...liteD.methods, ...liteD.fields])]
        .filter(x => !upDecl.has(x)).sort();

    const described = cfg.liteOnly.map(d => `${d.id} ${d.contains} ${d.why}`).join(' ');
    const unexplained = liteOnlyIds
        .filter(id => !spec.notIdentifiers.includes(id))   // `for (` matches the method regex
        .filter(id => !described.includes(id));
    assert.deepEqual(unexplained, [],
        `\n  ${file}: LITE-ONLY WORK THAT NO ALLOW-LIST ENTRY NAMES: ${unexplained.join(', ')}.\n` +
        '  These are declared here and not upstream, so a sync deletes them, and no\n' +
        '  entry explains what that would cost. Either add an entry (with its\n' +
        '  falsifiable sentence) or, if the work is obsolete, delete it from the file.\n' +
        '  This count is DERIVED, not pinned -- it cannot be fixed by editing a number.\n');

    summary.push(`${file}: ${cfg.liteOnly.length} named, ${liteOnlyIds.length} identifiers`);
    }

    assert.ok(summary.length > 0,
        'the cross-tree tier compared no files at all. Upstream src/ exists but nothing ' +
        'in the allow-list was found in it; refusing to report this as a verified invariant.');
    // One diagnostic per file: node's TAP writer escapes newlines inside a
    // single diagnostic, so a multi-line summary renders as one long line of
    // literal \n. Six short lines beat one unreadable one.
    t.diagnostic(`cross-tree invariant verified against ${srcDir}, ${summary.length} file(s):`);
    for (const line of summary) t.diagnostic(`  ${line}`);
});
