import React, { useState, useEffect } from 'react';
import type { DrugInfo } from '../types';
import { ChevronLeftIcon, TrashIcon, PillIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';
import { useLocalization } from '../context/LanguageContext';
import { getSavedMedications, removeMedication } from '../lib/medicationStorage';

interface MyMedicationsScreenProps {
  onBack: () => void;
  onSelectMed: (name: string) => void;
}

export const MyMedicationsScreen: React.FC<MyMedicationsScreenProps> = ({ onBack, onSelectMed }) => {
  const [medications, setMedications] = useState<DrugInfo[]>([]);
  const { t } = useLocalization();

  useEffect(() => {
    setMedications(getSavedMedications());
  }, []);

  const handleDelete = (drugNameToDelete: string) => {
    setMedications(removeMedication(drugNameToDelete));
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center text-brand-primary dark:text-[#90E0EF] font-semibold hover:underline">
          <ChevronLeftIcon className="w-5 h-5 me-1 rtl:rotate-180" />
          {t('backToSearch')}
        </button>
        <ThemeToggle />
      </div>

      <div className="bg-white dark:bg-[#1C1C1E] p-6 sm:p-8 rounded-2xl shadow-lg dark:shadow-none w-full transition-colors duration-300">
        <h1 className="text-3xl font-bold text-brand-dark dark:text-white mb-6 text-center">{t('myMedicationsTitle')}</h1>
        
        {medications.length > 0 ? (
          <ul className="space-y-4">
            {medications.map((med) => (
              <li key={med.drugName} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-[#2C2C2E] rounded-lg hover:bg-gray-100 dark:hover:bg-[#3A4D54] transition-colors">
                <div className="flex items-center cursor-pointer flex-grow" onClick={() => onSelectMed(med.drugName)}>
                  <PillIcon className="w-6 h-6 text-brand-secondary dark:text-[#90E0EF] me-4" />
                  <div>
                    <p className="font-semibold text-brand-dark dark:text-white">{med.drugName}</p>
                    <p className="text-sm text-gray-500 dark:text-[#A1A1AA]">{med.strength}</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(med.drugName);
                  }} 
                  className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                  aria-label={`${t('delete')} ${med.drugName}`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-[#A1A1AA]">{t('noSavedMedications')}</p>
            <p className="text-sm text-gray-400 dark:text-[#A1A1AA]/70 mt-2">{t('noSavedMedicationsHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
};