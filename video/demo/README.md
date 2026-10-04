# Sprout demo — motion graphics

The 16 motion graphics for the demo video, built with HyperFrames from the approved [`SCRIPT.md`](SCRIPT.md).

| ID | Graphic | Type | Length | Cut in at |
| --- | --- | --- | --- | --- |
| G01 | Learning is cumulative | full screen | 14 s | 0:00 |
| G02 | The context pile | full screen | 17 s | 0:14 |
| G03 | Sprout wordmark | full screen | 7 s | 0:31 |
| G04 | Five verbs | full screen | 18 s | 0:38 |
| G05 | Play together | full screen | 8 s | 0:56 |
| G06 | The router | full screen | 8 s | 1:04 |
| G07 | Clean graph | **overlay** | 12 s | 1:14, over the syllabus → map recording |
| G08 | Draft → active | **overlay** | 8 s | 1:26, flip lands 0.6 s in: start it 0.6 s before the "Looks right" tap |
| G09 | What's next? | full screen | 16 s | 1:34 |
| G10 | Which format? | full screen | 12 s | 1:50 |
| G11 | One tap, one transaction | full screen | 28 s | 2:02, right after the "Didn't know" tap |
| G12 | The garden stays | full screen | 10 s | 2:30 |
| G13 | Welcome back | **overlay** | 14 s | 2:44, over the fresh-chat welcome-back card |
| G14 | One state, two screens | full screen | 18 s | 3:06 |
| G15 | One system | full screen | 26 s | 3:28 |
| G16 | End card | full screen | 10 s | 3:54 |

Full-screen graphics render as H.264 MP4s. Overlays render as ProRes 4444 `.mov` files with alpha: drop them on the track above your screen recording and they composite with no keying. Overlays sit in the right-hand column (x 1290–1730), so keep the part of the UI you're showing on the left two-thirds of the frame. Every graphic holds its last frame, so you can trim the tail to match the voice-over.

`renders/graphics-reel.mp4` plays everything in order, with labelled slates where your recordings go. Use it as a timing reference.

## Rebuild

```bash
node build.mjs                      # writes scenes/G01 … scenes/G16 (one HyperFrames project each)
npx hyperframes@0.8.123 preview scenes/G09            # open one in Studio
npx hyperframes@0.8.123 render scenes/G09 -o renders/G09.mp4
npx hyperframes@0.8.123 render scenes/G07 --format mov -o renders/G07.mov   # overlays
./assemble-reel.sh                  # rebuild the reel from the renders
```

Edit text, timing, or layout in `build.mjs`. Every scene is generated from it and shares one stylesheet: the Sprout palette, Instrument Serif, and frosted cards. `assets/` holds the fonts, the plant-growth SVGs, and a local copy of GSAP, so renders never need the network.
