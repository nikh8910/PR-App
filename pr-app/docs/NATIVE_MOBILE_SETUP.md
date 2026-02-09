# How to Build a Native Mobile App (Android/iOS)

This project is ready to be converted into a Native Mobile Application using [Capacitor](https://capacitorjs.com/).

## Prerequisites
- **Node.js**: Installed (v18+ recommended).
- **Android Studio**: For building Android apps.
- **Xcode**: For building iOS apps (Mac only).

## 1. Initialize Capacitor
Run the following commands in your project root:

```bash
# Install Capacitor core and CLI
npm install @capacitor/core @capacitor/cli

# Initialize Capacitor config (Accept defaults or customize Name/ID)
npx cap init "SAP PR App" "com.example.sappr"

# Install Mobile Platforms
npm install @capacitor/android @capacitor/ios

# Add Platforms
npx cap add android
npx cap add ios
```

## 2. Configure Build Settings
Ensure your `vite.config.js` builds to the default `dist` folder (already standard).

Open `capacitor.config.json` (created after init) and ensure the `webDir` matches your build output:

```json
{
  "appId": "com.example.sappr",
  "appName": "SAP PR App",
  "webDir": "dist",
  "server": {
    "androidScheme": "https"
  }
}
```

## 3. Build and Sync
Every time you change your React code, you must build and sync to the native projects:

```bash
# 1. Build your React App
npm run build

# 2. Sync changes to Android/iOS folders
npx cap sync
```

## 4. Open in Native IDE

### Android
```bash
npx cap open android
```
This opens **Android Studio**. Wait for Gradle sync to finish. Connect your phone via USB (Debugging enabled) and click the **Run (Play)** button.

### iOS (Mac Only)
```bash
npx cap open ios
```
This opens **Xcode**. Connect your iPhone, select your Team/Signing profile, and click **Run**.

## Camera Permissions
For the Barcode Scanner to work natively, you may need to add permission strings:

**Android (`android/app/src/main/AndroidManifest.xml`):**
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

**iOS (`ios/App/App/Info.plist`):**
Add `Privacy - Camera Usage Description`: "We need camera access to scan barcodes."
