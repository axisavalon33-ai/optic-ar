package org.eyeexhibit.headset

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import kotlin.math.max
import kotlin.math.sin

/**
 * The transparent layer drawn on top of the picture in each eye:
 * glowing selected part, big disease name, "Loading…", "Please wait", errors.
 * Same layout as drawOver() in js/viewer.js. Width is always 1280; height follows the picture.
 */
class Overlay {
    var bitmap: Bitmap = Bitmap.createBitmap(1280, 720, Bitmap.Config.ARGB_8888)
        private set
    private var canvas = Canvas(bitmap)
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bold = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)

    /** returns true if the bitmap was replaced by one of a new size */
    fun ensureSize(aspect: Float): Boolean {
        val h = Math.round(1280 / aspect).coerceIn(200, 2000)
        if (h == bitmap.height) return false
        bitmap = Bitmap.createBitmap(1280, h, Bitmap.Config.ARGB_8888)
        canvas = Canvas(bitmap)
        return true
    }

    private fun fit(text: String, px: Float, maxW: Float, typeface: Typeface) {
        p.typeface = typeface
        var f = px
        do { p.textSize = f; f -= 2f } while (p.measureText(text) > maxW && f > 14f)
    }

    private fun centreText(text: String, x: Float, y: Float) {
        p.textAlign = Paint.Align.CENTER
        canvas.drawText(text, x, y - (p.descent() + p.ascent()) / 2, p)
    }

    class Spot(val x: Double, val y: Double, val r: Double, val red: Boolean)

    fun draw(mode: String, nowMs: Long, lang: String, homeShown: Boolean,
             spot: Spot?, title: String?, subtitle: String?, name: String?, error: String?) {
        val c = canvas
        val wc = 1280f; val hc = bitmap.height.toFloat()
        c.drawColor(Color.TRANSPARENT, android.graphics.PorterDuff.Mode.CLEAR)
        p.reset(); p.isAntiAlias = true

        when (mode) {
            "loading" -> {
                c.drawColor(Color.BLACK)
                val a = (nowMs / 180.0 * 180 / Math.PI).toFloat() % 360
                p.style = Paint.Style.STROKE; p.strokeWidth = 16f; p.strokeCap = Paint.Cap.ROUND
                val oval = RectF(wc / 2 - 70, hc * 0.42f - 70, wc / 2 + 70, hc * 0.42f + 70)
                p.color = Color.argb(38, 255, 255, 255); c.drawArc(oval, 0f, 360f, false, p)
                p.color = Color.rgb(255, 181, 71); c.drawArc(oval, a, 234f, false, p)
                p.style = Paint.Style.FILL
                val txt = Data.tr(lang, "loading")
                fit(txt, 72f, wc - 80, bold); p.color = Color.rgb(243, 241, 234); centreText(txt, wc / 2, hc * 0.68f)
            }
            "choice" -> {     // "Would you like to watch an introduction to the eye?"
                c.drawColor(Color.rgb(8, 18, 42))
                // the question on two lines (split at the space nearest the middle), as large as fits
                val q = Data.tr(lang, "introQuestion")
                val cut = q.indices.filter { q[it] == ' ' }.minByOrNull { kotlin.math.abs(it - q.length / 2) } ?: -1
                val lines = if (cut > 0) listOf(q.substring(0, cut), q.substring(cut + 1)) else listOf(q)
                fit(lines.maxByOrNull { it.length } ?: q, 72f, wc - 100, bold)
                while (lines.any { p.measureText(it) > wc - 100 } && p.textSize > 14f) p.textSize -= 2f
                p.color = Color.rgb(255, 207, 122)
                lines.forEachIndexed { i, l -> centreText(l, wc / 2, hc * (if (lines.size > 1) 0.27f + i * 0.13f else 0.34f)) }
                for ((k, x) in listOf("watchIntro" to wc * 0.3f, "skipIntro" to wc * 0.7f)) {
                    val w = wc * 0.34f; val h = 110f; val y = hc * 0.62f
                    val r = RectF(x - w / 2, y - h / 2, x + w / 2, y + h / 2)
                    p.style = Paint.Style.FILL; p.color = Color.argb(26, 255, 255, 255); c.drawRoundRect(r, 55f, 55f, p)
                    p.style = Paint.Style.STROKE; p.strokeWidth = 4f; p.color = Color.argb(230, 255, 181, 71); c.drawRoundRect(r, 55f, 55f, p)
                    p.style = Paint.Style.FILL
                    val t = Data.tr(lang, k)
                    fit(t, 46f, w - 40, bold); p.color = Color.rgb(243, 241, 234); centreText(t, x, y)
                }
            }
            "lang" -> {
                if (!homeShown) c.drawColor(Color.rgb(8, 18, 42))
                p.color = Color.argb(199, 5, 12, 31); c.drawRect(0f, hc - 190, wc, hc, p)
                Data.languages().forEachIndexed { i, l ->
                    val t = Data.tr(l, "pleaseWait")
                    fit(t, 40f, wc - 80, Typeface.DEFAULT_BOLD); p.color = Color.rgb(243, 241, 234)
                    centreText(t, wc / 2, hc - 150 + i * 55)
                }
            }
            "still" -> {
                if (spot != null) {
                    val pulse = (0.6 + 0.4 * sin(nowMs / 160.0)).toFloat()
                    val x = (spot.x / 100 * wc).toFloat(); val y = (spot.y / 100 * hc).toFloat()
                    val r = max(16f, (spot.r / 100 * wc).toFloat())
                    val c0 = if (spot.red) Color.argb((217 * pulse).toInt(), 255, 50, 50) else Color.argb((153 * pulse).toInt(), 255, 181, 71)
                    val c1 = if (spot.red) Color.argb((115 * pulse).toInt(), 255, 30, 30) else Color.argb((71 * pulse).toInt(), 255, 181, 71)
                    p.shader = RadialGradient(x, y, r * 2.4f, intArrayOf(c0, c1, Color.TRANSPARENT), floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP)
                    c.drawRect(x - r * 2.4f, y - r * 2.4f, x + r * 2.4f, y + r * 2.4f, p)
                    p.shader = null
                    p.style = Paint.Style.STROKE; p.strokeWidth = 6f
                    p.color = if (spot.red) Color.argb(242, 255, 80, 80) else Color.argb(242, 255, 190, 90)
                    c.drawCircle(x, y, r * (1 + 0.08f * pulse), p)
                    p.style = Paint.Style.FILL
                }
                if (!title.isNullOrEmpty()) {
                    val bh = if (subtitle.isNullOrEmpty()) 140f else 190f
                    p.color = Color.argb(224, 5, 12, 31); c.drawRect(0f, hc - bh, wc, hc, p)
                    fit(title, 80f, wc - 60, bold); p.color = Color.rgb(255, 207, 122); centreText(title, wc / 2, hc - bh + 68)
                    if (!subtitle.isNullOrEmpty()) {
                        fit(subtitle, 40f, wc - 60, Typeface.DEFAULT); p.color = Color.rgb(243, 241, 234); centreText(subtitle, wc / 2, hc - 48)
                    }
                }
            }
            "name" -> {         // condition name at the start of the AR effect
                if (!name.isNullOrEmpty()) {
                    fit(name, 76f, wc - 160, bold)
                    val w = p.measureText(name) + 80
                    p.color = Color.argb(170, 5, 12, 31)
                    c.drawRoundRect(RectF(wc / 2 - w / 2, hc * 0.22f - 60, wc / 2 + w / 2, hc * 0.22f + 60), 30f, 30f, p)
                    p.color = Color.rgb(255, 207, 122); centreText(name, wc / 2, hc * 0.22f)
                }
            }
        }
        if (!error.isNullOrEmpty()) {
            val lines = error.split("\n")
            p.shader = null; p.style = Paint.Style.FILL
            p.color = Color.argb(235, 170, 20, 20)
            val boxH = 70f + lines.size * 64f
            c.drawRoundRect(RectF(140f, hc / 2 - boxH / 2, wc - 140, hc / 2 + boxH / 2), 28f, 28f, p)
            p.color = Color.WHITE
            lines.forEachIndexed { i, l ->
                fit(l, 52f, wc - 340, bold)
                centreText(l, wc / 2, hc / 2 - boxH / 2 + 67 + i * 64)
            }
        }
    }
}
