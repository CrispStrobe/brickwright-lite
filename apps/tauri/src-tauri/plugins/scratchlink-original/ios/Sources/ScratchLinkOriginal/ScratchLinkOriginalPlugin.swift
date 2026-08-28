// The fifth connection path: the REFERENCE Scratch Link, running in-process.
//
// Everything here is plumbing. The protocol — discover filters, the GATT
// blocklist, encodings, error codes — is the Scratch Foundation's own code in
// `vendored/`, reached through the two seams Session exposes:
//
//     Session.init(withSocket:)   outbound frames leave via the socket's onSend
//     Session.didReceiveText(_:)  inbound frames go straight in
//
// Nothing re-implements JSON-RPC. That is the entire reason to carry the
// reference rather than a third translation of it: auditing our Rust against
// this found stopNotifications, getVersion, pingMe, three of four discover
// filter criteria, a ten-entry GATT blocklist and an inverted encoding default
// all missing. Where this and our Rust disagree, this one is right by
// definition.
import Foundation
import Tauri

/// `kind` picks the session type, mirroring the socket route's URL path
/// (`/scratch/ble` vs `/scratch/bt`).
class OpenArgs: Decodable {
    let kind: String?
}

class SendArgs: Decodable {
    let frame: String
}

class ScratchLinkOriginalPlugin: Plugin {
    /// One session at a time, matching the socket route where a single client
    /// owns the adapter.
    private var session: Session?

    @objc public func openSession(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(OpenArgs.self)
        let kind = args.kind ?? "ble"

        // Bluetooth Classic is NOT available from here. The reference's
        // BTSession is macOS-only (IOBluetooth), which iOS does not have — on
        // iOS, BTC goes through MFi ExternalAccessory, which bt_ios.rs already
        // implements. Refusing plainly beats a session that cannot work.
        guard kind == "ble" else {
            invoke.reject("the original Scratch Link path supports BLE only on this platform; " +
                          "Bluetooth Classic goes through the app's own MFi backend")
            return
        }

        let socket = WebSocket(onSend: { [weak self] frame in
            // Every outbound frame — replies AND notifications like
            // didDiscoverPeripheral — reaches the web side as one event, the
            // same shape the native-channel transport already listens for.
            self?.trigger("scratchlink://message", data: ["frame": frame])
        })
        session = try BLESession(withSocket: socket)
        invoke.resolve()
    }

    @objc public func sendFrame(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SendArgs.self)
        guard let session = session else {
            invoke.reject("the original Scratch Link session is not open")
            return
        }
        session.didReceiveText(args.frame)
        invoke.resolve()
    }

    @objc public func closeSession(_ invoke: Invoke) throws {
        // Dropping the session lets its deinit disconnect the peripheral, the
        // same way a closed socket does on the other routes.
        session?.sessionWasClosed()
        session = nil
        invoke.resolve()
    }
}

@_cdecl("init_plugin_scratchlink_original")
func initPlugin() -> Plugin {
    return ScratchLinkOriginalPlugin()
}
