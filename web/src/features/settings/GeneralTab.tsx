import { useState, type FormEvent } from 'react';
import { Activity, ExternalLink, Hexagon, Info, Wrench } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RefreshButton } from '@/components/ui/refresh-button';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusDot } from '@/components/ui/status-dot';
import { useRuntimeSettings } from '@/features/settings/hooks/useRuntimeSettings';
import { useSystemConfig } from '@/features/settings/hooks/useSystemConfig';
import { useAction } from '@/hooks/useAction';
import { formatUptime } from '@/lib/format';

const LINKS = [
  { href: 'https://github.com/acanturgut/home-server', label: 'GitHub' },
  { href: '/api/health', label: '/api/health' },
  { href: '/api/system', label: '/api/system' },
];

/** Settings → General: system info, backends, runtime defaults, about. */
export function GeneralTab() {
  const system = useSystemConfig();
  const runtime = useRuntimeSettings();
  const cfg = system.config;

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <CardHeader
          title="System"
          icon={<Hexagon />}
          actions={
            <RefreshButton onClick={system.refresh} busy={system.busy} />
          }
        />
        {system.error && <Alert>{system.error}</Alert>}
        {!cfg ? (
          system.loading && <SkeletonRows rows={5} />
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            <StatTile label="Version" value={cfg.version} />
            <StatTile label="Port" value={cfg.port} mono />
            <StatTile
              label="Started"
              value={new Date(cfg.started_at).toLocaleString()}
            />
            <StatTile label="Uptime" value={formatUptime(cfg.uptime_seconds)} />
            <StatTile label="Nodes" value={cfg.nodes_count} />
            <StatTile label="HomeKit PIN" value={cfg.homekit_pin} mono />
            <StatTile
              label="Data directory"
              value={cfg.data_dir}
              mono
              className="col-span-2"
            />
            <StatTile
              label="Log directory"
              value={cfg.log_dir}
              mono
              className="col-span-2"
            />
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <CardHeader
          title="Backends"
          icon={<Activity />}
          description="The Ollama router model classifies each chat request."
        />
        {!cfg ? (
          system.loading && <SkeletonRows rows={2} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <StatusDot
                status={system.ollamaOnline ? 'online' : 'offline'}
                className="size-2"
              />
              <span className="font-medium">Ollama</span>
              <Badge tone={system.ollamaOnline ? 'success' : 'neutral'}>
                {system.ollamaOnline === null
                  ? 'Checking…'
                  : system.ollamaOnline
                    ? 'Online'
                    : 'Offline'}
              </Badge>
              <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
                {cfg.ollama_host}
              </span>
            </div>
            <RouterModelForm
              key={cfg.router_model}
              initial={cfg.router_model}
              onSave={system.saveRouterModel}
            />
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <CardHeader
          title="Defaults"
          icon={<Wrench />}
          actions={
            <>
              {runtime.dirty && <Badge tone="warning">Unsaved</Badge>}
              <Button
                size="sm"
                variant="ghost"
                disabled={runtime.busy}
                onClick={async () => {
                  if (await runtime.reset()) void system.refresh();
                }}
              >
                Reset
              </Button>
              <Button
                size="sm"
                loading={runtime.busy}
                disabled={!runtime.dirty}
                onClick={runtime.save}
              >
                Save
              </Button>
            </>
          }
        />
        {runtime.error && <Alert>{runtime.error}</Alert>}
        {!runtime.settings ? (
          <SkeletonRows rows={1} />
        ) : (
          <Field
            label="Default temperature"
            hint="Pre-fills the temperature of new nodes (0–2)."
          >
            <Input
              type="number"
              value={runtime.settings.defaultTemperature}
              step={0.1}
              min={0}
              max={2}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) runtime.update({ defaultTemperature: n });
              }}
              className="w-24 tabular-nums"
            />
          </Field>
        )}
      </Card>

      <Card className="space-y-3">
        <CardHeader title="About" icon={<Info />} />
        <p className="text-muted-foreground">
          A self-hosted dashboard for your network, smart home and AI nodes,
          running on your Raspberry Pi.
        </p>
        <div className="flex flex-wrap gap-4">
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <ExternalLink className="size-3.5" />
              {l.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Router-model input; remounted (via `key`) whenever the saved value changes. */
function RouterModelForm({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (model: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const save = useAction(onSave);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save.run(value.trim());
  };
  return (
    <form onSubmit={submit} className="space-y-2 pt-2">
      <div className="flex items-end gap-2">
        <Field label="Router model" className="flex-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="gemma3:1b"
            className="font-mono"
          />
        </Field>
        <Button
          type="submit"
          variant="secondary"
          loading={save.busy}
          disabled={!value.trim() || value.trim() === initial}
        >
          Save
        </Button>
      </div>
      {save.error && <Alert>{save.error}</Alert>}
    </form>
  );
}
