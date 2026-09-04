import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The opening clip.
 *
 * The thing that made this look broken was never the video itself. Between the
 * element getting its metadata and the decoder producing a first frame there is
 * close to a second on a mid-range device, and for that whole window Android's
 * WebView paints its own grey placeholder with a large play button over it.
 * Suppressing the media-control pseudo-elements does not touch it, because it
 * is the element's default poster rendering rather than a control.
 *
 * So the video is simply kept invisible until it genuinely has a frame to show.
 * Underneath is the same flat white the clip itself opens on, which makes the
 * hand-off invisible: white screen, then the animation fades in.
 *
 * There is only one video element now. The previous version played a second,
 * blurred copy behind the first to fill the letterbox bars — which meant
 * decoding a 428x944 clip twice at once on the slowest moment in the app's
 * life. The clip's own background is flat white from beginning to end, so a
 * white backdrop matches it exactly and costs nothing.
 */

interface IntroSplashProps {
  onDone: () => void;
}

/** Hard ceiling, in case metadata never arrives and `ended` never fires. */
const MAX_SPLASH_MS = 9000;
/** How long before the skip control fades in. */
const SKIP_VISIBLE_AFTER_MS = 900;

const prefersReducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const IntroSplash: React.FC<IntroSplashProps> = ({ onDone }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setIsFadingOut(true);
    window.setTimeout(onDone, 350);
  }, [onDone]);

  // Anyone who has asked the system to reduce motion should not be shown a
  // full-screen animation at all.
  useEffect(() => {
    if (prefersReducedMotion()) finish();
  }, [finish]);

  // Nothing here may ever trap the user. Whatever happens to the video, the
  // splash clears — on `ended`, on error, or on this ceiling.
  useEffect(() => {
    const id = window.setTimeout(finish, MAX_SPLASH_MS);
    return () => window.clearTimeout(id);
  }, [finish]);

  useEffect(() => {
    const id = window.setTimeout(() => setShowSkip(true), SKIP_VISIBLE_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);

  /**
   * Starts playback muted, because that is the one thing every autoplay policy
   * permits, then brings the sound up. Capacitor allows unmuted playback in the
   * WebView, so on the device the audio does come through; in a plain browser
   * the unmute is refused and the clip carries on silently, which is a far
   * better outcome than a play button the user has to find.
   */
  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video || finished.current) return;

    video.muted = true;
    try {
      await video.play();
    } catch {
      return; // The ceiling above will clear the splash.
    }

    try {
      video.muted = false;
      video.volume = 1;
      // An unpermitted unmute is signalled by pausing rather than by throwing,
      // and the pause lands a task later — so this checks on the next turn of
      // the event loop rather than in a microtask, which was too early to see
      // it.
      window.setTimeout(() => {
        if (!finished.current && video.paused) {
          video.muted = true;
          void video.play().catch(() => {});
        }
      }, 0);
    } catch {
      video.muted = true;
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Prefer the clip's real length over the blanket ceiling, so the app opens
    // promptly even if `ended` is never delivered.
    if (Number.isFinite(video.duration) && video.duration > 0) {
      window.setTimeout(finish, video.duration * 1000 + 1000);
    }
    void startPlayback();
  }, [finish, startPlayback]);

  /** Revealed only once there is a decoded frame behind it. */
  const revealWhenReady = useCallback(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 2) setHasFrame(true);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden transition-opacity duration-300 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
      /* The flat white the clip itself opens on, so the reveal is seamless. */
      style={{ height: '100dvh', backgroundColor: '#FFFFFF' }}
      role="button"
      tabIndex={0}
      aria-label="Skip introduction"
      onClick={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') finish();
      }}
    >
      <video
        ref={videoRef}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
        onLoadedMetadata={handleLoadedMetadata}
        onLoadedData={revealWhenReady}
        onCanPlay={() => {
          revealWhenReady();
          void startPlayback();
        }}
        onPlaying={revealWhenReady}
        onTimeUpdate={revealWhenReady}
        onEnded={finish}
        onError={finish}
        className={`pointer-events-none relative h-full w-full object-contain transition-opacity duration-200 ${
          hasFrame ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transform: 'translateZ(0)' }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          finish();
        }}
        className={`absolute end-4 rounded-full bg-black/35 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-opacity duration-300 ${
          showSkip ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        Skip
      </button>
    </div>
  );
};
