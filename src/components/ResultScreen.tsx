import React, { useState, useEffect } from 'react';
import type { DrugInfo, PatientInfo, DetailSection } from '../types';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';
import { useReportExport } from '../lib/useReportExport';

/**
 * The answer, weighted.
 *
 * The old screen put eleven fields behind five tabs of equal size, so the
 * sentence that says what the medicine actually does sat in the same box as its
 * storage temperature, and both were a tap away. Here the page opens with the
 * name, one sentence of purpose and the three facts people act on; the two
 * warnings are separated by how urgent they are — amber for "ring your doctor",
 * clay for "never take this with that" — and everything that is reference
 * rather than instruction is folded away behind chips at the bottom.
 */

interface ResultScreenProps {
  drugInfo: DrugInfo;
  patientInfo: PatientInfo;
  /** The term originally searched, kept so a saved copy can be refreshed later. */
  originalDrugName: string;
  onBack: () => void;
  onShowProfessionalView: () => void;
  onShowMyMedications: () => void;
  /** Opens the side effects screen at the section the chip names. */
  onShowDetails: (section: DetailSection) => void;
  /** Persists edited patient details. Merged over the stored values. */
  onPatientInfoChange: (info: Partial<PatientInfo>) => void;
}



// ── Icons, sized and stroked to the design rather than to the shared set ──

const Chevron: React.FC<{ back?: boolean; color?: string }> = ({ back, color = '#0B2B2E' }) => (
  <svg viewBox="0 0 24 24" width={back ? 24 : 20} height={back ? 24 : 20} fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
    <path d={back ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </svg>
);

const ShareIcon: React.FC<{ size?: number; color?: string }> = ({ size = 21, color = '#0B2B2E' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v6h14v-6" />
  </svg>
);

const BookmarkIcon: React.FC<{ size?: number; color?: string; filled?: boolean }> = ({
  size = 21,
  color = '#0B2B2E',
  filled = false,
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={filled ? color : 'none'} stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12v17l-6-4-6 4z" />
  </svg>
);

const WarnIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#9A6414"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 17h.01" />
  </svg>
);

const DangerIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#B23A2B"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </svg>
);

const ProfessionalIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#0A5A56"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <path d="M4 5h16v11H4z" />
    <path d="M9 20h6" />
    <path d="M12 16v4" />
  </svg>
);

/** A label in the mono caps used for every section heading in the design. */
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({
  children,
  color = '#5B6A6A',
  className = '',
}) => (
  <div className={`font-mono font-semibold text-[12px] tracking-[0.06em] ${className}`} style={{ color }}>
    {children}
  </div>
);

const QuickFact: React.FC<{ value: string; note: string }> = ({ value, note }) => (
  <div className="bg-white border border-paper-sand rounded-[14px] py-3 px-2 text-center">
    <div className="font-semibold text-[16px] leading-[1.2] text-ink"><bdi>{value}</bdi></div>
    {note && <div className="text-[13px] leading-[1.3] text-ink-soft mt-0.5"><bdi>{note}</bdi></div>}
  </div>
);

