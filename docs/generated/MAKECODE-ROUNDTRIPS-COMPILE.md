# Conversion round trips

Generated 2026-09-27T18:31:01.349Z; 399 inputs. “Preserved” here means target names, block opcode counts, asset names, extension IDs and extension URLs match. It does not prove program behavior or asset bytes.

## Paths

| corpus | permutation | preserved | loss | compile fail | error |
|---|---|---:|---:|---:|---:|
| Arcade TypeScript | project -> bw -> project | 183 | 0 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 183 | 0 | 0 |
| Arcade TypeScript | makecode -> bw -> makecode -> bw | 0 | 167 | 16 | 0 |
| micro:bit TypeScript | project -> bw -> project | 215 | 0 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> sb3 -> bw -> project | 0 | 215 | 0 | 0 |
| micro:bit TypeScript | makecode -> bw -> makecode -> bw | 132 | 70 | 13 | 0 |

## Most often lost block opcodes on reverse MakeCode conversion

| projects | opcode |
|---:|---|
| 91 | operator_equals |
| 78 | operator_not |
| 73 | control_forever |
| 70 | control_wait_until |
| 67 | control_if |
| 65 | event_whenflagclicked |
| 56 | microbitplus_isbutton |
| 48 | looks_sayforsecs |
| 46 | motion_changexby |
| 41 | data_changevariableby |
| 35 | control_wait |
| 33 | sensing_keyoptions |
| 33 | sensing_keypressed |
| 32 | sensing_touchingobject |
| 32 | sensing_touchingobjectmenu |
| 30 | data_setvariableto |
| 27 | motion_changeyby |
| 23 | arrays_createEmpty |
| 22 | control_if_else |
| 22 | operator_random |
| 21 | motion_goto |
| 21 | motion_goto_menu |
| 20 | procedures_call |
| 16 | arrays_create1D |
| 15 | operator_add |
| 14 | looks_show |
| 14 | microbitplus_istouch |
| 14 | operator_subtract |
| 13 | operator_gt |
| 13 | operator_lt |
| 12 | motion_sety |
| 11 | motion_setx |
| 9 | arrays_push |
| 9 | control_repeat |
| 9 | operator_divide |
| 8 | motion_yposition |
| 7 | arrays_length |
| 7 | control_create_clone_of |
| 7 | control_create_clone_of_menu |
| 7 | control_stop |

## Most often named unsupported on reverse MakeCode conversion

| projects | element |
|---:|---|
| 21 | go to back |
| 20 | arrays_createEmpty |
| 16 | arrays_create1D |
| 9 | arrays_push |
| 7 | control_create_clone_of |
| 7 | touching Enemy |
| 6 | arrays_length as a value |
| 6 | touching Food |
| 5 | arrays_set |
| 5 | touching Projectile |
| 3 | arrays_get as a value |
| 2 | bitops_or as a value |
| 1 | arrays_indexOf as a value |
| 1 | bitops_shr as a value |
| 1 | call drawBoard |
| 1 | call drive %s |
| 1 | call initialiseBoard |
| 1 | call onPress |
| 1 | call resetBall |
| 1 | looks_show |
| 1 | operator_length as a value |
| 1 | sensing_answer as a value |
| 1 | touching block |
| 1 | touching ExtraLife |
| 1 | touching NPC |
| 1 | touching RightPaddles |

## Failed source parses or MakeCode recompiles

| file | reason |
|---|---|
| arcade-01672fc0f86e34dd.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-0256fe3509d371d9.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-0a37efa63cf86074.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-0d9c499cd21d7962.ts | Cannot redeclare block-scoped variable 'balloonSprite'. |
| arcade-12904c83e83fe45a.ts | MakeCode TS: expected ) but found "" on line 6 |
| arcade-25b537cb2e5c14a1.ts | Duplicate function implementation. |
| arcade-30c9e6286a9cbe22.ts | Duplicate function implementation. |
| arcade-3f40af2616c642a4.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-4de74cde77ddcc39.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-51d1822d004ba758.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-6c6460580e12ea9d.ts | Duplicate function implementation. |
| arcade-76270b32e3db4591.ts | Operator '==' cannot be applied to types '0' and '1'. |
| arcade-9eb26fe29ed42fc1.ts | Operator '==' cannot be applied to types 'number' and 'string'. |
| arcade-a5ad2a27e66886ae.ts | Cannot redeclare block-scoped variable 'trampolineSprite'. |
| arcade-a9ed71b600b487a3.ts | Operator '==' cannot be applied to types '0' and '42'. |
| arcade-d9e8eb7569f760a9.ts | Duplicate function implementation. |
| arcade-e3f69fceb7864087.ts | Duplicate function implementation. |
| microbit-086bc32fc09819b6.ts | Type '"force > 100"' is not assignable to type 'number'. |
| microbit-1137ebbba092bd0d.ts | Type 'number[]' is not assignable to type 'number'. |
| microbit-4590b9cc65ec37a9.ts | Type '"pin P0 digital > 0"' is not assignable to type 'number'. |
| microbit-9270e22e603c9ce1.ts | Type '"tool = receivedNumber"' is not assignable to type 'number'. |
| microbit-933c774f7b5a03e3.ts | Type '"ABCDEFGHIJKLMNOPQRSTUVWXYZ"' is not assignable to type 'number'. |
| microbit-bb6435cf8a8df0d0.ts | Type 'string' is not assignable to type 'number'. |
| microbit-bcbc999cd2895908.ts | Argument of type 'string' is not assignable to parameter of type 'number'. |
| microbit-d7020a275a17ae98.ts | Operator '==' cannot be applied to types '0' and '2'. |
| microbit-d771c6e33f754ccf.ts | Type '"index2 < length"' is not assignable to type 'number'. |
| microbit-da3e5c2653b41064.ts | Argument of type '"puppy"' is not assignable to parameter of type 'number'. |
| microbit-dad01657b70c38e2.ts | Type '"not (not (on = 0))"' is not assignable to type 'number'. |
| microbit-f0b727a3452522f8.ts | Argument of type 'string' is not assignable to parameter of type 'number'. |
| microbit-f6c9157940f46f3b.ts | Cannot redeclare block-scoped variable 'light'. |
