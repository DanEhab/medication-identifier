import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getSavedMedications, type SavedMedication } from './medicationStorage';
import { getProfiles, DEFAULT_PROFILE_ID } from './profiles';

/**
 * Turning the times somebody wrote down into notifications that actually
 * arrive.
 *
 * The times were a note to self: typed in, shown back, and nothing more. What
 * a person saving "08:00" for their blood pressure tablet wants is to be told
 * at eight, so the whole list is mirrored into repeating daily notifications.
 *
 * Every one is scheduled by the app and every one is cancelled by the app.
 * There is no partial update: on any change the app's own notifications are
 * cleared and rebuilt from storage, because working out which single reminder
 * changed is how a cancelled medicine keeps going off at seven in the morning.
 */

/** What a reminder says, passed in so this module needs no opinion on language. */
export interface ReminderWords {
  /** The heading. Receives the medicine's name. */
  title: (medicine: string) => string;
  /** The line beneath. Receives the person's name, or nothing for the default. */
  body: (person: string | null) => string;
  /** What Android calls this category in its own notification settings. */
  channelName: string;
  channelDescription: string;
}

/**
 * Notification ids have to be 32-bit integers, and the same reminder has to
 * produce the same id every time or cancelling it becomes guesswork.
 *
 * A hash of profile + medicine + time gives that. Collisions would mean one
 * reminder silently replacing another, so the space is kept large and the
 * inputs are everything that distinguishes one reminder from another.
 */
