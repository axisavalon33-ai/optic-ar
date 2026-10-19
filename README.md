# Eye Exhibit – neurology exhibition AR app

Two web pages that talk to each other through Firebase:

| Page | Device | What it does |
|---|---|---|
| `controller.html` | Tablet | The operator controls everything: language, video, tapping the eye or the visual pathway, "Show in VR" |
| `viewer.html` | Android phone inside the VR box | Shows the same pictures and video as a screen in front of the visitor, then the camera view with the eye condition |

The visitor in the headset never has to choose anything.

---

## What is in this folder

```
index.html          start page with links to the two pages
controller.html     the tablet page
viewer.html         the headset page
css/controller.css  colours and layout of the tablet page
js/translations.js  ALL the words, in Tamil, English and Sinhala  <- edit this to fix translations
js/config.js        settings: timings, file names, default hotspot positions, default headset calibration
js/defects.js       how each condition looks (shared by the tablet diagram and the headset)
js/controller.js    tablet logic
js/viewer.js        headset logic (screen mode, camera, lens distortion)
js/sync.js          keeps the tablet and the phone playing in step
js/vendor/          Three.js graphics library (copy kept in the project)
js/fb.js            Firebase connection
videos/             eye-intro.mp4, pathway.mp4                        (placeholders for now)
images/             eye-still.jpg, pathway-still.jpg                  (placeholders for now)
audio/              eye-intro-ta/si.mp3, pathway-en/ta/si.mp3         (narration)
database.rules.json Firebase security rules to paste in (step 1)
```

The placeholder videos are 6-second clips with a label, and the placeholder narration is beeps
(a different pitch for each language), so you can test everything before your real media is ready.

---

## Step 1 – Switch on the Firebase database (one time, about 3 minutes)

1. Go to <https://console.firebase.google.com> and open the project **optic-ar-1bf1f**.
2. In the left menu click **Build → Realtime Database**.
   If you see a **Create database** button, click it, choose **Singapore (asia-southeast1)**,
   pick **Start in locked mode**, and click **Enable**.
