package org.eyeexhibit.headset

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.database.DataSnapshot
import com.google.firebase.database.DatabaseError
import com.google.firebase.database.DatabaseReference
import com.google.firebase.database.FirebaseDatabase
import com.google.firebase.database.ServerValue
import com.google.firebase.database.ValueEventListener

/**
 * Connection to the same Firebase Realtime Database as the web pages.
 * Listens to what the tablet asks for and sends a heartbeat so the tablet shows "Headset connected".
 */
class Net(private val station: String, private val listener: Listener) {
    interface Listener {
        fun onShow(v: Map<String, Any?>)
        fun onCalib(v: Map<String, Any?>)
        fun onHotspots(v: Map<String, Any?>)
        fun onConnected(on: Boolean)
    }

    @Volatile private var offset = 0L
    /** Firebase server time in milliseconds (the same clock the tablet uses) */
    fun serverNow() = System.currentTimeMillis() + offset

    private var db: FirebaseDatabase? = null
    private val listeners = mutableListOf<Pair<DatabaseReference, ValueEventListener>>()

    fun start(ctx: Context) {
        val c = Data.root.getJSONObject("firebaseConfig")
        val url = c.getString("databaseURL")
        val app = if (FirebaseApp.getApps(ctx).isEmpty()) {
            val opts = FirebaseOptions.Builder()
                .setApiKey(c.getString("apiKey"))
                .setApplicationId(c.getString("appId"))
                .setDatabaseUrl(url)
                .setProjectId(c.getString("projectId"))
                .build()
            FirebaseApp.initializeApp(ctx, opts)
        } else FirebaseApp.getInstance()
        val d = FirebaseDatabase.getInstance(app, url)
        db = d
        listen(d.getReference(".info/serverTimeOffset")) { offset = (it.value as? Number)?.toLong() ?: 0L }
        listen(d.getReference(".info/connected")) {
            val on = it.value == true
            if (on) ref("presence").onDisconnect().removeValue()
            listener.onConnected(on)
        }
        listen(ref("show")) { s -> asMap(s.value)?.let { listener.onShow(it) } }
        listen(ref("calibration")) { s -> listener.onCalib(asMap(s.value) ?: emptyMap()) }
        listen(d.getReference("exhibit/hotspots")) { s -> listener.onHotspots(asMap(s.value) ?: emptyMap()) }
    }

    fun stop() {
        for ((r, l) in listeners) r.removeEventListener(l)
        listeners.clear()
        db?.let { ref("presence").removeValue() }
    }

    fun beat(data: Map<String, Any?>) {
        if (db == null) return
        ref("presence").setValue(data + ("lastSeen" to ServerValue.TIMESTAMP))
    }

    private fun ref(p: String) = db!!.getReference("exhibit/stations/$station/$p")

    private fun listen(r: DatabaseReference, f: (DataSnapshot) -> Unit) {
        val l = object : ValueEventListener {
            override fun onDataChange(s: DataSnapshot) = f(s)
            override fun onCancelled(e: DatabaseError) {}
        }
        r.addValueEventListener(l)
        listeners.add(r to l)
    }
}
