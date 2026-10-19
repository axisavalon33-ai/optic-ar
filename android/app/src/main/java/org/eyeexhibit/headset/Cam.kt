package org.eyeexhibit.headset

import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.util.Range
import android.util.Size
import android.view.Surface
import androidx.activity.ComponentActivity
import androidx.annotation.OptIn
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat

/**
 * Rear camera through Android's own camera library (CameraX), straight into an OpenGL texture.
 * Asks for the highest useful resolution and frame rate, with continuous autofocus and exposure.
 * The camera stays open the whole time the app runs.
 */
class Cam(private val act: ComponentActivity) {
    @Volatile var ok = false
    @Volatile var bufW = 0
    @Volatile var bufH = 0
    private var fpsRange: Range<Int>? = null
    private var autofocus = "not supported"
    var onError: ((String) -> Unit)? = null

    /** What the camera actually gives (shown on the tablet's calibration panel). */
    fun info(): Map<String, Any?>? = if (!ok) null else mapOf(
        "width" to maxOf(bufW, bufH), "height" to minOf(bufW, bufH),
        "fps" to (fpsRange?.upper ?: 30), "fpsRange" to fpsRange?.toString(),
        "autofocus" to autofocus, "autoexposure" to "on", "api" to "Android app (CameraX)"
    )

    /** quality: "hd" = 1920×1080 up to 60 fps, "4k" = 3840×2160 at 30 fps */
    fun start(st: SurfaceTexture, quality: String, rotation: Int) {
        val main = ContextCompat.getMainExecutor(act)
        val future = ProcessCameraProvider.getInstance(act)
        future.addListener({
            try {
                val provider = future.get()
                provider.unbindAll()
                val size = if (quality == "4k") Size(3840, 2160) else Size(1920, 1080)
                val selector = ResolutionSelector.Builder()
                    .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                    .setResolutionStrategy(ResolutionStrategy(size, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                    .build()
                val preview = Preview.Builder()
                    .setResolutionSelector(selector)
                    .setTargetRotation(rotation)
                    .build()
                preview.setSurfaceProvider(main) { req ->
                    val res = req.resolution
                    bufW = res.width; bufH = res.height
                    st.setDefaultBufferSize(res.width, res.height)
                    val surface = Surface(st)
                    req.provideSurface(surface, main) { surface.release() }
                }
                val camera = provider.bindToLifecycle(act, CameraSelector.DEFAULT_BACK_CAMERA, preview)
                tune(camera, if (quality == "4k") 30 else 60)
                ok = true
            } catch (e: Exception) {
                ok = false
                onError?.invoke(e.message ?: "camera")
            }
        }, main)
    }

    fun stop() {
        try { ProcessCameraProvider.getInstance(act).get().unbindAll() } catch (e: Exception) {}
        ok = false
    }

    @OptIn(markerClass = [ExperimentalCamera2Interop::class])
    private fun tune(camera: Camera, maxFps: Int) {
        val info = Camera2CameraInfo.from(camera.cameraInfo)
        val ranges = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: emptyArray()
        // highest frame rate up to maxFps; among those, the steadiest (highest minimum)
        val best = ranges.filter { it.upper <= maxFps }
            .maxWithOrNull(compareBy<Range<Int>>({ it.upper }, { it.lower }))
        val afModes = info.getCameraCharacteristic(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
        val b = CaptureRequestOptions.Builder()
        if (best != null) b.setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, best)
        if (afModes.contains(CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            autofocus = "on"
        } else if (afModes.contains(CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE)) {
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            autofocus = "on"
        }
        b.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_ON)
        b.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, CameraMetadata.CONTROL_AWB_MODE_AUTO)
        // electronic stabilisation adds delay and makes the picture float: keep it off in a headset
        b.setCaptureRequestOption(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF)
        fpsRange = best
        Camera2CameraControl.from(camera.cameraControl).setCaptureRequestOptions(b.build())
    }
}
