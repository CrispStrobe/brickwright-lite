#import <AppKit/AppKit.h>

static NSSharingServicePicker *BrickwrightSharePicker;

void brickwright_share_file(const char *path) {
    if (path == NULL) return;
    NSString *value = [NSString stringWithUTF8String:path];
    if (value == nil) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        NSURL *url = [NSURL fileURLWithPath:value];
        NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
        NSView *view = window.contentView;
        if (view == nil) return;
        BrickwrightSharePicker = [[NSSharingServicePicker alloc] initWithItems:@[url]];
        NSRect anchor = NSMakeRect(NSMidX(view.bounds), NSMaxY(view.bounds) - 1, 1, 1);
        [BrickwrightSharePicker showRelativeToRect:anchor ofView:view preferredEdge:NSRectEdgeMinY];
    });
}
