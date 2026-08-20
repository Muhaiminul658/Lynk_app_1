# 🚀 Lynk Flutter Android App

This is the complete **Flutter** codebase for **Lynk** with native push notifications, custom notification sounds (`notification_sound.mp3`), background FCM handlers, and hardware-accelerated WebView.

---

## 📦 Project Structure
- `lib/main.dart` — Flutter entry point with full WebView wrapper, Firebase Cloud Messaging, local notification manager, and custom sound channel.
- `pubspec.yaml` — Flutter dependencies (`webview_flutter`, `firebase_messaging`, `flutter_local_notifications`, `permission_handler`, etc.).
- `android/app/src/main/res/raw/notification_sound.mp3` — Bundled custom notification sound for Android alerts.
- `android/app/src/main/AndroidManifest.xml` — Android permissions (Camera, Mic, Storage, Notifications, Deep Linking).

---

## ⚡ 1-Step Build Commands

### Step 1: Install Dependencies
```bash
cd flutter_app
flutter pub get
```

### Step 2: Add Firebase Config
Place your `google-services.json` file from Firebase Console into:
```
flutter_app/android/app/google-services.json
```

### Step 3: Build the Android APK
```bash
# Build universal release APK
flutter build apk --release
```

Once finished, the compiled APK will be located at:
```
build/app/outputs/flutter-apk/app-release.apk
```

You can copy `app-release.apk` straight to any Android phone to install!
