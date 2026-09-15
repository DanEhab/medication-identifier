import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useLocalization } from '../context/LanguageContext';
import { TabBar, type Tab } from './TabBar';
import { SettingsButton } from './SettingsScreen';

/**
 * The home screen: a live viewfinder rather than a menu.
 *
 * The screen it replaces asked the user to choose between Photo, Upload and
 * Type before anything happened, and shipped its one real button disabled.
 * Here the camera is already running, so the only decision left is where to
 * point it. Uploading stops being a mode and becomes one small button, and
 * typing is one tap rather than a fork.
 *
 * Preview comes from getUserMedia inside the WebView rather than a native
 * preview plugin: Capacitor's BridgeWebChromeClient already maps the WebView's
 * VIDEO_CAPTURE request onto the Android camera permission, so this needs no
 * new native dependency.
 */

interface CameraHomeProps {
  onIdentify: (image: File | null, drugName: string) => void;
  onTypeInstead: () => void;
  /** The tab bar at the foot of the screen, shared with the other two tabs. */
  onSelectTab: (tab: Tab) => void;
  onOpenSettings: () => void;
  error: string | null;
}

type CameraState = 'starting' | 'live' | 'denied' | 'unavailable';

export const CameraHome: React.FC<CameraHomeProps> = ({ onIdentify, onTypeInstead, onSelectTab, onOpenSettings, error }) => {
  const { t, language, setLanguage } = useLocalization();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // ── The preview ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const stop = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // `ideal` rather than `exact` so a device with only a front camera
          // still gets a preview instead of an error.
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        const track = stream.getVideoTracks()[0];
        setTorchSupported(Boolean(track?.getCapabilities?.().torch));
        window.clearTimeout(giveUp);
        setCameraState('live');
      } catch (err) {
        const name = (err as DOMException)?.name;
        setCameraState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };

    /*
      getUserMedia does not always settle. Android asks for the camera
      permission on the app's behalf, and if that prompt is dismissed rather
      than answered — the app is backgrounded at the wrong moment, say — the
      promise never resolves or rejects, and the screen sits in `starting`
      for ever: an empty box, the usual hint underneath it, and no way to
      tell that anything is wrong.

      Long enough that a slow camera is never mislabelled; this only changes
      what is said, never what works, and typing a name is unaffected either
      way.
    */
    const giveUp = window.setTimeout(() => {
      if (!cancelled && !streamRef.current) setCameraState('unavailable');
    }, 12000);

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(giveUp);
      stop();
    };
  }, []);

  // Releasing the camera when the app goes to the background matters on a
  // phone: Android will not hand the camera to another app while it is held,
  // and a held camera drains the battery.
  useEffect(() => {
    const onVisibility = () => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (!track) return;
      track.enabled = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || cameraState !== 'live' || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (blob) onIdentify(new File([blob], 'scan.jpg', { type: 'image/jpeg' }), '');
      },
      'image/jpeg',
      0.92,
    );
  }, [cameraState, onIdentify]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }, [torchOn]);

  const pickFromGallery = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await Camera.getPhoto({
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos,
          quality: 90,
          allowEditing: false,
        });
        if (photo.dataUrl) {
          const blob = await (await fetch(photo.dataUrl)).blob();
          onIdentify(new File([blob], 'gallery.jpg', { type: 'image/jpeg' }), '');
        }
      } catch {
        /* The picker was dismissed. */
      }
      return;
    }
    fileInputRef.current?.click();
  }, [onIdentify]);

  const onFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onIdentify(file, '');
    event.target.value = '';
  };

  const paperControl =
    'w-[52px] h-[52px] rounded-[15px] bg-surface border border-paper-sand ' +
    'flex items-center justify-center active:scale-95 transition-transform';

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Bar: the icon needs a light ground, so the chrome is paper ── */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[9px] bg-surface overflow-hidden shrink-0">
            <img src="/app-icon.png" alt="" className="w-full h-full object-cover" />
          </div>
          <span className="font-semibold text-[17px] text-ink tracking-[-0.01em] truncate">
            {t('appName')}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <SettingsButton onClick={onOpenSettings} />

          {/*
            Language stays in the bar as well as in settings. It is the one
            setting a bilingual household changes several times a day, and
            burying it two taps deep to keep the header tidy would be tidying
            the wrong thing.
          */}
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            aria-label={t('switchLanguage')}
            data-tutorial="language"
            className={`h-[34px] px-[13px] rounded-full border border-paper-sand bg-surface
              flex items-center font-semibold text-[15px] text-ink active:scale-95 transition-transform
              ${language === 'en' ? 'font-arabic' : ''}`}
          >
            {language === 'en' ? 'ع' : 'EN'}
          </button>
        </div>
      </header>

      {/* ── The viewfinder ── */}
      {/*
        The frame and the instruction under it share the preview by stacking
        rather than by both being centred in it. Absolutely positioning the
        instruction over a fixed-size frame worked at 428x908 and ran the
        caption straight through the brackets at 360x640.
      */}
      <div data-tutorial="viewfinder" className="relative flex-1 mx-3.5 mt-1 rounded-[22px] bg-night-lens overflow-hidden flex flex-col">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            cameraState === 'live' ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Lifts the brackets and the instruction off whatever the lens sees. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 38%, rgba(127,189,180,.2), rgba(0,0,0,.42))',
          }}
        />

        {/*
          As close to 238px square as the preview allows, and never larger than
          it. aspect-ratio was tried first and collapsed: the corner pieces are
          absolutely positioned, so the box has no content to size from and a
          flex row sized it to nothing.
        */}
        <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <div
          className="relative pointer-events-none shrink-0"
          style={{ width: 'min(238px, 76%)', height: 'min(238px, 100%)' }}
        >
          <span className="absolute top-0 left-0 w-[54px] h-[54px] border-t-4 border-l-4 border-white rounded-tl-[18px]" />
          <span className="absolute top-0 right-0 w-[54px] h-[54px] border-t-4 border-r-4 border-white rounded-tr-[18px]" />
          <span className="absolute bottom-0 right-0 w-[54px] h-[54px] border-b-4 border-r-4 border-white rounded-br-[18px]" />
          <span className="absolute bottom-0 left-0 w-[54px] h-[54px] border-b-4 border-l-4 border-white rounded-bl-[18px]" />

          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
              rounded-lg border border-dashed flex items-center justify-center text-center px-2.5 text-[12px]"
            /*
              Fixed, not a percentage of the frame. The frame's own height is a
              min() containing a percentage, which leaves it indefinite as far
              as a child's percentage height is concerned, so `height: 42%`
              silently became auto and the hint collapsed onto its one line.
            */
            style={{
              width: '158px',
              maxWidth: '66%',
              height: '100px',
              borderColor: 'rgba(255,255,255,.34)',
              color: 'rgba(255,255,255,.6)',
            }}
          >
            {t('nameOnPack')}
          </div>
        </div>

        </div>

        <div className="relative shrink-0 pb-[18px] text-center px-[26px] pointer-events-none">
          {cameraState === 'live' || cameraState === 'starting' ? (
            <p className="text-white text-[16px] leading-[1.5] m-0" style={{ textWrap: 'pretty' }}>
              {t('pointAtBox')}
              <br />
              <span className="text-[14px]" style={{ color: 'rgba(255,255,255,.75)' }}>
                {t('stripOrBottle')}
              </span>
            </p>
          ) : (
            <p className="text-white text-[16px] leading-[1.5] m-0">
              {cameraState === 'denied' ? t('cameraDenied') : t('cameraUnavailable')}
              <br />
              <span className="text-[14px]" style={{ color: 'rgba(255,255,255,.75)' }}>
                {t('useGalleryOrType')}
              </span>
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-2xl bg-clay-wash border border-clay-soft px-4 py-3" role="alert">
          <p className="text-[15px] leading-snug text-clay-deep m-0">{error}</p>
        </div>
      )}

      {/* ── Gallery, shutter, flash ── */}
      <div className="flex items-center justify-between px-4 pt-[18px] pb-1.5 shrink-0">
        <button type="button" onClick={pickFromGallery} aria-label={t('uploadAnImage')} className={paperControl}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="m4 17 5-5 4 4 3-3 4 4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={cameraState !== 'live'}
          aria-label={t('takeAPhoto')}
          data-tutorial="shutter"
          className="w-[84px] h-[84px] rounded-full flex items-center justify-center
            active:scale-95 transition-transform disabled:opacity-40"
          style={{ border: '5px solid rgba(10,90,86,.3)' }}
        >
          <span className="w-16 h-16 rounded-full bg-teal block" />
        </button>

        <button
          type="button"
          onClick={toggleTorch}
          disabled={!torchSupported}
          aria-label={t('flash')}
          aria-pressed={torchOn}
          className={`${paperControl} ${torchSupported ? '' : 'opacity-40'} ${
            torchOn ? '!bg-teal !border-teal' : ''
          }`}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={torchOn ? '#FFFFFF' : 'var(--ink)'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
        </button>
      </div>

      {/* ── Typing is one tap, not a fork ── */}
      <div className="px-4 pt-2 pb-3 shrink-0">
        <button
          type="button"
          onClick={onTypeInstead}
          data-tutorial="type-instead"
          className="w-full h-14 rounded-full bg-surface border border-paper-sand
            flex items-center gap-3 px-5 active:scale-[0.99] transition-transform"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <span className="text-[17px] text-ink-soft">{t('typeInstead')}</span>
        </button>

        <p className="text-center text-[13px] text-ink-soft mt-3 m-0">{t('privacyLine')}</p>
      </div>

      <input type="file" accept="image/*" ref={fileInputRef} onChange={onFilePicked} className="hidden" />

      <TabBar active="scan" onSelect={onSelectTab} />
    </div>
  );
};
