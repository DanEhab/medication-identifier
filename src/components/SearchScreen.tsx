import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalization } from '../context/LanguageContext';
import { getRecentSearches } from '../lib/recentSearches';
import {
  localSuggestions,
  remoteSuggestions,
  mergeSuggestions,
  MIN_QUERY_LENGTH,
  type Suggestion,
} from '../services/suggestService';

/**
 * The typed path, first-class.
 *
 * Typing was previously a card below two photo buttons, on a screen that also
 * carried a patient details form and a disclaimer. It is how anybody searches
 * for a medicine they have already had once, so it gets the whole screen and
 * the keyboard opens on arrival.
 *
 * Suggestions come from the phone first — saved medicines and recent searches,
 * instant and offline — then from medicines the app has answered for before.
 * Neither is required: a name nobody has ever searched still works.
 */

interface SearchScreenProps {
  /** Runs the lookup. The image argument is always null on this path. */
  onIdentify: (image: File | null, drugName: string) => void;
  /** Back to the camera. */
  onBack: () => void;
  error: string | null;
}

const DEBOUNCE_MS = 250;

const ChevronBack: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink rtl:rotate-180">
    <path d="m15 5-7 7 7 7" />
  </svg>
);

const SearchIcon: React.FC<{ color?: string }> = ({ color = 'var(--ink-soft)' }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke={color}
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </svg>
);

const ChevronForward: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft shrink-0 rtl:rotate-180">
    <path d="m9 5 7 7-7 7" />
  </svg>
);

const ScanHintIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="text-teal shrink-0">
    <path d="M4 8V6a2 2 0 0 1 2-2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M20 16v2a2 2 0 0 1-2 2h-2" />
    <path d="M8 20H6a2 2 0 0 1-2-2v-2" />
    <path d="M9 12h6" />
  </svg>
);

const ClearIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-soft">
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);

/**
 * Shows which part of the name the typing has already matched, so a long list
 * can be scanned without reading every row in full.
 */
const Highlighted: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const needle = query.trim().toLowerCase();
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <strong className="font-semibold">{text.slice(at, at + needle.length)}</strong>
      {text.slice(at + needle.length)}
    </>
  );
};

export const SearchScreen: React.FC<SearchScreenProps> = ({ onIdentify, onBack, error }) => {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recents = useMemo(() => getRecentSearches(), []);

  // The whole screen exists to be typed into, so it starts ready to type into.
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, []);

  const savedLabel = t('savedLabel');
  const recentLabel = t('recentLabel');

  const local = useMemo(
    () => localSuggestions(query, savedLabel, recentLabel),
    [query, savedLabel, recentLabel],
  );

  // Debounced, and abandoned when the typing moves on, so an answer for
  // "ator" can never land after the answer for "atorvas".
  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setRemote([]);
      return;
    }
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      const found = await remoteSuggestions(query, controller.signal);
      if (!controller.signal.aborted) setRemote(found);
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(id);
    };
  }, [query]);

  const suggestions = useMemo(() => mergeSuggestions(local, remote), [local, remote]);

  const search = useCallback(
    (term: string) => {
      const cleaned = term.trim();
      if (!cleaned) return;
      inputRef.current?.blur();
      onIdentify(null, cleaned);
    },
    [onIdentify],
  );

  // Kept on screen while typing, as the design has it: it is the fastest way
  // to jump to a different medicine somebody looks up often, and losing it the
  // moment a suggestion appears would take that away mid-thought.
  const showRecents = recents.length > 0;

  return (
    <div className="flex flex-col bg-paper" style={{ minHeight: '100dvh' }}>
      {/* ── Back, and the field ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={onBack} aria-label={t('backToSearch')} className="active:scale-90 transition-transform shrink-0">
          <ChevronBack />
        </button>
        <form
          // min-w-0 as well as flex-1: a flex item will not shrink below its
          // content without it, so a placeholder longer than the English one
          // pushed the whole row off the edge. Arabic showed it first.
          className="flex-1 min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            search(query);
          }}
        >
          <div className="h-12 rounded-full bg-surface border border-paper-sand flex items-center gap-2.5 px-4">
            <SearchIcon />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[17px] text-ink
                placeholder:text-ink-soft [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label={t('clearSearch')}
                className="shrink-0 active:scale-90 transition-transform"
              >
                <ClearIcon />
              </button>
            )}
          </div>
        </form>
      </div>

      {error && (
        <div className="px-5 pb-1">
          <div className="bg-clay-wash rounded-[14px] py-3 px-4">
            <p className="text-[15px] leading-[1.5] text-clay-deep m-0">{error}</p>
          </div>
        </div>
      )}

      {/* ── Suggestions ── */}
      {suggestions.length > 0 && (
        <ul className="pt-2 list-none m-0 p-0" role="listbox" aria-label={t('suggestionsLabel')}>
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.source}-${suggestion.name}`}>
              <button
                type="button"
                onClick={() => search(suggestion.name)}
                className="w-full py-3.5 px-5 border-b border-paper-deep flex items-center justify-between gap-3
                  text-start active:bg-paper-deep transition-colors"
              >
                <span className="min-w-0">
                  <span className="block text-[17px] leading-[1.3] text-ink truncate">
                    <bdi><Highlighted text={suggestion.name} query={query} /></bdi>
                  </span>
                  {suggestion.detail && (
                    <span className="block text-[14px] leading-[1.35] text-ink-soft truncate mt-0.5">
                      <bdi>{suggestion.detail}</bdi>
                    </span>
                  )}
                </span>
                <ChevronForward />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Typing something nobody has searched before is normal, not an error,
          so the way to run it anyway is always on screen. */}
      {query.trim().length >= MIN_QUERY_LENGTH && suggestions.length === 0 && (
        <div className="px-5 pt-4">
          <button
            type="button"
            onClick={() => search(query)}
            className="w-full h-[52px] rounded-full bg-teal flex items-center justify-center gap-2.5
              font-semibold text-[16px] text-teal-on active:scale-[0.98] transition-transform"
          >
            <SearchIcon color="var(--on-teal)" />
            {t('searchFor')} <bdi>“{query.trim()}”</bdi>
          </button>
        </div>
      )}

      {/* ── What this person looked up before ── */}
      {showRecents && (
        <div className="px-5 pt-[22px]">
          <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-ink-soft mb-3">
            {t('youLookedUpRecently')}
          </div>
          <div className="flex flex-wrap gap-2">
            {recents.map((recent) => (
              <button
                key={recent}
                type="button"
                onClick={() => search(recent)}
                className="font-medium text-[15px] text-ink bg-surface border border-paper-sand
                  rounded-full py-[9px] px-3.5 active:scale-[0.97] transition-transform"
              >
                <bdi>{recent}</bdi>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── The way back to the camera ── */}
      <div className="px-5 pt-6">
        <button
          type="button"
          onClick={onBack}
          className="w-full bg-teal-wash rounded-[16px] py-4 px-[18px] flex gap-3 items-start
            text-start active:scale-[0.99] transition-transform"
        >
          <ScanHintIcon />
          <p className="text-[15px] leading-[1.55] text-ink m-0">{t('cannotSpellIt')}</p>
        </button>
      </div>
    </div>
  );
};
