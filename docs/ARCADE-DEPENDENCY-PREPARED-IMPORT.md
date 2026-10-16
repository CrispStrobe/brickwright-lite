# Dependency-prepared Arcade import

Status: claim merged; source implementation candidate. Source controls, actual
package preparation and visible authoring qualification remain separate gates.

## Problem and scope

The synchronous project importer translates the files supplied to it. The CLI
already offers explicit dependency preparation, while the browser file and
share-link routes call the importer without that preparation. An exported
project can therefore declare a real dependency yet lose its declarations,
resources and initialization when immediately imported again.

Provide one shared asynchronous preparation/import boundary for Arcade project
files. Browser file and share-link imports and the CLI's explicit dependency
preparation route must use it. Complete-project conversion profiles must exercise
that same public helper, including on the actual current exported project.
Preserve the existing synchronous importer and its offline behavior.

Owned paths: the new shared helper and focused tests under the MakeCode import
library; coordinated wrappers in `index.js` and `pxt-runtime.js`; file/share
integration in `pseudocode-importer.jsx`; the existing CLI and Node resolver
integration; focused browser/CLI controls; this contract, `LANES.md` and the
Arcade handoff. Preserve unrelated compiler, graphics and native runtime lanes.

## Dependency authority and diagnostics

Resolve the exact dependencies declared by the input project's current
`pxt.json`, including package subpaths and version/ref identities. Retain
provenance, fetched-source hashes, license observations, resources and source
order through the existing preparation machinery. Keep the original project
files separately and unchanged; internal prepared files are a translation view.

For export/reimport, the dependency authority is the current exporter output.
A previous imported project's prepared files or resolved snapshot must never
replace it. A cached resolver may supply matching package source bytes only
after checking the current declared dependency identity; changed or missing
identities must not silently select another package.

Use the existing remote-extension policy and explicit fetch options. Preserve
bounded loading and named failures for disabled fetching, unavailable packages,
unsupported refs and ambiguous/conflicting identities. Do not introduce an
unconditional network fallback or grant API authority from dependency names.
Retain preparation diagnostics independently from final translation diagnostics,
including warnings and exceptions; a failed or unknown stage is not clean.

## Execution boundary

The SDK glue has a package-input preparation branch for `projectInputs: true`.
The current browser worker transport does not forward that option. Add an
explicit preparation operation and expose it without compiling the user's
program; a compile request that drops the option is not preparation. The Node resolver and browser resolver supply the same shared helper
contract. Package loading and asset generation still execute SDK preparation:
source-only tests do not qualify that execution. Any actual SDK preparation
needs its separately reviewed finite execution plan and retained evidence.
This lane authorizes no reference compile, original simulator run, native game,
hardware operation, dependency-pin adoption or whole-project promotion.

## Acceptance

- Browser file/share import and CLI dependency preparation exercise the same
  shared helper and preserve current input files, dependency identities and
  diagnostic channels. The synchronous importer remains usable offline.
- A current exported project with a declared extension imports with that
  extension's actual declarations/resources and preserved initialization order.
  Test a changed current dependency as well as an unchanged one; original
  imported source must not repair either route.
- Missing, disabled, mismatched, conflicting and unsupported dependency inputs
  fail visibly. Resolver exceptions and partial translations remain observable.
- Cached-source controls prove exact dependency binding and cannot admit a
  different package/ref or a stale root project's files.
- Browser completion respects the existing current-request/current-stage guard:
  late preparation cannot replace a newer project or an unmounted editor.
- Retain affected Code/Blocks, save/reopen and current edited export/reimport
  evidence. Real package preparation, native behavior, selected originals and
  visible authoring remain separately labeled qualification gates.

Free throw's current clean export and unprepared reimport are a regression
case, not a special-case implementation or permission to prune helper bodies.

## Implemented source boundary

`index.js` exposes `importProjectFilesWithDependencies(files, options)`. It
captures the current string file map before awaiting and returns those original
files and main source separately from the internal prepared translation view.
Options include `target`, `name`, `version`, `animationResources`, explicit
`fetchExtensions`, optional `fetch`/`baseUrl`, and an optional
`resolveProjectInputs(target, currentFiles, resolverOptions)` adapter. Node's
existing resolver implements that adapter. Without one, the helper lazily loads
`resolveProjectInputsMakeCode` from the browser runtime module. Loading the
importer does not start an SDK worker.

The async entrypoint prepares Arcade TypeScript by default. Passing
`prepareDependencies: false`, or supplying another target/language, delegates
to the existing synchronous reader. Artifact and share wrappers use preparation
only when explicitly passed `prepareDependencies: true`. Browser file/share
calls select that route; CLI conversion selects it only with
`--fetch-extensions`. A resolver receives a separate copy of the captured file
map; changing that copy refuses instead of changing input authority.

`dependencyInputs` records actual declared dependencies, resolved source order,
preparation provenance, runtime configuration and fetched package facts.
Resolution, preparation and translation each retain separate diagnostic
channels, including whether a channel is absent, undefined, null or an array.
A stage exception carries its stage, original cause and explicit bounded error
details. Nonempty preparation messages are also presented independently from
translation warnings. Unsupported translation remains partial.

The browser uses an explicit `resolveProjectInputs` worker message. It calls the
owned package-loading glue with `projectInputs: true` and `native: false`, and
returns before the source compiler service. It supplies no firmware-base
callback. Worker creation, initialization, successful return and failure have
owned cleanup paths. Error envelopes retain package identities, refusals and
diagnostics; unavailable oversized or non-data details have a named marker.
The package resolver refuses conflicting identities for the same declared alias
and multiple matching source candidates. Distinct aliases remain distinct.

File/share completion checks the current request, current Stage and mounted
editor before publishing buffers, artwork or status, including failed reads and
preparation errors. A stale lazy module load cannot start preparation. Unmount
invalidates the request. Dependency provenance is attached to the existing
`bwMakeCode` record for the unedited imported translation; its existing save/load
path preserves extra record fields. The CLI also retains its dependency ZIP
sidecar. Neither record is an input to current-export dependency resolution.

Authored source controls exercise wiring, current snapshots, stage failures,
diagnostic presence, record save/load, actual worker/glue early-return logic
against explicit SDK method stubs, and deferred actual editor methods. These
are not actual SDK preparation, browser, guest, runtime or full compatibility
results. Free throw's real current export, real matching cached dependencies,
CLI execution, save/reopen and visible current art/code edits still need their
own bounded integration qualification.
