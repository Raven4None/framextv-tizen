# FrameXTV — Smart TV Edition (Android TV & Samsung Tizen)

Cliente Smart TV (D-Pad / 10-foot UI) y Addon Stremio de alto rendimiento para **FrameXTV**, compatible con **Android TV** (Hisense, Sony, TCL, Chromecast, Xiaomi) y **Samsung Tizen OS**.

## ✨ Características Principales

- **⚡ Ordenamiento por Latencia Real (Auto-Fastest TTFB):**
  Mide en paralelo el *Time-To-First-Byte* (TTFB) de cada servidor antes de responder y autoselecciona el stream más rápido como opción principal (`⚡ Recomendado · <ms> ms`).
- **🚫 Bloqueo Estricto de Baja Calidad y Grabaciones de Cine (CAM):**
  Descarta automáticamente cualquier fuente `≤ 480p` (`360p`, `480p`, `SD`) tanto por etiqueta como inspeccionando las resoluciones reales del manifiesto HLS (`RESOLUTION=`), además de bloquear grabaciones de cine (`CAM`, `HDCAM`, `TS`, `Telesync`, `Telecine`, `Screener`).
- **🇺🇸 Audio en Inglés + 🇲🇽 Subtítulos Español Latino Priorizados:**
  Selecciona automáticamente la pista de audio en **Inglés** (`eng`) en streams multi-audio y clasifica en primer lugar los subtítulos en **Español Latinoamérica** (`es-419` / `spl` / `latino`), activándolos de forma predeterminada.
- **🎬 Nombres de Servidores Limpios:**
  Etiquetas estandarizadas (`🎬 CineJoy 4K (Nebula)`, `🎬 CineJoy 4K (Lisbon)`, `⚡ Servidor NFlix`, `🎬 Servidor Dragon`, `🎬 Servidor Titan`, `🎬 Servidor Bowler`, `🎬 Servidor Archer`).
- **🎮 Interfaz 10-Foot con Navegación D-Pad:**
  Soporte completo para control remoto de TV (flechas direccionales, `OK/Enter`, `Back/Return`, teclas multimedia `Play/Pause/FF/RW`).

## 🚀 Uso Rápido

```bash
npm install
npm start
```

- **Smart TV Web App (10-foot UI):** `http://localhost:7000/tv`
- **Stremio Addon Manifest:** `http://localhost:7000/manifest.json`

## 📺 Despliegue en Android TV (ADB)

```bash
./scripts/deploy-tv.sh 192.168.100.178:5555
```

## 📦 Empaquetado para Samsung Tizen (`.wgt`)

El proyecto incluye `config.xml` con los privilegios `tv.inputdevice` e `internet` listos para Tizen Studio / `tizen package -t wgt`.
