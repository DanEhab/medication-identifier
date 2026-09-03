import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { DrugInfo, PatientInfo } from '../types';
import { PillIcon, UtensilsIcon, AlertTriangleIcon, ClockIcon, BookOpenIcon, ChevronLeftIcon, BookmarkIcon, CheckIcon, PrinterIcon, ArrowDownTrayIcon, UserIcon, PlusCircleIcon } from './Icons';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { renderReportHTML, renderReportText } from '../lib/report';
import { exportAsDocument, exportAsPdf } from '../lib/exportReport';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';
import { PatientDetailsDialog, hasPatientDetails, EMPTY_PATIENT_INFO } from './PatientDetailsDialog';

interface ResultsScreenProps {
  drugInfo: DrugInfo;
  patientInfo: PatientInfo;
  /** The term originally searched, kept so a saved copy can be refreshed later. */
  originalDrugName: string;
  onBack: () => void;
  onShowProfessionalView: () => void;
  /** Persists edited patient details. Merged over the stored values. */
  onPatientInfoChange: (info: Partial<PatientInfo>) => void;
}

/**
 * Remembers that the export prompt has been shown once. After that, exports run
 * straight away and the details row on this screen is the way in — nobody wants
 * a dialog between them and a file they have already asked for twice.
 */
const PROMPTED_KEY = 'patientDetailsPrompted';

const wasPrompted = (): boolean => {
  try {
    return localStorage.getItem(PROMPTED_KEY) === '1';
  } catch {
    return false;
  }
};

const markPrompted = () => {
  try {
    localStorage.setItem(PROMPTED_KEY, '1');
  } catch {
    /* Private mode or storage disabled — the prompt simply shows again. */
  }
};

type Tab = 'use' | 'dosage' | 'food' | 'sideEffects' | 'precautions';

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => {
    return (
        <button
            onClick={onClick}
            className={`flex-1 sm:flex-none px-4 py-3 text-sm sm:text-base font-bold text-center rounded-full transition-all duration-300 ${
                active ? 'bg-brand-primary dark:bg-[#90E0EF] text-white dark:text-[#0D0D0D] shadow-md' : 'bg-gray-200 dark:bg-[#1C1C1E] dark:border dark:border-[#3A4D54] text-gray-700 dark:text-[#A1A1AA] hover:bg-gray-300 dark:hover:bg-[#2C2C2E]'
            }`}
        >
            {children}
        </button>
    );
};

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-lg dark:shadow-none p-6 break-inside-avoid transition-colors duration-300">
        <div className="flex items-center mb-4">
            <div className="bg-brand-secondary dark:bg-[#2C2C2E] text-white dark:text-[#90E0EF] p-2 rounded-full me-4">{icon}</div>
            <h3 className="text-xl font-bold text-brand-dark dark:text-white">{title}</h3>
        </div>
        <div className="text-gray-700 dark:text-[#A1A1AA] space-y-2">{children}</div>
    </div>
);


