import React, { useEffect, useRef, useState } from 'react';
import type { DrugInfo, PatientInfo, DetailSection } from '../types';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';
import { useReportExport } from '../lib/useReportExport';

/**
 * Mild and urgent, told apart.
 *
 * A single alphabetical list of side effects makes a headache and liver
 * failure look like the same kind of fact. They are separated here: the common
 * ones in a plain card, the ones worth acting on today behind a clay border
 * with its own heading, so the difference survives being skimmed in a
 * pharmacy queue.
 *
 * Everything that is reference rather than answer — a missed dose, food, how
 * to store it — lives here too, off the result screen.
 */

interface SideEffectsScreenProps {
  drugInfo: DrugInfo;
  patientInfo: PatientInfo;
  originalDrugName: string;
  /** Which section to open at. The chips on the result screen each pick one. */
  anchor: DetailSection;
  onBack: () => void;
  onPatientInfoChange: (info: Partial<PatientInfo>) => void;
}

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const ShareIcon: React.FC<{ color?: string }> = ({ color = 'var(--ink)' }) => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v6h14v-6" />
  </svg>
);

const BookmarkIcon: React.FC<{ color?: string; filled?: boolean }> = ({ color = 'var(--on-teal)', filled = false }) => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill={filled ? color : 'none'} stroke={color}
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h12v17l-6-4-6 4z" />
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

const Eyebrow: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({
  children,
  color = 'var(--ink-soft)',
  className = '',
}) => (
  <div className={`font-mono font-semibold text-[12px] tracking-[0.06em] ${className}`} style={{ color }}>
    {children}
  </div>
);

/** One entry in either list. The dot carries the card's colour. */
const Bullet: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <div className="flex gap-[11px] items-start py-[11px]">
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mt-2"
      style={{ background: color }}
      aria-hidden="true"
    />
    <span className="text-[16px] leading-[1.5] text-ink-dim">
      <bdi><MarkdownText text={text} inline /></bdi>
    </span>
  </div>
);

/** A plain labelled paragraph, the shape the design uses below the two lists. */
const Passage: React.FC<{ label: string; text: string; id?: string }> = ({ label, text, id }) => {
  if (!text || !text.trim()) return null;
  return (
    <div className="px-5 pt-[22px]" id={id}>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="text-[16px] leading-[1.6] text-ink-dim">
        <bdi><MarkdownText text={text} /></bdi>
      </div>
    </div>
  );
};

