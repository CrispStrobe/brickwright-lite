export const explicitCallSource = `
let calls = 0
function show() {
    calls += 1
    scene.backgroundImage().fillRect(2, 3, 4, 5, 7)
}
function draw(x: number, y: number) {
    calls += x + y
    scene.backgroundImage().setPixel(x, y, 9)
}
show()
draw(4, 6)
show()
let proof = calls
let captured = scene.backgroundImage()
`;
