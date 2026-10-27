package org.eyeexhibit.headset

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.GLUtils
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.ConcurrentHashMap
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.concurrent.thread
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** What the phone should show; written by the main thread, read by the drawing thread. */
class Scene {
    @Volatile var show: Map<String, Any?> = mapOf("screen" to "lang")
    @Volatile var running: Running? = null
    @Volatile var calib = Calib()
    @Volatile var hotspots: Map<String, Map<String, DoubleArray>> = Data.defaultHotspots()
    @Volatile var error: String? = null
    @Volatile var homeShown = false
    @Volatile var camRotDeg = 0
    @Volatile var serverNow: () -> Long = { System.currentTimeMillis() }
    @Volatile var introAspect: () -> Float = { 16f / 9f }
    @Volatile var homeAspect: () -> Float = { 16f / 9f }
    @Volatile var cam: Cam? = null
}

/** An AR effect: "Loading…" until startAt, then 20 s of the condition, then back to the picture. */
class Running(val cond: String, val lang: String, val startAt: Long, val back: Map<String, Any?>?, val total: Double)

/**
 * Draws both eyes every frame with one full-screen shader – the same shader as js/viewer.js:
 * rounded eye areas, divider, nose cutout, barrel (lens) distortion,
 * SCREEN MODE (picture / video in both eyes) or AR MODE (camera + condition).
 */
