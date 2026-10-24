# Home Server

A self-hosted dashboard for a Raspberry Pi: smart home control, LAN devices
and router, local DNS with ad blocking, AI chat across your GPU machines, and
a HomeKit bridge.

## Folders

- `server/` – Go backend (API, DNS, HomeKit); serves the built UI
- `web/` – React UI
- `agent/` – tiny agent for GPU machines (stats, remote shutdown)
- `caddy/` – HTTPS proxy config

## Run locally

Needs Go 1.27, Node with Yarn 4, and [Task](https://taskfile.dev).

```sh
task server:dev        # API on :8080
cd web && yarn dev     # UI on :5173
```

The first start prints a one-time `admin` password.

## Deploy to the Pi

```sh
task deploy
```

## Check everything

```sh
task check
```
