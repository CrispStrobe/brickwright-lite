# List monitor dependency import boundary

Status: proposed ownership contract. Implementation waits for this claim's
normal qualified merge. A source dependency cutset does not establish a new
bundle size or qualify the visible widget.

## Bounded change

The list monitor requests only `List` from the adopted `react-virtualized`
package. Its current root import reaches the library's ES-module barrel, not
its CommonJS build, and also includes unrelated component implementations.
The existing `react-virtualized/dist/es/List` entry reexports the same adopted
`List/List.js` implementation through its named `List` export.

Own an overlay of
`overlay/scratch-gui/src/components/monitor/list-monitor-scroller.jsx` and its
tracked integration mirror
`packages/scratch-gui/src/components/monitor/list-monitor-scroller.jsx`.
Change only the dependency import boundary to that existing named export.
Preserve the entire widget body, props, row rendering, localized strings,
accessibility, keyboard and activation behavior, current data, layout, scroll,
resize and lifecycle. Preserve the actual List/Grid implementations and their
required transitive dependencies; do not substitute another widget.

Own narrow production-resolution and real-widget regression controls,
documentation and this lane entry. Coordinate another shared source path before
editing it. The editor startup painter-presence work remains separately owned;
this claim does not extend that scope or permit an artwork module refactor.

## Source and integration proof

Resolve the direct entry through normal production dependency and webpack
rules. Prove that the root named export and direct named export reach the same
adopted List implementation, including its actual Grid, sizing, accessibility,
scroll and timing helpers. Bind the package version, source and module graph;
a path spelling or mocked component is not implementation identity.

Review every removed eager dependency's initialization effects. Removing an
unused component definition is not permission to remove an effect needed by
List or another actual consumer. Inspect listener and resize registration and
shared timing state at their actual call boundaries. Retain required effects;
if the existing initialization contract is uncertain, preserve a named hold
rather than asserting the whole barrel is side-effect free. Keep every other
actual package consumer and its independent import semantics.

Use the owned override and normal integration/mirror machinery. Preserve
upstream copyright and license notices. Do not patch the installed dependency,
copy a competing component implementation, add an alias, alter package export
policy, or declare a package-wide `sideEffects` override.

## Acceptance

Focused controls must exercise actual normal package resolution and the exact
owned integration pair. Real browser controls must render empty and long lists,
scroll to actual later rows, update visible list contents, edit and activate
rows, resize the monitor, and save/reopen the actual current project. Preserve
full data, localized labels, accessibility and widget callbacks. Keep existing
assertions and full raw errors and partial results; no forced internal scroll
state or synthetic rendering may replace the real widget.

Qualify the affected production artifact and its actual source tree. Run the
unchanged initial-JavaScript budget on the resulting normal build. Dependency
source sizes and a predicted cutset are not minified savings; a reduced graph
does not itself close the budget failure. Retain original failed artifacts and
measurements. No threshold, baseline, workflow, dependency pin, public API,
locale set or lazy application behavior changes are authorized.

Pure source and resolution controls do not qualify browser behavior, native
game execution, graphics editing or whole-project compatibility. Those
boundaries remain independently tracked. This claim makes no corpus-count or
whole-game promotion and authorizes no SDK or runtime change.
