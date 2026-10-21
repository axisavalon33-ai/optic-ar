package org.eyeexhibit.headset

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * How each condition looks – a copy of js/defects.js (keep the two the same).
 * field(): shapes that darken the visual field, drawn into the mask texture.
 * filtersAt(): whole-picture effects (blur, tint, glare …).
 * Field coordinates: eye circle radius 1, centre (0,0), x right, y up.
 */
object Effects {
    val EYE_DISORDERS = listOf("cataract", "glaucoma", "amd", "neuritis")
    val PATHWAY_DEFECTS = listOf("pOpticNerve", "pChiasm", "pTemporal", "pTract", "pMeyer", "pParietal", "pOccipital")
    val ALL = EYE_DISORDERS + PATHWAY_DEFECTS

    private const val SOFT = 0.07
    private fun clamp01(v: Double) = max(0.0, min(1.0, v))
    private fun smooth(a: Double, b: Double, v: Double): Double { val x = clamp01((v - a) / (b - a)); return x * x * (3 - 2 * x) }
    private fun lerp(a: Double, b: Double, k: Double) = a + (b - a) * k

    /** fade in over 1.5 s, fade out over the last 1.5 s */
    fun envelope(t: Double, T: Double): Double {
        val F = Data.fade
        return smooth(0.0, F, t) * smooth(T, T - F, t)
    }

    class Fx(
        var blur: Double = 0.0, var contrast: Double = 0.0, var tint: Double = 0.0, var glare: Double = 0.0,
        var desat: Double = 0.0, var redDesat: Double = 0.0, var dim: Double = 0.0, var warp: Double = 0.0,
        var maskBlur: Double = 0.0, var edge: Double = 0.0
    )

    /** T = effect length in seconds (set per condition on the tablet) */
    fun filtersAt(cond: String?, eye: Char, t: Double, T: Double): Fx {
        val fx = Fx()
        if (cond == null) return fx
        val e = envelope(t, T)
        when (cond) {
            "cataract" -> {     // amber at once, then a thickening milky veil (see js/defects.js)
                val p = clamp01(t / (T - 3))
                fx.tint = 1.0; fx.contrast = lerp(0.12, 0.56, smooth(0.15, 1.0, p))
                fx.blur = lerp(0.006, 0.02, p); fx.glare = lerp(0.8, 1.5, p)
            }
            "glaucoma" -> { fx.maskBlur = 0.045; fx.dim = 0.1; fx.contrast = 0.1; fx.desat = 0.15; fx.edge = 0.8 }
            "amd" -> fx.warp = 1.0
            "neuritis" -> if (eye == 'L') { fx.blur = 0.007; fx.contrast = 0.3; fx.desat = 0.5; fx.redDesat = 0.9; fx.dim = 0.30; fx.maskBlur = 0.04 }
        }
        fx.blur *= e; fx.contrast *= e; fx.tint *= e; fx.glare *= e; fx.desat *= e
        fx.redDesat *= e; fx.dim *= e; fx.warp *= e; fx.maskBlur *= e; fx.edge *= e
        return fx
    }

    class Shape(
        val type: String, val a: Double = 1.0,
        val axis: String = "x", val side: Double = 1.0, val sx: Double = 1.0, val sy: Double = 1.0,
        val cx: Double = 0.0, val cy: Double = 0.0, val r: Double = 0.0, val soft: Double = 0.0,
        val nasal: Double = 1.0, val seed: Double = 1.0, val spread: Double = 1.0, val hole: Double = 0.0,
        val rx: Double = 1.0, val ry: Double = 1.0, val time: Double = 0.0, val dent: Double = 0.0
    )

    /** dark shapes for one eye ('L' / 'R') at time t */
    fun field(cond: String, eye: Char, t: Double, T: Double): List<Shape> {
        val L = eye == 'L'
        return when (cond) {
            "cataract" -> emptyList()   // only a haze (diagram), the headset uses filters
            "glaucoma" -> {     // dark all round, a wide irregular clear area with a slowly moving soft edge
                val q = smooth(0.0, 1.0, clamp01(t / (T - 3)))
                val nasal = if (L) 1.0 else -1.0
                listOf(Shape("tunnel", a = 0.97, nasal = nasal, seed = if (L) 1.0 else 2.3, time = t,
                    rx = lerp(1.05, 0.8, q), ry = lerp(0.62, 0.45, q), cx = -nasal * 0.05, cy = 0.02, soft = 0.42,
                    dent = lerp(0.15, 0.3, q)))
            }
            "amd" -> listOf(Shape("blob", r = 0.2, a = 0.88))
            "neuritis" -> if (L) listOf(
                Shape("disc", r = 0.17, soft = 0.2, a = 0.42),
                Shape("disc", cx = -0.2, cy = -0.02, r = 0.1, soft = 0.16, a = 0.3)
            ) else emptyList()
            "pOpticNerve" -> if (L) listOf(Shape("full")) else emptyList()
            "pChiasm" -> listOf(Shape("half", side = if (L) -1.0 else 1.0))
            "pTemporal" -> if (L) listOf(Shape("half", side = 1.0)) else emptyList()
            "pTract" -> listOf(Shape("half", side = 1.0))
            "pMeyer" -> listOf(Shape("quadrant", sx = 1.0, sy = 1.0))
            "pParietal" -> listOf(Shape("quadrant", sx = 1.0, sy = -1.0))
            "pOccipital" -> listOf(Shape("half", side = 1.0, hole = 0.1))
            else -> emptyList()
        }
    }

