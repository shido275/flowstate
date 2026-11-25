import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.flowstate.app',
  appName: 'Flowstate',
  webDir: 'dist',
  android: {
    // Matches the paper background so the WebView never flashes white.
    backgroundColor: '#f6f1e8',
  },
}

export default config
