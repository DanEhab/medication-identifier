/**
 * Who the medicines belong to.
 *
 * People look medicines up for other people — a parent, a child, someone they
 * care for — and a single mixed list is both harder to read and, once it starts
 * warning about interactions, actively misleading: two medicines only interact
 * if the same person takes both.
 *
 * Stays on the device. These are names of people and the medicines they take.
 */

const PROFILES_KEY = 'profiles';
const ACTIVE_KEY = 'activeProfile';

export interface Profile {
  id: string;
  name: string;
}

/** Everyone starts with one, so the list is never empty and nothing to migrate. */
export const DEFAULT_PROFILE_ID = 'me';

const defaultProfile = (name: string): Profile => ({ id: DEFAULT_PROFILE_ID, name });

const read = (): Profile[] => {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Profile =>
        Boolean(entry && typeof entry.id === 'string' && typeof entry.name === 'string' && entry.name.trim()))
      .map((entry) => ({ id: entry.id, name: entry.name.trim() }));
  } catch {
    return [];
  }
};

const write = (profiles: Profile[]): Profile[] => {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  } catch {
    /* Private mode or storage disabled — the default profile still works. */
  }
  return profiles;
};

/**
 * `meLabel` is passed in rather than imported, because this module has no
 * business knowing which language the app is being read in.
 */
export const getProfiles = (meLabel: string): Profile[] => {
  const stored = read();
  return stored.length > 0 ? stored : [defaultProfile(meLabel)];
};

export const getActiveProfileId = (): string => {
  try {
    return localStorage.getItem(ACTIVE_KEY) || DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
};

export const setActiveProfileId = (id: string): void => {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* The active profile falls back to the first one. */
  }
};

export const addProfile = (name: string, meLabel: string): Profile[] => {
  const cleaned = name.trim();
  if (!cleaned) return getProfiles(meLabel);

  const existing = getProfiles(meLabel);
  if (existing.some((profile) => profile.name.toLowerCase() === cleaned.toLowerCase())) {
    return existing;
  }
  // Time-based rather than a counter, so deleting one cannot hand its id to
  // the next person added and silently give them somebody else's medicines.
  const profile: Profile = { id: `p${Date.now().toString(36)}`, name: cleaned };
  return write([...existing, profile]);
};

/**
 * Removes a profile. The default one stays, because something has to own the
 * medicines saved before anybody thought about profiles.
 */
export const removeProfile = (id: string, meLabel: string): Profile[] => {
  if (id === DEFAULT_PROFILE_ID) return getProfiles(meLabel);
  const remaining = getProfiles(meLabel).filter((profile) => profile.id !== id);
  if (getActiveProfileId() === id) setActiveProfileId(DEFAULT_PROFILE_ID);
  return write(remaining);
};

/** The single letter shown in the pill. */
export const initialFor = (name: string): string => (name.trim()[0] || '?').toUpperCase();
