import { ChevronRight, ExternalLink } from 'lucide-react';
import type { HomeBridgeKind, HomeDeviceType } from '@/features/home/api';
import { BRIDGE_KINDS, type BridgeForm } from '@/features/home/bridgeKinds';
import type { usePairing } from '@/features/home/hooks/usePairing';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { Collapsible } from '@/components/ui/collapsible';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Steps } from '@/components/ui/steps';
import { cn } from '@/lib/utils';

interface StepProps {
  kind: HomeBridgeKind;
  form: BridgeForm;
  set: (patch: Partial<BridgeForm>) => void;
}

const HTTP_TYPES: HomeDeviceType[] = [
  'light',
  'plug',
  'tv',
  'speaker',
  'other',
];

const steps = (lines: string[]) => lines.map((body) => ({ body }));

export function KindStep({ onPick }: { onPick: (k: HomeBridgeKind) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(Object.keys(BRIDGE_KINDS) as HomeBridgeKind[]).map((k) => (
        <Card
          key={k}
          interactive
          render={<button type="button" onClick={() => onPick(k)} />}
          className="space-y-1"
        >
          <span className="flex items-center justify-between gap-2 text-sm font-medium">
            {BRIDGE_KINDS[k].label}
            <ChevronRight
              aria-hidden
              className="size-4 text-muted-foreground"
            />
          </span>
          <span className="block text-sm text-muted-foreground">
            {BRIDGE_KINDS[k].blurb}
          </span>
        </Card>
      ))}
    </div>
  );
}

export function HostStep({ kind, form, set }: StepProps) {
  const k = BRIDGE_KINDS[kind];
  return (
    <div className="space-y-4">
      {k.hostPlaceholder && (
        <Field label="IP address" hint={k.hostTip}>
          <Input
            value={form.host}
            onChange={(e) => set({ host: e.target.value })}
            placeholder={k.hostPlaceholder}
            className="font-mono"
            inputMode="decimal"
            autoFocus
          />
        </Field>
      )}
      <Field
        label="Name (optional)"
        hint={k.hostPlaceholder ? undefined : k.hostTip}
      >
        <Input
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={k.namePlaceholder}
          autoFocus={!k.hostPlaceholder}
        />
      </Field>
    </div>
  );
}

/** Instructions, optional in-app pairing with a CLI fallback, and the token field. */
export function TokenStep({
  kind,
  form,
  set,
  pairing,
}: StepProps & { pairing: ReturnType<typeof usePairing> }) {
  const k = BRIDGE_KINDS[kind];
  const { pair } = k;
  return (
    <div className="space-y-4">
      <Steps items={steps(k.instructions)} />
      {pair && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void pairing.pair((signal) => pair(form, signal))}
            loading={pairing.busy}
          >
            {pairing.busy ? 'Pairing…' : 'Pair now'}
          </Button>
          {pairing.busy && (
            <Button variant="ghost" onClick={pairing.cancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
      {pairing.busy && k.pairWaiting && (
        <Alert tone="info">{k.pairWaiting}</Alert>
      )}
      {pairing.paired && (
        <Alert tone="success">Paired. The token is filled in below.</Alert>
      )}
      {pairing.error && <Alert>{pairing.error}</Alert>}
      {k.manual && (
        <Collapsible trigger={k.manual.title}>
          <div className="space-y-2">
            <CodeBlock text={k.manual.command(form.host.trim())} />
            <p className="text-xs text-muted-foreground">{k.manual.note}</p>
          </div>
        </Collapsible>
      )}
      {k.token && (
        <Field label={k.token.label}>
          <Input
            value={form.token}
            onChange={(e) => set({ token: e.target.value })}
            placeholder={k.token.placeholder}
            className="font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
      )}
    </div>
  );
}

export function HttpStep({ form, set }: Omit<StepProps, 'kind'>) {
  return (
    <div className="space-y-4">
      <Steps items={steps(BRIDGE_KINDS.http.instructions)} />
      <Field label="On URL">
        <Input
          type="url"
          value={form.onUrl}
          onChange={(e) => set({ onUrl: e.target.value })}
          placeholder="http://10.0.0.5/relay/0?turn=on"
          className="font-mono"
        />
      </Field>
      <Field label="Off URL">
        <Input
          type="url"
          value={form.offUrl}
          onChange={(e) => set({ offUrl: e.target.value })}
          placeholder="http://10.0.0.5/relay/0?turn=off"
          className="font-mono"
        />
      </Field>
      <Field label="Status URL (optional)">
        <Input
          type="url"
          value={form.statusUrl}
          onChange={(e) => set({ statusUrl: e.target.value })}
          placeholder="http://10.0.0.5/relay/0"
          className="font-mono"
        />
      </Field>
      <Field label="Device type">
        <Select
          value={form.deviceType}
          onChange={(e) =>
            set({ deviceType: e.target.value as HomeDeviceType })
          }
        >
          {HTTP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-sm text-muted-foreground">
        To expose any Home Assistant entity, use{' '}
        <a
          className="inline-flex items-center gap-1 text-foreground underline underline-offset-2"
          href="https://www.home-assistant.io/integrations/switch.rest/"
          target="_blank"
          rel="noreferrer"
        >
          Home Assistant REST switches
          <ExternalLink aria-hidden className="size-3" />
        </a>
        .
      </p>
    </div>
  );
}

export function ReviewStep({ kind, form }: Omit<StepProps, 'set'>) {
  const t = form.token.trim();
  // [label, value, monospace]
  const rows: [string, string, boolean][] = [
    ['Type', BRIDGE_KINDS[kind].label, false],
    ['Name', form.name.trim() || `${kind}@${form.host.trim()}`, false],
    ['Host', form.host.trim() || '—', true],
  ];
  if (t)
    rows.push([
      'Token',
      t.length > 20 ? `${t.slice(0, 8)}…${t.slice(-4)}` : t,
      true,
    ]);
  return (
    <div className="space-y-3">
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex gap-4">
            <dt className="w-16 shrink-0 text-muted-foreground">{k}</dt>
            <dd className={cn('min-w-0 truncate', mono && 'font-mono')}>{v}</dd>
          </div>
        ))}
      </dl>
      {kind === 'webos' && !t && (
        <Alert tone="info">
          On/off detection only. Power and volume control need a client key.
        </Alert>
      )}
    </div>
  );
}
