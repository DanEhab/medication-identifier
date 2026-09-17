import { useCallback, useEffect, useState } from 'react';
import { useLocalization } from '../context/LanguageContext';
import {
  syncReminders, requestReminderPermission, reminderPermission, pendingReminders,
  type ReminderPermission,
} from '../lib/reminders';

/**
 * The reminders, wired to the language the app is being read in.
 *
 * The words a notification arrives in are decided when it is scheduled, not
 * when it fires, so switching language has to rebuild the lot — otherwise the
 * Arabic reader keeps being told "Time for Panadol" in English until they
 * happen to edit a time.
 */
export function useReminders({ syncOnMount = false }: { syncOnMount?: boolean } = {}) {
  const { t, language } = useLocalization();
  const meLabel = t('profileMe');

  const [permission, setPermission] = useState<ReminderPermission>('unavailable');
  const [scheduled, setScheduled] = useState(0);

  const words = useCallback(() => ({
    title: (medicine: string) => t('reminderTitle').replace('{medicine}', medicine),
    body: (person: string | null) => (person
      ? t('reminderBodyFor').replace('{name}', person)
      : t('reminderBody')),
    channelName: t('reminderChannel'),
    channelDescription: t('reminderChannelWhat'),
  }), [t]);

  const rebuild = useCallback(async () => {
    const count = await syncReminders(words(), meLabel);
    setScheduled(count);
    setPermission(await reminderPermission());
    return count;
  }, [words, meLabel]);

  const askPermission = useCallback(async () => {
    const result = await requestReminderPermission();
    setPermission(result);
    return result;
  }, []);

  /*
    Reading the state is safe anywhere; rebuilding is not.

    Only one place asks for the rebuild — the app root — because rebuilding
    means cancelling everything and writing it again, and two screens doing
    that at once can interleave into a half-scheduled mess. Everywhere else
    just wants to know what is set, so it reads.

    The rebuild has to be at the root rather than on the screen that shows the
    times, too: a phone that was switched off, or updated, loses what was
    scheduled, and the only record that survives either is the saved list. If
    it only ran on the saved-medicines screen, somebody's reminders would come
    back when they next happened to look at the list — which is precisely when
    they do not need reminding.
  */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await reminderPermission();
      if (cancelled) return;
      setPermission(state);
      if (state === 'granted' && syncOnMount) await syncReminders(words(), meLabel);
      if (!cancelled) setScheduled(await pendingReminders());
    })();
    return () => { cancelled = true; };
  }, [language, words, meLabel, syncOnMount]);

  return { permission, scheduled, rebuild, askPermission };
}
