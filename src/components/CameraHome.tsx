import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useLocalization } from '../context/LanguageContext';

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
  /** The saved list. The camera runs edge to edge, so it has no tab bar. */
  onShowMyMedicines: () => void;
  error: string | null;
}

type CameraState = 'starting' | 'live' | 'denied' | 'unavailable';

export const CameraHome: React.FC<CameraHomeProps> = ({ onIdentify, onTypeInstead, onShowMyMedicines, error }) => {
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
        setCameraState('live');
      } catch (err) {
        const name = (err as DOMException)?.name;
        setCameraState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      }
    };

    void start();
    return () => {
      cancelled = true;
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
    'w-[52px] h-[52px] rounded-[15px] bg-white border border-paper-sand ' +
    'flex items-center justify-center active:scale-95 transition-transform';

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Bar: the icon needs a light ground, so the chrome is paper ── */}
      <header className="flex items-center justify-between px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-[9px] bg-white overflow-hidden shrink-0">
            <img src="/app-icon.png" alt="" className="w-full h-full object-cover" />
          </div>
          <span className="font-semibold text-[17px] text-ink tracking-[-0.01em] truncate">
            {t('appName')}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* The other screens carry a tab bar; this one cannot without eating
              a fifth of the viewfinder, so the way to the saved list is here. */}
          <button
            type="button"
            onClick={onShowMyMedicines}
            aria-label={t('tabMedicines')}
            data-tutorial="my-medicines"
            className="w-[34px] h-[34px] rounded-full border border-paper-sand bg-white
              flex items-center justify-center active:scale-95 transition-transform"
          >
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#0B2B2E"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            aria-label={t('switchLanguage')}
            className={`h-[34px] px-[13px] rounded-full border border-paper-sand bg-white
              flex items-center font-semibold text-[15px] text-ink active:scale-95 transition-transform
              ${language === 'en' ? 'font-arabic' : ''}`}
          >
            {language === 'en' ? 'ع' : 'EN'}
          </button>
        </div>
      </header>

      {/* ── The viewfinder ── */}
      <div className="relative flex-1 mx-3.5 mt-1 rounded-[22px] bg-night-lens overflow-hidden flex items-center justify-center">
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

        <div className="relative w-[238px] h-[238px] max-w-[76%] pointer-events-none">
          <span className="absolute top-0 left-0 w-[54px] h-[54px] border-t-4 border-l-4 border-white rounded-tl-[18px]" />
          <span className="absolute top-0 right-0 w-[54px] h-[54px] border-t-4 border-r-4 border-white rounded-tr-[18px]" />
          <span className="absolute bottom-0 right-0 w-[54px] h-[54px] border-b-4 border-r-4 border-white rounded-br-[18px]" />
          <span className="absolute bottom-0 left-0 w-[54px] h-[54px] border-b-4 border-l-4 border-white rounded-bl-[18px]" />

          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[158px] h-[100px]
              rounded-lg border border-dashed flex items-center justify-center text-center px-2.5 text-[12px]"
            style={{ borderColor: 'rgba(255,255,255,.34)', color: 'rgba(255,255,255,.6)' }}
          >
            {t('nameOnPack')}
          </div>
        </div>

        <div className="absolute bottom-[18px] inset-x-0 text-center px-[26px] pointer-events-none">
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
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0B2B2E" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="m4 17 5-5 4 4 3-3 4 4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={capture}
          disabled={cameraState !== 'live'}
          aria-label={t('takeAPhoto')}
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
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={torchOn ? '#FFFFFF' : '#0B2B2E'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
          </svg>
        </button>
      </div>

      {/* ── Typing is one tap, not a fork ── */}
      <div className="px-4 pt-2 pb-3.5 shrink-0" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
        <button
          type="button"
          onClick={onTypeInstead}
          className="w-full h-14 rounded-full bg-white border border-paper-sand
            flex items-center gap-3 px-5 active:scale-[0.99] transition-transform"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#5B6A6A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <span className="text-[17px] text-ink-soft">{t('typeInstead')}</span>
        </button>

        <p className="text-center text-[13px] text-ink-soft mt-3 m-0">{t('privacyLine')}</p>
      </div>

      <input type="file" accept="image/*" ref={fileInputRef} onChange={onFilePicked} className="hidden" />
    </div>
  );
};
