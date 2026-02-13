import React, { useState, useEffect } from 'react';
import type { ProfessionalDrugInfo } from '../types';
import { fetchProfessionalDrugInformation } from '../services/geminiService';
import { Spinner } from './Spinner';
import { ChevronLeftIcon, BookOpenIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';

interface ProfessionalScreenProps {
  drugName: string;
  onBackToPatientView: () => void;
}

const InfoSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
    // Convert markdown bold (**text**) to HTML bold
    const formatMarkdown = (text: string): React.ReactNode => {
        const parts = text.split(/(\*\*.*?\*\*)/);
        return parts.map((part, idx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={idx} className="font-bold">{part.slice(2, -2)}</strong>;
            }
            return <span key={idx}>{part}</span>;
        });
    };

    // Handle both string and object/array values
    const renderValue = (value: any): React.ReactNode => {
        // Handle undefined or null values
        if (value === undefined || value === null || value === '') {
            return <div className="text-gray-400 italic">No information available</div>;
        }
        
        if (typeof value === 'string') {
            return <div>{formatMarkdown(value)}</div>;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                return <div className="text-gray-400 italic">No information available</div>;
            }
            return (
                <ul className="list-none space-y-2 ms-4">
                    {value.map((item, idx) => (
                        <li key={idx} className="flex items-start">
                            <span className="text-brand-primary me-2">•</span>
                            <span className="flex-1">{typeof item === 'string' ? formatMarkdown(item) : renderValue(item)}</span>
                        </li>
                    ))}
                </ul>
            );
        }
        if (typeof value === 'object' && value !== null) {
            return (
                <div className="space-y-4">
                    {Object.entries(value).map(([key, val]) => (
                        <div key={key}>
                            <strong className="text-brand-primary font-semibold">
                                {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim()}:
                            </strong>
                            <div className="ms-4 mt-1">{renderValue(val)}</div>
                        </div>
                    ))}
                </div>
            );
        }
        return String(value);
    };

    return (
        <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center mb-4">
                <div className="bg-brand-accent text-brand-primary p-2 rounded-full me-4">
                    <BookOpenIcon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-brand-dark">{title}</h3>
            </div>
            <div className="text-gray-700 leading-relaxed">
                {renderValue(children)}
            </div>
        </div>
    );
};

export const ProfessionalScreen: React.FC<ProfessionalScreenProps> = ({ drugName, onBackToPatientView }) => {
  const [profInfo, setProfInfo] = useState<ProfessionalDrugInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useLocalization();

  useEffect(() => {
    const getProfInfo = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const info = await fetchProfessionalDrugInformation(drugName);
        setProfInfo(info);
      } catch (err: any) {
        setError(err.message || 'Failed to load professional information.');
      } finally {
        setIsLoading(false);
      }
    };
    getProfInfo();
  }, [drugName]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full pt-20">
          <Spinner />
          <p className="text-brand-dark mt-4 text-lg">{t('loadingProfessionalData')}</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="bg-red-100 border-s-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
          <p className="font-bold">{t('error')}</p>
          <p>{error}</p>
        </div>
      );
    }
    if (profInfo) {
      return (
        <div className="space-y-6 animate-fade-in-fast">
          <InfoSection title={t('chemistry')}>{profInfo.chemistry}</InfoSection>
          <InfoSection title={t('bcsClass')}>{profInfo.bcsClass}</InfoSection>
          <InfoSection title={t('pharmacology')}>{profInfo.pharmacology}</InfoSection>
          <InfoSection title={t('pharmacokinetics')}>{profInfo.pharmacokinetics}</InfoSection>
          <InfoSection title={t('mechanismOfAction')}>{profInfo.mechanismOfAction}</InfoSection>
          <InfoSection title={t('adverseEffects')}>{profInfo.adverseEffects}</InfoSection>
          <InfoSection title={t('drugInteractions')}>{profInfo.drugInteractions}</InfoSection>
          <InfoSection title={t('references')}>{profInfo.references}</InfoSection>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <button onClick={onBackToPatientView} className="flex items-center text-brand-primary font-semibold hover:underline mb-6">
        <ChevronLeftIcon className="w-5 h-5 me-1 rtl:rotate-180" />
        {t('backToPatientView')}
      </button>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-brand-dark">{drugName}</h1>
        <p className="text-xl text-gray-500">{t('professionalInformation')}</p>
      </div>
      {renderContent()}
    </div>
  );
};