# Time is Brain 🧠⏱

An offline stroke-awareness quiz game for 2 tablets and a TV.
Two teams (Red and Blue), or one Solo player, watch a story video and answer questions.
Every second of thinking costs brain cells ("neurons"), so the player who loses the fewest neurons wins.

---

## 1. First-time set-up (do this once, with internet)

1. Copy this whole folder to the laptop, for example to `C:\TimeIsBrain`.
2. Put your media files into the `media` folder:
   `stroke.mp4`, `srilanka.mp4`, `stroke_en.vtt`, `stroke_ta.vtt`, `stroke_si.vtt`
3. Double-click **`start.bat`**.
   - The first time, it installs the game (about 1 minute, **needs internet**).
   - **Windows Firewall** may ask "Allow Node.js?". Tick **BOTH** boxes (Private **and** Public) and press **Allow**.
     If you miss this, the tablets cannot connect. (To fix it later, see "Problems" below.)
4. A blue window opens with big numbers: that is the laptop's address. **Keep this window open** all day.

After this, the game works with **no internet**.

## 2. Starting the game (every day)

1. Turn on the phone hotspot. Connect the **laptop** and **both tablets** to it.
2. Double-click **`start.bat`**. The host page opens in the browser by itself.
   The blue window shows the exact addresses to type.

### TV (32" by HDMI, "Extend" mode)
- Easy way: double-click **`open-tv.bat`**. It opens the TV screen in Edge, fullscreen, with sound.
- Or by hand: open a **new browser window** (Ctrl+N), type `localhost:3000/tv`, drag the window onto the TV,
  then click the green **Start TV** button (this turns on fullscreen and sound).

### Host page (laptop screen)
- Address: `localhost:3000/host`, PIN **1990**.

### Tablets (Chrome)
- Red tablet: type `http://<laptop address>:3000/tab?team=red`
- Blue tablet: type `http://<laptop address>:3000/tab?team=blue`
- Example: `http://192.168.43.25:3000/tab?team=red` (use the address shown in the blue window).
- You can also scan the QR codes on the host page.
- Press **Go fullscreen** at the top of the tablet.
- Tip: in Chrome's menu ⋮ choose **Add to Home screen**, so next time you just tap the icon.

## 3. How a game works

1. A visitor picks a language, "Team vs Team" or "Solo", types a name (or presses Skip), and presses **READY**.
2. Team mode starts when both tablets are ready. Solo starts at once.
   You can also press **▶ Start** on the host page.
3. The story video plays on the TV and stops at each round. The questions appear.
4. Players tap all the correct answers. A wrong tap costs 500,000 neurons and freezes the tablet for 2 seconds.
5. After each question the TV shows the answer and the explanation.
6. At the end the TV shows the winner, saves the score, and goes back to the home screen.

### Host buttons
| Button | What it does |
|---|---|
| ▶ Start | Start now with the tablets that are ready |
| ⏸ Pause everything | Freezes the video, counters and timers. Press again to resume |
| ⏭ Next | Goes to the next step (skips the video, ends a question, next question…) |
| ✋ Hold | Keeps the explanation on the TV until you press it again |
| ⤼ Skip question | Jumps to the next question with no explanation |
| ↺ Replay video | Plays the current part of the story video again |
| ✖ Reset game | Stops the game and goes back to the home screen |
| Continue as SOLO | If one tablet stops working during a game, the other one keeps playing |
| Clear scoreboard / Reset guest counter | Asks "are you sure?" first |

## 4. Changing the settings

**Easy way:** open the host page, change the numbers in **Settings**, and press **💾 Save settings**.
New timings start from the next game.

**Other way:** open `settings.json` with Notepad, change a number, save, then press
**⟳ Reload questions & texts** on the host page (or restart `start.bat`).

| Setting | Meaning |
|---|---|
| `neuronsPerSecond` | Neurons lost every second while a team is thinking (32000) |
| `wrongTapPenalty` | Extra neurons lost for a wrong tap (500000) |
| `wrongTapFreezeSeconds` | How long a tablet is frozen after a wrong tap |
| `questionTimeLimitSeconds` | Time limit for each question (45) |
| `readLockSeconds` | Reading time before the buttons can be tapped (3) |
| `explanationSeconds` | How long the explanation stays on the TV (10) |
| `resultsScreenSeconds` | How long the results screen stays on (20) |
| `pauses.round1`, `pauses.round2` | Where the story video stops (in seconds). Use **▶ Test** on the host page to check them |
| `defaultSubtitleLanguage` | `ta`, `si` or `en` |
| `hostPin` | The PIN for the host page |

**Notepad tips:** keep the quotes `" "` and the commas `,` exactly as they are.
If the file has a mistake, the game keeps the old settings and shows a warning in **Problems log** on the host page.

## 5. Changing the questions

Open `questions.json` with Notepad. Each question looks like this:

```json
{
  "id": 1,
  "round": 1,
  "text": { "en": "Which symptoms did he have?", "ta": "…", "si": "…", "reviewed": false },
  "options": [
    { "text": { "en": "Slurred speech", "ta": "…", "si": "…", "reviewed": false }, "correct": true },
    { "text": { "en": "High fever", "ta": "…", "si": "…", "reviewed": false }, "correct": false }
  ],
  "explanation": { "en": "…", "ta": "…", "si": "…", "reviewed": false },
  "media": "",
  "explanationSeconds": null
}
```

