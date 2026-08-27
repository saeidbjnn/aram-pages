import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aram.planner',
  appName: 'آرام',
  webDir: 'www',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  }
};

export default config;
