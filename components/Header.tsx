import React from 'react';
import { ListBulletIcon, PillIcon, GlobeIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';

interface HeaderProps {
    onHomeClick: () => void;
    onShowMyMedications: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHomeClick, onShowMyMedications }) => {
    const { language, setLanguage, t } = useLocalization();

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'ar' : 'en';
        setLanguage(newLang);
    };

    return (
        <header className="bg-white shadow-md sticky top-0 z-10">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <button onClick={onHomeClick} className="flex items-center space-x-2 cursor-pointer group">
                        <div className="p-2 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-lg group-hover:scale-105 transition-transform">
                            <PillIcon className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-brand-dark">{t('medicationIdentifier')}</h1>
                    </button>
                    <div className="flex items-center space-x-2 sm:space-x-4">
                        <button 
                            onClick={onShowMyMedications} 
                            className="flex items-center space-x-2 text-gray-600 font-semibold hover:text-brand-primary transition-colors"
                            aria-label="View my saved medications"
                        >
                            <ListBulletIcon className="w-6 h-6"/>
                            <span className="hidden sm:inline">{t('myMedications')}</span>
                        </button>
                        <button
                            onClick={toggleLanguage}
                            className="flex items-center space-x-2 text-gray-600 font-semibold hover:text-brand-primary transition-colors"
                            aria-label="Change language"
                        >
                            <GlobeIcon className="w-6 h-6" />
                            <span className="hidden sm:inline">{t('language')}</span>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    );
};