// Renderer backing dimensions can disappear during stage/project transitions.
// Always clear the display, then copy only a drawable backing canvas. The caller
// keeps scheduling frames so a restored stage appears without remounting the pane.
export const paintArcadeDeviceFrame = (destination, source) => {
    if (!destination) return;
    const context = destination.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#020617';
    context.fillRect(0, 0, destination.width, destination.height);
    if (source && source.width > 0 && source.height > 0) {
        context.drawImage(source, 0, 0, source.width, source.height, 0, 4, 160, 120);
    }
};
