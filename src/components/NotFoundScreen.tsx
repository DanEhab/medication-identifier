import React from 'react';
import type { NotAMedicationResult } from '../types';
import { useLocalization } from '../context/LanguageContext';

/**
 * The screen worth keeping.
 *
 * The app used to render a full drug page for anything at all — a banana came
 * back as a medicine with invented side effects. Saying "this is not a
 * medicine" plainly is the most valuable thing this app does, so the screen
 * never borrows the visual language of a real answer: no cards of facts, no
 * quick-fact grid, nothing that could be skimmed as an answer.
 *
 * It also refuses to be the last word. Somebody holding a real pack the model
 * did not recognise can say so, and it asks again.
 */

interface NotFoundScreenProps {
  result: NotAMedicationResult;
  onScan: () => void;
  onSearchAgain: () => void;
  /** Asks again, told that the person is certain it is a medicine. */
  onInsist: () => void;
  /** True once asking again has also come back saying it is not a medicine. */
  insistedAlready?: boolean;
}

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const ScanIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-teal-on">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 12h6" />
  </svg>
);

const QuestionIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-saffron-mid">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
  </svg>
);

const DangerIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="text-clay shrink-0">
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </svg>
);

export const NotFoundScreen: React.FC<NotFoundScreenProps> = ({
  result,
  onScan,
  onSearchAgain,
  onInsist,
  insistedAlready = false,
}) => {
  const { t } = useLocalization();

  const explanation = result.identifiedAs.trim();

  // "This is not a medicine" is only honest when the thing was recognised and
  // turned out not to be one. Recognition alone does not settle that: the
  // classification deliberately files foods and drinks under "unknown", so a
  // flavoured drink the model described perfectly well arrived as unknown and
  // was announced as unreadable. What settles it is whether it explained what
  // the thing is — if it did, we know; if it did not, we do not.
  const identified = result.recognition === 'substance' || explanation.length > 0;
  const title = identified ? t('notAMedicineTitle') : t('notRecognisedTitle');

  return (
    <div className="flex flex-col bg-paper" data-testid="not-a-medicine" style={{ minHeight: '100dvh' }}>
      <div className="px-4 py-3.5">
        <button type="button" onClick={onSearchAgain} aria-label={t('backToSearch')} className="active:scale-90 transition-transform">
          <ChevronBack />
        </button>
      </div>

      <div className="px-5 pt-5 flex flex-col items-start">
        <div className="w-[72px] h-[72px] rounded-full bg-saffron-wash flex items-center justify-center mb-[22px]">
          <QuestionIcon />
        </div>

        <h1
          className="font-semibold text-[32px] leading-[1.2] tracking-[-0.02em] text-ink m-0 mb-3"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {title}
        </h1>

        <p
          className="text-[17px] leading-[1.6] text-ink-soft m-0"
          style={{ textWrap: 'pretty' } as React.CSSProperties}
        >
          {t('weReadOnTheLabel')}{' '}
          <strong className="font-semibold text-ink"><bdi>“{result.query}”</bdi></strong>
          {explanation ? <>. <bdi>{explanation}</bdi></> : <>. {t('nothingToTellSafely')}</>}
        </p>
      </div>

      {/* ── The point of the screen ── */}
      <div className="px-5 pt-6">
        <div className="bg-surface rounded-[16px] py-4 px-[18px]" style={{ border: '2px solid var(--clay-soft)' }}>
          <div className="flex items-center gap-[9px] mb-2">
            <DangerIcon />
            <span className="font-semibold text-[16px] text-clay">{t('doNotUseAppToJudge')}</span>
          </div>
          <p className="text-[16px] leading-[1.55] text-clay-deep m-0">{t('safeToSwallowIsAQuestion')}</p>
          {result.safetyNote.trim() && (
            <p className="text-[16px] leading-[1.55] text-clay-deep m-0 mt-2.5">
              <bdi>{result.safetyNote}</bdi>
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pt-6 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onScan}
          className="h-[58px] rounded-full bg-teal flex items-center justify-center gap-2.5
            font-semibold text-[17px] text-teal-on active:scale-[0.98] transition-transform"
        >
          <ScanIcon />
          {t('scanThePackInstead')}
        </button>
        <button
          type="button"
          onClick={onSearchAgain}
          className="h-[58px] rounded-full bg-surface border border-paper-edge flex items-center justify-center
            font-semibold text-[17px] text-ink active:scale-[0.98] transition-transform"
        >
          {t('typeTheName')}
        </button>
      </div>

      {/* ── It refuses to be the last word ── */}
      <div className="mt-auto p-5 text-center">
        {insistedAlready ? (
          <p className="text-[15px] leading-[1.6] text-ink-soft m-0">{t('askedAgainStillNothing')}</p>
        ) : (
          <button
            type="button"
            onClick={onInsist}
            className="font-medium text-[15px] text-ink-soft underline underline-offset-[3px]
              active:scale-[0.98] transition-transform"
          >
            {t('weGotItWrong')}
          </button>
        )}
      </div>
    </div>
  );
};
