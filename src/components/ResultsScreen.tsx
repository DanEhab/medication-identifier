import React, { useState, useEffect } from 'react';
import type { DrugInfo, PatientInfo } from '../types';
import { PillIcon, UtensilsIcon, AlertTriangleIcon, ClockIcon, BookOpenIcon, ChevronLeftIcon, BookmarkIcon, CheckIcon, PrinterIcon, ArrowDownTrayIcon } from './Icons';
import { MarkdownText } from './MarkdownText';
import { useLocalization } from '../context/LanguageContext';
import { renderReportHTML, renderReportText } from '../lib/report';
import { exportAsDocument, exportAsPdf } from '../lib/exportReport';
import { isMedicationSaved, toggleMedication } from '../lib/medicationStorage';

interface ResultsScreenProps {
  drugInfo: DrugInfo;
  patientInfo: PatientInfo;
  onBack: () => void;
  onShowProfessionalView: () => void;
}

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


export const ResultsScreen: React.FC<ResultsScreenProps> = ({ drugInfo, patientInfo, onBack, onShowProfessionalView }) => {
  const [activeTab, setActiveTab] = useState<Tab>('use');
  const [isSaved, setIsSaved] = useState(false);
  const { t, language } = useLocalization();

  useEffect(() => {
    setIsSaved(isMedicationSaved(drugInfo.drugName));
  }, [drugInfo.drugName]);

  const handleSaveMedication = () => {
    setIsSaved(toggleMedication(drugInfo));
  };

  const handlePrint = () =>
    exportAsPdf(
      drugInfo.drugName,
      renderReportHTML(drugInfo, patientInfo, t, language),
      renderReportText(drugInfo, patientInfo, t),
    );

  const handleDownloadWord = () =>
    exportAsDocument(
      drugInfo.drugName,
      renderReportHTML(drugInfo, patientInfo, t, language),
      renderReportText(drugInfo, patientInfo, t, { width: 60, numbered: true }),
    );

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
                <button onClick={handleDownloadWord} className="flex-1 sm:flex-none flex items-center justify-center bg-white dark:bg-[#1C1C1E] border border-gray-300 dark:border-[#3A4D54] text-gray-700 dark:text-white py-2 px-4 rounded-full hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors shadow-sm">
                    <ArrowDownTrayIcon className="w-5 h-5 me-2 text-brand-primary dark:text-[#90E0EF]" />
                    {t('downloadWord')}
                </button>
                <button onClick={handlePrint} className="flex-1 sm:flex-none flex items-center justify-center bg-white dark:bg-[#1C1C1E] border border-gray-300 dark:border-[#3A4D54] text-gray-700 dark:text-white py-2 px-4 rounded-full hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors shadow-sm">
                    <PrinterIcon className="w-5 h-5 me-2 text-brand-primary dark:text-[#90E0EF]" />
                    {t('printPdf')}
                </button>
                <button onClick={handleSaveMedication} className={`flex-1 sm:flex-none flex items-center justify-center font-semibold py-2 px-4 rounded-full transition-all duration-300 shadow-sm ${isSaved ? 'bg-brand-success text-white' : 'bg-gray-200 dark:bg-[#2C2C2E] text-gray-700 dark:text-[#A1A1AA] hover:bg-gray-300 dark:hover:bg-[#3A4D54]'}`}>
                    {isSaved ? <CheckIcon className="w-5 h-5 me-2" /> : <BookmarkIcon className="w-5 h-5 me-2" />}
                    {isSaved ? t('saved') : t('saveToList')}
                </button>
              </div>
          </div>
        
        <div className="text-center mb-8">
          {patientInfo.name && (
              <p className="text-lg text-gray-500 dark:text-[#A1A1AA] mb-2">
                  {t('showingResultsFor')} <span className="font-bold text-brand-secondary">{patientInfo.name}</span>
              </p>
          )}
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

        {patientInfo.name && (
            <div className="bg-gray-100 p-4 rounded-lg mb-8">
                <h3 className="font-bold text-gray-700 border-b border-gray-300 pb-2 mb-2">{t('patientDetails')}</h3>
                <div className="grid grid-cols-2 gap-4">
                    <p><span className="font-semibold">{t('name')}:</span> {patientInfo.name}</p>
                    {patientInfo.age && <p><span className="font-semibold">{t('age')}:</span> {patientInfo.age}</p>}
                    {patientInfo.sex && <p><span className="font-semibold">{t('sex')}:</span> {patientInfo.sex}</p>}
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
    </>
  );
};