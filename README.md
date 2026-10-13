# Whack-a-Zuzu

A 60-second whack-a-mole game starring Zuzu, the robot from my portfolio. Bonk Zuzu as it
pops out of the hatches, build combos, and don't hit the bombs.

**Play it:** https://nirajsaud.github.io/whack-a-zuzu/

## How to play

- **Bonk Zuzu** for a point. Every 4 hits in a row raises your multiplier, up to x5.
- **Gold Zuzu** is rare, quick, and worth 5.
- **Clock Zuzu** adds 3 seconds to the round.
- **Bombs** cost 3 points and break your combo. So does swinging at an empty hatch.
- The pace picks up through the round, and the last 10 seconds are a frenzy.

Tap the smiley to play with your own face in Zuzu's helmet. The photo is cropped in your
browser and never leaves your device. After a round, Share sends a picture of your score
with a challenge link: whoever opens it sees the score they have to beat.

## How it's built

Plain HTML, CSS and JavaScript, with no build step and no backend.

- **Animation:** [GSAP](https://gsap.com) for the pop-ups, hits, combo badge and end card.
- **Sound:** every effect is synthesised with the Web Audio API, so there are no audio files.
- **Your own face and the share picture:** drawn with the Canvas API, entirely in the browser.
- **Layout:** fits upright and sideways phones, tablets and desktops without scrolling. With
  a mouse, the cursor becomes a mallet and things stay up a little longer.
- **Safety:** a content security policy, and an integrity check on the one outside script.

| File | What it does |
|---|---|
| `index.html` | The page, the hole template and the photo picker |
| `style.css` | All styling and layout |
| `game.js` | The game: spawning, scoring, combos, frenzy, the end card |
| `sound.js` | Sound effects |
| `face.js` | Play with your own face |
| `share.js` | The share picture and Share button |

## Run it locally

It needs to be served over HTTP (opening the file directly won't load everything):

```bash
python -m http.server 5173
```

Then open `http://localhost:5173`.
