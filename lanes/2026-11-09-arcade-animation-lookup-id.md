# Arcade animation export: lookup `id` argument without `"" +`

Status: claim and change in one PR. Owner: Arcade exporter lane (the exporter
part of the 2g animation-export row; the Array-authority part belongs to the
importer lane). Base: main `a4c2b442cdf3`.

Scope: the animation lookup call in
`overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js` (and its integrated
copy), the assembly-time fallback beside 2e's, one `export` keyword on the
existing `constantStringVariable` in `animation-frame-array-producers.js`, new
`test/arcade-animation-lookup-id-literal.test.mjs`, GUI-scope listing. No
authority, importer, pin or workflow change.

Problem: the first export emits `__bwAnimationFrames("" + "<id>")` (or
`"" + key`). The reimport lowers `"" + x` to a generic addition, so the second
export calls `Game___bwAnimationFrames(__bwBinaryAdd("", "<id>"))`, typed `any`,
and refuses `Game___bwAnimationFrames.id requires String` (and the Fresh twin).

Change: a string-literal resource is passed as is. A resource global whose
actual writers are all String, or a never-written global holding a saved
string (the animation producers' own `constantStringVariable` rule, now
exported), is passed by name; if its final declaration is not string the call
is rewritten back to `"" + key` at assembly. Any other resource keeps `"" + x`.

Evidence: for the literal and the constant `(key)` resource the first export
compiles and runs in original PXT with the expected log, and the second export
has no `id` refusals. A key also written with a Number by another script keeps
`"" + key`. Mutations: the literal rule off fails the literal test (also with
its textual assertions removed, on the second-export `id` refusal alone); the
key rule off fails the key test. The full
`makecode-arcade-animation-resources-export` fixture keeps its TODO: its three
Array-authority refusals are the importer lane's change.
