# Conversion compatibility audit

Generated 2026-09-27T18:00:00.037Z; 16 files. A parsed project has not necessarily run correctly.

| count | stage |
|---:|---|
| 13 | external-extension-unverified |
| 2 | parsed |
| 1 | unsupported-blocks |

## Unsupported MakeCode elements

| occurrences | element |
|---:|---|
| 0 | none |

## Missing Scratch/TurboWarp opcodes

| occurrences | opcode |
|---:|---|
| 1 | procedures_return |

## Unsupported block modes

| occurrences | mode |
|---:|---|
| 0 | none |

## External extensions requiring runtime validation or an offline implementation

| projects | extension and URL |
|---:|---|
| 2 | xeltallivclipblend: https://extensions.turbowarp.org/Xeltalliv/clippingblending.js |
| 1 | AR: https://extensions.turbowarp.org/ar.js |
| 1 | griffpatch: https://extensions.turbowarp.org/box2d.js |
| 1 | gsaWebsocket: https://extensions.turbowarp.org/godslayerakp/ws.js |
| 1 | jeremygamerTweening: https://extensions.turbowarp.org/JeremyGamer13/tween.js |
| 1 | lbdrawtest: https://extensions.turbowarp.org/Longboost/color_channels.js |
| 1 | lmsmcutils: https://extensions.turbowarp.org/Lily/McUtils.js |
| 1 | MouseCursor: https://extensions.turbowarp.org/cursor.js |
| 1 | penP: https://extensions.turbowarp.org/obviousAlexC/penPlus.js |
| 1 | pointerlock: https://extensions.turbowarp.org/pointerlock.js |
| 1 | runtimeoptions: https://extensions.turbowarp.org/runtime-options.js |
| 1 | shovelColorPicker: https://extensions.turbowarp.org/TheShovel/ColorPicker.js |
| 1 | stretch: https://extensions.turbowarp.org/stretch.js |
| 1 | xeltallivSimple3D: https://extensions.turbowarp.org/Xeltalliv/simple3D.js |

### Their unverified opcodes

| projects | opcode |
|---:|---|
| 2 | xeltallivclipblend_setBlend |
| 1 | AR_enterAR |
| 1 | AR_getHitPosition |
| 1 | AR_getMatrixItem |
| 1 | AR_getStageHeight |
| 1 | AR_getStageWidth |
| 1 | AR_isFeatureAvailible |
| 1 | AR_isInAR |
| 1 | AR_moveSpaceBy |
| 1 | AR_turnSpaceBy |
| 1 | griffpatch_doTick |
| 1 | griffpatch_setAngVelocity |
| 1 | griffpatch_setDensity |
| 1 | griffpatch_setFriction |
| 1 | griffpatch_setGravity |
| 1 | griffpatch_setPhysics |
| 1 | griffpatch_setPosition |
| 1 | griffpatch_setRestitution |
| 1 | griffpatch_setStage |
| 1 | griffpatch_setStatic |
| 1 | griffpatch_setVelocity |
| 1 | gsaWebsocket_closeCode |
| 1 | gsaWebsocket_closeMessage |
| 1 | gsaWebsocket_messageData |
| 1 | gsaWebsocket_newInstance |
| 1 | gsaWebsocket_onClose |
| 1 | gsaWebsocket_onError |
| 1 | gsaWebsocket_onMessage |
| 1 | gsaWebsocket_onOpen |
| 1 | gsaWebsocket_sendMessage |
| 1 | jeremygamerTweening_tweenValue |
| 1 | lbdrawtest_drawOneColor |
| 1 | lmsmcutils_managerReporter |
| 1 | MouseCursor_setCur |
| 1 | penP_addBlankIMG |
| 1 | penP_clearRenderTexture |
| 1 | penP_createRenderTexture |
| 1 | penP_drawShaderSquare |
| 1 | penP_drawShaderTri |
| 1 | penP_drawTexTri |
| 1 | penP_resetSquareAttributes |
| 1 | penP_resetWholeTriangleAttributes |
| 1 | penP_setMatrixInShader |
| 1 | penP_setNumberInShader |
| 1 | penP_setpixelcolor |
| 1 | penP_setStampAttribute |
| 1 | penP_setTextureInShader |
| 1 | penP_setTriangleFilterMode |
| 1 | penP_setTrianglePointAttribute |
| 1 | penP_setVec3InShader |
| 1 | penP_setWholeTrianglePointAttribute |
| 1 | penP_squareTexDown |
| 1 | penP_targetRenderTexture |
| 1 | penP_turnAdvancedSettingOff |
| 1 | pointerlock_isLocked |
| 1 | pointerlock_setLocked |
| 1 | runtimeoptions_getDimension |
| 1 | shovelColorPicker_getColor |
| 1 | shovelColorPicker_setColor |
| 1 | shovelColorPicker_setPos |
| 1 | shovelColorPicker_showPicker |
| 1 | shovelColorPicker_whenChanged |
| 1 | stretch_changeStretchX |
| 1 | stretch_setStretch |
| 1 | stretch_setStretchX |
| 1 | stretch_setStretchY |
| 1 | xeltallivclipblend_setClipbox |
| 1 | xeltallivSimple3D_clear |
| 1 | xeltallivSimple3D_clearColor |
| 1 | xeltallivSimple3D_createMesh |
| 1 | xeltallivSimple3D_drawMesh |
| 1 | xeltallivSimple3D_matMove |
| 1 | xeltallivSimple3D_matRotate |
| 1 | xeltallivSimple3D_matScale |
| 1 | xeltallivSimple3D_matSelect |
| 1 | xeltallivSimple3D_matStartWithIdentity |
| 1 | xeltallivSimple3D_matStartWithPerspective |
| 1 | xeltallivSimple3D_matTransformFromToDir |
| 1 | xeltallivSimple3D_matTransformResult |
| 1 | xeltallivSimple3D_matWrapper |
| 1 | xeltallivSimple3D_setMeshAlphaTest |
| 1 | xeltallivSimple3D_setMeshIndices |
| 1 | xeltallivSimple3D_setMeshPositionsXY |
| 1 | xeltallivSimple3D_setMeshPositionsXYZ |
| 1 | xeltallivSimple3D_setMeshPrimitives |
| 1 | xeltallivSimple3D_setMeshTexCoordUV |
| 1 | xeltallivSimple3D_setMeshTexture |
| 1 | xeltallivSimple3D_setMeshTextureAnisotropy |
| 1 | xeltallivSimple3D_setMeshTextureMipmap |
| 1 | xeltallivSimple3D_textureFromCostume |
| 1 | xeltallivSimple3D_whenCanvasResized |

## Failures and execution limits

| file | result |
|---|---|
| none | none |
