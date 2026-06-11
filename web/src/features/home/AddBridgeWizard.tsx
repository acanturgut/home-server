import { useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { copyToClipboard } from '@/lib/format';
import { homeApi, type HomeBridgeKind } from '@/features/home/api';

type Step = number;

interface WizardProps {
  onAdded: () => void;
  onCancel: () => void;
}

const KIND_LABEL: Record<HomeBridgeKind, string> = {
  hue: 'Philips Hue Bridge',
  dirigera: 'IKEA DIRIGERA Hub',
  webos: 'LG webOS TV',
  http: 'Generic HTTP toggle',
};

const KIND_BLURB: Record<HomeBridgeKind, string> = {
  hue: 'Controls Hue lights, plugs, and sensors over your local network. Pairing requires pressing the round link button on the bridge.',
  dirigera:
    'Controls Tradfri lights, plugs, sensors, and speakers via the IKEA Home smart hub. Pairing uses the action button on the bottom of the hub.',
  webos:
    'Detects whether your LG TV is on, and (with pairing) supports power & volume control. Works only while the TV is reachable on the LAN.',
  http: 'Toggle anything that exposes a simple URL — Shelly, Tasmota, ESPHome, Home Assistant REST switches, etc.',
};

/** Step-by-step wizard for adding a new smart-home bridge. */
export function AddBridgeWizard({ onAdded, onCancel }: WizardProps) {
  const [kind, setKind] = useState<HomeBridgeKind | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [host, setHost] = useState('');
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [onUrl, setOnUrl] = useState('');
  const [offUrl, setOffUrl] = useState('');
  const [statusUrl, setStatusUrl] = useState('');
  const [deviceType, setDeviceType] = useState('plug');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Hue helper: try minting an app key now (requires bridge link button pressed).
  const [hueMinting, setHueMinting] = useState(false);
  const [hueMintErr, setHueMintErr] = useState('');
  const mintHueKey = async () => {
    setHueMintErr('');
    setHueMinting(true);
    try {
      const r = await fetch(`http://${host}/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicetype: 'home-server#dashboard' }),
      });
      const data = (await r.json()) as Array<{
        success?: { username: string };
        error?: { description: string };
      }>;
      if (Array.isArray(data) && data[0]?.success?.username) {
        setToken(data[0].success.username);
      } else {
        setHueMintErr(
          data[0]?.error?.description ||
            'Pairing failed — make sure you pressed the link button within the last 30 seconds.',
        );
      }
    } catch (e) {
      setHueMintErr(
        e instanceof Error
          ? e.message
          : 'Could not reach the bridge — double-check the IP.',
      );
    } finally {
      setHueMinting(false);
    }
  };

  // DIRIGERA helper: long-poll the server's PKCE pairing handshake. The hub
  // returns 403 until the user presses the action button, so we keep the
  // request open and let the server retry every ~2s.
  const [dirigeraPairing, setDirigeraPairing] = useState(false);
  const [dirigeraPairErr, setDirigeraPairErr] = useState('');
  const [dirigeraAbort, setDirigeraAbort] = useState<AbortController | null>(
    null,
  );
  const pairDirigera = async () => {
    setDirigeraPairErr('');
    setDirigeraPairing(true);
    const ac = new AbortController();
    setDirigeraAbort(ac);
    try {
      const tok = await homeApi.pairDirigera(
        host,
        name || 'home-server',
        ac.signal,
      );
      setToken(tok);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      setDirigeraPairErr(
        e instanceof Error
          ? e.message
          : 'Pairing failed — make sure the hub is reachable and try again.',
      );
    } finally {
      setDirigeraPairing(false);
      setDirigeraAbort(null);
    }
  };
  const cancelDirigeraPair = () => {
    dirigeraAbort?.abort();
  };

  const reset = () => {
    setKind(null);
    setStep(0);
    setHost('');
    setName('');
    setToken('');
    setOnUrl('');
    setOffUrl('');
    setStatusUrl('');
    setDeviceType('plug');
    setError('');
    setHueMintErr('');
    setDirigeraPairErr('');
    cancelDirigeraPair();
  };

  const submit = async () => {
    if (!kind) return;
    setError('');
    setSubmitting(true);
    try {
      const config: Record<string, string> = {};
      if (kind === 'http') {
        config.on_url = onUrl;
        config.off_url = offUrl;
        if (statusUrl) config.status_url = statusUrl;
        config.device_type = deviceType;
      }
      await homeApi.addBridge({
        kind,
        name: name || `${kind}@${host || 'local'}`,
        host: host || (kind === 'http' ? 'http' : ''),
        token: token || undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      reset();
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Step 0: choose kind ──
  if (step === 0 || !kind) {
    return (
      <div className="rounded-lg border border-border/30 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-foreground/90">Add a bridge</p>
          <p className="text-xs text-muted-foreground/70">
            Choose the kind of device or hub you want to connect.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(Object.keys(KIND_LABEL) as HomeBridgeKind[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setStep(1);
              }}
              className="text-left rounded-md border border-border/30 hover:border-primary/40 p-3 space-y-1 transition-colors">
              <div className="text-xs font-medium text-foreground/85 flex items-center justify-between">
                {KIND_LABEL[k]}
                <ChevronRight size={14} className="text-muted-foreground/65" />
              </div>
              <div className="text-xs text-muted-foreground/70 leading-relaxed">
                {KIND_BLURB[k]}
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end pt-1">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1 rounded border border-border/30 hover:border-border/60 text-muted-foreground/80">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground/90">
            Add {KIND_LABEL[kind]}
          </p>
          <p className="text-xs text-muted-foreground/70">
            Step {step} of {kind === 'http' ? 2 : 3}
          </p>
        </div>
        <button
          onClick={reset}
          className="text-xs text-muted-foreground/60 hover:text-foreground/90">
          ← Choose different type
        </button>
      </div>

      {/* Step 1: host / IP */}
      {step === 1 && (
        <Step1Host
          kind={kind}
          host={host}
          setHost={setHost}
          name={name}
          setName={setName}
        />
      )}

      {/* Step 2: pairing / token / urls */}
      {step === 2 && kind === 'hue' && (
        <Step2Hue
          host={host}
          token={token}
          setToken={setToken}
          mint={mintHueKey}
          minting={hueMinting}
          mintErr={hueMintErr}
        />
      )}
      {step === 2 && kind === 'dirigera' && (
        <Step2Dirigera
          host={host}
          token={token}
          setToken={setToken}
          pair={pairDirigera}
          cancel={cancelDirigeraPair}
          pairing={dirigeraPairing}
          pairErr={dirigeraPairErr}
        />
      )}
      {step === 2 && kind === 'webos' && (
        <Step2WebOS token={token} setToken={setToken} />
      )}
      {step === 2 && kind === 'http' && (
        <Step2HTTP
          onUrl={onUrl}
          setOnUrl={setOnUrl}
          offUrl={offUrl}
          setOffUrl={setOffUrl}
          statusUrl={statusUrl}
          setStatusUrl={setStatusUrl}
          deviceType={deviceType}
          setDeviceType={setDeviceType}
        />
      )}

      {/* Step 3: confirm (skip for http which shows everything in step 2) */}
      {step === 3 && (
        <div className="rounded-md bg-muted/20 border border-border/20 p-3 space-y-1.5 text-xs">
          <p className="text-foreground/80 font-medium">Review</p>
          <Row k="Type" v={KIND_LABEL[kind]} />
          <Row k="Name" v={name || `${kind}@${host}`} />
          <Row k="Host" v={host || '—'} />
          {token && (
            <Row
              k="Token"
              v={
                token.length > 20
                  ? token.slice(0, 8) + '…' + token.slice(-4)
                  : token
              }
            />
          )}
          {kind === 'webos' && !token && (
            <p className="text-xs text-amber-400/80">
              Reachability detection only — power/volume control is not
              available without a paired client key.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 border border-red-500/20 bg-red-500/[0.06] rounded px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => (step === 1 ? reset() : setStep((s) => s - 1))}
          className="text-xs flex items-center gap-1 px-2 py-1 text-muted-foreground/80 hover:text-foreground">
          <ChevronLeft size={12} />
          Back
        </button>
        {step < (kind === 'http' ? 2 : 3) ? (
          <button
            disabled={!canAdvance(kind, step, { host, token, onUrl, offUrl })}
            onClick={() => setStep((s) => s + 1)}
            className="text-xs flex items-center gap-1 px-3 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary disabled:opacity-40">
            Next
            <ChevronRight size={12} />
          </button>
        ) : (
          <button
            disabled={submitting}
            onClick={submit}
            className="text-xs flex items-center gap-1 px-3 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary disabled:opacity-50">
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {submitting ? 'Adding…' : 'Add bridge'}
          </button>
        )}
      </div>
    </div>
  );
}

function canAdvance(
  kind: HomeBridgeKind,
  step: Step,
  v: { host: string; token: string; onUrl: string; offUrl: string },
): boolean {
  if (step === 1) {
    if (kind === 'http') return true;
    return v.host.trim().length > 0;
  }
  if (step === 2) {
    if (kind === 'hue') return v.token.trim().length > 5;
    if (kind === 'dirigera') return v.token.trim().length > 5;
    if (kind === 'webos') return true; // token optional
    if (kind === 'http')
      return v.onUrl.trim().length > 0 && v.offUrl.trim().length > 0;
  }
  return true;
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground/60 w-16">{k}</span>
      <span className="text-foreground/80 font-mono truncate">{v}</span>
    </div>
  );
}

function Step1Host({
  kind,
  host,
  setHost,
  name,
  setName,
}: {
  kind: HomeBridgeKind;
  host: string;
  setHost: (v: string) => void;
  name: string;
  setName: (v: string) => void;
}) {
  const placeholders: Record<HomeBridgeKind, string> = {
    hue: '192.168.1.42',
    dirigera: '192.168.1.50',
    webos: '192.168.1.55',
    http: 'descriptive label',
  };
  const tips: Record<HomeBridgeKind, string> = {
    hue: 'Find the IP in the Hue app: Settings → My Hue System → tap the bridge.',
    dirigera:
      "Find the IP in your router's DHCP table or in the IKEA Home Smart app: Settings → Hubs.",
    webos: 'On the TV: Settings → Network → Wi-Fi/Wired → IPv4 address.',
    http: 'Optional descriptive label (e.g. "Office plug"). The actual URLs are configured in the next step.',
  };
  return (
    <div className="space-y-3">
      {kind !== 'http' && (
        <label className="space-y-1 block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
            LAN IP address
          </span>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder={placeholders[kind]}
            className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
            autoFocus
          />
        </label>
      )}
      <label className="space-y-1 block">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          Friendly name (optional)
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === 'http' ? placeholders[kind] : 'Living Room Hue'}
          className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background"
          autoFocus={kind === 'http'}
        />
      </label>
      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        {tips[kind]}
      </p>
    </div>
  );
}

function Step2Hue({
  host,
  token,
  setToken,
  mint,
  minting,
  mintErr,
}: {
  host: string;
  token: string;
  setToken: (v: string) => void;
  mint: () => void;
  minting: boolean;
  mintErr: string;
}) {
  const curl = `curl -X POST http://${host || '<bridge-ip>'}/api -d '{"devicetype":"home-server#dashboard"}'`;
  return (
    <div className="space-y-3">
      <NumberedSteps
        steps={[
          'Walk over to the Hue Bridge and press the round link button on top — it lights up briefly.',
          'Within the next 30 seconds, click "Pair now" below. The bridge will mint and return an application key.',
          'You can also pair manually from a terminal if pairing fails (see the curl command).',
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={mint}
          disabled={minting || !host}
          className="text-xs flex items-center gap-1 px-3 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary disabled:opacity-50">
          {minting && <Loader2 size={12} className="animate-spin" />}
          Pair now (press link button first)
        </button>
        {token && <CheckCircle2 size={14} className="text-emerald-400" />}
      </div>
      {mintErr && (
        <p className="text-xs text-amber-400/90 border border-amber-500/20 bg-amber-500/[0.06] rounded px-2 py-1">
          {mintErr}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground/80 hover:text-foreground">
          Manual pairing via curl
        </summary>
        <CodeBlock text={curl} />
        <p className="text-xs text-muted-foreground/60 mt-1">
          Paste the resulting{' '}
          <code className="bg-muted/40 px-1 rounded">success.username</code>{' '}
          value into the field below.
        </p>
      </details>
      <label className="space-y-1 block">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          Application key
        </span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="e.g. 1028d66426293e821ecfd9ef1a0731df"
          className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
        />
      </label>
    </div>
  );
}

function Step2Dirigera({
  host,
  token,
  setToken,
  pair,
  cancel,
  pairing,
  pairErr,
}: {
  host: string;
  token: string;
  setToken: (v: string) => void;
  pair: () => void;
  cancel: () => void;
  pairing: boolean;
  pairErr: string;
}) {
  const cmd = `npx dirigera-auth --ip ${host || '<hub-ip>'}`;
  return (
    <div className="space-y-3">
      <NumberedSteps
        steps={[
          'Click "Pair now" below — the home server will open a handshake with the hub.',
          'Within ~90 seconds, walk over to the DIRIGERA hub and press the small action button on the bottom once.',
          'The bearer token will appear automatically and be saved.',
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {!pairing ? (
          <button
            onClick={pair}
            disabled={!host}
            className="text-xs flex items-center gap-1 px-3 py-1 rounded border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary disabled:opacity-50">
            Pair now
          </button>
        ) : (
          <>
            <span className="text-xs flex items-center gap-1.5 px-3 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">
              <Loader2 size={12} className="animate-spin" />
              Waiting for action button press…
            </span>
            <button
              onClick={cancel}
              className="text-xs px-2 py-1 rounded border border-border/30 hover:border-border/60 text-muted-foreground/80">
              Cancel
            </button>
          </>
        )}
        {token && !pairing && (
          <CheckCircle2 size={14} className="text-emerald-400" />
        )}
      </div>
      {pairErr && (
        <p className="text-xs text-amber-400/90 border border-amber-500/20 bg-amber-500/[0.06] rounded px-2 py-1">
          {pairErr}
        </p>
      )}
      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        Tokens never expire. The hub uses self-signed TLS on port 8443 — the
        server skips cert validation for this LAN call only.
      </p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground/80 hover:text-foreground">
          Manual pairing (CLI fallback)
        </summary>
        <div className="space-y-1 mt-1">
          <p className="text-xs text-muted-foreground/70">
            If the in-app handshake fails, generate a token from any computer
            with Node.js and paste it below:
          </p>
          <CodeBlock text={cmd} />
        </div>
      </details>
      <label className="space-y-1 block">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          Bearer token
        </span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOiJSUzI1NiIs…"
          className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
        />
      </label>
    </div>
  );
}

function Step2WebOS({
  token,
  setToken,
}: {
  token: string;
  setToken: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <NumberedSteps
        steps={[
          'Make sure the TV is on the same network as the home server.',
          'For reachability detection only, leave the client key blank — done.',
          'For full power/volume control: install the LG ThinQ or "LG webOS Remote" app on your phone, pair it once, then copy the client key it stored and paste it below. (Full control will arrive in a follow-up — for now this field is captured but not used.)',
        ]}
      />
      <label className="space-y-1 block">
        <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
          Client key (optional)
        </span>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="leave blank for status-only"
          className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
        />
      </label>
    </div>
  );
}

function Step2HTTP({
  onUrl,
  setOnUrl,
  offUrl,
  setOffUrl,
  statusUrl,
  setStatusUrl,
  deviceType,
  setDeviceType,
}: {
  onUrl: string;
  setOnUrl: (v: string) => void;
  offUrl: string;
  setOffUrl: (v: string) => void;
  statusUrl: string;
  setStatusUrl: (v: string) => void;
  deviceType: string;
  setDeviceType: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <NumberedSteps
        steps={[
          'Find the on/off URLs your device exposes. For Shelly Gen2: http://<ip>/relay/0?turn=on / off. For Tasmota: http://<ip>/cm?cmnd=Power%20On.',
          'Optionally provide a status URL whose response text/JSON contains "on", "true", or "1" when the device is on.',
          'Pick the device type so the dashboard renders the right icon.',
        ]}
      />
      <div className="grid grid-cols-1 gap-2">
        <Field
          label="On URL *"
          value={onUrl}
          onChange={setOnUrl}
          placeholder="http://10.0.0.5/relay/0?turn=on"
        />
        <Field
          label="Off URL *"
          value={offUrl}
          onChange={setOffUrl}
          placeholder="http://10.0.0.5/relay/0?turn=off"
        />
        <Field
          label="Status URL (optional)"
          value={statusUrl}
          onChange={setStatusUrl}
          placeholder="http://10.0.0.5/relay/0"
        />
        <label className="space-y-1 block">
          <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
            Device type
          </span>
          <select
            value={deviceType}
            onChange={(e) => setDeviceType(e.target.value)}
            className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background">
            <option value="light">light</option>
            <option value="plug">plug</option>
            <option value="tv">tv</option>
            <option value="speaker">speaker</option>
            <option value="other">other</option>
          </select>
        </label>
      </div>
      <p className="text-xs text-muted-foreground/70">
        Need ideas? Try{' '}
        <a
          className="text-primary hover:underline"
          href="https://www.home-assistant.io/integrations/switch.rest/"
          target="_blank"
          rel="noreferrer">
          Home Assistant REST switches{' '}
          <ExternalLink size={9} className="inline" />
        </a>{' '}
        to expose any HA entity.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm h-8 px-2 rounded border border-border/30 bg-background font-mono"
      />
    </label>
  );
}

function NumberedSteps({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-1.5 text-xs">
      {steps.map((s, i) => (
        <li
          key={i}
          className="flex gap-2 text-muted-foreground/85 leading-snug">
          <span className="shrink-0 w-4 h-4 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-foreground/80">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs font-mono bg-muted/30 border border-border/20 rounded px-2 py-1.5 truncate">
        {text}
      </code>
      <button
        onClick={() => copyToClipboard(text)}
        className="text-xs flex items-center gap-1 px-2 py-1 rounded border border-border/30 hover:border-border/60 text-muted-foreground/80">
        <Copy size={11} />
        Copy
      </button>
    </div>
  );
}
