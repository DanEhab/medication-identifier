// The intro clip, on a real device.
//
// Sound is the reason this is a device suite and not a browser one. Every
// desktop autoplay policy refuses an unmuted autoplay outright, so a headless
// Chrome can only ever prove the clip plays silently. The Android WebView does
// allow it, and whether the audio actually reaches the output is a property of
// that WebView, not of the code.
//
// webkitAudioDecodedByteCount is what settles it: muted and volume are flags
// anyone can set, but that counter only moves when the decoder has produced
// audio frames for the output.
import { connectWebView } from './_webview.mjs';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
};

const wv = await connectWebView();

/*
  Sampled rather than read once. The clip starts muted, because that is the one
  thing every autoplay policy permits, and is unmuted immediately afterwards; a
  refused unmute shows up as a pause a task later rather than as a throw. Only
  watching it play answers the question.

  Scoped to the intro's own element: once the splash clears, the first <video>
  in the document is the camera viewfinder, which is silent by nature and would
  read as a broken soundtrack.
*/
const samples = await wv.evaluate(`
  const intro = () => [...document.querySelectorAll('video')]
    .find(v => /intro/.test(v.currentSrc || v.src || ''));

  const readings = [];
  for (let i = 0; i < 100; i++) {
    const v = intro();
    if (v) {
      readings.push({
        t: i * 80,
        muted: v.muted,
        volume: v.volume,
        paused: v.paused,
        ct: Number(v.currentTime.toFixed(3)),
        duration: Number.isFinite(v.duration) ? Number(v.duration.toFixed(2)) : null,
        audioBytes: v.webkitAudioDecodedByteCount ?? 0,
        videoBytes: v.webkitVideoDecodedByteCount ?? 0,
      });
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return readings;
`);

check('the intro clip is on screen at launch', samples.length > 0, `${samples.length} readings`);

const advancing = samples.filter((s) => !s.paused && s.ct > 0);
const audio = Math.max(0, ...samples.map((s) => s.audioBytes));
const video = Math.max(0, ...samples.map((s) => s.videoBytes));
const duration = samples.find((s) => s.duration)?.duration ?? null;

check('it plays', advancing.length > 0, `${advancing.length} samples advancing`);
check('the clip has a real length', duration !== null && duration > 1, `${duration}s`);
check('its pictures are decoded', video > 0, `${video} bytes`);

// The point of the suite.
check('its sound is decoded, not just unmuted', audio > 0, `${audio} bytes`);
/*
  Past the opening moment, because there is one by construction: playback has
  to start muted for any autoplay policy to allow it, and the unmute lands a
  frame later. That gap measures about 80ms of a five-and-a-half second clip,
  which is inaudible — and closing it would mean asking for unmuted autoplay
  up front and having no picture at all wherever that is refused.
*/
const settled = advancing.filter((s) => s.ct > 0.2);
check('it stays unmuted for the whole clip',
  settled.length > 0 && settled.every((s) => !s.muted),
  `${settled.filter((s) => s.muted).length} of ${settled.length} samples muted after the first 0.2s`);
check('at full volume', advancing.every((s) => s.volume === 1),
  JSON.stringify([...new Set(advancing.map((s) => s.volume))]));

// Muted for the opening would lose the first word of a five-second clip.
const firstAudible = advancing.find((s) => !s.muted)?.ct ?? null;
check('the sound is up from the very start of the clip',
  firstAudible !== null && firstAudible < 0.5, `${firstAudible}s in`);

wv.close();
console.log(failures ? `\n${failures} failing` : '\nall green');
process.exit(failures ? 1 : 0);
