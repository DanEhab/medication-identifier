import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.medication.app',
  appName: 'Medication Identifier',
  webDir: 'dist',
  server: {
    // Allow navigation to external URLs (your Vercel backend)
    allowNavigation: ['https://medication-identifier-gamma.vercel.app']
  }
};

export default config;
