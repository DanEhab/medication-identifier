import React from 'react';
import { useLocalization } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useReminders } from '../hooks/useReminders';

/**
 * Everything the app can be told, in one place.
 *
 * Three of these settings existed and had nowhere to be changed from. The
 * theme followed the phone with no way to override it, the tour could only be
 * seen once and never again, and the language could only be switched from the
 * camera screen — so anyone reading a medicine in the wrong language had to
 * leave the medicine to fix it.
 *
 * It is a pushed screen rather than a fourth tab: nothing here is somewhere
 * you go, it is something you do once and leave.
 */

declare const __APP_VERSION__: string;
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

interface SettingsScreenProps {
  onBack: () => void;
  /** Clears both tour phases and puts the user on the camera to see it. */
  onReplayTutorial: () => void;
  /** Brings the first-run notice back over the app. */
  onShowDisclaimer: () => void;
}

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const ChevronForward: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft shrink-0 rtl:rotate-180">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

/**
 * The way in, for the header of any screen that is one of the three tabs.
 *
 * Exported from here rather than from an icon file so that the button and the
 * screen it opens stay one thing: there is nowhere else in the app that a gear
 * would mean anything different.
 */
export const SettingsButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useLocalization();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('settings')}
      data-testid="open-settings"
      // 40, not the 34 it was: the circle is the hit area, and 34 is below
      // every platform's minimum for something a finger has to find.
      className="w-10 h-10 rounded-full border border-paper-sand bg-surface
        flex items-center justify-center text-ink active:scale-95 transition-transform"
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
        strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3.1" />
        <path d="M19.4 14.2a1.6 1.6 0 0 0 .32 1.77l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.05-.06a1.6 1.6 0 0 0-1.78-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.46-.97h-.17a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.78-.32l.05-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.46.97h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46.97z" />
      </svg>
    </button>
  );
};

/**
 * The heading over a group of settings.
 *
 * A real heading, not the app's small mono label. That label is right on the
 * result screen, where it names the value directly underneath it and the value
 * is the thing being read. Here the headings *are* the structure of the page —
 * they are what somebody scans to find the setting they came for — and at
 * twelve mono pixels in the soft ink they were quieter than the hint text
 * under every control.
 */
const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="font-semibold text-[20px] leading-[1.3] tracking-[-0.01em] text-ink px-5 m-0 mb-3 mt-8">
    {children}
  </h2>
);

/**
 * A row of mutually exclusive choices.
 *
 * A segmented control rather than a switch: "light or dark" is two states but
 * "follow the phone" is a third, and a switch cannot say it. The one the app
 * is actually using is the one that looks pressed, so following the phone at
 * night still shows Automatic selected rather than Dark.
 */
