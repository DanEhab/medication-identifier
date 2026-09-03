import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PatientInfo } from '../types';
import { useLocalization } from '../context/LanguageContext';
import { LockClosedIcon, UserIcon, XMarkIcon } from './Icons';

export const EMPTY_PATIENT_INFO: PatientInfo = { name: '', age: '', sex: '', diagnosis: '' };

export const hasPatientDetails = (info: PatientInfo): boolean =>
  Boolean(info.name.trim() || info.age.trim() || info.sex || info.diagnosis.trim());

interface PatientDetailsDialogProps {
  open: boolean;
  /** The details currently stored on the device. Seeds the form each time it opens. */
  patientInfo: PatientInfo;
  /** Commits the edited details. Only called when the user chooses to keep them. */
  onSave: (info: PatientInfo) => void;
  /**
   * Dismisses without committing. When an export is waiting, this means
   * "export without details" — the caller runs the export either way.
   */
  onDismiss: () => void;
  /**
   * Wipes the stored details without closing. Separate from onSave because
   * clearing should leave the user looking at an empty form, not at nothing.
   */
  onClear: () => void;
  /** Changes the secondary button's wording between the two entry points. */
  pendingExport: boolean;
}

const fieldClass =
  'w-full px-4 py-3 border border-gray-300 dark:border-[#3A4D54] rounded-lg bg-white dark:bg-transparent ' +
  'text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-[#A1A1AA] ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-brand-primary transition shadow-sm';

const labelClass = 'block text-sm font-medium text-gray-700 dark:text-[#A1A1AA] mb-1';

/**
 * Collects the patient's name, age, sex and diagnosis — at the one moment they
 * are actually useful, which is when a report is being exported.
 *
 * These fields used to sit above the camera on the home screen, so a first-time
 * user met a form asking for their name and diagnosis before the app had done
 * anything for them. Nothing here is required, and the details are only ever
 * written onto the exported report.
 */
