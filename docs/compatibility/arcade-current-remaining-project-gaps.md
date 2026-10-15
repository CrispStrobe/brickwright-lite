# Current complete-project conversion gaps

Updated 2026-10-15. Read the [handoff](../ARCADE-AGENT-HANDOFF.md),
[closure plan](../ARCADE-PARTIAL-CLOSURE-PLAN.md) and [authoring ledger](../CONVERSION-CAPABILITIES-AND-GUI-GAPS.md).

## What was actually refreshed

Development source `a32d6ef0a` and the complete qualified canonical compiler
`9d3e222eb` were used once on the same 29 retained original-compiler-valid
projects. Twelve original compiler failures remain excluded by their historical
results. Original files, genuine dependency context and raw snippets are unchanged.
This is a separate complete-context conversion profile, not the raw census.

| Gate | Earlier profile | Current profile |
| --- | ---: | ---: |
| Source and Creator clean | 20 | 20 |
| Clean export after a clean source and Creator | 20 | 20 |
| Clean export from a partial input graph | Not attempted | 2 |
| All measured pure stages clean | 18 | 18 |

The two additional export observations are from partial input graphs. They do
not represent compatibility improvements. The same eighteen project IDs pass
all measured pure stages. The run took 38.795 seconds; all 4,892 guards stayed
unchanged, eleven diagnostic controls passed and no network attempt occurred.
It ran no native game, SDK or browser. Independent review reproduced the stage
counts and checked exact retained input and output identities without rerunning.

All available diagnostic channels are retained independently, including Creator
warnings on a thrown parse. An explicitly returned undefined channel is unknown
and cannot pass a clean gate. Usable downstream graphs are inspected even after
a diagnostic, and are labeled partial. A required stage which throws leaves its
dependent outputs unavailable. Missing stages are never counted as clean.

## Eleven incomplete project routes

These rows describe capability groups, not counts of independent missing APIs.
Repeated diagnostics from complete helper dependencies remain in the evidence.

| Exact public source | First unresolved stage | Proper next capability |
| --- | --- | --- |
| [Harlem](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/harlem-globetrotters.md#33) (`102e28d4`) | Source / Creator | Story and Carnival classes, handler collections and genuine Font / SDK producers; unresolved helper calls. |
| [Free throw](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/free-throw-jr.md#13) (`5840453b`) | Reimport | Prepare the current exported project with its exact declared arcade-text dependency. A prior focused preparation passes; the unprepared direct route remains explicit. |
| [Arrow](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/arrow.md#20) (`5d0c02f5`) | Source / Creator | Carnival classes and callbacks, Font / SDK producer contracts and unresolved helper calls. |
| [Lyla](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/lyla-jr.md#4) (`7b258f52`) | Reimport | Preserve the unused holdText String formal through an explicit current declaration and real entry / writer guards. Its helper must remain present. |
| [Football](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/football.md#5) (`7cf6f6fa`) | Source / later stages | Primitive Throw, class / SDK / callback and Font ownership; export and reimport retain additional diagnostics. |
| [Horse](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/horse.md#6) (`90a0e61d`) | Source / Creator | Carnival classes and callbacks, genuine Font / SDK producer contracts and unresolved helper calls. |
| [Turkey](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/turkey-jr.md#10) (`b8a65f49`) | Source / Creator | Carnival classes and callbacks, genuine Font / SDK producer contracts and unresolved helper calls. |
| [Birthday](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/birthday.md#18) (`c2576ea3`) | Source / Creator | Carnival classes and callbacks, genuine Font / SDK producer contracts and unresolved helper calls. |
| [betterSettings](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/courses/csintro/blocks/unit-3/lab0304-part3.md#1) (`c88488d3`) | Source / reimport | Primitive Throw, typed Array formals, actual Settings Array / Undefined / Null results and refinement. The partial export also exposes an unproved String.concat input. |
| [Sparks](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/sparks-jr.md#14) (`d90dfaf5`) | Source / export | Exact Math.idiv and Number text producers; callback forwarding, HUD visibility, renderable lifetime, screen.isMono and Font ownership. |
| [Bubbles](https://github.com/microsoft/pxt-arcade/blob/8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02/docs/tutorials/bubbles.md#10) (`faf26051`) | Source / reimport | Mixed named, Arrow, class and generic handlers / collections. Its newly observed partial export contains invalid 0.length syntax; valid authored reachability still needs investigation. |

## Runtime and authoring remain separate

The [authentic project ledger](arcade-authentic-project-qualification.md) records
eleven projects with five bounded native routes each. It does not promote all
pure passes to working games. In particular, the null-receiver flame sample is
pure-clean but its native handler silently continues after reading a null Sprite:
it creates a projectile, applies velocity and AutoDestroy, and reports no error
on each of the five routes. This remains held. Its exact selected-original fault
and termination behavior still need observation before choosing the correction.
The initial observer's incorrect Pressed-event assertion is also preserved.

Next, close the existing primitive formal protocol and exact division producers,
then the typed Array / Settings and class / handler / Font groups. Preserve real
bodies and qualify every caller, writer and runtime boundary. Production compiler
adoption, Code / Blocks authoring, graphics editing, save / reopen and original
exported gameplay retain their own gates. No original-source restoration,
missing-helper pruning, broad type annotation grants or diagnostic filtering.

The immutable raw census remains **147 translated / 36 partial / one parse
failure**. Complete case closures require behavior and authoring evidence beyond
this conversion profile.
