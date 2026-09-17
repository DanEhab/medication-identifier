import React, { useState, useEffect } from 'react';
import type { DrugInfo, PatientInfo, DetailSection } from '../types';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';
import { useReportExport } from '../lib/useReportExport';
import { dosageFormOf, isSwallowed } from '../lib/dosageForm';
import { DosageFormIcon } from './DosageFormIcon';
import { SettingsButton } from './SettingsScreen';

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
  /** Opens the reference screen for the section the chip names. */
  onShowDetails: (section: DetailSection) => void;
  /** Persists edited patient details. Merged over the stored values. */
  onPatientInfoChange: (info: Partial<PatientInfo>) => void;
  /** Settings, returning here rather than to the camera. */
  onOpenSettings: () => void;
}



// ── Icons, sized and stroked to the design rather than to the shared set ──

const Chevron: React.FC<{ back?: boolean; color?: string }> = ({ back, color = 'var(--ink)' }) => (
  <svg viewBox="0 0 24 24" width={back ? 24 : 20} height={back ? 24 : 20} fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
    <path d={back ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
  </svg>
);

const ShareIcon: React.FC<{ size?: number; color?: string }> = ({ size = 21, color = 'var(--ink)' }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v6h14v-6" />
  </svg>
);

const BookmarkIcon: React.FC<{ size?: number; color?: string; filled?: boolean }> = ({
  size = 21,
  color = 'var(--ink)',
  filled = false,
}) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={filled ? color : 'none'} stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12v17l-6-4-6 4z" />
  </svg>
);

const WarnIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="text-saffron-mid shrink-0">
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

const ProfessionalIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-teal shrink-0">
    <path d="M4 5h16v11H4z" />
    <path d="M9 20h6" />
    <path d="M12 16v4" />
  </svg>
);

/** A label in the mono caps used for every section heading in the design. */
/* One per reference screen, so the three rows are told apart without reading. */
const SideEffectsIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
    <path d="M9 9.5h.01" />
    <path d="M15 9.5h.01" />
    <path d="M8.8 15.5a4 4 0 0 1 6.4 0" />
  </svg>
);

const MissedDoseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

const StorageIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
    <path d="M4 8.5 12 13l8-4.5" />
    <path d="M12 13v7" />
  </svg>
);

/**
 * The small label that names the one thing directly beneath it.
 *
 * Fifteen pixels, not thirteen. At thirteen it was smaller than the seventeen
 * pixel body text it introduced — so "WHAT IT IS FOR" and "FOOD AND DRINK",
 * which are what somebody scans for, were the quietest type on the page.
 */
const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({
  children,
  color = 'var(--ink-soft)',
  className = '',
}) => (
  <div className={`font-mono font-semibold text-[15px] tracking-[0.06em] ${className}`} style={{ color }}>
    {children}
  </div>
);

const QuickFact: React.FC<{ value: string; note: string }> = ({ value, note }) => (
  <div className="bg-surface border border-paper-sand rounded-[14px] py-3 px-2 text-center">
    <div className="font-semibold text-[17px] leading-[1.2] text-ink"><bdi>{value}</bdi></div>
    {note && <div className="text-[14px] leading-[1.3] text-ink-soft mt-0.5"><bdi>{note}</bdi></div>}
  </div>
);

/**
 * The heading over a part of the page.
 *
 * The screen used to have no headings at all — a teal card, then three tiles,
 * then a mono label, then two coloured cards, then a row of chips, each a
 * different shape at a different weight with nothing saying which of them were
 * peers. Scrolling it felt like a pile rather than a document.
 *
 * The same heading the settings screen uses, so the two agree on what a
 * section looks like. The small mono label is kept for what it is good at:
 * naming the one value directly beneath it.
 */
const SectionHeading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="font-semibold text-[20px] leading-[1.3] tracking-[-0.01em] text-ink px-5 m-0 mb-3 mt-7">
    {children}
  </h2>
);

