# SDK Sprite flag method

This bounded extension of the merged class contract admits inherited
`Sprite.setFlag(flag, on)` and the qualified public numeric/Boolean override
form using `super.setFlag`. It uses the same native Sprite handle as the
constructor, registry, `allOfKind`, fields and image services.

The selected SDK method changes flag bits. Enabling StayInScreen does not move
the Sprite immediately. The class service uses the native flags property bridge
to update flag caches and drawable state; it does not use the menu primitive's
immediate screen clamp. The selected masks include Ghost 7168,
RelativeToCamera 512 and StayInScreen 8. Composite masks and clearing bits retain
the actual signed bit operations.

Controls bind virtual override and superclass order, the position before the
next physics phase, flag combinations and clearing, registry aliases, scene-local
public IDs, and mutation through references to inactive and popped scenes.
They compare native import, Code, strict selected original export, reimport,
and the same and fresh VM SB3 routes. One shared external timer platform gives
every native route the initial zero-delta frame and actual timer deadlines.
The first fresh VM failure from an incomplete clock setup is retained.

Two mutations must fail: losing the clear-bit operation and introducing an
immediate StayInScreen clamp. Existing constructor cancellation, canonical handle
lifetime and drawing/update/hitbox refusal controls remain mandatory.

This slice does not qualify additional enum-typed override signatures, callable
fields, generic callback methods, virtual drawing/update/hitbox services, complete
retained statusbar or spriteutils execution, or a complete class designer.
