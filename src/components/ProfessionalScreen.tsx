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
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#0B2B2E"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const ShareIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#0B2B2E"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v13" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 14v6h14v-6" />
  </svg>
);

/** One labelled row of the clinical card. */
const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => {
  if (!value || !value.trim()) return null;
  return (
    <div className={`py-3.5 ${last ? '' : 'border-b border-paper-deep'}`}>
      <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-ink-soft mb-[5px]">
        {label}
      </div>
      <div className="text-[15.5px] leading-[1.55] text-ink">
        <bdi>{value}</bdi>
      </div>
    </div>
  );
};

/** A skeleton in the shape of the card, so the wait does not read as a hang. */
const LoadingCard: React.FC = () => (
  <div className="bg-white border border-paper-sand rounded-[16px] px-[18px] py-1" aria-hidden="true">
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

  // Sharing exports the patient record, which is the thing a clinician hands
  // to somebody. There is no patient record when this was opened cold.
  const { requestExport, dialog } = useReportExport(
    drugInfo ?? ({ drugName, strength: '', commonUse: '', dosageAdministration: '', foodDrinkEffect: '',
      missedDose: '', storage: '', commonSideEffects: [], seriousSideEffects: [], consultDoctorWhen: [] } as DrugInfo),
    patientInfo,
    onPatientInfoChange,
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
        <button type="button" onClick={onBackToPatientView} aria-label={t('backToSearch')} className="active:scale-90 transition-transform">
          <ChevronBack />
        </button>
        <button
          type="button"
          onClick={() => requestExport('pdf')}
          aria-label={t('exportShare')}
          className="active:scale-90 transition-transform"
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
              font-medium text-[15px] text-ink-soft active:scale-[0.98] transition-transform"
          >
            {t('plainLanguage')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected
            data-testid="tab-professional"
            className="flex-1 h-[42px] rounded-full bg-ink flex items-center justify-center
              font-semibold text-[15px] text-white"
          >
            {t('professionalTab')}
          </button>
        </div>
      </div>

      {/* ── Identity, in the order a clinician reads it ── */}
      <div className="px-5 pt-5">
        {info?.atcCode?.trim() && (
          <div className="font-mono font-semibold text-[12px] tracking-[0.06em] text-ink-soft">
            {t('atcLabel')} {info.atcCode}
          </div>
        )}
        <h1 className="font-semibold text-[30px] leading-[1.15] tracking-[-0.02em] text-ink mt-1.5 mb-1 break-words">
          <bdi>{title}</bdi>
        </h1>
        {info?.formAndStrength?.trim() && (
          <div className="text-[16px] text-ink-soft"><bdi>{info.formAndStrength}</bdi></div>
        )}
      </div>

      <div className="px-5 pt-[18px]">
        {isLoading && <LoadingCard />}

        {error && (
          <div className="bg-white rounded-[16px] py-4 px-[18px]" style={{ border: '2px solid #E7BDB4' }} role="alert">
            <p className="font-semibold text-[16px] text-clay m-0 mb-1.5">{t('professionalLoadFailed')}</p>
            <p className="text-[15px] leading-[1.55] text-clay-deep m-0">{error}</p>
          </div>
        )}

        {info && !isLoading && !error && (
          <div className="bg-white border border-paper-sand rounded-[16px] px-[18px] py-1" data-testid="clinical-card">
            <Row label={t('classLabel')} value={info.drugClass} />
            <Row label={t('mechanismLabel')} value={info.mechanism} />
            <Row label={t('pharmacokineticsLabel')} value={info.pharmacokinetics} />
            <Row label={t('contraindicationsLabel')} value={info.contraindications} />

            {info.majorInteractions.length > 0 && (
              <div className="py-3.5 border-b border-paper-deep">
                <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-clay mb-2">
                  {t('majorInteractionsLabel')}
                </div>
                <div className="flex flex-wrap gap-[7px]">
                  {info.majorInteractions.map((interaction) => (
                    <span
                      key={interaction}
                      className="font-medium text-[13.5px] text-clay-deep bg-clay-wash rounded-lg py-1.5 px-2.5"
                    >
                      <bdi>{interaction}</bdi>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <Row label={t('monitoringLabel')} value={info.monitoring} last />
          </div>
        )}
      </div>

      {/* ── What this is, and is not ── */}
      <div className="px-5 pt-4 pb-7">
        <p className="text-[13px] leading-[1.6] text-ink-soft m-0">{t('referenceSummaryNote')}</p>
      </div>

      {dialog}
    </div>
  );
};
