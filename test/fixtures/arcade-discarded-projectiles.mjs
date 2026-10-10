// Owned synthetic fixture: ignored creation results must still execute.
export const DISCARDED_PROJECTILE_SOURCE = `let __bwDiscardedProjectile1=42
let __arcadeCreated=19
let created=0
let colours=0
sprites.onCreated(SpriteKind.Projectile, function(s:Sprite) { created+=1; colours+=s.image.getPixel(0,0) })
sprites.onCreated(SpriteKind.Enemy, function(s:Sprite) { created+=1; colours+=s.image.getPixel(0,0) })
sprites.createProjectileFromSide(img\`2\`,0,0)
sprites.createProjectile(img\`3\`,0,0,SpriteKind.Enemy)
let origin=sprites.create(img\`4\`,SpriteKind.Player)
origin.setPosition(40,50)
sprites.createProjectileFromSprite(img\`5\`,origin,0,0)
let enemies=sprites.allOfKind(SpriteKind.Enemy).length
let projectiles=sprites.allOfKind(SpriteKind.Projectile).length
let protectedValue=__bwDiscardedProjectile1
let protectedCreatedValue=__arcadeCreated`;