export const SideEffectsScreen: React.FC<SideEffectsScreenProps> = ({
  drugInfo,
  patientInfo,
  originalDrugName,
  anchor,
  onBack,
  onPatientInfoChange,
}) => {
  const { t, language } = useLocalization();
  const [isSaved, setIsSaved] = useState(false);
  const { requestExport, dialog } = useReportExport(drugInfo, patientInfo, onPatientInfoChange);
  const missedRef = useRef<HTMLDivElement | null>(null);
  const storageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsSaved(isMedicationSaved(drugInfo.drugName));
  }, [drugInfo.drugName]);

  // Arriving from the "Missed dose" or "Storage" chip should land on that
  // section rather than making the user scroll past the side effects to it.
  useEffect(() => {
    const target = anchor === 'missedDose' ? missedRef.current : anchor === 'storage' ? storageRef.current : null;
    if (!target) return;
    // After paint, or the sticky header measures against a half-built page.
    const id = requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
    return () => cancelAnimationFrame(id);
  }, [anchor]);

  const title = [drugInfo.brandName?.trim() || drugInfo.drugName, drugInfo.strength?.trim()]
    .filter(Boolean)
    .join(' ');

  const common = drugInfo.commonSideEffects.filter((effect) => effect.trim());
  const serious = drugInfo.seriousSideEffects.filter((effect) => effect.trim());
  const consult = drugInfo.consultDoctorWhen.filter((reason) => reason.trim());

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Sticky header, so the medicine is never in doubt ── */}
      <div
        className="sticky top-0 z-20 border-b border-paper-sand px-4 py-3 flex items-center gap-3.5"
        style={{ background: 'var(--bar)', backdropFilter: 'blur(8px)' }}
      >
        <button type="button" onClick={onBack} aria-label={t('backToSearch')} className="active:scale-90 transition-transform">
          <ChevronBack />
        </button>
        <span className="font-semibold text-[16px] text-ink truncate"><bdi>{title}</bdi></span>
      </div>

      <div className="px-5 pt-[22px]">
        <Eyebrow className="mb-1">{t('sideEffectsEyebrow')}</Eyebrow>
        <h2 className="font-semibold text-[24px] leading-[1.25] text-ink m-0 mb-1">{t('sideEffectsHeadline')}</h2>
        <p className="text-[15px] leading-[1.55] text-ink-soft m-0">{t('sideEffectsSubhead')}</p>
      </div>

      {/* ── Common, usually mild ── */}
      <div className="px-5 pt-[18px]">
        <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-1.5">
          <Eyebrow className="pt-3 pb-1">{t('commonUsuallyMild')}</Eyebrow>
          {common.length > 0 ? (
            common.map((effect, i) => <Bullet key={i} text={effect} color="var(--ink-soft)" />)
          ) : (
            <p className="text-[16px] leading-[1.5] text-ink-soft m-0 py-[11px]">{t('noneListed')}</p>
          )}
          <div className="h-1.5" />
        </div>
      </div>

      {/* ── The ones worth acting on today ── */}
      {serious.length > 0 && (
        <div className="px-5 pt-3">
          <div className="bg-surface rounded-[16px] px-[18px] py-1.5" style={{ border: '2px solid var(--clay-soft)' }}>
            <div className="flex items-center gap-[9px] pt-3.5 pb-1.5">
              <DangerIcon />
              <span className="font-semibold text-[15px] text-clay">{t('stopAndGetHelp')}</span>
            </div>
            {serious.map((effect, i) => <Bullet key={i} text={effect} color="var(--clay)" />)}
            <div className="h-1.5" />
          </div>
        </div>
      )}

      {/* Not a side effect, but the same "act on this" register, so it keeps
          the plain-list shape rather than borrowing the clay border. */}
      {consult.length > 0 && (
        <div className="px-5 pt-[22px]">
          <Eyebrow className="mb-1">{t('callYourDoctorIf')}</Eyebrow>
          <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-1.5 mt-2">
            {consult.map((reason, i) => <Bullet key={i} text={reason} color="var(--ink-soft)" />)}
            <div className="h-1.5" />
          </div>
        </div>
      )}

      <div ref={missedRef} style={{ scrollMarginTop: 64 }}>
        <Passage label={t('ifYouMissADose')} text={drugInfo.missedDose} />
      </div>
      <Passage label={t('foodAndDrink')} text={drugInfo.foodDrinkEffect} />
      <div ref={storageRef} style={{ scrollMarginTop: 64 }}>
        <Passage label={t('storageLabel')} text={drugInfo.storage} />
      </div>

      {/* ── Hand it to someone who knows ── */}
      <div className="px-5 pt-6">
        <div className="bg-invert rounded-[18px] p-5 border border-paper-sand">
          <div className="font-semibold text-[17px] leading-[1.35] text-invert-ink mb-1.5">{t('stillUnsure')}</div>
          <p className="text-[14.5px] leading-[1.55] m-0 mb-3.5 text-invert-soft">
            {t('stillUnsureBody')}
          </p>
          <button
            type="button"
            onClick={() => requestExport('pdf')}
            className="w-full h-12 rounded-full bg-surface flex items-center justify-center gap-[9px]
              font-semibold text-[16px] text-ink active:scale-[0.98] transition-transform"
          >
            <ShareIcon />
            {t('shareThisPage')}
          </button>
        </div>
      </div>

      <div className="px-5 py-5 text-center">
        <p className="text-[13px] leading-[1.6] text-ink-soft m-0">{t('aiGeneratedNote')}</p>
      </div>

      {/* Clears the sticky bar so the last line is never trapped under it. */}
      <div className="h-20" aria-hidden="true" />

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
          onClick={() => setIsSaved(toggleMedication(drugInfo, language, originalDrugName))}
          data-tutorial="save-medicine"
          className={`flex-1 h-[54px] rounded-full flex items-center justify-center gap-[9px]
            font-semibold text-[17px] active:scale-[0.98] transition-transform ${
              isSaved ? 'bg-surface border border-teal text-teal' : 'bg-teal text-teal-on'
            }`}
        >
          <BookmarkIcon color={isSaved ? 'var(--teal)' : 'var(--on-teal)'} filled={isSaved} />
          {isSaved ? t('savedToMyMedicines') : t('saveToMyMedicines')}
        </button>
        <button
          type="button"
          onClick={() => requestExport('pdf')}
          aria-label={t('exportShare')}
          className="w-[54px] h-[54px] rounded-full bg-surface border border-paper-edge
            flex items-center justify-center shrink-0 active:scale-95 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      {dialog}
    </div>
  );
};
