package org.eyeexhibit.headset

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.opengl.GLSurfaceView
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.Surface
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlin.math.roundToInt

/**
 * HEADSET PHONE APP
 * Start screen (station number, camera quality) → Start → full-screen headset view.
 * After Start the phone is never touched again: the tablet controls everything through Firebase.
 *   SCREEN MODE: the tablet's video / picture in both eyes, with the selected part glowing.
 *   AR MODE:     "Loading…" for 2 s, then 20 s of camera view with the condition, then back.
 */
class MainActivity : ComponentActivity(), Net.Listener {
    private val prefs by lazy { getSharedPreferences("headset", MODE_PRIVATE) }
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var scene: Scene
    private var net: Net? = null
    private var cam: Cam? = null
    private var glView: GLSurfaceView? = null
    private var renderer: Renderer? = null
    private var intro: SyncedPlayer? = null
    private var narr: SyncedPlayer? = null
    private var home: ExoPlayer? = null
    private var started = false
    private var cameraAllowed = false
    private var introMuted = false
    private var online = false
    private var everOnline = false
    private var offlineSince = 0L
    private var lastBeat = 0L
    private var statusView: TextView? = null

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        cameraAllowed = granted
        begin()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Data.load(this)
        scene = Scene()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= 28) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        showStartScreen()
    }

    // ---------------------------------------------------------------- start screen
    private fun showStartScreen() {
        val dp = resources.displayMetrics.density
        fun label(text: String, size: Float, color: Int = Color.rgb(169, 179, 201)) = TextView(this).apply {
            this.text = text; textSize = size; setTextColor(color); gravity = Gravity.CENTER
            setPadding(0, (8 * dp).toInt(), 0, (4 * dp).toInt())
        }
        fun spinner(options: List<String>, selected: Int) = Spinner(this).apply {
            adapter = ArrayAdapter(this@MainActivity, android.R.layout.simple_spinner_dropdown_item, options)
            setSelection(selected.coerceIn(0, options.size - 1))
            setBackgroundColor(Color.rgb(230, 234, 242))
        }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding((24 * dp).toInt(), (16 * dp).toInt(), (24 * dp).toInt(), (16 * dp).toInt())
        }
        col.addView(label("Eye Exhibit – Headset", 26f, Color.rgb(255, 181, 71)))
        col.addView(label("Station number (the same number as the tablet)", 15f))
        val station = EditText(this).apply {
            setText(prefs.getString("station", "1")); inputType = InputType.TYPE_CLASS_NUMBER
            textSize = 22f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); minEms = 4
        }
        col.addView(station)
        col.addView(label("Camera", 15f))
        val quality = spinner(listOf("Full HD 1920×1080, smooth (up to 60 frames/s)", "4K 3840×2160, sharper (30 frames/s)"),
            if (prefs.getString("quality", "hd") == "4k") 1 else 0)
        col.addView(quality)
        col.addView(label("Camera picture turned the wrong way? Fix it here", 15f))
        val rotation = spinner(listOf("Normal", "Turn 90°", "Turn 180°", "Turn 270°"), prefs.getInt("rotFix", 0))
        col.addView(rotation)
        // exhibit sign-in (one time; Firebase remembers it)
        val auth = try { Net.auth(this) } catch (e: Exception) { null }
        val user = auth?.currentUser
        fun field(hint: String, password: Boolean) = EditText(this).apply {
            this.hint = hint; textSize = 18f; setTextColor(Color.WHITE); setHintTextColor(Color.rgb(140, 150, 170)); minEms = 12
            inputType = if (password) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                        else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val email = field("Exhibit account email", false)
        val password = field("Password", true)
        if (user == null) {
            col.addView(label("Exhibit sign-in (one time on this phone)", 15f))
            col.addView(email); col.addView(password)
        } else {
            col.addView(label("Signed in as ${user.email}", 14f))
            col.addView(Button(this).apply {
                text = "Sign out"; textSize = 13f
                setOnClickListener { auth?.signOut(); recreate() }
            })
        }
        val start = Button(this).apply {
            text = "Start"; textSize = 30f; setTextColor(Color.rgb(8, 18, 42)); setBackgroundColor(Color.rgb(255, 181, 71))
            setPadding((60 * dp).toInt(), (10 * dp).toInt(), (60 * dp).toInt(), (10 * dp).toInt())
        }
        val startWrap = LinearLayout(this).apply { gravity = Gravity.CENTER; setPadding(0, (18 * dp).toInt(), 0, (8 * dp).toInt()) }
        startWrap.addView(start)
        col.addView(startWrap)
        val status = label("Tap Start, allow the camera, then put the phone in the headset.\n" +
            "No more touching is needed. To come back to this page, press the phone's Back button.", 14f)
        statusView = status
        col.addView(status)
        col.addView(label("Version ${BuildConfig.VERSION_NAME}", 12f, Color.rgb(110, 120, 140)))
        start.setOnClickListener {
            val em = email.text.toString().trim(); val pw = password.text.toString()
            if (auth != null && auth.currentUser == null && em.isNotEmpty() && pw.isNotEmpty()) {
                status.text = "Signing in…"
                auth.signInWithEmailAndPassword(em, pw)
                    .addOnSuccessListener { start.performClick() }
                    .addOnFailureListener { e -> status.text = "Could not sign in: ${e.message}" }
                return@setOnClickListener
            }
            val st = station.text.toString().filter { it.isLetterOrDigit() }.ifEmpty { "1" }
            prefs.edit()
                .putString("station", st)
                .putString("quality", if (quality.selectedItemPosition == 1) "4k" else "hd")
                .putInt("rotFix", rotation.selectedItemPosition)
                .apply()
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                cameraAllowed = true; begin()
            } else askCamera.launch(Manifest.permission.CAMERA)
        }
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.rgb(8, 18, 42)); isFillViewport = true }
        col.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        scroll.addView(col)
        setContentView(scroll)
    }

    // ---------------------------------------------------------------- after Start
    private fun begin() {
        if (started) return
        started = true
        val station = prefs.getString("station", "1") ?: "1"
        val n = Net(station, this)
        net = n
        scene.serverNow = { n.serverNow() }
        try { n.start(this) } catch (e: Exception) { scene.error = "Cannot reach the server.\nCheck the internet." }

        // players: intro video, narration, looping home video (silent)
        val i = SyncedPlayer(this) { n.serverNow() }
        val a = SyncedPlayer(this) { n.serverNow() }
        intro = i; narr = a
        scene.introAspect = { i.aspect }
        val h = ExoPlayer.Builder(this).build().apply {
            volume = 0f; repeatMode = Player.REPEAT_MODE_ALL
            setMediaItem(MediaItem.fromUri(Data.uri(Data.media("homeVideo"))))
            prepare()
        }
        var homeAspect = 16f / 9f
        h.addListener(object : Player.Listener {
            override fun onRenderedFirstFrame() { scene.homeShown = true }
            override fun onVideoSizeChanged(v: androidx.media3.common.VideoSize) {
                if (v.width > 0 && v.height > 0) homeAspect = v.width.toFloat() / v.height
            }
        })
        scene.homeAspect = { homeAspect }
        home = h

        // pictures ready before they are needed
        val r = Renderer(scene) { camST, introST, homeST -> onGlReady(camST, introST, homeST) }
        renderer = r
        r.requestStill(Data.media("eyeStill")); r.requestStill(Data.media("pathStill"))

        val v = GLSurfaceView(this).apply {
            setEGLContextClientVersion(3)
            preserveEGLContextOnPause = true
            setRenderer(r)
            renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        }
        glView = v
        setContentView(v)
        hideSystemBars()
        applyShow()
        handler.post(ticker)
    }

    private fun onGlReady(camST: SurfaceTexture, introST: SurfaceTexture, homeST: SurfaceTexture) {
        intro?.player?.setVideoSurface(Surface(introST))
        home?.setVideoSurface(Surface(homeST))
        if (cameraAllowed) {
            val c = cam ?: Cam(this).also { cam = it }
            scene.cam = c
            c.onError = { scene.error = "Camera not available.\nRestart the app." }
            @Suppress("DEPRECATION")
            val displayRot = windowManager.defaultDisplay.rotation
            val deg = when (displayRot) { Surface.ROTATION_90 -> 90; Surface.ROTATION_180 -> 180; Surface.ROTATION_270 -> 270; else -> 0 }
            scene.camRotDeg = deg + prefs.getInt("rotFix", 0) * 90
            c.start(camST, prefs.getString("quality", "hd") ?: "hd", displayRot)
        } else scene.error = "Camera not allowed.\nAllow it in the phone's Settings."
        applyShow()
    }

    // a few times a second: keep the media in step, end the effect, send the heartbeat
    private val ticker = object : Runnable {
        override fun run() {
            intro?.tick(); narr?.tick()
            val show = scene.show
            if (show.str("screen") == "intro" && intro?.ended() == true) {
                scene.show = show + mapOf("screen" to "eyeStill", "still" to Data.media("eyeStill"))
                applyShow()
            }
            val run = scene.running
            val now = net?.serverNow() ?: System.currentTimeMillis()
            if (run != null && now - run.startAt >= run.total * 1000) endEffect()
            if (!online && everOnline && offlineSince > 0 && System.currentTimeMillis() - offlineSince > 4000 && scene.error == null)
                scene.error = OFFLINE
            if (System.currentTimeMillis() - lastBeat > 5000) { lastBeat = System.currentTimeMillis(); beat() }
            handler.postDelayed(this, 100)
        }
    }

    private fun beat() {
        val r = renderer ?: return
        net?.beat(mapOf(
            "started" to true,
            "state" to (scene.running?.cond ?: scene.show.str("screen")),
            "camera" to cam?.info(),
            "screen" to mapOf("width" to r.width, "height" to r.height,
                "dpr" to (resources.displayMetrics.density * 100).roundToInt() / 100.0, "fps" to r.fps.roundToInt()),
            "preload" to mapOf("done" to 1, "total" to 1),
            "app" to "Android ${BuildConfig.VERSION_NAME}"
        ))
    }

    // ---------------------------------------------------------------- what the tablet asks for
    override fun onShow(v: Map<String, Any?>) { scene.show = v; if (started) applyShow() }
    override fun onCalib(v: Map<String, Any?>) { scene.calib = Calib(v); applySound() }
    override fun onHotspots(v: Map<String, Any?>) {
        val h = Data.defaultHotspots()
        for ((kind, ids) in h) {
            val saved = asMap(v[kind]) ?: continue
            for ((id, xyr) in ids) {
                val s = asMap(saved[id]) ?: continue
                (s["x"] as? Number)?.let { xyr[0] = it.toDouble() }
                (s["y"] as? Number)?.let { xyr[1] = it.toDouble() }
                (s["r"] as? Number)?.let { xyr[2] = it.toDouble() }
            }
        }
        scene.hotspots = h
    }
    override fun onConnected(on: Boolean) {
        online = on
        if (on) {
            everOnline = true; offlineSince = 0
            if (scene.error == OFFLINE) scene.error = null
            beat()
        } else offlineSince = System.currentTimeMillis()
    }

    // show.screen: lang | intro | eyeStill | pathStill | effect  (same as js/viewer.js)
    private fun applyShow() {
        val s = scene.show
        val i = intro ?: return; val a = narr ?: return; val h = home ?: return
        val now = net?.serverNow() ?: System.currentTimeMillis()
        val startAt = s.long("startAt")
        if (s.str("screen") == "effect") {
            val cond = s.str("condition")
            val total = (s["duration"] as? Number)?.toDouble()?.takeIf { it > 0 } ?: Data.effectTotal
            if (startAt > 0 && cond != null && cond in Effects.ALL && (now - startAt) / 1000.0 < total) {
                if (scene.running?.startAt != startAt) scene.running = Running(cond, s.str("language") ?: "en", startAt, asMap(s["returnTo"]), total)
                i.stop(); a.stop(); h.pause()
                return
            }
            scene.show = asMap(s["returnTo"]) ?: mapOf("screen" to "lang")   // an old effect: just show where it returned to
            applyShow(); return
        }
        scene.running = null
        when (s.str("screen")) {
            "intro" -> {
                h.pause()
                introMuted = s["muteVideo"] == true
                i.play(s.str("src"), startAt)
                val nr = s.str("narr")
                if (!nr.isNullOrEmpty()) a.play(nr, startAt) else a.stop()
            }
            "eyeStill", "pathStill" -> {
                h.pause(); i.stop()
                val nr = s.str("narr")
                if (!nr.isNullOrEmpty() && startAt > 0) a.play(nr, startAt) else a.stop()
                renderer?.requestStill(s.str("still") ?: Data.media(if (s.str("screen") == "eyeStill") "eyeStill" else "pathStill"))
            }
            "introChoice" -> { h.pause(); i.stop(); a.stop() }   // the guide answers on the tablet
            else -> { i.stop(); a.stop(); h.play() }
        }
        applySound()
    }

    private fun endEffect() {
        val back = scene.running?.back
        scene.running = null
        // back to screen mode with the same picture (the tablet confirms a moment later)
        if (scene.show.str("screen") == "effect") { scene.show = back ?: mapOf("screen" to "lang"); applyShow() }
    }

    // "Sound from" on the tablet: Both / Phone only / Tablet only
    private fun applySound() {
        val phone = scene.calib.soundFrom != "tablet"
        intro?.setVolume(if (phone && !introMuted) 1f else 0f)
        narr?.setVolume(if (phone) 1f else 0f)
    }

    // ---------------------------------------------------------------- full screen + lifecycle
    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && started) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        glView?.onResume()
        if (started) applyShow()
    }

    override fun onPause() {
        super.onPause()
        glView?.onPause()
        intro?.player?.pause(); narr?.player?.pause(); home?.pause()
    }

    @Deprecated("Back button returns to the start screen")
    override fun onBackPressed() {
        if (started) {
            stopAll(); recreate()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    private fun stopAll() {
        handler.removeCallbacks(ticker)
        net?.stop(); net = null
        cam?.stop(); cam = null
        intro?.release(); narr?.release(); home?.release()
        intro = null; narr = null; home = null
        started = false
    }

    override fun onDestroy() {
        if (started) stopAll()
        super.onDestroy()
    }

    companion object {
        const val OFFLINE = "No internet connection.\nReconnecting…"
    }
}
