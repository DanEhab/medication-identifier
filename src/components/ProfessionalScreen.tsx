import React, { useEffect, useState } from 'react';
import type { ProfessionalDrugInfo } from '../types';
import { fetchProfessionalDrugInformation } from '../services/geminiService';
import { useLocalization } from '../context/LanguageContext';
import { useReportExport } from '../lib/useReportExport';
import type { DrugInfo, PatientInfo } from '../types';

/**
 * The same drug, for clinicians.
 *
 * Not a different app: the segmented control at the top is the point — one
 * medicine, two registers, a tap apart. Where the patient view leads with what
 * the medicine does for you, this one leads with what it is: ATC code, class,
 * mechanism, kinetics, in the compressed form somebody who already knows the
 * vocabulary reads fastest.
 *
 * It says what it is at the bottom. A model summary is a starting point for
 * somebody who can check it, not a substitute for the SPC.
 */

interface ProfessionalScreenProps {
  drugName: string;
  /** The patient record behind this, so the share button can export it. */
  drugInfo: DrugInfo | null;
  patientInfo: PatientInfo;
  onBackToPatientView: () => void;
  onPatientInfoChange: (info: Partial<PatientInfo>) => void;
}

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const ShareIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-ink">
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v6h14v-6" />
  </svg>
);

/**
 * Whether a value is short enough to be set as a figure rather than a passage.
 *
 * "36-42 hours" is a number. "The elimination half-life is approximately 6-7
 * days in euthyroid individuals. Steady state is typically reached within 4-6
 * weeks of consistent dosing." is not, whatever the schema asked for.
 */
const isFigure = (value: string) => value.trim().length <= 28 && !value.includes('.');

/** The four parts of ADME, in the order they are taught, plus the half-life. */
const PK_ROWS = [
  ['halfLife', 'halfLifeLabel'],
  ['absorption', 'absorptionLabel'],
  ['distribution', 'distributionLabel'],
  ['metabolism', 'metabolismLabel'],
  ['excretion', 'excretionLabel'],
] as const;

/**
 * The three levels this screen is read at.
 *
 * It had one: a mono label at twelve pixels over a paragraph, repeated eight
 * times down a single card. Everything looked equally important, so nothing
 * did, and the sections that actually have parts — ADME, adverse effects by
 * system, interactions by mechanism — had nowhere to put them and arrived as
 * one flattened sentence each.
 *
 * Heading names a section. Label names one value inside it. Body is the text.
 */
const Heading: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="font-semibold text-[20px] leading-[1.3] tracking-[-0.01em] text-ink px-5 m-0 mb-3 mt-7">
    {children}
  </h2>
);

const Label: React.FC<{ children: React.ReactNode; color?: string; className?: string }> = ({
  children, color = 'var(--ink-soft)', className = '',
}) => (
  <div className={`font-mono font-semibold text-[13px] tracking-[0.06em] ${className}`} style={{ color }}>
    {children}
  </div>
);

const Body: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[17px] leading-[1.55] text-ink-dim m-0"><bdi>{children}</bdi></p>
);

/** The card every section sits in, so the page has one rhythm. */
const Card: React.FC<{ children: React.ReactNode; testid?: string }> = ({ children, testid }) => (
  <div className="px-5">
    <div
      className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-[16px] flex flex-col gap-4"
      data-testid={testid}
    >
      {children}
    </div>
  </div>
);

/** One labelled value inside a card. */
const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  if (!value || !value.trim()) return null;
  return (
    <div>
      <Label className="mb-1.5">{label}</Label>
      <Body>{value}</Body>
    </div>
  );
};

/** A heading with its entries, as the grouped sections arrive. */
const Group: React.FC<{ heading: string; items: string[]; color?: string }> = ({
  heading, items, color = 'var(--ink-soft)',
}) => (
  <div>
    {heading && <Label className="mb-1.5" color={color}>{heading.toUpperCase()}</Label>}
    <ul className="m-0 p-0 list-none flex flex-col gap-[6px]">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5 items-start">
          <span
            className="w-[5px] h-[5px] rounded-full shrink-0 mt-[9px]"
            style={{ background: color }}
            aria-hidden="true"
          />
          <span className="text-[17px] leading-[1.5] text-ink-dim"><bdi>{item}</bdi></span>
        </li>
      ))}
    </ul>
  </div>
);

