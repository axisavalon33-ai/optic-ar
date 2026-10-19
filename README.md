# Eye Exhibit – neurology exhibition AR app

Two web pages that talk to each other through Firebase:

| Page | Device | What it does |
|---|---|---|
| `controller.html` | Tablet | Visitors choose a language, watch the videos, tap the eye or the visual pathway |
| `viewer.html` | Android phone inside the VR box | Shows the camera view and simulates the eye condition the visitor chose |

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
js/viewer.js        headset logic (camera + lens distortion)
js/ar-scene.js      3D eye / visual pathway for selection inside the headset
js/hands.js         optional hand-touch tracking (MediaPipe)
js/vendor/          Three.js 3D library (copy kept in the project)
js/fb.js            Firebase connection
videos/             eye-intro.mp4, pathway.mp4                        (placeholders for now)
images/             eye-still.jpg, pathway-still.jpg                  (placeholders for now)
audio/              eye-intro-ta/si.mp3, pathway-ta/si.mp3            (placeholder beeps for now)
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
3. Put the phone in the VR box. You never need to touch it again.
   "Please wait" in three languages means it is ready.

**Tablet (controller)**

1. Open the controller link. Tip: in Chrome or Safari use **Add to Home Screen** so it opens full screen like an app.
2. The small dot at the bottom right is **green** when the phone is connected and **red** when it is not.
3. A visitor picks a language, watches the video, and taps parts of the picture.
   "Show in AR" (or a tap on the pathway) starts 20 seconds in the headset. The buttons
   are locked during that time, and the tablet shows the same visual field the visitor sees.

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

## 3D selection inside the headset (optional)

Instead of tapping the tablet, visitors can choose eye parts **inside the headset**: a cut-away 3D eye floats about
1 metre in front of them, and they **look at a part and hold** for 2 seconds (a ring fills around the small white dot).

**Switch it on:** tablet → hold the top-right corner 3 s → *3D selection in the headset* → **Selection: Headset**.
(Default is **Tablet**, the original flow with hotspots on the tablet.)

| Setting (calibration panel) | Meaning |
|---|---|
| Selection | Tablet (original) / Headset (3D eye) |
| Selection method | Look and hold (default) / Hand touch / Both |
| Hold time | 1–3 seconds of looking before a part is selected |
| Model distance | How far away the 3D model floats (metres) |
| Model size | Bigger / smaller model |
| Camera field of view | Match this to the phone camera so the model sits still in the view (default 42°) |

**Flow:** language → eye video on the tablet → tablet says *Put on the headset* → in the headset: Lens = Cataract,
Retina = AMD, Optic disc = Glaucoma, Optic nerve = two floating choices (Optic neuritis / Visual field defects).
Visual field defects shows a 3D visual pathway with 7 selectable sites. A selected part glows red for 2 s, the model
fades, the 20-second effect runs, then the model comes back. Floating **Back** / **Home** buttons sit under the model.

**Tablet while the visitor explores:** shows *Looking at* / *Selected* and the visual field diagram during each effect,
so the queue can follow. The small **Operator** button opens backup controls: run any effect, **Recentre model**
(puts the model straight ahead), and **Headset back to the eye**.

**Hand touch:** uses the rear camera to find the visitor's index fingertip (a glowing dot); hold it on a part for 1 s.
If no hand is found, or the phone is too slow (under 20 frames per second), it falls back to look and hold by itself.
Hand tracking needs internet (it downloads about 10 MB the first time) and is only loaded when switched on.

**Your own 3D models (optional):** put `models/eye.glb` and/or `models/pathway.glb` in a `models` folder.
Name the parts in your 3D program so the names contain: eye – `lens`, `retina` (or `macula`), `disc`, `nerve`;
pathway – `nerve`, `chiasm`, `temporal`, `tract`, `meyer`, `parietal`, `occipital`. Without these files the built-in
shapes are used. Keep models simple (low polygon) so the phone stays smooth.

---

## The headset also shows the tablet's screen

While the visitor waits, the headset shows a **floating screen** in front of them that mirrors the tablet:
the intro / pathway **videos** (in step with the tablet, silent – the sound comes from the tablet) and the
**eye / pathway pictures**. When someone touches a part on the tablet, the same part **lights up amber** on the
headset picture with its name and the info-card text; a tapped pathway site glows **red**. When "Show in AR"
starts an effect, the screen fades away so the visitor sees the effect, then it comes back.

Switch it off in the calibration panel: *Tablet screen in the headset → Off*.

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
