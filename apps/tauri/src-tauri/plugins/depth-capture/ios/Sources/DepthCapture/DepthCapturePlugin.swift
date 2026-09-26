import ARKit
import CoreImage
import Foundation
import Tauri
import UIKit

final class QualityArgs: Decodable {
    let quality: Double?
}

final class DepthCapturePlugin: Plugin {
    private let session = ARSession()
    private let context = CIContext(options: [.cacheIntermediates: false])
    private var running = false

    private var supported: Bool {
        ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
    }

    @objc func status(_ invoke: Invoke) throws {
        invoke.resolve(["available": supported, "running": running,
                        "label": supported ? "Apple LiDAR scene depth" : "RGB only"])
    }

    @objc func start(_ invoke: Invoke) throws {
        guard supported else {
            invoke.reject("scene depth is unavailable on this Apple device")
            return
        }
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        configuration.frameSemantics.insert(.sceneDepth)
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            configuration.frameSemantics.insert(.smoothedSceneDepth)
        }
        session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
        running = true
        invoke.resolve()
    }

    @objc func capture(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(QualityArgs.self)
        guard running, let frame = session.currentFrame else {
            invoke.reject("depth session has no frame yet")
            return
        }
        guard let scene = frame.smoothedSceneDepth ?? frame.sceneDepth else {
            invoke.reject("this AR frame has no scene depth")
            return
        }

        let image = CIImage(cvPixelBuffer: frame.capturedImage)
        guard let colour = context.createCGImage(image, from: image.extent) else {
            invoke.reject("could not encode the synchronized RGB frame")
            return
        }
        let jpeg = UIImage(cgImage: colour).jpegData(compressionQuality:
            min(1, max(0, args.quality ?? 0.92))) ?? Data()

        let depth = bytes(scene.depthMap, bytesPerPixel: MemoryLayout<Float32>.size)
        let confidence = scene.confidenceMap.map { bytes($0, bytesPerPixel: 1) } ?? Data()
        let intrinsics = frame.camera.intrinsics
        let transform = frame.camera.transform
        invoke.resolve([
            "rgbDataUrl": "data:image/jpeg;base64," + jpeg.base64EncodedString(),
            "depthBase64": depth.base64EncodedString(),
            "confidenceBase64": confidence.base64EncodedString(),
            "imageWidth": CVPixelBufferGetWidth(frame.capturedImage),
            "imageHeight": CVPixelBufferGetHeight(frame.capturedImage),
            "depthWidth": CVPixelBufferGetWidth(scene.depthMap),
            "depthHeight": CVPixelBufferGetHeight(scene.depthMap),
            "depthFormat": "float32-little-endian-metres",
            "confidenceFormat": confidence.isEmpty ? "none" : "uint8-0-low-1-medium-2-high",
            "intrinsics": matrix3(intrinsics),
            "pose": matrix4(transform),
            "timestamp": frame.timestamp
        ] as [String: Any])
    }

    @objc func stop(_ invoke: Invoke) throws {
        session.pause()
        running = false
        invoke.resolve()
    }

    private func bytes(_ buffer: CVPixelBuffer, bytesPerPixel: Int) -> Data {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return Data() }
        let height = CVPixelBufferGetHeight(buffer)
        let sourceRowBytes = CVPixelBufferGetBytesPerRow(buffer)
        let packedRowBytes = CVPixelBufferGetWidth(buffer) * bytesPerPixel
        var result = Data(capacity: height * packedRowBytes)
        for row in 0..<height {
            result.append(base.advanced(by: row * sourceRowBytes), count: packedRowBytes)
        }
        return result
    }

    private func matrix3(_ value: simd_float3x3) -> [Float] {
        [value.columns.0.x, value.columns.0.y, value.columns.0.z,
         value.columns.1.x, value.columns.1.y, value.columns.1.z,
         value.columns.2.x, value.columns.2.y, value.columns.2.z]
    }

    private func matrix4(_ value: simd_float4x4) -> [Float] {
        [value.columns.0.x, value.columns.0.y, value.columns.0.z, value.columns.0.w,
         value.columns.1.x, value.columns.1.y, value.columns.1.z, value.columns.1.w,
         value.columns.2.x, value.columns.2.y, value.columns.2.z, value.columns.2.w,
         value.columns.3.x, value.columns.3.y, value.columns.3.z, value.columns.3.w]
    }
}

@_cdecl("init_plugin_depth_capture")
func initPlugin() -> Plugin { DepthCapturePlugin() }
