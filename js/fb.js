// Connects to Firebase Realtime Database (loaded from Google's CDN).
import { firebaseConfig, FIREBASE_SDK } from "./config.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const dbApi = await import(`${FIREBASE_SDK}/firebase-database.js`);

export const app = initializeApp(firebaseConfig);
export const db = dbApi.getDatabase(app);
export const { ref, set, update, get, onValue, onDisconnect, serverTimestamp } = dbApi;

// Server time = local time + offset (keeps tablet and phone clocks in agreement).
let offset = 0;
dbApi.onValue(dbApi.ref(db, ".info/serverTimeOffset"), s => { offset = s.val() || 0; });
export const serverNow = () => Date.now() + offset;

// Calls cb(true/false) whenever this device's connection to Firebase changes.
export function watchConnection(cb) {
  dbApi.onValue(dbApi.ref(db, ".info/connected"), s => cb(s.val() === true));
}
