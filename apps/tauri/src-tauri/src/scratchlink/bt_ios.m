// iOS Bluetooth-Classic shim via the ExternalAccessory (MFi) framework, for the
// EV3 (protocol "COM.LEGO.MINDSTORMS.EV3") and NXT ("com.lego.les"). iOS only
// exposes classic BT to MFi-certified accessories that are already paired in
// Settings, so `discover` enumerates connected MFi accessories that advertise a
// LEGO protocol. The channel is an EASession's input/output NSStreams; we pipe
// the EV3 Direct Command bytes through transparently (same bytes as desktop
// RFCOMM). Behind the same C ABI as bt_macos.m, called from bt_ios.rs.
//
// Requires UISupportedExternalAccessoryProtocols in Info.plist (added in CI).

#import <ExternalAccessory/ExternalAccessory.h>
#import <Foundation/Foundation.h>

typedef void (*bw_bt_device_cb)(const char *address, const char *name, int rssi, void *ctx);
typedef void (*bw_bt_data_cb)(const uint8_t *data, unsigned int len, void *ctx);
// event: 1 = connected, 0 = disconnected/closed, -1 = connect failed
typedef void (*bw_bt_event_cb)(int event, void *ctx);

static NSString *g_connect_id = nil; // accessory connectionID (as string)

@interface BWEaSession : NSObject <NSStreamDelegate>
@property(nonatomic) bw_bt_device_cb deviceCb;
@property(nonatomic) bw_bt_data_cb dataCb;
@property(nonatomic) bw_bt_event_cb eventCb;
@property(nonatomic) void *ctx;
@property(nonatomic, strong) EASession *session;
@property(nonatomic, strong) NSMutableData *outQueue;
@property(nonatomic, strong) NSThread *btThread;
@end

@implementation BWEaSession

- (void)runLoopMain {
    @autoreleasepool {
        NSRunLoop *rl = [NSRunLoop currentRunLoop];
        [rl addPort:[NSMachPort port] forMode:NSDefaultRunLoopMode];
        while (![[NSThread currentThread] isCancelled]) {
            @autoreleasepool {
                [rl runMode:NSDefaultRunLoopMode beforeDate:[NSDate distantFuture]];
            }
        }
    }
}

- (void)ensureThread {
    if (!self.btThread) {
        self.btThread = [[NSThread alloc] initWithTarget:self selector:@selector(runLoopMain) object:nil];
        [self.btThread start];
    }
}

- (void)onThread:(SEL)sel {
    [self ensureThread];
    [self performSelector:sel onThread:self.btThread withObject:nil waitUntilDone:NO];
}

// A LEGO protocol we understand, if any, on this accessory.
- (NSString *)legoProtocol:(EAAccessory *)acc {
    for (NSString *p in acc.protocolStrings) {
        NSString *lp = [p lowercaseString];
        if ([lp containsString:@"lego"] || [lp containsString:@"mindstorms"]) {
            return p;
        }
    }
    return nil;
}

// --- Discovery: enumerate connected MFi accessories with a LEGO protocol ---

- (void)listAccessories {
    @autoreleasepool {
        if (!self.deviceCb) return;
        NSArray<EAAccessory *> *accs = [[EAAccessoryManager sharedAccessoryManager] connectedAccessories];
        for (EAAccessory *acc in accs) {
            if ([self legoProtocol:acc] == nil) continue;
            NSString *idStr = [@(acc.connectionID) stringValue];
            const char *cid = [idStr UTF8String];
            const char *name = [acc.name UTF8String];
            self.deviceCb(cid ? cid : "", name ? name : "", 0, self.ctx);
        }
    }
}

// --- Connect: open an EASession on the accessory's LEGO protocol ---

