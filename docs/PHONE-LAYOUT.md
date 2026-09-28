# The phone layout

Everything here was measured on a 430×930 viewport with `deviceScaleFactor: 3`,
`isMobile`, `hasTouch`. Where a number appears, a gate re-measures it; where a
conclusion was wrong first, that is recorded too, because the wrong version was
plausible and will be proposed again.

## The one fact that governs everything

**`window.innerWidth` is 1024 on every phone.** So is
`document.documentElement.clientWidth`.

`packages/scratch-gui/src/playground/index.css` floors `html, body, .app` at
`min-width: 1024px`, and `playground/index.ejs` declares

```html
<meta name="viewport" content="width=1024,minimum-scale=0.25,maximum-scale=5,user-scalable=yes">
```

The browser cannot honour a 430pt width against that, so it renders the 1024
layout scaled to fit: `visualViewport.scale` ≈ **0.42**.

Three things follow, and each one has cost time:

1. **`@media (max-width: 700px)` never matches on any phone.** A responsive rule
   written that way is dead code that reads as correct. If a CSS fix for a phone
   appears to do nothing, check `visualViewport.scale` before looking anywhere
   else.

2. **The signal for "small screen" is `visualViewport.width × visualViewport.scale`.**
   1024 × 0.42 = 430, which is the number that matters. It degrades to the window
   width where there is no scaling, so the same helper serves the desktop and the
   embedded cases. Implemented in
   [`overlay/scratch-gui/src/lib/touch-targets.js`](../overlay/scratch-gui/src/lib/touch-targets.js)
   (`effectiveWidth`, `isTouchWidth`) and, for the designer, in bw-circuit-ui's
   `src/hooks/narrow-screen.js`. Both subscribe to changes: rotating a phone
   changes the answer, so a value read once at mount is wrong for the rest of
   the session.

3. **`position: fixed` with `inset: 0` covers the LAYOUT viewport**, 1024×2215 —
   not what the reader sees. See "The modal that could not be reached".

## Why the 1024 floor stays

It is load-bearing. PR #368 removed it. CI refused the result — the browser gate
`designer resizes with a narrow window: floor holds` reported `mainWidth: 0` —
and a follow-up check found the **Circuit tab unreachable at 430**. The PR was
closed.

An earlier attempt to override the floor from CSS "worked" in the sense that
nothing complained: the rule targeted `.app`, but CSS Modules had renamed it
`index_app_<hash>`, so it matched nothing. The conclusion drawn from that
measurement — that the width was "structural, seven wrappers deep" — was wrong.

So the approach is not to make the app narrower. It is to **stop declaring a
width the app does not have** and let the browser scale, which is what the
viewport meta above does. The reader then sees the whole editor, and
`user-scalable=yes` up to 5× lets them zoom into any part of it.

## Tap targets are floored in CSS pixels, not on-screen points

Measured on the shipped build before any change:

| pane | visible controls | under 24 CSS px | at least 44 CSS px |
|---|---|---|---|
| Code | 29 | 4 | 0 |
| FPGA | 43 | 25 | 0 |
| Circuit | 489 | 316 | 124 |

The offenders are ordinary toolbar controls — a 16px "▦ Gallery", 18px "i"
buttons, 19px selects.

**The floor cannot be expressed in on-screen points.** At 0.42, a 44 CSS px
control shows as 18.5pt; reaching 44pt on screen would need 105 CSS px, which is
a banner and not a button. A 44pt on-screen target is not a promise this code can
keep, so it is not made. What a CSS-pixel floor gives is a control that is
comfortable once the reader pinches in — which the viewport meta now permits.

**It is one rule, not forty inline edits.** The panes concerned style every
button and select inline, with no shared style object and no `className`. But
none of them sets `min-height` or `min-width`, so a stylesheet rule setting only
those two wins uncontested: no inline style to fight, no padding or font-size
touched, nothing to keep in sync as those panes change. `test/touch-targets.test.mjs`
asserts the rule sets *exactly* those two properties, since that is the claim the
approach rests on.

