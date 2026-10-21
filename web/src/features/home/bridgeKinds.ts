import {
  homeApi,
  type HomeBridge,
  type HomeBridgeKind,
  type HomeDeviceType,
} from '@/features/home/api';

/** Everything the add-bridge wizard collects. */
export interface BridgeForm {
  host: string;
  name: string;
  token: string;
  onUrl: string;
  offUrl: string;
  statusUrl: string;
  deviceType: HomeDeviceType;
}

export const EMPTY_BRIDGE_FORM: BridgeForm = {
  host: '',
  name: '',
  token: '',
  onUrl: '',
  offUrl: '',
  statusUrl: '',
  deviceType: 'plug',
};

interface BridgeKindInfo {
  label: string;
  blurb: string;
  /** Wizard steps: 1 host, 2 pairing / URLs, 3 review (HTTP has no review). */
  steps: 2 | 3;
  /** LAN IP example; absent when the kind has no host (HTTP). */
  hostPlaceholder?: string;
  namePlaceholder: string;
  hostTip: string;
  /** Step 2 instructions. */
  instructions: string[];
  token?: { label: string; placeholder: string; required: boolean };
  /** Server-side pairing that returns the token. */
  pair?: (f: BridgeForm, signal: AbortSignal) => Promise<string>;
  /** Shown while `pair` waits for a button press on the hub. */
  pairWaiting?: string;
  /** CLI fallback when in-app pairing fails. */
  manual?: { title: string; command: (host: string) => string; note: string };
}

export const BRIDGE_KINDS: Record<HomeBridgeKind, BridgeKindInfo> = {
  hue: {
    label: 'Philips Hue',
    blurb:
      'Hue lights, plugs and sensors on your network. Pairing uses the round link button on the bridge.',
    steps: 3,
    hostPlaceholder: '192.168.1.42',
    namePlaceholder: 'Living room Hue',
    hostTip:
      'Find the IP in the Hue app: Settings → My Hue System → tap the bridge.',
    instructions: [
      'Press the round link button on top of the Hue Bridge.',
      'Within 30 seconds, select Pair now. The bridge returns an application key.',
    ],
    token: {
      label: 'Application key',
      placeholder: '1028d66426293e821ecfd9ef1a0731df',
      required: true,
    },
    pair: (f, signal) => homeApi.pairHue(f.host.trim(), signal),
    manual: {
      title: 'Pair manually with curl',
      command: (host) =>
        `curl -X POST http://${host || '<bridge-ip>'}/api -d '{"devicetype":"home-server#dashboard"}'`,
      note: 'Press the link button first, then paste the success.username value as the application key.',
    },
  },
  dirigera: {
    label: 'IKEA DIRIGERA',
    blurb:
      'Tradfri lights, plugs, sensors and speakers through the IKEA hub. Pairing uses the action button under the hub.',
    steps: 3,
    hostPlaceholder: '192.168.1.50',
    namePlaceholder: 'IKEA hub',
    hostTip:
      "Find the IP in your router's DHCP table or in the IKEA Home smart app: Settings → Hubs.",
    instructions: [
      'Select Pair now. The home server opens a handshake with the hub.',
      'Within about 90 seconds, press the action button on the bottom of the hub once.',
      'The token appears below. It never expires.',
    ],
    token: {
      label: 'Bearer token',
      placeholder: 'eyJhbGciOiJSUzI1NiIs…',
      required: true,
    },
    pair: (f, signal) =>
      homeApi.pairDirigera(f.host.trim(), f.name.trim() || undefined, signal),
    pairWaiting: 'Waiting for the action button on the hub…',
    manual: {
      title: 'Pair manually from a terminal',
      command: (host) => `npx dirigera-auth --ip ${host || '<hub-ip>'}`,
      note: 'Run this on any computer with Node.js, then paste the token below.',
    },
  },
  webos: {
    label: 'LG webOS TV',
    blurb:
      'Shows whether your LG TV is on. Works while the TV is reachable on the network.',
    steps: 3,
    hostPlaceholder: '192.168.1.55',
    namePlaceholder: 'Living room TV',
    hostTip: 'On the TV: Settings → Network → Wi-Fi or Wired → IPv4 address.',
    instructions: [
      'Make sure the TV is on the same network as the home server.',
      'Leave the client key blank for on/off detection only.',
      'A client key from a paired LG remote app is stored for upcoming power and volume control.',
    ],
    token: {
      label: 'Client key (optional)',
      placeholder: 'Leave blank for status only',
      required: false,
    },
  },
  http: {
    label: 'HTTP switch',
    blurb:
      'Anything with on and off URLs: Shelly, Tasmota, ESPHome, Home Assistant REST switches.',
    steps: 2,
    namePlaceholder: 'Office plug',
    hostTip: 'The on and off URLs are set in the next step.',
    instructions: [
      'Find the on and off URLs your device exposes. Shelly Gen2: http://<ip>/relay/0?turn=on and …turn=off. Tasmota: http://<ip>/cm?cmnd=Power%20On.',
      'Optionally add a status URL whose response contains "on", "true" or "1" while the device is on.',
      'Pick the device type so the dashboard shows the right control.',
    ],
  },
};

/** Whether the wizard may leave `step` with the form as filled in. */
export function canAdvance(
  kind: HomeBridgeKind,
  step: number,
  f: BridgeForm,
): boolean {
  const k = BRIDGE_KINDS[kind];
  if (step === 1) return !k.hostPlaceholder || f.host.trim() !== '';
  if (step === 2 && kind === 'http')
    return f.onUrl.trim() !== '' && f.offUrl.trim() !== '';
  if (step === 2 && k.token?.required) return f.token.trim().length > 5;
  return true;
}

/** Request body for `homeApi.addBridge`. */
export function toBridge(
  kind: HomeBridgeKind,
  f: BridgeForm,
): Partial<HomeBridge> {
  const host = f.host.trim();
  return {
    kind,
    name: f.name.trim() || `${kind}@${host || 'local'}`,
    host: host || (kind === 'http' ? 'http' : ''),
    token: f.token.trim() || undefined,
    config:
      kind === 'http'
        ? {
            on_url: f.onUrl.trim(),
            off_url: f.offUrl.trim(),
            device_type: f.deviceType,
            ...(f.statusUrl.trim() && { status_url: f.statusUrl.trim() }),
          }
        : undefined,
  };
}
