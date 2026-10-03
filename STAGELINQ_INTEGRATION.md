# StageLinQ integration status — AI DJ Assistant

## What this update changes

- Adds an Android Capacitor plugin named `StageLinq`.
- Adds Android Wi-Fi/network permissions and multicast-lock handling.
- Adds a StageLinQ status card in Settings.
- Updates GitHub Actions so the custom native Java files are copied into the generated Android project before APK compilation.
- Leaves the existing recommendation engine and user interface flows intact.

## Important: current implementation status

This is an **integration scaffold**, not a completed StageLinQ client. It does not yet perform the StageLinQ UDP discovery handshake, Directory negotiation, StateMap subscriptions, BeatInfo streaming, or Engine Library/FileTransfer database retrieval. The UI deliberately reports this instead of inventing a connected device or track.

StageLinQ is a reverse-engineered protocol. A working client needs correct device announcements, identity/token handling, directory negotiation, service connections, and protocol framing. Do not treat a successful APK build or the Wi-Fi multicast lock as proof that the Prime 4+ is connected.

## Network setup for the intended deployment

1. Connect the Android phone and Denon Prime 4+ to the same router and same LAN/subnet.
2. Disable guest Wi-Fi/client isolation on the router.
3. Allow local-network traffic between Wi-Fi clients.
4. Keep the Prime 4+ awake and Engine DJ running.
5. In app Settings, use **SPRAWDŹ MODUŁ** to verify the native scaffold and **PRZYGOTUJ WI-FI** to acquire Android's multicast lock.

## Next engineering milestone

Implement and test the protocol layer against a real Prime 4+:
1. UDP discovery on the StageLinQ discovery port.
2. Device directory handshake and service discovery.
3. StateMap subscriptions for deck track metadata and playback state.
4. BeatInfo stream for BPM/beat updates.
5. FileTransfer/Engine Library database access, only where the device exposes it.
6. A Capacitor event bridge to send live track changes into `www/index.html`.
7. Feed confirmed live track metadata into the existing ranking engine and add network-backed metadata enrichment with source attribution and caching.

## Sources and licensing

Community implementations to study:
- https://github.com/chrisle/StageLinq
- https://github.com/honusz/stagelinq-js
- https://github.com/icedream/go-stagelinq

Review and preserve the license of any code copied or adapted from those projects. This repository update does not copy their protocol implementation.
