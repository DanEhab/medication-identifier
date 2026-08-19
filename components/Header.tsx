import React, { useState, useRef, useEffect } from 'react';
import { Bars3Icon, BookmarkIcon, ArrowPathIcon, PillIcon, GlobeIcon, ChevronDownIcon, UKFlagIcon, EgyptFlagIcon } from './Icons';
import { useLocalization } from '../context/LanguageContext';

interface HeaderProps {
    onHomeClick: () => void;
    onShowMyMedications: () => void;
    onReplayTutorial?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onHomeClick, onShowMyMedications, onReplayTutorial }) => {
    const { language, setLanguage, t } = useLocalization();
    const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
    const [isMenuDropdownOpen, setIsMenuDropdownOpen] = useState(false);
    const langDropdownRef = useRef<HTMLDivElement>(null);
    const menuDropdownRef = useRef<HTMLDivElement>(null);

    const toggleLangDropdown = () => {
        setIsLangDropdownOpen(!isLangDropdownOpen);
        setIsMenuDropdownOpen(false);
    };
    
    const toggleMenuDropdown = () => {
        setIsMenuDropdownOpen(!isMenuDropdownOpen);
        setIsLangDropdownOpen(false);
    };

    const selectLanguage = (lang: 'en' | 'ar') => {
        setLanguage(lang);
        setIsLangDropdownOpen(false);
    };

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
                setIsLangDropdownOpen(false);
            }
            if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
                setIsMenuDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <header className="bg-white dark:bg-[#0D0D0D] shadow-md dark:shadow-none dark:border-b dark:border-[#3A4D54] sticky top-0 z-10 transition-colors duration-300">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-16">
                    <button onClick={onHomeClick} className="flex items-center space-x-2 cursor-pointer group">
                        <div className="p-2 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-lg group-hover:scale-105 transition-transform">
                            <PillIcon className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-xl font-bold text-brand-dark dark:text-white">{t('medicationIdentifier')}</h1>
                    </button>
                    <div className="flex items-center space-x-0">
                        {/* Language Dropdown */}
                        <div className="relative" ref={langDropdownRef}>
                            <button
                                data-tutorial="globe-icon"
                                onClick={toggleLangDropdown}
                                className="flex items-center space-x-0 text-gray-600 dark:text-[#90E0EF] hover:text-brand-primary dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1C1C1E]"
                                aria-label="Change language"
                            >
                                <GlobeIcon className="w-7 h-7" />
                                <ChevronDownIcon className={`w-5 h-5 transition-transform duration-200 ${isLangDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Dropdown Menu */}
                            {isLangDropdownOpen && (
                                <div className={`absolute ${language === 'ar' ? 'left-0' : 'right-0'} mt-2 w-44 bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#3A4D54] overflow-hidden z-50 animate-fade-in-fast`}>
                                    <button
                                        onClick={() => selectLanguage('en')}
                                        className={`w-full flex items-center space-x-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors ${
                                            language === 'en' ? 'bg-blue-50 dark:bg-[#2C2C2E] rounded-t-2xl' : ''
                                        }`}
                                    >
                                        <UKFlagIcon className="w-8 h-6" />
                                        <span className={`text-lg font-bold ${language === 'en' ? 'text-brand-primary dark:text-[#90E0EF]' : 'text-gray-800 dark:text-white'}`}>
                                            English
                                        </span>
                                    </button>
                                    <button
                                        onClick={() => selectLanguage('ar')}
                                        className={`w-full flex items-center space-x-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors ${
                                            language === 'ar' ? 'bg-blue-50 dark:bg-[#2C2C2E] rounded-b-2xl' : ''
                                        }`}
                                    >
                                        <EgyptFlagIcon className="w-8 h-6" />
                                        <span className={`text-lg font-bold ${language === 'ar' ? 'text-brand-primary dark:text-[#90E0EF]' : 'text-gray-800 dark:text-white'}`}>
                                            Arabic
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Hamburger Menu Dropdown */}
                        <div className="relative" ref={menuDropdownRef}>
                            <button 
                                data-tutorial="hamburger-menu"
                                onClick={toggleMenuDropdown} 
                                className="flex items-center text-gray-600 dark:text-[#90E0EF] hover:text-brand-primary dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#1C1C1E] group"
                                aria-label="Open menu"
                            >
                                <Bars3Icon className="w-7 h-7 group-hover:scale-110 transition-transform"/>
                            </button>
                            
                            {isMenuDropdownOpen && (
                                <div className={`absolute ${language === 'ar' ? 'left-0' : 'right-0'} mt-2 w-56 bg-white dark:bg-[#1C1C1E] rounded-2xl shadow-2xl border border-gray-100 dark:border-[#3A4D54] overflow-hidden z-50 animate-fade-in-fast`}>
                                    <button
                                        onClick={() => {
                                            setIsMenuDropdownOpen(false);
                                            onShowMyMedications();
                                        }}
                                        className="w-full flex items-center space-x-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors text-gray-800 dark:text-white group"
                                    >
                                        <BookmarkIcon className="w-6 h-6 text-brand-primary dark:text-[#90E0EF] group-hover:scale-110 transition-transform" />
                                        <span className="text-base font-semibold">
                                            {t('saved')}
                                        </span>
                                    </button>
                                    <div className="border-t border-gray-100 dark:border-[#3A4D54]"></div>
                                    <button
                                        onClick={() => {
                                            setIsMenuDropdownOpen(false);
                                            if (onReplayTutorial) onReplayTutorial();
                                        }}
                                        className="w-full flex items-center space-x-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-[#2C2C2E] transition-colors text-gray-800 dark:text-white group"
                                    >
                                        <ArrowPathIcon className="w-6 h-6 text-brand-primary dark:text-[#90E0EF] group-hover:scale-110 transition-transform group-hover:rotate-180" />
                                        <span className="text-base font-semibold">
                                            {language === 'ar' ? 'إعادة التعليمات' : 'Restart Tutorial'}
                                        </span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};