3. Click the **Rules** tab at the top.
4. Delete everything in the box and paste in the contents of `database.rules.json`:
   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "exhibit": { ".read": true, ".write": true }
     }
   }
   ```
5. Click **Publish**.

This lets the two pages read and write only the `exhibit` part of the database.

---

## Step 2 – Switch on GitHub Pages (one time, about 5 minutes)

GitHub Pages is free web hosting from GitHub. It gives you a web address that the tablet and phone open.

**A. Put the files on the `main` branch.** The app is on the branch
`claude/neurology-vr-exhibition-ajj4po`. To move it to `main`:

1. Open <https://github.com/axisavalon33-ai/optic-ar>.
2. Click the **Pull requests** tab, then the green **New pull request** button.
3. Set **base:** to `main` and **compare:** to `claude/neurology-vr-exhibition-ajj4po`.
4. Click **Create pull request**, click it again on the next screen, then click **Merge pull request** → **Confirm merge**.

**B. Turn on Pages.**

1. In the repository click **Settings** (the gear icon at the top).
2. In the left menu click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
5. Wait 1–2 minutes and refresh the page. A message appears at the top:
   **"Your site is live at https://axisavalon33-ai.github.io/optic-ar/"**.

Your two pages are then at:

- Tablet: **https://axisavalon33-ai.github.io/optic-ar/controller.html**
- Phone: **https://axisavalon33-ai.github.io/optic-ar/viewer.html**

> If the repository is **private** and you have a free GitHub account, Pages will not be offered.
> Make the repository public (Settings → General → scroll down to *Danger Zone* → *Change visibility*).

Every time you change a file on `main`, the site updates by itself within a minute or two.

---

## Step 3 – Use it at the exhibition

**Phone (headset)**

1. Open the viewer link in **Chrome** on the Android phone.
2. Tap **Start** and choose **Allow** when it asks for the camera.
   The page goes full screen, turns sideways (landscape) and keeps the screen awake.
   This one tap also allows sound, keeps the camera open in the background, and starts storing
   the videos, pictures and narration on the phone (about 70 MB, so use good Wi-Fi the first time).
3. Put the phone in the VR box. You never need to touch it again.
   "Please wait" in three languages means it is ready.

**Tablet (controller)**

1. Open the controller link. Tip: in Chrome or Safari use **Add to Home Screen** so it opens full screen like an app.
2. The small dot at the bottom right is **green** when the phone is connected and **red** when it is not.
3. The operator follows this flow – the phone always shows the same thing (see *What the headset shows* below):

| Operator does on the tablet | Tablet | Phone (headset) |
|---|---|---|
| Picks a language | Intro video starts 2 s later | The same video and narration, starting at exactly the same moment |
| (video ends) | Eye picture with hotspots | The same eye picture (no hotspots) |
| Taps a part (lens, retina, optic disc) | Info card with a big **Show in VR** button | The part glows and the disease name appears in big letters |
| Taps **Show in VR** | Visual field diagram + 20 s countdown, buttons locked | "Loading…" for 2 s, then the camera view with the effect for 20 s |
| (20 s later) | Back to the same picture | Back to the same picture |
| Optic nerve → **Visual field defects** | Pathway picture with 7 hotspots + narration | The same picture and narration, in step |
| Taps a pathway site → **Show in VR** | Same as above | Name of the defect, then Loading → effect → back |
| **Back** / **Home** | Previous screen / language screen | Changes in the same way |

---

## Step 4 – Fit the picture to your VR box (calibration)

1. On the tablet, **press and hold the top-right corner for 3 seconds**. The calibration panel slides in.
2. Put the phone in the box and look through it (or ask a helper to look) while you move the sliders.
   The changes appear on the phone straight away.
   - Turn on **Test pattern** to see a grid with a red cross in each eye. Adjust until the two crosses
     merge into one and the grid lines look straight through the lenses.
   - **Distance between eye centres** and **Vertical position** move the two circles.
   - **Distortion strength** fixes curved lines; **Image size** zooms the camera picture.
   - **Eye circle size**, **Roundness**, **Nose cutout** and **Divider** shape the black mask.
3. Type a name (for example "White box") and press **Save profile**. Later, choose it from the
   list and press **Load profile**. **Reset to default** returns to the starting values.
4. Turn **Test pattern** off before visitors arrive.

## Step 5 – Move the tap areas (hotspots) to fit your real images

1. On the tablet, **press and hold the top-left corner for 3 seconds**. The hotspots appear as dashed circles.
2. Drag a circle to move it. Drag the small amber dot on its edge to make it bigger or smaller.
3. Use **Eye image** / **Pathway image** to switch pictures.
4. Press **Save to Firebase**, then **Done**.

Positions are saved as percentages, so they fit any screen size.

---

## Replacing the placeholder media

Keep the **exact same file names** and upload them into the same folders
(on GitHub: open the folder → **Add file → Upload files** → **Commit changes**).

- `videos/eye-intro.mp4` and `videos/pathway.mp4` – MP4 (H.264) videos **with the English narration built in**
  (plus their music and sound effects).
- `images/eye-still.jpg` and `images/pathway-still.jpg` – the **last frame** of each video, at the
  **same size**, so the picture lines up perfectly when the video ends.
- `audio/eye-intro-ta.mp3`, `audio/eye-intro-si.mp3`, `audio/pathway-ta.mp3`, `audio/pathway-si.mp3` –
  Tamil and Sinhala narration, the **same length** as the video. Mix the background music into these
  files if you want music for Tamil and Sinhala visitors.

**Best option – one video per language** (voice always in sync): upload
`videos/eye-intro-en.mp4`, `videos/eye-intro-ta.mp4`, `videos/eye-intro-si.mp4` (and the same for `pathway-…`).
The app plays the video for the chosen language with its own sound. If a language video is missing,
it falls back to the shared video below.

Shared video fallback (set by `VIDEO_BUILT_IN_LANGUAGE` in `js/config.js`):

| Visitor picks | What plays |
|---|---|
| English | The video's own sound at full volume. No extra file needed. |
| தமிழ் | The video is muted; `…-ta.mp3` plays with it. |
| සිංහල | The video is muted; `…-si.mp3` plays with it. |

If you later make music-only videos, set `VIDEO_BUILT_IN_LANGUAGE` to `null`. Each video will then play at
60% volume with the narration file on top for every language (you'd add `…-en.mp3` files too).
Files must be under 100 MB each to upload to GitHub.

After uploading new images, use the hidden edit mode (Step 5) to move the hotspots.

## Correcting the words (Tamil, Sinhala, English)

Open `js/translations.js` on GitHub, click the **pencil icon** to edit, change only the text
between the quotation marks, then click **Commit changes**. The words are grouped by language:
`en` (English), `ta` (Tamil), `si` (Sinhala). Please have a native speaker check the Tamil and Sinhala.
The credits screen text is at `creditsBody`.

---

## Running several stations at once (for example 6 tablets + 6 phones)

Give each tablet + phone pair the same **station number** by adding `?station=N` to both links once:

| Station | Tablet link | Phone link |
|---|---|---|
| 1 | `…/controller.html?station=1` | `…/viewer.html?station=1` |
| 2 | `…/controller.html?station=2` | `…/viewer.html?station=2` |
| … | … | … |
| 6 | `…/controller.html?station=6` | `…/viewer.html?station=6` |

- Each device remembers its number, so after the first visit the plain link or home-screen icon is enough.
- The tablet shows `#3 · Headset connected`; the phone's start screen shows `Station 3`.
- Each station has its own calibration. Calibrate one box, **Save profile**, then **Load profile** on the others.
- Hotspot positions are shared by all stations.
- To change a device's number, open its link once with the new `?station=` number.