function Segmented<T extends string>({ value, options, onChange, label, fixedOrder }: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (next: T) => void;
  label: string;
  /**
   * Keep the options in the order they are written, whichever way the page
   * reads. Only the language control wants this: its two options *are* the two
   * directions, so letting the page flip them means the button you just
   * pressed moves out from under your finger, and the one you would press to
   * undo it is where the first one used to be.
   */
  fixedOrder?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      dir={fixedOrder ? 'ltr' : undefined}
      className="mx-5 rounded-full bg-paper-deep p-1 flex gap-1"
    >
      {options.map((option) => {
        const isActive = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={isActive}
            data-testid={`option-${option.key}`}
            onClick={() => onChange(option.key)}
            className={`flex-1 h-11 rounded-full text-[16px] transition-colors active:scale-[0.98]
              ${isActive ? 'font-semibold' : 'font-medium text-ink-soft'}`}
            style={isActive
              ? { background: 'var(--surface)', color: 'var(--ink)', boxShadow: '0 1px 3px rgba(0,0,0,.12)' }
              : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A tappable row that does something, rather than choosing something. */
const ActionRow: React.FC<{
  title: string;
  hint: string;
  onClick: () => void;
  testId?: string;
}> = ({ title, hint, onClick, testId }) => (
  <button
    type="button"
    onClick={onClick}
    data-testid={testId}
    className="w-full px-5 py-4 flex items-center gap-3 text-start border-b border-paper-deep
      active:bg-paper-deep transition-colors"
  >
    <span className="flex-1 min-w-0">
      <span className="block text-[18px] leading-[1.35] text-ink">{title}</span>
      <span className="block text-[15px] leading-[1.45] text-ink-soft mt-0.5">{hint}</span>
    </span>
    <ChevronForward />
  </button>
);

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack, onReplayTutorial, onShowDisclaimer,
}) => {
  const { t, language, setLanguage } = useLocalization();
  const { preference, setPreference, isDark } = useTheme();
  const { permission, scheduled, rebuild, askPermission } = useReminders();

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }} data-testid="settings">
      <header className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label={t('backToSearch')}
          className="p-2.5 -m-2.5 active:scale-90 transition-transform shrink-0"
        >
          <ChevronBack />
        </button>
        <h1 className="font-semibold text-[22px] leading-[1.2] tracking-[-0.01em] text-ink m-0">
          {t('settingsTitle')}
        </h1>
      </header>

      {/* ── Appearance ── */}
      <SectionLabel>{t('appearance')}</SectionLabel>
      <Segmented
        label={t('appearance')}
        value={preference}
        onChange={setPreference}
        options={[
          { key: 'system', label: t('themeSystem') },
          { key: 'light', label: t('themeLight') },
          { key: 'dark', label: t('themeDark') },
        ]}
      />
      <p className="text-[15px] leading-[1.5] text-ink-soft px-5 mt-2.5 m-0">
        {preference === 'system'
          ? t('followingPhone').replace('{mode}', isDark ? t('themeDark') : t('themeLight'))
          : t('appearanceHint')}
      </p>

      {/* ── Language ── */}
      <SectionLabel>{t('languageSetting')}</SectionLabel>
      <Segmented
        label={t('languageSetting')}
        value={language}
        onChange={setLanguage}
        fixedOrder
        options={[
          { key: 'en', label: 'English' },
          { key: 'ar', label: 'العربية' },
        ]}
      />
      <p className="text-[15px] leading-[1.5] text-ink-soft px-5 mt-2.5 m-0">{t('languageHint')}</p>

      {/*
        ── Reminders ──

        Worth its own section rather than a line on the medicine sheet: the
        times are set one at a time, on different medicines, and the only
        question anybody actually has is whether the whole lot will arrive.
        Android can refuse that at the system level long after the app asked.
      */}
      <SectionLabel>{t('remindersSection')}</SectionLabel>
      <p className="text-[15px] leading-[1.5] text-ink-soft px-5 m-0" data-testid="reminder-state">
        {permission === 'unavailable'
          ? t('remindersUnavailable')
          : permission !== 'granted'
            ? t('remindersBlocked')
            : scheduled === 0
              ? t('remindersNone')
              : scheduled === 1
                ? t('remindersOnOne')
                : t('remindersOn').replace('{count}', String(scheduled))}
      </p>
      {permission === 'prompt' && (
        <div className="px-5 pt-3">
          <button
            type="button"
            data-testid="allow-reminders"
            onClick={async () => { await askPermission(); await rebuild(); }}
            className="h-[50px] px-6 rounded-full bg-teal font-semibold text-[17px] text-teal-on
              active:scale-[0.98] transition-transform"
          >
            {t('remindersAllow')}
          </button>
        </div>
      )}

      {/* ── Help ── */}
      <SectionLabel>{t('helpSection')}</SectionLabel>
      <div className="border-t border-paper-deep">
        <ActionRow
          title={t('replayTutorial')}
          hint={t('replayTutorialHint')}
          onClick={onReplayTutorial}
          testId="replay-tutorial"
        />
        <ActionRow
          title={t('showDisclaimer')}
          hint={t('showDisclaimerHint')}
          onClick={onShowDisclaimer}
          testId="show-disclaimer"
        />
      </div>

      {/* ── About ── */}
      <SectionLabel>{t('aboutSection')}</SectionLabel>
      <div className="px-5">
        <p className="text-[16px] leading-[1.55] text-ink-soft m-0">
          {t('versionLabel')} <bdi>{VERSION}</bdi>
        </p>
        <p className="text-[16px] leading-[1.55] text-ink-soft mt-2 m-0" style={{ textWrap: 'pretty' }}>
          {t('privacyLine2')}
        </p>
      </div>

      <div className="h-10" aria-hidden="true" />
    </div>
  );
};
