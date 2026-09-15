import { useEffect } from 'react';
import { App } from '@capacitor/app';

/**
 * The Android back button.
 *
 * Without this it closed the app. Not "went back to the camera" — closed it,
 * from the middle of reading a medicine, which is the worst possible moment
 * because the answer took a network round trip to produce. Capacitor's default
 * `onBackPressed` finishes the activity; it does not consult the WebView's
 * history, which was confirmed on a device by pushing a history entry and
 * pressing the key: the entry was still there and the process was gone.
 *
 * So the handler has to say what back means on each screen, and say explicitly
 * when it means "leave". The rule the rest of Android follows: back undoes the
 * last navigation, and from the first screen it exits.
 *
 * `onBack` is called on every press except on the home screen. Returning true
 * means it was handled; returning false lets the app close.
 */
export function useHardwareBack(onBack: () => boolean): void {
  useEffect(() => {
    let remove: (() => void) | undefined;

    /*
      addListener resolves to the handle asynchronously, so the effect can be
      torn down before it arrives. Removing it in that case matters: a stale
      handler closes over an old view and sends back to the wrong screen.
    */
    let cancelled = false;
    void App.addListener('backButton', () => {
      if (!onBack()) void App.exitApp();
    }).then((handle) => {
      if (cancelled) void handle.remove();
      else remove = () => void handle.remove();
    }).catch(() => {
      /* Not on a device — the browser has no hardware back button. */
    });

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [onBack]);
}
