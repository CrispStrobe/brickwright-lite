// Independently authored finite fixtures; no external resources.
export const arrayReferenceCases = {
  "numeric-literal": {
    "source": "function read(){return numbers}let before=read()===undefined;let numbers=[1,2];let alias=read();alias[0]=7;let same=alias===numbers;let value=numbers[0];before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 7
    }
  },
  "image-element": {
    "source": "function read(){return pictures}function first(values:Image[]){return values[0]}let before=read()===undefined;let pictures=[img`3`,img`5`];let alias=read();let selected=first(alias);selected.fill(7);let same=selected===pictures[0];let value=pictures[0].getPixel(0,0);before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 7
    }
  },
  "sprite-return": {
    "source": "function read(){return actors}function make(){return [sprites.create(img`2`,SpriteKind.Player)]}function pass(values:Sprite[]){return values}let before=read()===undefined;let actors=make();let alias=pass(actors);let selected=alias[0];selected.x=17;let same=alias===actors;let value=actors[0].x;before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 17
    }
  },
  "class-element": {
    "source": "class Box{value:number;constructor(value:number){this.value=value}}function read(){return boxes}function head(values:Box[]){return values[0]}let before=read()===undefined;let boxes=[new Box(2)];let selected=head(boxes);selected.value=9;let same=selected===boxes[0];let value=boxes[0].value;before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 9
    }
  },
  "typed-empty-missing": {
    "source": "function read(){return pictures}let before=read()===undefined;let pictures:Image[]=[];let selected=pictures[9];let missing=selected===undefined;let explicit:Image=null;let distinct=selected!==explicit;let picture=img`3`;pictures.push(picture);let returned=pictures.pop();let same=returned===picture;returned.fill(6);let value=picture.getPixel(0,0);before=!!before;missing=!!missing;distinct=!!distinct;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "missing": true,
      "distinct": true,
      "same": true,
      "value": 6
    }
  },
  "argument-write-alias": {
    "source": "function read(){return actors}function append(values:Sprite[],actor:Sprite){values.push(actor);return values}let before=read()===undefined;let actors:Sprite[]=[];let actor=sprites.create(img`2`,SpriteKind.Player);let alias=append(actors,actor);let same=alias===actors;let selected=actors[0];selected.y=31;let value=actor.y;before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 31
    }
  },
  "constructor-array-read": {
    "source": "class Trigger{constructor(){constructorBefore=read()===undefined}}function read(){return pictures}let constructorBefore=false;let trigger=new Trigger();let pictures=[img`3`];let after=read()===pictures;constructorBefore=!!constructorBefore;after=!!after;",
    "expected": {
      "constructorBefore": true,
      "after": true
    }
  },
  "numeric-function-return": {
    "source": "function read(){return numbers}function make():number[]{return [3,4]}function pass(values:number[]):number[]{return values}let before=read()===undefined;let numbers=make();let alias=pass(numbers);let same=alias===numbers;alias[1]=8;let value=numbers[1];before=!!before;same=!!same;value+=0;",
    "expected": {
      "before": true,
      "same": true,
      "value": 8
    }
  }
};

export const nullableArrayReferenceCase = {
  source: 'class Trigger{constructor(){constructorBefore=read()===undefined}}function read(){return selected}let before=read()===undefined;let constructorBefore=false;let trigger=new Trigger();let pictures=[img`3`];let selected=true?pictures:null;let picture=true?selected[0]:undefined;picture.fill(6);let same=selected===pictures;let value=pictures[0].getPixel(0,0);before=!!before;constructorBefore=!!constructorBefore;same=!!same;value+=0;',
  expected: {before:true,constructorBefore:true,same:true,value:6}
};
