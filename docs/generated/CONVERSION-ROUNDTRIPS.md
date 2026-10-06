# Conversion round trips

Generated 2026-10-06T21:28:36.939Z; 399 inputs. “Preserved” means the measured structure and Arcade image pixels match and no converter reported an unsupported element. It does not prove program behavior. “Source invalid” is a re-export MakeCode rejects whose original MakeCode itself rejects too (a documentation snippet with an undeclared name or a missing package).

## Paths

| corpus | permutation | preserved | partial | loss | compile fail | source invalid | error |
|---|---|---:|---:|---:|---:|---:|---:|
| Arcade TypeScript | project -> bw -> project | 89 | 92 | 2 | 0 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 181 | 0 | 0 | 2 |
| Arcade TypeScript | makecode -> bw -> makecode -> bw | 81 | 49 | 51 | 0 | 2 | 0 |
| micro:bit TypeScript | project -> bw -> project | 206 | 9 | 0 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 213 | 0 | 0 | 2 |
| micro:bit TypeScript | makecode -> bw -> makecode -> bw | 197 | 7 | 11 | 0 | 0 | 0 |

## Most often lost block opcodes on reverse MakeCode conversion

| projects | opcode |
|---:|---|
| 15 | operator_lt |
| 12 | operator_gt |
| 11 | operator_subtract |
| 10 | operator_equals |
| 9 | data_changevariableby |
| 9 | data_setvariableto |
| 7 | looks_show |
| 6 | motion_changexby |
| 5 | arrays_createEmpty |
| 5 | motion_gotoxy |
| 5 | operator_multiply |
| 4 | arcade_getLocal |
| 4 | arrays_create1D |
| 4 | motion_sety |
| 4 | operator_divide |
| 4 | operator_random |
| 3 | arcade_destroySprite |
| 3 | arcade_eventSprite |
| 3 | arcade_whenSpritesOverlap |
| 3 | operator_not |
| 3 | sensing_touchingobject |
| 3 | sensing_touchingobjectmenu |
| 2 | arcade_setSpriteProperty |
| 2 | arrays_length |
| 2 | bitops_or |
| 2 | control_create_clone_of |
| 2 | control_create_clone_of_menu |
| 2 | control_if_else |
| 2 | motion_changeyby |
| 2 | motion_setx |
| 2 | motion_yposition |
| 2 | operator_or |
| 1 | arrays_get |
| 1 | arrays_push |
| 1 | bitops_shl |
| 1 | bitops_shr |
| 1 | event_whenflagclicked |
| 1 | motion_xposition |
| 1 | operator_mod |
| 1 | planetemaths_max |

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
| arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