- `round`: 1 = at home, 2 = at hospital, 3 = after the stroke.
- `correct`: `true` for a right answer, `false` for a wrong one. At least one must be `true`.
- `"reviewed": false`: the Tamil and Sinhala were translated for you. **Please ask a native speaker to check them**,
  then change it to `true` (this is only a note for you; the game does not use it).
- `explanationSeconds`: `null` uses the normal time. Put a number (like `15`) to give this question more time.
- The answer buttons are shuffled in every game.
- The words on the buttons and screens (READY, Skip, Watch the TV…) are in `ui-text.json`.

After saving, press **⟳ Reload questions & texts** on the host page.

## 6. Adding explanation photos or clips

Put a picture or a short video in the `media` folder, named after the question number:

- `q1.jpg` → shown after question 1
- `q7.png` → shown after question 7
- `q4.mp4` → a clip after question 4 (the game moves on when the clip ends)

That's all — the game finds them by itself. (Or type any file name in `"media"` in `questions.json`.)
Picture types: jpg, png, webp, gif. Video types: mp4, webm.

## 7. The slideshow (slides.html)

13 colourful information slides in English, Tamil and Sinhala. They work offline.
**Always open them with `&kiosk=1`** — that hides the small grey test label in the top-right corner.

| Address | What it plays |
|---|---|
| `localhost:3000/slides.html?set=intro&lang=ta&kiosk=1` | Intro: slides 1–6 |
| `localhost:3000/slides.html?set=home&lang=ta&kiosk=1` | Home screen: slides 2, 3, 4, 7, 8, 9 |
| `localhost:3000/slides.html?set=debrief&lang=ta&kiosk=1` | After the game: slides 10–13 |
| `localhost:3000/slides.html?kiosk=1` | No `set` = all 13 slides (for checking) |

`lang` can be `en`, `ta` or `si`.

**Keys for testing:** **S** = change set (all → intro → home → debrief), **L** = change language (en → ta → si),
**← →** = previous / next slide. Without `&kiosk=1` a small label shows where you are, e.g. `debrief · ta · 11/13`.

If you change the slide styling (the class names), the offline style file `public/vendor/slides-tailwind.css`
must be rebuilt — ask Claude to do it.

## 8. Moving the game to another laptop

Copy the whole folder (including `node_modules`) to the other laptop. It needs Node.js installed.
Double-click `start.bat`. No internet needed.

## 9. Problems?

| Problem | Fix |
|---|---|
| Tablet says "This site can't be reached" | Check that the tablet and laptop are on the **same hotspot**. Check the address in the blue window (it can change when the hotspot restarts). Check the Firewall (below). |
| Firewall | Start menu → "Allow an app through Windows Firewall" → Change settings → find **Node.js** → tick **Private** and **Public** → OK |
| No sound on the TV | Click once anywhere on the TV screen (browsers need one click before playing sound) |
| TV not fullscreen | Click on the TV screen and press **F11** |
| "The game is already running" | Another start.bat window is open. Use that one, or close it and start again |
| Something froze | Press **✖ Reset game** on the host page. If that does not help, close the blue window and double-click start.bat again. Scores are saved on disk |
| Tablet screen goes dark | Tablet Settings → Display → Screen timeout → 30 minutes |

Errors are written to `logs/error.log`. Scores are in `data/scores.json`.

## 10. Backing up the code to GitHub (private)

The code (not the media, not the scores) is stored in git. The `.gitignore` file keeps
`media/`, `data/`, `logs/` and `node_modules/` out of GitHub, so big videos are never uploaded.

**Easy way, with GitHub Desktop:**
1. Install **GitHub Desktop** from desktop.github.com and sign in.
2. File → Clone repository → choose your repository → choose a folder (e.g. `C:\TimeIsBrain`).
3. Copy your media files into the `media` folder of that clone.
4. After you change something (for example `questions.json`), open GitHub Desktop,
   type a short note like "Fixed Tamil Q3", press **Commit**, then **Push origin**.

**Make sure the repository is private:** on github.com open the repository → Settings →
scroll to "Danger Zone" → "Change visibility" → Private.

**Back up the media separately** (they are too big for GitHub): copy the `media` folder to a USB stick
or Google Drive. Back up `data/scores.json` too if you want to keep the scores.

## 11. Files in this folder

| File | What it is |
|---|---|
| `start.bat` | Double-click to start the game |
| `open-tv.bat` | Opens the TV screen on the second screen |
| `settings.json` | Game settings |
| `questions.json` | Questions, answers and explanations in 3 languages |
| `ui-text.json` | Words on the buttons and screens in 3 languages |
| `public/slides.html` | The information slideshow |
| `media/` | Videos, subtitles and explanation pictures |
| `data/` | Scores and the guest counter (made by the game) |
| `logs/` | Error log and game log |
| `server.js`, `public/` | The game program |

The fonts (Noto Sans, Noto Sans Tamil, Noto Sans Sinhala) are inside `public/fonts`
(SIL Open Font License, see `public/fonts/OFL-LICENSE.txt`).
