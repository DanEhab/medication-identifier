import React from 'react';
import { useLocalization } from '../context/LanguageContext';

/**
 * The app's three places: the camera, the saved list, and typing a name.
 *
 * It used to render on the saved list alone, which made it read as part of
 * that one screen rather than as the app's navigation: the camera offered a
 * hamburger to the list, the search screen offered a back arrow to the camera,
 * and there was no single thing that said what the app contained. It is on all
 * three now.
 *
 * Not on the screens those three push — a medicine, its side effects, the
 * clinical view. Those are somewhere you went, not somewhere you are, and each
 * already carries a back control and its own action at the bottom.
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

/*
  A bookmark, not the three lines it used to be. Three lines is the symbol for
  a menu, so the tab for saved medicines was promising a menu; it is also the
  icon the result screen puts on "Save to my medicines", which is exactly the
  action that puts something here.
*/
const MedicinesIcon: React.FC<{ color: string; active: boolean }> = ({ color, active }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill={active ? color : 'none'} stroke={color}
    strokeWidth={active ? 2 : 1.9} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v14l-7.5-4-7.5 4V6A1.5 1.5 0 0 1 6 4.5z" />
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

  const tabs: {
    key: Tab;
    label: string;
    icon: (color: string, isActive: boolean) => React.ReactNode;
    /** The tour points at the saved list here, now that it lives in the bar. */
    tutorial?: string;
  }[] = [
    { key: 'scan', label: t('tabScan'), icon: (color, isActive) => <ScanIcon color={color} active={isActive} /> },
    { key: 'medicines', label: t('tabMedicines'), tutorial: 'my-medicines', icon: (color, isActive) => <MedicinesIcon color={color} active={isActive} /> },
    { key: 'search', label: t('tabSearch'), icon: (color) => <SearchIcon color={color} /> },
  ];

  return (
    <nav
      className="sticky bottom-0 mt-auto border-t border-paper-sand flex px-2 pt-2 pb-1.5"
      style={{
        background: 'var(--bar)',
        backdropFilter: 'blur(8px)',
        paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))',
      }}
      aria-label={t('mainNavigation')}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        const color = isActive ? 'var(--teal)' : 'var(--ink-soft)';
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            aria-current={isActive ? 'page' : undefined}
            data-tab={tab.key}
            data-tutorial={tab.tutorial}
            className="flex-1 flex flex-col items-center gap-1 py-2 active:scale-95 transition-transform"
          >
            {tab.icon(color, isActive)}
            <span
              className={`text-[13px] ${isActive ? 'font-semibold' : 'font-medium'}`}
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
