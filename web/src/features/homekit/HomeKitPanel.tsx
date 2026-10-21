import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Home, Monitor, Package } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/empty-state';
import { RefreshButton } from '@/components/ui/refresh-button';
import { Section } from '@/components/ui/section';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Steps } from '@/components/ui/steps';
import { toast } from '@/components/ui/toast';
import { useAction } from '@/hooks/useAction';
import { homekitApi, type HKInfo } from '@/features/homekit/api';
import { LogLine } from '@/features/logs';
import { errorMessage, plural } from '@/lib/format';
import { nodesApi } from '@/lib/nodes';
import type { LogEntry } from '@/lib/types';

/** Log messages that belong to the HomeKit bridge and its mDNS advertising. */
const HK_WORDS = ['homekit', 'hap', 'bridge', 'mdns', 'dnssd'];

/** HomeKit bridge: pairing code, accessories with Wake-on-LAN, agent download and bridge logs. */
export function HomeKitPanel() {
  // undefined while loading, null when the request failed.
  const [info, setInfo] = useState<HKInfo | null | undefined>(undefined);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [waking, setWaking] = useState<string | null>(null);

  // `.then`, not `await`: the mount effect calls this, and the lint rule
  // only allows setState from a callback there.
  const fetchLogs = useCallback(
    () =>
      homekitApi.recentLogs(200).then((all) =>
        setLogs(
          (all ?? [])
            .filter((l) => {
              const msg = l.message.toLowerCase();
              return HK_WORDS.some((w) => msg.includes(w));
            })
            .reverse(),
        ),
      ),
    [],
  );
  const refreshLogs = useAction(fetchLogs);

  useEffect(() => {
    homekitApi.info().then(setInfo);
    void fetchLogs();
  }, [fetchLogs]);

  const wake = async (id: string, name: string) => {
    setWaking(id);
    try {
      await nodesApi.wake(id);
      toast(`Wake-on-LAN sent to ${name}`, { tone: 'success' });
    } catch (e) {
      toast(`Couldn't wake ${name}`, {
        tone: 'error',
        description: errorMessage(e),
      });
    } finally {
      setWaking(null);
    }
  };

  if (info === undefined) return <SkeletonRows rows={4} />;
  if (info === null)
    return <Alert>Couldn't load the HomeKit bridge. Try again later.</Alert>;

  const accessories = info.accessories ?? [];

  return (
    <div className="space-y-6">
      <Card className="space-y-3">
        <CardHeader
          icon={<Home />}
          title={info.bridge}
          description={`HomeKit bridge · port ${info.port}`}
          actions={info.pin && <Badge mono>{info.pin}</Badge>}
        />
        {info.setup_uri ? (
          <Collapsible trigger="Setup QR code (first pairing only)">
            <div className="flex flex-col items-center gap-3 py-2">
              <QRCodeSVG
                value={info.setup_uri}
                size={160}
                marginSize={4}
                level="M"
                title="HomeKit setup code"
                className="rounded-md"
              />
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                Scan with Apple Home to add this bridge. Devices appear
                automatically after pairing.
              </p>
            </div>
          </Collapsible>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ask an admin for the pairing code.
          </p>
        )}
      </Card>

      {accessories.length > 0 && (
        <Section
          title="Accessories"
          description={plural(accessories.length, 'accessory', 'accessories')}
        >
          <Card className="space-y-0.5 p-2">
            {accessories.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center gap-3 rounded-md px-3 py-2.5"
              >
                <Monitor
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{acc.name}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {acc.mac} · {acc.host}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={waking === acc.id}
                  onClick={() => wake(acc.id, acc.name)}
                >
                  Wake
                </Button>
              </div>
            ))}
          </Card>
        </Section>
      )}

      <Card className="space-y-3">
        <CardHeader
          icon={<Package />}
          title="home-agent.exe"
          description="Windows agent that reports stats and accepts commands"
          actions={
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<a href="/home-agent.exe" download />}
            >
              <Download />
              Download
            </Button>
          }
        />
        <Collapsible trigger="Setup instructions">
          <div className="space-y-3">
            <Steps
              items={[
                {
                  body: (
                    <>
                      Download and run <code>home-agent.exe</code>.
                    </>
                  ),
                },
                {
                  body: 'If Windows blocks it, open Properties and choose Unblock, or turn off Smart App Control.',
                },
                {
                  body: 'It installs itself to startup, detects your PC and connects to the server. No configuration needed.',
                },
              ]}
            />
            <p className="text-sm text-muted-foreground">
              To uninstall, run{' '}
              <code className="text-foreground">home-agent.exe -uninstall</code>
              .
            </p>
          </div>
        </Collapsible>
      </Card>

      <Section
        title="Bridge logs"
        toolbar={
          <RefreshButton
            onClick={refreshLogs.run}
            busy={refreshLogs.busy}
            label="Refresh bridge logs"
          />
        }
      >
        <Card className="max-h-64 overflow-y-auto p-0">
          {logs.length === 0 ? (
            <EmptyState title="No HomeKit logs" className="py-6" />
          ) : (
            <ul>
              {logs.map((l, i) => (
                <LogLine key={i} entry={l} />
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}
