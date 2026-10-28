package com.crispstrobe.brickwright

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

// Overlay copy of the Tauri-generated MainActivity (CI overwrites the generated
// one with this after `tauri android init`). wry's Android WebChromeClient grants
// the in-page getUserMedia request, but Android still refuses the camera/mic to
// the WebView unless the *app* holds the runtime dangerous-permissions. Tauri
// never requests them, so we do it here on launch — otherwise the Video Sensing
// and sound/record blocks fail with NotAllowedError / NotReadableError.
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    val perms = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
    val needed = perms.filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (needed.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, needed.toTypedArray(), 0)
    }
  }
}
