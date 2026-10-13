# Writable sprite flags

Native sprite property blocks can read and write `flags`. A direct write keeps
the primitive value; bitwise flag operations convert it using the original
numeric semantics. Numeric editor shadows are parsed as numbers, while connected
primitive reporters retain their values. Object coercion remains unsupported.

The Destroyed mask guards destruction and filters kind collections. Clearing
that mask on a retained reference permits another destruction callback without
restoring scene membership. Internal clipping changes preserve unrelated bits.
Public and internal flag constants are admitted only from unshadowed SDK names.

Focused backend controls cover raw numeric values, destruction guards, retained
callbacks, clipping masks, primitive admission and the property menu. Full
native/Code/same and fresh SB3/original export/reimport controls now also cover
raw 1.5 and nonfinite values, manual Destroyed masks and kind filtering,
clear-and-repeat kind and instance callbacks, raw string/null/undefined codec
values, receiver-before-RHS `+=` and `|=` evaluation exactly once, and `>>>=`
from -1. Existing completed unchanged original observations are reused; new
compound/primitive fixtures and actual exported files run the original SDK.
The matching vocabulary uses producer `846dcf057796e63fc4434fc9094e47c8ed7aedc9`
and Arrays values `e197ab06e792a501716b837761dfb13cf29458c9`.

Flags export preserves connected raw primitives separately from numeric editor
shadows; numeric-looking strings are not converted to numbers. Foreign objects
remain explicitly unsupported. Hosted whole-IDE browser authoring qualification
is pending.

The stationary StayInScreen `pause(20)` observation uses the original boot-zero
clock authority. Its native control steps boot 0 and due 20 explicitly: the
source continuation records x=200 before that frame's physics may clamp it.
The test checks real getter calls, so previously saved variables cannot imitate
completion. Fresh Code, same/fresh SB3 and reimport use the same authority.

The actual reused-VM loader control verifies one built-in extension service and
one physical-frame listener. A successful project reload rearms the cached
source phase driver after disposal; an explicitly detached driver stays retired.
These are headless runtime/lifecycle tests, not a substitute for the pending
hosted GUI save/reopen journey.
