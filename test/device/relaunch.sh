#!/usr/bin/env bash
# Restarts the app and forwards its WebView debugger, waiting for both.
adb shell am force-stop com.danehab.medicationidentifier
adb forward --remove-all >/dev/null 2>&1
adb shell am start -n com.danehab.medicationidentifier/.MainActivity >/dev/null 2>&1
for i in $(seq 1 40); do
  SOCK=$(adb shell cat /proc/net/unix 2>/dev/null | grep -o 'webview_devtools_remote_[0-9]*' | sort -u | head -1)
  if [ -n "$SOCK" ]; then
    adb forward tcp:9333 localabstract:$SOCK >/dev/null 2>&1
    if curl -s --max-time 2 http://127.0.0.1:9333/json/list >/dev/null 2>&1; then
      echo "attached to $SOCK"
      exit 0
    fi
  fi
  sleep 0.25
done
echo "could not attach"; exit 1
