import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { MedicationSchedule, SavedMedication } from '../lib/medicationStorage';
import { getMedicationsFor, removeMedication, setSchedule } from '../lib/medicationStorage';
import { findInteractions, displayNameOf, type Interaction } from '../lib/interactions';
import {
  getProfiles, getActiveProfileId, setActiveProfileId, addProfile, removeProfile,
  initialFor, DEFAULT_PROFILE_ID, type Profile,
} from '../lib/profiles';
import { useLocalization } from '../context/LanguageContext';
import { TabBar, type Tab } from './TabBar';

/**
 * A list with a reason to return.
 *
 * A saved list that only remembers names is a bookmark folder. What makes it
 * worth opening is what it can tell you that no single medicine's page can:
 * that two things on it should not be taken together, and when each one is due.
 *
 * The interaction check invents nothing — see lib/interactions.ts. It reads the
 * "never with" line each answer already carries and asks whether it names
 * something else on the same person's list.
 */

interface MyMedicinesScreenProps {
  onSelectMed: (name: string) => void;
  onSelectTab: (tab: Tab) => void;
}

const Chevron: React.FC<{ color?: string }> = ({ color = 'var(--ink-soft)' }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 rtl:rotate-180">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

const DangerIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="text-clay shrink-0">
    <path d="M12 4 2.5 20h19z" />
    <path d="M12 10v4" />
    <path d="M12 17.5h.01" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft shrink-0">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const EMPTY_SCHEDULE: MedicationSchedule = { times: [], note: '' };

export const MyMedicinesScreen: React.FC<MyMedicinesScreenProps> = ({ onSelectMed, onSelectTab }) => {
  const { t } = useLocalization();
  const meLabel = t('profileMe');

  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles(meLabel));
  const [activeId, setActiveId] = useState<string>(() => getActiveProfileId());
  const [saved, setSaved] = useState<SavedMedication[]>([]);
  const [addingProfile, setAddingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [editing, setEditing] = useState<SavedMedication | null>(null);
  const [interactionsOpen, setInteractionsOpen] = useState(false);

  const refresh = useCallback((profileId: string) => {
    setSaved(getMedicationsFor(profileId));
  }, []);

  useEffect(() => { refresh(activeId); }, [activeId, refresh]);

  // A profile whose entry has since been deleted would show an empty list with
  // no way back, so fall back to the one that always exists.
  useEffect(() => {
    if (!profiles.some((profile) => profile.id === activeId)) {
      setActiveProfileId(DEFAULT_PROFILE_ID);
      setActiveId(DEFAULT_PROFILE_ID);
    }
  }, [profiles, activeId]);

  const interactions = useMemo(() => findInteractions(saved), [saved]);

  const chooseProfile = (id: string) => {
    setActiveProfileId(id);
    setActiveId(id);
  };

  const commitNewProfile = () => {
    const name = newProfileName.trim();
    setAddingProfile(false);
    setNewProfileName('');
    if (!name) return;
    const next = addProfile(name, meLabel);
    setProfiles(next);
    const created = next.find((profile) => profile.name.toLowerCase() === name.toLowerCase());
    if (created) chooseProfile(created.id);
  };

  const handleRemoveProfile = (id: string) => {
    setProfiles(removeProfile(id, meLabel));
  };

  const saveSchedule = (entry: SavedMedication, schedule: MedicationSchedule) => {
    setSchedule(entry.drugInfo.drugName, schedule, activeId);
    setEditing(null);
    refresh(activeId);
  };

  const forget = (entry: SavedMedication) => {
    removeMedication(entry.drugInfo.drugName, activeId);
    setEditing(null);
    refresh(activeId);
  };

  const activeProfile = profiles.find((profile) => profile.id === activeId) || profiles[0];

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      <div className="px-5 pt-4">
        <h1 className="font-semibold text-[30px] leading-[1.2] tracking-[-0.02em] text-ink m-0">
          {t('myMedicinesTitle')}
        </h1>
      </div>

      {/* ── Whose medicines ── */}
      <div className="flex gap-2 px-5 pt-4 flex-wrap items-center" data-testid="profiles">
        {profiles.map((profile) => {
          const isActive = profile.id === activeId;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => chooseProfile(profile.id)}
              onDoubleClick={() => profile.id !== DEFAULT_PROFILE_ID && handleRemoveProfile(profile.id)}
              aria-pressed={isActive}
              className={`h-10 rounded-full flex items-center gap-2 ps-1.5 pe-3.5 transition-colors
                active:scale-[0.97] ${isActive ? 'bg-selected' : 'bg-surface border border-paper-sand'}`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-[13px]"
                style={isActive
                  ? { background: 'var(--selected-fg)', color: 'var(--selected-bg)' }
                  : { background: 'var(--paper-deep)', color: 'var(--ink-soft)' }}
              >
                {initialFor(profile.name)}
              </span>
              <span className={`text-[15px] ${isActive ? 'font-semibold text-selected-fg' : 'font-medium text-ink'}`}>
                <bdi>{profile.name}</bdi>
              </span>
            </button>
          );
        })}

        {addingProfile ? (
          <input
            autoFocus
            value={newProfileName}
            onChange={(event) => setNewProfileName(event.target.value)}
            onBlur={commitNewProfile}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitNewProfile();
              if (event.key === 'Escape') { setAddingProfile(false); setNewProfileName(''); }
            }}
            placeholder={t('whoIsThisFor')}
            aria-label={t('whoIsThisFor')}
            className="h-10 w-36 rounded-full bg-surface border border-paper-edge px-4
              text-[15px] text-ink outline-none placeholder:text-ink-soft"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAddingProfile(true)}
            aria-label={t('addPerson')}
            className="w-10 h-10 rounded-full bg-surface flex items-center justify-center
              text-[20px] text-ink-soft active:scale-95 transition-transform"
            style={{ border: '1px dashed var(--paper-edge)' }}
          >
            +
          </button>
        )}
      </div>

      {/* ── What the list can tell you that one page cannot ── */}
      {interactions.length > 0 && (
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => setInteractionsOpen(true)}
            data-testid="interaction-warning"
            className="w-full bg-surface rounded-[16px] py-3.5 px-4 flex items-center gap-3
              text-start active:scale-[0.99] transition-transform"
            style={{ border: '2px solid var(--clay-soft)' }}
          >
            <DangerIcon />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-[15px] leading-[1.4] text-clay">
                {interactions.length === 1 ? t('twoMayInteract') : t('someMayInteract')}
              </span>
              <span className="block text-[14px] leading-[1.4] text-clay-deep truncate">
                <bdi>{interactions[0].aName} + {interactions[0].bName}</bdi>
              </span>
            </span>
            <Chevron color="var(--clay)" />
          </button>
        </div>
      )}

      {/* ── The list ── */}
      {saved.length === 0 ? (
        <div className="px-5 pt-8 flex flex-col items-center text-center">
          <p className="text-[17px] leading-[1.5] text-ink m-0 mb-1.5 font-medium">{t('nothingSavedYet')}</p>
          <p className="text-[15px] leading-[1.55] text-ink-soft m-0 mb-5">
            {activeProfile && activeProfile.id !== DEFAULT_PROFILE_ID
              ? t('nothingSavedForPerson').replace('{name}', activeProfile.name)
              : t('nothingSavedHint')}
          </p>
          <button
            type="button"
            onClick={() => onSelectTab('scan')}
            className="h-[52px] px-6 rounded-full bg-teal font-semibold text-[16px] text-teal-on
              active:scale-[0.98] transition-transform"
          >
            {t('scanAMedicine')}
          </button>
        </div>
      ) : (
        <div className="px-5 pt-4 flex flex-col gap-2.5" data-testid="medicine-list">
          {saved.map((entry) => {
            const name = displayNameOf(entry);
            const detail = [entry.drugInfo.canonicalName, entry.drugInfo.strength]
              .map((part) => (part || '').trim())
              .filter((part) => part && part.toLowerCase() !== name.toLowerCase())
              .join(' · ');
            const schedule = entry.schedule;

            return (
              <div key={`${entry.profileId}-${entry.drugInfo.drugName}`} className="bg-surface border border-paper-sand rounded-[16px] p-4">
                <button
                  type="button"
                  onClick={() => onSelectMed(entry.originalName || entry.drugInfo.drugName)}
                  className="w-full flex items-start justify-between gap-3 text-start"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-[18px] leading-[1.3] text-ink truncate"><bdi>{name}</bdi></span>
                    {detail && <span className="block text-[15px] text-ink-soft truncate"><bdi>{detail}</bdi></span>}
                  </span>
                  <Chevron />
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  aria-label={t('whenToTakeIt')}
                  className="w-full mt-3 pt-3 border-t border-paper-deep flex items-center gap-2 flex-wrap text-start"
                >
                  {schedule?.times.map((time) => (
                    <span
                      key={time}
                      className="font-mono font-medium text-[13px] text-teal bg-teal-wash rounded-full py-1 px-2.5"
                    >
                      {time}
                    </span>
                  ))}
                  {schedule?.note && <span className="text-[14px] text-ink-soft"><bdi>{schedule.note}</bdi></span>}
                  {!schedule && (
                    <span className="flex items-center gap-2 text-[14px] text-ink-soft">
                      <ClockIcon />
                      {t('addWhenToTake')}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="h-10" aria-hidden="true" />

      <TabBar active="medicines" onSelect={onSelectTab} />

      {/* ── What actually matched, and what it does not mean ── */}
      {interactionsOpen && (
        <InteractionSheet
          interactions={interactions}
          onClose={() => setInteractionsOpen(false)}
        />
      )}

      {editing && (
        <ScheduleSheet
          entry={editing}
          onSave={(schedule) => saveSchedule(editing, schedule)}
          onForget={() => forget(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

// ── Sheets ─────────────────────────────────────────────────────────────────

const Sheet: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({
  label, onClose, children,
}) => (
  <div
    className="fixed inset-0 z-40 flex items-end"
    style={{ background: 'var(--scrim)' }}
    onClick={onClose}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="w-full bg-paper rounded-t-[24px] p-4 max-h-[85dvh] overflow-y-auto"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="w-10 h-1 rounded-full bg-paper-edge mx-auto mb-4" aria-hidden="true" />
      {children}
    </div>
  </div>
);

const InteractionSheet: React.FC<{ interactions: Interaction[]; onClose: () => void }> = ({
  interactions, onClose,
}) => {
  const { t } = useLocalization();
  return (
    <Sheet label={t('interactionsTitle')} onClose={onClose}>
      <h2 className="font-semibold text-[22px] leading-[1.3] text-ink m-0 mb-1">{t('interactionsTitle')}</h2>
      <p className="text-[15px] leading-[1.55] text-ink-soft m-0 mb-4">{t('interactionsLead')}</p>

      <div className="flex flex-col gap-2.5">
        {interactions.map((interaction) => (
          <div
            key={`${interaction.aName}-${interaction.bName}`}
            className="bg-surface rounded-[16px] p-4"
            style={{ border: '2px solid var(--clay-soft)' }}
          >
            <div className="font-semibold text-[16px] leading-[1.35] text-clay mb-1.5">
              <bdi>{interaction.aName} + {interaction.bName}</bdi>
            </div>
            <p className="text-[15px] leading-[1.55] text-clay-deep m-0">
              <bdi>{t('neverWithLabel')}: {interaction.warning}</bdi>
            </p>
          </div>
        ))}
      </div>

      {/* The limit of the check, stated where it is being relied on. */}
      <p className="text-[13px] leading-[1.6] text-ink-soft mt-4 mb-0">{t('interactionsCaveat')}</p>

      <button
        type="button"
        onClick={onClose}
        className="w-full h-[52px] rounded-full bg-teal font-semibold text-[16px] text-teal-on
          mt-4 active:scale-[0.98] transition-transform"
      >
        {t('gotIt')}
      </button>
    </Sheet>
  );
};

const ScheduleSheet: React.FC<{
  entry: SavedMedication;
  onSave: (schedule: MedicationSchedule) => void;
  onForget: () => void;
  onClose: () => void;
}> = ({ entry, onSave, onForget, onClose }) => {
  const { t } = useLocalization();
  const [times, setTimes] = useState<string[]>(entry.schedule?.times ?? EMPTY_SCHEDULE.times);
  const [note, setNote] = useState(entry.schedule?.note ?? '');
  const [adding, setAdding] = useState('');

  const addTime = () => {
    if (!/^\d{2}:\d{2}$/.test(adding) || times.includes(adding)) {
      setAdding('');
      return;
    }
    setTimes([...times, adding].sort());
    setAdding('');
  };

  return (
    <Sheet label={t('whenToTakeIt')} onClose={onClose}>
      <h2 className="font-semibold text-[22px] leading-[1.3] text-ink m-0 mb-1">
        <bdi>{displayNameOf(entry)}</bdi>
      </h2>
      <p className="text-[15px] leading-[1.55] text-ink-soft m-0 mb-4">{t('scheduleLead')}</p>

      <div className="flex flex-wrap gap-2 mb-3" data-testid="schedule-times">
        {times.map((time) => (
          <button
            key={time}
            type="button"
            onClick={() => setTimes(times.filter((other) => other !== time))}
            aria-label={`${t('removeTime')} ${time}`}
            className="font-mono font-medium text-[14px] text-teal bg-teal-wash rounded-full
              py-2 px-3.5 flex items-center gap-2 active:scale-95 transition-transform"
          >
            {time}
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="time"
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          aria-label={t('addTime')}
          className="flex-1 h-[52px] rounded-[14px] bg-surface border border-paper-sand px-4
            text-[16px] text-ink outline-none"
        />
        <button
          type="button"
          onClick={addTime}
          className="h-[52px] px-5 rounded-[14px] bg-selected font-semibold text-[15px] text-selected-fg
            active:scale-[0.98] transition-transform"
        >
          {t('addTime')}
        </button>
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder={t('schedulePlaceholder')}
        aria-label={t('scheduleNote')}
        className="w-full h-[52px] rounded-[14px] bg-surface border border-paper-sand px-4
          text-[16px] text-ink outline-none placeholder:text-ink-soft mb-4"
      />

      <button
        type="button"
        onClick={() => onSave({ times, note })}
        className="w-full h-[54px] rounded-full bg-teal font-semibold text-[17px] text-teal-on
          active:scale-[0.98] transition-transform"
      >
        {t('save')}
      </button>
      <button
        type="button"
        onClick={onForget}
        className="w-full h-[52px] rounded-full bg-transparent font-medium text-[16px] text-clay
          mt-2 active:scale-[0.98] transition-transform"
      >
        {t('removeFromMyMedicines')}
      </button>
    </Sheet>
  );
};
