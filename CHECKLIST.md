# Exhibition-day checklist ✅

## The day before
- [ ] Ask a Tamil speaker and a Sinhala speaker to check `questions.json` and `ui-text.json`
- [ ] Play one full Team game and one Solo game at home
- [ ] Check the pause points with **▶ Test** on the host page (Settings)
- [ ] Charge the laptop, both tablets and the phone (hotspot)
- [ ] Copy the whole game folder to a USB stick (a spare copy)
- [ ] On the tablets: Screen timeout → 30 minutes. Turn off auto-rotate (keep landscape). Turn on "Do not disturb"
- [ ] On the laptop: Settings → System → Power → Screen and sleep → **Never** (when plugged in)
- [ ] Turn off Windows Update restarts for tomorrow (Settings → Windows Update → Pause updates)

## Pack
- [ ] Laptop + charger
- [ ] 2 tablets + chargers (and long cables / power strip)
- [ ] Phone for the hotspot + charger
- [ ] HDMI cable (and adapter if needed)
- [ ] Extension cord / multi-plug
- [ ] USB stick with a spare copy of the game and media
- [ ] Tablet stands, a cloth to clean the screens

## Set-up at the stall (about 15 minutes)
1. [ ] Plug everything into power
2. [ ] Turn on the phone **hotspot**. Turn mobile data **off** if you want (the game does not need internet)
3. [ ] Connect the **laptop** to the hotspot Wi-Fi
4. [ ] Connect the **TV** by HDMI. Press **Windows + P** → **Extend**
5. [ ] Double-click **start.bat**. Write down the laptop address it shows: `http://______________:3000`
6. [ ] Host page opens by itself. PIN **1990**. Check **Files check**: everything is green ✓
7. [ ] Double-click **open-tv.bat** (or open `localhost:3000/tv` in a new window, drag it to the TV, click **Start TV**)
8. [ ] Host page shows "● TV screen is open"
9. [ ] Turn on **Home video sound** on the host page if you want sound
10. [ ] Connect both **tablets** to the hotspot. Open Chrome:
    - Red: `http://<address>:3000/tab?team=red`
    - Blue: `http://<address>:3000/tab?team=blue`
    (or scan the QR codes on the host page)
11. [ ] Press **Go fullscreen** on each tablet
12. [ ] Host page shows both tablets "● connected"
13. [ ] Play one quick test game. Press **✖ Reset game** at any time to stop
14. [ ] Set the TV volume, check the subtitles are readable from 3 metres

## During the day
- Keep the blue **start.bat** window open (you can minimise it)
- Keep the laptop plugged in and the lid **open**
- If a tablet loses Wi-Fi, it reconnects by itself and continues the game
- If a tablet stops working during a game → host page → **Continue as SOLO** with the other team
- If a visitor leaves halfway through set-up, the tablet goes back to the language screen after 3 minutes
- Use **⏸ Pause everything** if you need to explain something, **✋ Hold** to keep an explanation on screen
- Charge the tablets during breaks

## If something goes wrong
| What | Do this |
|---|---|
| Tablet can't connect | Same hotspot? Address correct (it changes if the hotspot restarts — see the blue window)? Firewall allowed for Node.js (Private + Public)? |
| No sound on TV | Click once on the TV screen |
| TV shows the wrong screen | Click the TV window, press F11. Or close it and run open-tv.bat again |
| Game stuck | Host page → ✖ Reset game |
| Still stuck | Close the blue window, double-click start.bat again. Refresh the TV and tablets (scores are kept) |
| Laptop restarted | Double-click start.bat, then open the TV and tablets again |

## At the end of the day
- [ ] Copy `data/scores.json` to the USB stick if you want to keep the scores
- [ ] Clear the scoreboard for tomorrow if needed (host page → 🗑 Clear scoreboard)
- [ ] Close the blue window to stop the game
