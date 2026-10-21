# Local pinned-Git input admission

`scripts/private-assessment/admit-input.mjs` exports the synchronous API:

```js
admitInputRepository({repositoryPath, commit, manifestPath,
    expectedManifestSHA256, stageRoot, gitExecutable})
```

All arguments come from the trusted assessment controller. Local paths are
absolute; the Git executable must be separately admitted by that controller.
The API performs no fetch, credential setup, converter execution or logging.
Its successful return contains a **private** `proof` and `auditArgs`. Do not
print either to public Actions logs or artifacts. Errors contain fixed codes,
without raw Git output, private input content or caller paths.

## Manifest contract

Use the exact schema `brickwright/private-assessment-input/v1`:

- `scope`: a nonempty literal repository-relative directory prefix.
- `files`: at most 4096 distinct records with `path`, `bytes`, `sha256` and
  `gitBlobOid`. Every path is below `scope`; there is no pathspec or glob syntax.
  No absolute paths, empty components, dot components, backslashes or control
  characters are accepted. Paths are never interpreted as revision expressions.
- `logicalSubjects`: exactly 225 distinct ordered IDs, with the mode-specific
  kinds and bindings described below.
- `audit`: `rawTarget`, `rawInputs`, `contextCatalogue`, `contextRoots` and
  optional `inputMode`. Its only accepted modes are `catalogue` and
  `positional-context`; omission preserves the original `positional-context`
  default. `contextCatalogue` names a declared regular file.
  `contextRoots` maps literal root IDs to declared subdirectories with admitted
  descendant files; each ID contains letters, digits, underscores or hyphens
  and begins with a letter. The existing reader's default `catalogue` root is
  the catalogue's directory; an explicit mapping may override it as in the CLI.
- Optional `metadata`: opaque provided data. It does not create source,
  compiler, resource, dependency or authenticity evidence.

Unknown schema fields and duplicate JSON keys refuse. The manifest is read as
bounded regular data without following a final symlink; reads allocate only
the initially admitted size and probe exactly one byte at EOF, then recheck
identity and timestamps; its SHA256 must equal
the external expected hash. It is not modified or staged implicitly. If the
manifest itself needs preservation, the parent retains it as a separate guarded
input; self-referential file hashes are not required.

The admission module uses its own generic duplicate-key-safe JSON parser,
without importing a converter dependency. The converter is a separate pinned
source selection; this controller does not assume it has landed on main.

Both modes retain the existing
`brickwright/conversion-context-catalogue/v1` format. Targets and all original
fields are preserved verbatim.

### Complete catalogue mode

Set `audit.inputMode` to `catalogue` and `rawInputs` to an empty array. The
catalogue must contain exactly 225 subjects: 184 `RAW_BASELINE` rows followed
by 41 `RETAINED_CONTEXT` rows. Every manifest logical subject has exactly
`{id, kind}`, matching the actual catalogue's ID, kind and order. No positional
input may be mixed into this mode. Physical source files referenced by the
catalogue remain admitted through the full file/blob/root joins. All 184 raw
lineage records, original metadata and 41 retained outcome records stay in the
original catalogue; admission does not project or rewrite it. This is the
preferred mode for an existing complete 225-subject catalogue.

### Positional/context mode

The default or explicit `positional-context` mode preserves the existing
contract: the first 184 logical records have `{id, kind: 'raw', input}` matching
184 distinct declared `rawInputs` paths in order. The remaining 41 records have
`{id, kind: 'context'}` and match the 41-subject context catalogue's IDs in order.
Existing admitted context kinds remain unchanged. The original seven controls
remain intact; this mode is an optional separate input layout.

In both modes, each declared catalogue blob must join a declared Git
file through its actual root, relative path, length and SHA256; gzip decoded
bounds must be declared. Admission proves original blob bytes, not semantic
validity of every JSON pointer, gzip payload or retained compiler claim. The
unchanged catalogue reader remains responsible for full subject loading and
its original diagnostics. No missing context or original outcome is invented.

## Git and staging boundaries

The immutable commit must be a lowercase 40-hex commit object identity. A branch,
tag name, revision expression or absent object refuses. Fixed commands inspect
that commit and its complete bounded tree, then retrieve selected blobs in one
batch by OID. No caller paths become Git pathspecs. Actual selected modes must
be `100644` or `100755`; symlinks and gitlinks refuse. Every returned blob must
match its tree OID, SHA1 blob identity, length and external SHA256. Working-tree
edits and untracked files are never a fallback. Unrelated untracked files do
not invalidate a pinned commit and are never copied.

