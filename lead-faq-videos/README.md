# Lead-home default FAQ videos

Remotion source for the three default FAQ videos that play on the mobile
lead-home (the ones served by `web/app/api/mobile/lead-content/route.ts`
via `web/lib/lead-faq-defaults.ts`). Keep this as the editable source of
truth so the clips can be revised and re-rendered later.

| Composition  | Topic                          | Shown to            | Bunny videoId |
|--------------|--------------------------------|---------------------|---------------|
| `FaqYoungV2` | "Do I really need this now?"   | Leads under 40      | `7b3ebe94-fbd8-453e-ba92-6007fa8848dd` |
| `FaqOlder`   | "Cost & approval"              | Leads 40+ / unknown | `eed95098-f294-488d-a8c9-04d1412d0794` |
| `FaqWork`    | "Enough through work?"         | All leads           | `179478cb-9a68-4adc-951f-91088056e8f7` |

All are 1080×1920 (9:16), brand palette in `src/theme/tokens.ts`
(teal/mint/gold), Montserrat.

## Render

```bash
npm install
npm run studio          # live preview / scrub in the browser
npm run render:all      # writes silent mp4s to out/
# or one at a time: render:young | render:cost | render:work
```

Renders are **silent** — the voiceover is added separately (below).

## How a video is made / revised

1. **Visuals** live in `src/scenes/*.tsx`. Each scene has a `B` object
   (the beat map: `{ from, len }` in frames @30fps) plus illustration
   components. Edit copy/visuals/timing there. The composition lengths are
   in `src/Root.tsx`.
2. **Voiceover** is recorded separately (Daniel, in Voice Memos), then
   synced to the visuals. The sync is done by transcribing the recording
   with word-level timestamps and setting each beat's `from` to where the
   line lands:
   ```bash
   # transcribe (whisper-cpp + ggml-base.en model)
   ffmpeg -i "take.m4a" -ar 16000 -ac 1 take.wav
   whisper-cli -m ggml-base.en.bin -f take.wav -ml 1 -osrt -of words
   # → read words.srt, set each beat's `from` frame to that line's start
   ```
3. **Clean + mux the audio** (the recipe that handled Daniel's mouth-clicks):
   ```bash
   ffmpeg -ss <lead> -to <tail> -i "take.m4a" \
     -af "highpass=f=90,adeclick=threshold=1.2,adeclick=threshold=2,agate=threshold=0.02:ratio=2.2:attack=4:release=200,loudnorm=I=-16:TP=-1.5:LRA=11" \
     clean.m4a
   ffmpeg -i out/faq-young.mp4 -i clean.m4a -map 0:v -map 1:a -c:v copy -c:a aac final.mp4
   ```
4. **Host on Bunny** (library 672807): create a video, PUT the file, then
   put the resulting `videoId` into `web/lib/lead-faq-defaults.ts`.

That last file is the single source of truth the live app reads — update
the `videoId`/`url` there and the new cut goes live on the next web deploy
(no app update needed).
