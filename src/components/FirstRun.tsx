import React from 'react';
import { useLocalization } from '../context/LanguageContext';

/**
 * The disclaimer, accepted once.
 *
 * It used to be five lines of red text in the footer of every single screen,
 * which is the surest way to make people stop reading it. Here it is shown on
 * first launch, on its own, where it is actually read — and the language choice
 * sits beside it, so an Arabic speaker is not made to start in English.
 */

/** Injected at build time from package.json by vite.config.ts. */
declare const __APP_VERSION__: string;

const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/**
 * Which version of the app the disclaimer was accepted for.
 *
 * Once per install, and once more after an update. The wording of what this
 * app is and is not can change between releases, and an acceptance recorded
 * against the old wording is not an acceptance of the new one. Storing the
 * version in the value rather than beside it means the two cannot disagree.
 *
 * The key is new, so somebody who accepted the old `disclaimerAccepted: true`
 * sees it once on this update. That is the intended behaviour, not a
 * migration that was missed.
 */
const ACCEPTED_KEY = 'disclaimerAcceptedVersion';

export const hasAcceptedDisclaimer = (): boolean => {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === VERSION;
  } catch {
    // Private mode or storage disabled. Showing it again is the safe failure.
    return false;
  }
};

const recordAcceptance = () => {
  try {
    localStorage.setItem(ACCEPTED_KEY, VERSION);
  } catch {
    /* Nothing to do — it will be shown again, which is the safe direction. */
  }
};

interface FirstRunProps {
  onAccept: () => void;
}

export const FirstRun: React.FC<FirstRunProps> = ({ onAccept }) => {
  const { t, language, setLanguage } = useLocalization();

  const accept = () => {
    recordAcceptance();
    onAccept();
  };

  const languageButton =
    'h-[38px] px-4 rounded-full flex items-center justify-center font-semibold text-[16px] ' +
    'active:scale-95 transition-transform';

  return (
    <div
      // bg-brand-ground, not bg-ink: the same colour, but as a surface token
      // that does not follow --ink when it inverts for dark mode. Using the
      // text colour as a background turned the first screen anybody sees into
      // a near-white panel with white text on it.
      className="fixed inset-0 z-[9998] flex flex-col bg-brand-ground px-6 overflow-y-auto"
      style={{ minHeight: '100dvh' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="firstrun-title"
    >
      {/*
        The language choice, in the corner.

        It used to be a pair of full-width buttons above the accept button,
        which put a decision nobody thinks twice about in the same weight as
        the one decision this screen exists to ask. Up here it is out of the
        way of reading the notice, and it is where the language control lives
        on every other screen.

        dir="ltr" does two things at once: it keeps English on the left and
        العربية on the right whichever language is running — the page is
        mirrored in Arabic, which flipped the pair and made them appear to
        swap under the finger that pressed one, when only the fill should
        move — and it keeps the pill itself in the right-hand corner rather
        than letting it cross to the other side of the screen.
      */}
      <div
        className="flex justify-end shrink-0"
        dir="ltr"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div
          className="rounded-full p-1 flex gap-1"
          style={{ background: 'rgba(255,255,255,.12)' }}
        >
          <button
            type="button"
            onClick={() => setLanguage('en')}
            aria-pressed={language === 'en'}
            className={`${languageButton} font-sans`}
            style={language === 'en'
              ? { background: '#FFFFFF', color: 'var(--brand-ground)' }
              : { background: 'transparent', color: 'rgba(255,255,255,.72)' }}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLanguage('ar')}
            aria-pressed={language === 'ar'}
            className={`${languageButton} font-arabic`}
            style={language === 'ar'
              ? { background: '#FFFFFF', color: 'var(--brand-ground)' }
              : { background: 'transparent', color: 'rgba(255,255,255,.72)' }}
          >
            العربية
          </button>
        </div>
      </div>

      <div
        className="flex-1 flex flex-col justify-center items-center gap-5"
        style={{ paddingTop: '1.5rem' }}
      >
        <div
          className="w-[104px] h-[104px] bg-white overflow-hidden shrink-0 flex items-center justify-center"
          style={{ borderRadius: '24%', boxShadow: '0 6px 20px rgba(0,0,0,.32)' }}
        >
          <img src="/app-icon.png" alt="" className="w-full h-full object-cover" />
        </div>

        <div className="text-center">
          <div
            id="firstrun-title"
            className="font-semibold text-[29px] leading-[1.15] text-white tracking-[-0.02em] font-sans"
          >
            Medication Identifier
          </div>
          <div className="font-arabic font-semibold text-[24px] leading-[1.5] text-white mt-1.5">
            {t('appNameArabic')}
          </div>
          <div className="font-arabic text-[17px] leading-[1.6] text-teal-light mt-2">
            {t('tagline')}
          </div>
        </div>
      </div>

      <div
        className="rounded-[18px] px-5 py-[18px] mb-4"
        style={{ background: 'rgba(255,255,255,.07)' }}
      >
        <p className="text-[16px] leading-[1.6] m-0" style={{ color: 'rgba(255,255,255,.88)' }}>
          {t('disclaimerLeadIn')}
          <strong className="text-white font-semibold">{t('disclaimerEmphasis')}</strong>
          {t('disclaimerRest')}
        </p>
      </div>

      <div
        className="flex flex-col gap-2.5 pb-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={accept}
          className="h-[58px] rounded-full bg-white flex items-center justify-center
            font-semibold text-[18px] active:scale-[0.98] transition-transform"
          style={{ color: 'var(--brand-ground)' }}
        >
          {t('iUnderstandContinue')}
        </button>

        <p className="text-center text-[14px] mt-1.5 m-0" style={{ color: 'rgba(255,255,255,.5)' }}>
          {t('shownOnce')}
        </p>
      </div>
    </div>
  );
};
