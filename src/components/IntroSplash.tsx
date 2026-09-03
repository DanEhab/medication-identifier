import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The opening clip.
 *
 * Three things were wrong with the previous version, all of them visible on a
 * real device:
 *
 * 1. It started unmuted. Autoplay with sound is refused unless the platform
 *    explicitly allows it, so the clip never started and the WebView drew its
 *    own play button over a transparent poster. It now starts muted — which no
 *    policy blocks — and unmutes the instant playback is under way, falling
 *    back to silent playback rather than to a play button.
 * 2. Nothing dismissed it except the video's own `ended` event. A decode
 *    failure, a missing file or a paused tab left the user staring at a splash
 *    screen with no way into the app.
 * 3. There was no way to skip it, on every single launch.
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
  const backdropRef = useRef<HTMLVideoElement>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    setIsFadingOut(true);
    window.setTimeout(onDone, 400);
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
   * permits, then tries to bring the sound up. If the platform refuses — it
   * signals this by pausing the element — the clip carries on silently, which
   * is a far better outcome than a play button the user has to find.
   */
  const startPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    try {
      await video.play();
    } catch {
      // Even muted playback was refused. The ceiling above will clear the
      // splash; there is nothing useful to do here.
      return;
    }

    try {
      video.muted = false;
      video.volume = 1;
      // Some engines respond to an unpermitted unmute by pausing rather than
      // by throwing, so the result has to be checked rather than assumed.
      await Promise.resolve();
      if (video.paused) {
        video.muted = true;
        await video.play().catch(() => {});
      }
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
      window.setTimeout(finish, video.duration * 1000 + 1200);
    }
    void startPlayback();
  }, [finish, startPlayback]);

  // Keep the blurred backdrop on the same frame as the clip it is blurring.
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    const backdrop = backdropRef.current;
    if (!video || !backdrop) return;
    if (Math.abs(backdrop.currentTime - video.currentTime) > 0.25) {
      backdrop.currentTime = video.currentTime;
    }
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden bg-black transition-opacity duration-400 ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ height: '100dvh' }}
      role="button"
      tabIndex={0}
      aria-label="Skip introduction"
      onClick={finish}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') finish();
      }}
    >
      {/*
        The clip is portrait (428x944). On a wider or shorter screen
        object-contain leaves bars, so the space around it is filled with a
        blurred, scaled copy of the same frame. The clip starts white and ends
        teal, so a fixed backdrop colour would clash partway through; mirroring
        the video keeps it matched the whole way.
      */}
      <video
        ref={backdropRef}
        src="/intro.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover blur-2xl"
      />

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
        onCanPlay={() => void startPlayback()}
        onTimeUpdate={handleTimeUpdate}
        onEnded={finish}
        onError={finish}
        className="pointer-events-none relative h-full w-full object-contain"
        style={{ transform: 'translateZ(0)' }}
      />

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          finish();
        }}
        className={`absolute end-4 rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-opacity duration-300 ${
          showSkip ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        Skip
      </button>
    </div>
  );
};
