# Fixed-instance JRES image initializers

The dependency input preparation helper can materialize an existing PXT image
initializer from its actual resolved resource. This is a translation view; the
original package and project maps remain unchanged. It does not admit an entire
library, remove helper bodies or establish compilation success.

## Source contract

An eligible initializer is a namespace-level exported constant whose adjacent
compiler annotations include `fixedInstance` and `jres`, and whose actual parsed
initializer is exactly `image.ofBuffer(hex``)`. The bounded spelling currently
occupies one source line. A nonempty buffer or another expression remains
unchanged. The existing asset-pack `gallery.ts` path retains its previous scope.

The constant's qualified namespace/name must identify one actual declaration,
one package's `resourceIds` entry and the matching resolved JRES entry. Its ID,
namespace, `image/x-mkcd-f4` MIME type and base64 encoding must agree. Indexed
pixels come from the decoded resource, including an actual root override; no
artwork is guessed from a label or filename. Invalid or ambiguous evidence
refuses with a `Fixed-instance JRES image:` diagnostic.

Before replacing a call, the helper checks the configured root TypeScript,
generated root companions and actual dependency source order together. Unknown
executable syntax refuses this proof. SDK `image`, `hex` and the introduced `img`
binding must remain unshadowed at the initializer. Configured writes, escapes,
`image.ofBuffer` extraction and ambient dynamic mutation routes refuse, including
those in later unused functions. Unconfigured files do not supply authority.
This deliberately conservative census can refuse otherwise valid programs; it
must not silently discard those programs' effects.

Only the initializer byte range changes to an indexed `img` literal. Declaration
names, order, annotations and all other bodies remain. Each declaration therefore
still has one initializer at its original source position. The preparation
sidecar records resource ID, namespace, original resolved resource metadata,
tile-map tile flag, effective palette, dimensions, indexed pixels and root
override status. Original root art bytes remain untouched.

## Qualification and remaining acceptance

Focused authored controls cover exact pixel values, byte preservation, resource
ownership, root overrides and unsafe source mutations. They do not by themselves
qualify the native runtime, compiler, graphics editor or current export path.
For a real project, qualification must additionally show:

- actual dependency preparation preserves every retained declaration and helper;
- image allocation, aliasing and subsequent mutation retain the original identity;
- native execution uses the exact indexed pixels and effective palette;
- editable artwork and tile-map flags survive project save and reopen;
- a current art edit reaches current export, reimport and actual MakeCode output.

A prior successful original compile does not grant these results, and materializing
images alone does not make the rest of a dependency's APIs supported. Unsupported
features and original failures remain visible until separately implemented and
qualified.
