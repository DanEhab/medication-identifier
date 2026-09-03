import React from 'react';
import type { NotAMedicationResult } from '../types';
import { useLocalization } from '../context/LanguageContext';
import { AlertTriangleIcon, CameraIcon, ChevronLeftIcon, MagnifyingGlassIcon } from './Icons';

interface NotFoundScreenProps {
  result: NotAMedicationResult;
  onSearchAgain: () => void;
  onScan: () => void;
}

/**
 * Shown when a search did not resolve to a medication.
 *
 * The app previously rendered a full drug page for anything at all — a banana
 * came back as a medicine with invented side effects. Being clear about not
 * knowing is the whole point of this screen, so it never borrows the visual
 * language of a real result.
 */
export const NotFoundScreen: React.FC<NotFoundScreenProps> = ({ result, onSearchAgain, onScan }) => {
  const { t } = useLocalization();
  const isSubstance = result.recognition === 'substance';

  const title = isSubstance ? t('notAMedicationTitle') : t('notFoundTitle');
  const body = t('notFoundBody').replace('{query}', result.query);

  return (
    <div className="mx-auto w-full max-w-lg animate-fade-in">
      <button
        onClick={onSearchAgain}
        className="mb-6 flex items-center font-semibold text-brand-primary hover:underline dark:text-[#90E0EF]"
      >
        <ChevronLeftIcon className="me-1 h-5 w-5 rtl:rotate-180" />
        {t('backToSearch')}
      </button>

      <div className="rounded-2xl bg-white p-6 shadow-lg transition-colors duration-300 dark:bg-[#1C1C1E] dark:shadow-none sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div
            className={`mb-5 flex h-16 w-16 items-center justify-center rounded-full ${
              isSubstance
                ? 'bg-amber-100 text-amber-600 dark:bg-[#2C2418] dark:text-amber-400'
                : 'bg-brand-accent text-brand-primary dark:bg-[#2C2C2E] dark:text-[#90E0EF]'
            }`}
          >
            {isSubstance ? (
              <AlertTriangleIcon className="h-8 w-8" />
            ) : (
              <MagnifyingGlassIcon className="h-8 w-8" />
            )}
          </div>

          <h1 className="mb-3 text-2xl font-bold text-brand-dark dark:text-white">{title}</h1>

          {/* The searched term, quoted back so it is obvious what was looked up. */}
          <p className="mb-2 text-gray-600 dark:text-[#A1A1AA]">{body}</p>

          {result.identifiedAs && (
            <p className="mb-1 font-medium text-brand-dark dark:text-white">{result.identifiedAs}</p>
          )}
        </div>

        {result.safetyNote && (
          <div className="mt-6 rounded-xl border-2 border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-[#2A1618]">
            <div className="mb-1 flex items-center">
              <AlertTriangleIcon className="me-2 h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" />
              <h2 className="font-bold text-red-700 dark:text-red-300">{t('importantSafety')}</h2>
            </div>
            <p className="text-red-800 dark:text-red-200">{result.safetyNote}</p>
          </div>
        )}

        {/* Only offer spelling advice when we genuinely did not recognise it —
            it is unhelpful noise when the answer was "that is a fruit". */}
        {!isSubstance && (
          <ul className="mt-6 space-y-3 border-t border-gray-100 pt-6 dark:border-[#2C2C2E]">
            {[t('checkSpelling'), t('tryBrandOrGeneric'), t('photoIsMoreAccurate')].map((tip) => (
              <li key={tip} className="flex items-start text-gray-600 dark:text-[#A1A1AA]">
                <span className="me-3 mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-secondary dark:bg-[#90E0EF]" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onScan}
            className="flex flex-1 items-center justify-center rounded-full bg-brand-primary px-6 py-3 font-semibold text-white shadow-sm transition-colors hover:bg-brand-secondary dark:bg-[#90E0EF] dark:text-[#0D0D0D] dark:hover:bg-[#63C7CE]"
          >
            <CameraIcon className="me-2 h-5 w-5" />
            {t('scanThePack')}
          </button>
          <button
            onClick={onSearchAgain}
            className="flex flex-1 items-center justify-center rounded-full border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#3A4D54] dark:bg-[#1C1C1E] dark:text-white dark:hover:bg-[#2C2C2E]"
          >
            {t('searchAgain')}
          </button>
        </div>
      </div>
    </div>
  );
};
