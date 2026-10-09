const makeExt = require('../adapter');

// Shared game-console blocks. The original extension described a micro:bit
// 5x5 game API but implemented every VM method as a no-op. Keep its opcodes
// compatible while making them useful in Scratch, MakeCode Arcade, PyBadge
// and SAMD51 projects; the GUI console reads the same runtime state.
module.exports = makeExt(`// Name: Arcade
// ID: arcade
// Description: Game controls, sprites, score and badge hardware for micro:bit and Arcade boards.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  const dependencies = Scratch.BWExtensionDependencies;
  const speechEngine = dependencies.createSpeechEngine(dependencies.initializeSpeech, dependencies.fonts);
  const speechPalette = ['#000000', '#ffffff', '#ff2121', '#ff93c4', '#ff8135', '#fff609',
    '#249ca3', '#78dc52', '#003fad', '#87f2ff', '#8e2ec4', '#a4839f', '#5c406c', '#e5cdc4', '#91463d', '#000000'];

  const imageEngine = dependencies.createImageEngine(speechPalette, dependencies.initializeImage);
  const animationResourceMenuItems = dependencies.animationResourceMenuItems;
  const {RotatedBoundingBox, rasterWindow: rotatedRasterWindow, rasterFootprint: rotatedRasterFootprint} = dependencies.initializeRotation();

  const spriteFlags = {AutoDestroy: 4, StayInScreen: 8, DestroyOnWall: 16, BounceOnWall: 32, Invisible: 128, RelativeToCamera: 512,
    GhostThroughTiles: 1024, GhostThroughWalls: 2048, GhostThroughSprites: 4096, Ghost: 7168};

  class Arcade {
    constructor(runtime) {
      this._runtime = runtime;
      this._fallbackState = null;
      // Palette is display state shared by every scene, never an image mutation.
      this._projectPalette = null;
      this._sceneStack = [];this._sceneFrames=new WeakMap();this._pendingSceneSeconds=new WeakMap();
      this._sceneBundles = new Set();
      this._scenePushHandlers = [];this._scenePopHandlers = [];
      this._nextSpriteHandle = 0;this._globalElapsedMs = 0;this._nextMultiplayerState=2;
      this._buttonStates = {};
      this._activeLegacyAnimations = new Set();
      this._updateHandlers = [];this._intervalHandlers = [];this._buttonHandlers = [];
      this._destroyedHandlers = [];this._overlapHandlers = [];this._foreverHandlers=[];this._countdownHandlers=[];
      this._speech = new Map();
      this._imageSkins = new Map();
      this._images = new Map();
      this._spriteValues = new Map();
      this._playerValues = new Map();this._nextPlayerValue=0;
      this._sceneValues=new Map();this._physicsEngines=new Map();this._nextSceneValue=0;this._nextPhysicsEngine=0;
      this._kindInsertion = 0;
      this._animations = new Map();
      this._nextAnimationId = 0;
      this._imageAnimations = new Map();
      this._animationUpdateOrder = [];
      this._tileLocations = new Map();
      this._nextTileLocationId = 0;
      this._imageIds = new WeakMap();
      this._frameImages = new Map();
      this._animationAssetCache = new Map();
      this._frameDefinitions = new Map();
      this._nextImageId = 0;
      this._creationWaits = new Set();
      this._functionCalls = new Set();
      this._createdHandlers = [];
      this._wallHandlers = [];this._legacyWallHandlers = [];
      this._tileHandlers = [];
      this._terrainWaits = new Set();
      this._terrainEpoch = 0;
      this._terrainFrame = null;
      this._terrainStopped = false;
      if (runtime && runtime.on) {
        runtime.on('ARCADE_FRAME', elapsedMs => { this._pumpFunctionCalls(); this._pumpCreationWaits(); this._pumpTerrainWaits(); this._pumpQuestion(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 1000 / 30); this._advance(Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs / 1000 : 1 / 30); });
        runtime.on('ARCADE_FRAME_END', () => { this._pumpFunctionCalls(); this._pumpCreationWaits(); this._pumpTerrainWaits(); });
        runtime.on('ARCADE_BUTTON_DOWN', button => { if(this._dialogs?.[0]?.type!=='ask')this._dialogs?.[0]?.dismiss(); });
        runtime.on('ARCADE_DIALOG_BUTTON_EDGE',(button,held)=>this._questionButtonEdge(button,held));
        runtime.on('ARCADE_PLAYER_BUTTON_EDGE',(player,button,isDown)=>this._controllerButtonEdge(player,button,isDown));
        runtime.on('KEY_STATE_CHANGED',(key,isDown)=>this._keyboardButtonEdge(key,isDown));
        const cancelCreations = () => {
          for (const pending of this._creationWaits) pending.resolve('');
          this._creationWaits.clear();
          for(const dialog of this._dialogs || [])dialog.resolve(dialog.type==='ask' ? false : undefined);
          this._dialogs=[];this._showNextDialog();
          for (const call of this._functionCalls) {runtime.sequencer?.retireThread(call.thread);call.resolve(0);}
          this._functionCalls.clear();
          this._terrainEpoch++;this._terrainFrame = null;this._terrainStopped = true;
          for (const pending of this._terrainWaits) {runtime.sequencer?.retireThread(pending.thread);pending.resolve();}
          this._terrainWaits.clear();
          if(this._foreverTimer!==undefined)clearTimeout(this._foreverTimer);this._foreverTimer=undefined;
        };
        runtime.on('PROJECT_STOP_ALL', cancelCreations);
        runtime.on('RUNTIME_DISPOSED', () => {cancelCreations();this._clearTilemap();this._tileLocations.clear();this._animationAssetCache.clear();for(const id of this._imageSkins.keys())this._clearImage(id);});
        const reset = () => {
          cancelCreations();
          this._terrainStopped = false;
          this._projectPalette = null;
          for(const bundle of this._sceneBundles){
            for(const target of Object.values(bundle.state.spriteTargets || {})) runtime.disposeTarget?.(target);
            for(const entry of bundle._speech.values()){
              entry.renderer.destroy();
              if(entry.drawableId!==undefined)runtime.renderer?.destroyDrawable(entry.drawableId,'sprite');
              if(entry.skinId!==undefined)runtime.renderer?.destroySkin(entry.skinId);
            }
            for(const key of ['_background','_backgroundImage','_tilemapDrawable'])if(bundle[key]){
              runtime.renderer?.destroyDrawable(bundle[key].drawable,'background');runtime.renderer?.destroySkin(bundle[key].skin);
            }
          }
          this._sceneBundles.clear();this._sceneStack=[];this._sceneFrames=new WeakMap();this._pendingSceneSeconds=new WeakMap();
          this._scenePushHandlers=[];this._scenePopHandlers=[];this._nextSpriteHandle=0;this._globalElapsedMs=0;this._nextMultiplayerState=2;this._buttonStates={};
          this._activeLegacyAnimations=new Set();this._updateHandlers=[];this._intervalHandlers=[];this._buttonHandlers=[];
          this._destroyedHandlers=[];this._overlapHandlers=[];this._foreverHandlers=[];this._countdownHandlers=[];
          this._createdHandlers = [];
          this._wallHandlers = [];this._legacyWallHandlers = [];this._tileHandlers = [];
          for (const id of this._speech.keys()) this._clearSpeech(id);
          this._clearBackground();
          for (const id of this._imageSkins.keys()) this._clearImage(id);
          this._images.clear();
          this._spriteValues.clear();
          this._playerValues.clear();this._nextPlayerValue=0;
          this._sceneValues.clear();this._physicsEngines.clear();this._nextSceneValue=0;this._nextPhysicsEngine=0;
          this._kindInsertion = 0;
          this._animations.clear();
          this._imageAnimations.clear();
          this._animationUpdateOrder = [];
          this._tileLocations.clear();
          this._nextTileLocationId = 0;
          this._clearTilemap();
          this._imageIds = new WeakMap();
          this._frameImages.clear();
          this._animationAssetCache.clear();
          this._frameDefinitions.clear();
          runtime.bwArcadeDeviceState = {};
          this._currentEvent = null;
          for (const dialog of this._dialogs || []) dialog.resolve();
          this._dialogs = [];
          runtime.bwArcadeDialogOpen = false;
          runtime.bwArcadeDialogType = null;
          runtime.emit('ARCADE_DIALOG', null);
          this._changed();
        };
        runtime.on('PROJECT_LOADED', () => {
          // Registry publications belong to the loaded project. GUI artwork
          // restoration repopulates them after successful deserialization.
          runtime.bwArcadeAnimationResources = new Map();
          reset();
        });
        runtime.on('PROJECT_START', reset);
        runtime.on('targetWasRemoved', target => {
          for (const [id, entry] of this._imageSkins) if (entry.target === target) this._clearImage(id);
          for (const [id, entry] of this._speech) if (entry.target === target) this._clearSpeech(id);
        });
      }
    }

    getInfo() {
      const str = (name, def) => ({ [name]: { type: Scratch.ArgumentType.STRING, defaultValue: def || '' } });
      const n = (name, def) => ({ [name]: { type: Scratch.ArgumentType.NUMBER, defaultValue: def == null ? 0 : def } });
      return {
        id: 'arcade',
        name: 'Arcade',
        color1: '#E64980',
        color2: '#D63878',
        color3: '#C42870',
        blocks: [
          {opcode:'followSprite',blockType:Scratch.BlockType.COMMAND,text:'Arcade sprite [ID] follow [TARGET] speed [SPEED] turn rate [TURN]',arguments:{...str('ID',''),...str('TARGET',''),...n('SPEED',100),...n('TURN',400)}},
          {opcode:'unfollowSprite',blockType:Scratch.BlockType.COMMAND,text:'Arcade sprite [ID] stop following',arguments:str('ID','')},
          {opcode:'startParallelHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade run parallel as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenParallelHandler',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade parallel handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerForeverHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register forever as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredForever',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade forever handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerCountdownHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register countdown as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredCountdown',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade countdown handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'hasLife',blockType:Scratch.BlockType.BOOLEAN,text:'Arcade player [PLAYER] has life',arguments:n('PLAYER',1)},
          {opcode:'getPlayerScore',blockType:Scratch.BlockType.REPORTER,text:'Arcade score player [PLAYER]',arguments:n('PLAYER',1)},
          {opcode:'hasPlayerScore',blockType:Scratch.BlockType.BOOLEAN,text:'Arcade player [PLAYER] has score',arguments:n('PLAYER',1)},
          {opcode:'setPlayerScore',blockType:Scratch.BlockType.COMMAND,text:'Arcade set score player [PLAYER] to [VALUE]',arguments:{...n('PLAYER',1),...n('VALUE',0)}},
          {opcode:'changePlayerScore',blockType:Scratch.BlockType.COMMAND,text:'Arcade change score player [PLAYER] by [VALUE]',arguments:{...n('PLAYER',1),...n('VALUE',1)}},
          {opcode:'setLife',blockType:Scratch.BlockType.COMMAND,text:'Arcade set life player [PLAYER] to [VALUE]',arguments:{...n('PLAYER',1),...n('VALUE',3)}},
          {opcode:'changeLife',blockType:Scratch.BlockType.COMMAND,text:'Arcade change life player [PLAYER] by [VALUE]',arguments:{...n('PLAYER',1),...n('VALUE',-1)}},
          {opcode:'getLife',blockType:Scratch.BlockType.REPORTER,text:'Arcade life player [PLAYER]',arguments:n('PLAYER',1)},
          {opcode:'registerLifeZeroHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register life zero player [PLAYER] as [TOKEN] capturing [CAPTURES]',arguments:{...n('PLAYER',1),...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredLifeZero',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade life zero handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'pushScene',blockType:Scratch.BlockType.COMMAND,text:'Arcade push scene'},
          {opcode:'setPalette',blockType:Scratch.BlockType.COMMAND,text:'Arcade set palette hex [DATA]',arguments:str('DATA','000000ffffffff2121ff93c4ff8135fff609249ca378dc52003fad87f2ff8e2ec4a4839f5c406ce5cdc491463d000000')},
          {opcode:'popScene',blockType:Scratch.BlockType.COMMAND,text:'Arcade pop scene'},
          {opcode:'registerUpdateHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register update as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredUpdate',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade update handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerIntervalHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register interval [INTERVAL] ms as [TOKEN] capturing [CAPTURES]',arguments:{...n('INTERVAL',1000),...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredInterval',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade interval handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerMultiplayerButtonHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register multiplayer button [BUTTON] event [EVENT] as [TOKEN] capturing [CAPTURES]',arguments:{...n('BUTTON',0),EVENT:{type:Scratch.ArgumentType.NUMBER,menu:'buttonEvents',defaultValue:2049},...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredMultiplayerButton',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade multiplayer button handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'eventPlayer',blockType:Scratch.BlockType.REPORTER,text:'Arcade event player'},
          {opcode:'playerButtonPressed',blockType:Scratch.BlockType.BOOLEAN,text:'Arcade player [PLAYER] button [BUTTON] pressed?',arguments:{...str('PLAYER',''),...n('BUTTON',0)}},
          {opcode:'registerButtonHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register button [BUTTON] event [EVENT] as [TOKEN] capturing [CAPTURES]',arguments:{BUTTON:{type:Scratch.ArgumentType.STRING,menu:'buttons',defaultValue:'a'},EVENT:{type:Scratch.ArgumentType.NUMBER,menu:'buttonEvents',defaultValue:2049},...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredButton',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade button handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerInstanceDestroyedHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register instance destruction of [ID] as [TOKEN] capturing [CAPTURES]',arguments:{...str('ID',''),...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredInstanceDestroyed',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade instance destruction handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerDestroyedHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register destroyed kind [KIND] as [TOKEN] capturing [CAPTURES]',arguments:{...str('KIND','Player'),...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredKindDestroyed',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade destroyed kind handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerOverlapHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register overlap kind [KIND] with [OTHER_KIND] as [TOKEN] capturing [CAPTURES]',arguments:{...str('KIND','Player'),...str('OTHER_KIND','Food'),...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredOverlap',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade overlap handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerScenePushHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register scene push as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredScenePush',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade scene push handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          {opcode:'registerScenePopHandler',blockType:Scratch.BlockType.COMMAND,text:'Arcade register scene pop as [TOKEN] capturing [CAPTURES]',arguments:{...str('TOKEN','handler'),...str('CAPTURES','')}},
          {opcode:'whenRegisteredScenePop',blockType:Scratch.BlockType.HAT,isEdgeActivated:false,text:'when Arcade scene pop handler [TOKEN] runs',arguments:str('TOKEN','handler')},
          { opcode: 'whenButton', blockType: Scratch.BlockType.HAT,
            text: 'when [BUTTON] button pressed', isEdgeActivated: false,
            arguments: { BUTTON: {type: Scratch.ArgumentType.STRING, menu: 'buttons', defaultValue: 'a'} } },
          { opcode: 'buttonPressed', blockType: Scratch.BlockType.BOOLEAN,
            text: '[BUTTON] button pressed?',
            arguments: { BUTTON: {type: Scratch.ArgumentType.STRING, menu: 'buttons', defaultValue: 'a'} } },
          { opcode: 'controllerStep', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade controller [AXIS] step [STEP]',
            arguments: { AXIS: {type: Scratch.ArgumentType.STRING, menu: 'axes', defaultValue: 'x'},
              ...n('STEP', 100) } },
          {opcode:'playerLookup',blockType:Scratch.BlockType.REPORTER,text:'Arcade player by [MODE] [VALUE]',arguments:{MODE:{type:Scratch.ArgumentType.STRING,menu:'playerLookupModes',defaultValue:'number'},...n('VALUE',1)}},
          {opcode:'allPlayers',blockType:Scratch.BlockType.REPORTER,text:'Arcade all players'},
          {opcode:'playerSprite',blockType:Scratch.BlockType.REPORTER,text:'Arcade sprite of player [PLAYER]',arguments:str('PLAYER','')},
          {opcode:'createPlayerState',blockType:Scratch.BlockType.REPORTER,text:'Arcade create player state key'},
          {opcode:'getPlayerState',blockType:Scratch.BlockType.REPORTER,text:'Arcade state [KEY] of player [PLAYER]',arguments:{...str('PLAYER',''),...n('KEY',0)}},
          {opcode:'setPlayerState',blockType:Scratch.BlockType.COMMAND,text:'Arcade set state [KEY] of player [PLAYER] to [VALUE]',arguments:{...str('PLAYER',''),...n('KEY',0),...n('VALUE',0)}},
          {opcode:'changePlayerState',blockType:Scratch.BlockType.COMMAND,text:'Arcade change state [KEY] of player [PLAYER] by [VALUE]',arguments:{...str('PLAYER',''),...n('KEY',0),...n('VALUE',1)}},
          {opcode:'movePlayerWithButtons',blockType:Scratch.BlockType.COMMAND,text:'Arcade move player [PLAYER] with buttons vx [VX] vy [VY]',arguments:{...str('PLAYER',''),...n('VX',100),...n('VY',100)}},
          {opcode:'setPlayerSprite',blockType:Scratch.BlockType.COMMAND,text:'Arcade set sprite of player [PLAYER] to [ID]',arguments:{...str('PLAYER',''),...str('ID','')}},
          {opcode:'playerBySprite',blockType:Scratch.BlockType.REPORTER,text:'Arcade player of sprite [ID]',arguments:str('ID','')},
          {opcode:'playerProperty',blockType:Scratch.BlockType.REPORTER,text:'Arcade player [READ] property [PROPERTY] of [PLAYER]',arguments:{READ:{type:Scratch.ArgumentType.STRING,menu:'playerReadModes',defaultValue:'safe'},...n('PROPERTY',2),...str('PLAYER','')}},
          { opcode: 'controlSprite', blockType: Scratch.BlockType.COMMAND,
            text: 'move Arcade sprite [ID] with buttons vx [VX] vy [VY]',
            arguments: {...str('ID', ''), ...n('VX', 100), ...n('VY', 100)} },
          { opcode: 'controlSpriteByController', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade controller [CONTROLLER] move sprite [ID] vx [VX] vy [VY]',
            arguments: {CONTROLLER: {type: Scratch.ArgumentType.STRING, menu: 'controllerNumbers', defaultValue: '1'},
              ...str('ID', ''), ...n('VX', 100), ...n('VY', 100)} },
          { opcode: 'stopControllingSprite', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade controller [CONTROLLER] stop controlling sprite [ID]',
            arguments: {CONTROLLER: {type: Scratch.ArgumentType.STRING, menu: 'controllerNumbers', defaultValue: '1'}, ...str('ID', '')} },
          { opcode: 'functionArgument', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade function argument [VALUE] followed by [REST]', arguments: {...str('VALUE', '0'), ...str('REST', '[]')} },
          { opcode: 'callFunction', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade call function [NAME] arguments [ARGS]', arguments: {...str('NAME', 'calculate %s'), ...str('ARGS', '[]')} },
          { opcode: 'returnValue', blockType: Scratch.BlockType.COMMAND,
            text: 'return Arcade value [VALUE]', arguments: str('VALUE', '0') },
          { opcode: 'setLocal', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade local [NAME] to [VALUE]',
            arguments: { ...str('NAME', 'value'), ...str('VALUE', '') } },
          { opcode: 'registerSpriteCreated', blockType: Scratch.BlockType.COMMAND,
            text: 'register Arcade creation kind [KIND] as [TOKEN] capturing [CAPTURES]', arguments: {...str('KIND', 'Player'), ...str('TOKEN', 'handler'), ...str('CAPTURES', '')} },
          { opcode: 'getCaptured', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade captured [NAME]', arguments: str('NAME', 'value') },
          { opcode: 'setCaptured', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade captured [NAME] to [VALUE]', arguments: {...str('NAME', 'value'), ...str('VALUE', '0')} },
          { opcode: 'getLocal', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade local [NAME]', arguments: str('NAME', 'value') },
          { opcode: 'ask', blockType: Scratch.BlockType.BOOLEAN,
            text: 'ask Arcade yes/no [TITLE] subtitle [SUBTITLE]', arguments: {...str('TITLE','Continue?'),...str('SUBTITLE','')} },
          { opcode: 'askForNumber', blockType: Scratch.BlockType.REPORTER,
            text: 'ask Arcade number [QUESTION]', arguments: str('QUESTION', 'Number?') },
          { opcode: 'askForString', blockType: Scratch.BlockType.REPORTER,
            text: 'ask Arcade text [QUESTION]', arguments: str('QUESTION', 'Text?') },
          { opcode: 'setBackgroundColor', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade set background color to [COLOR]', arguments: n('COLOR', 0) },
          { opcode: 'setBackgroundImage', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade background image [IMAGE]', arguments: str('IMAGE', '') },
          { opcode: 'backgroundImage', blockType: Scratch.BlockType.REPORTER, text: 'Arcade background image' },
          { opcode: 'backgroundColor', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade background color' },
          { opcode: 'splash', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade splash [TITLE] subtitle [SUBTITLE]',
            arguments: { ...str('TITLE', 'Title'), ...str('SUBTITLE', '') } },
          { opcode: 'showLongText', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade long text [TEXT] layout [LAYOUT]',
            arguments: { ...str('TEXT', 'Message'), LAYOUT: {
              type: Scratch.ArgumentType.STRING, menu: 'dialogLayouts', defaultValue: 'Center' } } },
          { opcode: 'lightLevel', blockType: Scratch.BlockType.REPORTER, text: 'light level' },
          { opcode: 'tilt', blockType: Scratch.BlockType.REPORTER, text: 'tilt [AXIS]',
            arguments: { AXIS: {type: Scratch.ArgumentType.STRING, menu: 'axes', defaultValue: 'x'} } },
          { opcode: 'setPixel', blockType: Scratch.BlockType.COMMAND,
            text: 'set badge pixel [INDEX] to [COLOR]',
            arguments: { INDEX: {type: Scratch.ArgumentType.NUMBER, defaultValue: 0},
              COLOR: {type: Scratch.ArgumentType.COLOR, defaultValue: '#00ff88'} } },
          { opcode: 'clearPixels', blockType: Scratch.BlockType.COMMAND, text: 'clear badge pixels' },

          // ── Sprite creation ──────────────────────────────────────
          { opcode: 'createsprite', blockType: Scratch.BlockType.COMMAND,
            text: 'create sprite [NAME] at x [X] y [Y]',
            arguments: { ...str('NAME', 'player'), ...n('X', 2), ...n('Y', 2) } },
          { opcode: 'deletesprite', blockType: Scratch.BlockType.COMMAND,
            text: 'delete sprite [NAME]',
            arguments: str('NAME', 'player') },

          // ── Movement ─────────────────────────────────────────────
          '---',
          { opcode: 'movesprite', blockType: Scratch.BlockType.COMMAND,
            text: 'move sprite [NAME] by dx [DX] dy [DY]',
            arguments: { ...str('NAME', 'player'), ...n('DX', 1), ...n('DY', 0) } },
          { opcode: 'setspritepos', blockType: Scratch.BlockType.COMMAND,
            text: 'set sprite [NAME] to x [X] y [Y]',
            arguments: { ...str('NAME', 'player'), ...n('X', 2), ...n('Y', 2) } },
          { opcode: 'spritex', blockType: Scratch.BlockType.REPORTER,
            text: 'sprite [NAME] x',
            arguments: str('NAME', 'player') },
          { opcode: 'spritey', blockType: Scratch.BlockType.REPORTER,
            text: 'sprite [NAME] y',
            arguments: str('NAME', 'player') },

          // ── Collision ────────────────────────────────────────────
          '---',
          { opcode: 'touching', blockType: Scratch.BlockType.BOOLEAN,
            text: 'sprite [A] touching [B]?',
            arguments: { ...str('A', 'player'), ...str('B', 'enemy') } },
          { opcode: 'touchingedge', blockType: Scratch.BlockType.BOOLEAN,
            text: 'sprite [NAME] touching edge?',
            arguments: str('NAME', 'player') },

          // ── Score ────────────────────────────────────────────────
          '---',
          { opcode: 'setscore', blockType: Scratch.BlockType.COMMAND,
            text: 'set score to [N]',
            arguments: n('N', 0) },
          { opcode: 'changescore', blockType: Scratch.BlockType.COMMAND,
            text: 'change score by [N]',
            arguments: n('N', 1) },
          { opcode: 'getscore', blockType: Scratch.BlockType.REPORTER,
            text: 'score' },
          { opcode: 'showscore', blockType: Scratch.BlockType.COMMAND,
            text: 'show score' },
          { opcode: 'log', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade serial log [TEXT]', arguments: str('TEXT', 'Hello') },

          // ── Display ──────────────────────────────────────────────
          '---',
          { opcode: 'drawsprites', blockType: Scratch.BlockType.COMMAND,
            text: 'draw all sprites' },
          { opcode: 'clearscreen', blockType: Scratch.BlockType.COMMAND,
            text: 'clear game screen' },
          { opcode: 'setbrightness', blockType: Scratch.BlockType.COMMAND,
            text: 'set sprite [NAME] brightness [B]',
            arguments: { ...str('NAME', 'player'), ...n('B', 9) } },

          // MakeCode Arcade sprite handles. IDs survive in Scratch variables;
          // the blocks, including their arguments, serialize in normal .sb3.
          '---',
          { opcode: 'spawnSprite', blockType: Scratch.BlockType.REPORTER,
            text: 'spawn Arcade sprite from [TEMPLATE] kind [KIND] x [X] y [Y] width [WIDTH] height [HEIGHT]',
            arguments: { ...str('TEMPLATE', 'sprite'), ...str('KIND', 'Player'),
              ...n('X', 80), ...n('Y', 60), ...n('WIDTH', 16), ...n('HEIGHT', 16) } },
          { opcode: 'spawnProjectile', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade projectile from [TEMPLATE] kind [KIND] vx [VX] vy [VY] width [WIDTH] height [HEIGHT] mode [MODE] source [SOURCE]',
            arguments: { ...str('TEMPLATE', 'projectile'), ...str('KIND', 'Projectile'),
              ...n('VX', -50), ...n('VY', 0), ...n('WIDTH', 8), ...n('HEIGHT', 8),
              ...str('MODE', 'kind'), ...str('SOURCE', '') } },
          { opcode: 'spawnImageProjectile', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade projectile image [IMAGE] template [TEMPLATE] kind [KIND] vx [VX] vy [VY] mode [MODE] source [SOURCE]',
            arguments: {...str('IMAGE', ''), ...str('TEMPLATE', 'projectile'), ...str('KIND', 'Projectile'),
              ...n('VX', 50), ...n('VY', 0), ...str('MODE', 'side'), ...str('SOURCE', '')} },
          { opcode: 'spriteToString', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprite [ID] as text', arguments: str('ID', '') },
          { opcode: 'destroySprite', blockType: Scratch.BlockType.COMMAND,
            text: 'destroy Arcade sprite [ID]', arguments: str('ID', '') },
          { opcode: 'spriteSay', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade sprite [ID] say [TEXT] for [DURATION] ms animated [ANIMATED] text color [FOREGROUND] box color [BACKGROUND] mode [MODE]',
            arguments: { ...str('ID', 'self'), ...str('TEXT', 'Hello'), ...n('DURATION', -1),
              ANIMATED: {type: Scratch.ArgumentType.BOOLEAN}, ...n('FOREGROUND', 15), ...n('BACKGROUND', 1),
              MODE: {type: Scratch.ArgumentType.STRING, menu: 'speechModes', defaultValue: 'text'} } },
          { opcode: 'registerSpriteDestroyed', blockType: Scratch.BlockType.COMMAND,
            text: 'when Arcade sprite [ID] is destroyed run [TOKEN]',
            arguments: { ...str('ID', ''), ...str('TOKEN', 'handler') } },
          { opcode: 'setSpritePosition', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] position x [X] y [Y]',
            arguments: {...str('ID', ''), ...n('X', 80), ...n('Y', 60)} },
          { opcode: 'createSprite', blockType: Scratch.BlockType.REPORTER,
            text: 'create Arcade sprite template [TEMPLATE] kind [KIND] width [WIDTH] height [HEIGHT]',
            arguments: {...str('TEMPLATE', 'sprite'), ...str('KIND', 'Player'), ...n('WIDTH', 16), ...n('HEIGHT', 16)} },
          { opcode: 'createImageSprite', blockType: Scratch.BlockType.REPORTER,
            text: 'create Arcade sprite image [IMAGE] template [TEMPLATE] kind [KIND]',
            arguments: {...str('IMAGE', ''), ...str('TEMPLATE', 'sprite'), ...str('KIND', 'Player')} },
          { opcode: 'createAnimation', blockType: Scratch.BlockType.REPORTER,
            text: 'create Arcade animation action [ACTION] interval [INTERVAL] ms',
            arguments: {...n('ACTION', 0), ...n('INTERVAL', 100)} },
          { opcode: 'addAnimationFrame', blockType: Scratch.BlockType.COMMAND,
            text: 'add Arcade image [IMAGE] to animation [ANIMATION]',
            arguments: {...str('IMAGE', ''), ...str('ANIMATION', '')} },
          { opcode: 'attachAnimation', blockType: Scratch.BlockType.COMMAND,
            text: 'attach Arcade animation [ANIMATION] to sprite [ID]',
            arguments: {...str('ANIMATION', ''), ...str('ID', '')} },
          { opcode: 'setAnimationAction', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] animation action [ACTION]',
            arguments: {...str('ID', ''), ...n('ACTION', 0)} },
          { opcode: 'animationProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade animation [ANIMATION] [PROPERTY]',
            arguments: {...str('ANIMATION', ''), PROPERTY: {type: Scratch.ArgumentType.STRING,
              menu: 'animationProperties', defaultValue: 'interval'}} },
          { opcode: 'setAnimationInterval', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade animation [ANIMATION] interval [INTERVAL] ms',
            arguments: {...str('ANIMATION', ''), ...n('INTERVAL', 100)} },
          { opcode: 'animationAssetFrames', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade animation asset [RESOURCE] frames',
            arguments: {RESOURCE: {type: Scratch.ArgumentType.STRING, menu: 'animationAssets', defaultValue: 'none'}} },
          { opcode: 'animationAssetFreshFrames', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade animation asset [RESOURCE] fresh frames',
            arguments: {RESOURCE: {type: Scratch.ArgumentType.STRING, menu: 'animationAssets', defaultValue: 'none'}} },
          { opcode: 'animationAssetInterval', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade animation asset [RESOURCE] interval ms',
            arguments: {RESOURCE: {type: Scratch.ArgumentType.STRING, menu: 'animationAssets', defaultValue: 'none'}} },
          { opcode: 'runImageAnimation', blockType: Scratch.BlockType.COMMAND,
            text: 'animate Arcade sprite [ID] frames [FRAMES] interval [INTERVAL] ms loop [LOOP]',
            arguments: {...str('ID', ''), ...str('FRAMES', ''), ...n('INTERVAL', 500), LOOP: {type: Scratch.ArgumentType.BOOLEAN}} },
          { opcode: 'stopAnimation', blockType: Scratch.BlockType.COMMAND,
            text: 'stop Arcade sprite [ID] animations type [TYPE]',
            arguments: {...str('ID', ''), TYPE: {type: Scratch.ArgumentType.STRING,
              menu: 'animationTypes', defaultValue: '0'}} },
          {opcode:'setSpriteScale',blockType:Scratch.BlockType.COMMAND,text:'set Arcade sprite [ID] scale to [VALUE] anchor [ANCHOR]',arguments:{...str('ID',''),...n('VALUE',1),ANCHOR:{type:Scratch.ArgumentType.NUMBER,menu:'scaleAnchors',defaultValue:0}}},
          {opcode:'changeSpriteScale',blockType:Scratch.BlockType.COMMAND,text:'change Arcade sprite [ID] scale by [VALUE] anchor [ANCHOR]',arguments:{...str('ID',''),...n('VALUE',1),ANCHOR:{type:Scratch.ArgumentType.NUMBER,menu:'scaleAnchors',defaultValue:0}}},
          {opcode:'setSpriteScaleCore',blockType:Scratch.BlockType.COMMAND,text:'set Arcade sprite [ID] scale x [SX] y [SY] anchor [ANCHOR] proportional [PROPORTIONAL]',arguments:{...str('ID',''),...str('SX',''),...str('SY',''),ANCHOR:{type:Scratch.ArgumentType.NUMBER,menu:'scaleAnchors',defaultValue:0},PROPORTIONAL:{type:Scratch.ArgumentType.BOOLEAN}}},
          { opcode: 'setSpriteProperty', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] [PROPERTY] to [VALUE]',
            arguments: { ...str('ID', ''), PROPERTY: {type: Scratch.ArgumentType.STRING, menu: 'spriteProperties', defaultValue: 'x'},
              ...n('VALUE', 0) } },
          { opcode: 'mutateSpriteImage', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade sprite [ID] image [OP] color [COLOR] replacement [TO]',
            arguments: {...str('ID', ''), OP: {type: Scratch.ArgumentType.STRING,
              menu: 'imageOperations', defaultValue: 'fill'}, ...n('COLOR', 1), ...n('TO', 2)} },
          { opcode: 'setSpritePixel', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] image pixel x [X] y [Y] color [COLOR]',
            arguments: {...str('ID', ''), ...n('X', 0), ...n('Y', 0), ...n('COLOR', 1)} },
          { opcode: 'spritePixel', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprite [ID] image pixel x [X] y [Y]',
            arguments: {...str('ID', ''), ...n('X', 0), ...n('Y', 0)} },
          { opcode: 'drawSpriteImage', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade sprite [ID] image [OP] x [X] y [Y] width / end x [W] height / end y [H] color [COLOR]',
            arguments: {...str('ID', ''), OP: {type: Scratch.ArgumentType.STRING,
              menu: 'imageDrawOperations', defaultValue: 'fillRect'}, ...n('X', 0), ...n('Y', 0),
              ...n('W', 4), ...n('H', 4), ...n('COLOR', 1)} },
          { opcode: 'createImage', blockType: Scratch.BlockType.REPORTER,
            text: 'new Arcade image width [WIDTH] height [HEIGHT]', arguments: {...n('WIDTH', 16), ...n('HEIGHT', 16)} },
          { opcode: 'cloneImage', blockType: Scratch.BlockType.REPORTER,
            text: 'copy Arcade image [IMAGE]', arguments: str('IMAGE', '') },
          { opcode: 'imageProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade image [IMAGE] [PROPERTY]', arguments: {...str('IMAGE', ''),
              PROPERTY: {type: Scratch.ArgumentType.STRING, menu: 'imageProperties', defaultValue: 'width'}} },
          {opcode:'copyImageFrom',blockType:Scratch.BlockType.COMMAND,text:'copy pixels into Arcade image [IMAGE] from [SOURCE]',arguments:{...str('IMAGE',''),...str('SOURCE','')}},
          {opcode:'scrollImage',blockType:Scratch.BlockType.COMMAND,text:'scroll Arcade image [IMAGE] x [X] y [Y]',arguments:{...str('IMAGE',''),...n('X',0),...n('Y',1)}},
          { opcode: 'mutateImage', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade image [IMAGE] [OP] color [COLOR] replacement [TO]',
            arguments: {...str('IMAGE', ''), OP: {type: Scratch.ArgumentType.STRING,menu:'imageOperations',defaultValue:'fill'}, ...n('COLOR', 1), ...n('TO', 2)} },
          { opcode: 'setImagePixel', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade image [IMAGE] pixel x [X] y [Y] color [COLOR]', arguments: {...str('IMAGE', ''), ...n('X', 0), ...n('Y', 0), ...n('COLOR', 1)} },
          { opcode: 'imagePixel', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade image [IMAGE] pixel x [X] y [Y]', arguments: {...str('IMAGE', ''), ...n('X', 0), ...n('Y', 0)} },
          { opcode: 'drawImage', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade image [IMAGE] [OP] x [X] y [Y] width / end x [W] height / end y [H] color [COLOR]',
            arguments: {...str('IMAGE', ''), OP: {type: Scratch.ArgumentType.STRING,menu:'imageDrawOperations',defaultValue:'fillRect'},
              ...n('X', 0), ...n('Y', 0), ...n('W', 4), ...n('H', 4), ...n('COLOR', 1)} },
          { opcode: 'blitImage', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade image [IMAGE] [OP] source [SOURCE] x [X] y [Y]',
            arguments: {...str('IMAGE', ''), ...str('SOURCE', ''), ...n('X', 0), ...n('Y', 0),
              OP: {type: Scratch.ArgumentType.STRING, menu:'imageBlitOperations', defaultValue:'drawImage'}} },
          { opcode: 'imagesOverlap', blockType: Scratch.BlockType.BOOLEAN,
            text: 'Arcade image [IMAGE] overlaps image [SOURCE] x [X] y [Y]',
            arguments: {...str('IMAGE', ''), ...str('SOURCE', ''), ...n('X', 0), ...n('Y', 0)} },
          { opcode: 'spawnImageSprite', blockType: Scratch.BlockType.REPORTER,
            text: 'spawn Arcade sprite image [IMAGE] template [TEMPLATE] kind [KIND] x [X] y [Y]',
            arguments: {...str('IMAGE', ''), ...str('TEMPLATE', 'sprite'), ...str('KIND', 'Player'), ...n('X', 80), ...n('Y', 60)} },
          { opcode: 'spriteImage', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprite [ID] image', arguments: str('ID', '') },
          { opcode: 'setSpriteImage', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] image to [IMAGE]', arguments: {...str('ID', ''), ...str('IMAGE', '')} },
          { opcode: 'frameImage', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade image array [KEY] frame [INDEX] from [TEMPLATE] start [START] count [COUNT]',
            arguments: {...str('KEY', 'frames'), ...n('INDEX', 0), ...str('TEMPLATE', 'sprite'), ...n('START', 0), ...n('COUNT', 1)} },
          { opcode: 'setSpriteCostume', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] costume to [COSTUME]',
            arguments: { ...str('ID', ''), ...n('COSTUME', 0) } },
          { opcode: 'registerLegacyWallHandler', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade register color wall kind [KIND] index [INDEX] as [TOKEN] capturing [CAPTURES]',
            arguments: {...str('KIND','Player'),...n('INDEX',1),...str('TOKEN','colorwall'),...str('CAPTURES','')} },
          { opcode: 'whenRegisteredLegacyWall', blockType: Scratch.BlockType.HAT, isEdgeActivated: false,
            text: 'when Arcade color wall handler [TOKEN] runs', arguments: str('TOKEN','colorwall') },
          { opcode: 'tileHitFrom', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprite [ID] wall hit index [DIRECTION]', arguments: {...str('ID',''),DIRECTION:{type:Scratch.ArgumentType.STRING,menu:'collisionDirections',defaultValue:'2'}} },
          { opcode: 'registerWallHandler', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade register wall kind [KIND] as [TOKEN] capturing [CAPTURES]',
            arguments: {...str('KIND', 'Player'), ...str('TOKEN', 'wall'), ...str('CAPTURES', '')} },
          { opcode: 'registerTileHandler', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade register tile kind [KIND] image [IMAGE] as [TOKEN] capturing [CAPTURES]',
            arguments: {...str('KIND', 'Player'), ...str('IMAGE', ''), ...str('TOKEN', 'tile'), ...str('CAPTURES', '')} },
          { opcode: 'whenRegisteredWall', blockType: Scratch.BlockType.HAT, isEdgeActivated: false,
            text: 'when Arcade wall handler [TOKEN] runs', arguments: str('TOKEN', 'wall') },
          { opcode: 'whenRegisteredTile', blockType: Scratch.BlockType.HAT, isEdgeActivated: false,
            text: 'when Arcade tile handler [TOKEN] runs', arguments: str('TOKEN', 'tile') },
          { opcode: 'eventLocation', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade event location' },
          { opcode: 'centerCameraAt', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade center camera x [X] y [Y]', arguments: {...n('X', 80), ...n('Y', 60)} },
          { opcode: 'cameraShake', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade shake camera by [AMPLITUDE] pixels for [DURATION] ms', arguments: {...n('AMPLITUDE', 4), ...n('DURATION', 500)} },
          { opcode: 'cameraFollowSprite', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade camera follow sprite [ID]', arguments: str('ID', '') },
          { opcode: 'cameraProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade camera property [PROPERTY]', arguments: {PROPERTY: {type: Scratch.ArgumentType.STRING,
              menu: 'cameraProperties', defaultValue: '0'}} },
          { opcode: 'isHittingTile', blockType: Scratch.BlockType.BOOLEAN,
            text: 'Arcade sprite [ID] hitting wall [DIRECTION]', arguments: {...str('ID', ''),
              DIRECTION: {type: Scratch.ArgumentType.STRING, menu: 'collisionDirections', defaultValue: '3'}} },
          { opcode: 'setSpriteFlag', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] flag [FLAG] to [ON]',
            arguments: { ...str('ID', ''), FLAG: {type: Scratch.ArgumentType.STRING,
              menu: 'spriteFlags', defaultValue: 'Invisible'}, ...n('ON', 1) } },
          { opcode: 'setSpriteStayInScreen', blockType: Scratch.BlockType.COMMAND,
            text: 'keep Arcade sprite [ID] in screen [ON]',
            arguments: { ...str('ID', ''), ...n('ON', 1) } },
          { opcode: 'setSpriteAutoDestroy', blockType: Scratch.BlockType.COMMAND,
            text: 'auto destroy Arcade sprite [ID] outside screen [ON]',
            arguments: { ...str('ID', ''), ...n('ON', 1) } },
          { opcode: 'setSpriteBounceOnWall', blockType: Scratch.BlockType.COMMAND,
            text: 'bounce Arcade sprite [ID] on screen edge [ON]',
            arguments: { ...str('ID', ''), ...n('ON', 1) } },
          { opcode: 'setSpriteGhostThroughSprites', blockType: Scratch.BlockType.COMMAND,
            text: 'Arcade sprite [ID] passes through other sprites [ON]',
            arguments: { ...str('ID', ''), ...n('ON', 1) } },
          {opcode:'currentScene',blockType:Scratch.BlockType.REPORTER,text:'Arcade current scene'},
          {opcode:'scenePhysicsEngine',blockType:Scratch.BlockType.REPORTER,text:'Arcade physics engine of scene [SCENE]',arguments:str('SCENE','')},
          {opcode:'createPhysicsEngine',blockType:Scratch.BlockType.REPORTER,text:'Arcade create physics engine max speed [MAX_SPEED] min step [MIN_STEP] max step [MAX_STEP]',arguments:{...n('MAX_SPEED',500),...n('MIN_STEP',2),...n('MAX_STEP',4)}},
          {opcode:'physicsEngineProperty',blockType:Scratch.BlockType.REPORTER,text:'Arcade physics engine [ENGINE] property [PROPERTY]',arguments:{...str('ENGINE',''),PROPERTY:{type:Scratch.ArgumentType.STRING,menu:'physicsEngineProperties',defaultValue:'maxSpeed'}}},
          {opcode:'setPhysicsEngineProperty',blockType:Scratch.BlockType.COMMAND,text:'set Arcade physics engine [ENGINE] property [PROPERTY] to [VALUE]',arguments:{...str('ENGINE',''),PROPERTY:{type:Scratch.ArgumentType.STRING,menu:'physicsEngineProperties',defaultValue:'maxSpeed'},...n('VALUE',500)}},
          {opcode:'setScenePhysicsEngine',blockType:Scratch.BlockType.COMMAND,text:'set Arcade physics engine of scene [SCENE] to [ENGINE]',arguments:{...str('SCENE',''),...str('ENGINE','')}},
          { opcode: 'spriteProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprite [ID] [PROPERTY]',
            arguments: { ...str('ID', ''), PROPERTY: {type: Scratch.ArgumentType.STRING, menu: 'spriteProperties', defaultValue: 'x'} } },
          { opcode: 'setSpriteKind', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade sprite [ID] kind [KIND]',
            arguments: { ...str('ID', ''), ...str('KIND', 'Player') } },
          { opcode: 'spriteOverlaps', blockType: Scratch.BlockType.BOOLEAN,
            text: 'Arcade sprite [A] overlaps [B]?',
            arguments: { ...str('A', ''), ...str('B', '') } },
          { opcode: 'setLegacyTilemap', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade color-coded map image [IMAGE] scale exponent [SCALE]', arguments: {...str('IMAGE',''), ...n('SCALE',4)} },
          { opcode: 'setLegacyTile', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade color tile [INDEX] image [IMAGE] wall [WALL]', arguments: {...n('INDEX',1), ...str('IMAGE',''), ...n('WALL',0)} },
          { opcode: 'legacyTileLocation', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade color tile column [COLUMN] row [ROW]', arguments: {...n('COLUMN',0),...n('ROW',0)} },
          { opcode: 'legacyTilesOfType', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade color tiles of index [INDEX]', arguments: n('INDEX',1) },
          { opcode: 'legacyTileProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade color tile [TILE] [PROPERTY]', arguments: {...str('TILE',''),PROPERTY:{type:Scratch.ArgumentType.STRING,menu:'legacyTileProperties',defaultValue:'x'}} },
          { opcode: 'setLegacyTileAt', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade color tile [TILE] index [INDEX]', arguments: {...str('TILE',''),...n('INDEX',1)} },
          { opcode: 'placeOnLegacyTile', blockType: Scratch.BlockType.COMMAND,
            text: 'on Arcade color tile [TILE] place sprite [ID]', arguments: {...str('TILE',''),...str('ID','')} },
          { opcode: 'placeOnRandomLegacyTile', blockType: Scratch.BlockType.COMMAND,
            text: 'place Arcade sprite [ID] on random color tile [INDEX]', arguments: {...str('ID',''),...n('INDEX',1)} },
          { opcode: 'setTilemap', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade tilemap [DATA]', arguments: str('DATA', '') },
          { opcode: 'tileLocation', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade tile location column [COLUMN] row [ROW]', arguments: {...n('COLUMN', 0), ...n('ROW', 0)} },
          { opcode: 'tilesOfType', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade tile locations of image [IMAGE]', arguments: str('IMAGE', '') },
          { opcode: 'tileLocationProperty', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade tile location [LOCATION] [PROPERTY]', arguments: {...str('LOCATION', ''), PROPERTY:{type:Scratch.ArgumentType.STRING,menu:'tileLocationProperties',defaultValue:'column'}} },
          { opcode: 'tileAtLocation', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade tile image at [LOCATION]', arguments: str('LOCATION', '') },
          { opcode: 'tileIs', blockType: Scratch.BlockType.BOOLEAN,
            text: 'Arcade tile at [LOCATION] is image [IMAGE]', arguments: {...str('LOCATION', ''), ...str('IMAGE', '')} },
          { opcode: 'tileIsWall', blockType: Scratch.BlockType.BOOLEAN,
            text: 'Arcade tile at [LOCATION] is wall', arguments: str('LOCATION', '') },
          { opcode: 'setTileAt', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade tile at [LOCATION] to image [IMAGE]', arguments: {...str('LOCATION', ''), ...str('IMAGE', '')} },
          { opcode: 'setWallAt', blockType: Scratch.BlockType.COMMAND,
            text: 'set Arcade wall at [LOCATION] to [WALL]', arguments: {...str('LOCATION', ''), WALL: {type: Scratch.ArgumentType.BOOLEAN}} },
          { opcode: 'placeOnTile', blockType: Scratch.BlockType.COMMAND,
            text: 'place Arcade sprite [ID] on tile [LOCATION]', arguments: {...str('ID', ''), ...str('LOCATION', '')} },
          { opcode: 'placeOnRandomTile', blockType: Scratch.BlockType.COMMAND,
            text: 'place Arcade sprite [ID] on random tile image [IMAGE]', arguments: {...str('ID', ''), ...str('IMAGE', '')} },
          { opcode: 'spritesOfKind', blockType: Scratch.BlockType.REPORTER,
            text: 'array of Arcade sprites of kind [KIND]', arguments: str('KIND', 'Player') },
          { opcode: 'spriteCount', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade sprites of kind [KIND]', arguments: str('KIND', 'Player') },
          { opcode: 'whenSpriteCreated', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade sprite kind [KIND] created', isEdgeActivated: false,
            arguments: str('KIND', 'Player') },
          { opcode: 'whenSpriteDestroyed', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade sprite kind [KIND] destroyed', isEdgeActivated: false,
            arguments: str('KIND', 'Player') },
          { opcode: 'whenRegisteredCreated', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade creation handler [TOKEN] runs', isEdgeActivated: false, arguments: str('TOKEN', 'handler') },
          { opcode: 'whenRegisteredDestroyed', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade destruction handler [TOKEN] runs', isEdgeActivated: false,
            arguments: str('TOKEN', 'handler') },
          { opcode: 'whenSpritesOverlap', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade kinds [A] and [B] overlap', isEdgeActivated: false,
            arguments: { ...str('A', 'Player'), ...str('B', 'Enemy') } },
          { opcode: 'eventSprite', blockType: Scratch.BlockType.REPORTER,
            text: 'Arcade event sprite [WHICH]',
            arguments: { WHICH: {type: Scratch.ArgumentType.STRING, menu: 'eventSprites', defaultValue: 'first'} } },

          {opcode:'truncateNumber',blockType:Scratch.BlockType.REPORTER,text:'Arcade truncate [NUM] toward zero',arguments:n('NUM',0)},
          {opcode:'signNumber',blockType:Scratch.BlockType.REPORTER,text:'Arcade sign of [NUM]',arguments:n('NUM',0)},

          // ── Game flow ────────────────────────────────────────────
          '---',
          { opcode: 'whenInterval', blockType: Scratch.BlockType.HAT,
            text: 'every [PERIOD] ms in Arcade', isEdgeActivated: false,
            arguments: n('PERIOD', 1000) },
          { opcode: 'whenUpdate', blockType: Scratch.BlockType.HAT,
            text: 'each Arcade game update', isEdgeActivated: false },
          { opcode: 'gameover', blockType: Scratch.BlockType.COMMAND,
            text: 'game over' },
          { opcode: 'whenCountdownEnds', blockType: Scratch.BlockType.HAT,
            text: 'when Arcade countdown ends', isEdgeActivated: false },
          { opcode: 'countdown', blockType: Scratch.BlockType.COMMAND,
            text: 'countdown from [N]',
            arguments: n('N', 3) }
          ,{ opcode: 'startCountdown', blockType: Scratch.BlockType.COMMAND,
            text: 'start Arcade countdown [N] seconds', arguments: n('N', 3) }
          ,{ opcode: 'stopCountdown', blockType: Scratch.BlockType.COMMAND,
            text: 'stop Arcade countdown' }
        ],
        menus: {
          buttons: {acceptReporters: true, items: [
            {text: 'A', value: 'a'}, {text: 'B', value: 'b'},
            {text: 'up', value: 'up'}, {text: 'down', value: 'down'},
            {text: 'left', value: 'left'}, {text: 'right', value: 'right'},
            {text: 'Start', value: 'start'}, {text: 'Select / menu', value: 'select'}
          ]},
          buttonEvents:{acceptReporters:true,items:[{text:'pressed',value:'2049'},{text:'released',value:'2048'},{text:'repeated',value:'2054'}]},
          axes: {acceptReporters: true, items: ['x', 'y']}
          ,dialogLayouts: {acceptReporters: false, items: ['Left', 'Right', 'Top', 'Bottom', 'Center', 'Full']}
          ,legacyTileProperties: {acceptReporters:false,items:['x','y','tileSet']}
          ,tileLocationProperties: {acceptReporters:false,items:['column','row','x','y','left','right','top','bottom','tileSet']}
          ,physicsEngineProperties: {acceptReporters:false,items:['maxSpeed','minStep','maxStep']}
          ,scaleAnchors:{acceptReporters:true,items:[{text:'middle',value:'0'},{text:'top',value:'1'},{text:'left',value:'2'},{text:'right',value:'4'},{text:'bottom',value:'8'},{text:'top left',value:'3'},{text:'top right',value:'5'},{text:'bottom left',value:'10'},{text:'bottom right',value:'12'}]}
          ,spriteProperties: {acceptReporters: false, items: ['x', 'y', 'left', 'right', 'top', 'bottom',
            'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale', 'width', 'height', 'z', 'lifespan',
            'rotation', 'rotationDegrees', 'data']}
          ,eventSprites: {acceptReporters: false, items: ['first', 'second']}
          ,cameraProperties: {acceptReporters: true, items: [{text:'x',value:'0'}, {text:'y',value:'1'}, {text:'left',value:'2'}, {text:'right',value:'3'}, {text:'top',value:'4'}, {text:'bottom',value:'5'}]}
          ,collisionDirections: {acceptReporters: true, items: [{text:'left',value:'0'}, {text:'top',value:'1'}, {text:'right',value:'2'}, {text:'bottom',value:'3'}]}
          ,controllerNumbers: {acceptReporters:false,items:['1','2','3','4']}
          ,playerReadModes: {acceptReporters:false,items:['safe','member']}
          ,playerLookupModes: {acceptReporters:false,items:['number','index']}
          ,animationAssets: {acceptReporters: true, items: 'getAnimationAssets'}
          ,animationProperties: {acceptReporters: false, items: ['image', 'action', 'interval']}
          ,animationTypes: {acceptReporters: true, items: [{text:'all',value:'0'}, {text:'image',value:'1'}, {text:'movement',value:'2'}]}
          ,imageProperties: {acceptReporters: false, items: ['width', 'height']}
          ,imageBlitOperations: {acceptReporters: false, items: ['drawImage', 'drawTransparentImage']},
          imageDrawOperations: {acceptReporters: false, items: ['fillRect', 'drawLine']},
          imageOperations: {acceptReporters: false, items: ['fill', 'replace', 'flipX', 'flipY']},
          spriteFlags: {acceptReporters: false, items: Object.keys(spriteFlags)}
          ,speechModes: {acceptReporters: false, items: ['text', 'legacy']}
        }
      };
    }

    _state() {
      if (this._runtime) {
        if (!this._runtime.bwArcadeDeviceState) this._runtime.bwArcadeDeviceState = {};
        const state = this._runtime.bwArcadeDeviceState;
        if (!state.buttons) state.buttons = {};
        if (!state.controllerButtons) state.controllerButtons = {};
        if (!state.sprites) state.sprites = {};
        if (!Number.isFinite(state.nextSpriteId)) state.nextSpriteId = 0;
        if (!state.spriteTargets) state.spriteTargets = {};
        if (!Array.isArray(state.neopixels)) state.neopixels = Array(5).fill('#111827');
        if (!Number.isFinite(state.score)) state.score = 0;
        state.palette=this._paletteColors().slice();
        this._ensureSceneEngine(state);return state;
      }
      if (!this._fallbackState) this._fallbackState = {buttons: {}, controllerButtons: {}, sprites: {}, neopixels: Array(5).fill('#111827'), score: 0};
      this._fallbackState.palette=this._paletteColors().slice();
      this._ensureSceneEngine(this._fallbackState);return this._fallbackState;
    }

    _players() {
      const state=this._state();
      if(!state._mpPlayers)state._mpPlayers=Array.from({length:4},(_,index)=>{
        const player={id:'arcade-player:'+(++this._nextPlayerValue),index,sprite:undefined};
        this._playerValues.set(player.id,player);return player;
      });
      return state._mpPlayers;
    }
    _player(value) {return this._playerValues.get(Scratch.BWValues.referenceId(this._runtime,value,'player'));}
    _playerRef(player) {return player?Scratch.BWValues.reference(this._runtime,'player',player.id):Scratch.BWValues.encode(undefined);}
    playerLookup(args) {
      const raw=Scratch.BWValues.decode(args.VALUE);
      const key=String(args.MODE)==='number'?Number(raw)-1:raw;
      // PXT indexes the player array directly. A null index is not index zero;
      // canonical numeric strings name array slots, other property names do not.
      const index=typeof key==='string' && String(Number(key))===key?Number(key):key;
      return this._playerRef(Number.isInteger(index)&&index>=0&&index<4?this._players()[index]:undefined);
    }
    allPlayers() {return Scratch.BWValues.arrayReference(this._runtime,this._players().map(player=>this._playerRef(player)));}
    playerSprite(args) {return Scratch.BWValues.encode(this._player(args.PLAYER)?.sprite);}
    setPlayerSprite(args) {
      const player=this._player(args.PLAYER);if(!player)return;
      if(player.movement)this._stopControllingSprite(player.index+1,player.sprite);
      player.sprite=Scratch.BWValues.decode(args.ID);
      if(player.movement)this._controlSprite(player.index+1,player.sprite,player.vx,player.vy);
    }
    movePlayerWithButtons(args) {
      const player=this._player(args.PLAYER);if(!player)return;
      player.movement=true;player.vx=Scratch.BWValues.decode(args.VX);player.vy=Scratch.BWValues.decode(args.VY);
      this._controlSprite(player.index+1,player.sprite,player.vx,player.vy);
    }
    createPlayerState() {return this._nextMultiplayerState++;}
    _playerStateNumber(value) {const raw=Scratch.BWValues.decode(value);return typeof raw==='string'?Number(raw):raw;}
    _customPlayerState(player,key) {
      const entries=player.states || (player.states=[]);
      let entry=entries.find(value=>value.key===key);
      if(!entry){entry={key,value:0};entries.push(entry);}return entry;
    }
    getPlayerState(args) {
      const player=this._player(args.PLAYER);if(!player)return 0;
      const key=this._playerStateNumber(args.KEY);
      if(key===0)return this.getPlayerScore({PLAYER:player.index+1});
      if(key===1)return this.getLife({PLAYER:player.index+1});
      return Scratch.BWValues.encode(this._customPlayerState(player,key).value);
    }
    setPlayerState(args) {
      const player=this._player(args.PLAYER);if(!player)return;
      const key=this._playerStateNumber(args.KEY),value=this._playerStateNumber(args.VALUE);
      if(key===0)this.setPlayerScore({PLAYER:player.index+1,VALUE:value});
      if(key===1)this.setLife({PLAYER:player.index+1,VALUE:value});
      this._customPlayerState(player,key).value=value;
    }
    changePlayerState(args) {
      if(!this._player(args.PLAYER))return;
      this.setPlayerState({...args,VALUE:Scratch.BWValues.decode(this.getPlayerState(args))+this._playerStateNumber(args.VALUE)});
    }
    playerBySprite(args) {const sprite=Scratch.BWValues.decode(args.ID);return this._playerRef(this._players().find(player=>player.sprite===sprite));}
    playerProperty(args) {
      const player=this._player(args.PLAYER),property=Number(Scratch.BWValues.decode(args.PROPERTY));
      if(String(args.READ)==='member' && !player)throw new TypeError('Cannot read property of missing mp.Player');
      return player?(property===1?player.index:property===2?player.index+1:0):0;
    }

    _newPhysicsEngine(maxSpeed=500,minStep=2,maxStep=4) {
      const id='arcade-engine:'+(++this._nextPhysicsEngine);
      const engine={id,members:[],maxVelocity:(Number(maxSpeed)*256)|0,minSingleStep:(Number(minStep)*256)|0,maxSingleStep:(Number(maxStep)*256)|0};
      this._physicsEngines.set(id,engine);return engine;
    }
    _ensureSceneEngine(state) {
      if(this._sceneValues.get(state._sceneValueId)!==state){state._sceneValueId='arcade-scene:'+(++this._nextSceneValue);this._sceneValues.set(state._sceneValueId,state);}
      if(this._physicsEngines.get(state.physicsEngine?.id)!==state.physicsEngine || !state.physicsEngine)state.physicsEngine=this._newPhysicsEngine();
    }
    _sceneValue(value) {return this._sceneValues.get(Scratch.BWValues.referenceId(this._runtime,value,'scene'));}
    _engineValue(value) {return this._physicsEngines.get(Scratch.BWValues.referenceId(this._runtime,value,'physics-engine'));}
    currentScene() {return Scratch.BWValues.reference(this._runtime,'scene',this._state()._sceneValueId);}
    scenePhysicsEngine(args) {const scene=this._sceneValue(args.SCENE);return scene?Scratch.BWValues.reference(this._runtime,'physics-engine',scene.physicsEngine.id):Scratch.BWValues.encode(undefined);}
    createPhysicsEngine(args) {
      const defaults=[500,2,4];
      const values=['MAX_SPEED','MIN_STEP','MAX_STEP'].map((key,index)=>Object.prototype.hasOwnProperty.call(args,key)?Number(Scratch.BWValues.decode(args[key])):defaults[index]);
      const engine=this._newPhysicsEngine(...values);return Scratch.BWValues.reference(this._runtime,'physics-engine',engine.id);
    }
    physicsEngineProperty(args) {
      const engine=this._engineValue(args.ENGINE),key={maxSpeed:'maxVelocity',minStep:'minSingleStep',maxStep:'maxSingleStep'}[String(args.PROPERTY)];
      return engine&&key?(engine[key]+128)>>8:Scratch.BWValues.encode(undefined);
    }
    setPhysicsEngineProperty(args) {
      const engine=this._engineValue(args.ENGINE),key={maxSpeed:'maxVelocity',minStep:'minSingleStep',maxStep:'maxSingleStep'}[String(args.PROPERTY)];
      if(engine&&key)engine[key]=(Number(Scratch.BWValues.decode(args.VALUE))*256)|0;
    }
    setScenePhysicsEngine(args) {const scene=this._sceneValue(args.SCENE),engine=this._engineValue(args.ENGINE);if(scene&&engine)scene.physicsEngine=engine;}

    _sceneBundle() {
      const bundle={state:this._state()};
      for(const key of ['_speech','_background','_backgroundImage','_tilemapDrawable','_createdHandlers','_wallHandlers','_legacyWallHandlers','_tileHandlers',
        '_activeLegacyAnimations','_imageAnimations','_animationUpdateOrder','_updateHandlers','_intervalHandlers','_buttonHandlers','_destroyedHandlers','_overlapHandlers','_foreverHandlers','_countdownHandlers'])bundle[key]=this[key];
      return bundle;
    }
    _sceneVisible(bundle, visible) {
      const renderer=this._runtime?.renderer;
      for(const [id,target] of Object.entries(bundle.state.spriteTargets || {}))target.setVisible?.(visible && !bundle.state.sprites[id]?.invisible);
      for(const [id,sprite] of Object.entries(bundle.state.sprites || {})) {
        const entry=this._imageSkins.get(id);
        if(entry?.drawableId!==undefined)renderer?.updateDrawableVisible?.(entry.drawableId,visible && !sprite.invisible);
      }
      for(const key of ['_background','_backgroundImage','_tilemapDrawable'])if(bundle[key])renderer?.updateDrawableVisible?.(bundle[key].drawable,visible);
      for(const entry of bundle._speech.values())if(entry.drawableId!==undefined)renderer?.updateDrawableVisible?.(entry.drawableId,visible && entry.target?.visible!==false);
    }
    _activateScene(bundle) {
      if(this._runtime)this._runtime.bwArcadeDeviceState=bundle.state;else this._fallbackState=bundle.state;
      for(const key of Object.keys(bundle))if(key!=='state')this[key]=bundle[key];
      this._terrainFrame=this._sceneFrames.get(bundle.state) || null;
      this._sceneVisible(bundle,true);
      for(const sprite of Object.values(bundle.state.sprites || {})){if(sprite.image)this._renderSpriteImage(sprite.id);this._positionSprite(sprite.id);}
      this._renderPalette();
      this._changed();
    }
    _freshScene(previous) {
      const state={overlapLocks:new Set(),buttons:previous.buttons,controllerButtons:previous.controllerButtons,neopixels:previous.neopixels,light:previous.light,tiltX:previous.tiltX,tiltY:previous.tiltY,serial:previous.serial};
      const bundle={state,_speech:new Map(),_background:null,_backgroundImage:null,_tilemapDrawable:null,_createdHandlers:[],_wallHandlers:[],_legacyWallHandlers:[],_tileHandlers:[],
        _activeLegacyAnimations:new Set(),_imageAnimations:new Map(),_animationUpdateOrder:[],_updateHandlers:[],_intervalHandlers:[],_buttonHandlers:[],_destroyedHandlers:[],_overlapHandlers:[],_foreverHandlers:[],_countdownHandlers:[]};
      return bundle;
    }
    pushScene(args,util) {
      const old=this._sceneBundle();this._sceneBundles.add(old);this._sceneStack.push(old);this._sceneVisible(old,false);
      this._activateScene(this._freshScene(old.state));
      return this._runTerrainGenerator(this._registeredCallbackSteps(this._scenePushHandlers.slice(),'arcade_whenRegisteredScenePush',{},util));
    }
    popScene(args,util) {
      const old=this._sceneBundle();this._sceneBundles.add(old);this._sceneVisible(old,false);
      const restored=this._sceneStack.pop() || this._freshScene(old.state);this._sceneBundles.delete(restored);this._activateScene(restored);
      return this._runTerrainGenerator(this._registeredCallbackSteps(this._scenePopHandlers.slice(),'arcade_whenRegisteredScenePop',{},util));
    }
    _handlerRegistration(args,util) {return this._terrainRegistration(args,util);}
    registerUpdateHandler(args,util) {this._updateHandlers.push(this._handlerRegistration(args,util));}
    registerIntervalHandler(args,util) {
      const interval=Number(args.INTERVAL);if(interval<0)return;
      this._intervalHandlers.push({...this._handlerRegistration(args,util),interval,timer:0});
    }
    registerButtonHandler(args,util) {
      const button=String(args.BUTTON).toLowerCase(),event=Number(args.EVENT);
      const registration={...this._handlerRegistration(args,util),button,event,player:1};
      const index=this._buttonHandlers.findIndex(h=>h.player===1 && h.button===button && h.event===event);
      if(index<0)this._buttonHandlers.push(registration);else this._buttonHandlers[index]=registration;
    }
    _multiplayerButton(value) {const raw=Scratch.BWValues.decode(value);return raw===null || raw===undefined?undefined:['a','b','up','right','down','left'][Number(raw)];}
    registerMultiplayerButtonHandler(args,util) {
      const button=this._multiplayerButton(args.BUTTON),event=Number(args.EVENT);if(!button)throw new TypeError('Invalid multiplayer button');
      const state=this._state(),entries=state.mpButtonHandlers || (state.mpButtonHandlers=[]);
      let entry=entries.find(h=>h.button===button && h.event===event);
      const registration=this._handlerRegistration(args,util);
      if(entry){entry.registration=registration;return;}
      entry={button,event,registration};entries.push(entry);
      for(const player of this._players()){
        const wrapper={button,event,player:player.index+1,mp:entry,playerValue:this._playerRef(player)};
        const index=this._buttonHandlers.findIndex(h=>h.player===wrapper.player && h.button===button && h.event===event);
        if(index<0)this._buttonHandlers.push(wrapper);else this._buttonHandlers[index]=wrapper;
      }
    }
    eventPlayer(args,util) {return util?.thread?.bwArcadeEvent?.player || Scratch.BWValues.encode(undefined);}
    _heldButton(number,button) {
      const state=this._state(),buttons=number===1?state.buttons:state.controllerButtons[number] || {};
      const key={left:'left arrow',up:'up arrow',right:'right arrow',down:'down arrow',a:'space',b:'z',start:'enter',select:'m'}[button];
      return Boolean(buttons[button] || (number===1 && this._runtime?.ioDevices?.keyboard?.getKeyIsDown?.(key)));
    }
    playerButtonPressed(args) {
      const player=this._player(args.PLAYER);if(!player)return false;
      const button=this._multiplayerButton(args.BUTTON);if(!button)throw new TypeError('Invalid multiplayer button');
      return this._heldButton(player.index+1,button);
    }
    *_controllerButtonCallbacks(number,button,event,deferred=false) {
      const handlers=this._buttonHandlers.filter(h=>h.player===number && h.button===button && h.event===event);
      for(const handler of handlers){
        yield* this._registeredCallbackSteps([handler.mp?handler.mp.registration:handler],handler.mp?'arcade_whenRegisteredMultiplayerButton':'arcade_whenRegisteredButton',handler.mp?{player:handler.playerValue}:{},undefined,deferred);
      }
    }
    registerDestroyedHandler(args,util) {this._destroyedHandlers.push(this._handlerRegistration(args,util));}
    registerOverlapHandler(args,util) {this._overlapHandlers.push({...this._handlerRegistration(args,util),otherKind:String(args.OTHER_KIND)});}
    startParallelHandler(args,util) {
      // Queue one independent fiber per call. The caller must not await it;
      // captures retain the enclosing cells, including after that call returns.
      const work=this._runTerrainGenerator(this._registeredCallbackSteps([this._handlerRegistration(args,util)],'arcade_whenParallelHandler',{},undefined,true));
      work?.catch?.(error=>this._runtime?.emit?.('BLOCKS_ERROR',error.message));
    }
    whenParallelHandler(args,util) {return this.whenRegisteredWall(args,util);}
    registerForeverHandler(args,util) {
      this._foreverHandlers.push({...this._handlerRegistration(args,util),lock:false});
      if(this._foreverTimer===undefined){this._foreverTimer=setTimeout(()=>this._pumpForever(),0);this._foreverTimer?.unref?.();}
    }
    _pumpForever() {
      if(this._terrainStopped){this._foreverTimer=undefined;return;}
      for(const h of this._foreverHandlers.slice())if(!h.lock){
        h.lock=true;
        const work=this._runTerrainGenerator(this._registeredCallbackSteps([h],'arcade_whenRegisteredForever',{}));
        if(work?.then)work.finally(()=>{h.lock=false;});else h.lock=false;
      }
      this._foreverTimer=setTimeout(()=>this._pumpForever(),20);this._foreverTimer?.unref?.();
    }
    _infoState() {
      const state=this._state();
      // PXT initHUD installs one scene renderable, which shares sprite IDs
      // even though it is not included in sprites.allOfKind().
      if(!state.infoRenderable)state.infoRenderable={pxtId:state.nextSpriteId++,z:100};
      return state;
    }
    _lifeState(player) {
      const state=this._infoState(),index=(Number(player)||1)-1;if(index<0 || index>3)return null;
      if(index>0)state.multiplayerInfo=true;
      if(!state.players)state.players=[];
      return state.players[index] || (state.players[index]={});
    }
    hasLife(args) {const state=this._lifeState(args.PLAYER);return !!state && state.life!==undefined && state.life!==null;}
    getPlayerScore(args) {const state=this._lifeState(args.PLAYER);if(!state)return 0;if(state.score==null)state.score=0;if((Number(args.PLAYER)||1)===1)this._state().score=state.score;return state.score;}
    hasPlayerScore(args) {const state=this._lifeState(args.PLAYER);return !!state && state.score!==undefined;}
    setPlayerScore(args) {const state=this._lifeState(args.PLAYER);if(state){state.score=Number(args.VALUE)|0;if((Number(args.PLAYER)||1)===1)this._state().score=state.score;this._changed();}}
    changePlayerScore(args) {this.setPlayerScore({PLAYER:args.PLAYER,VALUE:this.getPlayerScore(args)+Number(args.VALUE)});}
    getLife(args) {const state=this._lifeState(args.PLAYER);if(!state)return 0;if(state.life===undefined)state.life=3;return state.life || 0;}
    setLife(args) {const state=this._lifeState(args.PLAYER);if(state){state.life=Number(args.VALUE)|0;this._changed();}}
    changeLife(args) {this.setLife({PLAYER:args.PLAYER,VALUE:this.getLife(args)+Number(args.VALUE)});}
    registerLifeZeroHandler(args,util) {const state=this._lifeState(args.PLAYER);if(state)state.lifeZero=this._handlerRegistration(args,util);}
    whenRegisteredLifeZero(args,util) {return this.whenRegisteredWall(args,util);}
    *_lifeZeroSteps() {
      const owner=this._state();
      for(const state of owner.players || [])if(state && state.life!==undefined && state.life!==null && state.life<=0){
        state.life=null;
        if(state.lifeZero)yield* this._registeredCallbackSteps([state.lifeZero],'arcade_whenRegisteredLifeZero',{});
        else if(!owner.multiplayerInfo)this.gameover();
        if(this._state()!==owner)return;
      }
    }
    registerCountdownHandler(args,util) {this._infoState();this._countdownHandlers=[this._handlerRegistration(args,util)];}
    whenRegisteredForever(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredCountdown(args,util) {return this.whenRegisteredWall(args,util);}
    registerScenePushHandler(args,util) {this._scenePushHandlers.push(this._handlerRegistration(args,util));}
    registerScenePopHandler(args,util) {this._scenePopHandlers.push(this._handlerRegistration(args,util));}
    whenRegisteredUpdate(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredInterval(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredMultiplayerButton(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredButton(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredKindDestroyed(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredOverlap(args,util) {
      const event=util?.thread?.bwArcadeEvent,a=this._spriteValues.get(event?.first),b=this._spriteValues.get(event?.second);
      return this.whenRegisteredWall(args,util) && !!a && !!b && !a._destroyed && !b._destroyed &&
        !((a.flags|b.flags)&(spriteFlags.GhostThroughSprites|spriteFlags.RelativeToCamera));
    }
    whenRegisteredScenePush(args,util) {return this.whenRegisteredWall(args,util);}
    whenRegisteredScenePop(args,util) {return this.whenRegisteredWall(args,util);}
    *_registeredCallbackSteps(registrations,opcode,event,util,deferred=false) {
      const runtime=this._runtime;if(!runtime?.allScriptsByOpcodeDo || !runtime?._pushThread)return;
      // Scene transitions do not cancel callback fibers already running.
      for(const registration of registrations){
        const scripts=[];
        runtime.allScriptsByOpcodeDo(opcode,(script,target)=>{
          const hat=target.blocks.getBlock(script.blockId),token=target.blocks.getBlock(hat.inputs?.TOKEN?.block);
          if(token?.fields?.TEXT?.value===registration.token)scripts.push({script,target});
        });
        for(const {script,target} of scripts){
          if(this._terrainStopped)return;
          const thread=runtime._pushThread(script.blockId,target);thread.bwArcadeEvent={...event,TOKEN:registration.token};thread.bwArcadeCaptures=registration.captures;
          const caller=util?.thread,active=runtime.sequencer.activeThread;
          try{if(!deferred){runtime.sequencer.activeThread=thread;runtime.sequencer.stepThread(thread);}}
          finally{if(util){util.thread=caller;util.sequencer=runtime.sequencer;}runtime.sequencer.activeThread=active;}
          if(thread.status!==thread.constructor.STATUS_DONE && !thread.isKilled && runtime.threads.includes(thread))
            yield new Promise(resolve=>this._terrainWaits.add({thread,resolve}));
          if(this._terrainStopped)return;
        }
      }
    }
    _keyboardButtonEdge(key,isDown) {
      const button={'space':'a','Z':'b','enter':'start','M':'select','left arrow':'left','up arrow':'up','right arrow':'right','down arrow':'down'}[String(key)];
      if(!button)return;
      this._controllerButtonEdge(1,button,isDown);
    }
    _controllerButtonEdge(number,button,isDown) {
      if(!Number.isInteger(number) || number<1 || number>4)return;
      const key=number+':'+button,current=this._buttonStates[key] || (this._buttonStates[key]={held:false,elapsed:0,count:0});
      const held=!!isDown;if(current.held===held)return;
      current.held=held;current.elapsed=0;current.count=0;
      if(this._dialogs?.[0]?.type==='ask'){if(number===1)this._questionButtonEdge(button,held);return;}
      if(this._terrainStopped)return;
      const pending=this._runTerrainGenerator(this._controllerButtonCallbacks(number,button,held?2049:2048,true));
      pending?.catch?.(error=>this._runtime?.emit?.('BLOCKS_ERROR',error.message));
    }
    *_sceneButtons(dt) {
      const state=this._state();
      for(let number=1;number<=4;number++)for(const button of ['left','up','right','down','a','b','start','select']){
        const held=this._heldButton(number,button),key=number+':'+button;
        const current=this._buttonStates[key] || (this._buttonStates[key]={held:false,elapsed:0,count:0});
        let event;
        if(held!==current.held){current.held=held;current.elapsed=0;current.count=0;event=held?2049:2048;}
        else if(held){current.elapsed+=(dt*1000)|0;if(current.elapsed>=500){const count=Math.floor((current.elapsed-530)/30);if(count!==current.count){current.count=count;event=2054;}}}
        if(event!==undefined)yield* this._controllerButtonCallbacks(number,button,event);
        if(this._state()!==state)return;
      }
    }
    *_sceneUpdates() {
      const state=this._state();
      for(const h of this._intervalHandlers.slice())if(h.timer<=(state.elapsedMs || 0)){
        h.timer=(state.elapsedMs || 0)+h.interval;yield* this._registeredCallbackSteps([h],'arcade_whenRegisteredInterval',{});if(this._state()!==state)return;
      }
      yield* this._registeredCallbackSteps(this._updateHandlers.slice(),'arcade_whenRegisteredUpdate',{});
    }
    _changed() {
      if (this._runtime && this._runtime.emit) this._runtime.emit('ARCADE_DEVICE_CHANGED', this._state());
      if (this._runtime && this._runtime.requestRedraw) this._runtime.requestRedraw();
    }

    _bounds() {
      const device = String((this._runtime && (this._runtime.bwDeviceId || (this._runtime.stc && this._runtime.stc.device))) || 'arcade');
      return device === 'microbit' ? {x: 4, y: 4} : {x: 159, y: 119};
    }

    _sprite(name) {return this._state().sprites[String(name)] || null;}
    _clamp(value, max) { return Math.max(0, Math.min(max, Number(value) || 0)); }

    whenButton(args) { return this.buttonPressed(args); }
    buttonPressed(args) { return Boolean(this._state().buttons[String(args.BUTTON).toLowerCase()]); }
    controllerStep(args) {
      const buttons = this._state().buttons;
      const keyboard = this._runtime?.ioDevices?.keyboard;
      const held = name => Boolean(buttons[name] || keyboard?.getKeyIsDown?.(name + ' arrow'));
      const axis = String(args.AXIS).toLowerCase();
      const negative = axis === 'y' ? 'up' : 'left';
      const positive = axis === 'y' ? 'down' : 'right';
      return (Number(held(positive)) - Number(held(negative))) * (Number(args.STEP) || 0) / 30;
    }
    truncateNumber(args) {return Math.trunc(Number(Scratch.BWValues.decode(args.NUM)));}
    signNumber(args) {
      const value=Number(Scratch.BWValues.decode(args.NUM));
      // PXT Math.sign deliberately returns +0 for -0 and -1 for NaN.
      return value===0 ? 0 : value>0 ? 1 : -1;
    }
    controlSprite(args) {this._controlSprite(1,args.ID,args.VX,args.VY);}
    _controllerNumber(value) {
      const number=Number(value);
      if(!Number.isInteger(number) || number<1 || number>4)throw new Error('Arcade controller must be 1, 2, 3 or 4');
      return number;
    }
    controlSpriteByController(args) {this._controlSprite(this._controllerNumber(args.CONTROLLER),args.ID,args.VX,args.VY);}
    stopControllingSprite(args) {this._stopControllingSprite(this._controllerNumber(args.CONTROLLER),args.ID);}
    _controlSprite(number,id,vx=100,vy=100) {
      const sprite=this._sprite(id);if(!sprite)return;
      const state=this._state();
      const controllers=state.controlledSprites || (state.controlledSprites={});
      const bindings=controllers[number] || (controllers[number]=[]);
      let control=bindings.find(binding=>binding.sprite===sprite);
      if(!control){control={inputLastFrame:false};Object.defineProperty(control,'sprite',{value:sprite});bindings.push(control);}
      vx=Scratch.BWValues.decode(vx);vy=Scratch.BWValues.decode(vy);
      vx=vx===undefined?100:Number(vx)||0;vy=vy===undefined?100:Number(vy)||0;
      if(control.vx && !vx)sprite.vx=0;
      if(control.vy && !vy)sprite.vy=0;
      control.vx=vx;control.vy=vy;
      // Retain the legacy controller-one inspection surface.
      if(number===1)sprite.controller=control;
    }
    _stopControllingSprite(number,id) {
      const sprite=this._sprite(id),controllers=this._state().controlledSprites;
      if(!sprite || !controllers?.[number])return;
      controllers[number]=controllers[number].filter(binding=>binding.sprite!==sprite);
      if(number===1)delete sprite.controller;
      // PXT detaches the binding without changing the sprite's velocity.
    }
    followSprite(args) {
      const self=this._spriteValues.get(String(Scratch.BWValues.decode(args.ID)));
      const targetValue=Scratch.BWValues.decode(args.TARGET);
      const target=targetValue==null || targetValue===''?null:this._spriteValues.get(String(targetValue));
      if(!self || !target && targetValue!=null && targetValue!==''){
        this._runtime?.emit?.('BLOCKS_ERROR','Arcade following requires sprite references from this project.');return;
      }
      if(self===target)return;
      const state=this._state();
      if(!state.followingSprites){state.followingSprites=[];state.followLastTime=this._globalElapsedMs;}
      const speed=Scratch.BWValues.decode(args.SPEED),turn=Scratch.BWValues.decode(args.TURN);
      const rate=Number(speed===undefined?100:speed),turnRate=Number(turn===undefined?400:turn);
      const binding=state.followingSprites.find(entry=>entry.self===self);
      if(!target || !rate){
        if(binding){state.followingSprites=state.followingSprites.filter(entry=>entry!==binding);self.vx=0;self.vy=0;}
      }else if(binding){binding.target=target;binding.rate=rate;binding.turnRate=turnRate;}
      else {
        const entry={rate,turnRate};
        Object.defineProperties(entry,{self:{value:self},target:{value:target,writable:true}});
        state.followingSprites.push(entry);
      }
      this._changed();
    }
    unfollowSprite(args) {this.followSprite({ID:args.ID,TARGET:Scratch.BWValues.encode(null),SPEED:0,TURN:400});}
    _moveFollowingSprites() {return this._runTerrainGenerator(this._moveFollowingSpriteSteps());}
    *_moveFollowingSpriteSteps() {
      const state=this._state(),epoch=this._terrainEpoch,now=this._globalElapsedMs;
      if(!state.followingSprites)return;
      const dt=(now-state.followLastTime)/1000;
      for(const {self,target,rate,turnRate} of state.followingSprites){
        if(self._destroyed || target._destroyed){self.vx=0;self.vy=0;continue;}
        const dx=target.x-self.x,dy=target.y-self.y;
        if(Math.abs(dx)<2 && Math.abs(dy)<2){
          // Sprite.x/y setters in PXT use physics.moveSprite, in this order.
          const x=((target.x-self.width/2)*256)|0;
          yield* this._moveSpriteExplicitSteps(self,(x-self._fx)|0,0);
          if(epoch!==this._terrainEpoch || this._state()!==state)return;
          const y=((target.y-self.height/2)*256)|0;
          yield* this._moveSpriteExplicitSteps(self,0,(y-self._fy)|0);
          if(epoch!==this._terrainEpoch || this._state()!==state)return;
          self.vx=0;self.vy=0;continue;
        }
        const limit=dt*turnRate*(rate/50),angle=Math.atan2(dy,dx);
        // PXT sprite.ts: independently clamp each velocity delta; retain the
        // fixed-point setters and controller-before-follow-before-physics order.
        self.vx+=Math.min(limit,Math.max(-limit,Math.cos(angle)*rate-self.vx));
        self.vy+=Math.min(limit,Math.max(-limit,Math.sin(angle)*rate-self.vy));
      }
      state.followLastTime=now;
      state.followingSprites=state.followingSprites.filter(({self,target})=>!self._destroyed && !target._destroyed);
    }
    _moveControlledSprites(live) {
      const state=this._state(),keyboard=this._runtime?.ioDevices?.keyboard;
      const liveSet=new Set(live);
      for(const number of Object.keys(state.controlledSprites || {}).map(Number).sort((a,b)=>a-b)){
        const buttons=number===1?state.buttons:(state.controllerButtons?.[number] || {});
        const held=name=>Boolean(buttons[name] || (number===1 && keyboard?.getKeyIsDown?.(name+' arrow')));
        const x=(Number(held('right'))-Number(held('left')))*256;
        const y=(Number(held('down'))-Number(held('up')))*256;
        const square=x*x+y*y,scale=square>65536?Math.sqrt(65536/square):1;
        const normalizedX=Math.trunc(x*scale),normalizedY=Math.trunc(y*scale);
        state.controlledSprites[number]=state.controlledSprites[number].filter(control=>liveSet.has(control.sprite));
        for(const control of state.controlledSprites[number]){
          const sprite=control.sprite;
          if(control.inputLastFrame){if(control.vx)sprite.vx=0;if(control.vy)sprite.vy=0;}
          if(x || y){
            const both=control.vx && control.vy;
            if(control.vx)sprite.vx=Math.trunc((both?normalizedX:x)*control.vx)/256;
            if(control.vy)sprite.vy=Math.trunc((both?normalizedY:y)*control.vy)/256;
            control.inputLastFrame=true;
          }else control.inputLastFrame=false;
        }
      }
    }
    functionArgument(args) {
      let rest;try {rest = JSON.parse(String(args.REST));} catch {rest = [];}
      return JSON.stringify([args.VALUE, ...(Array.isArray(rest) ? rest : [])], Scratch.BWValues.jsonReplacer);
    }
    _pumpFunctionCalls() {
      for (const call of this._functionCalls) {
        if (call.caller && (call.caller.status === call.caller.constructor.STATUS_DONE || call.caller.isKilled || !this._runtime.threads.includes(call.caller))) {
          this._functionCalls.delete(call);this._runtime.sequencer.retireThread(call.thread);call.resolve(0);continue;
        }
        if (call.thread.stack.length === 1 || call.thread.status === call.thread.constructor.STATUS_DONE || call.thread.isKilled ||
            !this._runtime.threads.includes(call.thread)) {
          this._functionCalls.delete(call);this._runtime.sequencer.retireThread(call.thread);call.resolve(Scratch.BWValues.encode(call.thread.bwReturnValue));
        }
      }
    }
    callFunction(args, util) {
      const runtime = this._runtime, target = util?.target || util?.thread?.target;
      const name = String(args.NAME), definition = target?.blocks?.getProcedureDefinition(name);
      if (!definition || !runtime?._pushThread) return 0;
      let values;try {values = JSON.parse(String(args.ARGS), (_key,value)=>
        Scratch.BWValues.encode(Scratch.BWValues.decode(value)));} catch {return 0;}
      if (!Array.isArray(values)) return 0;
      const [names, , defaults] = target.blocks.getProcedureParamNamesIdsAndDefaults(name);
      const thread = runtime._pushThread(definition, target);
      // A sentinel caller frame retains arguments/locals while the native
      // sequencer replaces body frames. Each invocation owns its own cells.
      thread.stackFrames[0].waitingReporter = name;
      thread.stackFrames[0].params = Object.fromEntries(names.map((n,i)=>[n,i < values.length ? values[i] : defaults[i]]));
      thread.pushStack(definition);
      thread.bwArcadeEvent = util.thread?.bwArcadeEvent;
      thread.bwArcadeCaptures = util.thread?.bwArcadeCaptures;
      thread.bwFunctionNames = new Set(util.thread?.bwFunctionNames || []);
      const recursive = thread.bwFunctionNames.has(name) || util.thread?.stack.some(id=>target.blocks.getBlock(id)?.mutation?.proccode===name);
      thread.bwFunctionNames.add(name);
      if (util.sequencer === runtime.sequencer && !recursive) {
        const caller = util.thread, sequencer = util.sequencer, active = sequencer.activeThread;
        try {sequencer.activeThread = thread;sequencer.stepThread(thread);}
        finally {util.thread = caller;util.sequencer = sequencer;sequencer.activeThread = active;}
        if (!runtime.threads.includes(caller)) {sequencer.retireThread(caller);sequencer.retireThread(thread);return 0;}
      }
      if (thread.stack.length === 1 || thread.status === thread.constructor.STATUS_DONE || thread.isKilled || !runtime.threads.includes(thread)) {runtime.sequencer.retireThread(thread);return Scratch.BWValues.encode(thread.bwReturnValue);}
      return new Promise(resolve=>this._functionCalls.add({thread,resolve,caller:util.thread}));
    }
    returnValue(args, util) {
      const thread = util?.thread;if (!thread) return;
      let frame = thread.stackFrames.length - 1;
      while (frame >= 0 && thread.stackFrames[frame].params == null) frame--;
      if (frame < 0 || (frame === 0 && thread.stackFrames[0].waitingReporter)) {thread.bwReturnValue = args.VALUE;util.sequencer.retireThread(thread);return;}
      // A command procedure discards its value but an early return must leave
      // only this invocation, including any nested loop/control frames.
      while (thread.stack.length > frame + 1) thread.popStack();
      thread.goToNextBlock();
    }
    _localParams(util) {
      const frames = util?.thread?.stackFrames || [];
      for (let i = frames.length - 1; i >= 0; i--) {
        if (frames[i].params != null) return frames[i].params;
      }
      // Ordinary hat scripts have no procedure frame. Scratch replaces their
      // block frames between commands, so keep these locals on the thread
      // that owns the callback rather than on a transient block frame.
      const thread = util?.thread;
      if (!thread) return null;
      if (!thread._bwArcadeLocals) thread._bwArcadeLocals = {};
      return thread._bwArcadeLocals;
    }
    setLocal(args, util) {
      const params = this._localParams(util);
      if (params) params[String(args.NAME)] = args.VALUE;
    }
    getLocal(args, util) {
      const params = this._localParams(util);
      const name = String(args.NAME);
      return params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : 0;
    }
    registerSpriteCreated(args, util) {
      const captures = new Map(util?.thread?.bwArcadeCaptures || []);
      const values = this._localParams(util);
      for (const key of String(args.CAPTURES || '').split(/\\s+/).filter(Boolean)) if (values) captures.set(key, {values, key});
      this._createdHandlers.push({kind: String(args.KIND), token: String(args.TOKEN), captures});
    }
    _terrainRegistration(args, util) {
      const captures = new Map(util?.thread?.bwArcadeCaptures || []), values = this._localParams(util);
      for (const key of String(args.CAPTURES || '').split(/\\s+/).filter(Boolean)) if (values) captures.set(key, {values, key});
      return {kind: String(args.KIND), token: String(args.TOKEN), captures};
    }
    registerLegacyWallHandler(args,util) {
      const index=Number(Scratch.BWValues.decode(args.INDEX));
      if(index<0 || index>15)return;
      this._legacyWallHandlers.push({...this._terrainRegistration(args,util),index});
    }
    whenRegisteredLegacyWall(args,util) {return util?.thread?.bwArcadeEvent?.TOKEN===String(args.TOKEN);}
    tileHitFrom(args) {
      const sprite=this._spriteValues.get(String(args.ID));
      return sprite?(sprite._wallObstacles?.[Number(Scratch.BWValues.decode(args.DIRECTION))]?.tileIndex ?? -1):0;
    }
    registerWallHandler(args, util) {this._wallHandlers.push(this._terrainRegistration(args, util));}
    registerTileHandler(args, util) {
      const image = this._image(args.IMAGE);
      if (image) this._tileHandlers.push({...this._terrainRegistration(args, util), image});
    }
    whenRegisteredWall(args, util) {return util?.thread?.bwArcadeEvent?.TOKEN === String(args.TOKEN);}
    whenRegisteredTile(args, util) {return util?.thread?.bwArcadeEvent?.TOKEN === String(args.TOKEN);}
    eventLocation(args, util) {return util?.thread?.bwArcadeEvent?.location || Scratch.BWValues.encode(undefined);}
    _pumpTerrainWaits() {
      for (const pending of this._terrainWaits) {
        if (pending.thread.status === pending.thread.constructor.STATUS_DONE || pending.thread.isKilled ||
          !this._runtime.threads.includes(pending.thread)) {
          this._terrainWaits.delete(pending);pending.resolve();
        }
      }
    }
    _runTerrainGenerator(generator) {
      const epoch = this._terrainEpoch;
      const resume = () => {
        if (epoch !== this._terrainEpoch) return;
        const step = generator.next();
        if (!step.done) return Promise.resolve(step.value).then(resume);
        return step.value;
      };
      return resume();
    }
    *_terrainCallbackSteps(registrations, opcode, sprite, column, row, util) {
      const runtime = this._runtime, epoch=this._terrainEpoch;if (!runtime?.allScriptsByOpcodeDo || !runtime?._pushThread) return;
      const id = 'arcade-tile:' + (++this._nextTileLocationId);
      this._tileLocations.set(id, {column, row});
      const location = Scratch.BWValues.reference(runtime, 'tile', id);
      // Filter registrations once per obstacle/location, just like PXT's
      // filter(...).forEach(...). Later handlers retain their captured cells.
      for (const registration of registrations) {
        const scripts = [];
        runtime.allScriptsByOpcodeDo(opcode, (script, target) => {
          const hat = target.blocks.getBlock(script.blockId), token = target.blocks.getBlock(hat.inputs?.TOKEN?.block);
          if (token?.fields?.TEXT?.value === registration.token) scripts.push({script, target});
        });
        for (const {script, target} of scripts) {
          const thread = runtime._pushThread(script.blockId, target);
          thread.bwArcadeEvent = {TOKEN:registration.token, first:sprite.id, location};
          thread.bwArcadeCaptures = registration.captures;
          const caller = util?.thread, active = runtime.sequencer.activeThread;
          try {runtime.sequencer.activeThread = thread;runtime.sequencer.stepThread(thread);}
          finally {if (util) {util.thread = caller;util.sequencer = runtime.sequencer;}runtime.sequencer.activeThread = active;}
          if(epoch!==this._terrainEpoch)return;
          if (thread.status !== thread.constructor.STATUS_DONE && !thread.isKilled && runtime.threads.includes(thread))
            yield new Promise(resolve => this._terrainWaits.add({thread, resolve}));
          if(epoch!==this._terrainEpoch)return;
        }
      }
    }
    *_tileOverlapSteps(sprite, map, box, util) {
      const epoch=this._terrainEpoch,owner=this._state();
      if (sprite._destroyed || sprite.flags & (spriteFlags.GhostThroughTiles | spriteFlags.RelativeToCamera) || !this._sprite(sprite.id)) return;
      const size = map.tileSize*256, left = sprite._fx+box.left*256, right = left+(box.width-1)*256;
      const top = sprite._fy+box.top*256, bottom = top+(box.height-1)*256, locations = [], seen = new Set();
      for (let x=left;x<right+size;x+=size) for (let y=top;y<bottom+size;y+=size) {
        const column=Math.floor((Math.min(x,right)+128)/size),row=Math.floor((Math.min(y,bottom)+128)/size),key=column+':'+row;
        if(seen.has(key)) continue;seen.add(key);
        if(!this._wallAt(map,column,row) || sprite.flags & spriteFlags.GhostThroughWalls) locations.push({column,row});
      }
      for (const {column,row} of locations) {
        const current=this._state().tilemap;
        if(!current) continue;
        const index = column<0 || row<0 || column>=current.columns || row>=current.rows ? 0 : current.indices[row*current.columns+column];
        const image=current.images[index];
        const matches=this._tileHandlers.filter(h => h.kind===sprite.kind && image && h.image.width===image.width && h.image.height===image.height &&
          h.image.pixels.every((value,i)=>value===image.pixels[i]));
        yield* this._terrainCallbackSteps(matches,'arcade_whenRegisteredTile',sprite,column,row,util);
        if(epoch!==this._terrainEpoch || this._state()!==owner)return;
      }
    }
    getCaptured(args, util) {
      const cell = util?.thread?.bwArcadeCaptures?.get(String(args.NAME));
      return cell ? cell.values[cell.key] : 0;
    }
    setCaptured(args, util) {
      const cell = util?.thread?.bwArcadeCaptures?.get(String(args.NAME));
      if (cell) cell.values[cell.key] = args.VALUE;
    }
    _askForString(args, util) {
      const ask = this._runtime && this._runtime.getOpcodeFunction &&
        this._runtime.getOpcodeFunction('sensing_askandwait');
      const answer = this._runtime && this._runtime.getOpcodeFunction &&
        this._runtime.getOpcodeFunction('sensing_answer');
      if (!ask || !answer || !util || !util.target) return '';
      return Promise.resolve(ask({QUESTION: String(args.QUESTION)}, util)).then(() => String(answer()));
    }
    askForString(args, util) { return this._askForString(args, util); }
    askForNumber(args, util) {
      return Promise.resolve(this._askForString(args, util)).then(reply => {
        const value = Number(reply);
        return Number.isFinite(value) ? value : 0;
      });
    }
    // PXT game.ask waits 500 ms, then requires release before A/B confirmation.
    // Behaviour reference: microsoft/pxt-common-packages libs/game/ask.ts (MIT).
    ask(args) {
      return this._queueDialog({type:'ask',title:String(Scratch.BWValues.decode(args.TITLE)),
        subtitle:String(Scratch.BWValues.decode(args.SUBTITLE)),elapsed:0,
        held:{a:this._heldButton(1,'a'),b:this._heldButton(1,'b')},armed:{a:false,b:false}});
    }
    _questionButtonEdge(button,held) {
      const dialog=this._dialogs?.[0];
      if(dialog?.type!=='ask' || !['a','b'].includes(button))return;
      dialog.held[button]=!!held;
      if(dialog.elapsed>=500 && !held)dialog.armed[button]=true;
    }
    _pumpQuestion(milliseconds) {
      const dialog=this._dialogs?.[0];if(dialog?.type!=='ask')return;
      const wasReady=dialog.elapsed>=500;
      dialog.elapsed+=milliseconds;if(dialog.elapsed<500)return;
      if(!wasReady)this._showNextDialog();
      for(const button of ['a','b'])if(!dialog.held[button])dialog.armed[button]=true;
      if(dialog.armed.a && dialog.held.a)dialog.dismiss(true);
      else if(dialog.armed.b && dialog.held.b)dialog.dismiss(false);
    }
    splash(args) {
      return this._queueDialog({type: 'splash', title: String(args.TITLE), subtitle: String(args.SUBTITLE)});
    }
    showLongText(args) {
      const layout = String(args.LAYOUT);
      return this._queueDialog({type: 'longText', title: String(args.TEXT), subtitle: '',
        layout: ['Left', 'Right', 'Top', 'Bottom', 'Center', 'Full'].includes(layout) ? layout : 'Center'});
    }
    _queueDialog(fields) {
      return new Promise(resolve => {
        if (!this._dialogs) this._dialogs = [];
        const dialog = {...fields, resolve};
        dialog.dismiss = answer => {
          if(dialog.type==='ask' && (typeof answer!=='boolean' || dialog.elapsed<500))return;
          if (this._dialogs[0] !== dialog) return;
          this._dialogs.shift();
          resolve(dialog.type==='ask' ? answer : undefined);
          this._showNextDialog();
        };
        this._dialogs.push(dialog);
        if (this._dialogs.length === 1) this._showNextDialog();
      });
    }
    _showNextDialog() {
      if (this._runtime) {
        const dialog=this._dialogs?.[0];
        if(dialog?.type==='ask' && !dialog.started){
          dialog.started=true;
          for(const button of ['a','b'])dialog.held[button]=this._heldButton(1,button);
        }
        this._runtime.bwArcadeDialogOpen = Boolean(dialog);
        this._runtime.bwArcadeDialogType = this._dialogs?.[0]?.type || null;
        // UI containers compare dialog identity. Publish a snapshot when the
        // guard changes; dismissal still closes over the authoritative queue.
        this._runtime.emit('ARCADE_DIALOG', dialog ? {...dialog} : null);
      }
    }
    lightLevel() { return Number(this._state().light) || 0; }
    tilt(args) { return Number(this._state()[String(args.AXIS).toLowerCase() === 'y' ? 'tiltY' : 'tiltX']) || 0; }
    setPixel(args) {
      const state = this._state();
      const index = Math.max(0, Math.min(state.neopixels.length - 1, Math.floor(Number(args.INDEX) || 0)));
      let color = args.COLOR;
      if (typeof color === 'number') color = '#' + (color >>> 0).toString(16).padStart(6, '0').slice(-6);
      state.neopixels[index] = /^#[0-9a-f]{6}$/i.test(String(color)) ? String(color) : '#000000';
      this._changed();
    }
    clearPixels() { this._state().neopixels.fill('#111827'); this._changed(); }
    createsprite(args) {
      const bounds = this._bounds();
      this._state().sprites[String(args.NAME)] = {x: this._clamp(args.X, bounds.x), y: this._clamp(args.Y, bounds.y), brightness: 9};
      this._changed();
    }
    deletesprite(args) { delete this._state().sprites[String(args.NAME)]; this._changed(); }
    movesprite(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      const bounds = this._bounds();
      sprite.x = this._clamp(sprite.x + Number(args.DX || 0), bounds.x);
      sprite.y = this._clamp(sprite.y + Number(args.DY || 0), bounds.y);
      this._changed();
    }
    setspritepos(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      const bounds = this._bounds();
      sprite.x = this._clamp(args.X, bounds.x); sprite.y = this._clamp(args.Y, bounds.y); this._changed();
    }
    spritex(args) { const sprite = this._sprite(args.NAME); return sprite ? sprite.x : 0; }
    spritey(args) { const sprite = this._sprite(args.NAME); return sprite ? sprite.y : 0; }
    touching(args) {
      const a = this._sprite(args.A); const b = this._sprite(args.B);
      return Boolean(a && b && a.x === b.x && a.y === b.y);
    }
    touchingedge(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return false;
      const bounds = this._bounds(); return sprite.x <= 0 || sprite.x >= bounds.x || sprite.y <= 0 || sprite.y >= bounds.y;
    }
    setscore(args) {this.setPlayerScore({PLAYER:1,VALUE:args.N});}
    changescore(args) {this.changePlayerScore({PLAYER:1,VALUE:args.N});}
    getscore() {return this.getPlayerScore({PLAYER:1});}
    showscore() { this._state().scoreVisible = true; this._changed(); }
    log(args) {
      const state = this._state();
      state.serial = ((state.serial || '') + String(args.TEXT ?? '') + '\\n').slice(-8000);
      this._changed();
    }
    drawsprites() { this._state().screenCleared = false; this._changed(); }
    clearscreen() { this._state().screenCleared = true; this._changed(); }
    setbrightness(args) {
      const sprite = this._sprite(args.NAME); if (!sprite) return;
      sprite.brightness = this._clamp(args.B, 9); this._changed();
    }
    _camera() {
      const state = this._state();
      if (!state.camera) state.camera = {offsetX:0, offsetY:0, drawOffsetX:0, drawOffsetY:0, followId:null};
      return state.camera;
    }
    _cameraOffset(axis, value) {
      const map = this._state().tilemap, size = axis==='x' ? 160 : 120;
      if (map) value = Math.max(0,Math.min(Math.max(0,(axis==='x'?map.columns:map.rows)*map.tileSize-size),value));
      return Math.floor(value);
    }
    centerCameraAt(args) {
      const camera=this._camera();camera.followId=null;
      camera.offsetX=this._cameraOffset('x',Number(Scratch.BWValues.decode(args.X))-80);
      camera.offsetY=this._cameraOffset('y',Number(Scratch.BWValues.decode(args.Y))-60);
      this._changed();
    }
    cameraShake(args) {
      const camera=this._camera();
      const strength=Scratch.BWValues.decode(args.AMPLITUDE),length=Scratch.BWValues.decode(args.DURATION);
      const amplitude=Number(strength===undefined?4:strength);
      const duration=Number(length===undefined?500:length);
      if(amplitude<=0 || duration<=0)camera.shakeStartTime=undefined;
      else {
        camera.shakeStartTime=this._globalElapsedMs;
        camera.shakeAmplitude=amplitude;camera.shakeDuration=duration;
      }
    }
    cameraFollowSprite(args) {
      const value=Scratch.BWValues.decode(args.ID),camera=this._camera();
      if(value==null || value==='')camera.followId=null;
      else if(this._spriteValues.has(String(value)))camera.followId=String(value);
      else {this._runtime?.emit?.('BLOCKS_ERROR','Arcade camera follow requires a sprite from this project.');return;}
      this._updateCamera();this._changed();
    }
    _cameraIsUpdated() {
      const camera=this._camera(),sprite=this._spriteValues.get(camera.followId);
      return !sprite || sprite.x===camera.lastX && sprite.y===camera.lastY;
    }
    _updateCamera() {
      const camera=this._camera(),sprite=this._spriteValues.get(camera.followId);
      if(sprite){
        camera.lastX=sprite.x;camera.lastY=sprite.y;
        camera.offsetX=this._cameraOffset('x',sprite._fx/256+(sprite.width>>1)-80);
        // The pinned PXT camera uses width here as well, even on non-square art.
        camera.offsetY=this._cameraOffset('y',sprite._fy/256+(sprite.width>>1)-60);
      }
      let x=camera.offsetX,y=camera.offsetY;
      // PXT camera.ts: replace an active shake, damp its final quarter, and
      // apply integer jitter to draw offsets only (not logical camera bounds).
      if(camera.shakeStartTime!==undefined){
        const elapsed=this._globalElapsedMs-camera.shakeStartTime;
        if(elapsed>=camera.shakeDuration)camera.shakeStartTime=undefined;
        else {
          const progress=elapsed/camera.shakeDuration;
          const amplitude=camera.shakeAmplitude*(progress>=.75?Math.max(0,1-progress):1);
          x+=(Math.random()*amplitude)>>0;y+=(Math.random()*amplitude)>>0;
        }
      }
      const changed=camera.drawOffsetX!==x || camera.drawOffsetY!==y;
      camera.drawOffsetX=x;camera.drawOffsetY=y;
      if(changed){
        this._renderTilemap();
        for(const id of Object.keys(this._state().sprites))this._positionSprite(id);
        this._changed();
      }
    }
    cameraProperty(args) {
      if(!this._cameraIsUpdated())this._updateCamera();
      const camera=this._camera();
      const values=[camera.offsetX+80,camera.offsetY+60,camera.offsetX,camera.offsetX+160,camera.offsetY,camera.offsetY+120];
      return Scratch.BWValues.encode(values[Number(Scratch.BWValues.decode(args.PROPERTY))]);
    }
    _spriteViewPosition(sprite) {
      const camera=this._camera(),relative=!!(sprite.flags & spriteFlags.RelativeToCamera);
      return {x:Math.floor(sprite._fx/256-(relative?0:camera.drawOffsetX))+sprite.width/2,
        y:Math.floor(sprite._fy/256-(relative?0:camera.drawOffsetY))+sprite.height/2};
    }
    _positionSprite(id) {
      const s = this._sprite(id);
      const target = this._state().spriteTargets[id];
      if (s && ((target && target.setXY) || this._imageSkins.get(id)?.drawableId!==undefined)) {
        let crop;
        if(s.image && this._runtime?.renderer){
          crop=this._spriteRasterWindow(s);
          if(this._imageSkins.get(id)?.windowKey!==crop.key)this._renderSpriteImage(id,crop);
        }
        const view=this._spriteViewPosition(s);
        // Position the visible raster itself. Huge scales can put the original
        // center millions of pixels away; subtracting that again in the GPU
        // loses pixel precision even though the viewport is only 160x120.
        if(crop){view.x+=crop.x+crop.width/2-s.width/2;view.y+=crop.y+crop.height/2-s.height/2;}
        if(target?.setXY)target.setXY((view.x-80)*3,(60-view.y)*3);
        else this._runtime.renderer.updateDrawablePosition(this._imageSkins.get(id).drawableId,[(view.x-80)*3,(60-view.y)*3]);
      }
    }
    _speechOwner(id, target) {
      const sprite = this._sprite(id);
      if (sprite) return sprite;
      if (!target || this._runtime?.targets && !this._runtime.targets.includes(target)) return null;
      const costume = target.getCostumes?.()[target.currentCostume];
      const size = this._costumeImageSize(costume) || {width: 16, height: 16};
      return {x: (target.x || 0) / 3 + 80, y: 60 - (target.y || 0) / 3,
        width: size.width, height: size.height, mask: this._costumePixelMask(costume, size)};
    }
    spriteSay(args, util) {
      const state = this._state();
      const self = String(args.ID) === 'self';
      const id = self ? 'target:' + util?.target?.id : String(args.ID);
      const target = self ? util?.target : state.spriteTargets[id];
      const owner = this._speechOwner(id, target);
      if (!owner) return;
      const text = args.TEXT == null ? '' : String(args.TEXT);
      const duration = Number(args.DURATION);
      const legacy = String(args.MODE) === 'legacy';
      const foreground = (Number(args.FOREGROUND) || 0) & 15;
      const background = (Number(args.BACKGROUND) || 0) & 15;
      const previous = this._speech.get(id);
      // PXT's legacy persistent say avoids restarting its horizontal scroll
      // when an overlap callback repeats the same message every frame.
      if (text && legacy && previous?.legacy && previous.text === text &&
        previous.foreground === foreground && previous.background === background &&
        duration < 0 && previous.end === null) return;
      this._clearSpeech(id);
      if (!text) { this._changed(); return; }
      const now = state.elapsedMs || 0;
      const entry = {target, text, legacy, foreground, background, animated: Scratch.Cast.toBoolean(args.ANIMATED),
        end: Number.isFinite(duration) && duration >= 0 ? now + duration : null};
      entry.renderer = speechEngine.create(text, Number.isFinite(duration) ? duration : -1,
        entry.animated, foreground, background, legacy, owner, now);
      this._speech.set(id, entry);
      if (!state.speech) state.speech = {};
      state.speech[id] = {text, duration, animated: entry.animated, foreground, background,
        mode: legacy ? 'legacy' : 'text', end: entry.end};
      this._renderSpeech(id, entry, owner, 0);
      this._changed();
    }
    _paletteColors() { return this._projectPalette || speechPalette; }
    _imagePalette(image) { return this._projectPalette ? [null,...this._projectPalette.slice(1)] : image?.palette; }
    setPalette(args) {
      const hex = String(Scratch.BWValues.decode(args.DATA));
      if (!/^[0-9a-f]{96}$/i.test(hex)) throw new RangeError('Arcade palette requires exactly 16 RGB colors (48 bytes)');
      this._projectPalette = hex.match(/.{6}/g).map(color => '#'+color.toLowerCase());
      this._renderPalette();
    }
    _renderPalette() {
      const state=this._state();
      if(this._background || this._projectPalette)this.setBackgroundColor({COLOR:this.backgroundColor()});
      this._renderBackgroundImage();
      const presentLegacy=!!(state.tilemap?.legacy && state.tilemap.image);
      if(presentLegacy)state.tilemap.needsRender=true;
      this._renderTilemap(presentLegacy);
      for(const sprite of Object.values(state.sprites))this._renderSpriteImageIfPresent(sprite);
      for(const [id,entry] of this._speech){const owner=state.sprites[id];if(owner)this._renderSpeech(id,entry,owner,0);}
      this._changed();
    }
    backgroundColor() { return this._state().backgroundColor || 0; }
    setBackgroundColor(args) {
      const color = Number(args.COLOR) || 0;
      this._state().backgroundColor = color;
      const renderer = this._runtime?.renderer;
      if (renderer) {
        // Extend the solid fill beyond stage edges to avoid filtered SVG edge seams.
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="482" height="362"><rect width="482" height="362" fill="' + this._paletteColors()[(color | 0) & 15] + '"/></svg>';
        if (!this._background) {
          const skin = renderer.createSVGSkin(svg, [241, 181]);
          const drawable = renderer.createDrawable('background');
          renderer.updateDrawableSkinId(drawable, skin);
          renderer.updateDrawablePosition(drawable, [0, 0]);
          this._background = {skin, drawable};
        } else renderer.updateSVGSkin(this._background.skin, svg, [241, 181]);
        // createDrawable appends within the background group: above the Stage,
        // below sprites and transparent background images. Keep that group order
        // so resource disposal can remove the drawable correctly on restart.
      }
      this._orderBackgroundLayers();
      this._changed();
    }
    setBackgroundImage(args) {
      const image = this._image(args.IMAGE);
      if (!image && String(args.IMAGE) !== '') return;
      this._state().backgroundImage = image || null;
      if (!this._background && this._runtime?.renderer) this.setBackgroundColor({COLOR: this.backgroundColor()});
      this._renderBackgroundImage();this._changed();
    }
    backgroundImage() {
      const state = this._state();
      if (!state.backgroundImage) {
        state.backgroundImage = {width:160,height:120,pixels:new Uint8Array(160*120)};
        if (!this._background && this._runtime?.renderer) this.setBackgroundColor({COLOR:this.backgroundColor()});
        this._renderBackgroundImage();
      }
      return this._imageHandle(state.backgroundImage);
    }
    _renderBackgroundImage() {
      const renderer = this._runtime?.renderer;
      if (!renderer) return;
      const image = this._state().backgroundImage;
      if (!image) {
        if (this._backgroundImage) {
          renderer.destroyDrawable(this._backgroundImage.drawable,'background');renderer.destroySkin(this._backgroundImage.skin);
          this._backgroundImage = null;
        }
        this._runtime.requestRedraw?.();return;
      }
      const svg = imageEngine.svg(image.width && image.height ? image : {width:1,height:1,pixels:new Uint8Array(1)},this._imagePalette(image));
      const center = [image.width*2,image.height*2];
      if (!this._backgroundImage) {
        const skin = renderer.createSVGSkin(svg,center), drawable = renderer.createDrawable('background');
        renderer.updateDrawableSkinId(drawable,skin);renderer.updateDrawableScale(drawable,[75,75]);this._backgroundImage = {skin,drawable};
      } else renderer.updateSVGSkin(this._backgroundImage.skin,svg,center);
      renderer.updateDrawablePosition(this._backgroundImage.drawable,[(image.width/2-80)*3,(60-image.height/2)*3]);
      this._orderBackgroundLayers();
      this._runtime.requestRedraw?.();
    }
    _orderBackgroundLayers() {
      const renderer = this._runtime?.renderer;
      if (!renderer?.setDrawableOrder || !renderer?.getDrawableOrder) return;
      const layers = [this._background, this._backgroundImage, this._tilemapDrawable].filter(Boolean);
      const orders = layers.map(layer => renderer.getDrawableOrder(layer.drawable));
      if (!orders.length || orders.some(order => !Number.isInteger(order) || order < 0)) return;
      // RenderWebGL computes the group end before removing the moved drawable.
      // Its Infinity order can consequently insert into the following group.
      // A current member's maximum index stays inside the original group.
      const last = Math.max(...orders);
      for (const layer of layers) renderer.setDrawableOrder(layer.drawable, last, 'background');
    }
    _clearBackground() {
      const renderer = this._runtime?.renderer;
      if (this._backgroundImage) {
        renderer?.destroyDrawable(this._backgroundImage.drawable,'background');renderer?.destroySkin(this._backgroundImage.skin);this._backgroundImage = null;
      }
      if (!this._background) return;
      renderer?.destroyDrawable(this._background.drawable, 'background');
      renderer?.destroySkin(this._background.skin);
      this._background = null;
    }
    _clearSpeech(id) {
      const entry = this._speech.get(id);
      if (!entry) return;
      entry.renderer.destroy();
      const renderer = this._runtime?.renderer;
      if (entry.drawableId !== undefined) renderer?.destroyDrawable(entry.drawableId, 'sprite');
      if (entry.skinId !== undefined) renderer?.destroySkin(entry.skinId);
      this._speech.delete(id);
      if (this._state().speech) delete this._state().speech[id];
    }
    _renderSpeech(id, entry, owner, dt) {
      const camera=this._camera(),relative=!!(owner.flags & spriteFlags.RelativeToCamera);
      const view={...owner,x:owner.x-(relative?0:camera.drawOffsetX),y:owner.y-(relative?0:camera.drawOffsetY)};
      entry.raster=speechEngine.renderRaster(entry.renderer,view,this._state().elapsedMs || 0,dt);
      const pixels=entry.raster.pixels;
      const renderer = this._runtime?.renderer;
      if (!renderer) return;
      const paths = Array.from({length: 16}, () => []);
      for (let y = 0; y < 120; y++) for (let x = 0; x < 160;) {
        const color = pixels[y * 160 + x];
        const start = x++;
        while (x < 160 && pixels[y * 160 + x] === color) x++;
        if (color) paths[color].push('M' + start + ' ' + y + 'h' + (x - start) + 'v1h-' + (x - start) + 'z');
      }
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" shape-rendering="crispEdges">' +
        paths.map((path, color) => path.length ? '<path fill="' + this._paletteColors()[color] + '" d="' + path.join('') + '"/>' : '').join('') + '</svg>';
      if (entry.skinId === undefined) {
        entry.skinId = renderer.createSVGSkin(svg, [80, 60]);
        entry.drawableId = renderer.createDrawable('sprite');
        renderer.updateDrawableSkinId(entry.drawableId, entry.skinId);
        renderer.updateDrawablePosition(entry.drawableId, [0, 0]);
        renderer.updateDrawableScale(entry.drawableId, [300, 300]);
      } else if (entry.svg !== svg) renderer.updateSVGSkin(entry.skinId, svg, [80, 60]);
      entry.svg = svg;
      renderer.updateDrawableVisible(entry.drawableId, entry.target?.visible !== false);
      if (entry.target?.drawableID !== undefined) {
        renderer.setDrawableOrder(entry.drawableId, renderer.getDrawableOrder(entry.target.drawableID) + 1, 'sprite');
      }
    }
    _advanceSpeech(dt) {
      const now = this._state().elapsedMs || 0;
      for (const [id, entry] of this._speech) {
        const owner = this._speechOwner(id, entry.target);
        if (!owner || entry.end !== null && now + 1e-6 >= entry.end) this._clearSpeech(id);
        else this._renderSpeech(id, entry, owner, dt);
      }
    }
    _emitSpriteHat(opcode, fields, first, second, destroyedSprite) {
      if (!this._runtime || !this._runtime.startHats) return;
      const event = {first, second, destroyedSprite, ...fields};
      // startHats drops a second event when the same hat already has a live
      // thread. Arcade destruction and overlap callbacks must run once per
      // occurrence, including two sprites destroyed in one VM frame. Create
      // one thread per event; its hat predicate reads this thread's snapshot.
      if (this._runtime.allScriptsByOpcodeDo && this._runtime._pushThread) {
        this._runtime.allScriptsByOpcodeDo(opcode, (script, target) => {
          const thread = this._runtime._pushThread(script.blockId, target);
          thread.bwArcadeEvent = event;
        });
        return;
      }
      // Older hosts retain the ordinary Scratch dispatch as a fallback.
      const previous = this._currentEvent;
      this._currentEvent = event;
      let threads;
      try { threads = this._runtime.startHats(opcode) || []; }
      finally { this._currentEvent = previous; }
      for (const thread of threads) thread.bwArcadeEvent = event;
    }
    _pumpCreationWaits() {
      const runtime = this._runtime;
      for (const pending of this._creationWaits) {
        if (pending.thread && runtime.threads.includes(pending.thread) &&
            !pending.thread.isKilled && pending.thread.status !== pending.thread.constructor.STATUS_DONE) continue;
        const next = pending.handlers.shift();
        if (next) {
          pending.thread = runtime._pushThread(next.script.blockId, next.target);
          pending.thread.bwArcadeEvent = {...pending.event, TOKEN: next.token};
          pending.thread.bwArcadeCaptures = next.captures;
        } else {
          this._creationWaits.delete(pending);
          pending.resolve(pending.id);
        }
      }
    }
    _finishSpriteCreation(id, util) {
      const sprite = this._state().sprites[id], runtime = this._runtime;
      if (!runtime?.allScriptsByOpcodeDo || !runtime?._pushThread || !Array.isArray(runtime.threads)) {
        this._emitSpriteHat('arcade_whenSpriteCreated', {KIND: sprite.kind}, id, '');
        return id;
      }
      const handlers = [];
      runtime.allScriptsByOpcodeDo('arcade_whenSpriteCreated', (script, target) => {
        const hat = target.blocks.getBlock(script.blockId);
        const kindBlock = target.blocks.getBlock(hat.inputs?.KIND?.block);
        const fixedKind = kindBlock?.opcode === 'text' ? kindBlock.fields.TEXT?.value : null;
        if (fixedKind === null || String(fixedKind) === sprite.kind) handlers.push({script, target});
      });
      // Snapshot registrations when creation starts, as PXT does before
      // invoking callbacks. Repeated registrations retain separate closures.
      for (const registration of this._createdHandlers.filter(h => h.kind === sprite.kind)) {
        runtime.allScriptsByOpcodeDo('arcade_whenRegisteredCreated', (script, target) => {
          const hat = target.blocks.getBlock(script.blockId);
          const tokenBlock = target.blocks.getBlock(hat.inputs?.TOKEN?.block);
          if (tokenBlock?.fields?.TEXT?.value === registration.token) handlers.push({script, target, ...registration});
        });
      }
      if (!handlers.length) return id;
      const event = {first: id, second: '', KIND: sprite.kind};
      let thread;
      // Fast callbacks execute in the same fiber turn. The VM's BlockUtility
      // is shared, so restore its caller context after every nested execution.
      if (util?.thread && util.sequencer === runtime.sequencer) {
        const caller = util.thread, sequencer = util.sequencer;
        while (handlers.length) {
          const next = handlers.shift();
          thread = runtime._pushThread(next.script.blockId, next.target);
          thread.bwArcadeEvent = {...event, TOKEN: next.token};thread.bwArcadeCaptures = next.captures;
          const activeThread = sequencer.activeThread;
          try { sequencer.activeThread = thread;sequencer.stepThread(thread); }
          finally { util.thread = caller;util.sequencer = sequencer;sequencer.activeThread = activeThread; }
          if (!runtime.threads.includes(caller)) { sequencer.retireThread(caller);return ''; }
          if (thread.status !== thread.constructor.STATUS_DONE && !thread.isKilled && runtime.threads.includes(thread)) break;
          thread = null;
        }
        if (!thread) return id;
      }
      return new Promise(resolve => {
        this._creationWaits.add({id, resolve, handlers, thread, event});
        this._pumpCreationWaits();
      });
    }
    createSprite(args, util) {
      const width = Math.max(1, Number(args.WIDTH) || 16), height = Math.max(1, Number(args.HEIGHT) || 16);
      return this._finishSpriteCreation(this._createSprite({...args, X: ((160-width) >> 1) + width/2,
        Y: ((120-height) >> 1) + height/2}), util);
    }
    createImageSprite(args, util) {
      const image = this._image(args.IMAGE);
      return image ? this.createSprite({...args, WIDTH:image.width, HEIGHT:image.height}, util) : '';
    }
    // Arcade stores edges, velocity and acceleration as signed 24.8 values.
    // Keep the actual object in fixed point: reads, image resizing and subsequent
    // writes must all observe the same storage, including after destruction.
    _installSpriteFixedPoint(sprite) {
      const x = sprite.x, y = sprite.y;
      sprite._fx = ((x - sprite.width/2) * 256) | 0;
      sprite._fy = ((y - sprite.height/2) * 256) | 0;
      sprite._imageWidth=sprite.width;sprite._imageHeight=sprite.height;sprite._sx=256;sprite._sy=256;
      const extension=this;
      for(const [property,storage] of [['sx','_sx'],['sy','_sy']])Object.defineProperty(sprite,property,{enumerable:true,configurable:true,
        get(){return this[storage]/256;},set(value){const x=this.x,y=this.y;this[storage]=(Math.max(0,Number(value))*256)|0;extension._recalcSpriteSize(this);this.y=y;this.x=x;}});
      Object.defineProperty(sprite,'scale',{enumerable:true,configurable:true,get(){return Math.max(this.sx,this.sy);},set(value){this.sy=value;this.sx=value;}});
      // PXT Sprite.rotation (radians): the first rotation gives the sprite a
      // rotated bounding box, whose axis-aligned size becomes its width and
      // height; the center stays put. The box is not enumerable: it points back
      // at the sprite, and a destroyed sprite's {...copy} must not carry it.
      Object.defineProperty(sprite,'rotation',{enumerable:true,configurable:true,
        get(){return this._rotatedBBox?this._rotatedBBox.rotation:0;},
        set(value){const x=this.x,y=this.y;
          if(!this._rotatedBBox)Object.defineProperty(this,'_rotatedBBox',{enumerable:false,configurable:true,writable:true,value:new RotatedBoundingBox(this,this.width,this.height)});
          this._rotatedBBox.setRotation(Number(value)||0);extension._recalcSpriteSize(this);this.x=x;this.y=y;}});
      Object.defineProperty(sprite,'rotationDegrees',{enumerable:true,configurable:true,
        get(){return this.rotation*180/Math.PI;},set(value){this.rotation=Number(value)*Math.PI/180;}});
      // PXT lazily replaces any falsy stored data with a new object.
      Object.defineProperty(sprite,'data',{enumerable:true,configurable:true,
        get(){if(!Scratch.BWValues.truth(this._data))this._data={};return this._data;},
        set(value){this._data=value;}});
      for (const axis of ['x', 'y']) {
        const storage = axis === 'x' ? '_fx' : '_fy', size = axis === 'x' ? 'width' : 'height';
        Object.defineProperty(sprite, axis, {enumerable:true, configurable:true,
          get() {
            // Fx.div shifts its dividend before dividing. Retain that signed
            // overflow for huge dimensions; the renderer still uses actual edges.
            const half=((((this[size]*256)|0)<<8)/512)|0;
            return ((this[storage]+half)|0)/256;
          },
          set(value) { this[storage] = ((Number(value) - this[size]/2) * 256) | 0; }});
      }
      for (const property of ['vx', 'vy', 'ax', 'ay']) {
        const storage = '_' + property;
        sprite[storage] = (Number(sprite[property]) * 256) | 0;
        Object.defineProperty(sprite, property, {enumerable:true, configurable:true,
          get() {return this[storage] / 256;}, set(value) {this[storage] = (Number(value) * 256) | 0;}});
      }
      for(const [property,storage] of [['fx','_frictionX'],['fy','_frictionY']]){
        sprite[storage]=(Math.max(0,Number(sprite[property]))*256)|0;
        Object.defineProperty(sprite,property,{enumerable:true,configurable:true,
          get(){return this[storage]/256;},set(value){this[storage]=(Math.max(0,Number(value))*256)|0;}});
      }
    }
    _recalcSpriteSize(sprite) {
      if(sprite._rotatedBBox){
        // PXT recalcSize: the rotated box takes the scaled image size, and the
        // sprite's size is the box's (an integer).
        sprite._rotatedBBox.setDimensions(sprite._imageWidth*sprite.sx,sprite._imageHeight*sprite.sy);
        sprite.width=sprite._rotatedBBox.width;sprite.height=sprite._rotatedBBox.height;
      } else {
        sprite.width=(((sprite._imageWidth*sprite.sx)*256)|0)/256;
        sprite.height=(((sprite._imageHeight*sprite.sy)*256)|0)/256;
      }
      delete sprite._wallHitbox;
    }
    *_setSpriteScalePropertySteps(sprite,property,value,util){
      if(property==='scale'){yield* this._setSpriteScalePropertySteps(sprite,'sy',value,util);yield* this._setSpriteScalePropertySteps(sprite,'sx',value,util);return;}
      const oldX=sprite._fx,oldY=sprite._fy;sprite[property]=value;
      const desiredX=sprite._fx,desiredY=sprite._fy;sprite._fx=oldX;sprite._fy=oldY;
      yield* this._moveSpriteExplicitSteps(sprite,0,(desiredY-sprite._fy)|0,util);
      yield* this._moveSpriteExplicitSteps(sprite,(desiredX-sprite._fx)|0,0,util);
    }
    setSpriteScaleCore(args,util) {
      const sprite=this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);if(!sprite)return;
      const finish=()=>{this._renderSpriteImageIfPresent(sprite);this._positionSprite(sprite.id);this._changed();};
      const work=this._runTerrainGenerator(this._setSpriteScaleCoreSteps(sprite,args,util));return work?.then?work.then(finish):finish();
    }
    *_setSpriteScaleCoreSteps(sprite,args,util){
      const sx=Scratch.BWValues.decode(args.SX),sy=Scratch.BWValues.decode(args.SY),anchor=Number(args.ANCHOR)||0;
      const hasX=sx!=null,hasY=sy!=null,oldW=sprite.width,oldH=sprite.height;
      if(hasX){const old=sprite.sx;yield* this._setSpriteScalePropertySteps(sprite,'sx',Number(sx),util);if(!hasY && Scratch.Cast.toBoolean(args.PROPORTIONAL))yield* this._setSpriteScalePropertySteps(sprite,'sy',sprite.sy*Number(sx)/old,util);}
      if(hasY){const old=sprite.sy;yield* this._setSpriteScalePropertySteps(sprite,'sy',Number(sy),util);if(!hasX && Scratch.Cast.toBoolean(args.PROPORTIONAL))yield* this._setSpriteScalePropertySteps(sprite,'sx',sprite.sx*Number(sy)/old,util);}
      const dx=(sprite.width-oldW)/2,dy=(sprite.height-oldH)/2;
      if(anchor&2)yield* this._moveSpriteExplicitSteps(sprite,(dx*256)|0,0,util);
      if(anchor&4)yield* this._moveSpriteExplicitSteps(sprite,(-dx*256)|0,0,util);
      if(anchor&1)yield* this._moveSpriteExplicitSteps(sprite,0,(dy*256)|0,util);
      if(anchor&8)yield* this._moveSpriteExplicitSteps(sprite,0,(-dy*256)|0,util);
    }
    setSpriteScale(args,util){return this.setSpriteScaleCore({...args,SX:Number(args.VALUE),SY:Number(args.VALUE)},util);}
    changeSpriteScale(args,util){const s=this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);if(s)return this.setSpriteScaleCore({...args,SX:s.sx+Number(args.VALUE),SY:s.sy+Number(args.VALUE)},util);}
    _renderSpriteImageIfPresent(sprite){
      if(!this._sprite(sprite.id))return;
      if(!sprite.image && this._state().spriteTargets[sprite.id])this._imageForSprite(sprite.id,{quiet:true});
      if(sprite.image)this._renderSpriteImage(sprite.id);
    }
    setSpritePosition(args, util) {
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);
      if (!sprite) return;
      // Sprite.setPosition converts the displacement, not the absolute edge.
      const dx = ((Number(args.X) - sprite.x) * 256) | 0;
      const dy = ((Number(args.Y) - sprite.y) * 256) | 0;
      const result = this._moveSpriteExplicit(sprite, dx, dy, util);
      const finish = () => {this._positionSprite(String(args.ID));this._changed();};
      return result?.then ? result.then(finish) : finish();
    }
    spawnSprite(args, util) {
      // The positioned factory is constructor + setPosition, just as exported
      // TypeScript is. Creation callbacks see the constructor's center first.
      const created = this.createSprite(args, util);
      const position = id => {const moved=this.setSpritePosition({ID:id, X:args.X, Y:args.Y},util);return moved?.then ? moved.then(()=>id) : id;};
      return created && typeof created.then === 'function' ? created.then(position) : position(created);
    }
    _createSprite(args) {
      const state = this._state();
      const id = 'arcade:' + (++this._nextSpriteHandle);state.nextSpriteId++;
      const sprite = {id, pxtId: state.nextSpriteId - 1, kind: String(args.KIND), x: Number(args.X) || 0, y: Number(args.Y) || 0,
        vx: 0, vy: 0, ax: 0, ay: 0, fx: 0, fy: 0, z: 0, lifespan: 0, flags: 0,
        width: Math.max(1, Number(args.WIDTH) || 16), height: Math.max(1, Number(args.HEIGHT) || 16)};
      this._installSpriteFixedPoint(sprite);
      sprite._kindInsertion = ++this._kindInsertion;
      state.sprites[id] = sprite;
      state.physicsEngine.members.push(sprite);
      this._spriteValues.set(id, sprite);
      const template = this._runtime && this._runtime.getSpriteTargetByName &&
        this._runtime.getSpriteTargetByName(String(args.TEMPLATE));
      if (template && template.makeClone) {
        const clone = template.makeClone();
        if (clone) {
          this._runtime.addTarget(clone);
          if (clone.setVisible) clone.setVisible(true);
          state.spriteTargets[id] = clone;
          const costume = clone.getCostumes && clone.getCostumes()[clone.currentCostume];
          const size = this._costumeImageSize(costume);
          if (size && size.width === sprite.width && size.height === sprite.height) {
            // Canonical artwork uses four SVG units per Arcade pixel; the
            // Scratch stage uses three display units per Arcade pixel.
            this._scalePixelTarget(clone);
            sprite.mask = this._costumePixelMask(costume, size);
          }
          this._positionSprite(id);
        }
      }
      if (args.IMAGE) this.setSpriteImage({ID: id, IMAGE: args.IMAGE});
      else if (this._projectPalette) this._renderSpriteImageIfPresent(sprite);
      if (state.tilemap) sprite._wallClipping = this._spriteOnWall(sprite,state.tilemap);
      this._changed();
      return id;
    }
    spawnProjectile(args, util) {
      args = {...args};
      // PXT creates at the scene center, runs creation handlers, then applies
      // projectile motion and edge/source placement using the resulting size.
      const created = this.createSprite({TEMPLATE: args.TEMPLATE, KIND: args.KIND,
        X: 80, Y: 60, WIDTH: args.WIDTH, HEIGHT: args.HEIGHT, IMAGE: args.IMAGE}, util);
      const finish = id => {
        const sprite = this._state().sprites[id];
        if (!sprite) return id;
        const vx = Number(args.VX) || 0, vy = Number(args.VY) || 0;
        const xOffset = Math.floor(sprite.width / 2) - 1, yOffset = Math.floor(sprite.height / 2) - 1;
        const source = this._state().sprites[String(args.SOURCE)];
        const fromSprite = ['sprite', 'kind-source'].includes(String(args.MODE)) && source;
        sprite.vx = vx; sprite.vy = vy;
        sprite.x = fromSprite ? source.x : vx < 0 ? 160 + xOffset : vx > 0 ? -xOffset : 0;
        sprite.y = fromSprite ? source.y : vy < 0 ? 120 + yOffset : vy > 0 ? -yOffset : 0;
        sprite.autoDestroy = true;
        sprite.flags |= spriteFlags.AutoDestroy;
        this._clampSprite(sprite); this._positionSprite(id); this._changed();
        return id;
      };
      return created && typeof created.then === 'function' ? created.then(finish) : finish(created);
    }
    registerInstanceDestroyedHandler(args,util) {
      const id=String(args.ID),state=this._state();
      if(!state.sprites[id])return;
      (state.spriteDestroyedHandlers ||= {})[id]=this._handlerRegistration(args,util);
    }
    whenRegisteredInstanceDestroyed(args,util) {return this.whenRegisteredWall(args,util);}
    *_instanceDestroyedSteps(registration,kind,id,util) {
      if(registration && typeof registration==='object')yield* this._registeredCallbackSteps([registration],'arcade_whenRegisteredInstanceDestroyed',{first:id},util);
      yield* this._registeredCallbackSteps(this._destroyedHandlers.filter(h=>h.kind===kind),'arcade_whenRegisteredKindDestroyed',{first:id},util);
    }
    registerSpriteDestroyed(args) {
      const id = String(args.ID);
      const state = this._state();
      if (!state.sprites[id]) return;
      if (!state.spriteDestroyedHandlers) state.spriteDestroyedHandlers = {};
      state.spriteDestroyedHandlers[id] = String(args.TOKEN);
    }
    destroySprite(args,util) {
      const id = String(args.ID);
      const state = this._state();
      const sprite = this._spriteValues.get(id) || state.sprites[id];
      if (!sprite || sprite._destroyed) return;
      sprite._destroyed=true;
      const members=state.physicsEngine.members,index=members.indexOf(sprite);if(index>=0)members.splice(index,1);
      this._clearSpeech(id);
      this._clearImage(id);
      const target = state.spriteTargets[id];
      if (target && this._runtime && this._runtime.disposeTarget) {
        this._runtime.disposeTarget(target);
        if (this._runtime.stopForTarget) this._runtime.stopForTarget(target);
      }
      delete state.spriteTargets[id];
      delete state.sprites[id];
      const token = state.spriteDestroyedHandlers?.[id];
      if (state.spriteDestroyedHandlers) delete state.spriteDestroyedHandlers[id];
      if (typeof token==='string') this._emitSpriteHat('arcade_whenRegisteredDestroyed', {TOKEN: token}, id, '', {...sprite});
      this._emitSpriteHat('arcade_whenSpriteDestroyed', {KIND: sprite.kind}, id, '', {...sprite});
      this._changed();
      return this._runTerrainGenerator(this._instanceDestroyedSteps(token,sprite.kind,id,util));
    }
    setSpriteProperty(args, util) {
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);
      const name = String(args.PROPERTY);
      if (!sprite || !['x', 'y', 'left', 'right', 'top', 'bottom',
        'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale', 'width', 'height', 'z', 'lifespan',
        'rotation', 'rotationDegrees', 'data'].includes(name)) return;
      // PXT Sprite.data holds any value; it is stored as given, not as a number.
      if (name === 'data') { sprite.data = args.VALUE; this._changed(); return; }
      const value = Number(args.VALUE);
      if(['sx','sy','scale'].includes(name)){
        const finish=()=>{this._renderSpriteImageIfPresent(sprite);this._positionSprite(sprite.id);this._changed();};
        const work=this._runTerrainGenerator(this._setSpriteScalePropertySteps(sprite,name,value,util));return work?.then?work.then(finish):finish();
      }
      const oldX = sprite._fx, oldY = sprite._fy;
      if (!Number.isFinite(value) && !['x','y','left','right','top','bottom','vx','vy','ax','ay','fx','fy','sx','sy','scale'].includes(name)) return;
      if (name === 'left') sprite._fx = (value * 256) | 0;
      else if (name === 'right') sprite._fx = ((value - sprite.width) * 256) | 0;
      else if (name === 'top') sprite._fy = (value * 256) | 0;
      else if (name === 'bottom') sprite._fy = ((value - sprite.height) * 256) | 0;
      else sprite[name] = name === 'width' || name === 'height' ? Math.max(1, value) : value;
      let moved;
      if (['x','y','left','right','top','bottom'].includes(name) && this._state().tilemap) {
        const dx = (sprite._fx - oldX) | 0, dy = (sprite._fy - oldY) | 0;
        sprite._fx = oldX; sprite._fy = oldY;moved=this._moveSpriteExplicit(sprite, dx, dy, util);
      }
      const finish = () => {
        if(['sx','sy','scale','rotation','rotationDegrees'].includes(name))this._renderSpriteImageIfPresent(sprite);
        this._clampSprite(sprite);
        if (['sx','sy','scale','rotation','rotationDegrees','x', 'y', 'left', 'right', 'top', 'bottom'].includes(name)) this._positionSprite(String(args.ID));
        if(name==='z')this._orderSpriteDrawables();
        this._changed();
      };
      return moved?.then ? moved.then(finish) : finish();
    }
    isHittingTile(args) {
      const sprite = this._spriteValues.get(String(args.ID));
      return !!sprite?._wallObstacles?.[Number(args.DIRECTION)];
    }
    _wallHitbox(sprite) {
      // PXT game.calculateHitBox: a rotated sprite's hitbox is its whole box.
      if(sprite._rotatedBBox)return {left:0,top:0,width:sprite.width,height:sprite.height};
      const image = this._imageForSprite(sprite.id, {quiet: true}), pixels = image?.pixels || sprite.mask;
      let left = 0, top = 0, right = sprite._imageWidth - 1, bottom = sprite._imageHeight - 1;
      if (pixels) {
        left = sprite._imageWidth; top = sprite._imageHeight; right = 0; bottom = 0;
        for (let y = 0; y < sprite._imageHeight; y++) for (let x = 0; x < sprite._imageWidth; x++) {
          if (!pixels[y * sprite._imageWidth + x]) continue;
          left = Math.min(left, x);right = Math.max(right, x);top = Math.min(top, y);bottom = Math.max(bottom, y);
        }
        // PXT retains its degenerate min=size/max=0 box for completely
        // blank artwork; its forward wall probes still observe that box.
      }
      // Fx.mul wraps its 32-bit product BEFORE shifting back to 24.8.
      // Multiply min/max separately: combining the extent changes overflow.
      const minX=Math.imul((left*256)|0,sprite._sx)>>8,maxX=Math.imul((right*256)|0,sprite._sx)>>8;
      const minY=Math.imul((top*256)|0,sprite._sy)>>8,maxY=Math.imul((bottom*256)|0,sprite._sy)>>8;
      const width=(maxX-minX+sprite._sx)/256,height=(maxY-minY+sprite._sy)/256;
      left=Math.floor(minX/256);top=Math.floor(minY/256);
      const fresh = {left, top, width, height};
      const cached = sprite._wallHitbox;
      // PXT keeps changes of at most two pixels on each axis to prevent
      // animated artwork jittering into walls. Image replacement resets it.
      if (cached) {
        if (Math.abs(cached.left-left)+Math.abs(cached.left+cached.width-left-fresh.width) <= 2) {
          fresh.left = cached.left;fresh.width = cached.width;
        }
        if (Math.abs(cached.top-top)+Math.abs(cached.top+cached.height-top-fresh.height) <= 2) {
          fresh.top = cached.top;fresh.height = cached.height;
        }
      }
      sprite._wallHitbox = fresh;return fresh;
    }
    _wallAt(map, column, row) {
      map=this._state().tilemap;if(!map || (map.legacy && !map.mapImage))return false;
      return column < 0 || row < 0 || column >= map.columns || row >= map.rows || !!map.walls[row*map.columns+column];
    }
    _spriteOnWall(sprite, map) {
      const box = this._wallHitbox(sprite);if (!box) return false;
      const size = map.tileSize * 256;
      const left = Math.floor((sprite._fx+box.left*256)/size), top = Math.floor((sprite._fy+box.top*256)/size);
      const right = Math.floor((sprite._fx+(box.left+box.width-1)*256)/size), bottom = Math.floor((sprite._fy+(box.top+box.height-1)*256)/size);
      for (let x=left;x<=right;x++) for (let y=top;y<=bottom;y++) if (this._wallAt(map,x,y)) return true;
      return false;
    }
    _resolveSpriteClipping(sprite, map) {
      if (sprite.flags & spriteFlags.GhostThroughWalls) return false;
      const box = this._wallHitbox(sprite);if (!box) return true;
      const x = sprite._fx, y = sprite._fy, size = map.tileSize,maxMove=(this._state().physicsEngine.maxSingleStep+128)>>8;
      const left = Math.floor(x/256+box.left+.5), right = Math.floor(x/256+box.left+box.width-1+.5);
      const top = Math.floor(y/256+box.top+.5), bottom = Math.floor(y/256+box.top+box.height-1+.5);
      const offsets = [[0,-((bottom+1)%size)], [0,(Math.floor(top/size)+1)*size-top],
        [-((right+1)%size),0], [(Math.floor(left/size)+1)*size-left,0]];
      for (const [dx,dy] of offsets) {
        if (Math.abs(dx)>maxMove || Math.abs(dy)>maxMove) continue;
        sprite._fx = (x+dx*256)|0;sprite._fy = (y+dy*256)|0;
        if (!this._spriteOnWall(sprite,map)) return true;
      }
      sprite._fx=x;sprite._fy=y;return false;
    }
    _moveSpriteExplicit(sprite, dx, dy, util) {return this._runTerrainGenerator(this._moveSpriteExplicitSteps(sprite,dx,dy,util));}
    *_moveSpriteExplicitSteps(sprite, dx, dy, util) {
      const oldX = sprite._fx, oldY = sprite._fy;
      sprite._fx = (oldX+dx)|0;sprite._fy = (oldY+dy)|0;
      const map = this._state().tilemap;if (!map) return;
      const maxDist=(this._state().physicsEngine.maxSingleStep+128)>>8;
      if (Math.abs((dx+128)>>8)<=maxDist && Math.abs((dy+128)>>8)<=maxDist) {
        yield* this._collideTileWallsSteps(sprite,map,dx,dy,{dx,dy,xStep:dx,yStep:dy,cachedVx:sprite._vx,cachedVy:sprite._vy},util);
      } else {
        sprite._wallClipping = this._spriteOnWall(sprite,map) && !this._resolveSpriteClipping(sprite,map);
      }
    }
    *_collideTileWallsSteps(sprite, map, dx, dy, motion, util) {
      const epoch=this._terrainEpoch,owner=this._state();
      map=owner.tilemap;if(!map) return;
      if (sprite._wallClipping && !this._spriteOnWall(sprite,map)) sprite._wallClipping=false;
      const box = this._wallHitbox(sprite);if (!box) return;
      const size=map.tileSize*256, blocked=()=>sprite._wallClipping || sprite._destroyed || !this._sprite(sprite.id) || sprite.flags & (spriteFlags.GhostThroughWalls|spriteFlags.RelativeToCamera);
      if(!blocked()) for(const axis of ['x','y']){
        const delta=axis==='x'?dx:dy;if(!delta) continue;
        const positive=delta>0, horizontal=axis==='x', storage=horizontal?'_fx':'_fy', offset=horizontal?box.left:box.top, extent=horizontal?box.width:box.height;
        const edge=sprite[storage]+(offset+(positive?extent:-1))*256, coordinate=Math.floor((edge+128)/size);
        const first=horizontal?sprite._fy+box.top*256-dy:sprite._fx+box.left*256;
        const last=first+((horizontal?box.height:box.width)-1)*256, contacts=[], seen=new Set();
        for(let value=first;value<last+size;value+=size){
          const other=Math.floor((Math.min(value,last)+128)/size),column=horizontal?coordinate:other,row=horizontal?other:coordinate;
          if(!this._wallAt(map,column,row)) continue;
          const current=this._state().tilemap;
          const index=!current || column<0 || row<0 || column>=current.columns || row>=current.rows?0:current.indices[row*current.columns+column];
          if(seen.has(index)) continue;seen.add(index);contacts.push({column,row,index});
        }
        if(!contacts.length) continue;
        sprite[storage]=(coordinate*size+(positive?-extent*256:size)-offset*256)|0;
        const direction=horizontal?(positive?2:0):(positive?3:1);
        for(const {column,row,index} of contacts){
          if(blocked()) continue;
          if(!sprite._wallObstacles) sprite._wallObstacles=[];sprite._wallObstacles[direction]={column,row,tileIndex:index};
          const legacyMatches=this._legacyWallHandlers.filter(h=>h.kind===sprite.kind && h.index===index);
          yield* this._terrainCallbackSteps(legacyMatches,'arcade_whenRegisteredLegacyWall',sprite,column,row,util);
          if(epoch!==this._terrainEpoch || this._state()!==owner)return;
          const matches=this._wallHandlers.filter(h=>h.kind===sprite.kind);
          yield* this._terrainCallbackSteps(matches,'arcade_whenRegisteredWall',sprite,column,row,util);
          if(epoch!==this._terrainEpoch || this._state()!==owner)return;
        }
        if(sprite.flags & spriteFlags.DestroyOnWall){this.destroySprite({ID:sprite.id});return;}
        const velocity=horizontal?'_vx':'_vy',cached=horizontal?motion.cachedVx:motion.cachedVy,remaining=horizontal?'dx':'dy',step=horizontal?'xStep':'yStep';
        if(sprite[velocity]===cached && !blocked()){
          if(sprite.flags & spriteFlags.BounceOnWall){
            if(positive?sprite[velocity]>0:sprite[velocity]<0){sprite[velocity]=-sprite[velocity];motion[remaining]=-motion[remaining];motion[step]=-motion[step];}
          }else{sprite[velocity]=0;motion[remaining]=0;}
        }else if(Math.sign(Math.floor(sprite[velocity]/256+.5))===Math.sign(Math.floor(cached/256+.5))) motion[remaining]=0;
      }
      yield* this._tileOverlapSteps(sprite,map,box,util);
    }
    _physicsMotion(sprite,dtMs,half,engine=this._state().physicsEngine) {
      const constrain=value=>Math.max(-engine.maxVelocity,Math.min(engine.maxVelocity,value));
      const vx=constrain(sprite._vx),vy=constrain(sprite._vy);
      for(const [velocity,acceleration,friction] of [['_vx','_ax','_frictionX'],['_vy','_ay','_frictionY']]){
        if(sprite[acceleration])sprite[velocity]+=Math.trunc(Math.imul(sprite[acceleration],Math.trunc(dtMs))/1000);
        else if(sprite[friction]){
          const amount=Math.trunc(Math.imul(sprite[friction],Math.trunc(dtMs))/1000),difference=sprite[velocity]-amount;
          if(difference<0)sprite[velocity]=Math.min(0,sprite[velocity]+amount);
          else if(difference>0)sprite[velocity]=Math.max(0,sprite[velocity]-amount);
          else sprite[velocity]=0;
        }
        sprite[velocity]=constrain(sprite[velocity]);
      }
      const motion={sprite,dx:((sprite._vx+vx)*half/1000)|0,dy:((sprite._vy+vy)*half/1000)|0,cachedVx:sprite._vx,cachedVy:sprite._vy};
      motion.xStep=motion.dx;motion.yStep=motion.dy;
      while(Math.abs(motion.xStep)>engine.maxSingleStep || Math.abs(motion.yStep)>engine.maxSingleStep){
        const x=motion.xStep,y=motion.yStep;
        if(Math.abs(motion.xStep)>engine.minSingleStep)motion.xStep=Math.trunc(motion.xStep/2);
        if(Math.abs(motion.yStep)>engine.minSingleStep)motion.yStep=Math.trunc(motion.yStep/2);
        if(x===motion.xStep && y===motion.yStep){
          this._runtime?.emit?.('ARCADE_RUNTIME_DIAGNOSTIC',{code:'physics-step-no-progress',engine:engine.id,maxSpeed:engine.maxVelocity/256,minStep:engine.minSingleStep/256,maxStep:engine.maxSingleStep/256});
          motion.dx=motion.dy=motion.xStep=motion.yStep=0;break;
        }
      }
      return motion;
    }
    _legacyOverlapRegistrations() {
      const handlers=[];
      this._runtime?.allScriptsByOpcodeDo?.('arcade_whenSpritesOverlap',(script,target)=>{
        const hat=target.blocks.getBlock(script.blockId);
        const argument=name=>{
          if(hat.fields?.[name])return hat.fields[name].value;
          const block=target.blocks.getBlock(hat.inputs?.[name]?.block);
          return block?.fields?.TEXT?.value ?? Object.values(block?.fields || {})[0]?.value;
        };
        const kind=argument('A'),otherKind=argument('B');
        if(kind!==undefined && otherKind!==undefined)handlers.push({kind:String(kind),otherKind:String(otherKind),script,target,legacy:true});
      });
      return handlers;
    }
    _physicsGrid(live,map) {
      const width=map?map.columns*map.tileSize:(this._state().tilemapInitialized?0:160);
      const height=map?map.rows*map.tileSize:(this._state().tilemapInitialized?0:120);
      const maxWidth=live.reduce((n,s)=>Math.max(n,s.width),0),maxHeight=live.reduce((n,s)=>Math.max(n,s.height),0);
      const cellWidth=Math.min(width>>2,Math.max(8,maxWidth<<1)),cellHeight=Math.min(height>>2,Math.max(8,maxHeight<<1));
      return {cellWidth,cellHeight,columns:(width/cellWidth)|0,rows:(height/cellHeight)|0,buckets:new Map(),filled:[]};
    }
    _physicsInsert(grid,sprite) {
      const {cellWidth,cellHeight,columns,rows}=grid;
      const key=(x,y)=>Math.min(columns,Math.max(0,(x/cellWidth)|0))+Math.min(rows,Math.max(0,(y/cellHeight)|0))*columns;
      const xn=((sprite.width+cellWidth-1)/cellWidth)|0,yn=((sprite.height+cellHeight-1)/cellHeight)|0;
      for(let x=0;x<=xn;x++)for(let y=0;y<=yn;y++){
        const index=key(sprite._fx/256+Math.min(sprite.width,x*cellWidth),sprite._fy/256+Math.min(sprite.height,y*cellHeight));
        let bucket=grid.buckets.get(index);if(!bucket){bucket=[];grid.buckets.set(index,bucket);grid.filled.push(bucket);}
        if(!bucket.includes(sprite))bucket.push(sprite);
      }
    }
    _queueOverlapPair(first,second,matches,owner) {
      if(!owner.overlapLocks)owner.overlapLocks=new Set();
      const pair=[first.id,second.id].sort().join('|');if(owner.overlapLocks.has(pair) || !matches.length)return;
      owner.overlapLocks.add(pair);let remaining=matches.length;
      for(const h of matches){
        const flipped=h.kind!==first.kind,a=flipped?second:first,b=flipped?first:second;
        const finish=()=>{if(--remaining===0)owner.overlapLocks.delete(pair);};
        let work;
        if(h.legacy){
          const thread=this._runtime._pushThread(h.script.blockId,h.target);
          thread.bwArcadeEvent={A:h.kind,B:h.otherKind,first:a.id,second:b.id};
          work=new Promise(resolve=>this._terrainWaits.add({thread,resolve}));
        }else work=this._runTerrainGenerator(this._registeredCallbackSteps([h],'arcade_whenRegisteredOverlap',{first:a.id,second:b.id},undefined,true));
        if(work?.then)work.finally(finish);else finish();
      }
    }
    _physicsOverlapRounds(grid,handlers,owner) {
      if(!handlers.length)return;
      const checked=new Set(),blocked=s=>s._destroyed || s.flags&(spriteFlags.GhostThroughSprites|spriteFlags.RelativeToCamera);
      for(const bucket of grid.filled){
        if(bucket.length===1)continue;
        for(const first of bucket){if(blocked(first))continue;
          for(const second of bucket){
            if(first===second)continue;
            const pair=[first.id,second.id].sort().join('|');if(checked.has(pair))continue;checked.add(pair);
            if(owner.overlapLocks?.has(pair))continue;
            const matches=handlers.filter(h=>(h.kind===first.kind && h.otherKind===second.kind)||(h.kind===second.kind && h.otherKind===first.kind));
            if(!matches.length)continue;
            const higher=first.pxtId>second.pxtId?first:second,lower=higher===first?second:first;
            if(this.spriteOverlaps({A:higher.id,B:lower.id}))this._queueOverlapPair(first,second,matches,owner);
          }
        }
      }
    }
    *_advancePhysicsSteps(live,dt,map) {
      const owner=this._state(),epoch=this._terrainEpoch,dtMs=Math.min(100,dt*1000),half=Math.trunc(dtMs/2);
      const handlers=[...this._overlapHandlers,...this._legacyOverlapRegistrations()];
      const engine=owner.physicsEngine;
      let movers=live.map(sprite=>this._physicsMotion(sprite,dtMs,half,engine));
      for(const sprite of live)if(sprite._vx || sprite._vy)sprite._wallObstacles=[];
      const grid=this._physicsGrid(live,map);
      const ratio=((engine.maxVelocity<<8)/engine.minSingleStep)|0;
      const count=(Math.trunc(Math.imul(ratio,Math.trunc(dtMs))/1000)+128)>>8;
      for(let round=0;round<count && movers.length;round++){
        const remaining=[];
        for(const motion of movers){
          const sprite=motion.sprite;
          for(const axis of ['x','y']){
            const velocity=axis==='x'?'_vx':'_vy',cache=axis==='x'?'cachedVx':'cachedVy',delta=axis==='x'?'dx':'dy',step=axis==='x'?'xStep':'yStep';
            if(sprite[velocity]!==motion[cache]){
              if(!sprite[velocity])motion[delta]=0;
              else if(sprite[velocity]<0 && motion[cache]>0 || sprite[velocity]>0 && motion[cache]<0){motion[delta]=-motion[delta];motion[step]=-motion[step];}
              motion[cache]=sprite[velocity];
            }
          }
          const dx=Math.abs(motion.xStep)>Math.abs(motion.dx)?motion.dx:motion.xStep;
          const dy=Math.abs(motion.yStep)>Math.abs(motion.dy)?motion.dy:motion.yStep;
          motion.dx-=dx;motion.dy-=dy;
          sprite._fx=(sprite._fx+dx)|0;sprite._fy=(sprite._fy+dy)|0;
          if(!sprite._destroyed && !(sprite.flags&(spriteFlags.GhostThroughSprites|spriteFlags.RelativeToCamera)) &&
            [...this._overlapHandlers,...handlers.filter(h=>h.legacy)].some(h=>h.kind===sprite.kind || h.otherKind===sprite.kind))this._physicsInsert(grid,sprite);
          if(map)yield* this._collideTileWallsSteps(sprite,map,dx,dy,motion);
          if(epoch!==this._terrainEpoch || this._state()!==owner)return;
          this._clampSprite(sprite);
          if(Math.abs(motion.dx)>25 || Math.abs(motion.dy)>25)remaining.push(motion);
        }
        this._physicsOverlapRounds(grid,handlers,owner);
        movers=remaining;
      }
    }
    *_advanceTilePhysicsSteps(sprite,dt,map) {yield* this._advancePhysicsSteps([sprite],dt,map);}
    _clampSprite(sprite) {
      if (!sprite.stayInScreen && (!sprite.bounceOnWall || this._state().tilemap)) return;
      if(!this._cameraIsUpdated())this._updateCamera();
      const camera=this._camera(),box=this._wallHitbox(sprite);if(!box)return;
      const left=sprite._fx/256+box.left,right=left+box.width-1;
      const top=sprite._fy/256+box.top,bottom=top+box.height-1;
      let dx=0,dy=0;
      if(left<camera.offsetX)dx=camera.offsetX-left;
      else if(right>camera.offsetX+160)dx=camera.offsetX+160-right;
      if(top<camera.offsetY)dy=camera.offsetY-top;
      else if(bottom>camera.offsetY+120)dy=camera.offsetY+120-bottom;
      if(dx){sprite._fx=(sprite._fx+((dx*256)|0))|0;if(sprite.bounceOnWall)sprite.vx=-sprite.vx;}
      if(dy){sprite._fy=(sprite._fy+((dy*256)|0))|0;if(sprite.bounceOnWall)sprite.vy=-sprite.vy;}
    }
    setSpriteFlag(args) {
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);
      const mask = spriteFlags[String(args.FLAG)];
      if (!sprite || mask === undefined) return;
      const on = Scratch.Cast.toBoolean(args.ON);
      sprite.flags = on ? (sprite.flags || 0) | mask : (sprite.flags || 0) & ~mask;
      sprite.autoDestroy = !!(sprite.flags & spriteFlags.AutoDestroy);
      sprite.stayInScreen = !!(sprite.flags & spriteFlags.StayInScreen);
      sprite.bounceOnWall = !!(sprite.flags & spriteFlags.BounceOnWall);
      sprite.ghostThroughSprites = !!(sprite.flags & spriteFlags.GhostThroughSprites);
      sprite.ghostThroughWalls = !!(sprite.flags & spriteFlags.GhostThroughWalls);
      sprite.ghostThroughTiles = !!(sprite.flags & spriteFlags.GhostThroughTiles);
      sprite.invisible = !!(sprite.flags & spriteFlags.Invisible);
      const target = this._state().spriteTargets[String(args.ID)];
      if (String(args.FLAG) === 'Invisible') {
        if(target?.setVisible)target.setVisible(!sprite.invisible);
        const drawable=this._imageSkins.get(sprite.id)?.drawableId;
        if(drawable!==undefined)this._runtime?.renderer?.updateDrawableVisible(drawable,!sprite.invisible && this._state().sprites[sprite.id]===sprite);
      }
      if (String(args.FLAG) === 'RelativeToCamera') this._positionSprite(sprite.id);
      if (String(args.FLAG) === 'StayInScreen') {
        this._clampSprite(sprite);
        this._positionSprite(String(args.ID));
      }
      this._changed();
    }
    setSpriteStayInScreen(args) { this.setSpriteFlag({...args, FLAG: 'StayInScreen'}); }
    setSpriteAutoDestroy(args) { this.setSpriteFlag({...args, FLAG: 'AutoDestroy'}); }
    setSpriteBounceOnWall(args) { this.setSpriteFlag({...args, FLAG: 'BounceOnWall'}); }
    setSpriteGhostThroughSprites(args) { this.setSpriteFlag({...args, FLAG: 'GhostThroughSprites'}); }
    _costumeImageSize(costume) {
      if (!costume || costume.dataFormat !== 'svg') return null;
      const cx = Number(costume.rotationCenterX), cy = Number(costume.rotationCenterY);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || cx <= 0 || cy <= 0) return null;
      // Imported Arcade images use imageToSvg's four SVG units per pixel,
      // centred at exactly half the canvas. Check the SVG itself when the
      // asset is available; the centres remain in the SB3 when it is not.
      const data = costume.asset && costume.asset.data;
      if (data) {
        const head = typeof data === 'string' ? data.slice(0, 1024) :
          Array.from(data.slice(0, 1024), byte => String.fromCharCode(byte)).join('');
        const tag = /<svg\\b[^>]*>/i.exec(head);
        const width = tag && /\\bwidth="(\\d+)"/.exec(tag[0]);
        const height = tag && /\\bheight="(\\d+)"/.exec(tag[0]);
        if (!tag || !width || !height || !/shape-rendering="crispEdges"/.test(tag[0]) ||
          Number(width[1]) !== cx * 2 || Number(height[1]) !== cy * 2) return null;
      }
      return {width: cx / 2, height: cy / 2};
    }
    _costumePixelMask(costume, size) {
      const data = costume && costume.asset && costume.asset.data;
      if (!data || !size || !Number.isInteger(size.width) || !Number.isInteger(size.height)) return null;
      const svg = typeof data === 'string' ? data :
        Array.from(data, byte => String.fromCharCode(byte)).join('');
      const root = /<svg\\b[^>]*>/i.exec(svg);
      if (!root || !/shape-rendering="crispEdges"/.test(root[0])) return null;
      const body = svg.slice(root.index + root[0].length).replace(/<\\/svg>\\s*$/i, '');
      const rects = [...body.matchAll(/<rect\\b([^>]*)\\/\\s*>/gi)];
      if (body.replace(/<rect\\b[^>]*\\/\\s*>/gi, '').trim()) return null;
      const attr = (tag, name) => {
        const match = new RegExp('\\\\b' + name + '="([^"]*)"', 'i').exec(tag);
        return match && match[1];
      };
      const mask = new Uint8Array(size.width * size.height);
      for (const rect of rects) {
        const [x, y, width, height] = ['x', 'y', 'width', 'height']
          .map(name => Number(attr(rect[1], name)) / 4);
        if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 ||
          width < 0 || height < 0 || x + width > size.width || y + height > size.height ||
          !/^#[0-9a-f]{6}$/i.test(attr(rect[1], 'fill') || '')) return null;
        for (let row = y; row < y + height; row++) {
          for (let col = x; col < x + width; col++) mask[row * size.width + col] = 1;
        }
      }
      return mask;
    }
    _spriteMask(sprite) {
      // Image aliases stay live even while their sprite's scene is hidden.
      // Renderer mask caches must not determine object-level pixel queries.
      if(sprite.image?.pixels)return sprite.image.pixels;
      if (sprite.mask) return sprite.mask;
      const target = this._state().spriteTargets[sprite.id];
      const costume = target && target.getCostumes && target.getCostumes()[target.currentCostume];
      const size = this._costumeImageSize(costume);
      if (size && size.width === sprite.width && size.height === sprite.height) {
        sprite.mask = this._costumePixelMask(costume, size);
      }
      return sprite.mask || null;
    }
    _clearImage(id) {
      const entry = this._imageSkins.get(id);
      if (!entry) return;
      // Restore the authored skin before destroying this sprite's private skin.
      entry.target?.setCostume?.(entry.target.currentCostume);
      if(entry.drawableId!==undefined)this._runtime?.renderer?.destroyDrawable(entry.drawableId,'sprite');
      this._runtime?.renderer?.destroySkin(entry.skinId);
      this._imageSkins.delete(id);
    }
    // quiet: a probe that has its own fallback (rendering, wall hitboxes) asks
    // without reporting; only the image blocks themselves report a costume
    // that is not pixel art (a vector costume has no Arcade image).
    _imageForSprite(id, {quiet = false} = {}) {
      const sprite = this._spriteValues.get(String(id)) || this._sprite(id);
      const target = this._state().spriteTargets?.[id];
      if (!sprite) return null;
      if (sprite.image) return sprite.image;
      if (!target) return null;
      if (!sprite.image) {
        const costume = target.getCostumes?.()[target.currentCostume];
        sprite.image = imageEngine.decode(costume, this._costumeImageSize(costume));
      }
      if (!sprite.image) {
        if (!quiet) this._runtime?.emit?.('BLOCKS_ERROR', 'Arcade image mutation cannot read this sprite artwork. Use an imported Arcade pixel image.');
        return;
      }
      return sprite.image;
    }
    createImage(args) {
      const width = Number(args.WIDTH) | 0, height = Number(args.HEIGHT) | 0;
      if (width < 0 || height < 0 || width > 2000 || height > 2000) return '';
      return this._imageHandle({width, height, pixels: new Uint8Array(width * height)});
    }
    cloneImage(args) {
      const image = this._image(args.IMAGE);
      return image ? this._imageHandle({width: image.width, height: image.height, pixels: image.pixels.slice(), ...(image.palette ? {palette: image.palette.slice()} : {})}) : '';
    }
    imageProperty(args) {
      const image = this._image(args.IMAGE);
      return image && ['width', 'height'].includes(String(args.PROPERTY)) ? image[args.PROPERTY] : 0;
    }
    copyImageFrom(args) {
      const image=this._image(args.IMAGE),source=this._image(args.SOURCE);
      if(image && source && imageEngine.copyFrom(image,source))this._refreshImage(image);
    }
    scrollImage(args) {
      const image=this._image(args.IMAGE);
      if(image){imageEngine.scroll(image,args.X,args.Y);this._refreshImage(image);}
    }
    mutateImage(args) {
      const image = this._image(args.IMAGE);
      if (image && imageEngine.mutate(image, String(args.OP), args.COLOR, args.TO)) this._refreshImage(image);
    }
    setImagePixel(args) {
      const image = this._image(args.IMAGE);
      if (image) { imageEngine.draw(image, 'setPixel', args.X, args.Y, args.COLOR); this._refreshImage(image); }
    }
    imagePixel(args) {
      const image = this._image(args.IMAGE);
      return image ? imageEngine.getPixel(image, args.X, args.Y) : 0;
    }
    drawImage(args) {
      const image = this._image(args.IMAGE);
      if (image && ['fillRect', 'drawLine'].includes(String(args.OP))) {
        imageEngine.draw(image, String(args.OP), args.X, args.Y, args.W, args.H, args.COLOR); this._refreshImage(image);
      }
    }
    blitImage(args) {
      const image = this._image(args.IMAGE), source = this._image(args.SOURCE);
      if (image && source && ['drawImage', 'drawTransparentImage'].includes(String(args.OP))) {
        imageEngine.blit(image, source, String(args.OP), args.X, args.Y);this._refreshImage(image);
      }
    }
    imagesOverlap(args) {
      const image = this._image(args.IMAGE), source = this._image(args.SOURCE);
      return !!(image && source && imageEngine.blit(image, source, 'overlapsWith', args.X, args.Y));
    }
    spawnImageProjectile(args, util) {
      const image = this._image(args.IMAGE);
      return image ? this.spawnProjectile({...args, WIDTH: image.width, HEIGHT: image.height}, util) : '';
    }
    spawnImageSprite(args, util) {
      const image = this._image(args.IMAGE);
      return image ? this.spawnSprite({...args, WIDTH: image.width, HEIGHT: image.height}, util) : '';
    }
    _image(value) {
      const id = Scratch.BWValues.referenceId(this._runtime, value, 'image');
      return id === null ? null : this._images.get(id);
    }
    _imageHandle(image) {
      if (!image) return '';
      if (!this._imageIds.has(image)) {
        const id = 'arcade-image:' + (++this._nextImageId);
        this._imageIds.set(image, id); this._images.set(id, image);
      }
      return Scratch.BWValues.reference(this._runtime, 'image', this._imageIds.get(image));
    }
    spriteImage(args) { return this._imageHandle(this._imageForSprite(args.ID)); }
    frameImage(args) {
      const arrayKey = String(args.KEY);
      const definition = this._frameDefinitions.get(arrayKey) || {template: String(args.TEMPLATE),
        start: Number(args.START) | 0, count: Number(args.COUNT) | 0};
      const count = definition.count;
      const index = ((Math.round(Number(args.INDEX)) % count) + count) % count;
      if (!Number.isFinite(index) || count < 1) return '';
      const key = JSON.stringify([arrayKey, index]);
      if (this._frameImages.has(key)) return this._frameImages.get(key);
      const template = this._runtime?.getSpriteTargetByName?.(definition.template);
      const costume = template?.getCostumes?.()[index + definition.start];
      const image = imageEngine.decode(costume, this._costumeImageSize(costume));
      if (!image) {
        this._runtime?.emit?.('BLOCKS_ERROR', 'Arcade cannot read this frame image artwork.'); return '';
      }
      this._frameDefinitions.set(arrayKey, definition);
      const id = this._imageHandle(image); this._frameImages.set(key, id); return id;
    }
    _animation(value) {
      const id = Scratch.BWValues.referenceId(this._runtime, value, 'animation');
      return id === null ? null : this._animations.get(id);
    }
    _animationNumericValue(value) {
      const decoded = Scratch.BWValues.decode(value);
      // Scratch number shadows arrive as text. PXT stores legal missing/null
      // numeric arguments unchanged, so do not turn them into NaN or zero.
      return decoded == null ? decoded : Number(decoded);
    }
    createAnimation(args) {
      if (!this._animationUpdateOrder.includes('legacy')) this._animationUpdateOrder.push('legacy');
      const id = 'arcade-animation:' + (++this._nextAnimationId);
      this._activeLegacyAnimations.add(id);
      this._animations.set(id, {action: this._animationNumericValue(args.ACTION),
        interval: this._animationNumericValue(args.INTERVAL), index: -1, frames: [], sprites: [],
        lastTime: this._globalElapsedMs || 0});
      return Scratch.BWValues.reference(this._runtime, 'animation', id);
    }
    addAnimationFrame(args) {
      const animation = this._animation(args.ANIMATION), image = this._image(args.IMAGE);
      if (animation && image) animation.frames[++animation.index] = image;
    }
    attachAnimation(args) {
      const animation = this._animation(args.ANIMATION), sprite = this._spriteValues.get(String(args.ID));
      if (animation && sprite && !animation.sprites.includes(sprite)) animation.sprites.push(sprite);
    }
    setAnimationAction(args) {
      const sprite = this._spriteValues.get(String(args.ID));
      if (sprite) sprite._action = this._animationNumericValue(args.ACTION);
    }
    animationProperty(args) {
      const animation = this._animation(args.ANIMATION);
      if (!animation) return Scratch.BWValues.encode(undefined);
      if (args.PROPERTY === 'image') {
        const image = animation.frames[animation.index];
        return image ? this._imageHandle(image) : Scratch.BWValues.encode(undefined);
      }
      return Scratch.BWValues.encode(['action', 'interval'].includes(String(args.PROPERTY)) ? animation[args.PROPERTY] : undefined);
    }
    setAnimationInterval(args) {
      const animation = this._animation(args.ANIMATION);
      if (animation) animation.interval = this._animationNumericValue(args.INTERVAL);
    }
    getAnimationAssets() {
      const resources = this._runtime?.bwArcadeAnimationResources;
      const items = animationResourceMenuItems(resources, this._runtime);
      return items.length ? items : [{text: 'No animation assets — create one in Pixel', value: 'none'}];
    }
    _animationAsset(value) {
      const id = String(Scratch.BWValues.decode(value));
      const resource = this._runtime?.bwArcadeAnimationResources?.get?.(id);
      const fail = reason => {
        this._animationAssetCache.delete(id);
        this._runtime?.emit?.('BLOCKS_ERROR', 'Arcade animation asset "' + id + '": ' + reason + '.');
        return null;
      };
      if (!resource) return fail('missing or deleted resource');
      const {width, height, palette, frames, revision} = resource;
      if (resource.id !== id || typeof resource.name !== 'string' || !resource.name.trim() ||
          !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 160 || height > 160 ||
          !((Number.isInteger(revision) && revision >= 0) || (typeof revision === 'string' && revision.length > 0)) || !Array.isArray(palette) || palette.length !== 16 ||
          palette[0] !== null || !Array.from(palette.slice(1)).every(colour => /^#[0-9a-f]{6}$/i.test(colour)) ||
          !Array.isArray(frames) || !frames.length || frames.length > 64) return fail('invalid resource metadata');
      const ids = new Set();
      const interval = frames[0]?.durationMs;
      for (const frame of frames) {
        if (!frame || typeof frame.id !== 'string' || !frame.id || ids.has(frame.id) ||
            !Number.isInteger(frame.durationMs) || frame.durationMs < 1 || frame.durationMs > 65535 ||
            frame.durationMs !== interval || !ArrayBuffer.isView(frame.pixels) ||
            typeof frame.pixels.every !== 'function' || frame.pixels.length !== width * height ||
            !frame.pixels.every(pixel => Number.isInteger(pixel) && pixel >= 0 && pixel <= 15)) {
          return fail('invalid frames or nonuniform frame duration');
        }
        ids.add(frame.id);
      }
      return resource;
    }
    animationAssetFrames(args) {
      const resource = this._animationAsset(args.RESOURCE);
      if (!resource) return Scratch.BWValues.encode(undefined);
      const cached = this._animationAssetCache.get(resource.id);
      if (cached?.revision === resource.revision) return cached.reference;
      // Snapshot authored pixels. Existing animations keep their actual image
      // objects when the editor publishes a later resource revision.
      const images = resource.frames.map(frame => this._imageHandle({width: resource.width, height: resource.height,
        pixels: Uint8Array.from(frame.pixels), palette: resource.palette.slice()}));
      const reference = Scratch.BWValues.arrayReference(this._runtime, images);
      this._animationAssetCache.set(resource.id, {revision: resource.revision, reference});
      return reference;
    }
    animationAssetFreshFrames(args) {
      const resource = this._animationAsset(args.RESOURCE);
      if (!resource) return Scratch.BWValues.encode(undefined);
      // Start from authored data, never the shared (possibly mutated) cache.
      // Each evaluation owns its array, image handles, pixels and palettes.
      const images = resource.frames.map(frame => this._imageHandle({width: resource.width, height: resource.height,
        pixels: Uint8Array.from(frame.pixels), palette: resource.palette.slice()}));
      return Scratch.BWValues.arrayReference(this._runtime, images);
    }
    animationAssetInterval(args) {
      const resource = this._animationAsset(args.RESOURCE);
      return Scratch.BWValues.encode(resource ? resource.frames[0].durationMs : undefined);
    }
    runImageAnimation(args) {
      const sprite = this._spriteValues.get(String(args.ID));
      const frames = Scratch.BWValues.arrayValue(this._runtime, args.FRAMES);
      if (!sprite || !frames) {
        this._runtime?.emit?.('BLOCKS_ERROR', 'Arcade image animation requires a sprite and an image array reference.');
        return;
      }
      // Keep the actual source array: adding/replacing frames after starting is
      // observable in MakeCode. Resolve image handles only when displaying them.
      if (!this._animationUpdateOrder.includes('image')) this._animationUpdateOrder.push('image');
      this._imageAnimations.set(sprite, {frames, elapsed: 0, lastFrame: -1,
        interval: Number(Scratch.BWValues.decode(args.INTERVAL)) || 500,
        loop: Scratch.BWValues.truth(args.LOOP)});
    }
    stopAnimation(args) {
      const sprite = this._spriteValues.get(String(args.ID)), type = Number(args.TYPE);
      if (!sprite) return;
      if (type === 0 || type === 1) {
        this._imageAnimations.delete(sprite);
        sprite._action = -1;
      }
      // Movement animations remain a named conversion gap until their complete
      // path engine is implemented. Type 2 does not stop image animations.
    }
    _advanceAnimations(dt) {
      const state = this._state();
      // Frame handlers at equal priority run in registration order. The two
      // animation libraries register on their first use, not on extension load.
      for (const group of this._animationUpdateOrder) {
        if (group === 'legacy') for (const id of this._activeLegacyAnimations) {
          const animation=this._animations.get(id);
          if (this._globalElapsedMs - animation.lastTime >= animation.interval && animation.frames.length) {
            animation.index = (animation.index + 1) % animation.frames.length;
            animation.lastTime = this._globalElapsedMs;
          }
          animation.sprites = animation.sprites.filter(sprite => !sprite._destroyed);
          for (const sprite of animation.sprites) {
            const image = animation.frames[animation.index];
            if (sprite._action === animation.action && image && sprite.image !== image)
              this.setSpriteImage({ID: sprite.id, IMAGE: this._imageHandle(image)});
          }
        }
        if (group === 'image') for (const [sprite, animation] of this._imageAnimations) {
          if (state.sprites[sprite.id] !== sprite) {this._imageAnimations.delete(sprite); continue;}
          animation.elapsed += dt * 1000;
          const index = Math.floor(animation.elapsed / animation.interval);
          if (animation.lastFrame !== index && animation.frames.length) {
            if (!animation.loop && index >= animation.frames.length) {this._imageAnimations.delete(sprite); continue;}
            const image = this._image(animation.frames[index % animation.frames.length]);
            if (image && sprite.image !== image) this.setSpriteImage({ID: sprite.id, IMAGE: this._imageHandle(image)});
          }
          animation.lastFrame = index;
        }
      }
    }
    setSpriteImage(args) {
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID), image = this._image(args.IMAGE);
      if (!sprite || !image) return;
      // Keep the same private skin while image frames change. Restoring the
      // authored costume and creating a fresh asynchronous SVG skin here can
      // expose a blank frame; costume changes/destruction/reset own restoration.
      sprite.image = image;
      delete sprite._wallHitbox;
      sprite._imageWidth=image.width;sprite._imageHeight=image.height;this._recalcSpriteSize(sprite);
      this._clampSprite(sprite); this._positionSprite(sprite.id);
      if(this._sprite(sprite.id))this._renderSpriteImage(sprite.id);
    }
    _refreshImage(image) {
      // Object identity is intentional: aliases share pixels, equal literals do not.
      if (this._state().backgroundImage === image) this._renderBackgroundImage();
      const map = this._state().tilemap;
      if (map && (map.mapImage === image || map.images.includes(image) || map.views.includes(image))) this._renderTilemap();
      for (const sprite of Object.values(this._state().sprites)) {
        if (sprite.image === image) this._renderSpriteImage(sprite.id);
      }
    }
    mutateSpriteImage(args) {
      const image = this._imageForSprite(args.ID);
      if (image && imageEngine.mutate(image, String(args.OP), args.COLOR, args.TO)) this._refreshImage(image);
    }
    setSpritePixel(args) {
      const image = this._imageForSprite(args.ID);
      if (image) { imageEngine.draw(image, 'setPixel', args.X, args.Y, args.COLOR); this._refreshImage(image); }
    }
    spritePixel(args) {
      const image = this._imageForSprite(args.ID);
      return image ? imageEngine.getPixel(image, args.X, args.Y) : 0;
    }
    drawSpriteImage(args) {
      const image = this._imageForSprite(args.ID);
      if (image && ['fillRect', 'drawLine'].includes(String(args.OP))) {
        imageEngine.draw(image, String(args.OP), args.X, args.Y, args.W, args.H, args.COLOR);
        this._refreshImage(image);
      }
    }
    _composeSceneFrame() {
      const state=this._state();
      // This internal scene raster is not the global PXT screen. Snapshot
      // reporters remain unavailable until all renderable layers are covered.
      const frame=state.sceneFrame || (state.sceneFrame={width:160,height:120,pixels:new Uint8Array(160*120)});
      const layers=[],missingSpriteImages=[];
      const tilemap=state.tilemap;
      if(tilemap && (!tilemap.legacy || tilemap.mapImage)) {
        const renderable=this._ensureTilemapRenderable(tilemap.legacy?'legacy':'modern');
        layers.push({image:this._tilemapRaster(tilemap),x:0,y:0,z:renderable.z,id:renderable.pxtId});
      }
      for(const sprite of Object.values(state.sprites)) {
        if(sprite.invisible || sprite._destroyed)continue;
        const source=sprite.image || this._imageForSprite(sprite.id,{quiet:true});
        if(!source){missingSpriteImages.push(sprite.id);continue;}
        const speech=this._speech.get(sprite.id);
        if(speech && !speech.legacy && speech.raster)
          layers.push({image:speech.raster,writes:speech.raster.writes,x:0,y:0,z:sprite.z,id:sprite.pxtId});
        const window=this._spriteRasterWindow(sprite),view=this._spriteViewPosition(sprite);
        layers.push({image:this._scaledSpriteImage(sprite,window),
          x:view.x-sprite.width/2+window.x,y:view.y-sprite.height/2+window.y,
          z:sprite.z,id:sprite.pxtId});
      }
      imageEngine.composeFrame(frame,state.backgroundColor,state.backgroundImage,layers);
      frame.coverage=['background','tilemap','sprites','modernSpeech'];
      frame.remaining=['renderables','hud','legacySpeech','effects'];
      frame.missingSpriteImages=missingSpriteImages;
      frame.sequence=(frame.sequence || 0)+1;
      return frame;
    }
    _scalePixelTarget(target) {
      target.setSize?.(75);
      // Scratch enforces a five-display-pixel minimum; Arcade allows 1x1
      // images, which must still occupy exactly three stage pixels.
      if (target.size !== 75) {
        target.size = 75;
        this._runtime?.renderer?.updateDrawableProperties?.(target.drawableID, {scale: [75, 75]});
      }
    }
    _spriteRasterWindow(sprite){
      const view=this._spriteViewPosition(sprite),left=view.x-sprite.width/2,top=view.y-sprite.height/2;
      const fullWidth=Math.max(0,sprite.width|0),fullHeight=Math.max(0,sprite.height|0);
      // __drawCore culls using logical bounds before scattering the image.
      const camera=this._camera(),relative=!!(sprite.flags & spriteFlags.RelativeToCamera);
      const logicalLeft=sprite._fx/256-(relative?0:camera.drawOffsetX),logicalTop=sprite._fy/256-(relative?0:camera.drawOffsetY);
      if(logicalLeft+sprite.width<0 || logicalTop+sprite.height<0 || logicalLeft>160 || logicalTop>120)
        return {x:0,y:0,width:0,height:0,key:'empty'};
      const bounds=sprite._rotatedBBox && sprite.image ? rotatedRasterFootprint(sprite.image,sprite.sx,sprite.sy,sprite.rotation) :
        {left:0,top:0,right:fullWidth-1,bottom:fullHeight-1};
      if(sprite._rotatedBBox && (left>=160 || top>=120 || left+bounds.cullWidth<0 || top+bounds.cullHeight<0))
        return {x:0,y:0,width:0,height:0,key:'empty'};
      const x=Math.max(bounds.left,-left),y=Math.max(bounds.top,-top);
      const width=Math.max(0,Math.min(bounds.right+1,160-left)-x),height=Math.max(0,Math.min(bounds.bottom+1,120-top)-y);
      // Completely hidden sprites share a single transparent skin, regardless
      // of their distance from the viewport. No raster grows with sprite scale.
      if(!width || !height)return {x:0,y:0,width:0,height:0,key:'empty'};
      return {x,y,width,height,key:[x,y,width,height,fullWidth,fullHeight].join(':')};
    }
    _scaledSpriteImage(sprite,window=this._spriteRasterWindow(sprite)){
      const source=sprite.image,{x,y,width,height}=window;
      if(sprite._rotatedBBox){
        return rotatedRasterWindow(source,sprite.sx,sprite.sy,sprite.rotation,window);
      }
      if(sprite._sx===256 && sprite._sy===256 && x===0 && y===0 && width===source.width && height===source.height)return source;
      const pixels=new Uint8Array(width*height);
      const fullWidth=Math.max(0,sprite.width|0),fullHeight=Math.max(0,sprite.height|0);
      const dx=((source.width<<16)/fullWidth)|0,dy=((source.height<<16)/fullHeight)|0;
      // PXT blit clips the destination first, then starts the 16.16 source
      // accumulator at clippedPixels * step. Sampling the cropped rectangle
      // as if it were a new resized image would change its pixels.
      for(let row=0,sy=y*dy;row<height;row++,sy+=dy)
        for(let col=0,sx=x*dx;col<width;col++,sx+=dx)
          pixels[row*width+col]=source.pixels[(sy>>16)*source.width+(sx>>16)];
      return {width,height,pixels};
    }
    // PXT Sprite.overlapsWith past the hitbox test, for a rotated sprite (\`a\`
    // is \`this\`): the rotated boxes first, then the simulator's pixel test,
    // with \`other\`'s image as the destination exactly as PXT passes it.
    _rotatedSpriteOverlap(a,b){
      if(!a._rotatedBBox)return this._rotatedSpriteOverlap(b,a);
      const ai=a.image||this._imageForSprite(a.id,{quiet:true}),bi=b.image||this._imageForSprite(b.id,{quiet:true});
      if(!ai || !bi)return true;
      // this.left - other.left, truncated by the helper's \`| 0\` (not each edge floored).
      const dx=((a._fx-b._fx)/256)|0,dy=((a._fy-b._fy)/256)|0;
      if(b._rotatedBBox){
        if(!a._rotatedBBox.overlaps(b._rotatedBBox))return false;
        return imageEngine.overlapsTwoScaledRotated(bi,dx,dy,b.sx,b.sy,b.rotation,ai,a.sx,a.sy,a.rotation);
      }
      const bl=b._fx/256,bt=b._fy/256;
      if(!a._rotatedBBox.overlapsAABB(bl,bt,bl+b.width,bt+b.height))return false;
      return imageEngine.overlapsScaledRotated(bi,dx,dy,ai,a.sx,a.sy,a.rotation);
    }
    _scaledSpriteOverlap(a,b,am,bm){
      if(!a.sx || !a.sy || !b.sx || !b.sy)return false;
      if(!(a.sx*a.sy<b.sx*b.sy)){const tmp=a;a=b;b=tmp;const mask=am;am=bm;bm=mask;}
      const x=((b._fx-a._fx)/256/a.sx)|0,y=((b._fy-a._fy)/256/a.sy)|0,w=(b.width/a.sx)|0,h=(b.height/a.sy)|0;
      const dx=((b._imageWidth<<16)/w)|0,dy=((b._imageHeight<<16)/h)|0,cx=Math.abs(Math.min(0,x)),cy=Math.abs(Math.min(0,y));
      for(let row=y+cy,sy=Math.max(0,cy*dy);row<Math.min(a._imageHeight,y+h) && sy<(b._imageHeight<<16);row++,sy+=dy)
        for(let col=x+cx,sx=Math.max(0,cx*dx);col<Math.min(a._imageWidth,x+w) && sx<(b._imageWidth<<16);col++,sx+=dx)
          if(am[row*a._imageWidth+col] && bm[(sy>>16)*b._imageWidth+(sx>>16)])return true;
      return false;
    }
    _orderSpriteDrawables() {
      const renderer=this._runtime?.renderer;
      if(!renderer?.setDrawableOrder)return;
      const state=this._state();
      // Arcade's z then creation order applies equally to native drawables and
      // template clones. Leave ordinary Scratch layering alone without a native sprite.
      if(!Object.keys(state.sprites).some(id=>this._imageSkins.get(id)?.drawableId!==undefined))return;
      const ordered=Object.values(state.sprites).sort((a,b)=>a.z-b.z || a.pxtId-b.pxtId);
      for(const sprite of ordered) {
        const drawable=this._imageSkins.get(sprite.id)?.drawableId ?? state.spriteTargets[sprite.id]?.drawableID;
        if(drawable!==undefined)renderer.setDrawableOrder(drawable,Infinity,'sprite');
      }
    }
    _renderSpriteImage(id,window) {
      const sprite = this._sprite(id), target = this._state().spriteTargets[id];
      sprite.mask = sprite.image.pixels.map(color => color ? 1 : 0);
      const renderer = this._runtime?.renderer;
      if (renderer) {
        if(target?.drawableID!=null)this._scalePixelTarget(target);
        window=window || this._spriteRasterWindow(sprite);
        const rendered=this._scaledSpriteImage(sprite,window);
        const svg = imageEngine.svg(rendered.width && rendered.height ? rendered :
          {width: 1, height: 1, pixels: new Uint8Array(1)}, this._imagePalette(sprite.image));
        const center = [window.width * 2, window.height * 2];
        let entry = this._imageSkins.get(sprite.id);
        if (!entry) {
          entry = {target, skinId: renderer.createSVGSkin(svg, center),windowKey:window.key};
          if(target?.drawableID==null)entry.drawableId=renderer.createDrawable('sprite');
          this._imageSkins.set(sprite.id, entry);
          const drawable=entry.drawableId ?? target.drawableID;
          renderer.updateDrawableSkinId(drawable, entry.skinId);
          if(entry.drawableId!==undefined) {
            renderer.updateDrawableScale(drawable,[75,75]);
            renderer.updateDrawableVisible(drawable,!sprite.invisible);
          }
          this._orderSpriteDrawables();
        } else {renderer.updateSVGSkin(entry.skinId, svg, center);entry.windowKey=window.key;}
        this._positionSprite(id);
        this._runtime.requestRedraw?.();
      }
      this._changed();
    }
    setSpriteCostume(args) {
      const id = String(args.ID);
      const target = this._state().spriteTargets[id];
      const index = Number(args.COSTUME);
      if (!target || !target.setCostume || !Number.isFinite(index)) return;
      this._clearImage(id);
      target.setCostume(Math.round(index));
      const sprite = this._sprite(id);
      if (sprite) {
        delete sprite.image;
        sprite.costume = target.currentCostume;
        const size = this._costumeImageSize(target.getCostumes && target.getCostumes()[target.currentCostume]);
        if (size) {
          sprite._imageWidth=size.width;sprite._imageHeight=size.height;this._recalcSpriteSize(sprite);
          sprite.mask = this._costumePixelMask(target.getCostumes()[target.currentCostume], size);
          this._clampSprite(sprite);
          this._positionSprite(id);this._renderSpriteImageIfPresent(sprite);
        } else sprite.mask = null;
      }
      this._changed();
    }
    spriteToString(args) {
      const sprite = this._spriteValues.get(String(args.ID));
      if (!sprite) {
        this._runtime?.emit?.('BLOCKS_ERROR', 'Arcade sprite text requires a live or destroyed sprite from this project.');
        return '';
      }
      return sprite.pxtId + '(' + sprite.x + ',' + sprite.y + ')->(' + sprite.vx + ',' + sprite.vy + ')';
    }
    spriteProperty(args, util) {
      const event = util?.thread?.bwArcadeEvent;
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID) ||
        (event?.first === String(args.ID) ? event.destroyedSprite : null);
      if (!sprite) return 0;
      const property = String(args.PROPERTY);
      if (property === 'left') return sprite._fx / 256;
      if (property === 'right') return sprite._fx / 256 + sprite.width;
      if (property === 'top') return sprite._fy / 256;
      if (property === 'bottom') return sprite._fy / 256 + sprite.height;
      return Object.prototype.hasOwnProperty.call(sprite, property) ? sprite[property] : 0;
    }
    setSpriteKind(args) {
      const sprite = this._spriteValues.get(String(args.ID)) || this._sprite(args.ID);
      if (sprite && sprite.kind !== String(args.KIND)) {
        sprite.kind = String(args.KIND); sprite._kindInsertion = ++this._kindInsertion; this._changed();
      }
    }
    spriteOverlaps(args) {
      const a = this._spriteValues.get(String(args.A)) || this._sprite(args.A), b = this._spriteValues.get(String(args.B)) || this._sprite(args.B);
      if (!a || !b || a._destroyed || b._destroyed || a === b || (a.flags|b.flags)&(spriteFlags.GhostThroughSprites|spriteFlags.RelativeToCamera) ||
        Math.abs(a.x - b.x) * 2 >= a.width + b.width ||
        Math.abs(a.y - b.y) * 2 >= a.height + b.height) return false;
      const ab=this._wallHitbox(a),bb=this._wallHitbox(b);
      const al=a._fx+ab.left*256,ar=al+(ab.width-1)*256,at=a._fy+ab.top*256,ad=at+(ab.height-1)*256;
      const bl=b._fx+bb.left*256,br=bl+(bb.width-1)*256,bt=b._fy+bb.top*256,bd=bt+(bb.height-1)*256;
      if(al>br || at>bd || ar<bl || ad<bt)return false;
      if(a._rotatedBBox || b._rotatedBBox)return this._rotatedSpriteOverlap(a,b);
      const am = this._spriteMask(a), bm = this._spriteMask(b);
      if (!am || !bm) return true;
      if(a._sx!==256 || a._sy!==256 || b._sx!==256 || b._sy!==256)return this._scaledSpriteOverlap(a,b,am,bm);
      const dx = Math.trunc((a.x - a.width / 2) - (b.x - b.width / 2));
      const dy = Math.trunc((a.y - a.height / 2) - (b.y - b.height / 2));
      for (let y = 0; y < a.height; y++) {
        const by = y + dy;
        if (by < 0 || by >= b.height) continue;
        for (let x = 0; x < a.width; x++) {
          const bx = x + dx;
          if (bx >= 0 && bx < b.width && am[y * a.width + x] && bm[by * b.width + bx]) return true;
        }
      }
      return false;
    }
    // Tile locations are separate identity-bearing objects. Their coordinates
    // survive map replacement, while their pixel bounds use the current scale,
    // just like the pinned PXT Location getters.
    _tileLocation(value) {
      const id = Scratch.BWValues.referenceId(this._runtime, value, 'tile');
      return id === null ? null : this._tileLocations.get(id);
    }
    tileLocation(args) {
      const column = Scratch.BWValues.decode(args.COLUMN), row = Scratch.BWValues.decode(args.ROW);
      if (column === undefined || row === undefined || !this._state().tilemapInitialized) return Scratch.BWValues.encode(null);
      const id = 'arcade-tile:' + (++this._nextTileLocationId);
      this._tileLocations.set(id, {column: Number(column), row: Number(row)});
      return Scratch.BWValues.reference(this._runtime, 'tile', id);
    }
    _tileOffset(location, map) {
      if (!map || !location || location.column < 0 || location.row < 0 ||
        location.column >= map.columns || location.row >= map.rows) return -1;
      return (location.column | 0) + (location.row | 0) * map.columns;
    }
    _tileIndex(location, map) {
      const offset = this._tileOffset(location, map);
      return offset < 0 ? 0 : map.indices[offset];
    }
    tileLocationProperty(args) {
      const location = this._tileLocation(args.LOCATION);
      if (!location) return 0;
      const map = this._state().tilemap, size = map?.tileSize || this._state().tilemapScale || 16;
      const scale = Math.log2(size), x = location.column << scale, y = location.row << scale;
      switch (String(args.PROPERTY)) {
      case 'column': case 'col': return location.column;
      case 'row': return location.row;
      case 'x': return x + size / 2;
      case 'y': return y + size / 2;
      case 'left': return x;
      case 'top': return y;
      case 'right': return x + size;
      case 'bottom': return y + size;
      case 'tileSet': return map ? this._tileIndex(location, map) : 0;
      default: return 0;
      }
    }
    _tileImageIndex(map, image) {
      if (!map || !image) return -1;
      const index = map.images.findIndex(candidate => candidate.width === image.width &&
        candidate.height === image.height && candidate.pixels.length === image.pixels.length &&
        candidate.pixels.every((pixel, i) => pixel === image.pixels[i]));
      if (index >= 0) return index;
      if (map.images.length >= 256) return -1;
      map.images.push(image);return map.images.length - 1;
    }
    _tileImage(map, index) {
      if (map?.legacy) {
        let definition=map.definitions[index];
        if (!definition) {
          const size=map.tileSize,pixels=new Uint8Array(size*size);pixels.fill(index);
          const image={width:size,height:size,pixels};
          definition=map.definitions[index]={image,wall:false};map.images[index]=image;
        }
        const image=definition.image,size=map.tileSize;
        if (!definition.view || definition.view.width!==size) {
          if (image.width===size && image.height===size) definition.view=image;
          else {
            const pixels=new Uint8Array(size*size);
            for(let y=0;y<Math.min(size,image.height);y++)for(let x=0;x<Math.min(size,image.width);x++)pixels[y*size+x]=image.pixels[y*image.width+x];
            definition.view={width:size,height:size,pixels};
          }
        }
        return definition.view;
      }
      const image = map?.images[index];
      if (!image) return null;
      if (image.width <= map.tileSize && image.height <= map.tileSize) return image;
      if (!map.views[index]) {
        const size = map.tileSize, pixels = new Uint8Array(size * size);
        for (let y = 0; y < Math.min(size, image.height); y++)
          for (let x = 0; x < Math.min(size, image.width); x++) pixels[y*size+x] = image.pixels[y*image.width+x];
        map.views[index] = {width:size, height:size, pixels};
      }
      return map.views[index];
    }
    tilesOfType(args) {
      const map = this._state().tilemap, index = this._tileImageIndex(map, this._image(args.IMAGE));
      const locations = [];
      if (index >= 0) for (let column = 0; column < map.columns; column++)
        for (let row = 0; row < map.rows; row++) if (map.indices[row*map.columns+column] === index)
          locations.push(this.tileLocation({COLUMN:column, ROW:row}));
      return Scratch.BWValues.arrayReference(this._runtime, locations);
    }
    tileAtLocation(args) {
      const map = this._state().tilemap, location = this._tileLocation(args.LOCATION);
      if (!map || !location) return this._imageHandle({width:0,height:0,pixels:new Uint8Array(0)});
      return this._imageHandle(this._tileImage(map, this._tileIndex(location, map)));
    }
    tileIs(args) {
      const map = this._state().tilemap, location = this._tileLocation(args.LOCATION), image = this._image(args.IMAGE);
      return Boolean(map && location && image && this._tileIndex(location,map) === this._tileImageIndex(map,image));
    }
    tileIsWall(args) {
      const map = this._state().tilemap, location = this._tileLocation(args.LOCATION);
      if (!map || !location || (map.legacy && !map.mapImage)) return false;
      const offset = this._tileOffset(location,map);
      if(map.legacy && map.mapImage && offset>=0 && !map.definitions[map.indices[offset]])return Scratch.BWValues.encode(undefined);
      return offset < 0 || Boolean(map.walls[offset]);
    }
    setTileAt(args) {
      const map = this._state().tilemap, location = this._tileLocation(args.LOCATION), image = this._image(args.IMAGE);
      if (!map || !location || !image) return;
      const index = this._tileImageIndex(map,image), scale = Math.log2(map.tileSize);
      const offset = this._tileOffset({column: ((location.column << scale) + map.tileSize/2) >> scale,
        row: ((location.row << scale) + map.tileSize/2) >> scale},map);
      if (index >= 0 && offset >= 0) {map.indices[offset] = index;this._renderTilemap();this._changed();}
    }
    setWallAt(args) {
      const map = this._state().tilemap, location = this._tileLocation(args.LOCATION);
      if (!map || !location) return;
      const scale = Math.log2(map.tileSize), offset = this._tileOffset({column: ((location.column << scale)+map.tileSize/2) >> scale,
        row: ((location.row << scale)+map.tileSize/2) >> scale},map);
      if (offset >= 0) {map.walls[offset] = Boolean(Scratch.BWValues.decode(args.WALL));this._changed();}
    }
    placeOnTile(args, util) {
      if (!this._tileLocation(args.LOCATION)) return;
      return this.setSpritePosition({ID:args.ID, X:this.tileLocationProperty({...args,PROPERTY:'x'}),
        Y:this.tileLocationProperty({...args,PROPERTY:'y'})},util);
    }
    placeOnRandomTile(args, util) {
      const map = this._state().tilemap, index = this._tileImageIndex(map,this._image(args.IMAGE));
      if (index < 0) return;
      // PXT uses reservoir sampling with size one, visiting columns first.
      let chosen = null, count = 0;
      for (let column = 0; column < map.columns; column++) for (let row = 0; row < map.rows; row++)
        if (map.indices[row*map.columns+column] === index) {
          if (count === 0 || Math.floor(Math.random()*(count+1)) === 0) chosen = {COLUMN:column,ROW:row};
          count++;
        }
      if (chosen) return this.placeOnTile({ID:args.ID,LOCATION:this.tileLocation(chosen)},util);
    }
    // Legacy Tile retains its creating map; modern Location resolves the
    // current scene. Keep separate reference kinds even though both use cells.
    _legacyTile(value) {
      const id=Scratch.BWValues.referenceId(this._runtime,value,'legacy-tile');
      return id===null?null:this._tileLocations.get(id);
    }
    legacyTileLocation(args) {
      const map=this._legacyMap(),id='arcade-legacy-tile:'+(++this._nextTileLocationId);
      this._tileLocations.set(id,{column:Number(Scratch.BWValues.decode(args.COLUMN)),row:Number(Scratch.BWValues.decode(args.ROW)),map});
      return Scratch.BWValues.reference(this._runtime,'legacy-tile',id);
    }
    legacyTileProperty(args) {
      const tile=this._legacyTile(args.TILE);if(!tile)return 0;
      const scale=Math.log2(tile.map.tileSize);
      switch(String(args.PROPERTY)) {
      case 'x':return (tile.column<<scale)+(1<<(scale-1));
      case 'y':return (tile.row<<scale)+(1<<(scale-1));
      case 'tileSet':
        if(!tile.map.mapImage)throw new TypeError('Cannot read a legacy Tile index while its map is disabled');
        return imageEngine.getPixel(tile.map.mapImage,tile.column,tile.row);
      default:return 0;
      }
    }
    legacyTilesOfType(args) {
      const map=this._legacyMap(),index=Number(Scratch.BWValues.decode(args.INDEX)),result=[];
      this._syncLegacyMap(map);
      if(map.mapImage && index>=0 && index<=15)for(let column=0;column<map.columns;column++)
        for(let row=0;row<map.rows;row++)if(map.indices[row*map.columns+column]===index)
          result.push(this.legacyTileLocation({COLUMN:column,ROW:row}));
      return Scratch.BWValues.arrayReference(this._runtime,result);
    }
    setLegacyTileAt(args) {
      const map=this._legacyMap(),tile=this._legacyTile(args.TILE),index=Number(Scratch.BWValues.decode(args.INDEX));
      if(!tile || !map.mapImage || index<0 || index>15)return;
      const scale=Math.log2(map.tileSize),column=this.legacyTileProperty({...args,PROPERTY:'x'})>>scale,
        row=this.legacyTileProperty({...args,PROPERTY:'y'})>>scale;
      imageEngine.draw(map.mapImage,'setPixel',column,row,index);this._refreshImage(map.mapImage);
    }
    placeOnLegacyTile(args,util) {
      if(!this._legacyTile(args.TILE))return;
      return this.setSpritePosition({ID:args.ID,X:this.legacyTileProperty({...args,PROPERTY:'x'}),Y:this.legacyTileProperty({...args,PROPERTY:'y'})},util);
    }
    placeOnRandomLegacyTile(args,util) {
      // The original checks sprite/map before lookup (which can create a map).
      if(!this._sprite(args.ID) || !this._state().tilemap)return;
      const values=Scratch.BWValues.arrayValue(this._runtime,this.legacyTilesOfType(args));
      if(values.length)return this.placeOnLegacyTile({ID:args.ID,TILE:values[Math.floor(Math.random()*values.length)]},util);
    }
    _ensureTilemapRenderable(kind) {
      const state=this._state();
      if(!state.tilemapRenderable || state.tilemapRenderable.kind!==kind)
        state.tilemapRenderable={kind,z:-1,pxtId:state.nextSpriteId++};
      return state.tilemapRenderable;
    }
    _legacyMap() {
      const state=this._state();
      if(!state.tilemap?.legacy)state.tilemap={legacy:true,tileSize:16,columns:0,rows:0,indices:new Uint8Array(0),walls:new Uint8Array(0),images:[],views:[],definitions:[]};
      this._ensureTilemapRenderable('legacy');
      state.tilemapInitialized=true;state.tilemapScale=state.tilemap.tileSize;
      return state.tilemap;
    }
    _syncLegacyMap(map) {
      if(!map?.legacy)return;
      map.columns=map.mapImage?.width || 0;map.rows=map.mapImage?.height || 0;
      map.indices=map.mapImage?.pixels || new Uint8Array(0);
      if(map.walls.length!==map.indices.length)map.walls=new Uint8Array(map.indices.length);
      for(let i=0;i<map.indices.length;i++)map.walls[i]=map.definitions[map.indices[i]]?.wall?1:0;
    }
    setLegacyTilemap(args) {
      const value=Scratch.BWValues.decode(args.IMAGE),image=this._image(args.IMAGE);
      const scale=Number(Scratch.BWValues.decode(args.SCALE));
      if(![2,3,4,5].includes(scale) || (!image && value!==null && value!==undefined))return;
      const map=this._legacyMap();map.mapImage=image || null;map.tileSize=1<<scale;
      this._state().tilemapScale=map.tileSize;this._syncLegacyMap(map);
      if (!this._background && this._runtime?.renderer) this.setBackgroundColor({COLOR:this.backgroundColor()});
      this._renderTilemap();this._changed();
    }
    setLegacyTile(args) {
      const map=this._legacyMap(),index=Number(Scratch.BWValues.decode(args.INDEX)),image=this._image(args.IMAGE);
      if(!Number.isInteger(index) || index<0 || index>15 || !image)return;
      map.definitions[index]={image,wall:!!Scratch.BWValues.decode(args.WALL)};map.images[index]=image;
      this._syncLegacyMap(map);this._renderTilemap();this._changed();
    }
    setTilemap(args) {
      const decoded = Scratch.BWValues.decode(args.DATA);
      if (decoded === null || decoded === '') {this._ensureTilemapRenderable('modern');delete this._state().tilemap;this._clearTilemap();this._changed();return;}
      let data;
      try {
        data = JSON.parse(String(decoded));
        if (data === null) {this._ensureTilemapRenderable('modern');delete this._state().tilemap;this._clearTilemap();this._changed();return;}
        if (!Number.isInteger(data.columns) || !Number.isInteger(data.rows) || data.columns < 0 || data.rows < 0 ||
          data.columns > 65535 || data.rows > 65535 || ![4,8,16,32].includes(data.tileSize) ||
          !Array.isArray(data.indices) || data.indices.length !== data.columns*data.rows ||
          !Array.isArray(data.walls) || data.walls.length !== data.indices.length ||
          !Array.isArray(data.images) || data.images.length > 256) throw Error('Invalid tilemap data');
        for (const index of data.indices) if (!Number.isInteger(index) || index < 0 || index > 255) throw Error('Invalid tile index');
        data.images = data.images.map(image => {
          if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 0 || image.height < 0 ||
            !Array.isArray(image.pixels) || image.pixels.length !== image.width*image.height ||
            image.pixels.some(pixel => !Number.isInteger(pixel) || pixel < 0 || pixel > 15)) throw Error('Invalid tile image');
          return {width:image.width,height:image.height,pixels:Uint8Array.from(image.pixels)};
        });
        data.indices = Uint8Array.from(data.indices);
        data.walls = Uint8Array.from(data.walls,wall => wall ? 1 : 0);
        data.views = [];
      } catch (error) {
        this._runtime?.emit?.('BLOCKS_ERROR',{message:error.message,extensionId:'arcade',opcode:'setTilemap'});return;
      }
      this._ensureTilemapRenderable('modern');
      this._state().tilemap = data;
      this._state().tilemapInitialized = true;
      this._state().tilemapScale = data.tileSize;
      if (!this._background && this._runtime?.renderer) this.setBackgroundColor({COLOR:this.backgroundColor()});
      this._renderTilemap();this._changed();
    }
    _tilemapRaster(map) {
      this._syncLegacyMap(map);
      const image={width:160,height:120,pixels:new Uint8Array(160*120)};
      if(map.legacy && !map.mapImage)return image;
      const camera=this._camera(),size=map.tileSize,scale=Math.log2(size);
      const offsetX=camera.drawOffsetX & (size-1),offsetY=camera.drawOffsetY & (size-1);
      const firstX=Math.max(0,camera.drawOffsetX>>scale),firstY=Math.max(0,camera.drawOffsetY>>scale);
      const lastX=Math.min(map.columns,((camera.drawOffsetX+160)>>scale)+1);
      const lastY=Math.min(map.rows,((camera.drawOffsetY+120)>>scale)+1);
      // PXT draws inclusive bounds, using tile zero outside the map. Iterate
      // tiles rather than RGB pixels, preserving cached padded legacy images.
      for(let column=firstX;column<=lastX;column++)for(let row=firstY;row<=lastY;row++) {
        const index=column<0 || row<0 || column>=map.columns || row>=map.rows?0:map.indices[row*map.columns+column];
        const tile=this._tileImage(map,index);
        if(tile?.width && tile?.height)imageEngine.blit(image,tile,'drawTransparentImage',
          ((column-firstX)<<scale)-offsetX,((row-firstY)<<scale)-offsetY);
      }
      return image;
    }
    _renderTilemap(presentLegacy=false) {
      const map = this._state().tilemap;
      if (!map) {this._clearTilemap();return;}
      this._syncLegacyMap(map);
      // Legacy defaults allocate during drawing, after source setters/queries.
      // Image mutation marks a redraw, without moving that allocation earlier.
      if(map.legacy && !presentLegacy){map.needsRender=true;return;}
      if(map.legacy && !map.needsRender)return;
      if(map.legacy)map.needsRender=false;
      if(map.legacy && !map.mapImage){this._clearTilemap();return;}
      // The screen view is separate from scene.backgroundImage(), which must
      // remain editable and observable without including the tile layer.
      const image=this._tilemapRaster(map);
      map.image = image;
      const renderer = this._runtime?.renderer;
      if (!renderer) return;
      const svg = imageEngine.svg(image,this._imagePalette(image));
      if (!this._tilemapDrawable) {
        const skin = renderer.createSVGSkin(svg,[320,240]), drawable = renderer.createDrawable('background');
        renderer.updateDrawableSkinId(drawable,skin);renderer.updateDrawableScale(drawable,[75,75]);
        renderer.updateDrawablePosition(drawable,[0,0]);this._tilemapDrawable = {skin,drawable};
      } else renderer.updateSVGSkin(this._tilemapDrawable.skin,svg,[320,240]);
      this._orderBackgroundLayers();
      this._runtime.requestRedraw?.();
    }
    _clearTilemap() {
      const renderer = this._runtime?.renderer;
      if (this._tilemapDrawable) {
        renderer?.destroyDrawable(this._tilemapDrawable.drawable,'background');renderer?.destroySkin(this._tilemapDrawable.skin);
        this._tilemapDrawable = null;
      }
    }
    spritesOfKind(args) {
      const sprites = Object.values(this._state().sprites).filter(s => !s._destroyed && s.kind === String(args.KIND))
        .sort((a, b) => a._kindInsertion - b._kindInsertion);
      return Scratch.BWValues.arrayReference(this._runtime, sprites.map(s => s.id));
    }
    spriteCount(args) {
      return Object.values(this._state().sprites).filter(s => !s._destroyed && s.kind === String(args.KIND)).length;
    }
    whenSpriteCreated(args, util) {
      const event = this._currentEvent || (util && util.thread && util.thread.bwArcadeEvent);
      return Boolean(event && String(event.KIND) === String(args.KIND));
    }
    whenSpriteDestroyed(args, util) {
      const event = this._currentEvent || (util && util.thread && util.thread.bwArcadeEvent);
      return Boolean(event && String(event.KIND) === String(args.KIND));
    }
    whenRegisteredCreated(args, util) {
      const event = util?.thread?.bwArcadeEvent;
      return Boolean(event && String(event.TOKEN) === String(args.TOKEN));
    }
    whenRegisteredDestroyed(args, util) {
      const event = this._currentEvent || (util && util.thread && util.thread.bwArcadeEvent);
      return Boolean(event && String(event.TOKEN) === String(args.TOKEN));
    }
    whenSpritesOverlap(args, util) {
      const event = this._currentEvent || (util && util.thread && util.thread.bwArcadeEvent);
      const first=this._spriteValues.get(event?.first),second=this._spriteValues.get(event?.second);
      return Boolean(event && first && second && !first._destroyed && !second._destroyed && !((first.flags|second.flags)&(spriteFlags.GhostThroughSprites|spriteFlags.RelativeToCamera)) && String(event.A)===String(args.A) && String(event.B)===String(args.B));
    }
    eventSprite(args, util) {
      return util && util.thread && util.thread.bwArcadeEvent?.[args.WHICH] || '';
    }
    whenInterval(args, util) {
      const block = util?.thread?.topBlock;
      if (!block) return false;
      const state = this._state();
      if (!state.intervalDue) state.intervalDue = {};
      if (!state.intervalPeriods) state.intervalPeriods = {};
      const key = (util.target?.id || '') + ':' + block;
      const period = state.intervalPeriods[key] || Math.max(1000 / 30, Number(args.PERIOD) || 0);
      state.intervalPeriods[key] = period;
      if (state.intervalDue[key] === undefined) state.intervalDue[key] = period;
      const now = state.elapsedMs || 0;
      if (now + 1e-6 < state.intervalDue[key]) return false;
      state.intervalDue[key] += (Math.floor((now - state.intervalDue[key]) / period) + 1) * period;
      return true;
    }
    whenUpdate() { return true; }
    _startFrameHats() {
      if (!this._runtime?.startHats) return;
      this._runtime.startHats('arcade_whenInterval');
      this._runtime.startHats('arcade_whenUpdate');
    }
    _advance(dt) {
      if(this._terrainStopped || this._dialogs?.[0]?.type==='ask')return;
      const owner=this._state();
      const elapsed=(this._pendingSceneSeconds.get(owner) || 0)+dt;
      this._pendingSceneSeconds.set(owner,elapsed);
      const existing=this._sceneFrames.get(owner);if(existing)return existing;
      this._pendingSceneSeconds.delete(owner);
      const epoch=this._terrainEpoch,result=this._runTerrainGenerator(this._advanceFrameSteps(elapsed));
      if(result?.then){
        const pending=result.catch(error=>this._runtime?.emit?.('BLOCKS_ERROR',error.message)).finally(()=>{if(this._sceneFrames.get(owner)===pending)this._sceneFrames.delete(owner);if(this._terrainFrame===pending && epoch===this._terrainEpoch)this._terrainFrame=null;});
        this._sceneFrames.set(owner,pending);if(this._state()===owner)this._terrainFrame=pending;return pending;
      }
      return result;
    }
    *_advanceFrameSteps(dt) {
      const epoch=this._terrainEpoch;
      const state = this._state();
      this._globalElapsedMs+=dt*1000;
      state.elapsedMs = (state.elapsedMs || 0) + dt * 1000;
      yield* this._sceneButtons(dt);if(this._state()!==state)return;
      if (state.countdownActive) {
        state.countdown = Math.max(0, (Number(state.countdown) || 0) - dt);
        if (state.countdown <= 0) {
          state.countdownActive = false;
          state.countdown = 0;
          this._changed();
          if(this._countdownHandlers.length)yield* this._registeredCallbackSteps(this._countdownHandlers.slice(),'arcade_whenRegisteredCountdown',{});
          else {const threads=this._runtime?.startHats?.('arcade_whenCountdownEnds') || [];if(!threads.length)this.gameover();}
          return;
        }
      }
      const live = Object.values(state.sprites).filter(s => s.id);
      this._moveControlledSprites(live);yield* this._moveFollowingSpriteSteps();
      if(epoch!==this._terrainEpoch || this._state()!==state)return;
      if (!live.length && !state.physicsEngine.members.length) {yield* this._sceneUpdates();if(this._state()!==state)return;this._advanceAnimations(dt);this._updateCamera();if(state.tilemap?.legacy)this._renderTilemap(true);yield* this._lifeZeroSteps();if(this._state()!==state)return;this._advanceSpeech(dt);this._composeSceneFrame();this._startFrameHats();return;}
      yield* this._advancePhysicsSteps(state.physicsEngine.members.slice(),dt,state.tilemap);
      if(epoch!==this._terrainEpoch || this._state()!==state)return;
      for(const sprite of live)if(state.sprites[sprite.id])this._positionSprite(sprite.id);
      yield* this._sceneUpdates();if(this._state()!==state)return;
      this._advanceAnimations(dt);
      this._updateCamera();
      if(state.tilemap?.legacy)this._renderTilemap(true);
      for(const sprite of Object.values(state.sprites)){
        const camera=this._camera(),relative=!!(sprite.flags & spriteFlags.RelativeToCamera),ox=relative?0:camera.drawOffsetX,oy=relative?0:camera.drawOffsetY;
        if (sprite.autoDestroy && (sprite.x + sprite.width / 2 < ox ||
          sprite.x - sprite.width / 2 > ox+160 || sprite.y + sprite.height / 2 < oy ||
          sprite.y - sprite.height / 2 > oy+120)) {
          this.destroySprite({ID: sprite.id});
          continue;
        }
        if (sprite.lifespan > 0) {
          sprite.lifespan -= dt * 1000;
          if (sprite.lifespan <= 0) { this.destroySprite({ID: sprite.id}); continue; }
        }
      }
      yield* this._lifeZeroSteps();if(this._state()!==state)return;
      this._advanceSpeech(dt);
      this._composeSceneFrame();
      this._changed();
      this._startFrameHats();
    }
    gameover() {
      this._state().gameOver = true; this._changed();
      if (this._runtime && this._runtime.stopAll) this._runtime.stopAll();
    }
    whenCountdownEnds() { return true; }
    countdown(args) {
      const seconds = Math.max(0, Number(args.N) || 0);
      this._state().countdown = seconds; this._changed();
      return new Promise(resolve => setTimeout(() => { this._state().countdown = 0; this._changed(); resolve(); }, seconds * 1000));
    }
    startCountdown(args) {
      const state = this._infoState();
      state.countdown = Math.max(0, Number(args.N) || 0);
      state.countdownActive = true;
      this._changed();
    }
    stopCountdown() {
      const state = this._state();
      state.countdownActive = false;
      state.countdown = 0;
      this._changed();
    }
  }

  Scratch.extensions.register(new Arcade(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`, {
  createSpeechEngine: require('./speech'),
  initializeSpeech: require('./speech-pxt'),
  fonts: require('./speech-fonts.json'),
  createImageEngine: require('./image'),
  initializeImage: require('./image-pxt'),
  animationResourceMenuItems: require('../../../util/bw-animation-resource-menu'),
  initializeRotation: require('./rotation-pxt')
});
