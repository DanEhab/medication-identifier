import React from 'react';
import { useLocalization } from '../context/LanguageContext';

/**
 * The app's three places: the camera, the saved list, and typing a name.
 *
 * The camera screen is deliberately not one of them — it runs edge to edge and
 * a bar across the bottom would take a fifth of the viewfinder. It is reached
 * from the Scan tab here and returns through its own controls.
 */

export type Tab = 'scan' | 'medicines' | 'search';

interface TabBarProps {
  active: Tab;
  onSelect: (tab: Tab) => void;
}

const ScanIcon: React.FC<{ color: string; active: boolean }> = ({ color, active }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={color}
    strokeWidth={active ? 2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 12h6" />
  </svg>
);

const MedicinesIcon: React.FC<{ color: string; active: boolean }> = ({ color, active }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={color}
    strokeWidth={active ? 2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

const SearchIcon: React.FC<{ color: string }> = ({ color }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);

export const TabBar: React.FC<TabBarProps> = ({ active, onSelect }) => {
  const { t } = useLocalization();

  const tabs: { key: Tab; label: string; icon: (color: string, isActive: boolean) => React.ReactNode }[] = [
    { key: 'scan', label: t('tabScan'), icon: (color, isActive) => <ScanIcon color={color} active={isActive} /> },
    { key: 'medicines', label: t('tabMedicines'), icon: (color, isActive) => <MedicinesIcon color={color} active={isActive} /> },
    { key: 'search', label: t('tabSearch'), icon: (color) => <SearchIcon color={color} /> },
  ];

  return (
    <nav
      className="sticky bottom-0 mt-auto border-t border-paper-sand flex px-2 pt-2 pb-1.5"
      style={{
        background: 'rgba(247, 243, 236, 0.96)',
        backdropFilter: 'blur(8px)',
        paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
      }}
      aria-label={t('mainNavigation')}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? '#0A5A56' : '#5B6A6A';
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            aria-current={isActive ? 'page' : undefined}
            data-tab={tab.key}
            className="flex-1 flex flex-col items-center gap-1 py-2 active:scale-95 transition-transform"
          >
            {tab.icon(color, isActive)}
            <span
              className={`text-[12px] ${isActive ? 'font-semibold' : 'font-medium'}`}
              style={{ color }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
