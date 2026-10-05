/** Typed inherited closure cells must not borrow another script's local type. */
const source=outerRead=>`
let actor=sprites.create(img\`1\`,SpriteKind.Player)
function forward(items:any[]){return items}
function install(){
 let sites=[tiles.getTileLocation(1,1)]
 scene.onHitWall(SpriteKind.Player,function(sprite,location){
  ${outerRead?'sprite.x=sites.length':''}
  scene.onOverlapTile(SpriteKind.Player,img\`2\`,function(other,touch){
   let chosen=forward(sites)
   tiles.setWallAt(chosen[0],false)
   other.setPosition(location.x,touch.y)
  })
 })
}
function unrelated(){
 let sites=[4,5]
 scene.onHitWall(SpriteKind.Food,function(sprite,location){sites.push(6)})
}
install()
unrelated()`;
export const TERRAIN_CAPTURE_ARRAY_SOURCE=source(true);
export const TERRAIN_CAPTURE_TRANSITIVE_SOURCE=source(false);
