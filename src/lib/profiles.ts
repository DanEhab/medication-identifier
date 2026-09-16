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

/**
 * How many people one phone can hold, counting the default one.
 *
 * Ten covers a household and anybody they care for. It is not a technical
 * limit — the list is a few hundred bytes — it is a interface one: the pills
 * wrap across the top of the saved list, and past ten rows of them the screen
 * is mostly a list of names with the medicines pushed off the bottom.
 */
export const MAX_PROFILES = 10;

/**
 * How long a name may be.
 *
 * Long enough for "Grandma Fatima", short enough that the pill stays a pill.
 * Names are only ever shown inside one, so a name that cannot fit in one is a
 * name that will be read as an ellipsis.
 */
export const MAX_PROFILE_NAME = 24;

/** Why a name was refused, so the screen can say which. */
export type AddProfileError = 'empty' | 'duplicate' | 'full';

export interface AddProfileResult {
  profiles: Profile[];
  /** The profile that was created, when one was. */
  created?: Profile;
  error?: AddProfileError;
}

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

/**
 * Adds a person, or says why not.
 *
 * It used to return the unchanged list when a name was empty, a duplicate, or
 * anything else it did not like — which the screen could not tell apart from
 * success, so the input simply closed and nothing happened. Refusing out loud
 * is the whole difference between a limit and a bug.
 */
export const addProfile = (name: string, meLabel: string): AddProfileResult => {
  const existing = getProfiles(meLabel);
  const cleaned = name.trim().replace(/\s+/g, ' ').slice(0, MAX_PROFILE_NAME);

  if (!cleaned) return { profiles: existing, error: 'empty' };

  // Case-insensitive, so "Hana" and "hana" are one person. Two people who
  // really are both called Hana need telling apart anyway, and the app cannot
  // do it for them.
  if (existing.some((profile) => profile.name.toLowerCase() === cleaned.toLowerCase())) {
    return { profiles: existing, error: 'duplicate' };
  }

  if (existing.length >= MAX_PROFILES) {
    return { profiles: existing, error: 'full' };
  }

  // Time-based rather than a counter, so deleting one cannot hand its id to
  // the next person added and silently give them somebody else's medicines.
  const profile: Profile = { id: `p${Date.now().toString(36)}`, name: cleaned };
  return { profiles: write([...existing, profile]), created: profile };
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
