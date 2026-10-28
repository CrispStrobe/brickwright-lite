let fontIdentity = false
let fontSelectionASCII = false
let fontSelectionWide = false
let fontScaleSame = false
let fontScaleNew = false
let fontScaledDataSame = false
let fontScaledWidth = 0
let fontScaledHeight = 0
let fontScaledMultiplier = 0
let fontMutationVisible = 0
let fontScaledMetricSnapshot = 0
let fontDataReplacementSame = false
let fontOldScaledDataSame = false
let font5Length = 0
let font8Length = 0
let font12Length = 0
let font5Hex = ""
let font8Hex = ""
let font12Hex = ""
let fontGlyphReadOnly = false
let fontGlyphBefore = 0
let fontGlyphAfter = 0
let fontGlyphRestore = 0
let fontPicture: Image
let fontMutatedPicture: Image
let fontMissingPicture: Image
function fontMatrix(): void {
    let small = image.font5
    let normal = image.font8
    let large = image.getFontForText("一")
    fontIdentity = small === image.font5
    fontSelectionASCII = image.getFontForText("ASCII") === normal
    fontSelectionWide = large === image.font12
    fontScaleSame = image.scaledFont(normal, 1.9) === normal
    let double = image.scaledFont(normal, 2.9)
    fontScaleNew = double !== normal
    fontScaledDataSame = double.data === normal.data
    fontScaledWidth = double.charWidth
    fontScaledHeight = double.charHeight
    fontScaledMultiplier = double.multiplier
    font5Length = small.data.length
    font8Length = normal.data.length
    font12Length = large.data.length
    font5Hex = small.data.toHex()
    font8Hex = normal.data.toHex()
    font12Hex = large.data.toHex()
    fontPicture = image.create(32, 24)
    fontPicture.print("A", 0, 0, 17, small)
    fontPicture.print("A", 8, 0, 3, double)
    fontPicture.printCenter("一", 12, 5, large)
    // Font fields are mutable; scaling snapshots metrics but shares data.
    let alias = normal
    let width = normal.charWidth
    normal.charWidth = 9
    fontMutationVisible = alias.charWidth
    fontScaledMetricSnapshot = double.charWidth
    normal.charWidth = width
    let oldData = normal.data
    let replacement = oldData.slice(0, oldData.length)
    normal.data = replacement
    fontDataReplacementSame = normal.data === replacement
    fontOldScaledDataSame = double.data === oldData
    normal.data = oldData
    fontGlyphReadOnly = normal.data.isReadOnly()
    let offset = (65 - 32) * 8 + 2
    fontGlyphBefore = normal.data.getNumber(NumberFormat.UInt8LE, offset)
    normal.data.setNumber(NumberFormat.UInt8LE, offset, fontGlyphBefore ^ 255)
    fontGlyphAfter = normal.data.getNumber(NumberFormat.UInt8LE, offset)
    fontMutatedPicture = image.create(32, 24)
    fontMutatedPicture.print("A", 0, 0, 7, normal)
    fontMutatedPicture.print("A", 8, 0, 9, double)
    normal.data.setNumber(NumberFormat.UInt8LE, offset, fontGlyphBefore)
    fontGlyphRestore = normal.data.getNumber(NumberFormat.UInt8LE, offset)
    fontMissingPicture = image.create(32, 24)
    fontMissingPicture.print("😀", 0, 0, 11, large)
}
fontMatrix()
