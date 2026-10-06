# Conversion round trips

Generated 2026-10-06T19:59:17.202Z; 399 inputs. “Preserved” means the measured structure and Arcade image pixels match and no converter reported an unsupported element. It does not prove program behavior.

## Paths

| corpus | permutation | preserved | partial | loss | compile fail | error |
|---|---|---:|---:|---:|---:|---:|
| Arcade TypeScript | project -> bw -> project | 88 | 93 | 2 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 181 | 0 | 2 |
| Arcade TypeScript | makecode -> bw -> makecode -> bw | 70 | 42 | 58 | 12 | 1 |
| micro:bit TypeScript | project -> bw -> project | 206 | 9 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 213 | 0 | 2 |
| micro:bit TypeScript | makecode -> bw -> makecode -> bw | 197 | 7 | 11 | 0 | 0 |

## Most often lost block opcodes on reverse MakeCode conversion

| projects | opcode |
|---:|---|
| 24 | operator_not |
| 19 | control_stop |
| 16 | operator_lt |
| 13 | operator_subtract |
| 12 | data_changevariableby |
| 12 | operator_equals |
| 12 | operator_gt |
| 9 | data_setvariableto |
| 7 | looks_show |
| 7 | motion_changexby |
| 6 | arrays_createEmpty |
| 6 | motion_gotoxy |
| 6 | operator_multiply |
| 4 | arcade_getLocal |
| 4 | arrays_referenceLength |
| 4 | motion_sety |
| 4 | operator_divide |
| 3 | arcade_destroySprite |
| 3 | arcade_eventSprite |
| 3 | arcade_whenSpritesOverlap |
| 3 | arrays_create1D |
| 3 | motion_changeyby |
| 3 | sensing_touchingobject |
| 3 | sensing_touchingobjectmenu |
| 2 | arcade_setSpriteProperty |
| 2 | arrays_referenceItem |
| 2 | bitops_or |
| 2 | control_if_else |
| 2 | motion_setx |
| 2 | motion_yposition |
| 2 | operator_or |
| 1 | arrays_mutateReference |
| 1 | bitops_shl |
| 1 | bitops_shr |
| 1 | control_create_clone_of |
| 1 | control_create_clone_of_menu |
| 1 | event_whenflagclicked |
| 1 | motion_xposition |
| 1 | operator_mod |
| 1 | operator_random |

## Most often named unsupported on reverse MakeCode conversion

| projects | element |
|---:|---|
| 2 | bitops_or as a value |
| 1 | bitops_shr as a value |
| 1 | call drive %s |
| 1 | sensing_answer as a value |
| 1 | touching ExtraLife |
| 1 | touching Food |
| 1 | touching NPC |
| 1 | touching RightPaddles |

## Failed source parses or MakeCode recompiles

| file | reason |
|---|---|
| arcade-013bd6d9c7db77e4.ts | Property 'push' does not exist on type 'number'. |
| arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
| arcade-25b537cb2e5c14a1.ts | Not all code paths return a value. |
| arcade-30c9e6286a9cbe22.ts | Not all code paths return a value. |
| arcade-3e97847322a94308.ts | Argument of type 'number' is not assignable to parameter of type 'Image'. |
| arcade-5eb37c864dd21005.ts | Property 'length' does not exist on type 'number'. |
| arcade-85a1c4bedb4c8217.ts | Property 'length' does not exist on type 'number'. |
| arcade-a03d93d1b0b9d753.ts | Cannot find name 'self'. |
| arcade-a63932786084c167.ts | Argument of type 'number' is not assignable to parameter of type 'Sprite'. |
| arcade-a9ed71b600b487a3.ts | Argument of type 'number' is not assignable to parameter of type 'Image'. |
| arcade-d9e8eb7569f760a9.ts | Not all code paths return a value. |
| arcade-db4713b4f6e9dd9c.ts | Argument of type 'number' is not assignable to parameter of type 'Image'. |
| arcade-db8b30332dc1be2c.ts | Argument of type 'number' is not assignable to parameter of type 'Sprite'. |
| arcade-f583b7911b0931fd.ts | MakeCode TS: expected { but found "=>" on line 5 |
