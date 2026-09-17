import React, { useEffect, useState } from 'react';
import type { DrugInfo, PatientInfo, DetailSection } from '../types';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';
import { useReportExport } from '../lib/useReportExport';
import { withoutUrgentRepeats } from '../lib/sideEffects';

/**
 * Mild and urgent, told apart.
 *
 * A single alphabetical list of side effects makes a headache and liver
 * failure look like the same kind of fact. They are separated here: the common
 * ones in a plain card, the ones worth acting on today behind a clay border
 * with its own heading, so the difference survives being skimmed in a
 * pharmacy queue.
 *
 * It also serves the missed-dose and storage screens, which are the same
 * furniture around a different subject: the same header naming the medicine,
 * the same way back, the same save and share at the foot. They were one page
 * scrolled to three places, which meant arriving under somebody else's heading
 * with two other subjects a flick away.
 */

interface SideEffectsScreenProps {
  drugInfo: DrugInfo;
  patientInfo: PatientInfo;
  originalDrugName: string;
  /** Which of the three subjects this screen is about. */
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

/* Ring somebody, rather than go somewhere — the gentler of the two warnings. */
const CallIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-saffron-mid shrink-0">
    <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
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

/**
 * The small label that names a block.
 *
 * Fifteen pixels, not thirteen. At thirteen it was smaller than the body text
 * it introduced, so the heading of a list was quieter than the list — which is
 * backwards, and made the page read as one undifferentiated column.
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

/**
 * The heading on each of the three lists, so they look like three of a kind.
 *
 * "Call your doctor if" used to be a label outside its card while the other
 * two were headings inside theirs, which made it read as a caption for the
 * whole rest of the page rather than for the list under it.
 */
const ListHeading: React.FC<{ icon?: React.ReactNode; color: string; children: React.ReactNode }> = ({
  icon, color, children,
}) => (
  <div className="flex items-center gap-[9px] pt-3.5 pb-2">
    {icon}
    <h3 className="font-mono font-semibold text-[15px] tracking-[0.06em] m-0" style={{ color }}>
      {children}
    </h3>
  </div>
);

/**
 * One entry in any of the lists. The dot carries the card's colour.
 *
 * The gap used to be eleven pixels above and below every item, so a list of
 * seven was twenty-two pixels of nothing between each pair of short lines and
 * ran off the bottom of the screen for no reason.
 */
const Bullet: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <div className="flex gap-[11px] items-start py-[5px]">
    <span
      className="w-1.5 h-1.5 rounded-full shrink-0 mt-[9px]"
      style={{ background: color }}
      aria-hidden="true"
    />
    <span className="text-[17px] leading-[1.5] text-ink-dim">
      <bdi><MarkdownText text={text} inline /></bdi>
    </span>
  </div>
);

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
  useEffect(() => {
    setIsSaved(isMedicationSaved(drugInfo.drugName));
  }, [drugInfo.drugName]);

  const title = [drugInfo.brandName?.trim() || drugInfo.drugName, drugInfo.strength?.trim()]
    .filter(Boolean)
    .join(' ');

  const common = drugInfo.commonSideEffects.filter((effect) => effect.trim());
  const serious = drugInfo.seriousSideEffects.filter((effect) => effect.trim());
  const consult = withoutUrgentRepeats(
    drugInfo.consultDoctorWhen.filter((reason) => reason.trim()),
    serious,
  );

  /*
    The heading is the subject, so it changes with it. The screen used to open
    with "Side effects — not everyone gets these" whichever chip had been
    pressed, which is how it read as one page with three entrances rather than
    three pages.
  */
  const heading = {
    sideEffects: {
      eyebrow: t('sideEffectsEyebrow'),
      headline: t('sideEffectsHeadline'),
      subhead: t('sideEffectsSubhead'),
    },
    missedDose: {
      eyebrow: t('missedDoseChip'),
      headline: t('missedDoseHeadline'),
      subhead: t('missedDoseSubhead'),
    },
    storage: {
      eyebrow: t('storageChip'),
      headline: t('storageHeadline'),
      subhead: t('storageSubhead'),
    },
  }[anchor];

  const { eyebrow, headline, subhead } = heading;

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Sticky header, so the medicine is never in doubt ── */}
      <div
        className="sticky top-0 z-20 border-b border-paper-sand px-4 py-3 flex items-center gap-3.5"
        style={{ background: 'var(--bar)', backdropFilter: 'blur(8px)' }}
      >
        <button type="button" onClick={onBack} aria-label={t('backToSearch')} className="p-2.5 -m-2.5 active:scale-90 transition-transform">
          <ChevronBack />
        </button>
        <span className="font-semibold text-[17px] text-ink truncate"><bdi>{title}</bdi></span>
      </div>

      {/*
        ── One subject per screen ──

        All three chips used to open this page and scroll it to a different
        point, so "Storage" landed you halfway down a list of side effects with
        somebody else's heading above you, and a flick in either direction put
        you back in a section you had not asked for. A screen that answers one
        question can be read to the end.
      */}
      {/*
        The top of the page, in the order of importance it actually has: which
        subject this is, the sentence that answers it, and the qualifier.

        The three used to be 13, 24 and 16 pixels, so the subject label — the
        thing that says which of the three screens you are on — was the
        smallest text on it, smaller even than the qualifier beneath the
        headline.
      */}
      <div className="px-5 pt-[22px]">
        <Eyebrow className="mb-1.5">{eyebrow}</Eyebrow>
        <h2 className="font-semibold text-[26px] leading-[1.2] tracking-[-0.015em] text-ink m-0 mb-1.5">
          {headline}
        </h2>
        {subhead && <p className="text-[17px] leading-[1.5] text-ink-soft m-0">{subhead}</p>}
      </div>

      {/*
        Three lists, told apart by how urgently they need acting on and by
        nothing else. Same card, same heading, same spacing — only the colour
        and the border change, so the difference between them is the one thing
        that carries meaning.
      */}
      {anchor === 'sideEffects' && (
        <>
          {/* ── Common, usually mild ── */}
          <div className="px-5 pt-[18px]">
            <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-1.5">
              <ListHeading color="var(--ink-soft)">{t('commonUsuallyMild')}</ListHeading>
              {common.length > 0 ? (
                common.map((effect, i) => <Bullet key={i} text={effect} color="var(--ink-soft)" />)
              ) : (
                <p className="text-[17px] leading-[1.5] text-ink-soft m-0 py-[5px]">{t('noneListed')}</p>
              )}
              <div className="h-3" />
            </div>
          </div>

          {/* ── The ones worth acting on today ── */}
          {serious.length > 0 && (
            <div className="px-5 pt-3">
              <div className="bg-surface rounded-[16px] px-[18px] py-1.5" style={{ border: '2px solid var(--clay-soft)' }}>
                <ListHeading icon={<DangerIcon />} color="var(--clay)">{t('stopAndGetHelp')}</ListHeading>
                {serious.map((effect, i) => <Bullet key={i} text={effect} color="var(--clay)" />)}
                <div className="h-3" />
              </div>
            </div>
          )}

          {/*
            Not an emergency, and not a repeat of one either.

            The model fills both lists from the same knowledge, so the urgent
            items came back here as well, written out as sentences — "Chest
            pain" in the list above and "You experience chest pain or a very
            fast heart rate" in this one. The repeats are removed; what is left
            is the things this list exists for, like being pregnant, which is
            not an emergency and needs saying somewhere.
          */}
          {consult.length > 0 && (
            <div className="px-5 pt-3">
              <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-1.5">
                <ListHeading icon={<CallIcon />} color="var(--saffron)">{t('callYourDoctorIf')}</ListHeading>
                {consult.map((reason, i) => <Bullet key={i} text={reason} color="var(--saffron-mid)" />)}
                <div className="h-3" />
              </div>
            </div>
          )}
        </>
      )}

      {anchor === 'missedDose' && (
        <div className="px-5 pt-[18px]">
          <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-[18px]">
            <div className="text-[17px] leading-[1.6] text-ink-dim">
              <bdi><MarkdownText text={drugInfo.missedDose || t('noneListed')} /></bdi>
            </div>
          </div>
        </div>
      )}

      {anchor === 'storage' && (
        <div className="px-5 pt-[18px]">
          <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-[18px]">
            <div className="text-[17px] leading-[1.6] text-ink-dim">
              <bdi><MarkdownText text={drugInfo.storage || t('noneListed')} /></bdi>
            </div>
          </div>
        </div>
      )}

      {/* ── Hand it to someone who knows ── */}
      <div className="px-5 pt-6">
        <div className="bg-invert rounded-[18px] p-5 border border-paper-sand">
          <div className="font-semibold text-[18px] leading-[1.35] text-invert-ink mb-1.5">{t('stillUnsure')}</div>
          <p className="text-[15px] leading-[1.55] m-0 mb-3.5 text-invert-soft">
            {t('stillUnsureBody')}
          </p>
          <button
            type="button"
            onClick={() => requestExport('pdf')}
            className="w-full h-12 rounded-full bg-surface flex items-center justify-center gap-[9px]
              font-semibold text-[17px] text-ink active:scale-[0.98] transition-transform"
          >
            <ShareIcon />
            {t('shareThisPage')}
          </button>
        </div>
      </div>

      <div className="px-5 py-5 text-center">
        <p className="text-[14px] leading-[1.6] text-ink-soft m-0">{t('aiGeneratedNote')}</p>
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
            font-semibold text-[18px] active:scale-[0.98] transition-transform ${
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
