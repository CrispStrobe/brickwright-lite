# Arcade intrinsic dialog and drawable subclass design

Status: proposed bounded integration design. No new source admission, original
execution, authoring qualification or whole-project compatibility is claimed.

## Scope and primary authority

The selected target is Arcade 4.2.1 / PXT 13.2.1. Its immutable
[package manifest](https://github.com/microsoft/pxt-arcade/blob/2d7d59b5226e8a1a1e05e8042dd9f5248ed68fea/package.json)
selects pxt-common-packages 14.1.4. The seven game source files below were checked
byte for byte against that selected target's bundled source. Their
[component license](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/LICENSE)
is MIT; retain its copyright and permission notice when integrating source.

| Source | Selected source SHA-256 |
| --- | --- |
| [textDialogs.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/textDialogs.ts) | `d52d1c046debe4f889f2a82792882de2358f68233037cf4ca42cbfdf3d408caf` |
| [extendableSprite.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/extendableSprite.ts) | `5deac86004236ed206f821987efe310e8217e6e581e446e23bfe70ca2b95931b` |
| [basesprite.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/basesprite.ts) | `fb70c1b080b984c10a6cdd0883f7c3cc72a1fa2262e8f0290cf04b34edba8363` |
| [sprite.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/sprite.ts) | `c452013b5ddea08284a6d9e6ee34e86fdc59df2dead6f34cf12d01a2dda2d4da` |
| [scene.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/scene.ts) | `33fdb3e4e549da2607c35d93238d51db0497771bd141ae4d9aaa0fb41992669f` |
| [camera.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/camera.ts) | `bd3b65d226b52fc2d325df51801256c34dc7ccbedb7d8a6d19c14767d0f804dd` |
| [renderable.ts](https://github.com/microsoft/pxt-common-packages/blob/v14.1.4/libs/game/renderable.ts) | `a0648979d80b95c6e54662ca0c06cf3dacd58240e1426c4a5d48b90734052b97` |

## Complete project demands

These four retained Microsoft tutorial contexts compile successfully with the
selected original target. Their package inputs are retained and MIT licensed.
A pure structural scan still diagnoses their missing semantics; compiler
success does not establish runtime, GUI or game compatibility.

| Context | Authored demand |
| --- | --- |
| [Arrow, 5d0c02f598d4eda3](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/arrow.md#20) | Carnival ball and custom terminal dialog; Arrow artwork package v0.0.11 |
| [Horse, 90a0e61d3299702c](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/horse.md#6) | Carnival terminal and supporting Sprite utilities; horserace artwork v0.0.8 |
| [Birthday, c2576ea38bf22bfe](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/birthday.md#18) | Carnival ball, countdown and custom terminal dialog |
| [Football, 7cf6f6fa5b8ff423](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/football.md#5) | Plain game.Dialog plus Renderable callbacks, camera and scaled-font drawing |

Football does not declare a BaseDialog or ExtendableSprite subclass. Its
intrinsic demands share the drawing substrate but require separate callback
and font work.

The Carnival input is
[carnival.ts v0.0.7](https://github.com/microsoft/arcade-carnival/blob/v0.0.7/carnival.ts),
SHA-256 `6530f15cbddbc41419a59a41e8c13276eb6ac65645c04d02e899826c08e3f765`.
Its MIT GameOverDialog extends game.BaseDialog at line 506, overriding update
and drawTextCore. Its Ball extends sprites.ExtendableSprite at line 789.
Ball's constructor captures this in scene.createRenderable draw/visibility
callbacks and creates a distinct moon Sprite. Preserving those closures is a
separate prerequisite for the complete Ball implementation.

Football's MIT package snapshot is
[pxt-kickoff c2c7f819](https://github.com/microsoft/pxt-kickoff/tree/c2c7f8193af1dafaebda3a7cda235df4c42b87ae).
[textUtil.ts](https://github.com/microsoft/pxt-kickoff/blob/c2c7f8193af1dafaebda3a7cda235df4c42b87ae/textUtil.ts),
SHA-256 `40be1c525494004354881d355ba6dc9025268cf4706617f5adae3b54ad7fdd28`,
constructs game.Dialog, exposes its image through a real Sprite, updates it in
a parallel fiber, and destroys that Sprite after authored controller A input.
Its instruction renderable captures text and a scaled Font object. The cached
immutable snapshot, not a current branch, is the source authority.

## Existing foundation and boundary

The current runtime already has a managed object heap, class method tables,
constructor continuations, native Sprite identity adapters, and bounded
BaseDialog/SplashDialog hosts using selected SDK code. The current importer
explicitly refuses user SDK Dialog subclasses and Sprite drawing, update and
hitbox overrides. Those refusals remain until the corresponding dispatch is
qualified. No source or helper body is dropped to make a project appear valid.

The first proposed slice uses the existing class method descriptors and managed
procedure calls. It does not require the proposed five general callable words:
a named virtual method is not an escaped first-class function value.

## First slice: BaseDialog subclass method dispatch

### Data and constructor contract

Keep one managed class reference backed by one genuine SDK BaseDialog state.
Inherited image, frame and cursor fields expose the same image resources to
source code, aliases and drawing. Numeric fields preserve their live values:
columns, rows, unit, innerLeft, innerTop, cursorCount and textColor. Font remains
an actual SDK object; unsupported Font exposure stays a named diagnostic.

BaseDialog construction sets cursorCount then invokes resize. Resize selects
frame/cursor/module defaults, creates a fresh image, computes layout, and invokes
border and interior drawing. A derived resize/border/interior override is
constructor-reachable before derived initialization. The first slice admits
only subclasses that do not override these constructor-reachable methods;
other overrides remain diagnosed. That restriction must be explicit in source
and editable class metadata.

Resize replaces image identity while preserving frame/cursor aliases. A Sprite
already holding the old image continues to hold it until authored setImage.
Construction, field initialization, parameter properties and source-side
callbacks retain selected-compiler order and canonical undefined values.

### Virtual method contract

Admit drawTextCore and update overrides with the exact source signatures and
visibility. Expose inherited clearInterior and drawCursorRow to qualified
subclasses without making protected implementation methods public.

BaseDialog.update clears the interior, invokes virtual drawTextCore, then draws
the cursor. A JavaScript override that merely returns a Promise is insufficient:
the SDK caller would proceed before the managed method completes. Use an owned
serial dispatch continuation that preserves this sequence. Calls made through
a BaseDialog-typed reference reach the derived method; explicit super.update
uses the base method but still reaches the derived drawTextCore slot.

BaseDialog is not automatically a Scene Sprite. An explicit method call on a
live dialog alias remains valid across scene push/pop; do not invent creation-
scene membership or dispose it with a scene. Module defaults retain their
original shared lifetime. When a method participates in a frame-owned drawing
operation, that frame continuation retains its scene authority separately.

SDK-internal virtual call edges also participate in selected-compiler method
reachability. In particular, using base.update retains the derived
drawTextCore slot even when no source statement calls it directly. Descriptors
must record these actual intrinsic edges; an empty native method body must not
cause an override to disappear during whenUsed filtering.

Every operation retains the actual receiver, owner generation and source caller.
The continuation uses the existing shared execution budget,
yield and cancellation rules. Stop, disposal, project replacement or an invalid
receiver prevents queued work from changing a new owner. Do not change global
clock values, add frame skips, or recursively step an unrelated VM thread.

The first acceptance control can paint through existing image setPixel/fillRect
methods. Carnival's actual printCenter, screen.isMono, Font and terminal sound
requirements remain separate diagnosed work until individually qualified.

## Later slice: ExtendableSprite and scene drawing

A subclass instance has one physical Sprite body and one source identity.
Base-typed aliases, its sprite getter returning this, created handlers, kind
queries and Sprite collections must refer to that same object. A replacement
ordinary Sprite or duplicate registration does not satisfy this contract.

The selected constructor runs Sprite initialization, sets the supplied kind,
adds the same body to physics and invokes matching created handlers before
setting hasCustomDimensions false. Handler matching uses the supplied kind
argument. Omitted kind and a normalized kind value must not be conflated without
original evidence. Created callbacks can observe incomplete derived state.

The scene updates camera and invokes SpriteLike.__update at prerender priority
55, after physics and user update. ExtendableSprite runs inherited Sprite update
before its public update, supplying eventContext.deltaTimeMillis. Rendering at
priority 90 sorts by z then assigned id. Sprite drawing computes camera-adjusted
integer coordinates, honors RelativeToCamera and culling, and dispatches the
public draw override. Explicit super.draw retains original image drawing.

setDimensions stores fixed-point width/height, preserves those dimensions
through image/scale changes and changes hitbox construction. This requires real
physics geometry; drawing a resized wrapper is insufficient. Custom dimension,
transparent-image, negative/fractional and lifecycle behavior need original
controls before admission.

BaseSprite and Renderable have scene ownership rather than ordinary collision
membership. Renderable invokes its callback with the live screen and Camera;
visibility is a separate callback. Football and Carnival's captured renderable
callbacks require the proper callable ABI. Camera logical offsets and drawing
shake offsets remain distinct. No callback argument is replaced by a copied
image or an invented camera record.

## Portable authoring contract

Class metadata must preserve the intrinsic parent, source constructor origin,
method owner/signature/visibility and explicit super calls. Existing editable
Code class procedures and their saved block mutation/descriptors remain the
representation; add vocabulary only if an actual operation cannot be represented.
Direct fixed fields use actual field schemas. Do not encode class eligibility in
a project-wide flag or unknown mutation attributes lost on reload.

A graphics journey must edit the frame artwork through the actual costume/image
editor, edit an override pixel/color or dimensions in Blocks, pass through Code,
and save a fresh SB3. Actual selected-SDK export execution and reimport must
retain all pixels, image alias/replacement behavior and method call order.
Changing a frame must affect native output and exported artwork. The visible
IDE test uses an admitted official artifact and served source bytes; a Node
roundtrip does not qualify this GUI path.

## Acceptance controls before source admission

1. BaseDialog subclass drawTextCore and explicit super.update: exact method
   counts, order, constructor fields, image aliasing and all image pixels.
2. Resize: fresh image identity, unchanged old-image alias, live frame/cursor
   aliases and frame edits through Code, Blocks, saved SB3 and export/reimport.
3. Constructor-reachable override counterexample: selected-original observation
   plus an explicit importer refusal while that dispatch is outside the slice.
4. Managed override pause, replacement and Stop: exact source completion and
   no stale mutation, if asynchronous override support is proposed.
5. ExtendableSprite constructor: one scene/physics insertion and one matching
   created-handler delivery; derived fields observed at the real callback point.
6. Update/draw: source event order, actual delta, camera/world coordinates,
   super drawing, z/id ordering, visibility/culling and full frame pixels.
7. Dimensions/hitbox: image replacement, scaling, transparency and collision
   observables under authored controller input.

Original controls must compile and execute unchanged on the selected SDK before
native equivalence is asserted. Source and newly exported files have separate
binary authority. Deterministic clocks use a real timed source platform and an
observed initial frame; stochastic camera shake is not made deterministic by
patching or seeding the SDK. Keep failed controls and unsupported boundaries.

This slice removes a genuine shared ABI refusal but does not promise to close
any complete project by itself. Callable fields, callback arrays, fonts,
additional Scene APIs and whole-game/controller/GUI paths remain explicit.

## Proposed original control sources

These independently authored fixtures are complete source programs, not
original execution evidence. Compile and observe them unchanged before
asserting their expected constructor or frame behavior.

### BaseDialog method and image identity

```typescript
// Proposed original control; compile/runtime authority is pending reservation.
class Card extends game.BaseDialog {
    calls: number;
    constructor(frame: Image) {
        super(24, 16, frame);
        this.calls = 0;
    }
    drawTextCore() {
        this.calls += 1;
        this.image.setPixel(5, 6, this.calls + 3);
    }
    tickBase() {
        super.update();
    }
}
let frame = img`1 1 1
f 3 f
1 1 1`;
let card = new Card(frame);
let oldImage = card.image;
card.update();
let firstCalls = card.calls;
let firstPixel = card.image.getPixel(5, 6);
card.resize(27, 17, frame);
let freshImage = oldImage !== card.image;
let frameAlias = card.frame === frame;
card.tickBase();
let secondCalls = card.calls;
let oldPixel = oldImage.getPixel(5, 6);
let newPixel = card.image.getPixel(5, 6);
```

### Constructor virtual-call counterexample

```typescript
// Proposed original counterexample; selected compile/runtime evidence pending.
let setupTrace = "";
class ConstructorCard extends game.BaseDialog {
    marker: number;
    constructor() {
        super(24, 16);
        this.marker = 7;
    }
    resize(width: number, height: number, frame?: Image, font?: image.Font, cursor?: Image) {
        setupTrace += this.marker === undefined ? "U" : "X";
        super.resize(width, height, frame, font, cursor);
    }
}
let setup = new ConstructorCard();
let observedSetupTrace = setupTrace;
let initializedMarker = setup.marker;
```

### ExtendableSprite creation and drawing

```typescript
// Proposed original control; compile/runtime authority is pending reservation.
let trace = "";
let created = 0;
let createdKind = 0;
let sourceKind = SpriteKind.create();
sprites.onCreated(sourceKind, function (sprite) {
    created += 1;
    createdKind = sprite.kind();
    trace += "C";
});
class Painted extends sprites.ExtendableSprite {
    updates: number;
    draws: number;
    lastDelta: number;
    lastLeft: number;
    lastTop: number;
    constructor(im: Image, kind: number) {
        super(im, kind);
        trace += "D";
        this.updates = 0;
        this.draws = 0;
    }
    update(ms: number) {
        this.updates += 1;
        this.lastDelta = ms;
    }
    draw(left: number, top: number) {
        this.draws += 1;
        this.lastLeft = left;
        this.lastTop = top;
        super.draw(left, top);
        screen.setPixel(left, top, 7);
    }
}
let painted = new Painted(img`2 2
2 2`, sourceKind);
painted.setPosition(30, 40);
let alias: Sprite = painted;
let sameIdentity = alias === painted;
let constructorTrace = trace;
let sameKind = painted.kind() === sourceKind;
```
