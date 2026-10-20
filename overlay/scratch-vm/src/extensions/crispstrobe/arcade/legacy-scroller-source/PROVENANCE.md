# Original single-background scroller

The unmodified `main.ts`, `pxt.json`, and MIT notice come from
[riknoll/arcade-background-scroll at 43651f88b917a98ad886fdd4c1c2ad8001ce9b9c](https://github.com/riknoll/arcade-background-scroll/tree/43651f88b917a98ad886fdd4c1c2ad8001ce9b9c).
The source package records Arcade target 1.4.41.

`main.ts` SHA256: `1b456d2f65078f1ccf95cd89b30bba000e31bac423c8c1cae494f800ce31ce15`.

The generator transpiles the complete source. The separate native host preserves
its lazy initialization, scene state stack, original update callbacks before the
camera update, and transparent image drawing. This module has no layer APIs.
Factory selection and project serialization belong to the integration layer;
this source directory does not qualify complete imported games or GUI flows.
