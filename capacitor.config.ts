import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'nl.cloudplan.agenda',
  appName: 'AndrewsPlan',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT',
    },
    CapacitorHttp: {
      enabled: true,
    },
    GoogleAuth: {
      scopes: ['profile', 'email', 'https://www.googleapis.com/auth/calendar'],
      serverClientId: '610375690199-ekcg7lg3p4tgmg3vh5okkcnvn4s3tr41.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
  },
};

export default config;
