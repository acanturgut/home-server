import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Home,
  Monitor,
  Power,
  Package,
  Download,
  RefreshCw,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { homekitApi } from '@/features/homekit/api';
import type { HKInfo, LogEntry } from '@/lib/types';

/** HomeKit bridge dashboard: pairing QR, accessory list with WoL, agent download, bridge logs. */
export function HomeKitPanel() {
  const [info, setInfo] = useState<HKInfo | null>(null);
  const [waking, setWaking] = useState<string | null>(null);
  const [wakeResult, setWakeResult] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    homekitApi.info().then((d) => setInfo(d));
    fetchLogs();
  }, []);

  const fetchLogs = () => {
    homekitApi.recentLogs(200).then((all) => {
      const hk = (all || []).filter(
        (l) =>
          l.message.toLowerCase().includes('homekit') ||
          l.message.toLowerCase().includes('hap') ||
          l.message.toLowerCase().includes('bridge') ||
          l.message.toLowerCase().includes('mdns') ||
          l.message.toLowerCase().includes('dnssd'),
      );
      setLogs(hk.reverse());
    });
  };

  const wake = async (id: string, name: string) => {
    setWaking(id);
    setWakeResult((prev) => ({ ...prev, [id]: '' }));
    try {
      const res = await homekitApi.wakeNode(id);
      if (res.ok) {
        setWakeResult((prev) => ({ ...prev, [id]: `✓ WoL sent to ${name}` }));
      } else {
        const data = await res.json();
        setWakeResult((prev) => ({
          ...prev,
          [id]: `✗ ${data.error || 'Failed'}`,
        }));
      }
    } catch (e) {
      setWakeResult((prev) => ({
        ...prev,
        [id]: `✗ ${e instanceof Error ? e.message : 'Error'}`,
      }));
    }
    setWaking(null);
  };

  if (!info) {
    return (
      <div className="rounded-lg border border-border/30 p-6 text-center text-sm text-muted-foreground">
        Loading HomeKit bridge info...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bridge info */}
      <div className="rounded-lg border border-border/30 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <Home size={18} className="text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">{info.bridge}</p>
            <p className="text-[11px] text-muted-foreground">
              HomeKit Bridge · Port {info.port}
            </p>
          </div>
          <code className="ml-auto bg-muted/40 px-2 py-0.5 rounded font-mono text-xs tracking-widest">
            {info.pin}
          </code>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Setup QR Code (for initial hub pairing only)
          </summary>
          <div className="flex flex-col items-center gap-3 py-3">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={info.setup_uri} size={140} level="M" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Scan with Apple Home to add this bridge for the first time.
              Devices appear automatically after pairing.
            </p>
          </div>
        </details>
      </div>

      {/* Accessories */}
      {info.accessories && info.accessories.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {info.accessories.length} accessori
            {info.accessories.length === 1 ? 'y' : 'es'}
          </p>
          {info.accessories.map((acc) => (
            <div
              key={acc.id}
              className="rounded-lg border border-border/30 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Monitor size={16} className="text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{acc.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {acc.mac} · {acc.host}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => wake(acc.id, acc.name)}
                  disabled={waking === acc.id}
                  className="px-2.5 py-1 rounded-md text-[11px] text-violet-400 border border-violet-500/20 hover:bg-violet-500/10 disabled:opacity-50 transition-colors">
                  {waking === acc.id ? (
                    'Waking...'
                  ) : (
                    <>
                      <Power size={12} className="inline" /> Wake
                    </>
                  )}
                </button>
                {wakeResult[acc.id] && (
                  <span
                    className={`text-[10px] ${wakeResult[acc.id].startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                    {wakeResult[acc.id]}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agent download */}
      <div className="rounded-lg border border-border/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package size={16} className="text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">home-agent.exe</p>
              <p className="text-[10px] text-muted-foreground">
                Windows agent — reports stats & accepts commands
              </p>
            </div>
          </div>
          <a href="/home-agent.exe" download>
            <button className="px-2.5 py-1 rounded-md text-[11px] text-blue-400 border border-blue-500/20 hover:bg-blue-500/10 transition-colors">
              <Download size={12} className="inline mr-0.5" /> Download
            </button>
          </a>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            Setup instructions
          </summary>
          <div className="mt-2 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
            <p>
              <strong className="text-foreground/70">1.</strong> Download and
              run{' '}
              <code className="bg-muted/40 px-1 rounded text-[10px]">
                home-agent.exe
              </code>
            </p>
            <p>
              <strong className="text-foreground/70">2.</strong> If Windows
              blocks it: Properties → Unblock, or disable Smart App Control
            </p>
            <p>
              <strong className="text-foreground/70">3.</strong> It
              auto-installs to startup, detects your PC, connects to server.
              Zero config.
            </p>
            <p className="text-[10px]">
              Uninstall:{' '}
              <code className="bg-muted/40 px-1 rounded">
                home-agent.exe -uninstall
              </code>
            </p>
          </div>
        </details>
      </div>

      {/* Bridge logs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Bridge Logs</p>
          <button
            onClick={fetchLogs}
            className="text-[11px] text-muted-foreground hover:text-foreground">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="rounded-lg border border-border/30 overflow-hidden">
          <ScrollArea className="max-h-[250px]">
            {logs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No HomeKit logs
              </p>
            ) : (
              <div className="divide-y divide-border/10">
                {logs.map((l, i) => (
                  <div
                    key={i}
                    className="px-3 py-1 flex gap-2 text-[11px] font-mono">
                    <span className="text-muted-foreground/50 shrink-0 w-[62px] tabular-nums">
                      {l.timestamp
                        ? new Date(l.timestamp).toLocaleTimeString()
                        : ''}
                    </span>
                    <span
                      className={`shrink-0 w-[38px] ${
                        l.level === 'ERROR'
                          ? 'text-red-400'
                          : l.level === 'WARN'
                            ? 'text-amber-400'
                            : 'text-emerald-400/60'
                      }`}>
                      {l.level}
                    </span>
                    <span className="text-foreground/70 break-all">
                      {l.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