export const ResultScreen: React.FC<ResultScreenProps> = ({
  drugInfo,
  patientInfo,
  originalDrugName,
  onBack,
  onShowProfessionalView,
  onShowMyMedications,
  onShowDetails,
  onPatientInfoChange,
}) => {
  const [isSaved, setIsSaved] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { t, language } = useLocalization();
  const { requestExport, openDetails, dialog } = useReportExport(
    drugInfo,
    patientInfo,
    onPatientInfoChange,
  );

  useEffect(() => {
    setIsSaved(isMedicationSaved(drugInfo.drugName));
  }, [drugInfo.drugName]);

  const handleSaveMedication = () => {
    setIsSaved(toggleMedication(drugInfo, language, originalDrugName));
  };

  // The identity block wants the brand on its own and the ingredient above it.
  // Older saved medicines carry neither, so the drug name stands in.
  const brand = drugInfo.brandName?.trim() || drugInfo.drugName;
  const ingredient = drugInfo.canonicalName?.trim();
  const showIngredient = Boolean(ingredient) && ingredient!.toLowerCase() !== brand.toLowerCase();

  const quickFacts = [
    { value: drugInfo.quickDose, note: drugInfo.quickDoseNote },
    { value: drugInfo.quickTiming, note: drugInfo.quickTimingNote },
    { value: drugInfo.quickFood, note: drugInfo.quickFoodNote },
  ].filter((fact) => Boolean(fact.value?.trim()));

  // Each chip opens the side effects screen at its own section. They used to
  // expand in place, which buried the answer under reference material the
  // moment anyone tapped one.
  const chips: { key: DetailSection; label: string }[] = [
    { key: 'sideEffects', label: t('sideEffectsChip') },
    { key: 'missedDose', label: t('missedDoseChip') },
    { key: 'storage', label: t('storageChip') },
  ];

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <button type="button" onClick={onBack} aria-label={t('backToSearch')} className="active:scale-90 transition-transform">
          <Chevron back />
        </button>
        <div className="flex gap-[18px]">
          <button type="button" onClick={() => setExportOpen(true)} aria-label={t('exportShare')} className="active:scale-90 transition-transform">
            <ShareIcon />
          </button>
          <button
            type="button"
            onClick={handleSaveMedication}
            aria-label={isSaved ? t('savedToMyMedicines') : t('saveToMyMedicines')}
            aria-pressed={isSaved}
            className="active:scale-90 transition-transform"
          >
            <BookmarkIcon filled={isSaved} color={isSaved ? '#0A5A56' : '#0B2B2E'} />
          </button>
        </div>
      </div>

      {/* ── Identity ── */}
      <div className="px-5 pt-1.5">
        {showIngredient && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-[11px] bg-night-lens shrink-0" aria-hidden="true" />
            <Eyebrow>{ingredient!.toUpperCase()}</Eyebrow>
          </div>
        )}
        <h1 className="font-semibold text-[40px] leading-[1.05] tracking-[-0.03em] text-ink m-0 mb-1.5 break-words">
          {brand}
        </h1>
        {drugInfo.strength && (
          <div className="text-[17px] text-ink-soft"><bdi>{drugInfo.strength}</bdi></div>
        )}

        {drugInfo.whatItIsFor?.trim() && (
          <div className="bg-teal-wash rounded-[16px] py-4 px-[18px] mt-[18px]" data-tutorial="what-it-is-for">
            <Eyebrow color="#0A5A56" className="mb-1.5">{t('whatItIsForLabel')}</Eyebrow>
            <p className="text-[17px] leading-[1.5] text-ink m-0" style={{ textWrap: 'pretty' } as React.CSSProperties}>
              <bdi>{drugInfo.whatItIsFor}</bdi>
            </p>
          </div>
        )}
      </div>

      {/* ── The three facts people act on ── */}
      {quickFacts.length > 0 && (
        <div className="grid grid-cols-3 gap-2 px-5 pt-4" data-tutorial="quick-facts">
          {quickFacts.map((fact) => (
            <QuickFact key={fact.value} value={fact.value!} note={fact.note?.trim() || ''} />
          ))}
        </div>
      )}

      {/* ── How to take it ── */}
      {(drugInfo.howToTake?.trim() || drugInfo.dosageAdministration) && (
        <div className="px-5 pt-[22px]">
          <Eyebrow className="mb-2">{t('howToTakeItLabel')}</Eyebrow>
          <div className="text-[16px] leading-[1.6] text-ink-dim">
            <bdi><MarkdownText text={drugInfo.howToTake?.trim() || drugInfo.dosageAdministration} /></bdi>
          </div>
        </div>
      )}

      {/* ── Warnings, weighted ── */}
      {drugInfo.tellYourDoctorIf?.trim() && (
        <div className="px-5 pt-5">
          <div className="bg-saffron-wash rounded-[16px] py-4 px-[18px]">
            <div className="flex items-center gap-[9px] mb-2">
              <WarnIcon />
              <span className="font-semibold text-[16px] text-saffron">{t('tellYourDoctorIfLabel')}</span>
            </div>
            <p className="text-[16px] leading-[1.55] text-saffron m-0">
              <bdi>{drugInfo.tellYourDoctorIf}</bdi>
            </p>
          </div>
        </div>
      )}

      {drugInfo.neverWith?.trim() && (
        <div className="px-5 pt-3">
          <div className="bg-white rounded-[16px] py-4 px-[18px]" style={{ border: '2px solid #E7BDB4' }}>
            <div className="flex items-center gap-[9px] mb-2">
              <DangerIcon />
              <span className="font-semibold text-[16px] text-clay">{t('neverWithLabel')}</span>
            </div>
            <p className="text-[16px] leading-[1.55] text-clay-deep m-0">
              <bdi>{drugInfo.neverWith}</bdi>
            </p>
            <button
              type="button"
              onClick={onShowMyMedications}
              className="font-semibold text-[15px] text-clay mt-2.5 active:scale-[0.98] transition-transform"
            >
              {t('checkAgainstMyMedicines')} <span className="rtl:hidden">→</span><span className="hidden rtl:inline">←</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Reference, one screen away ── */}
      <div className="px-5 pt-[22px] flex gap-2.5 flex-wrap" data-tutorial="detail-chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onShowDetails(chip.key)}
            className="h-10 px-[15px] rounded-full flex items-center font-medium text-[15px]
              bg-white text-ink border border-paper-sand active:scale-[0.97] transition-transform"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* ── Professional view ── */}
      <div className="px-5 pt-3">
        <button
          type="button"
          onClick={onShowProfessionalView}
          data-tutorial="professional-link"
          className="w-full bg-white border border-paper-sand rounded-[16px] py-[15px] px-[18px]
            flex items-center gap-[13px] text-start active:scale-[0.99] transition-transform"
        >
          <ProfessionalIcon />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[16px] leading-[1.35] text-ink">{t('professionalView')}</span>
            <span className="block text-[14px] leading-[1.4] text-ink-soft">{t('professionalViewSub')}</span>
          </span>
          <Chevron color="#5B6A6A" />
        </button>
      </div>

      {/* Clears the sticky bar so the last card is never trapped under it. */}
      <div className="h-[100px]" aria-hidden="true" />

      {/* ── Sticky actions ── */}
      <div
        className="sticky bottom-0 mt-auto border-t border-paper-sand px-4 pt-3 flex gap-2.5"
        style={{
          background: 'rgba(247, 243, 236, 0.96)',
          backdropFilter: 'blur(8px)',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          onClick={handleSaveMedication}
          data-tutorial="save-medicine"
          className={`flex-1 h-[54px] rounded-full flex items-center justify-center gap-[9px]
            font-semibold text-[17px] active:scale-[0.98] transition-transform ${
              isSaved ? 'bg-white border border-teal text-teal' : 'bg-teal text-white'
            }`}
        >
          <BookmarkIcon size={21} color={isSaved ? '#0A5A56' : '#ffffff'} filled={isSaved} />
          {isSaved ? t('savedToMyMedicines') : t('saveToMyMedicines')}
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          aria-label={t('exportShare')}
          className="w-[54px] h-[54px] rounded-full bg-white border border-paper-edge
            flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      {/* ── Export sheet ── */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: 'rgba(11, 43, 46, 0.45)' }}
          onClick={() => setExportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('exportShare')}
            className="w-full bg-paper rounded-t-[24px] p-4 pb-6 flex flex-col gap-2 animate-fade-in"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="w-10 h-1 rounded-full bg-paper-edge mx-auto mb-2" aria-hidden="true" />
            <button
              type="button"
              onClick={() => { setExportOpen(false); requestExport('pdf'); }}
              className="h-[54px] rounded-[14px] bg-white border border-paper-sand px-4
                flex items-center font-medium text-[16px] text-ink active:scale-[0.99] transition-transform"
            >
              {t('exportAsPdfLabel')}
            </button>
            <button
              type="button"
              onClick={() => { setExportOpen(false); requestExport('doc'); }}
              className="h-[54px] rounded-[14px] bg-white border border-paper-sand px-4
                flex items-center font-medium text-[16px] text-ink active:scale-[0.99] transition-transform"
            >
              {t('exportAsDocLabel')}
            </button>
            <button
              type="button"
              onClick={() => { setExportOpen(false); openDetails(); }}
              data-tutorial="report-details"
              className="rounded-[14px] bg-white border border-paper-sand px-4 py-3.5
                text-start active:scale-[0.99] transition-transform"
            >
              <span className="block font-medium text-[16px] text-ink">{t('addPatientDetails')}</span>
              <span className="block text-[13px] leading-[1.45] text-ink-soft mt-0.5">
                {t('patientDetailsOnReport')}
              </span>
            </button>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
};
