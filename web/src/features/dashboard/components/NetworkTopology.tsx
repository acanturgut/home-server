import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  Router as RouterIcon,
  Search,
  Server,
  Settings,
  Signal,
  Wifi,
  Zap,
} from 'lucide-react';
import { networkApi, type NetworkDevice } from '@/features/network/api';
import {
  routerApi,
  type RouterClient,
  type RouterStatus,
} from '@/features/router/api';
import { copyToClipboard, formatUptime, gotoPage } from '@/lib/format';

/**
 * Dashboard "Network" widget. When the ASUS router is connected, the
 * device list, counts and per-device actions all come from the router
 * (authoritative source). Falls back to the home-server ARP scan
 * otherwise so the widget still works on a fresh install.
 */
export function NetworkTopology() {
  const [scan, setScan] = useState<{
    devices: NetworkDevice[];
    gateway?: string;
    self_ip?: string;
  } | null>(null);
  const [router, setRouter] = useState<{
    configured: boolean;
    status?: RouterStatus;
  } | null>(null);
  const [clients, setClients] = useState<RouterClient[] | null>(null);
  const [busy, setBusy] = useState<'reboot' | 'wifi' | null>(null);
  const [wolBusy, setWolBusy] = useState<string | null>(null);
  const [blockBusy, setBlockBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [r, rt, cs] = await Promise.all([
      networkApi.list(),
      routerApi.status(),
      routerApi.clients(),
    ]);
    if (r) setScan(r);
    if (rt) setRouter(rt);
    if (cs?.configured) setClients(cs.clients || []);
    else setClients(null);
  }, []);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, [loadAll]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(id);
  }, [toast]);

  const rs = router?.status;
  const routerOnline = router?.configured && rs && rs.wan_status !== '';

  // Sort: online first, then by interface (wired → 5G → 2G), then by hostname.
  const sortedClients = useMemo(() => {
    if (!clients) return [];
    const ifaceRank: Record<string, number> = { wired: 0, '5G': 1, '5G-2': 1, '2G': 2, '6G': 0 };
    const visible = showOffline ? clients : clients.filter((c) => c.online);
    const list = [...visible].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const ra = ifaceRank[a.iface || ''] ?? 9;
      const rb = ifaceRank[b.iface || ''] ?? 9;
      if (ra !== rb) return ra - rb;
      const na = (a.custom_name || a.nickname || a.hostname || a.vendor || a.ip || a.mac).toLowerCase();
      const nb = (b.custom_name || b.nickname || b.hostname || b.vendor || b.ip || b.mac).toLowerCase();
      return na.localeCompare(nb);
    });
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter(
      (c) =>
        (c.custom_name || '').toLowerCase().includes(q) ||
        (c.hostname || '').toLowerCase().includes(q) ||
        (c.nickname || '').toLowerCase().includes(q) ||
        (c.vendor || '').toLowerCase().includes(q) ||
        (c.ip || '').toLowerCase().includes(q) ||
        c.mac.toLowerCase().includes(q),
    );
  }, [clients, filter, showOffline]);

  const visibleClients = showAll ? sortedClients : sortedClients.slice(0, 12);

  // Fallback: ARP leaves when router not configured.
  const { gateway, self, leaves } = useMemo(() => {
    if (!scan) return { gateway: null, self: null, leaves: [] as NetworkDevice[] };
    const gw = scan.devices.find((d) => d.ip === scan.gateway) ?? null;
    const me = scan.devices.find((d) => d.ip === scan.self_ip) ?? null;
    const ls = scan.devices
      .filter((d) => d.online && d.ip !== scan.gateway && d.ip !== scan.self_ip)
      .slice(0, 12);
    return { gateway: gw, self: me, leaves: ls };
  }, [scan]);

  const doReboot = async () => {
    if (
      !window.confirm(
        'Reboot the router? The whole network will drop for ~60 seconds.',
      )
    )
      return;
    setBusy('reboot');
    try {
      await routerApi.reboot();
      setToast('Reboot signal sent');
    } catch (e) {
      window.alert('Reboot failed: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doRestartWifi = async () => {
    if (!window.confirm('Restart wireless radios?')) return;
    setBusy('wifi');
    try {
      await routerApi.restartWireless();
      setToast('Wireless restarting');
    } catch (e) {
      window.alert('Restart wireless failed: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doWol = async (mac: string, label: string) => {
    setWolBusy(mac);
    try {
      await routerApi.wol(mac);
      setToast(`WoL sent → ${label}`);
    } catch (e) {
      window.alert('WoL failed: ' + (e as Error).message);
    } finally {
      setWolBusy(null);
    }
  };

  const doBlock = async (c: RouterClient) => {
    const label = c.custom_name || c.nickname || c.hostname || c.vendor || c.ip || c.mac;
    const next = !c.blocked;
    if (
      next &&
      !window.confirm(`Block ${label} from the internet via the router?`)
    )
      return;
    setBlockBusy(c.mac);
    try {
      await routerApi.block(c.mac, next, label);
      setClients((prev) =>
        prev ? prev.map((x) => (x.mac === c.mac ? { ...x, blocked: next } : x)) : prev,
      );
      setToast(next ? `Blocked ${label}` : `Unblocked ${label}`);
    } catch (e) {
      window.alert('Block failed: ' + (e as Error).message);
    } finally {
      setBlockBusy(null);
    }
  };

  const doRename = async (c: RouterClient) => {
    const current = c.custom_name || c.nickname || c.hostname || '';
    const name = window.prompt(
      `Display name for ${c.mac}:`,
      current,
    );
    if (name === null) return; // cancelled
    try {
      await routerApi.rename(c.mac, name.trim());
      setClients((prev) =>
        prev
          ? prev.map((x) =>
              x.mac === c.mac ? { ...x, custom_name: name.trim() } : x,
            )
          : prev,
      );
      setToast(name.trim() ? `Renamed to ${name.trim()}` : 'Name cleared');
    } catch (e) {
      window.alert('Rename failed: ' + (e as Error).message);
    }
  };

  const doCopy = (text: string, label: string) => {
    copyToClipboard(text);
    setToast(`Copied ${label}`);
  };

  if (!scan && !router) {
    return (
      <p className="text-xs text-muted-foreground/65 italic px-1">
        Discovering LAN…
      </p>
    );
  }

  const useRouterClients = router?.configured && clients !== null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4 space-y-3 relative">
      {/* ── Topology header: router → server ──────────────────── */}
      <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-1">
        <NodePill
          icon={<RouterIcon size={14} />}
          accent="#60a5fa"
          title={
            rs?.model || gateway?.custom_name || gateway?.hostname || 'Router'
          }
          subtitle={scan?.gateway || rs?.lan_ip || '—'}
          badge={
            router?.configured
              ? routerOnline
                ? 'online'
                : 'auth?'
              : undefined
          }
        />
        <Connector />
        <NodePill
          icon={<Server size={14} />}
          accent="#a78bfa"
          title={self?.custom_name || self?.hostname || 'Home Server'}
          subtitle={scan?.self_ip || '—'}
          highlight
        />
        {useRouterClients && (
          <>
            <Connector />
            <div className="self-center text-xs text-muted-foreground/70 whitespace-nowrap">
              {sortedClients.filter((c) => c.online).length}/
              {sortedClients.length} devices online
            </div>
          </>
        )}
      </div>

      {/* ── Router stats + actions strip ──────────────────────── */}
      {router?.configured ? (
        <div className="rounded-lg border border-border/20 bg-background/30 px-3 py-2 flex items-center gap-3 flex-wrap text-xs">
          {rs ? (
            <>
              <Stat
                label="WAN"
                value={rs.wan_status || '—'}
                mono
                accent={rs.wan_status === 'Connected' ? 'good' : 'muted'}
              />
              <Sep />
              <Stat label="WAN IP" value={rs.wan_ip || '—'} mono />
              <Sep />
              <Stat
                label="Uptime"
                value={rs.uptime_sec ? formatUptime(rs.uptime_sec) : '—'}
              />
              <Sep />
              <Stat
                label="Clients"
                value={
                  rs.client_count != null
                    ? `${rs.client_count} (${rs.wired_count || 0}w · ${
                        (rs.wireless_2g_count || 0) +
                        (rs.wireless_5g_count || 0)
                      } wifi)`
                    : '—'
                }
              />
              {rs.firmware && (
                <>
                  <Sep />
                  <Stat label="FW" value={rs.firmware} mono />
                </>
              )}
            </>
          ) : (
            <span className="text-muted-foreground/70 italic">
              Router connected but no status yet…
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <ActionBtn
              icon={
                busy === 'wifi' ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Wifi size={11} />
                )
              }
              label="Restart WiFi"
              onClick={doRestartWifi}
              disabled={busy !== null}
            />
            <ActionBtn
              icon={
                busy === 'reboot' ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Power size={11} />
                )
              }
              label="Reboot"
              onClick={doReboot}
              disabled={busy !== null}
              danger
            />
            <button
              onClick={loadAll}
              title="Refresh"
              aria-label="Refresh"
              className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
              <RefreshCw size={11} />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => gotoPage('settings', { tab: 'router' })}
          className="w-full rounded-lg border border-dashed border-border/25 bg-background/20 px-3 py-2 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-background/40 transition-colors flex items-center justify-center gap-1.5">
          <Settings size={11} />
          Connect your ASUS router for live WAN, clients and per-device actions.
        </button>
      )}

      {/* ── Connected devices ─────────────────────────────────── */}
      {useRouterClients ? (
        <div className="rounded-lg border border-border/20 bg-background/20">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/15">
            <span className="text-xs uppercase tracking-wider text-muted-foreground/70 font-medium">
              Connected devices
            </span>
            <button
              onClick={() => setShowOffline((v) => !v)}
              title={showOffline ? 'Hide offline devices' : 'Show offline devices'}
              className={`text-xs px-1.5 py-0.5 rounded border ${
                showOffline
                  ? 'border-border/40 bg-white/5 text-foreground/80'
                  : 'border-border/20 text-muted-foreground/70 hover:text-foreground'
              }`}>
              {showOffline ? 'all' : 'online only'}
            </button>
            <div className="ml-auto relative">
              <Search
                size={10}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/65 pointer-events-none"
              />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter…"
                className="bg-background/40 border border-border/25 rounded pl-5 pr-2 py-0.5 text-xs w-28 sm:w-40 focus:outline-none focus:border-violet-400/40"
              />
            </div>
          </div>
          {visibleClients.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground/70 italic">
              {filter ? 'No matches.' : 'No clients reported by router yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-border/10">
              {visibleClients.map((c) => (
                <ClientRow
                  key={c.mac}
                  c={c}
                  wolBusy={wolBusy === c.mac}
                  blockBusy={blockBusy === c.mac}
                  onWol={() =>
                    doWol(c.mac, c.custom_name || c.nickname || c.hostname || c.vendor || c.ip || c.mac)
                  }
                  onCopyIp={() => c.ip && doCopy(c.ip, 'IP')}
                  onCopyMac={() => doCopy(c.mac, 'MAC')}
                  onBlock={() => doBlock(c)}
                  onRename={() => doRename(c)}
                />
              ))}
            </ul>
          )}
          {sortedClients.length > 12 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full px-3 py-1.5 text-xs text-muted-foreground/70 hover:text-foreground border-t border-border/10 hover:bg-white/[0.02]">
              {showAll
                ? 'Show fewer'
                : `Show all ${sortedClients.length} devices`}
            </button>
          )}
        </div>
      ) : (
        leaves.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {leaves.map((d) => (
              <LeafPill key={d.mac + d.ip} d={d} />
            ))}
          </div>
        )
      )}

      {/* ── Toast ─────────────────────────────────────────────── */}
      {toast && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded bg-emerald-500/15 border border-emerald-400/30 text-xs text-emerald-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── Per-client row with inline actions ─────────────────────── */

function ClientRow({
  c,
  wolBusy,
  blockBusy,
  onWol,
  onCopyIp,
  onCopyMac,
  onBlock,
  onRename,
}: {
  c: RouterClient;
  wolBusy: boolean;
  blockBusy: boolean;
  onWol: () => void;
  onCopyIp: () => void;
  onCopyMac: () => void;
  onBlock: () => void;
  onRename: () => void;
}) {
  const label = c.custom_name || c.nickname || c.hostname || c.vendor || c.ip || c.mac;
  const ifaceColor =
    c.iface === 'wired'
      ? 'text-sky-300/85 border-sky-500/30 bg-sky-500/10'
      : c.iface?.startsWith('5G')
        ? 'text-violet-300/85 border-violet-500/30 bg-violet-500/10'
        : c.iface?.startsWith('2G')
          ? 'text-amber-300/85 border-amber-500/30 bg-amber-500/10'
          : 'text-muted-foreground/70 border-border/30 bg-background/40';

  return (
    <li className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.02] group">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          c.online ? 'bg-emerald-400' : 'bg-zinc-600'
        }`}
        title={c.online ? 'Online' : 'Offline'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-foreground/85 truncate">
            {label}
          </span>
          {c.iface && (
            <span
              className={`text-xs px-1 py-px rounded border tabular-nums ${ifaceColor}`}>
              {c.iface}
            </span>
          )}
          {c.iface !== 'wired' && c.online && c.rssi !== 0 && c.rssi != null && (
            <span
              className="text-xs text-muted-foreground/70 font-mono flex items-center gap-0.5"
              title={`Signal ${c.rssi} dBm`}>
              <Signal size={8} /> {c.rssi}
            </span>
          )}
          {c.guest && (
            <span className="text-xs px-1 py-px rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">
              guest
            </span>
          )}
          {c.blocked && (
            <span className="text-xs px-1 py-px rounded border border-rose-500/40 bg-rose-500/15 text-rose-200">
              blocked
            </span>
          )}
          {c.internet === false && !c.blocked && (
            <span className="text-xs px-1 py-px rounded border border-rose-500/30 bg-rose-500/10 text-rose-200">
              no internet
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/70 font-mono tabular-nums">
          {c.ip && <span>{c.ip}</span>}
          <span className="opacity-60">{c.mac}</span>
        </div>
      </div>

      {/* Actions — visible on touch (`<sm`), hover on desktop */}
      <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onRename}
          title="Rename"
          aria-label="Rename"
          className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
          <Pencil size={11} />
        </button>
        {c.ip && (
          <a
            href={`http://${c.ip}`}
            target="_blank"
            rel="noreferrer"
            title={`Open http://${c.ip}`}
            aria-label={`Open ${c.ip}`}
            className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
            <ExternalLink size={11} />
          </a>
        )}
        {c.ip && (
          <button
            onClick={onCopyIp}
            title="Copy IP"
            aria-label="Copy IP"
            className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5">
            <Copy size={11} />
          </button>
        )}
        <button
          onClick={onCopyMac}
          title="Copy MAC"
          aria-label="Copy MAC"
          className="p-1.5 rounded text-muted-foreground/70 hover:text-foreground hover:bg-white/5 hidden sm:inline-flex">
          <span className="text-xs font-mono">MAC</span>
        </button>
        <button
          onClick={onWol}
          disabled={wolBusy}
          title="Send Wake-on-LAN"
          aria-label="Wake on LAN"
          className="p-1.5 rounded text-amber-300/80 hover:text-amber-200 hover:bg-amber-500/10 disabled:opacity-40">
          {wolBusy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Zap size={11} />
          )}
        </button>
        <button
          onClick={onBlock}
          disabled={blockBusy}
          title={c.blocked ? 'Unblock internet' : 'Block internet'}
          aria-label={c.blocked ? 'Unblock internet' : 'Block internet'}
          className={`p-1.5 rounded disabled:opacity-40 ${
            c.blocked
              ? 'text-emerald-300/85 hover:text-emerald-200 hover:bg-emerald-500/10'
              : 'text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/10'
          }`}>
          {blockBusy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : c.blocked ? (
            <CheckCircle2 size={11} />
          ) : (
            <Ban size={11} />
          )}
        </button>
      </div>
    </li>
  );
}