- (void)connectSession {
    @autoreleasepool {
        NSInteger want = [g_connect_id integerValue];
        EAAccessory *found = nil;
        for (EAAccessory *acc in [[EAAccessoryManager sharedAccessoryManager] connectedAccessories]) {
            if (acc.connectionID == (uint32_t)want && [self legoProtocol:acc]) {
                found = acc;
                break;
            }
        }
        if (!found) {
            if (self.eventCb) self.eventCb(-1, self.ctx);
            return;
        }
        NSString *proto = [self legoProtocol:found];
        EASession *s = [[EASession alloc] initWithAccessory:found forProtocol:proto];
        if (!s) {
            if (self.eventCb) self.eventCb(-1, self.ctx);
            return;
        }
        self.session = s;
        self.outQueue = [NSMutableData data];
        s.inputStream.delegate = self;
        s.outputStream.delegate = self;
        [s.inputStream scheduleInRunLoop:[NSRunLoop currentRunLoop] forMode:NSDefaultRunLoopMode];
        [s.outputStream scheduleInRunLoop:[NSRunLoop currentRunLoop] forMode:NSDefaultRunLoopMode];
        [s.inputStream open];
        [s.outputStream open];
        if (self.eventCb) self.eventCb(1, self.ctx);
    }
}

- (void)stream:(NSStream *)stream handleEvent:(NSStreamEvent)event {
    switch (event) {
        case NSStreamEventHasBytesAvailable: {
            if (stream == self.session.inputStream) {
                uint8_t buf[512];
                NSInteger n = [(NSInputStream *)stream read:buf maxLength:sizeof(buf)];
                if (n > 0 && self.dataCb) {
                    self.dataCb(buf, (unsigned int)n, self.ctx);
                }
            }
            break;
        }
        case NSStreamEventHasSpaceAvailable:
            [self pump];
            break;
        case NSStreamEventEndEncountered:
        case NSStreamEventErrorOccurred:
            if (self.eventCb) self.eventCb(0, self.ctx);
            break;
        default:
            break;
    }
}

// Drain the out-queue into the output stream as space allows.
- (void)pump {
    NSOutputStream *os = self.session.outputStream;
    while (self.outQueue.length > 0 && os.hasSpaceAvailable) {
        NSInteger wrote = [os write:self.outQueue.bytes maxLength:self.outQueue.length];
        if (wrote <= 0) break;
        [self.outQueue replaceBytesInRange:NSMakeRange(0, wrote) withBytes:NULL length:0];
    }
}

- (void)enqueue:(NSData *)data {
    [self.outQueue appendData:data];
    [self pump];
}

- (void)closeSession {
    [self.session.inputStream close];
    [self.session.outputStream close];
    self.session = nil;
    self.outQueue = nil;
}

@end

// --- C ABI (mirrors bt_macos.m) ---

static BWEaSession *g_session = nil;

static BWEaSession *session(void) {
    if (!g_session) g_session = [[BWEaSession alloc] init];
    return g_session;
}

void bw_bt_discover(int major, int minor, bw_bt_device_cb cb, void *ctx) {
    (void)major;
    (void)minor;
    @autoreleasepool {
        BWEaSession *s = session();
        s.deviceCb = cb;
        s.ctx = ctx;
        [s onThread:@selector(listAccessories)];
    }
}

void bw_bt_stop_discover(void) {}

void bw_bt_connect(const char *address, bw_bt_data_cb data_cb, bw_bt_event_cb event_cb, void *ctx) {
    @autoreleasepool {
        BWEaSession *s = session();
        s.dataCb = data_cb;
        s.eventCb = event_cb;
        s.ctx = ctx;
        g_connect_id = [NSString stringWithUTF8String:address];
        [s onThread:@selector(connectSession)];
    }
}

void bw_bt_send(const uint8_t *data, unsigned int len) {
    if (!g_session) return;
    @autoreleasepool {
        NSData *d = [NSData dataWithBytes:data length:len];
        [g_session performSelector:@selector(enqueue:) onThread:g_session.btThread withObject:d waitUntilDone:NO];
    }
}

void bw_bt_disconnect(void) {
    if (g_session) [g_session onThread:@selector(closeSession)];
}
