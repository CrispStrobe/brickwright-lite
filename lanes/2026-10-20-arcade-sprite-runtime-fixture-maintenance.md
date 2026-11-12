## Arcade Sprite runtime fixture maintenance — 2026-10-20

SOURCE repair in the existing Arcade lane for six hosted-test modules whose
native Sprite fixtures omitted the Runtime targets array. Native-only cases
use the existing explicit empty-target helper; two guest-oriented modules use
owned actual VM runtimes with cleanup. Product binding authority, physics,
speech, artwork and callback assertions are unchanged. Complete affected-module
qualification remains required; this does not qualify a rendered game.