    // ---------------------------------------------------------------- painter
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val xferOut = PorterDuffXfermode(PorterDuff.Mode.DST_OUT)
    private val xferIn = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
    private var scratch: Bitmap? = null

    private fun white(a: Double) = Color.argb((clamp01(a) * 255).toInt(), 255, 255, 255)
    private fun black(a: Double) = Color.argb((clamp01(a) * 255).toInt(), 0, 0, 0)
    private fun f(v: Double) = v.toFloat()

    /** Draws the dark areas (white with alpha) into target, a size×size square covering ±extent field units. */
    fun paintField(target: Canvas, size: Int, cond: String, eye: Char, t: Double, extent: Double, total: Double) {
        val env = envelope(t, total)
        for (sh in field(cond, eye, t, total)) {
            val a = sh.a * env
            if (a <= 0.001) continue
            var s = scratch
            if (s == null || s.width != size) { s = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888); scratch = s }
            s!!.eraseColor(Color.TRANSPARENT)
            val c = Canvas(s)
            val k = size / 2.0 / extent
            c.setMatrix(Matrix().apply { setScale(f(k), f(-k)); postTranslate(size / 2f, size / 2f) })   // y up
            drawShape(c, sh, a, extent)
            target.drawBitmap(s, 0f, 0f, null)
        }
    }

    private fun reset() { paint.reset(); paint.isAntiAlias = true; paint.style = Paint.Style.FILL }

    private fun drawShape(c: Canvas, sh: Shape, a: Double, E: Double) {
        reset()
        val big = { c.drawRect(f(-E), f(-E), f(E), f(E), paint) }
        when (sh.type) {
            "full" -> { paint.color = white(a); big() }
            "half" -> {
                paint.shader = if (sh.axis == "x") LinearGradient(f(-SOFT * sh.side), 0f, f(SOFT * sh.side), 0f, white(0.0), white(a), Shader.TileMode.CLAMP)
                else LinearGradient(0f, f(-SOFT * sh.side), 0f, f(SOFT * sh.side), white(0.0), white(a), Shader.TileMode.CLAMP)
                big()
            }
            "quadrant" -> {
                paint.shader = LinearGradient(f(-SOFT * sh.sx), 0f, f(SOFT * sh.sx), 0f, white(0.0), white(a), Shader.TileMode.CLAMP)
                big()
                paint.shader = LinearGradient(0f, f(-SOFT * sh.sy), 0f, f(SOFT * sh.sy), black(0.0), black(1.0), Shader.TileMode.CLAMP)
                paint.xfermode = xferIn
                big()
            }
            "disc" -> {
                val r0 = max(0.001, sh.r - sh.soft / 2); val r1 = sh.r + sh.soft / 2
                paint.shader = RadialGradient(f(sh.cx), f(sh.cy), f(r1), intArrayOf(white(a), white(a), white(0.0)),
                    floatArrayOf(0f, f(r0 / r1), 1f), Shader.TileMode.CLAMP)
                c.drawRect(f(sh.cx - r1), f(sh.cy - r1), f(sh.cx + r1), f(sh.cy + r1), paint)
            }
            "island" -> {   // dark everywhere except an irregular clear island with soft, smudgy edges
                paint.color = white(a); big()
                paint.xfermode = xferOut
                val n = 16; val keep = 0.002; val b = 1 - keep.pow(1.0 / n)
                val ph = sh.seed * 1.7
                val nasalAngle = if (sh.nasal > 0) 0.0 else PI
                paint.color = black(b)
                for (i in 0 until n) {
                    val k = 1 + sh.soft * (1 - 2.0 * i / (n - 1))
                    val path = Path()
                    for (j in 0..72) {
                        val th = j / 72.0 * PI * 2
                        var rr = sh.r * (1 + 0.16 * sin(2 * th + ph) + 0.11 * sin(3 * th + ph * 2.3) + 0.07 * sin(5 * th + ph * 0.7))
                        rr *= 1 - 0.28 * max(0.0, cos(th - nasalAngle))
                        rr *= 1 - 0.16 * max(0.0, sin(th))
                        val x = sh.cx + rr * k * cos(th); val y = sh.cy + rr * k * sin(th)
                        if (j == 0) path.moveTo(f(x), f(y)) else path.lineTo(f(x), f(y))
                    }
                    path.close(); c.drawPath(path, paint)
                }
                paint.xfermode = null
            }
            "tunnel" -> {
                paint.color = white(a); big()
                paint.xfermode = xferOut
                val n = 18
                val ph = sh.seed * 1.3; val w = sh.time * 0.35
                val nasalAngle = if (sh.nasal > 0) 0.0 else PI
                fun bump(th: Double, at: Double): Double { val d = atan2(sin(th - at), cos(th - at)); return exp(-d * d / 0.25) }
                // each ring removes just enough that the darkness fades evenly from the outer to the inner ring
                fun left(i: Int) = 1 - smooth(0.0, 1.0, (i + 1).toDouble() / n)
                for (i in 0 until n) {
                    val k = 1 + sh.soft * (1 - 2.0 * i / (n - 1))
                    paint.color = black(if (i == n - 1) 1.0 else 1 - left(i) / (if (i > 0) left(i - 1) else 1.0))
                    val path = Path()
                    for (j in 0..96) {
                        val th = j / 96.0 * PI * 2
                        var rr = 1 / hypot(cos(th) / sh.rx, sin(th) / sh.ry)
                        rr *= 1 + 0.09 * sin(2 * th + ph + w) + 0.07 * sin(3 * th + ph * 2.1 - w * 0.8) + 0.05 * sin(5 * th + ph * 0.6 + w * 1.3)
                        rr *= 1 - sh.dent * bump(th, PI / 2 + 0.35 * sin(w * 0.5 + ph)) -
                            0.6 * sh.dent * bump(th, -PI / 2 + 0.4 * sin(w * 0.4 + ph * 2))
                        rr *= 1 - 0.15 * max(0.0, cos(th - nasalAngle))
                        val x = sh.cx + rr * k * cos(th); val y = sh.cy + rr * k * sin(th)
                        if (j == 0) path.moveTo(f(x), f(y)) else path.lineTo(f(x), f(y))
                    }
                    path.close(); c.drawPath(path, paint)
                }
                paint.xfermode = null
            }
            "puffs" -> {    // soft smudges along the arcs above and below fixation
                var seed = sh.seed * 97
                val rnd = { seed = (seed * 9301 + 49297) % 233280; seed / 233280 }
                for (i in 0 until 14) {
                    val upper = i < 9
                    val ang = (if (upper) 1 else -1) * (0.35 + rnd() * 1.1) * sh.spread
                    val th = if (sh.nasal > 0) ang else PI - ang
                    val rr = 0.42 + rnd() * 0.32
                    val x = rr * cos(th); val y = rr * sin(th); val pr = 0.09 + rnd() * 0.11
                    val pa = a * (0.55 + rnd() * 0.45) * (if (upper) 1.0 else 0.75)
                    paint.shader = RadialGradient(f(x), f(y), f(pr), intArrayOf(white(pa), white(pa * 0.6), white(0.0)),
                        floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
                    c.drawRect(f(x - pr), f(y - pr), f(x + pr), f(y + pr), paint)
                }
            }
            "blob" -> {     // irregular, soft-edged blotch: many stacked faint copies
                val n = 12; val b = 1 - (1 - clamp01(a)).pow(1.0 / n)
                paint.color = white(b)
                for (i in 0 until n) {
                    val scale = 1.4 - i * 0.07
                    val path = Path()
                    for (j in 0..48) {
                        val th = j / 48.0 * PI * 2
                        val rr = sh.r * scale * (1 + 0.22 * sin(3 * th + 0.7) + 0.13 * sin(5 * th + 2.1) + 0.08 * cos(7 * th))
                        val x = rr * cos(th); val y = rr * sin(th) * 0.92
                        if (j == 0) path.moveTo(f(x), f(y)) else path.lineTo(f(x), f(y))
                    }
                    path.close(); c.drawPath(path, paint)
                }
            }
        }
        if (sh.hole > 0) {  // clear central circle (macular sparing), soft edge
            reset()
            paint.xfermode = xferOut
            paint.shader = RadialGradient(0f, 0f, f(sh.hole * 1.4), intArrayOf(black(1.0), black(1.0), black(0.0)),
                floatArrayOf(0f, f(0.6 / 1.4), 1f), Shader.TileMode.CLAMP)
            c.drawRect(-1.5f, -1.5f, 1.5f, 1.5f, paint)
        }
    }
}
