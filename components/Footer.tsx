import React from 'react';
import { useLocalization } from '../context/LanguageContext';

export const Footer: React.FC = () => {
  const { t } = useLocalization();
  return (
    <footer className="bg-white mt-8 py-6 border-t">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600">
        <p className="font-semibold text-sm mb-2 text-brand-danger">
          {t('disclaimer')}
        </p>
        <p className="text-xs max-w-3xl mx-auto">
          {t('disclaimerText')}
        </p>
      </div>
    </footer>
  );
};