package org.eyeexhibit.headset

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import kotlin.math.abs

/**
 * A video or sound that plays in step with the tablet:
 * the file's time 0 plays at the server time startAt, and a player that drifts
 * more than TIMING.maxDrift seconds is moved back into step.
 * Use only on the main thread.
 */
class SyncedPlayer(ctx: Context, private val serverNow: () -> Long) {
    val player: ExoPlayer = ExoPlayer.Builder(ctx).build()
    private var src: String? = null
    private var startAt = 0L
    var active = false
        private set
    private var lastSeek = 0L
    @Volatile var aspect = 16f / 9f
        private set

    init {
        player.addListener(object : Player.Listener {
            override fun onVideoSizeChanged(v: VideoSize) {
                if (v.width > 0 && v.height > 0) aspect = v.width * v.pixelWidthHeightRatio / v.height
            }
        })
    }

    fun play(path: String?, startAtMs: Long) {
        if (path.isNullOrEmpty()) { stop(); return }
        if (path != src) {
            src = path
            player.setMediaItem(MediaItem.fromUri(Data.uri(path)))
            player.prepare()
        }
        startAt = startAtMs
        active = true
        tick()
    }

    fun stop() {
        active = false
        player.playWhenReady = false
    }

    /** seconds into the file both devices should be at now (negative = not started yet) */
    private fun target() = (serverNow() - startAt) / 1000.0
    private fun durationS(): Double = player.duration.let { if (it == C.TIME_UNSET || it <= 0) Double.NaN else it / 1000.0 }

    fun ended(): Boolean {
        val d = durationS()
        return active && !d.isNaN() && target() >= d - 0.05
    }

    /** call a few times a second */
    fun tick() {
        if (!active) return
        val t = target()
        if (t < 0) {                                   // not started yet: wait at the first frame
            player.playWhenReady = false
            if (player.currentPosition > 50) player.seekTo(0)
            return
        }
        val d = durationS()
        if (!d.isNaN() && t >= d) { player.playWhenReady = false; return }
        player.playWhenReady = true
        val now = System.currentTimeMillis()
        if (player.playbackState == Player.STATE_READY && now - lastSeek > 1000 &&
            abs(player.currentPosition / 1000.0 - t) > Data.maxDrift) {
            player.seekTo((t * 1000).toLong() + 80)    // a little ahead: the jump itself takes a moment
            lastSeek = now
        }
    }

    fun setVolume(v: Float) { player.volume = v }
    fun release() = player.release()
}
