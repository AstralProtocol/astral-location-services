# React Native mobile example

Minimal React Native app that requests location, calls Astral `within()` with the device coordinates, and displays the result. Onchain submission can be added via WalletConnect or similar.

## Setup

```bash
cd developer-templates/examples/mobile
npm install
# Or yarn / pnpm
```

Configure:

- `API_URL` – Astral API base (e.g. `https://api.astral.global`)
- `CHAIN_ID` – e.g. 84532
- `RESOLVER_SCHEMA_UID` – boolean schema UID

For location you need a React Native geolocation library (e.g. `react-native-geolocation-service` or Expo `expo-location`). This folder is a stub; implement the app using the same pattern as the [frontend example](../frontend): create Astral compute client, call `within(userCoords, targetUid, radius, { schema, recipient })`, then show the result or submit via wallet.

## Pattern

1. Request location permission and get coordinates.
2. `createAstralCompute({ apiUrl, chainId }).within(point, landmarkUid, radius, { schema, recipient })`.
3. Display `result.result` and optionally build delegated attestation and submit (with wallet connect).

See the [E2E workflow](../e2e-workflow) for a Node script that performs compute + submit without UI.