export const PatientDetailsDialog: React.FC<PatientDetailsDialogProps> = ({
  open,
  patientInfo,
  onSave,
  onDismiss,
  onClear,
  pendingExport,
}) => {
  const { t } = useLocalization();
  const [draft, setDraft] = useState<PatientInfo>(patientInfo);
  const [ageError, setAgeError] = useState<string>('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const restoreFocusTo = useRef<Element | null>(null);

  // Edits live in a local draft, so "export without details" genuinely leaves
  // nothing behind — nothing is persisted until the user chooses to keep it.
  useEffect(() => {
    if (open) {
      setDraft(patientInfo);
      setAgeError('');
    }
  }, [open, patientInfo]);

  // Return focus to whatever opened the dialog, as a keyboard user expects.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement;
    const tid = setTimeout(() => firstFieldRef.current?.focus(), 80);
    return () => {
      clearTimeout(tid);
      (restoreFocusTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  // The page behind must not scroll while a modal is over it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const update = (partial: Partial<PatientInfo>) => {
    setDraft((current) => ({ ...current, ...partial }));
    if ('age' in partial) setAgeError('');
  };

  const validate = useCallback((): boolean => {
    const age = draft.age.trim();
    if (age) {
      const parsed = Number(age);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 150) {
        setAgeError(t('invalidAge'));
        return false;
      }
    }
    return true;
  }, [draft.age, t]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    onSave({
      name: draft.name.trim(),
      age: draft.age.trim(),
      sex: draft.sex,
      diagnosis: draft.diagnosis.trim(),
    });
  }, [draft, onSave, validate]);

  const handleClearAll = () => {
    setDraft(EMPTY_PATIENT_INFO);
    setAgeError('');
    // Clearing takes effect straight away — a user who taps this wants the
    // details gone, not staged behind another button — but the dialog stays
    // open so they can see that it worked.
    onClear();
  };

  // Escape dismisses, and Tab is kept inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in-fast" aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-details-title"
        aria-describedby="patient-details-purpose"
        onMouseDown={(event) => event.stopPropagation()}
        /*
          A bottom sheet on phones and a centred card from the small breakpoint
          up. max-h keeps it usable on a short screen or with the keyboard open,
          and the header and footer stay put while the fields scroll.
        */
        className="relative w-full sm:max-w-lg max-h-[92vh] sm:max-h-[88vh] flex flex-col
                   bg-white dark:bg-[#1C1C1E] rounded-t-3xl sm:rounded-2xl
                   shadow-2xl border-t sm:border border-gray-200 dark:border-[#3A4D54]
                   animate-slide-up sm:animate-fade-in-fast"
      >
        <div className="flex items-start gap-3 p-5 sm:p-6 pb-4 border-b border-gray-100 dark:border-[#2C2C2E]">
          <div className="bg-brand-accent dark:bg-[#2C2C2E] text-brand-primary dark:text-[#90E0EF] p-2 rounded-full shrink-0">
            <UserIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="patient-details-title"
                className="text-lg sm:text-xl font-bold text-brand-dark dark:text-white"
              >
                {t('addPatientDetailsToReport')}
              </h2>
              <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-[#A1A1AA]">
                {t('optional')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('close')}
            className="shrink-0 -me-1 -mt-1 p-2 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2C2C2E] transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          <p
            id="patient-details-purpose"
            className="flex gap-2 text-sm leading-relaxed text-gray-600 dark:text-[#A1A1AA] bg-gray-50 dark:bg-[#161616] rounded-xl p-3"
          >
            <LockClosedIcon className="w-4 h-4 shrink-0 mt-0.5 text-brand-primary dark:text-[#90E0EF]" />
            <span>{t('patientDetailsPurpose')}</span>
          </p>

          <div>
            <label htmlFor="pd-name" className={labelClass}>
              {t('name')}
            </label>
            <input
              ref={firstFieldRef}
              id="pd-name"
              type="text"
              autoComplete="name"
              value={draft.name}
              maxLength={100}
              onChange={(event) => update({ name: event.target.value.slice(0, 100) })}
              placeholder={t('namePlaceholder')}
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pd-age" className={labelClass}>
                {t('age')}
              </label>
              <input
                id="pd-age"
                type="number"
                inputMode="numeric"
                min="0"
                max="150"
                value={draft.age}
                onChange={(event) => update({ age: event.target.value })}
                placeholder={t('agePlaceholder')}
                aria-invalid={Boolean(ageError)}
                aria-describedby={ageError ? 'pd-age-error' : undefined}
                className={`${fieldClass} ${ageError ? 'border-red-500 dark:border-red-500 focus:ring-red-300' : ''}`}
              />
            </div>
            <div>
              <label htmlFor="pd-sex" className={labelClass}>
                {t('sex')}
              </label>
              <select
                id="pd-sex"
                value={draft.sex}
                onChange={(event) => update({ sex: event.target.value as PatientInfo['sex'] })}
                className={`${fieldClass} dark:bg-[#1C1C1E]`}
              >
                <option value="">{t('select')}</option>
                <option value="Male">{t('male')}</option>
                <option value="Female">{t('female')}</option>
                <option value="Other">{t('other')}</option>
                <option value="Prefer not to say">{t('preferNotToSay')}</option>
              </select>
            </div>
          </div>

          {ageError && (
            <p id="pd-age-error" role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
              {ageError}
            </p>
          )}

          <div>
            <label htmlFor="pd-diagnosis" className={labelClass}>
              {t('diagnosis')}
            </label>
            <input
              id="pd-diagnosis"
              type="text"
              value={draft.diagnosis}
              maxLength={120}
              onChange={(event) => update({ diagnosis: event.target.value.slice(0, 120) })}
              placeholder={t('diagnosisPlaceholder')}
              className={fieldClass}
            />
          </div>

          {hasPatientDetails(patientInfo) && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-gray-500 dark:text-[#71717A]">{t('detailsRemembered')}</span>
              <button
                type="button"
                onClick={handleClearAll}
                className="text-sm font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0"
              >
                {t('clearDetails')}
              </button>
            </div>
          )}
        </div>

        {/*
          On a phone this is a bottom sheet, so the primary action goes last —
          nearest the thumb. On a wider screen the same DOM order reads as the
          conventional [secondary] [primary] pair aligned to the end.
        */}
        <div className="p-5 sm:p-6 pt-4 border-t border-gray-100 dark:border-[#2C2C2E] flex flex-col sm:flex-row sm:justify-end gap-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full sm:w-auto px-5 py-3 rounded-full font-semibold text-gray-700 dark:text-[#A1A1AA] bg-gray-100 dark:bg-[#2C2C2E] hover:bg-gray-200 dark:hover:bg-[#3A4D54] active:scale-95 transition-all"
          >
            {pendingExport ? t('exportWithoutDetails') : t('close')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="w-full sm:w-auto px-6 py-3 rounded-full font-bold text-white dark:text-[#0D0D0D] bg-gradient-to-r from-brand-primary to-brand-secondary dark:bg-none dark:bg-[#90E0EF] shadow-lg hover:shadow-xl active:scale-95 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all"
          >
            {t('addToReport')}
          </button>
        </div>
      </div>
    </div>
  );
};