/**
 * Things the answer gave as a list, shown as a list.
 *
 * "Never with" arrives as one line with the items divided by "·", and it was
 * printed that way: nine separate interactions running together into a
 * paragraph that had to be read word by word to find out whether your own
 * medicine was in it. They are the same nine items, one per line, so the
 * answer to "is coffee in here" is a glance instead of a search.
 */
export const splitList = (line: string): string[] =>
  line
    .split('·')
    .map((item) => item.trim())
    .filter(Boolean);

const BulletList: React.FC<{ items: string[]; color: string; textClass: string }> = ({
  items, color, textClass,
}) => (
  <ul className="m-0 p-0 list-none flex flex-col gap-[7px]">
    {items.map((item, index) => (
      <li key={index} className="flex gap-2.5 items-start">
        <span
          className="w-[5px] h-[5px] rounded-full shrink-0 mt-[9px]"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span className={`text-[17px] leading-[1.5] ${textClass}`}>
          <bdi><MarkdownText text={item} inline /></bdi>
        </span>
      </li>
    ))}
  </ul>
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
  onOpenSettings,
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
  const form = dosageFormOf(drugInfo);
  // Nobody "takes" a cream or a patch.
  const takingLabel = isSwallowed(form) ? t('howToTakeItLabel') : t('howToUseItLabel');

  const quickFacts = [
    { value: drugInfo.quickDose, note: drugInfo.quickDoseNote },
    { value: drugInfo.quickTiming, note: drugInfo.quickTimingNote },
    { value: drugInfo.quickFood, note: drugInfo.quickFoodNote },
  ].filter((fact) => Boolean(fact.value?.trim()));

  /*
    Each opens its own screen.

    All three used to open one long page and scroll it to a different point,
    so tapping "Storage" landed you in the middle of a list of side effects
    with the heading of a different subject above you — and scrolling up or
    down put you back in somebody else's section. They are three subjects, so
    they are three screens.

    Rows rather than pills: three pills in a line have room for two or three
    words each and no room for an icon, and a pill is the shape this app uses
    for a filter. These are destinations.
  */
  const chips: { key: DetailSection; label: string; icon: React.ReactNode }[] = [
    { key: 'sideEffects', label: t('sideEffectsChip'), icon: <SideEffectsIcon /> },
    { key: 'missedDose', label: t('missedDoseChip'), icon: <MissedDoseIcon /> },
    { key: 'storage', label: t('storageChip'), icon: <StorageIcon /> },
  ];

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/*
        ── Top bar ──

        Back and settings, and nothing else. Saving and sharing were up here as
        well as in the bar at the foot of the screen, so the page opened with
        four controls in two places doing two things — and the two that are
        pinned to the bottom are the ones within reach of a thumb anyway.

        Settings is here because the language switch, the theme and the tour
        live behind it, and needing any of them used to mean leaving the
        medicine, changing the setting, and searching for it again.
      */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <button type="button" onClick={onBack} aria-label={t('backToSearch')} className="p-2.5 -m-2.5 active:scale-90 transition-transform">
          <Chevron back />
        </button>
        <SettingsButton onClick={onOpenSettings} />
      </div>

      {/*
        ── Identity ──

        The tile used to be an empty dark square, and `rtl:hidden` on top of
        that, so an Arabic reader saw a name with nothing beside it at all. It
        is a drawing of the form the medicine comes in now — a tube looks like
        a tube — which is the one thing on the page somebody can check against
        what is in their hand without reading a word.
      */}
      <div className="px-5 pt-1.5">
        <div className="flex items-start gap-3.5">
          <DosageFormIcon form={form} size={46} className="mt-1" />
          <div className="min-w-0 flex-1">
            {showIngredient && (
              // Arabic has no capitals, so upper-casing it does nothing but
              // risk mangling the odd Latin ingredient name inside it.
              <Eyebrow className="mb-1">
                {language === 'ar' ? ingredient! : ingredient!.toUpperCase()}
              </Eyebrow>
            )}
            <h1 className="result-name font-semibold text-[40px] leading-[1.05] tracking-[-0.03em] text-ink m-0 mb-1.5 break-words">
              {brand}
            </h1>
            {drugInfo.strength && (
              <div className="text-[18px] text-ink-soft"><bdi>{drugInfo.strength}</bdi></div>
            )}
          </div>
        </div>

        {drugInfo.whatItIsFor?.trim() && (
          <div className="bg-teal-wash rounded-[16px] py-4 px-[18px] mt-[18px]" data-tutorial="what-it-is-for">
            <Eyebrow color="var(--teal)" className="mb-1.5">{t('whatItIsForLabel')}</Eyebrow>
            <p className="text-[18px] leading-[1.5] text-ink m-0" style={{ textWrap: 'pretty' } as React.CSSProperties}>
              <bdi>{drugInfo.whatItIsFor}</bdi>
            </p>
          </div>
        )}
      </div>

      {/*
        ── Taking it ──

        The three tiles and the instructions belong together and used to be two
        unrelated blocks: an unlabelled row of numbers, then a mono label over a
        paragraph. They answer one question between them, so they sit under one
        heading and read as its summary and its detail.
      */}
      {(quickFacts.length > 0 || drugInfo.howToTake?.trim() || drugInfo.dosageAdministration
        || drugInfo.foodDrinkEffect?.trim()) && (
        <>
          <SectionHeading>{takingLabel}</SectionHeading>

          {quickFacts.length > 0 && (
            <div className="grid grid-cols-3 gap-2 px-5" data-tutorial="quick-facts">
              {quickFacts.map((fact) => (
                <QuickFact key={fact.value} value={fact.value!} note={fact.note?.trim() || ''} />
              ))}
            </div>
          )}

          {(drugInfo.howToTake?.trim() || drugInfo.dosageAdministration) && (
            <div className="px-5 pt-4" data-testid="how-to-take">
              <div className="text-[17px] leading-[1.6] text-ink-dim">
                <bdi><MarkdownText text={drugInfo.howToTake?.trim() || drugInfo.dosageAdministration} /></bdi>
              </div>
            </div>
          )}

          {/*
            Food had no home. It was on the reference screen behind the
            "missed dose" chip, which is not where anybody would look for it,
            while the tile above says only "with meals" or "not needed".
          */}
          {drugInfo.foodDrinkEffect?.trim() && (
            <div className="px-5 pt-4" data-testid="food-and-drink">
              <Eyebrow className="mb-1.5">{t('foodAndDrink')}</Eyebrow>
              <div className="text-[17px] leading-[1.6] text-ink-dim">
                <bdi><MarkdownText text={drugInfo.foodDrinkEffect} /></bdi>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Warnings, weighted ── */}
      {(drugInfo.tellYourDoctorIf?.trim() || drugInfo.neverWith?.trim()) && (
        <SectionHeading>{t('warningsSection')}</SectionHeading>
      )}

      {drugInfo.tellYourDoctorIf?.trim() && (
        <div className="px-5">
          <div className="bg-saffron-wash rounded-[16px] py-4 px-[18px]">
            <div className="flex items-center gap-[9px] mb-2">
              <WarnIcon />
              <h3 className="font-semibold text-[17px] text-saffron m-0">{t('tellYourDoctorIfLabel')}</h3>
            </div>
            <p className="text-[17px] leading-[1.55] text-saffron m-0">
              <bdi>{drugInfo.tellYourDoctorIf}</bdi>
            </p>
          </div>
        </div>
      )}

      {drugInfo.neverWith?.trim() && (
        <div className="px-5 pt-3">
          <div className="bg-surface rounded-[16px] py-4 px-[18px]" style={{ border: '2px solid var(--clay-soft)' }}>
            <div className="flex items-center gap-[9px] mb-2.5">
              <DangerIcon />
              <h3 className="font-semibold text-[17px] text-clay m-0">{t('neverWithLabel')}</h3>
            </div>
            <BulletList
              items={splitList(drugInfo.neverWith)}
              color="var(--clay)"
              textClass="text-clay-deep"
            />
            <button
              type="button"
              onClick={onShowMyMedications}
              // py-2 rather than a bare line of text: a link is a control, and
              // one line of 16px type is 24 pixels of it to aim at.
              className="font-semibold text-[16px] text-clay mt-2.5 py-2 active:scale-[0.98] transition-transform"
            >
              {t('checkAgainstMyMedicines')} <span className="rtl:hidden">→</span><span className="hidden rtl:inline">←</span>
            </button>
          </div>
        </div>
      )}

      {/*
        ── Reference ──

        A bare row of pills with nothing over it, sitting between a red warning
        card and a blue one, read as leftovers. They are the rest of the
        answer, and the heading says so.
      */}
      <SectionHeading>{t('moreAboutThisMedicine')}</SectionHeading>

      <div className="px-5 flex flex-col gap-2.5" data-tutorial="detail-chips">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => onShowDetails(chip.key)}
            data-testid={`chip-${chip.key}`}
            className="w-full bg-surface border border-paper-sand rounded-[14px] py-[13px] px-[16px]
              flex items-center gap-3 text-start active:scale-[0.99] transition-transform"
          >
            <span className="text-ink shrink-0">{chip.icon}</span>
            <span className="flex-1 min-w-0 font-medium text-[17px] text-ink">{chip.label}</span>
            <Chevron color="var(--ink-soft)" />
          </button>
        ))}
      </div>

      {/* ── Professional view ── */}
      <div className="px-5 pt-2.5">
        <button
          type="button"
          onClick={onShowProfessionalView}
          data-tutorial="professional-link"
          className="w-full bg-surface border border-paper-sand rounded-[16px] py-[15px] px-[18px]
            flex items-center gap-[13px] text-start active:scale-[0.99] transition-transform"
        >
          <ProfessionalIcon />
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[17px] leading-[1.35] text-ink">{t('professionalView')}</span>
            <span className="block text-[15px] leading-[1.4] text-ink-soft">{t('professionalViewSub')}</span>
          </span>
          <Chevron color="var(--ink-soft)" />
        </button>
      </div>

      {/* Clears the sticky bar so the last card is never trapped under it. */}
      <div className="h-[100px]" aria-hidden="true" />

      {/* ── Sticky actions ── */}
      <div
        className="sticky bottom-0 mt-auto border-t border-paper-sand px-4 pt-3 flex gap-2.5"
        style={{
          background: 'var(--bar)',
          backdropFilter: 'blur(8px)',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        <button
          type="button"
          onClick={handleSaveMedication}
          data-tutorial="save-medicine"
          className={`flex-1 h-[54px] rounded-full flex items-center justify-center gap-[9px]
            font-semibold text-[18px] active:scale-[0.98] transition-transform ${
              isSaved ? 'bg-surface border border-teal text-teal' : 'bg-teal text-teal-on'
            }`}
        >
          <BookmarkIcon size={21} color={isSaved ? 'var(--teal)' : 'var(--on-teal)'} filled={isSaved} />
          {isSaved ? t('savedToMyMedicines') : t('saveToMyMedicines')}
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          aria-label={t('exportShare')}
          className="w-[54px] h-[54px] rounded-full bg-surface border border-paper-edge
            flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      {/* ── Export sheet ── */}
      {exportOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end"
          style={{ background: 'var(--scrim)' }}
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
              className="h-[54px] rounded-[14px] bg-surface border border-paper-sand px-4
                flex items-center font-medium text-[17px] text-ink active:scale-[0.99] transition-transform"
            >
              {t('exportAsPdfLabel')}
            </button>
            <button
              type="button"
              onClick={() => { setExportOpen(false); requestExport('doc'); }}
              className="h-[54px] rounded-[14px] bg-surface border border-paper-sand px-4
                flex items-center font-medium text-[17px] text-ink active:scale-[0.99] transition-transform"
            >
              {t('exportAsDocLabel')}
            </button>
            <button
              type="button"
              onClick={() => { setExportOpen(false); openDetails(); }}
              data-tutorial="report-details"
              className="rounded-[14px] bg-surface border border-paper-sand px-4 py-3.5
                text-start active:scale-[0.99] transition-transform"
            >
              <span className="block font-medium text-[17px] text-ink">{t('addPatientDetails')}</span>
              <span className="block text-[14px] leading-[1.45] text-ink-soft mt-0.5">
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
