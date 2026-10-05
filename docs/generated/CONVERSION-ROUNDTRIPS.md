# Conversion round trips

Generated 2026-09-28T13:28:15.206Z; 546 inputs. “Preserved” means the measured structure and Arcade image pixels match and no converter reported an unsupported element. It does not prove program behavior.

## Paths

| corpus | permutation | preserved | partial | loss | compile fail | error |
|---|---|---:|---:|---:|---:|---:|
| Arcade TypeScript | project -> bw -> project | 46 | 135 | 2 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 183 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> makecode -> bw | 28 | 47 | 108 | 0 | 0 |
| micro:bit TypeScript | project -> bw -> project | 166 | 49 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 0 | 215 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> makecode -> bw | 111 | 26 | 78 | 0 | 0 |
| TurboWarp SB3 | project -> bw -> project | 0 | 0 | 143 | 0 | 1 |

## Most often lost block opcodes on reverse MakeCode conversion

| projects | opcode |
|---:|---|
| 84 | operator_equals |
| 78 | operator_not |
| 75 | control_wait_until |
| 66 | event_whenflagclicked |
| 60 | control_forever |
| 56 | microbitplus_isbutton |
| 51 | control_if |
| 41 | motion_changexby |
| 31 | sensing_keyoptions |
| 31 | sensing_keypressed |
| 29 | data_setvariableto |
| 28 | data_changevariableby |
| 24 | motion_changeyby |
| 23 | control_wait |
| 22 | arrays_createEmpty |
| 22 | looks_gotofrontback |
| 20 | operator_subtract |
| 20 | sensing_touchingobject |
| 20 | sensing_touchingobjectmenu |
| 19 | operator_random |
| 16 | arrays_create1D |
| 16 | control_if_else |
| 16 | operator_lt |
| 14 | microbitplus_istouch |
| 14 | operator_gt |
| 13 | looks_show |
| 12 | operator_add |
| 11 | motion_sety |
| 10 | arcade_splash |
| 10 | arcade_startCountdown |
| 10 | control_stop |
| 10 | motion_setx |
| 9 | arrays_length |
| 9 | operator_divide |
| 8 | arrays_push |
| 8 | procedures_call |
| 7 | motion_gotoxy |
| 7 | motion_yposition |
| 7 | operator_multiply |
| 6 | arrays_get |

## Most often named unsupported on reverse MakeCode conversion

| projects | element |
|---:|---|
| 22 | looks_gotofrontback |
| 19 | arrays_createEmpty |
| 16 | arrays_create1D |
| 10 | Game: no costume image available; Arcade artwork cannot be exported faithfully |
| 8 | arrays_push |
| 6 | arrays_get as a value |
| 6 | arrays_length as a value |
| 6 | control_create_clone_of |
| 5 | arrays_set |
| 4 | touching Projectile |
| 3 | touching Food |
| 2 | arrays_insert |
| 2 | arrays_remove |
| 2 | bitops_or as a value |
| 2 | flamethrower: no costume image available; Arcade artwork cannot be exported faithfully |
| 2 | touching Enemy |
| 1 | Arcade image change needs a sprite handle with a known template |
| 1 | arrays_indexOf as a value |
| 1 | athlete: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | balloon: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | balloon: sprite variable name changed to balloonSprite on Arcade export |
| 1 | bitops_shr as a value |
| 1 | boardSprite: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | call drawBoard |
| 1 | call drive %s |
| 1 | call initialiseBoard |
| 1 | call onPress |
| 1 | call resetBall |
| 1 | car: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | finish: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | flameSprite: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | fly: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | fortuneTellerSprite: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | frog: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | hoop: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | iceSprite: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | jumper: no costume image available; Arcade artwork cannot be exported faithfully |
| 1 | looks_show |
| 1 | looks_switchcostumeto |
| 1 | mySprite: no costume image available; Arcade artwork cannot be exported faithfully |

## Failed source parses or MakeCode recompiles

| file | reason |
|---|---|
| arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
| corrupt_svg.sb3 | Cannot read properties of null (reading 'async') |
| missing_svg.sb3 | Cannot read properties of null (reading 'async') |
| origin.sb3 | Cannot read properties of null (reading 'async') |