/* ── Topology atoms ─────────────────────────────────────────── */

function NodePill({
  icon,
  accent,
  title,
  subtitle,
  highlight,
  badge,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  subtitle: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`relative flex flex-col items-center gap-1 px-3 py-2 rounded-lg border shrink-0 ${
        highlight
          ? 'border-border/40 bg-card/60'
          : 'border-border/25 bg-card/30'
      }`}>
      <span style={{ color: accent }}>{icon}</span>
      <span className="text-xs font-medium text-foreground/85 truncate max-w-[110px] text-center">
        {title}
      </span>
      <span className="text-xs text-muted-foreground/70 font-mono tabular-nums">
        {subtitle}
      </span>
      {badge && (
        <span
          className={`absolute -top-1.5 -right-1.5 text-xs px-1 py-px rounded border ${
            badge === 'online'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
              : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
          }`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function LeafPill({ d }: { d: NetworkDevice }) {
  const label = d.custom_name || d.hostname || d.vendor || d.ip;
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded border border-border/15 bg-card/20"
      title={`${label}\n${d.ip}\n${d.mac}`}>
      <Wifi size={9} className="text-muted-foreground/70 shrink-0" />
      <span className="text-xs text-foreground/80 truncate">{label}</span>
    </div>
  );
}

function Connector() {
  return (
    <div className="self-center flex flex-col items-center shrink-0">
      <div className="w-6 h-px bg-border/40" />
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: 'good' | 'muted';
}) {
  const color =
    accent === 'good'
      ? 'text-emerald-300/85'
      : accent === 'muted'
        ? 'text-muted-foreground/65'
        : 'text-foreground/85';
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-xs uppercase tracking-wider text-muted-foreground/65">
        {label}
      </span>
      <span className={`${mono ? 'font-mono' : ''} ${color}`}>{value}</span>
    </span>
  );
}

function Sep() {
  return <span className="text-border/50">·</span>;
}

function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors disabled:opacity-40 ${
        danger
          ? 'border-rose-500/30 text-rose-200/85 hover:bg-rose-500/10'
          : 'border-border/30 text-foreground/80 hover:bg-white/5'
      }`}>
      {icon} {label}
    </button>
  );
}
