# Bounded Arcade BaseDialog subclasses

The native class bridge supports `game.BaseDialog` subclasses overriding
`drawTextCore()` and `update()`. The selected target is Arcade 4.2.1 / PXT
13.2.1, with [pxt-common-packages 14.1.4](https://github.com/microsoft/pxt-arcade/blob/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea/package.json).
The original [textDialogs.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/textDialogs.ts)
defines the drawing sequence and image layout. Its selected SHA-256 is
`d52d1c046debe4f889f2a82792882de2358f68233037cf4ca42cbfdf3d408caf`.
The existing generated SDK implementation retains Microsoft's
[MIT notice](../overlay/scratch-gui/static/licenses/pxt-common-packages.MIT.txt).

## Runtime contract

Each instance uses the actual SDK BaseDialog body and the existing managed
class reference. Native fields expose its real image and frame aliases;
source fields retain their managed object storage. A resize creates the SDK's
new image while references to the old image remain valid.

Calling the base `update()` executes `clearInterior()`, the dynamically selected
`drawTextCore()`, and `drawCursorRow()` in that order. An authored pause in the
override completes before cursor drawing. Stop, project replacement, disposal,
or a cancelled caller invalidates the pending continuation. BaseDialog does
not acquire automatic scene membership.

Source import and edited class metadata both refuse constructor or layout
overrides that require further qualification, including `resize`, `drawBorder`,
`clearInterior`, and `drawCursorRow`. SplashDialog subclasses remain refused.
Font objects, ExtendableSprite physical subclassing, and constructor-reachable
virtual continuation are separate work. Selected PXT rejects instance field
initializers using `this`; this bridge preserves that diagnostic.

## Authoring and tested boundary

The existing managed class declarations, methods, image references, and artwork
remain editable in Code and Blocks. The focused control uses an independently
authored frame, overrides `drawTextCore`, calls `super.update()`, resizes, and
reads both old and new image aliases.

Selected original execution and newly exported original execution agree on
seven scalar observations and every pixel of the two images (843 pixels total).
Native execution, Code reconstruction, same-VM reload, a fresh saved-project VM,
and export/reimport preserve those observations. Separate native controls cover
an authored pause and cancellation before cursor work, plus metadata refusals.
These are bounded class and authoring controls. Hosted GUI interaction,
whole-project compatibility, scene cadence, and complete Carnival games have
not been qualified by this change.

Run `test/makecode-arcade-base-dialog-subclasses.test.mjs` together with
`test/arcade-sdk-dialog-descriptors.test.mjs` using the repository's integrated
VM and original-target prerequisites. The full route test executes both the
source and newly exported original program; it does not substitute cached
results for those executions.
