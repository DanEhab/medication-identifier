import React, { useState, useEffect } from 'react';
import type { DrugInfo } from '../types';
import { ChevronLeftIcon, TrashIcon, PillIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';

interface MyMedicationsScreenProps {
  onBack: () => void;
  onSelectMed: (name: string) => void;
}

export const MyMedicationsScreen: React.FC<MyMedicationsScreenProps> = ({ onBack, onSelectMed }) => {
  const [medications, setMedications] = useState<DrugInfo[]>([]);
  const { t } = useLocalization();

  useEffect(() => {
    const savedMeds = JSON.parse(localStorage.getItem('myMedications') || '[]') as DrugInfo[];
    setMedications(savedMeds);
  }, []);

  const handleDelete = (drugNameToDelete: string) => {
    const updatedMeds = medications.filter(med => med.drugName !== drugNameToDelete);
    setMedications(updatedMeds);
    localStorage.setItem('myMedications', JSON.stringify(updatedMeds));
  };

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <button onClick={onBack} className="flex items-center text-brand-primary font-semibold hover:underline mb-6">
        <ChevronLeftIcon className="w-5 h-5 me-1 rtl:rotate-180" />
        {t('backToSearch')}
      </button>

      <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg w-full">
        <h1 className="text-3xl font-bold text-brand-dark mb-6 text-center">{t('myMedicationsTitle')}</h1>
        
        {medications.length > 0 ? (
          <ul className="space-y-4">
            {medications.map((med) => (
              <li key={med.drugName} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                <div className="flex items-center cursor-pointer flex-grow" onClick={() => onSelectMed(med.drugName)}>
                  <PillIcon className="w-6 h-6 text-brand-secondary me-4" />
                  <div>
                    <p className="font-semibold text-brand-dark">{med.drugName}</p>
                    <p className="text-sm text-gray-500">{med.strength}</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(med.drugName);
                  }} 
                  className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-100 transition-colors"
                  aria-label={`${t('delete')} ${med.drugName}`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">{t('noSavedMedications')}</p>
            <p className="text-sm text-gray-400 mt-2">{t('noSavedMedicationsHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
};