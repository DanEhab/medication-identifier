import React from 'react';
import { useLocalization } from '../context/LanguageContext';

declare const __APP_VERSION__: string;
const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export const Footer: React.FC = () => {
  const { t } = useLocalization();
  return (
    <footer className="bg-white dark:bg-[#0D0D0D] mt-8 py-6 border-t dark:border-[#3A4D54] transition-colors duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-600 dark:text-[#A1A1AA]">
        <p className="font-semibold text-sm mb-2 text-brand-danger dark:text-[#FF6B6B]">
          {t('disclaimer')}
        </p>
        <p className="text-xs max-w-3xl mx-auto mb-4 dark:text-[#A1A1AA]">
          {t('disclaimerText')}
        </p>
        <div className="flex flex-wrap justify-center gap-4 text-xs mt-4">
          <a 
            href="/privacy-policy.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-brand-primary dark:text-[#90E0EF] hover:underline"
          >
            {t('privacyPolicy')}
          </a>
          <span className="text-gray-400 dark:text-[#3A4D54]">•</span>
          <a 
            href="/terms-of-service.html" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-brand-primary dark:text-[#90E0EF] hover:underline"
          >
            {t('termsOfService')}
          </a>
          <span className="text-gray-400 dark:text-[#3A4D54]">•</span>
          <span className="text-gray-500 dark:text-[#A1A1AA]">© 2026 Medication Identifier v{appVersion}</span>
        </div>
      </div>
    </footer>
  );
};