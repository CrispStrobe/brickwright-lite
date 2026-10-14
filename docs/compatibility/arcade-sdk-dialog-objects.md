# Arcade SDK dialog objects

Brickwright supports a bounded object bridge to the selected MakeCode Arcade SDK's `game.BaseDialog` and `game.SplashDialog`. The native adapter invokes the existing generated MIT SDK dialog bodies; it does not replace a custom dialog helper with a modal or remove its source.

## Authoring surface

| Class | Constructor | Supported public members |
| --- | --- | --- |
| `game.BaseDialog` | `(width, height, frame?, font?, cursor?)` | `resize(width, height, frame?, font?, cursor?)`, `update()`, `setText(rawString)` |
| `game.SplashDialog` | `(width, height)` | inherited methods, `setText(text)`, `setSubtext(sub)` |

Public image fields are `image`, `frame`, and `cursor`. Base numeric fields are `columns`, `rows`, `unit`, `innerLeft`, `innerTop`, `cursorCount`, and `textColor`. Splash also exposes `text`, `subtext`, `timer`, `offset`, `maxOffset`, and `maxSubOffset`. The declaration mirrors and source-signature checks live in `sdk-dialog-class-descriptors.js`, `sdk-dialog-classes.js`, and `test/arcade-sdk-dialog-descriptors.test.mjs`.

These objects use the existing class allocation, field, and call blocks. Their references are owned by the current runtime and project generation. Images retain their actual registered pixel storage: updating a dialog modifies its live image; resizing replaces the image while an older image reference keeps its previous storage. Project restart/load invalidates old dialog objects. Source names resolve lexically: bare `SplashDialog` is the SDK class inside `namespace game`; unrelated user classes with the same name retain their ordinary class meaning.

## Dimensions and limitations

Image allocation converts dimensions to signed 32-bit integers and accepts values from zero through 2000. The dialog receives the original fractional layout arguments. Thus resizing to `32.75` by `28.5` produces a `32` by `28` image without changing the arguments used to calculate its layout.

Actual original default-frame constructors accept zero-sized images and can complete with an undefined image for negative dimensions. Positive oversized dimensions can fault while drawing into an undefined image. Native reports the fault, but complete original-equivalent source termination after that fault remains unqualified. Custom frame paths that call image methods on an undefined receiver are also outside this bounded qualification.

Nonnull `image.Font` arguments, custom subclasses of these SDK dialog classes, protected drawing helpers, other dialog classes, and unknown members retain explicit diagnostics until their bridges are implemented and tested. This surface does not establish a complete native debugger, installed GUI authoring, or whole-project compatibility.

## Verification

`test/makecode-arcade-sdk-dialog-class.test.mjs` checks actual original and native SplashDialog fields, image identity, resize, and every pixel in the original and resized images through Code decompilation, MakeCode export execution/reimport, and same/fresh VM SB3 reload. Separate checks carry the observed default-frame zero/negative dimension cases through those same authoring routes and retain source ownership/unsupported-operation diagnostics. Reference-only checks are in `test/arcade-sdk-dialog-original.test.mjs`.

These are bounded runtime and conversion controls. Full custom multiplayer splash behavior, controller input, scene timing, original font alternatives, and actual production GUI journeys require their own acceptance records.
