import { Capacitor } from '@capacitor/core';

/** Deployed backend, used by the native Android build. */
const PRODUCTION_API_URL = 'https://medication-identifier-gamma.vercel.app';

const configured = import.meta.env.VITE_API_BASE_URL?.trim();

/**
 * Base URL for API calls.
 *
 * - Browser (`npm run dev` and the Vercel web deploy): same-origin, so an empty
 *   base gives relative `/api/...` paths, which is what we want.
 * - Native Android: the bundle is served from `capacitor://localhost`, so a
 *   relative path would hit the local bundle instead of the backend. It must
 *   use an absolute URL.
 *
 * Override either case by setting VITE_API_BASE_URL at build time.
 */
export const API_BASE_URL = configured
  ? configured.replace(/\/$/, '')
  : Capacitor.isNativePlatform()
    ? PRODUCTION_API_URL
    : '';
