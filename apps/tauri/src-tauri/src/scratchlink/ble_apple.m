// CoreBluetooth *state* probe for macOS and iOS. Read-only: it answers "why is
// BLE not working?" and nothing else. The transport itself is btleplug (via
// tauri-plugin-blec) — this file exists because btleplug does not surface either
// of the two things that actually go wrong on a phone:
//
//   1. the user denied (or has not yet answered) the Bluetooth permission, and
//   2. the adapter is not powered on.
//
// btleplug's `start_scan` sends `scanForPeripherals` unconditionally. If the
// central is not in the powered-on state, CoreBluetooth logs "API MISUSE" to the
// device console and DOES NOTHING — no error reaches Rust, so the web VM waits
// out its 15 s discovery timeout and reports "no device found". That is exactly
// the "nothing happens" symptom, and it is indistinguishable from "no hub in
// range" without asking CoreBluetooth directly.
//
// Called from ble_state.rs; built by build.rs on both Apple targets.

#import <CoreBluetooth/CoreBluetooth.h>
#import <Foundation/Foundation.h>

// A central of our own, purely so `state` can be read. CoreBluetooth allows any
// number of centrals per process, and ShowPowerAlert:NO keeps this one silent —
// it must never be the thing that pops a system dialog, because it is created on
// a diagnostics call and not on a user action. btleplug has already created its
// own central by this point, so nothing here changes what the app has asked the
// OS for.
@interface BWBleProbe : NSObject <CBCentralManagerDelegate>
@property(nonatomic, strong) CBCentralManager *central;
@end

@implementation BWBleProbe
// Required by the protocol. The state is read from `central.state` on demand
// rather than cached here, so there is nothing to do on the callback.
- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
}
@end

static BWBleProbe *g_probe = nil;

static BWBleProbe *bw_probe(void) {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        g_probe = [[BWBleProbe alloc] init];
        g_probe.central = [[CBCentralManager alloc]
            initWithDelegate:g_probe
                       queue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)
                     options:@{CBCentralManagerOptionShowPowerAlertKey : @NO}];
    });
    return g_probe;
}

// CBManagerAuthorization: 0 notDetermined, 1 restricted, 2 denied, 3 allowedAlways.
// This is a CLASS property, so reading it neither creates a central nor prompts.
// Returns -1 where the OS is too old to have it.
int bw_ble_authorization(void) {
    if (@available(macOS 10.15, iOS 13.0, *)) {
        return (int)[CBManager authorization];
    }
    return -1;
}

// CBManagerState: 0 unknown, 1 resetting, 2 unsupported, 3 unauthorized,
// 4 poweredOff, 5 poweredOn. `unknown` is also what the first call after
// creating the central returns, before the OS has delivered the first state
// update — so a caller that sees 0 should ask again a moment later rather than
// conclude anything.
int bw_ble_power_state(void) {
    return (int)bw_probe().central.state;
}
