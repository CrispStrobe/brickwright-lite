// Independently authored finite source fixtures. No external assets or packages.
export const referenceCases = {
  "sprite": {
    "source": "function isBefore(){return pending===undefined}let before=isBefore();let pending:Sprite;let unassigned=pending===undefined;let explicit:Sprite=null;let distinct=explicit!==pending;pending=sprites.create(img`1`,SpriteKind.Player);let alias=pending;let same=alias===pending;alias.x=23;let result=pending.x;before=!!before;unassigned=!!unassigned;distinct=!!distinct;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "same": true,
      "result": 23,
      "explicit": null
    }
  },
  "image": {
    "source": "function isBefore(){return pending===undefined}let before=isBefore();let pending:Image;let unassigned=pending===undefined;let explicit:Image=null;let distinct=explicit!==pending;pending=img`1`;let alias=pending;let same=alias===pending;alias.setPixel(0,0,3);let result=pending.getPixel(0,0);before=!!before;unassigned=!!unassigned;distinct=!!distinct;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "same": true,
      "result": 3,
      "explicit": null
    }
  },
  "array": {
    "source": "function isBefore(){return pending===undefined}let before=isBefore();let pending:number[];let unassigned=pending===undefined;let explicit:number[]=null;let distinct=explicit!==pending;pending=[1,2];let alias=pending;let same=alias===pending;alias[0]=3;let result=pending[0];before=!!before;unassigned=!!unassigned;distinct=!!distinct;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "same": true,
      "result": 3,
      "explicit": null
    }
  },
  "class": {
    "source": "class Box {value=1;constructor(){}}function isBefore(){return pending===undefined}let before=isBefore();let pending:Box;let unassigned=pending===undefined;let explicit:Box=null;let distinct=explicit!==pending;pending=new Box();let alias=pending;let same=alias===pending;alias.value=3;let result=pending.value;before=!!before;unassigned=!!unassigned;distinct=!!distinct;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "same": true,
      "result": 3,
      "explicit": null
    }
  },
  "unassigned-class": {
    "source": "class Box {value=1}function isBefore(){return pending===undefined}let before=isBefore();let pending:Box;let unassigned=pending===undefined;let explicit:Box=null;let distinct=explicit!==pending;before=!!before;unassigned=!!unassigned;distinct=!!distinct;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "explicit": null
    }
  },
  "callbacks": {
    "source": "let constructorBefore=false;let creationBefore=false;class Box {value=1;constructor(){}}class Trigger {constructor(){constructorBefore=pendingImage===undefined&&pendingArray===undefined&&pendingClass===undefined&&pendingSprite===undefined}}sprites.onCreated(SpriteKind.Player,function(sprite){creationBefore=pendingImage===undefined&&pendingArray===undefined&&pendingClass===undefined});let trigger=new Trigger();let pendingSprite=sprites.create(img`1`,SpriteKind.Player);pause(40);let pendingImage:Image=img`2`;let pendingArray:number[]=[1];let pendingClass:Box=new Box();let after=pendingImage!==undefined&&pendingArray!==undefined&&pendingClass!==undefined&&pendingSprite!==undefined;constructorBefore=!!constructorBefore;creationBefore=!!creationBefore;after=!!after;",
    "expected": {
      "constructorBefore": true,
      "creationBefore": true,
      "after": true
    }
  },
  "never-instantiated-class": {
    "source": "class Box {value:number;constructor(){}}function read(){return pending===undefined}let before=read();let pending:Box;let unassigned=pending===undefined;let explicit:Box=null;let distinct=explicit!==pending;before=!!before;unassigned=!!unassigned;distinct=!!distinct;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "explicit": null
    }
  },
  "namespace-class": {
    "source": "namespace N {export class Box {value=1;constructor(){}}}function read(){return pending===undefined}let before=read();let pending:N.Box;let unassigned=pending===undefined;let explicit:N.Box=null;let distinct=explicit!==pending;pending=new N.Box();let alias=pending;let same=alias===pending;alias.value=3;let result=pending.value;before=!!before;unassigned=!!unassigned;distinct=!!distinct;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "unassigned": true,
      "distinct": true,
      "same": true,
      "result": 3,
      "explicit": null
    }
  },
  "early-alias": {
    "source": "function read(){return alias===undefined}let before=read();let pending:Image;let alias=pending;let copiedUndefined=alias===undefined;pending=img`1`;let stillUndefined=alias===undefined;alias=pending;let same=alias===pending;alias.setPixel(0,0,3);let result=pending.getPixel(0,0);before=!!before;copiedUndefined=!!copiedUndefined;stillUndefined=!!stillUndefined;same=!!same;result+=0;",
    "expected": {
      "before": true,
      "same": true,
      "result": 3,
      "copiedUndefined": true,
      "stillUndefined": true
    }
  },
  "returned-reference": {
    "source": "function read():Image{return pending}let early=read();let before=early===undefined;let pending:Image=img`1`;let late=read();let after=late===pending;let stillUndefined=early===undefined;late.setPixel(0,0,3);let result=pending.getPixel(0,0);before=!!before;after=!!after;stillUndefined=!!stillUndefined;result+=0;",
    "expected": {
      "before": true,
      "result": 3,
      "after": true,
      "stillUndefined": true
    }
  }
};
