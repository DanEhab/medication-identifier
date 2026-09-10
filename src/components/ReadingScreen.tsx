import React from 'react';
import type { ReadingStage } from '../types';
import { useLocalization } from '../context/LanguageContext';

/**
 * The wait, explained.
 *
 * A four-second spinner with no explanation reads as a hang. Naming the three
 * things actually happening — reading the pack, matching it, writing it up —
 * makes the same wait feel accounted for, and shows the user their own photo so
 * they can already tell whether it was worth taking.
 *
 * The stages are driven by real milestones in the lookup, not by a timer.
 */

interface ReadingScreenProps {
  /** Object URL of the photo being read. Absent for a typed search. */
  photoUrl: string | null;
  stage: ReadingStage;
  onCancel: () => void;
}

const STAGE_ORDER: ReadingStage[] = ['reading', 'matching', 'writing'];

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0A5A56" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 12l2.5 2.5L16 9" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

const Spinner: React.FC = () => (
  <span
    className="block w-[19px] h-[19px] rounded-full animate-spin"
    style={{ border: '3px solid #0A5A56', borderTopColor: 'transparent' }}
    aria-hidden="true"
  />
);

const Pending: React.FC = () => (
  <span
    className="block w-[19px] h-[19px] rounded-full"
    style={{ border: '2px solid #CFC5B2' }}
    aria-hidden="true"
  />
);

export const ReadingScreen: React.FC<ReadingScreenProps> = ({ photoUrl, stage, onCancel }) => {
  const { t } = useLocalization();
  const current = STAGE_ORDER.indexOf(stage);

  const steps: { key: ReadingStage; label: string }[] = [
    { key: 'reading', label: t('stageFoundName') },
    { key: 'matching', label: t('stageMatching') },
    { key: 'writing', label: t('stageWriting') },
  ];

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      <div className="flex justify-end px-4 py-3.5">
        <button
          type="button"
          onClick={onCancel}
          className="font-medium text-[16px] text-ink-soft px-2 py-1 active:scale-95 transition-transform"
        >
          {t('cancel')}
        </button>
      </div>

      {photoUrl && (
        <div className="px-5 pt-2 flex flex-col items-center">
          <div className="w-[190px] h-[150px] rounded-[18px] bg-night-lens overflow-hidden">
            <img src={photoUrl} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      <div className="px-6 pt-[30px]">
        <h1 className="font-semibold text-[26px] leading-[1.25] text-ink m-0 mb-1 tracking-[-0.01em]">
          {t('readingTheLabel')}
        </h1>
        <p className="text-[15px] leading-[1.55] text-ink-soft m-0">{t('usuallyFewSeconds')}</p>

        <ol className="mt-5 bg-white border border-paper-sand rounded-[18px] px-[18px] py-1.5 list-none m-0">
          {steps.map((step, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li key={step.key}>
                {index > 0 && <div className="h-px bg-paper-deep" />}
                <div className="flex items-center gap-3 py-[13px]">
                  {done ? <CheckIcon /> : active ? <Spinner /> : <Pending />}
                  <span
                    className={`text-[16px] ${
                      done || active ? 'font-medium text-ink' : 'text-ink-soft'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div
        className="mt-auto p-5 flex gap-2.5 items-start"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5B6A6A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
          <rect x="4" y="10" width="16" height="10" rx="2.5" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
        <p className="text-[13px] leading-[1.55] text-ink-soft m-0">{t('readOnYourPhone')}</p>
      </div>
    </div>
  );
};
