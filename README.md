# Home Server

Self-hosted home dashboard for a Raspberry Pi: smart home, network, local DNS
with ad blocking, AI chat, and a HomeKit bridge.

- `server/` – Go backend, serves the built UI
- `web/` – React UI
- `agent/` – small agent for GPU machines
- `caddy/` – HTTPS proxy

## Run

```sh
task server:dev        # API on :8080
cd web && yarn dev     # UI on :5173
```

First start prints a one-time `admin` password. Needs Go, Yarn 4 and [Task](https://taskfile.dev).

## Deploy

```sh
task deploy
```

## Secrets

None in the repo. Keys, tokens and pairing data live in `DATA_DIR`
(`server/.data` locally). Set your own `HOMEKIT_PIN`.