export const ResultsScreen: React.FC<ResultsScreenProps> = ({ drugInfo, patientInfo, originalDrugName, onBack, onShowProfessionalView, onPatientInfoChange }) => {
  const [activeTab, setActiveTab] = useState<Tab>('use');
  const [isSaved, setIsSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** Which export is waiting on the dialog, if any. */
  const pendingExport = useRef<'pdf' | 'doc' | null>(null);
  const { t, language } = useLocalization();

  useEffect(() => {
    setIsSaved(isMedicationSaved(drugInfo.drugName));
  }, [drugInfo.drugName]);

  const handleSaveMedication = () => {
    setIsSaved(toggleMedication(drugInfo, language, originalDrugName));
  };

  // The details are passed in explicitly rather than read from props, because
  // an export can start in the same tick the dialog saves new ones.
  const runExport = useCallback(
    (kind: 'pdf' | 'doc', info: PatientInfo) => {
      const html = renderReportHTML(drugInfo, info, t, language);
      if (kind === 'pdf') {
        return exportAsPdf(drugInfo.drugName, html, renderReportText(drugInfo, info, t));
      }
      return exportAsDocument(
        drugInfo.drugName,
        html,
        renderReportText(drugInfo, info, t, { width: 60, numbered: true }),
      );
    },
    [drugInfo, language, t],
  );

  /**
   * Offers the details step the first time someone exports, then never again.
   * Anyone who already filled them in is not asked at all.
   */
  const requestExport = (kind: 'pdf' | 'doc') => {
    if (!wasPrompted() && !hasPatientDetails(patientInfo)) {
      markPrompted();
      pendingExport.current = kind;
      setDetailsOpen(true);
      return;
    }
    void runExport(kind, patientInfo);
  };

  const handleDetailsSave = (info: PatientInfo) => {
    onPatientInfoChange(info);
    setDetailsOpen(false);
    const kind = pendingExport.current;
    pendingExport.current = null;
    if (kind) void runExport(kind, info);
  };

  const handleDetailsDismiss = () => {
    setDetailsOpen(false);
    const kind = pendingExport.current;
    pendingExport.current = null;
    // Dismissing with an export waiting means "just give me the file".
    if (kind) void runExport(kind, patientInfo);
  };

  const handleDetailsClear = () => {
    onPatientInfoChange(EMPTY_PATIENT_INFO);
  };

  const openDetails = () => {
    pendingExport.current = null;
    markPrompted();
    setDetailsOpen(true);
  };

  const detailsSummary = [patientInfo.name, patientInfo.age, patientInfo.diagnosis]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' · ');

  const renderContent = () => {
    switch (activeTab) {
      case 'use':
        return <InfoCard title={t('commonUse')} icon={<PillIcon />}><MarkdownText text={drugInfo.commonUse} /></InfoCard>;
      case 'dosage':
        return (
          <div className="space-y-6">
            <InfoCard title={t('dosageAdministration')} icon={<PillIcon />}><MarkdownText text={drugInfo.dosageAdministration} /></InfoCard>
            <InfoCard title={t('missedDose')} icon={<ClockIcon />}><MarkdownText text={drugInfo.missedDose} /></InfoCard>
          </div>
        );
      case 'food':
        return <InfoCard title={t('foodDrinkInteractions')} icon={<UtensilsIcon />}><MarkdownText text={drugInfo.foodDrinkEffect} /></InfoCard>;
      case 'sideEffects':
        return (
          <div className="space-y-6">
            <InfoCard title={t('commonSideEffects')} icon={<AlertTriangleIcon className="text-yellow-400" />}>
              <ul className="list-disc list-inside space-y-2">{drugInfo.commonSideEffects.map((effect, i) => <li key={i}><MarkdownText text={effect} inline /></li>)}</ul>
            </InfoCard>
            <InfoCard title={t('seriousSideEffects')} icon={<AlertTriangleIcon className="text-red-500" />}>
              <p className="font-semibold mb-2">{t('seekMedicalAttention')}</p>
              <ul className="list-disc list-inside space-y-2">{drugInfo.seriousSideEffects.map((effect, i) => <li key={i}><MarkdownText text={effect} inline /></li>)}</ul>
            </InfoCard>
          </div>
        );
      case 'precautions':
        return (
          <div className="space-y-6">
            <InfoCard title={t('whenToConsultDoctor')} icon={<BookOpenIcon />}>
              <ul className="list-disc list-inside space-y-2">{drugInfo.consultDoctorWhen.map((reason, i) => <li key={i}><MarkdownText text={reason} inline /></li>)}</ul>
            </InfoCard>
            <InfoCard title={t('storage')} icon={<BookOpenIcon />}><MarkdownText text={drugInfo.storage} /></InfoCard>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Interactive Screen View */}
      <div className="max-w-4xl mx-auto animate-fade-in no-print">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <button onClick={onBack} className="flex items-center text-brand-primary dark:text-[#90E0EF] font-semibold hover:underline">
                  <ChevronLeftIcon className="w-5 h-5 me-1 rtl:rotate-180" />
                  {t('backToSearch')}
              </button>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={() => requestExport('doc')} className="flex-1 sm:flex-none flex items-center justify-center bg-white dark:bg-[#1C1C1E] border border-gray-300 dark:border-[#3A4D54] text-gray-700 dark:text-white py-2 px-4 rounded-full hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors shadow-sm">
                    <ArrowDownTrayIcon className="w-5 h-5 me-2 text-brand-primary dark:text-[#90E0EF]" />
                    {t('downloadWord')}
                </button>
                <button onClick={() => requestExport('pdf')} className="flex-1 sm:flex-none flex items-center justify-center bg-white dark:bg-[#1C1C1E] border border-gray-300 dark:border-[#3A4D54] text-gray-700 dark:text-white py-2 px-4 rounded-full hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors shadow-sm">
                    <PrinterIcon className="w-5 h-5 me-2 text-brand-primary dark:text-[#90E0EF]" />
                    {t('printPdf')}
                </button>
                <button onClick={handleSaveMedication} className={`flex-1 sm:flex-none flex items-center justify-center font-semibold py-2 px-4 rounded-full transition-all duration-300 shadow-sm ${isSaved ? 'bg-brand-success text-white' : 'bg-gray-200 dark:bg-[#2C2C2E] text-gray-700 dark:text-[#A1A1AA] hover:bg-gray-300 dark:hover:bg-[#3A4D54]'}`}>
                    {isSaved ? <CheckIcon className="w-5 h-5 me-2" /> : <BookmarkIcon className="w-5 h-5 me-2" />}
                    {isSaved ? t('saved') : t('saveToList')}
                </button>
              </div>
          </div>
        
        {/*
          The optional details step. It sits directly under the export buttons
          because that is the only place the information is used, and it reads
          as an offer rather than a gate — which the home-screen form did not.
        */}
        <div data-tutorial="report-details" className="mb-6">
          {hasPatientDetails(patientInfo) ? (
            <div className="flex items-center gap-3 py-3 px-3 sm:px-4 rounded-xl bg-brand-accent/70 dark:bg-[#161616] border border-brand-secondary/30 dark:border-[#2C2C2E]">
              <UserIcon className="w-5 h-5 shrink-0 text-brand-primary dark:text-[#90E0EF]" />
              <p className="flex-1 min-w-0 text-sm text-gray-700 dark:text-[#A1A1AA] truncate">
                <span className="font-semibold text-brand-dark dark:text-white">{t('reportFor')}:</span>{' '}
                {detailsSummary}
              </p>
              <button
                type="button"
                onClick={openDetails}
                className="shrink-0 px-2 py-1 text-sm font-bold text-brand-primary dark:text-[#90E0EF] hover:underline"
              >
                {t('editDetails')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openDetails}
              className="w-full flex items-center gap-3 py-3 px-3 sm:px-4 rounded-xl border border-dashed border-gray-300 dark:border-[#3A4D54] text-start hover:border-brand-primary dark:hover:border-[#90E0EF] hover:bg-brand-accent/50 dark:hover:bg-[#161616] active:scale-[0.99] transition-all"
            >
              <PlusCircleIcon className="w-5 h-5 shrink-0 text-brand-primary dark:text-[#90E0EF]" />
              <span className="flex-1 text-sm font-semibold text-gray-700 dark:text-[#A1A1AA]">
                {t('addPatientDetailsToReport')}
              </span>
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 dark:bg-[#2C2C2E] text-gray-500 dark:text-[#A1A1AA]">
                {t('optional')}
              </span>
            </button>
          )}
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-brand-dark dark:text-white">{drugInfo.drugName}</h1>
          <p className="text-xl text-gray-600 dark:text-[#A1A1AA]">{drugInfo.strength}</p>
        </div>

        <div data-tutorial="tab-bar" className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-8 p-2 bg-gray-100 dark:bg-[#161616] rounded-2xl">
          <TabButton active={activeTab === 'use'} onClick={() => setActiveTab('use')}>{t('tabUse')}</TabButton>
          <TabButton active={activeTab === 'dosage'} onClick={() => setActiveTab('dosage')}>{t('tabDosage')}</TabButton>
          <TabButton active={activeTab === 'food'} onClick={() => setActiveTab('food')}>{t('tabFood')}</TabButton>
          <TabButton active={activeTab === 'sideEffects'} onClick={() => setActiveTab('sideEffects')}>{t('tabSideEffects')}</TabButton>
          <TabButton active={activeTab === 'precautions'} onClick={() => setActiveTab('precautions')}>{t('tabPrecautions')}</TabButton>
        </div>

        <div className="animate-fade-in-fast mb-8">
          {renderContent()}
        </div>
        
        <div className="text-center">
          <button data-tutorial="professional-link" onClick={onShowProfessionalView} className="text-brand-primary dark:text-[#90E0EF] font-semibold hover:underline">
            {t('forHealthcareProfessionals')}
          </button>
        </div>
      </div>

      {/* Print View (Hidden by default, shown when printing) */}
      <div className="print-only hidden p-8">
        <div className="border-b-4 border-brand-primary mb-6 pb-4 flex justify-between items-end">
            <div>
                <h1 className="text-3xl font-bold text-brand-dark">{t('report')}</h1>
                <p className="text-gray-500">{new Date().toLocaleDateString()}</p>
            </div>
            <div className="text-end">
                <h2 className="text-2xl font-bold text-brand-primary">{drugInfo.drugName}</h2>
                <p className="text-xl">{drugInfo.strength}</p>
            </div>
        </div>

        {hasPatientDetails(patientInfo) && (
            <div className="bg-gray-100 p-4 rounded-lg mb-8">
                <h3 className="font-bold text-gray-700 border-b border-gray-300 pb-2 mb-2">{t('patientDetails')}</h3>
                <div className="grid grid-cols-2 gap-4">
                    {patientInfo.name && <p><span className="font-semibold">{t('name')}:</span> {patientInfo.name}</p>}
                    {patientInfo.age && <p><span className="font-semibold">{t('age')}:</span> {patientInfo.age}</p>}
                    {patientInfo.sex && <p><span className="font-semibold">{t('sex')}:</span> {patientInfo.sex}</p>}
                    {patientInfo.diagnosis && <p><span className="font-semibold">{t('diagnosis')}:</span> {patientInfo.diagnosis}</p>}
                </div>
            </div>
        )}

        <div className="space-y-6">
            <InfoCard title={t('commonUse')} icon={<PillIcon className="text-black"/>}>{drugInfo.commonUse}</InfoCard>
            
            <InfoCard title={t('dosageAdministration')} icon={<PillIcon className="text-black"/>}>{drugInfo.dosageAdministration}</InfoCard>
            
            <InfoCard title={t('missedDose')} icon={<ClockIcon className="text-black"/>}>{drugInfo.missedDose}</InfoCard>
            
            <InfoCard title={t('foodDrinkInteractions')} icon={<UtensilsIcon className="text-black"/>}>{drugInfo.foodDrinkEffect}</InfoCard>
            
            <div className="bg-white border border-gray-200 rounded-xl p-6 break-inside-avoid">
                <div className="flex items-center mb-4">
                    <AlertTriangleIcon className="w-6 h-6 me-4" />
                    <h3 className="text-xl font-bold text-brand-dark">{t('commonSideEffects')}</h3>
                </div>
                <ul className="list-disc list-inside ps-4">
                    {drugInfo.commonSideEffects.map((effect, i) => <li key={i}>{effect}</li>)}
                </ul>
            </div>

            <div className="bg-white border-2 border-red-100 rounded-xl p-6 break-inside-avoid">
                <div className="flex items-center mb-4">
                    <AlertTriangleIcon className="w-6 h-6 text-red-500 me-4" />
                    <h3 className="text-xl font-bold text-red-700">{t('seriousSideEffects')}</h3>
                </div>
                <p className="font-semibold mb-2 text-red-600">{t('seekMedicalAttention')}</p>
                <ul className="list-disc list-inside ps-4">
                    {drugInfo.seriousSideEffects.map((effect, i) => <li key={i}>{effect}</li>)}
                </ul>
            </div>

            <InfoCard title={t('whenToConsultDoctor')} icon={<BookOpenIcon className="text-black"/>}>
                <ul className="list-disc list-inside">
                    {drugInfo.consultDoctorWhen.map((reason, i) => <li key={i}>{reason}</li>)}
                </ul>
            </InfoCard>
            
            <InfoCard title={t('storage')} icon={<BookOpenIcon className="text-black"/>}>{drugInfo.storage}</InfoCard>
        </div>
        
        <div className="mt-12 text-center text-sm text-gray-500 border-t pt-4">
             <p>{t('disclaimer')}: {t('disclaimerText')}</p>
        </div>
      </div>

      <PatientDetailsDialog
        open={detailsOpen}
        patientInfo={patientInfo}
        onSave={handleDetailsSave}
        onDismiss={handleDetailsDismiss}
        onClear={handleDetailsClear}
        pendingExport={pendingExport.current !== null}
      />
    </>
  );
};