class Renderer(
    private val s: Scene,
    private val onReady: (cam: SurfaceTexture, intro: SurfaceTexture, home: SurfaceTexture) -> Unit
) : GLSurfaceView.Renderer {

    private var prog = 0
    private val loc = HashMap<String, Int>()
    private var camTex = 0; private var introTex = 0; private var homeTex = 0
    private var overTex = 0; private var maskTex = 0; private var blankTex = 0
    private var camST: SurfaceTexture? = null
    private var introST: SurfaceTexture? = null
    private var homeST: SurfaceTexture? = null
    @Volatile private var camSeen = false
    private val camM = FloatArray(16); private val introM = FloatArray(16); private val homeM = FloatArray(16)
    private lateinit var quad: FloatBuffer

    private class Still(val tex: Int, val w: Int, val h: Int)
    private val stills = HashMap<String, Still>()
    private val pending = ConcurrentHashMap<String, Bitmap>()
    private val requested = HashSet<String>()

    @Volatile var width = 0; private set
    @Volatile var height = 0; private set
    @Volatile var fps = 60f; private set
    private var lastFrame = 0L
    private var frame = 0L

    private val overlay = Overlay()
    private var overKey = ""
    private var overUploadedH = 0

    private val MASK_SIZE = 256
    private val MASK_EXTENT = 1.5
    private val maskBmp = Bitmap.createBitmap(MASK_SIZE * 2, MASK_SIZE, Bitmap.Config.ARGB_8888)
    private val maskCanvas = Canvas(maskBmp)
    private val eyeBmp = Bitmap.createBitmap(MASK_SIZE, MASK_SIZE, Bitmap.Config.ARGB_8888)
    private val eyeCanvas = Canvas(eyeBmp)
    private var maskEmpty = true
    private var maskUploaded = false

    /** Loads a picture in the background (any thread). */
    fun requestStill(path: String) {
        synchronized(requested) { if (!requested.add(path)) return }
        thread(name = "still") { Data.bitmap(path)?.let { pending[path] = it } }
    }

    // ---------------------------------------------------------------- GL setup
    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        prog = buildProgram(VERT, FRAG)
        for (n in listOf("uRes", "uCam", "uCamM", "uCamR", "uCamAspect", "uHasCam", "uMask", "uMaskExtent",
            "uScreenOn", "uScrKind", "uVid", "uVidM", "uStill", "uOver", "uOverAR", "uScrAspect", "uScrSize", "uScrBg",
            "uK", "uZoom", "uIpd", "uVert", "uEye", "uRound", "uDiv", "uTest", "uNose",
            "uFxA0", "uFxB0", "uFxA1", "uFxB1", "uMaskBlur", "uEdge")) loc[n] = GLES20.glGetUniformLocation(prog, n)
        loc["aPos"] = GLES20.glGetAttribLocation(prog, "aPos")
        quad = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
            .apply { put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0) }

        val oes = GLES11Ext.GL_TEXTURE_EXTERNAL_OES
        camTex = genTex(oes); introTex = genTex(oes); homeTex = genTex(oes)
        overTex = genTex(GLES20.GL_TEXTURE_2D); maskTex = genTex(GLES20.GL_TEXTURE_2D)
        blankTex = genTex(GLES20.GL_TEXTURE_2D)
        val one = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLACK) }
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, one, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTex)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, maskBmp, 0)
        maskUploaded = true; overUploadedH = 0; overKey = ""
        stills.clear(); synchronized(requested) { requested.clear() }

        camST?.release(); introST?.release(); homeST?.release()
        val c = SurfaceTexture(camTex).apply { setOnFrameAvailableListener { camSeen = true } }
        val i = SurfaceTexture(introTex); val h = SurfaceTexture(homeTex)
        camST = c; introST = i; homeST = h
        camSeen = false
        Handler(Looper.getMainLooper()).post { onReady(c, i, h) }
    }

    override fun onSurfaceChanged(gl: GL10?, w: Int, h: Int) {
        width = w; height = h
        GLES20.glViewport(0, 0, w, h)
    }

    // ---------------------------------------------------------------- every frame
    override fun onDrawFrame(gl: GL10?) {
        frame++
        val tick = SystemClock.uptimeMillis()
        if (lastFrame > 0) fps = fps * 0.95f + (1000f / max(1L, tick - lastFrame)) * 0.05f
        lastFrame = tick
        val now = s.serverNow()

        update(camST, camM); update(introST, introM); update(homeST, homeM)
        for ((path, bmp) in pending) { pending.remove(path); stills[path] = upload(bmp) }

        // AR effect timing ("Loading…" until it starts)
        val run = s.running
        val t = if (run != null) (now - run.startAt) / 1000.0 else -1.0
        val arOn = run != null && t >= 0 && t < run.total
        val loading = run != null && t < 0

        // screen-mode content
        val show = s.show
        val screen = show.str("screen")
        var kind = 0                     // 0 nothing, 1 video, 2 picture
        var vidTex = introTex; var vidM = introM
        var still: Still? = null
        var aspect = 16f / 9f
        var mode = "lang"
        var spot: Overlay.Spot? = null
        when {
            loading -> mode = "loading"
            screen == "introChoice" -> mode = "choice"
            screen == "intro" -> { kind = 1; aspect = s.introAspect(); mode = "video" }
            screen == "eyeStill" || screen == "pathStill" -> {
                val eye = screen == "eyeStill"
                val path = show.str("still") ?: Data.media(if (eye) "eyeStill" else "pathStill")
                still = stills[path]
                if (still != null) { kind = 2; aspect = still.w.toFloat() / still.h } else requestStill(path)
                mode = "still"
                val hs = show.str("highlight")?.let { s.hotspots[if (eye) "eye" else "pathway"]?.get(it) }
                if (hs != null) spot = Overlay.Spot(hs[0], hs[1], hs[2], !eye)
            }
            s.homeShown -> { kind = 1; vidTex = homeTex; vidM = homeM; aspect = s.homeAspect() }
        }
        if (arOn) { mode = if (t < Data.nameShow) "name" else "none"; aspect = 16f / 9f }

        // the text / glow layer
        val lang = run?.lang ?: show.str("language") ?: "en"
        val name = run?.let { Data.tr(it.lang, "conditions.${it.cond}.name") }
        val title = show.str("title"); val subtitle = show.str("subtitle")
        val err = s.error
        val resized = overlay.ensureSize(aspect)
        val key = "$mode|$title|$subtitle|${show.str("highlight")}|$err|${s.homeShown}|$lang|$name|${overlay.bitmap.height}"
        val animated = mode == "loading" || (mode == "still" && spot != null)
        if (resized || key != overKey || (animated && frame % 2 == 0L)) {
            overlay.draw(mode, tick, lang, s.homeShown, spot, title, subtitle, name, err)
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, overTex)
            if (overUploadedH == overlay.bitmap.height) GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, overlay.bitmap)
            else { GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, overlay.bitmap, 0); overUploadedH = overlay.bitmap.height }
            overKey = key
        }

        // the dark areas of the condition
        if (arOn && run != null) {
            if (frame % 2 == 0L || maskEmpty) {
                maskBmp.eraseColor(Color.TRANSPARENT)
                listOf('L', 'R').forEachIndexed { i, e ->
                    eyeBmp.eraseColor(Color.TRANSPARENT)
                    Effects.paintField(eyeCanvas, MASK_SIZE, run.cond, e, t, MASK_EXTENT, run.total)
                    maskCanvas.drawBitmap(eyeBmp, (i * MASK_SIZE).toFloat(), 0f, null)
                }
                uploadMask(); maskEmpty = false
            }
        } else if (!maskEmpty) { maskBmp.eraseColor(Color.TRANSPARENT); uploadMask(); maskEmpty = true }

        // ---------------------------------------------------------------- uniforms + draw
        val cal = s.calib
        val cam = s.cam
        val hasCam = cam != null && cam.ok && camSeen && cam.bufW > 0
        GLES20.glUseProgram(prog)
        GLES20.glUniform2f(loc["uRes"]!!, width.toFloat(), height.toFloat())
        bind(0, GLES11Ext.GL_TEXTURE_EXTERNAL_OES, camTex, "uCam")
        GLES20.glUniformMatrix4fv(loc["uCamM"]!!, 1, false, camM, 0)
        val rot = Math.toRadians(-s.camRotDeg.toDouble())
        GLES20.glUniformMatrix2fv(loc["uCamR"]!!, 1, false,
            floatArrayOf(cos(rot).toFloat(), sin(rot).toFloat(), -sin(rot).toFloat(), cos(rot).toFloat()), 0)
        val cw = cam?.bufW ?: 0; val ch = cam?.bufH ?: 0
        GLES20.glUniform1f(loc["uCamAspect"]!!, if (cw > 0 && ch > 0) max(cw, ch).toFloat() / min(cw, ch) else 16f / 9f)
        GLES20.glUniform1f(loc["uHasCam"]!!, if (hasCam) 1f else 0f)
        bind(1, GLES11Ext.GL_TEXTURE_EXTERNAL_OES, vidTex, "uVid")
        GLES20.glUniformMatrix4fv(loc["uVidM"]!!, 1, false, vidM, 0)
        bind(2, GLES20.GL_TEXTURE_2D, still?.tex ?: blankTex, "uStill")
        bind(3, GLES20.GL_TEXTURE_2D, overTex, "uOver")
        bind(4, GLES20.GL_TEXTURE_2D, maskTex, "uMask")
        GLES20.glUniform1f(loc["uMaskExtent"]!!, MASK_EXTENT.toFloat())
        GLES20.glUniform1f(loc["uScreenOn"]!!, if (arOn) 0f else 1f)
        GLES20.glUniform1f(loc["uScrKind"]!!, kind.toFloat())
        GLES20.glUniform1f(loc["uOverAR"]!!, if (arOn && (mode == "name" || err != null)) 1f else 0f)
        GLES20.glUniform1f(loc["uScrAspect"]!!, aspect)
        if (loading) GLES20.glUniform3f(loc["uScrBg"]!!, 0f, 0f, 0f)
        else GLES20.glUniform3f(loc["uScrBg"]!!, 12 / 255f, 24 / 255f, 54 / 255f)
        GLES20.glUniform1f(loc["uScrSize"]!!, cal.d("screenSize").toFloat().takeIf { it > 0 } ?: 1.6f)
        GLES20.glUniform1f(loc["uK"]!!, cal.d("distortion").toFloat())
        GLES20.glUniform1f(loc["uZoom"]!!, max(0.1, cal.d("zoom")).toFloat())
        GLES20.glUniform1f(loc["uIpd"]!!, cal.d("ipd").toFloat())
        GLES20.glUniform1f(loc["uVert"]!!, cal.d("vertical").toFloat())
        GLES20.glUniform1f(loc["uEye"]!!, cal.d("eyeSize").toFloat())
        GLES20.glUniform1f(loc["uRound"]!!, cal.d("roundness").toFloat())
        GLES20.glUniform1f(loc["uDiv"]!!, cal.d("divider").toFloat())
        GLES20.glUniform1f(loc["uTest"]!!, if (cal.testPattern) 1f else 0f)
        GLES20.glUniform2f(loc["uNose"]!!, cal.d("noseWidth").toFloat(), cal.d("noseHeight").toFloat())
        val total = run?.total ?: Data.effectTotal
        val fl = Effects.filtersAt(if (arOn) run?.cond else null, 'L', t, total)
        val fr = Effects.filtersAt(if (arOn) run?.cond else null, 'R', t, total)
        setFx(fl, "uFxA0", "uFxB0"); setFx(fr, "uFxA1", "uFxB1")
        GLES20.glUniform2f(loc["uMaskBlur"]!!, fl.maskBlur.toFloat(), fr.maskBlur.toFloat())
        GLES20.glUniform2f(loc["uEdge"]!!, fl.edge.toFloat(), fr.edge.toFloat())

        val a = loc["aPos"]!!
        GLES20.glEnableVertexAttribArray(a)
        GLES20.glVertexAttribPointer(a, 2, GLES20.GL_FLOAT, false, 0, quad)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    }

    private fun setFx(f: Effects.Fx, a: String, b: String) {
        GLES20.glUniform4f(loc[a]!!, f.blur.toFloat(), f.contrast.toFloat(), f.tint.toFloat(), f.glare.toFloat())
        GLES20.glUniform4f(loc[b]!!, f.desat.toFloat(), f.redDesat.toFloat(), f.dim.toFloat(), f.warp.toFloat())
    }

    private fun bind(unit: Int, target: Int, tex: Int, name: String) {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
        GLES20.glBindTexture(target, tex)
        GLES20.glUniform1i(loc[name]!!, unit)
    }

    private fun update(st: SurfaceTexture?, m: FloatArray) {
        if (st == null) return
        try { st.updateTexImage(); st.getTransformMatrix(m) } catch (e: Exception) { /* not connected yet */ }
    }

    private fun uploadMask() {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, maskTex)
        GLUtils.texSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0, maskBmp)
    }

    private fun upload(bmp: Bitmap): Still {
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        val tex = genTex(GLES20.GL_TEXTURE_2D)
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bmp, 0)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR_MIPMAP_LINEAR)
        GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
        val st = Still(tex, bmp.width, bmp.height)
        bmp.recycle()
        return st
    }

    private fun genTex(target: Int): Int {
        val a = IntArray(1)
        GLES20.glGenTextures(1, a, 0)
        GLES20.glBindTexture(target, a[0])
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(target, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
        return a[0]
    }

    private fun buildProgram(v: String, f: String): Int {
        fun shader(type: Int, src: String): Int {
            val sh = GLES20.glCreateShader(type)
            GLES20.glShaderSource(sh, src)
            GLES20.glCompileShader(sh)
            val ok = IntArray(1)
            GLES20.glGetShaderiv(sh, GLES20.GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) throw RuntimeException("Shader error: " + GLES20.glGetShaderInfoLog(sh))
            return sh
        }
        val p = GLES20.glCreateProgram()
        GLES20.glAttachShader(p, shader(GLES20.GL_VERTEX_SHADER, v))
        GLES20.glAttachShader(p, shader(GLES20.GL_FRAGMENT_SHADER, f))
        GLES20.glLinkProgram(p)
        return p
    }

    companion object {
        const val VERT = """
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
"""
        // Same as FRAG in js/viewer.js, with Android texture sources (camera / video = external textures,
        // pictures uploaded upside down, so their y is flipped when sampling).
        const val FRAG = """
#extension GL_OES_EGL_image_external : require
precision highp float;
uniform vec2 uRes;
uniform samplerExternalOES uCam; uniform mat4 uCamM; uniform mat2 uCamR; uniform float uCamAspect; uniform float uHasCam;
uniform sampler2D uMask; uniform float uMaskExtent;
uniform float uScreenOn;
uniform float uScrKind;
uniform samplerExternalOES uVid; uniform mat4 uVidM;
uniform sampler2D uStill; uniform sampler2D uOver; uniform float uOverAR;
uniform float uScrAspect; uniform float uScrSize;
uniform vec3 uScrBg;
uniform float uK; uniform float uZoom; uniform float uIpd; uniform float uVert; uniform float uEye;
uniform float uRound; uniform float uDiv; uniform float uTest;
uniform vec2 uNose;
uniform vec4 uFxA0; uniform vec4 uFxB0; uniform vec4 uFxA1; uniform vec4 uFxB1;
uniform vec2 uMaskBlur;
uniform vec2 uEdge;

vec3 cam(vec2 c) {
  vec2 uv = vec2(0.5 + c.x * 0.5 / uCamAspect, 0.5 + c.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  vec2 n = uCamR * (uv - 0.5) + 0.5;
  return texture2D(uCam, (uCamM * vec4(n, 0.0, 1.0)).xy).rgb;
}
vec3 testPattern(vec2 m) {
  vec2 g = abs(fract(m * 5.0 + 0.5) - 0.5) / 5.0;
  float line = 1.0 - smoothstep(0.004, 0.009, min(g.x, g.y));
  float cross = (1.0 - smoothstep(0.008, 0.016, min(abs(m.x), abs(m.y)))) * step(max(abs(m.x), abs(m.y)), 0.35);
  float ring = 1.0 - smoothstep(0.006, 0.012, abs(length(m) - 1.0));
  vec3 col = vec3(0.04) + vec3(0.85) * line;
  col = mix(col, vec3(1.0, 0.25, 0.2), cross);
  col = mix(col, vec3(1.0, 0.75, 0.3), ring);
  return col;
}
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 scrUV(vec2 m) {
  vec2 halfSize = vec2(uScrSize * 0.5, uScrSize * 0.5 / uScrAspect);
  return m / (2.0 * halfSize) + 0.5;
}
bool inside(vec2 su) { return su.x >= 0.0 && su.x <= 1.0 && su.y >= 0.0 && su.y <= 1.0; }

void main() {
  vec2 f = gl_FragCoord.xy;
  float W = uRes.x, H = uRes.y;
  float eye = f.x < W * 0.5 ? 0.0 : 1.0;
  vec4 A = eye < 0.5 ? uFxA0 : uFxA1;
  vec4 B = eye < 0.5 ? uFxB0 : uFxB1;
  vec2 c = vec2(W * 0.5 + (eye < 0.5 ? -1.0 : 1.0) * uIpd * W * 0.5, H * 0.5 + uVert * H);
  float R = uEye * H * 0.5;
  vec2 p = (f - c) / R;
  float cr = clamp(uRound, 0.05, 1.0);
  float d = length(max(abs(p) - (1.0 - cr), 0.0)) - cr;
  float vign = smoothstep(0.0, -0.16, d);
  if (d > 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float dv = abs(f.x - W * 0.5) - uDiv * W * 0.5;
  vec2 nr = vec2(max(uNose.x * W * 0.5, 1.0), max(uNose.y * H, 1.0));
  vec2 nq = (f - vec2(W * 0.5, 0.0)) / nr;
  float nose = length(nq) - 1.0;
  float cut = min(smoothstep(-1.0, 1.0, dv), smoothstep(-0.02, 0.02, nose));
  float r2 = dot(p, p);
  float k1 = uK, k2 = uK * 0.5;
  vec2 m = p * (1.0 + k1 * r2 + k2 * r2 * r2) / (1.0 + k1 + k2);

  // ---- SCREEN MODE
  if (uScreenOn > 0.5 && uTest < 0.5) {
    vec2 su = scrUV(m);
    vec3 sc = uScrBg;                          // dark blue round "window" around the picture
    if (inside(su)) {
      if (uScrKind > 1.5) sc = texture2D(uStill, vec2(su.x, 1.0 - su.y)).rgb;
      else if (uScrKind > 0.5) sc = texture2D(uVid, (uVidM * vec4(su, 0.0, 1.0)).xy).rgb;
      vec4 o = texture2D(uOver, vec2(su.x, 1.0 - su.y));
      sc = o.rgb + sc * (1.0 - o.a);
    }
    gl_FragColor = vec4(clamp(sc, 0.0, 1.0) * vign * cut, 1.0);
    return;
  }

  // ---- AR MODE
  float warp = B.w * (1.0 - smoothstep(0.16, 0.36, length(m)));
  vec2 cc = (m + warp * 0.022 * vec2(sin(m.y * 46.0), sin(m.x * 46.0 + 1.3))) / uZoom;
  vec2 mu = clamp(m / uMaskExtent * 0.5 + 0.5, 0.0, 1.0);
  float dark = texture2D(uMask, vec2((eye + mu.x) * 0.5, 1.0 - mu.y)).a;
  float blurR = A.x + (eye < 0.5 ? uMaskBlur.x : uMaskBlur.y) * dark;
  vec3 col;
  if (uTest > 0.5 || uHasCam < 0.5) {
    col = testPattern(m);
  } else {
    col = cam(cc);
    if (blurR > 0.002) {
      vec3 s = col;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996;
        float rr = blurR * sqrt((float(i) + 0.5) / 12.0);
        s += cam(cc + rr * vec2(cos(a), sin(a)));
      }
      col = s / 13.0;
    }
    if (A.w > 0.0001) {
      vec3 g = vec3(0.0);
      for (int i = 0; i < 10; i++) {
        float a = float(i) * 0.6283 + 0.3;
        vec3 s = cam(cc + 0.07 * vec2(cos(a), sin(a)));
        vec3 s2 = cam(cc + 0.035 * vec2(cos(a + 0.31), sin(a + 0.31)));
        g += max(s - 0.62, 0.0) + max(s2 - 0.62, 0.0);
      }
      col += A.w * g / 20.0 * 3.2 * vec3(1.0, 0.92, 0.75);
      col += A.w * max(col - 0.7, 0.0) * 1.2;
    }
  }
  col = mix(col, col * vec3(0.92, 0.64, 0.36) + vec3(0.09, 0.03, 0.0), A.z);
  col = mix(mix(vec3(0.52), vec3(0.80, 0.47, 0.20), clamp(A.z, 0.0, 1.0)), col, 1.0 - A.y);
  float L = lum(col);
  col = mix(col, vec3(L), B.x);
  float red = max(col.r - max(col.g, col.b), 0.0);
  col.r -= red * B.y * 0.85;
  col *= 1.0 - B.z;
  float eg = (eye < 0.5 ? uEdge.x : uEdge.y) * smoothstep(0.05, 0.7, dark);
  col = mix(col, vec3(lum(col)) * vec3(0.70, 0.80, 1.0) + vec3(0.02, 0.03, 0.06), eg * 0.6);
  col = mix(col, vec3(0.02), dark);
  if (uOverAR > 0.5) {               // condition name at the start of the effect
    vec2 su = scrUV(m);
    if (inside(su)) { vec4 o = texture2D(uOver, vec2(su.x, 1.0 - su.y)); col = o.rgb + col * (1.0 - o.a); }
  }
  col *= vign * cut;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
"""
    }
}