---

## What the headset shows (screen mode)

When no effect is running, the phone works like a **cinema screen inside the headset**: the same picture or video
in both eyes, in the middle of the round eye areas, with black around it (the camera is not shown).
The size is set in the calibration panel with **Picture size in screen mode**.

**Keeping the two devices together:** each video and narration starts at a time agreed through Firebase's clock.
If either device gets more than 0.3 seconds out of step, it jumps back into step by itself.

**Sound from** (calibration panel): **Both** (default), **Phone only** (the tablet is silent) or **Tablet only**
(the headset is silent).

**Intro video:** if a video made for the language exists (`videos/eye-intro-ta.mp4` …) it is used with its own sound.
To always use `videos/eye-intro.mp4` plus the narration file instead, set `USE_LANGUAGE_VIDEOS = false` in `js/config.js`.
The pathway part uses only the picture `images/pathway-still.jpg` plus `audio/pathway-en/ta/si.mp3`
(the pathway videos are no longer played).

---

## Android app for the headset phone (better camera)

Instead of opening `viewer.html` in Chrome, the headset phone can run a real Android app.
It does the same job (same tablet, same Firebase, same calibration) but uses Android's own camera system:

- up to **1920×1080 at 60 frames per second** (or **4K** at 30), with continuous autofocus and exposure
- less delay between moving your head and the picture moving
- no browser: no address bar, no "tap for full screen", and the videos and pictures are built into the app

**Install it (one time per phone)**

1. On the Android phone, open this link in Chrome:
   **https://github.com/axisavalon33-ai/optic-ar/releases/download/headset-app/EyeExhibitHeadset.apk**
   (it is also on the start page of the site).
2. Open the downloaded file. Android asks to allow installing apps from Chrome → **Settings → Allow**, then go back and tap **Install**.
   If "Play Protect" warns about an unknown app, tap **More details → Install anyway**.
3. Open **Eye Exhibit Headset**, type the **station number** (the same as the tablet), tap **Start** and allow the camera.
4. Put the phone in the VR box. The tablet shows the green dot as usual.

On the start screen you can also choose the camera quality, and turn the camera picture if it ever shows the wrong way up.
To get back to the start screen, press the phone's Back button.

**Updates:** every time files change on GitHub, GitHub builds a new app by itself (about 5–10 minutes; see the
**Actions** tab). Install it from the same link; it replaces the old one and keeps the settings.
The videos, pictures and narration are built into the app, so after changing media wait for the new build and reinstall.

The app's code is in the `android/` folder; `tools/export-android.mjs` copies the settings, words and media into it.

---

## Troubleshooting

| Problem | What to do |
|---|---|
| Red dot on the tablet | Check that the phone has internet and the viewer page is open. It reconnects by itself. |
| Phone shows "Camera not available" | Use Chrome, open the page with the `https://` link, and allow the camera (tap the lock icon next to the address → Permissions → Camera → Allow). |
| Phone shows "No internet connection" | It reconnects by itself as soon as Wi-Fi or mobile data is back. |
| Nothing happens in the headset | Open the database in Firebase and check that the rules from Step 1 were published. |
| Changes to the files don't show | Wait 2 minutes and reload. On the phone, close the tab and open it again. |
| Not full screen | Open the link in **Chrome** itself, not from inside WhatsApp, Gmail or Messenger (those open a mini-browser that cannot go full screen). Tap the screen once. Best: Chrome ⋮ → **Add to Home screen / Install app**, then open the icon. |
| Two circles don't line up | Use calibration mode (Step 4) with the test pattern. |
