# MakeCode CLI integrated GUI module boundary

## Claim and purpose

Proposed ownership contract. Merge this documentation claim before implementing
its source changes. The existing CLI target work remains complete; this claim
repairs how the CLI reaches those libraries in an ordinary installed checkout.

A plain Node CLI subprocess currently imports GUI libraries from `overlay/`.
That location is outside the integrated GUI package's normal dependency scope.
A GUI library's canonical VM module import can therefore fail even when the
VM is correctly installed for the GUI. Test loader fallbacks and a successful
webpack build do not qualify that plain CLI route.

## Owned surface

- The library-loading boundary and prerequisite diagnostics in
  `scripts/makecode.mjs`.
- An optional focused helper under `scripts/lib/` for inspecting the actual
  integrated GUI source and its normal installed dependency scope.
- The exact dependency-free overlay exception in
  `scripts/lib/gui-scope-hooks.mjs`, coordinated with its owner. Installed
  consumers must retain normal package resolution and the existing declared,
  logged GUI scope behavior.
- Focused CLI, package-resolution and prerequisite controls, and the relevant
  MakeCode documentation. Coordinate any necessary integration receipt hunk
  before editing its producer; broad integration changes are outside this claim.

No translator, runtime, VM ABI, canonical model implementation, supplier pin,
workflow or GUI behavior change belongs here. Other owners retain their files.

## Required module and source proof

For the installed route, load the current integrated GUI source libraries from
that package's real source directory. Resolve their dependencies using normal
Node package rules, including the exact existing public VM subpath export and
its physical canonical model file in the same installed VM package. Do not
substitute an overlay model merely because an installed import failed.

Establish actual package locations, relevant installed versions and exports,
and current integration prerequisites before selecting a source route. A
package name, existing directory, historical build result or unverified stamp
alone is insufficient. Inspect the real integration/copy/transform contract for
the consumed files; generated or transformed files need their own correct
provenance, not an invented requirement to match untransformed source bytes.
Do not require every generated file to match an unrelated Git object hash.

Local source integration, vendoring and installing the declared dependencies
may be prerequisites. Conversion remains headless: no frontend build, browser,
GUI launch or downloaded frontend artifact is required. Preserve the current
command-specific runtime requirements; source-only conversion must not acquire
a new compiler, board runtime or engine requirement merely to resolve a module.
The prerequisite checker must inspect metadata/files without compiling or
executing the user's project.

Missing, stale, conflicting or uncertain installation must produce a named
existing-category prerequisite refusal with the original details retained.
Do not silently choose older libraries or regenerate/repair shared installations
inside a conversion request. Preserve existing exit-code meanings and the
current verbs, targets, aliases, options, outputs and diagnostics.

Dependency-free pure library/corpus consumers keep their explicitly bounded
owned source route. Restrict the exact overlay model exception to that actual
mode and importer. Do not turn a missing installed package or export into a
successful pure fallback. Broader dependency-free CLI packaging is a separate
requirement if the actual existing command contract needs it; it is not granted
by a test-only resolution hook.

No webpack alias, `NODE_PATH` substitution, hidden subprocess loader, fake root
package, model copy/stub, broad export wildcard or fallback based only on a
missing-module error may stand in for this installed module boundary.

## Acceptance and preserved failures

1. Run the ordinary documented CLI through plain Node with a normal prepared
   integrated GUI dependency tree, without custom loader or module-path flags.
   Exercise current import and export conversion commands across the supported
   targets, including a real current-project conversion roundtrip. Preserve all
   partial outputs and every provided diagnostic/refusal channel before asserts.
2. Show the actual resolved GUI library and VM package/model locations. Verify
   the CLI and installed GUI consumer use the same physical canonical module
   from that package, without granting new type or value authority from identity.
3. Prove genuinely dependency-free pure consumers still use only their narrow
   route. Refuse a different importer, absent installed export, stale source,
   conflicting package or uncertain integration instead of masking the failure.
4. Retain all existing CLI target, artwork, metadata and error/exit behavior.
   Verify current project bodies, resources and edits survive the affected
   conversion path. No original-source or cached-result restoration may hide a
   current conversion failure.
5. Keep the original package-resolution and all other observed failures.
   Array producer refusals, clock-origin defects and other CI failures require
   their own diagnoses; duplicate module identity is not an established cause
   of those failures. Source controls alone do not qualify a build, affected
   guest, GUI, compiler or full project compatibility.

Use the repository's existing source and affected qualification gates. This
claim authorizes no manual CI dispatch, dependency update or compatibility-count
promotion. See [MakeCode commands](MAKECODE.md) and the
[Arcade handoff](ARCADE-AGENT-HANDOFF.md) for the existing consumer requirements.
