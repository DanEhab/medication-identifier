# Android Build Instructions

## ✅ Completed Setup

1. **Web app built successfully** → `dist/` folder contains production build
2. **Capacitor synced** → Android project updated with latest web assets
3. **API error handling enhanced** → Now shows which API key was used (last 6 chars)

## 🔧 Building Android APK

### Option 1: Using Android Studio (Recommended)

The Android project has been opened in Android Studio. To build:

1. **Wait for Gradle sync to complete** (status bar at bottom)
2. **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

### Option 2: Command Line (Requires JDK Setup)

If you want to build from terminal, you need JDK installed:

#### Install JDK:
1. Download from: https://adoptium.net/ (Temurin JDK 17)
2. Or install via Chocolatey: `choco install microsoft-openjdk17`

#### Set JAVA_HOME:
```powershell
# Temporary (current session)
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

# Permanent (add to system environment variables)
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot', [System.EnvironmentVariableTarget]::Machine)
```

#### Build APK:
```bash
cd android
.\gradlew assembleDebug
```

## 📱 Testing the App

### Install APK on Device/Emulator:
```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Or drag & drop APK to emulator
```

### Run directly from Android Studio:
1. Select device/emulator from dropdown
2. Click ▶️ Run button

## 🔍 API Key Verification

The app now includes enhanced error messages. If a quota error occurs, you'll see:
```
API Error: [Quota exceeded] [API Key: ...tLscI]
```

This helps verify the correct API key is being used:
- **Expected:** `...tLscI` (your PAID key)
- **If different:** Check `GEMINI_API_KEY` environment variable in Vercel

## 📂 Project Structure

```
android/
├── app/
│   ├── build/
│   │   └── outputs/
│   │       └── apk/
│   │           └── debug/
│   │               └── app-debug.apk  ← Your built APK
│   └── src/
│       └── main/
│           └── assets/
│               └── public/  ← Web app files (synced)
└── build.gradle
```

## ⚠️ Troubleshooting

### Gradle Sync Failed
- **File** → **Invalidate Caches and Restart**
- Check internet connection (downloads dependencies)

### NDK Missing
- Usually not needed for this project
- If prompted: **Tools** → **SDK Manager** → **SDK Tools** → Check **NDK**

### Build Failed
- Clean: `.\gradlew clean`
- Rebuild: `.\gradlew assembleDebug`

## 🚀 Next Steps

1. **Test the APK** on a physical device or emulator
2. **Deploy to Vercel** with the API key environment variable
3. **Monitor API usage** in Google AI Studio

Your medication identifier app is ready for Android! 📱💊