Git runs without a shell, with fixed arguments, a minimal environment, disabled
hooks/fsmonitor/replacement objects/attributes/pager, no interactive prompt or
lazy fetch, and denied protocols. Stderr/stdout are captured, bounded and never
attached to public errors. Each Git call has a five-second timeout; the parent
still enforces cumulative process-tree CPU and terminal limits. No trusted Git
binary or repository authentication is inferred from a caller-supplied path.

The fixed input bound is 8 MiB per file and 64 MiB total, **including manifest
bytes**, with at most 4096 staged files. The tree response is bounded at 8 MiB;
the selected batch is bounded at 64 MiB plus fixed header reserve. This can
conservatively refuse a very large unrelated repository tree. No limit is
raised or input omitted to make admission pass.

Only after every original byte and catalogue binding is checked does staging
begin. `stageRoot` must be fresh, under real directories without symlink
ancestors. Only new owned directories are created with mode 0700 and regular
files with mode 0600, exclusive creation and no final symlink following. Exact
bytes are preserved even for Git-executable source modes; original mode is
recorded in the proof. A final complete inventory checks file identity,
link count, permissions, length and SHA256. Failure leaves owned partial output
for the parent to preserve; the module never cleans another directory.

Filesystem ownership is not immutability. This API assumes the trusted local
controller controls the staging parent during admission; it is not an openat
sandbox against a hostile concurrent host process. After return, the parent
must guard all staged files, source, actual Git/Node executables and topology
before and after converter execution. A later edited stage must fail those
guards; reusing it for fresh admission also refuses.

## Actual CLI mapping

The returned arguments use the current `scripts/compat-audit.mjs` options:
`--target`, `--corpus-commit`, `--context-catalogue`, sorted explicit
`--context-root ID=directory` pairs. Only `positional-context` then appends all
184 exact positional input paths; `catalogue` appends none. The proof records
`inputMode`, physical `rawInputCount` and `catalogueSubjectCount`. Catalogue mode
also records the actual catalogue's 184/41 semantic kind counts, distinct from
its zero physical positional inputs. In either mode, semantic raw-baseline count
is physical positional raw inputs plus actual catalogue `RAW_BASELINE` rows;
retained-context count includes only actual `RETAINED_CONTEXT` rows. A legacy
41-row catalogue containing raw-baseline rows remains accepted, but those rows
are not relabeled retained contexts. For example, 184 positional inputs plus
41 raw-baseline catalogue rows reports 225/0, not 184/41. An exact 184/41
assessment receiver must separately require those actual semantic counts.
Admission metadata alone does not establish conversion outcomes or corpus credit.
The parent supplies the normal source/import hook, output and progress paths.
No limit, filter, journey, compile, execute, preparation or fetch flag is added.
The CLI's declarative `commitVerified` field remains unchanged; this separate
external proof does not counterfeit it.

The CLI currently applies explicit `--target` to raw TypeScript and requires
all catalogue targets to match. Admission therefore rejects
`CURRENT_CLI_TARGET_CONFLICT` rather than alter targets, silently use its
micro:bit default, or drop subjects. The frozen original Arcade invocation used
`--target arcade` and all contextual targets were Arcade. A genuinely mixed
catalogue with a distinct raw target needs a separately scoped CLI capability.
The complete original catalogue should use explicit `catalogue` mode, preserving
its 225 rows. A separately admitted 41-context catalogue plus 184 positional
originals remains supported through the unchanged default mode; it is not a
required projection of the original catalogue.

## Complete controls

`test/private-assessment-input.test.mjs` uses an owned synthetic Git repository
with 184 raw sources and 41 context subjects, including preserved synthetic
original-failure data. It checks exact staged catalogue and referenced original bytes, CLI order,
regular private staging, dirty/untracked and stale identities, wrong hashes,
path/schema/count/budget failures, actual Git symlink/gitlink refusal, root and
target mismatches, existing/symlink staging, later stage mutation and sanitized
errors, including an actual append after the original admitted file stat
with bounded original reads. Git setup is batched; no real private corpus is used. Run the complete
module under the assessment controller's existing local resource limits.
Synthetic controls do not establish current-corpus fit, original-SDK behavior,
converter results, network/container isolation or encrypted-output acceptance.

The eighth complete group creates a separate actual Git catalogue containing all
225 subjects. It verifies exact preservation of 184 raw lineage records and 41
original outcomes, zero positional arguments, explicit physical/semantic proof
counts, and refusal of wrong order, kind, count, mode or mixed positional input.
Only the root qualification executes this synthetic Git setup; no real corpus
read or conversion is needed to author these controls.