/** A skeleton in the shape of the card, so the wait does not read as a hang. */
const LoadingCard: React.FC = () => (
  <div className="bg-surface border border-paper-sand rounded-[16px] px-[18px] py-1" aria-hidden="true">
    {[0, 1, 2, 3].map((row) => (
      <div key={row} className={`py-3.5 ${row === 3 ? '' : 'border-b border-paper-deep'}`}>
        <div className="h-2.5 w-24 rounded-full bg-paper-deep mb-2.5" />
        <div className="h-3.5 rounded-full bg-paper-deep mb-2" style={{ width: `${88 - row * 9}%` }} />
        <div className="h-3.5 rounded-full bg-paper-deep" style={{ width: `${64 - row * 7}%` }} />
      </div>
    ))}
  </div>
);

export const ProfessionalScreen: React.FC<ProfessionalScreenProps> = ({
  drugName,
  drugInfo,
  patientInfo,
  onBackToPatientView,
  onPatientInfoChange,
}) => {
  const { t } = useLocalization();
  const [info, setInfo] = useState<ProfessionalDrugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    Sharing from here exports the clinical summary.

    It used to export the patient record, on the reasoning that that is what a
    clinician hands to somebody — but somebody reading the professional view
    and tapping share expects the professional view. The patient record is one
    tap away on the other tab and exports itself from there.

    The patient record is still passed in, because the header of any report
    names the medicine and its strength, and there is none when this screen was
    opened cold from a saved link.
  */
  const { requestExport, dialog } = useReportExport(
    drugInfo ?? ({ drugName, strength: '', commonUse: '', dosageAdministration: '', foodDrinkEffect: '',
      missedDose: '', storage: '', commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [] } as DrugInfo),
    patientInfo,
    onPatientInfoChange,
    info,
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const found = await fetchProfessionalDrugInformation(drugName);
        if (!cancelled) setInfo(found);
      } catch (err: any) {
        if (!cancelled) setError(err.message || t('professionalLoadFailed'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    // Stops a slow response for a previous drug overwriting the current one.
    return () => { cancelled = true; };
  }, [drugName, t]);

  const title = (info?.genericName || '').trim() || drugName;

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
        <button type="button" onClick={onBackToPatientView} aria-label={t('backToSearch')} className="p-2.5 -m-2.5 active:scale-90 transition-transform">
          <ChevronBack />
        </button>
        <button
          type="button"
          onClick={() => requestExport('pdf')}
          aria-label={t('exportShare')}
          className="p-2.5 -m-2.5 active:scale-90 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      {/* ── One medicine, two registers, a tap apart ── */}
      <div className="px-4">
        <div className="flex bg-paper-sand rounded-full p-1" role="tablist" aria-label={t('viewSwitch')}>
          <button
            type="button"
            role="tab"
            aria-selected={false}
            data-testid="tab-plain"
            onClick={onBackToPatientView}
            className="flex-1 h-[42px] rounded-full flex items-center justify-center
              font-medium text-[16px] text-ink-soft active:scale-[0.98] transition-transform"
          >
            {t('plainLanguage')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected
            data-testid="tab-professional"
            className="flex-1 h-[42px] rounded-full bg-selected flex items-center justify-center
              font-semibold text-[16px] text-selected-fg"
          >
            {t('professionalTab')}
          </button>
        </div>
      </div>

      {/* ── Identity, in the order a clinician reads it ── */}
      <div className="px-5 pt-5">
        {info?.atcCode?.trim() && (
          <div className="font-mono font-semibold text-[13px] tracking-[0.06em] text-ink-soft">
            {t('atcLabel')} {info.atcCode}
          </div>
        )}
        <h1 className="font-semibold text-[30px] leading-[1.15] tracking-[-0.02em] text-ink mt-1.5 mb-1 break-words">
          <bdi>{title}</bdi>
        </h1>
        {info?.formAndStrength?.trim() && (
          <div className="text-[17px] text-ink-soft"><bdi>{info.formAndStrength}</bdi></div>
        )}
      </div>

      <div className="pt-[18px]">
        {isLoading && <div className="px-5"><LoadingCard /></div>}

        {error && (
          <div className="px-5">
            <div className="bg-surface rounded-[16px] py-4 px-[18px]" style={{ border: '2px solid var(--clay-soft)' }} role="alert">
              <p className="font-semibold text-[17px] text-clay m-0 mb-1.5">{t('professionalLoadFailed')}</p>
              <p className="text-[16px] leading-[1.55] text-clay-deep m-0">{error}</p>
            </div>
          </div>
        )}
      </div>

      {info && !isLoading && !error && (
        <div data-testid="clinical-card">
          {/* Class and what it is for: the two lines read before anything else. */}
          {(info.drugClass.trim() || info.indications.trim()) && (
            <Card testid="clinical-overview">
              <Row label={t('classLabel')} value={info.drugClass} />
              <Row label={t('indicationsLabel').toUpperCase()} value={info.indications} />
            </Card>
          )}

          {info.mechanism.trim() && (
            <>
              <Heading>{t('mechanismHeading')}</Heading>
              <Card><Body>{info.mechanism}</Body></Card>
            </>
          )}

          {/*
            ADME as its four parts, which is how it is taught and how it is
            read. It used to be one sentence, because the schema asked for one.
            The half-life sits above them: it is the number looked for first.
          */}
          {PK_ROWS.some(([key]) => info.pharmacokinetics[key].trim()) && (
            <>
              <Heading>{t('pharmacokineticsHeading')}</Heading>
              <Card testid="clinical-pk">
                {/*
                  The half-life is set large because it is the number looked
                  for first — but only when it is a number. Levothyroxine's
                  came back as two sentences about steady state, and a hundred
                  and fifty characters at nineteen pixels swamps the card it
                  is meant to lead. Anything that long is a passage, so it is
                  set as one.
                */}
                {info.pharmacokinetics.halfLife.trim() && (
                  isFigure(info.pharmacokinetics.halfLife) ? (
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <Label>{t('halfLifeLabel').toUpperCase()}</Label>
                      <span className="font-semibold text-[19px] text-ink">
                        <bdi>{info.pharmacokinetics.halfLife}</bdi>
                      </span>
                    </div>
                  ) : (
                    <Row label={t('halfLifeLabel').toUpperCase()} value={info.pharmacokinetics.halfLife} />
                  )
                )}
                {PK_ROWS.filter(([key]) => key !== 'halfLife').map(([key, labelKey]) => (
                  <Row key={key} label={t(labelKey)} value={info.pharmacokinetics[key]} />
                ))}
              </Card>
            </>
          )}

          {info.contraindications.length > 0 && (
            <>
              <Heading>{t('contraindicationsHeading')}</Heading>
              <Card testid="clinical-contraindications">
                <Group heading="" items={info.contraindications} color="var(--clay)" />
              </Card>
            </>
          )}

          {/*
            Both shapes, because they answer different questions. The labels
            are for "is the drug in front of me on this list"; the groups are
            for "what happens, and what do I do about it". The screen had only
            the labels, which is a list of names with no reason attached.
          */}
          {(info.majorInteractions.length > 0 || info.interactions.length > 0) && (
            <>
              <Heading>{t('interactionsHeading')}</Heading>
              <Card testid="clinical-interactions">
                {info.majorInteractions.length > 0 && (
                  <div>
                    <Label className="mb-2" color="var(--clay)">{t('atAGlanceLabel')}</Label>
                    <div className="flex flex-wrap gap-[7px]">
                      {info.majorInteractions.map((interaction) => (
                        <span
                          key={interaction}
                          className="font-medium text-[14px] text-clay-deep bg-clay-wash rounded-lg py-1.5 px-2.5"
                        >
                          <bdi>{interaction}</bdi>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {info.interactions.map((group, index) => (
                  <div key={index}>
                    {group.heading && <Label className="mb-1.5">{group.heading.toUpperCase()}</Label>}
                    {group.items.map((item, i) => <Body key={i}>{item}</Body>)}
                  </div>
                ))}
              </Card>
            </>
          )}

          {info.adverseEffects.length > 0 && (
            <>
              <Heading>{t('adverseEffectsHeading')}</Heading>
              <Card testid="clinical-adverse">
                {info.adverseEffects.map((group, index) => (
                  <Group key={index} heading={group.heading} items={group.items} />
                ))}
              </Card>
            </>
          )}

          {info.monitoring.trim() && (
            <>
              <Heading>{t('monitoringHeading')}</Heading>
              <Card><Body>{info.monitoring}</Body></Card>
            </>
          )}

          {/* Niche, and empty for most medicines, so it sits at the end. */}
          {(info.chemistry.trim() || info.bcsClass.trim()) && (
            <>
              <Heading>{t('chemistryHeading')}</Heading>
              <Card testid="clinical-chemistry">
                <Row label={t('chemistryLabel')} value={info.chemistry} />
                <Row label={t('bcsLabel')} value={info.bcsClass} />
              </Card>
            </>
          )}

          {info.references.length > 0 && (
            <>
              <Heading>{t('referencesHeading')}</Heading>
              <Card testid="clinical-references">
                <Group heading="" items={info.references} />
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── What this is, and is not ── */}
      <div className="px-5 pt-4 pb-7">
        <p className="text-[14px] leading-[1.6] text-ink-soft m-0">{t('referenceSummaryNote')}</p>
      </div>

      {dialog}
    </div>
  );
};
