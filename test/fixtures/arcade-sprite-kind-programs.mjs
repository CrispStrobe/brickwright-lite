// Owned source fixtures; no copied corpus projects or art.
export const kindPrograms=Object.freeze({
 order:`let player=SpriteKind.Player
let projectile=SpriteKind.Projectile
let food=SpriteKind.Food
let enemy=SpriteKind.Enemy
player+=0;projectile+=0;food+=0;enemy+=0;
let before=sprites.create(img\`1\`,SpriteKind.Later)
let beforeKind=before.kind()
namespace SpriteKind {export const Unused=SpriteKind.create();}
let between=SpriteKind.create()
namespace SpriteKind {export const Later=SpriteKind.create();export const Alias=Later;}
let later=SpriteKind.Later
let alias=SpriteKind.Alias
let after=sprites.create(img\`2\`,SpriteKind.Later)
let afterKind=after.kind()
let calls=0
function nextKind(){calls+=1;return SpriteKind.create();}
let dynamic=sprites.create(img\`3\`,nextKind())
let dynamicKind=dynamic.kind()
let done=1;done+=0;`,
 numeric:`let hits=0
sprites.onCreated(-2.5,function(sprite){hits+=1;})
let negative=sprites.create(img\`1\`,-2.5)
let negativeKind=negative.kind()
let negativeCount=sprites.allOfKind(-2.5).length
let positive=sprites.create(img\`2\`,42.5)
let positiveKind=positive.kind()
let positiveCount=sprites.allOfKind(42.5).length
positive.setKind(null)
let unchangedKind=positive.kind()
let omitted=sprites.create(img\`3\`)
let omittedKind=omitted.kind()
let nulled=sprites.create(img\`4\`,null)
let nullKind=nulled.kind()
let done=1;done+=0;`,
 text:`namespace SpriteKind {export const Custom=SpriteKind.create();}
let textKind=SpriteKind.Text
let customKind=SpriteKind.Custom
let label=textsprite.create("A")
let observed=label.kind()
let next=SpriteKind.create()
let done=1;done+=0;`
});