const idFor = (profileId: string, drugName: string, time: string): number => {
  const key = `${profileId}|${drugName.trim().toLowerCase()}|${time}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Positive, and clear of the small numbers a hand-written test might use.
  return (Math.abs(hash) % 2000000000) + 1000;
};

/**
 * The channel a reminder arrives on.
 *
 * Its own, rather than the plugin's "default". On Android 8 and later the
 * channel — not the notification — decides whether anything is heard, and the
 * default one is created at IMPORTANCE_DEFAULT: it lands silently in the shade
 * with no banner. For a message that says "take your tablet" that is the same
 * as not arriving, which is exactly what it looked like.
 *
 * IMPORTANCE_HIGH is the level that makes a sound and shows a banner over
 * whatever is on screen. A person can still turn it down in Android settings —
 * the channel is the thing that gives them that control — but the app should
 * not choose silence on their behalf.
 *
 * The id is versioned because a channel's importance is fixed at creation:
 * Android ignores later changes, on the principle that once somebody has tuned
 * a channel the app does not get to tune it back. Changing the id is the only
 * way to ship a different default, and anyone who has already adjusted the old
 * one keeps their preference on it.
 */
const CHANNEL_ID = 'medication-reminders-v1';

/** Notifications only exist on a phone; the browser build simply does nothing. */
export const remindersAvailable = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

export const reminderPermission = async (): Promise<ReminderPermission> => {
  if (!remindersAvailable()) return 'unavailable';
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'granted') return 'granted';
    if (display === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
};

/**
 * Asks, once, and reports what the answer was.
 *
 * Android 13 requires this at runtime. Asking at the moment somebody sets a
 * time is the only place it makes sense: the request then arrives with an
 * obvious reason attached, rather than on launch before there is anything to
 * be reminded about.
 */
export const requestReminderPermission = async (): Promise<ReminderPermission> => {
  if (!remindersAvailable()) return 'unavailable';
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return 'granted';
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
};

const parseTime = (time: string): { hour: number; minute: number } | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
};

/** The name of the person a medicine belongs to, or null for the default one. */
const personFor = (entry: SavedMedication, meLabel: string): string | null => {
  if (!entry.profileId || entry.profileId === DEFAULT_PROFILE_ID) return null;
  const profile = getProfiles(meLabel).find((p) => p.id === entry.profileId);
  return profile ? profile.name : null;
};

/**
 * Rebuilds every reminder from what is saved.
 *
 * Called after anything that could change them: a schedule edited, a medicine
 * removed, a person removed, the language switched, and on launch — because a
 * phone that was off at the scheduled time, or updated, can lose them.
 *
 * Returns how many are now set, which is what the settings screen reports.
 */
export const syncReminders = async (words: ReminderWords, meLabel: string): Promise<number> => {
  if (!remindersAvailable()) return 0;

  try {
    /*
      Create the channel before anything is scheduled against it. Creating one
      that already exists is a no-op, so this is safe to call every time and
      cheaper than remembering whether it was done.
    */
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: words.channelName,
      description: words.channelDescription,
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
    }).catch(() => { /* Older Android has no channels and needs none. */ });

    // Clear the app's own first. Cancelling by the ids it is about to write
    // would leave behind anything scheduled under a name that has since
    // changed — a renamed person, a medicine saved under a different spelling.
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return 0;

    const wanted = [];
    for (const entry of getSavedMedications()) {
      const times = entry.schedule?.times ?? [];
      if (times.length === 0) continue;

      const medicine = (entry.drugInfo.brandName || entry.drugInfo.drugName || '').trim();
      if (!medicine) continue;
      const person = personFor(entry, meLabel);

      for (const time of times) {
        const at = parseTime(time);
        if (!at) continue;
        wanted.push({
          id: idFor(entry.profileId || DEFAULT_PROFILE_ID, entry.drugInfo.drugName, time),
          title: words.title(medicine),
          body: words.body(person),
          /*
            `on` without a day repeats daily at that hour and minute, which is
            what a dosing time is. allowWhileIdle gets it through Doze — a
            phone sitting on a bedside table overnight is exactly the case a
            morning tablet has to survive.

            isExactNotification must be false, and it is the whole reason this
            works at all. It defaults to true, and on Android 12 and up a true
            value with no exact-alarm permission does not fail: the plugin
            opens the system "Alarms & reminders" screen and waits for the user
            to come back, so the promise never settles and nothing is ever
            scheduled. This app deliberately does not take that permission —
            see the manifest — so it has to say so here.

            Inexact means the system may batch the alarm and deliver it a few
            minutes late, which for a daily tablet is the right trade against
            asking Google Play to approve a restricted capability.
          */
          schedule: { on: { hour: at.hour, minute: at.minute }, allowWhileIdle: true },
          isExactNotification: false,
          channelId: CHANNEL_ID,
          /*
            No smallIcon. The obvious thing to write here is the name from
            Capacitor's own example, ic_stat_icon_config_sample, which this app
            does not have — naming a drawable that does not exist is not a
            missing icon, it is a notification Android refuses to post. Left
            unset, the plugin falls back to the app icon.
          */
        });
      }
    }

    if (wanted.length > 0) await LocalNotifications.schedule({ notifications: wanted });
    return wanted.length;
  } catch (error) {
    // A phone that refuses to schedule still shows the times on screen, which
    // is what the app did before reminders existed.
    console.warn('[reminders] could not schedule:', (error as Error)?.message);
    return 0;
  }
};

/**
 * Whether the saved-medicines screen has to warn that times will not arrive.
 *
 * A pure decision rather than a condition buried in the markup, because it is
 * the thing that was wrong: a time set while notifications were refused was
 * saved, shown on the card, and silently never delivered. The rule is only
 * interesting in its corners — nothing to warn about when no time is set, and
 * nothing to warn about on a platform that has no notifications to refuse.
 */
export const shouldWarnRemindersOff = (
  permission: ReminderPermission,
  saved: { schedule?: { times?: string[] } }[],
): boolean => {
  if (permission === 'granted' || permission === 'unavailable') return false;
  return saved.some((entry) => (entry.schedule?.times?.length ?? 0) > 0);
};

/** Everything the app has scheduled, for reporting and for tests. */
export const pendingReminders = async (): Promise<number> => {
  if (!remindersAvailable()) return 0;
  try {
    const { notifications } = await LocalNotifications.getPending();
    return notifications.length;
  } catch {
    return 0;
  }
};

export const cancelAllReminders = async (): Promise<void> => {
  if (!remindersAvailable()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    if (notifications.length > 0) {
      await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) });
    }
  } catch {
    /* Nothing scheduled, or no plugin. */
  }
};
