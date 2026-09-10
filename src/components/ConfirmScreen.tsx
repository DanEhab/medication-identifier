import React from 'react';
import type { PackReading } from '../types';
import { useLocalization } from '../context/LanguageContext';

/**
 * "Is this your box?" — the safety step that was missing.
 *
 * The app used to go straight from a photo to a full drug page. When the
 * reading was wrong, that produced a confident, detailed page about a medicine
 * the user is not holding, which is the worst failure this app can have. One
 * tap between the reading and the answer costs a second and removes it.
 *
 * The near neighbours matter as much as the yes/no: real confusion is between
 * Panadol Extra and Panadol Night, not between unrelated drugs, so the
 * alternatives offered are the model's own best guesses at what else it could
 * be — and picking one is as fast as accepting.
 */

interface ConfirmScreenProps {
  reading: PackReading;
  /** Object URL of the photo just taken. */
  photoUrl: string | null;
  onConfirm: (drugName: string) => void;
  onReject: () => void;
}

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

export const ConfirmScreen: React.FC<ConfirmScreenProps> = ({
  reading,
  photoUrl,
  onConfirm,
  onReject,
}) => {
  const { t } = useLocalization();

  // The chip states what the reader actually reported rather than dressing
  // every reading up as confident.
  const confidence = {
    high: { label: t('confidentMatch'), fg: 'var(--teal)', bg: 'var(--teal-wash)' },
    medium: { label: t('likelyMatch'), fg: 'var(--saffron)', bg: 'var(--saffron-wash)' },
    low: { label: t('unsureMatch'), fg: 'var(--clay-deep)', bg: 'var(--clay-wash)' },
  }[reading.confidence];

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center gap-3.5 px-4 py-3.5">
        <button type="button" onClick={onReject} aria-label={t('backToSearch')} className="active:scale-90 transition-transform">
          <ChevronBack />
        </button>
        <span className="font-semibold text-[17px] text-ink">{t('isThisYourBox')}</span>
      </div>

      <div className="px-4 pt-2">
        <div className="bg-surface border border-paper-sand rounded-[20px] p-[18px] flex gap-4 items-center">
          <div className="w-[92px] h-[92px] rounded-[14px] bg-night-lens shrink-0 overflow-hidden">
            {photoUrl && <img src={photoUrl} alt="" className="w-full h-full object-cover" />}
          </div>

          <div className="min-w-0">
            <div className="font-mono font-semibold text-[11px] text-ink-soft tracking-[0.06em] mb-1.5">
              {t('weRead')}
            </div>
            <div className="font-semibold text-[21px] leading-[1.25] text-ink break-words">
              {reading.readAs}
            </div>
            {reading.strengthAndPack && (
              <div className="text-[15px] leading-[1.4] text-ink-soft mt-0.5">
                {reading.strengthAndPack}
              </div>
            )}
            <div
              className="inline-flex items-center gap-1.5 mt-2.5 rounded-full py-[5px] px-[11px]"
              style={{ background: confidence.bg }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={confidence.fg} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2.5 2.5L16 9" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span className="font-semibold text-[12px]" style={{ color: confidence.fg }}>
                {confidence.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => onConfirm(reading.readAs)}
          className="h-[58px] rounded-full bg-teal flex items-center justify-center
            font-semibold text-[17px] text-teal-on active:scale-[0.98] transition-transform"
        >
          {t('yesShowInfo')}
        </button>
        <button
          type="button"
          onClick={onReject}
          className="h-[58px] rounded-full bg-surface border border-paper-edge flex items-center justify-center
            font-semibold text-[17px] text-ink active:scale-[0.98] transition-transform"
        >
          {t('noThatIsNotIt')}
        </button>
      </div>

      {reading.alternatives.length > 0 && (
        <div className="px-4 pt-2">
          <div className="font-mono font-semibold text-[11px] text-ink-soft tracking-[0.06em] mb-2.5">
            {t('orPickCloseMatch')}
          </div>
          <div className="flex flex-col gap-2">
            {reading.alternatives.map((alternative) => (
              <button
                key={`${alternative.name}-${alternative.detail}`}
                type="button"
                onClick={() => onConfirm(alternative.name)}
                className="w-full bg-surface border border-paper-sand rounded-[14px] py-3.5 px-4
                  flex items-center justify-between gap-3 text-start active:scale-[0.99] transition-transform"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-[16px] text-ink truncate">{alternative.name}</span>
                  {alternative.detail && (
                    <span className="block text-[14px] text-ink-soft truncate">{alternative.detail}</span>
                  )}
                </span>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 rtl:rotate-180">
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className="mt-auto px-4 pt-5 pb-[18px] flex gap-2.5 items-start"
        style={{ paddingBottom: 'max(1.125rem, env(safe-area-inset-bottom))' }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <rect x="4" y="10" width="16" height="10" rx="2.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="text-[13px] leading-[1.55] text-ink-soft m-0">{t('informationOnly')}</p>
      </div>
    </div>
  );
};
