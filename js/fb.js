// Connects to Firebase Realtime Database (loaded from Google's CDN) and signs in the exhibit account.
import { firebaseConfig, FIREBASE_SDK } from "./config.js";

const { initializeApp } = await import(`${FIREBASE_SDK}/firebase-app.js`);
const dbApi = await import(`${FIREBASE_SDK}/firebase-database.js`);
const authApi = await import(`${FIREBASE_SDK}/firebase-auth.js`);

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

// SIGN-IN: only the exhibit account may read and write the database (see database.rules.json).
// The device remembers the sign-in, so it is asked for only once.
const auth = authApi.getAuth(app);
export const authReady = new Promise(res => { const off = authApi.onAuthStateChanged(auth, u => { off(); res(u); }); });
export const currentUser = () => auth.currentUser;
export const signIn = (email, password) => authApi.signInWithEmailAndPassword(auth, email, password);
export const signOut = () => authApi.signOut(auth);