**44 was chosen by measuring the objection.** The risk was that a `min-width`
would widen dense toolbar rows until content ran off the pane. Floors of 0, 32
and 44 were each applied and `document.scrollWidth` read on all six tabs: it
stayed at 1024 in every case. 44 costs nothing here, so there was no reason to
settle for less than the standard.

## The designer's three columns

In bw-circuit-ui, `CircuitDesigner` renders a parts rail, the canvas, and an
instruments column. Each declared its own minimum and none yielded:

| column | minimum |
|---|---|
| parts rail | 190 |
| canvas floor (`CANVAS_W`) | 700 |
| instruments | 280 |
| **total** | **1170 px inside a 430 pt screen** |

So the canvas box measured **700 px wide inside a 430 px root** and the bench ran
off the side of the device.

- The **canvas floor drops to 0** on a small screen. That floor is the narrow-*pane*
  story — a designer squeezed inside a wide window, where a scrollbar is the right
  answer and a 2px canvas is not. A phone is the opposite case: there the floor is
  what pushes the bench off the device. `minHeight` goes the same way; a landscape
  phone is 430 tall.
- The **rail starts closed**. Note this is `selectorsOpen`, *not*
  `partsOpen`/`examplesOpen`: those two only split the rail vertically — it stays
  `0 0 190px` either way — so collapsing them buys the canvas nothing. The first
  attempt moved the wrong state and measured no gain.
- The **instruments column takes the full width** when open rather than 280px
  beside the canvas. The canvas stays mounted, so its state survives, and the
  collapse button brings it straight back.

Landscape at 930 effective points deliberately keeps its rail: 190 of 930 is 20%,
the bench keeps 740, and the threshold means phone-*portrait*, not phone-anything.

## The modal that could not be reached

Reported from iOS as "cannot import a machine". The Machine Manager overlay used
`inset: 0`, which covered the 1024×2215 **layout** viewport and centred the dialog
**289 px below** the 930-tall band the reader could see. A `position: fixed`
element cannot be scrolled to, so there was no recovery.

`overlay/scratch-gui/src/lib/visual-viewport.js` `overlayStyleFor` sizes the
overlay to the visible band instead.

Two claims made along the way were wrong and are worth recording. First, "an
iPhone user cannot import a machine" — overstated. Then "a person can pan, it is
only an automation limit" — also wrong; the numbers above are why. And the first
containment check tested only left/right, so it **passed on the broken build**: a
containment check on one axis is not a containment check.

## Gates

| gate | what it holds |
|---|---|
| `scripts/verify-phone-fit.mjs` | both orientations; visual width ≥ layout width (scaled, not cropped); every tab reachable |
| `scripts/verify-phone-modal.mjs` | the overlay tracks the visible band, fitted *and* zoomed |
| `scripts/verify-tap-targets.mjs` | no visible control under 24 CSS px; and flooring them did not widen the page |
| bw-circuit-ui `scripts/verify-narrow-rail.mjs` | the bench fits the screen; the rail still opens; desktop unchanged |
| bw-circuit-ui `scripts/verify-touch-pinch.mjs` | two-finger pinch and pan reach the canvas and the schematic |

Two notes on writing gates for this surface.

**Assert that it fits, not that it is large.** An early check asked whether the
canvas took more than 90% of its root. At 700-of-430 it does, so the check
**passed on the broken build**. Running each new gate against the unfixed build
first is what caught it.

**Do not race a viewport event.** The overlay resizes in response to a
`VisualViewport` event that React then renders, so there is no moment at which
the new geometry is synchronously true. Probing immediately after a CDP scale
change passed locally and failed in CI with `overlay 1024x2215` against a
`179x388` band. Poll to a deadline instead; a build that never converges still
fails, it just takes the timeout to say so.

**Playwright's touchscreen cannot express a pinch** — it taps with one finger.
Multi-touch needs `Input.dispatchTouchEvent` over CDP, and page zoom needs
`Emulation.setPageScaleFactor`. Note the latter *composes* with the fit the meta
already applied, so asking for 2.4× produced a 179px band, a 5.7× zoom. Assert
something scale-independent there rather than a position.
