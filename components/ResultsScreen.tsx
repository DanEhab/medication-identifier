import React, { useState, useEffect } from 'react';
import type { DrugInfo, PatientInfo } from '../types';
import { PillIcon, UtensilsIcon, AlertTriangleIcon, ClockIcon, BookOpenIcon, ChevronLeftIcon, BookmarkIcon, CheckIcon, PrinterIcon, ArrowDownTrayIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';

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
                active ? 'bg-brand-primary text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
        >
            {children}
        </button>
    );
};

const InfoCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white rounded-2xl shadow-lg p-6 break-inside-avoid">
        <div className="flex items-center mb-4">
            <div className="bg-brand-secondary text-white p-2 rounded-full me-4">{icon}</div>
            <h3 className="text-xl font-bold text-brand-dark">{title}</h3>
        </div>
        <div className="text-gray-700 space-y-2">{children}</div>
    </div>
);


export const ResultsScreen: React.FC<ResultsScreenProps> = ({ drugInfo, patientInfo, onBack, onShowProfessionalView }) => {
  const [activeTab, setActiveTab] = useState<Tab>('use');
  const [isSaved, setIsSaved] = useState(false);
  const { t, language } = useLocalization();

  useEffect(() => {
    const savedMeds = JSON.parse(localStorage.getItem('myMedications') || '[]') as DrugInfo[];
    const alreadySaved = savedMeds.some(med => med.drugName.toLowerCase() === drugInfo.drugName.toLowerCase());
    setIsSaved(alreadySaved);
  }, [drugInfo.drugName]);


  const handleSaveMedication = () => {
    const savedMeds = JSON.parse(localStorage.getItem('myMedications') || '[]') as DrugInfo[];
    if (isSaved) {
        const updatedMeds = savedMeds.filter(med => med.drugName.toLowerCase() !== drugInfo.drugName.toLowerCase());
        localStorage.setItem('myMedications', JSON.stringify(updatedMeds));
        setIsSaved(false);
    } else {
        const updatedMeds = [...savedMeds, drugInfo];
        localStorage.setItem('myMedications', JSON.stringify(updatedMeds));
        setIsSaved(true);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadWord = () => {
    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${drugInfo.drugName}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; }
          h1 { color: #2D3748; border-bottom: 2px solid #007B8A; padding-bottom: 10px; }
          h2 { color: #007B8A; margin-top: 20px; }
          h3 { color: #2D3748; background-color: #EBF4F5; padding: 5px; }
          ul { margin-bottom: 10px; }
          li { margin-bottom: 5px; }
        </style>
      </head>
      <body dir="${language === 'ar' ? 'rtl' : 'ltr'}">
        <h1>${t('report')}</h1>
        <p><strong>${t('drugName')}:</strong> ${drugInfo.drugName}</p>
        <p><strong>${t('strength')}:</strong> ${drugInfo.strength}</p>
        ${patientInfo.name ? `<p><strong>${t('name')}:</strong> ${patientInfo.name}</p>` : ''}
        ${patientInfo.age ? `<p><strong>${t('age')}:</strong> ${patientInfo.age}</p>` : ''}
        <hr />
        
        <h3>${t('commonUse')}</h3>
        <p>${drugInfo.commonUse}</p>
        
        <h3>${t('dosageAdministration')}</h3>
        <p>${drugInfo.dosageAdministration}</p>
        
        <h3>${t('missedDose')}</h3>
        <p>${drugInfo.missedDose}</p>
        
        <h3>${t('foodDrinkInteractions')}</h3>
        <p>${drugInfo.foodDrinkEffect}</p>
        
        <h3>${t('commonSideEffects')}</h3>
        <ul>${drugInfo.commonSideEffects.map(e => `<li>${e}</li>`).join('')}</ul>
        
        <h3>${t('seriousSideEffects')}</h3>
        <p><em>${t('seekMedicalAttention')}</em></p>
        <ul>${drugInfo.seriousSideEffects.map(e => `<li>${e}</li>`).join('')}</ul>
        
        <h3>${t('whenToConsultDoctor')}</h3>
        <ul>${drugInfo.consultDoctorWhen.map(e => `<li>${e}</li>`).join('')}</ul>
        
        <h3>${t('storage')}</h3>
        <p>${drugInfo.storage}</p>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', content], {
      type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${drugInfo.drugName}_Report.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'use':
        return <InfoCard title={t('commonUse')} icon={<PillIcon />}>{drugInfo.commonUse}</InfoCard>;
      case 'dosage':
        return (
          <div className="space-y-6">
            <InfoCard title={t('dosageAdministration')} icon={<PillIcon />}>{drugInfo.dosageAdministration}</InfoCard>
            <InfoCard title={t('missedDose')} icon={<ClockIcon />}>{drugInfo.missedDose}</InfoCard>
          </div>
        );
      case 'food':
        return <InfoCard title={t('foodDrinkInteractions')} icon={<UtensilsIcon />}>{drugInfo.foodDrinkEffect}</InfoCard>;
      case 'sideEffects':
        return (
          <div className="space-y-6">
            <InfoCard title={t('commonSideEffects')} icon={<AlertTriangleIcon className="text-yellow-400" />}>
              <ul className="list-disc list-inside">{drugInfo.commonSideEffects.map((effect, i) => <li key={i}>{effect}</li>)}</ul>
            </InfoCard>
            <InfoCard title={t('seriousSideEffects')} icon={<AlertTriangleIcon className="text-red-500" />}>
              <p className="font-semibold mb-2">{t('seekMedicalAttention')}</p>
              <ul className="list-disc list-inside">{drugInfo.seriousSideEffects.map((effect, i) => <li key={i}>{effect}</li>)}</ul>
            </InfoCard>
          </div>
        );
      case 'precautions':
        return (
          <div className="space-y-6">
            <InfoCard title={t('whenToConsultDoctor')} icon={<BookOpenIcon />}>
              <ul className="list-disc list-inside">{drugInfo.consultDoctorWhen.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
            </InfoCard>
            <InfoCard title={t('storage')} icon={<BookOpenIcon />}>{drugInfo.storage}</InfoCard>
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
              <button onClick={onBack} className="flex items-center text-brand-primary font-semibold hover:underline">
                  <ChevronLeftIcon className="w-5 h-5 me-1 rtl:rotate-180" />
                  {t('backToSearch')}
              </button>
              
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                <button onClick={handleDownloadWord} className="flex-1 sm:flex-none flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-full hover:bg-gray-50 transition-colors shadow-sm">
                    <ArrowDownTrayIcon className="w-5 h-5 me-2 text-brand-primary" />
                    {t('downloadWord')}
                </button>
                <button onClick={handlePrint} className="flex-1 sm:flex-none flex items-center justify-center bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-full hover:bg-gray-50 transition-colors shadow-sm">
                    <PrinterIcon className="w-5 h-5 me-2 text-brand-primary" />
                    {t('printPdf')}
                </button>
                <button onClick={handleSaveMedication} className={`flex-1 sm:flex-none flex items-center justify-center font-semibold py-2 px-4 rounded-full transition-all duration-300 shadow-sm ${isSaved ? 'bg-brand-success text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                    {isSaved ? <CheckIcon className="w-5 h-5 me-2" /> : <BookmarkIcon className="w-5 h-5 me-2" />}
                    {isSaved ? t('saved') : t('saveToList')}
                </button>
              </div>
          </div>
        
        <div className="text-center mb-8">
          {patientInfo.name && (
              <p className="text-lg text-gray-500 mb-2">
                  {t('showingResultsFor')} <span className="font-bold text-brand-secondary">{patientInfo.name}</span>
              </p>
          )}
          <h1 className="text-4xl font-bold text-brand-dark">{drugInfo.drugName}</h1>
          <p className="text-xl text-gray-600">{drugInfo.strength}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 sm:gap-4 mb-8 p-2 bg-gray-100 rounded-full">
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
          <button onClick={onShowProfessionalView} className="text-brand-primary font-semibold hover:underline">
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