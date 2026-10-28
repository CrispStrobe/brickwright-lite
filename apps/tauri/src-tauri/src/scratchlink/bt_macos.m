// macOS Bluetooth-Classic (RFCOMM/SPP) shim for the ScratchLink BT transport.
//
// IOBluetooth is delegate-heavy and Objective-C native, so the transport lives
// here behind a small C ABI that src/scratchlink/bt_macos.rs calls. Mirrors the
// classic scratch-link macOS BTSession: device-class inquiry → open RFCOMM
// channel 1 → writeSync (chunked by MTU) → rfcommChannelData delegate.
//
// All IOBluetooth work runs on a dedicated thread that owns a run loop (the
// framework requires one, and openRFCOMMChannelSync/writeSync would otherwise
// block the app's main thread). Callbacks marshal bytes back to Rust, which
// forwards them to the WebSocket client.
//
// Scratch connects one BT peripheral at a time, so a single global session is
// sufficient. Only EV3 (device class toy/robot = 8/1) and legacy-firmware SPIKE
// speak BTC; everything modern is BLE.

#import <Foundation/Foundation.h>
#import <IOBluetooth/IOBluetooth.h>

typedef void (*bw_bt_device_cb)(const char *address, const char *name, int rssi, void *ctx);
typedef void (*bw_bt_data_cb)(const uint8_t *data, unsigned int len, void *ctx);
// event: 1 = connected, 0 = disconnected/closed, -1 = connect failed
typedef void (*bw_bt_event_cb)(int event, void *ctx);

// Pending args for the run-loop-thread selectors (set before dispatch).
static NSNumber *g_major = nil;
static NSNumber *g_minor = nil;
static NSString *g_address = nil;

@interface BWBtSession : NSObject <IOBluetoothDeviceInquiryDelegate, IOBluetoothRFCOMMChannelDelegate>
@property(nonatomic) bw_bt_device_cb deviceCb;
@property(nonatomic) bw_bt_data_cb dataCb;
@property(nonatomic) bw_bt_event_cb eventCb;
@property(nonatomic) void *ctx;
@property(nonatomic, strong) IOBluetoothDeviceInquiry *inquiry;
@property(nonatomic, strong) IOBluetoothRFCOMMChannel *channel;
@property(nonatomic, strong) NSThread *btThread;
@end

@implementation BWBtSession

// The run-loop thread. Kept alive by an NSRunLoop with a mach port so it can
// receive performSelector:onThread: dispatches.
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

// --- Discovery -----------------------------------------------------------

- (void)startInquiry {
    @autoreleasepool {
        IOBluetoothDeviceInquiry *inq = [IOBluetoothDeviceInquiry inquiryWithDelegate:self];
        // EV3 = major "toy" (8), minor "robot" (1); pass the requested class through.
        [inq setSearchCriteria:kBluetoothServiceClassMajorAny
               majorDeviceClass:(BluetoothDeviceClassMajor)[g_major intValue]
               minorDeviceClass:(BluetoothDeviceClassMinor)[g_minor intValue]];
        [inq setInquiryLength:15];
        [inq setUpdateNewDeviceNames:YES];
        self.inquiry = inq;
        [inq start];
    }
}

- (void)stopInquiry {
    [self.inquiry stop];
    self.inquiry = nil;
}

- (void)deviceInquiryDeviceFound:(IOBluetoothDeviceInquiry *)sender device:(IOBluetoothDevice *)device {
    if (!self.deviceCb) return;
    const char *addr = [[device addressString] UTF8String];
    const char *name = [[device name] UTF8String];
    self.deviceCb(addr ? addr : "", name ? name : "", (int)[device RSSI], self.ctx);
}

- (void)deviceInquiryComplete:(IOBluetoothDeviceInquiry *)sender error:(IOReturn)error aborted:(BOOL)aborted {
    // One-shot inquiry; the Rust side re-issues discover if it wants more.
}

// --- Connect / RFCOMM ----------------------------------------------------

- (void)connectChannel {
    @autoreleasepool {
        IOBluetoothDevice *device = [IOBluetoothDevice deviceWithAddressString:g_address];
        if (!device) {
            if (self.eventCb) self.eventCb(-1, self.ctx);
            return;
        }
        IOBluetoothRFCOMMChannel *chan = nil;
        // EV3/SPP uses RFCOMM channel 1.
        IOReturn rc = [device openRFCOMMChannelSync:&chan withChannelID:1 delegate:self];
        if (rc != kIOReturnSuccess || !chan) {
            if (self.eventCb) self.eventCb(-1, self.ctx);
            return;
        }
        self.channel = chan;
        if (self.eventCb) self.eventCb(1, self.ctx);
    }
}

- (void)rfcommChannelData:(IOBluetoothRFCOMMChannel *)rfcommChannel
                     data:(void *)dataPointer
                   length:(size_t)dataLength {
    if (self.dataCb && dataLength > 0) {
        self.dataCb((const uint8_t *)dataPointer, (unsigned int)dataLength, self.ctx);
    }
}

- (void)rfcommChannelClosed:(IOBluetoothRFCOMMChannel *)rfcommChannel {
    self.channel = nil;
    if (self.eventCb) self.eventCb(0, self.ctx);
}

// Called on the BT thread. Chunks by MTU, like scratch-link.
- (void)writeData:(NSData *)data {
    IOBluetoothRFCOMMChannel *chan = self.channel;
    if (!chan) return;
    BluetoothRFCOMMMTU mtu = [chan getMTU];
    const uint8_t *bytes = (const uint8_t *)data.bytes;
    NSUInteger remaining = data.length;
    NSUInteger offset = 0;
    while (remaining > 0) {
        UInt16 chunk = (UInt16)MIN((NSUInteger)mtu, remaining);
        [chan writeSync:(void *)(bytes + offset) length:chunk];
        offset += chunk;
        remaining -= chunk;
    }
}

- (void)closeChannel {
    [self.channel closeChannel];
    self.channel = nil;
}

@end

// --- C ABI ---------------------------------------------------------------

static BWBtSession *g_session = nil;

static BWBtSession *session(void) {
    if (!g_session) g_session = [[BWBtSession alloc] init];
    return g_session;
}

void bw_bt_discover(int major, int minor, bw_bt_device_cb cb, void *ctx) {
    @autoreleasepool {
        BWBtSession *s = session();
        s.deviceCb = cb;
        s.ctx = ctx;
        g_major = @(major);
        g_minor = @(minor);
        [s onThread:@selector(startInquiry)];
    }
}

void bw_bt_stop_discover(void) {
    if (g_session) [g_session onThread:@selector(stopInquiry)];
}

void bw_bt_connect(const char *address, bw_bt_data_cb data_cb, bw_bt_event_cb event_cb, void *ctx) {
    @autoreleasepool {
        BWBtSession *s = session();
        s.dataCb = data_cb;
        s.eventCb = event_cb;
        s.ctx = ctx;
        g_address = [NSString stringWithUTF8String:address];
        [s onThread:@selector(connectChannel)];
    }
}

void bw_bt_send(const uint8_t *data, unsigned int len) {
    if (!g_session) return;
    @autoreleasepool {
        NSData *d = [NSData dataWithBytes:data length:len];
        [g_session performSelector:@selector(writeData:) onThread:g_session.btThread withObject:d waitUntilDone:NO];
    }
}

void bw_bt_disconnect(void) {
    if (g_session) [g_session onThread:@selector(closeChannel)];
}
