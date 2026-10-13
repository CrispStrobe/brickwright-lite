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
Code, fresh SB3, original export and browser authoring qualification is pending.
