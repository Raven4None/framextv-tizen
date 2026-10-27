#!/usr/bin/env bash
set -euo pipefail

TV_IP="${1:-192.168.100.178:5555}"
PORT="${PORT:-7000}"

echo "🔗 Conectando por ADB a $TV_IP..."
adb connect "$TV_IP"

echo "🚇 Configurando túnel reverso ADB (TV 127.0.0.1:$PORT -> PC localhost:$PORT)..."
adb -s "$TV_IP" reverse "tcp:$PORT" "tcp:$PORT"

echo "📺 Abriendo Stremio en la TV con el Addon FrameXTV..."
adb -s "$TV_IP" shell "am start -a android.intent.action.VIEW -d 'stremio://127.0.0.1:$PORT/manifest.json' com.stremio.one"

echo "✅ Comando enviado a la TV."
