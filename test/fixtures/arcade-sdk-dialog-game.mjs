// Owned source and text only; no private corpus art.
export const dialogOriginalSource = `let dialog = new game.SplashDialog(160,35)
dialog.setText("TITLE")
dialog.setSubtext("SUB")
dialog.update()
let initial = dialog.image
let sameImage = initial === dialog.image
let width = dialog.image.width
let height = dialog.image.height
let textColor = dialog.textColor
let cursorCount = dialog.cursorCount
dialog.resize(32.75,28.5)
let resized = dialog.image
let replaced = initial !== resized
dialog.update()
let resizedWidth = resized.width
let resizedHeight = resized.height
let oldWidth = initial.width
let oldHeight = initial.height`;

