package org.eyeexhibit.headset

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONObject
import java.net.URL

// Web address of the exhibit site. Files that are not built into the app are fetched from here.
const val SITE_URL = "https://axisavalon33-ai.github.io/optic-ar/"

/**
 * Settings, words and default positions, copied from js/config.js and js/translations.js
 * into assets/web/data.json by tools/export-android.mjs, so the app and the web pages
 * always use the same values.
 */
object Data {
    lateinit var root: JSONObject
    private lateinit var ctx: Context

    fun load(context: Context) {
        ctx = context.applicationContext
        root = JSONObject(ctx.assets.open("web/data.json").bufferedReader().use { it.readText() })
    }

    private fun timing(key: String, def: Double) = root.getJSONObject("TIMING").optDouble(key, def)
    val effectTotal get() = timing("effectTotal", 20.0)
    val fade get() = timing("fade", 1.5)
    val nameShow get() = timing("nameShow", 2.0)
    val maxDrift get() = timing("maxDrift", 0.3)

    fun media(key: String): String = root.getJSONObject("MEDIA").getString(key)

    fun languages(): List<String> {
        val a = root.getJSONArray("LANGUAGES")
        return (0 until a.length()).map { a.getJSONObject(it).getString("code") }
    }

    /** Word in the chosen language, e.g. tr("ta", "conditions.glaucoma.name"). Falls back to English. */
    fun tr(lang: String, key: String): String =
        (lookup(lang, key) ?: lookup("en", key)) as? String ?: key

    private fun lookup(lang: String, key: String): Any? {
        var o: Any? = root.getJSONObject("T").optJSONObject(lang) ?: return null
        for (k in key.split('.')) o = (o as? JSONObject)?.opt(k) ?: return null
        return o
    }

    val defaultCalibration: JSONObject get() = root.getJSONObject("DEFAULT_CALIBRATION")

    fun defaultHotspots(): MutableMap<String, MutableMap<String, DoubleArray>> {
        val out = mutableMapOf<String, MutableMap<String, DoubleArray>>()
        val h = root.getJSONObject("DEFAULT_HOTSPOTS")
        for (kind in h.keys()) {
            val m = mutableMapOf<String, DoubleArray>()
            val k = h.getJSONObject(kind)
            for (id in k.keys()) {
                val s = k.getJSONObject(id)
                m[id] = doubleArrayOf(s.getDouble("x"), s.getDouble("y"), s.getDouble("r"))
            }
            out[kind] = m
        }
        return out
    }

    // ---------------------------------------------------------------- files
    private val inAssets = HashMap<String, Boolean>()

    /** true if the file (e.g. "videos/home.mp4") is built into the app */
    fun hasAsset(path: String): Boolean = synchronized(inAssets) {
        inAssets.getOrPut(path) {
            try { ctx.assets.open("web/$path").close(); true } catch (e: Exception) { false }
        }
    }

    /** Address for the video / sound player: built-in copy if there is one, otherwise the web site. */
    fun uri(path: String): String = when {
        path.startsWith("http") -> path
        hasAsset(path) -> "asset:///web/$path"
        else -> SITE_URL + path
    }

    fun bitmap(path: String): Bitmap? = try {
        when {
            path.startsWith("http") -> URL(path).openStream().use { BitmapFactory.decodeStream(it) }
            hasAsset(path) -> ctx.assets.open("web/$path").use { BitmapFactory.decodeStream(it) }
            else -> URL(SITE_URL + path).openStream().use { BitmapFactory.decodeStream(it) }
        }
    } catch (e: Exception) { null }
}

/** Headset calibration, as set on the tablet (same names as DEFAULT_CALIBRATION in js/config.js). */
class Calib(private val m: Map<String, Any?> = emptyMap()) {
    fun d(key: String): Double =
        (m[key] as? Number)?.toDouble() ?: Data.defaultCalibration.optDouble(key, 0.0)
    val testPattern get() = m["testPattern"] == true
    val soundFrom get() = (m["soundFrom"] as? String) ?: Data.defaultCalibration.optString("soundFrom", "both")
}

@Suppress("UNCHECKED_CAST")
fun asMap(v: Any?): Map<String, Any?>? = v as? Map<String, Any?>
fun Map<String, Any?>.str(k: String): String? = this[k] as? String
fun Map<String, Any?>.long(k: String): Long = (this[k] as? Number)?.toLong() ?: 0L
