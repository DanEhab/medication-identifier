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
        <p className="text-xs max-w-3xl mx-auto mb-4">
          {t('disclaimerText')}
        </p>
        <div className="flex flex-wrap justify-center gap-4 text-xs mt-4">
          <a 
            href="/privacy-policy.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline"
          >
            {t('privacyPolicy')}
          </a>
          <span className="text-gray-400">•</span>
          <a 
            href="/terms-of-service.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-brand-primary hover:underline"
          >
            {t('termsOfService')}
          </a>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500">© 2026 Medication Identifier v1.0.0</span>
        </div>
      </div>
    </footer>
  );
};