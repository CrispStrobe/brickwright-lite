# Selected control event queue profile

`control-events.js` adapts the MIT Microsoft PXT simulator EventBus/EventQueue
and `base/eventcontext.ts` behavior. The selected Arcade4.2.1/core13.2.1 target
hash is `6f35aadf1456436b3318d2f2339cc3d1add6e6c3b0bf8566f86d7f7bb4f7722e`.
Selected simulator `pxtsim.js` SHA256:
`4976bc55c36d82d692bbbd0d6fe1d1435e8dd8c7dcff76e5aa28e02bf3baf826`.
Selected `base/eventcontext.ts` SHA256:
`95bbeb486dec17ad75674f03978e0836f087f93faf442ae58895a7ffb25b2925`.

Primary navigation: [PXT simulator](https://github.com/microsoft/pxt/tree/master/pxtsim)
and [EventContext](https://github.com/microsoft/pxt-common-packages/blob/master/libs/base/eventcontext.ts).
The adjacent license retains Microsoft attribution. These are source-backed
queue adapters, not a cleanroom claim.

This first module supports foreground public control events only. Background
listeners, notify-one, allocator integration, idle events, runtime timestamps,
multiplayer/controller wiring, canonical callable execution and GUI authoring
are not qualified by the module's isolated tests. No runtime imports it yet.
Selected public listener flags are evaluated but ignored by its internal shim;
this profile serializes handlers. IDs retain selected simulator numeric
identity, including fractional inputs. Scheduling and callback execution are
injected and must bind the actual source continuation driver before adoption.
