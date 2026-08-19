# 📱 Lynk Native Android APK & Pusher Beams Push Notification Guide

This project is configured with **Capacitor.js** (`@capacitor/core`, `@capacitor/android`, `@capacitor/push-notifications`) to package the **Lynk** web application into a native Android APK with background push notification sounds via **Pusher Beams** and **Firebase Cloud Messaging (FCM)**.

---

## 🔑 Pusher Beams Credentials Configured
- **Instance ID**: `71cf24d7-5e54-48d2-a980-2bd7495d6ef2`
- **Secret Key**: `1F8FCAB9D92DB920B3137EBFF0F86940F98478C8F96C808D2491D529866947EA`
- **App ID / Package Name**: `com.lynk.app`
- **App Name**: `Lynk`

---

## 🛠️ Step-by-Step Android APK Build Instructions

### 1. Build Web Assets and Synchronize Capacitor
Run the following commands in your project root:

```bash
# Build the production web bundle into dist/
npm run build

# Synchronize plugins and assets into the Android native project
npx cap sync android
```

---

### 2. Add Firebase `google-services.json` (Required for FCM & Background Push)
1. Go to the [Firebase Console](https://console.firebase.google.com/) under your project.
2. In Project Settings, under **Your apps**, ensure an Android app exists with Package name: `com.lynk.app`.
3. Download the `google-services.json` file.
4. Place `google-services.json` into:
   ```
   android/app/google-services.json
   ```
5. In Pusher Beams Dashboard:
   - Go to your Instance (`71cf24d7-5e54-48d2-a980-2bd7495d6ef2`) -> **Settings** -> **FCM Configuration**.
   - Upload your Firebase Service Account Private Key JSON file.

---

### 3. Add Custom Notification Sound File for Native Background Alerts
To ensure custom sound (`notification_sound`) plays when the app is completely closed or running in the background:
1. Create a `raw` directory in Android resources if it doesn't exist:
   ```
   android/app/src/main/res/raw/
   ```
2. Place your notification sound file (`.mp3` or `.wav`) named **`notification_sound.mp3`** (or `notification_sound.wav`) in:
   ```
   android/app/src/main/res/raw/notification_sound.mp3
   ```

---

### 4. Open in Android Studio & Generate APK

```bash
# Open Android project in Android Studio
npx cap open android
```

Inside **Android Studio**:
1. Wait for Gradle Sync to finish.
2. To test on an emulator or connected physical phone: Click the green **Run** ▶️ button.
3. To generate the release or debug APK file:
   - Go to top menu: **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**.
   - Once build completes, click **locate** to find `app-debug.apk` or `app-release.apk`.
   - Install the APK directly on your Android device!

---

## 🎵 How Custom Notification Sounds Work

1. **When App is Completely Closed / Background**:
   - Pusher Beams delivers the notification through Android FCM.
   - The Android system plays the native audio file bundled in `android/app/src/main/res/raw/notification_sound.mp3` via the high-importance notification channel `lynk_notifications`.

2. **When App is Open in Foreground**:
   - Capacitor's `@capacitor/push-notifications` listener intercepts the push event in `src/sound-manager.js`.
   - `SoundManager.playNotificationSound()` automatically synthesizes the distinct "Pu-Tung!" chime via Web Audio API and displays the in-app popup banner.
