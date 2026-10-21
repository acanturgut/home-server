import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  Ban,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Signal,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import {
  routerApi,
  type RouterClient,
  type RouterStatus,
} from '@/features/router';
import { copyToClipboard, formatUptime, gotoPage } from '@/lib/format';

/**
 * Simplified, focused Network page.
 *
 * Layout (top → bottom):
 *   1. KPI strip — WAN, Internet IP, Uptime, Devices online
 *   2. Router controls (Restart Wi-Fi · Reboot · Refresh)
 *   3. Devices list (search · show offline · primary actions always visible)
 *
 * The previous page squeezed a topology pill, a stats row, an HTTP-clients
 * widget and a hover-only action menu into two cramped cards. This rewrite
 * gives each concern its own row, makes targets touch-friendly, and uses a
 * single source of truth (router clients).
 */

export function NetworkPage() {
  const [router, setRouter] = useState<{
    configured: boolean;
    status?: RouterStatus;
  } | null>(null);
  const [clients, setClients] = useState<RouterClient[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'reboot' | 'wifi' | 'refresh' | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [showOffline, setShowOffline] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([routerApi.status(), routerApi.clients()]).then(([rt, cs]) => {
        if (rt) setRouter(rt);
        setClients(cs?.configured ? cs.clients || [] : null);
        setLoading(false);
      }),
    [],
  );

  useEffect(() => {
    reload();
    const id = setInterval(reload, 30_000);
    return () => clearInterval(id);
  }, [reload]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const rs = router?.status;
  const wanConnected = (rs?.wan_status || '').toLowerCase() === 'connected';

  // Sort + filter the device list. Online first, then by interface, then name.
  const sortedClients = useMemo(() => {
    if (!clients) return [];
    const ifaceRank: Record<string, number> = {
      wired: 0,
      '6G': 0,
      '5G': 1,
      '5G-2': 1,
      '2G': 2,
    };
    const visible = showOffline ? clients : clients.filter((c) => c.online);
    const list = [...visible].sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const ra = ifaceRank[a.iface || ''] ?? 9;
      const rb = ifaceRank[b.iface || ''] ?? 9;
      if (ra !== rb) return ra - rb;
      return labelOf(a).toLowerCase().localeCompare(labelOf(b).toLowerCase());
    });
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter((c) => {
      const hay = [
        c.custom_name,
        c.nickname,
        c.hostname,
        c.vendor,
        c.ip,
        c.mac,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [clients, filter, showOffline]);

  const onlineCount = clients?.filter((c) => c.online).length ?? 0;
  const totalCount = clients?.length ?? 0;

  const showToast = (msg: string) => setToast(msg);

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
      showToast('Reboot signal sent');
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
      showToast('Wireless restarting');
    } catch (e) {
      window.alert('Restart Wi-Fi failed: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doRefresh = async () => {
    setBusy('refresh');
    try {
      await reload();
    } finally {
      setBusy(null);
    }
  };

  const doBlock = async (c: RouterClient) => {
    const label = labelOf(c);
    const next = !c.blocked;
    if (
      next &&
      !window.confirm(`Block ${label} from the internet via the router?`)
    )
      return;
    setRowBusy(c.mac);
    try {
      await routerApi.block(c.mac, next, label);
      setClients((prev) =>
        prev
          ? prev.map((x) => (x.mac === c.mac ? { ...x, blocked: next } : x))
          : prev,
      );
      showToast(next ? `Blocked ${label}` : `Unblocked ${label}`);
    } catch (e) {
      window.alert('Block failed: ' + (e as Error).message);
    } finally {
      setRowBusy(null);
    }
  };

  const doWol = async (c: RouterClient) => {
    setRowBusy(c.mac);
    try {
      await routerApi.wol(c.mac);
      showToast(`Wake-on-LAN sent → ${labelOf(c)}`);
    } catch (e) {
      window.alert('WoL failed: ' + (e as Error).message);
    } finally {
      setRowBusy(null);
    }
  };

  const doRename = async (c: RouterClient) => {
    const current = c.custom_name || c.nickname || c.hostname || '';
    const name = window.prompt(`Display name for ${c.mac}:`, current);
    if (name === null) return;
    try {
      await routerApi.rename(c.mac, name.trim());
      setClients((prev) =>
        prev
          ? prev.map((x) =>
              x.mac === c.mac ? { ...x, custom_name: name.trim() } : x,
            )
          : prev,
      );
      showToast(name.trim() ? `Renamed to ${name.trim()}` : 'Name cleared');
    } catch (e) {
      window.alert('Rename failed: ' + (e as Error).message);
    }
  };

  // ── Render ──

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground/70 italic">Loading network…</p>
    );
  }

  if (!router?.configured) {
    return (
      <div className="rounded-xl border border-dashed border-border/30 bg-card/20 p-8 text-center space-y-3">
        <Wifi
          size={32}
          className="mx-auto text-muted-foreground/65"
          strokeWidth={1.5}
        />
        <h3 className="text-sm font-medium text-foreground/85">
          Connect your router
        </h3>
        <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
          Add ASUS router credentials to see live WAN status, connected
          devices, and per-device controls.
        </p>
        <button
          onClick={() => gotoPage('settings', { tab: 'router' })}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/15 hover:bg-primary/25 text-primary text-xs font-medium transition-colors">
          <SettingsIcon size={12} /> Configure router
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative">
      {/* ── KPI strip ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi
          label="Internet"
          value={rs?.wan_status || '—'}
          icon={<Globe size={14} />}
          accent={wanConnected ? 'good' : 'warn'}
          mono={false}
        />
        <Kpi
          label="Public IP"
          value={rs?.wan_ip || '—'}
          icon={<Globe size={14} />}
          mono
        />
        <Kpi
          label="Uptime"
          value={rs?.uptime_sec ? formatUptime(rs.uptime_sec) : '—'}
          icon={<Power size={14} />}
        />
        <Kpi
          label="Devices"
          value={`${onlineCount}/${totalCount}`}
          sub="online"
          icon={<Users size={14} />}
          accent="good"
        />
      </div>

      {/* ── Router meta + controls ───────────────────────────── */}
      <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-foreground/80 min-w-0">
          <Wifi size={13} className="text-sky-400/85 shrink-0" />
          <span className="font-medium truncate">{rs?.model || 'Router'}</span>
          {rs?.firmware && (
            <span className="text-xs text-muted-foreground/70 font-mono shrink-0">
              {rs.firmware}
            </span>
          )}
          {rs?.lan_ip && (
            <span className="text-xs text-muted-foreground/70 font-mono shrink-0">
              {rs.lan_ip}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <ToolbarBtn
            icon={
              busy === 'refresh' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )
            }
            label="Refresh"
            onClick={doRefresh}
            disabled={busy !== null}
          />
          <ToolbarBtn
            icon={
              busy === 'wifi' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wifi size={13} />
              )
            }
            label="Restart Wi-Fi"
            onClick={doRestartWifi}
            disabled={busy !== null}
          />
          <ToolbarBtn
            icon={
              busy === 'reboot' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Power size={13} />
              )
            }
            label="Reboot"
            onClick={doReboot}
            disabled={busy !== null}
            danger
          />
        </div>
      </div>

      {/* ── Devices ──────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/40 bg-card/40">
        <header className="px-4 py-3 border-b border-border/30 space-y-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-emerald-400/85 shrink-0" />
            <h3 className="text-sm font-semibold text-foreground">Devices</h3>
            <span className="text-xs text-muted-foreground/75 tabular-nums">
              {sortedClients.length}
              {filter ? ' match' : ''}
            </span>
            <label className="ml-auto inline-flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground/85 hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={showOffline}
                onChange={(e) => setShowOffline(e.target.checked)}
                className="accent-primary h-3.5 w-3.5"
              />
              Show offline
            </label>
          </div>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/65 pointer-events-none"
            />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search devices…"
              className="w-full bg-background/50 border border-border/40 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:border-primary/50 placeholder:text-muted-foreground/55"
            />
          </div>
        </header>

        {sortedClients.length === 0 ? (
          <p className="px-3 py-8 text-xs text-muted-foreground/70 italic text-center">
            {filter
              ? 'No devices match your search.'
              : 'No devices reported by the router yet.'}
          </p>
        ) : (
          <ul className="divide-y divide-border/10">
            {sortedClients.map((c) => (
              <DeviceRow
                key={c.mac}
                client={c}
                busy={rowBusy === c.mac}
                onBlock={() => doBlock(c)}
                onWol={() => doWol(c)}
                onRename={() => doRename(c)}
                onCopyIp={() => {
                  if (c.ip) {
                    copyToClipboard(c.ip);
                    showToast('Copied IP');
                  }
                }}
                onCopyMac={() => {
                  copyToClipboard(c.mac);
                  showToast('Copied MAC');
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-400/40 text-xs text-emerald-200 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Helpers / atoms ───────────────────────────────────────────

function labelOf(c: RouterClient): string {
  return (
    c.custom_name || c.nickname || c.hostname || c.vendor || c.ip || c.mac
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  mono,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  mono?: boolean;
  accent?: 'good' | 'warn';
}) {
  const valueColor =
    accent === 'good'
      ? 'text-emerald-300/90'
      : accent === 'warn'
        ? 'text-amber-300/90'
        : 'text-foreground/90';
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground/70">
        <span className="text-muted-foreground/65">{icon}</span>
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-medium truncate ${
          mono ? 'font-mono' : ''
        } ${valueColor}`}
        title={value}>
        {value}
        {sub && (
          <span className="ml-1 text-xs text-muted-foreground/70 font-normal">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-40 ${
        danger
          ? 'border-rose-500/30 text-rose-200/90 hover:bg-rose-500/10'
          : 'border-border/30 text-foreground/85 hover:bg-white/5'
      }`}>
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function DeviceRow({
  client: c,
  busy,
  onBlock,
  onWol,
  onRename,
  onCopyIp,
  onCopyMac,
}: {
  client: RouterClient;
  busy: boolean;
  onBlock: () => void;
  onWol: () => void;
  onRename: () => void;
  onCopyIp: () => void;
  onCopyMac: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = labelOf(c);
  const ifaceClass =
    c.iface === 'wired'
      ? 'text-sky-300/85 border-sky-500/30 bg-sky-500/10'
      : c.iface?.startsWith('5G') || c.iface === '6G'
        ? 'text-violet-300/85 border-violet-500/30 bg-violet-500/10'
        : c.iface?.startsWith('2G')
          ? 'text-amber-300/85 border-amber-500/30 bg-amber-500/10'
          : 'text-muted-foreground/65 border-border/30 bg-background/40';

  return (
    <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/2 transition-colors">
      {/* status dot */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${
          c.online ? 'bg-emerald-400' : 'bg-zinc-600'
        }`}
        title={c.online ? 'Online' : 'Offline'}
      />

      {/* identity */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground/90 truncate max-w-56">
            {label}
          </span>
          {c.iface && (
            <span
              className={`text-xs px-1.5 py-px rounded border font-mono ${ifaceClass}`}>
              {c.iface}
            </span>
          )}
          {c.iface !== 'wired' &&
            c.online &&
            c.rssi != null &&
            c.rssi !== 0 && (
              <span
                className="text-xs text-muted-foreground/65 font-mono inline-flex items-center gap-0.5"
                title={`Signal ${c.rssi} dBm`}>
                <Signal size={9} />
                {c.rssi}
              </span>
            )}
          {c.guest && (
            <span className="text-xs px-1.5 py-px rounded border border-amber-500/30 bg-amber-500/10 text-amber-200">
              guest
            </span>
          )}
          {c.blocked && (
            <span className="text-xs px-1.5 py-px rounded border border-rose-500/40 bg-rose-500/15 text-rose-200">
              blocked
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground/70 font-mono tabular-nums">
          {c.ip && (
            <button
              onClick={onCopyIp}
              title="Copy IP"
              className="hover:text-foreground/80 transition-colors">
              {c.ip}
            </button>
          )}
          <button
            onClick={onCopyMac}
            title="Copy MAC"
            className="hover:text-foreground/80 transition-colors opacity-70">
            {c.mac}
          </button>
        </div>
      </div>

      {/* primary actions — always visible */}
      <div className="flex items-center gap-1 shrink-0">
        {c.ip && (
          <a
            href={`http://${c.ip}`}
            target="_blank"
            rel="noreferrer"
            title={`Open http://${c.ip}`}
            aria-label={`Open ${c.ip}`}
            className="hidden sm:inline-flex p-1.5 rounded text-muted-foreground/65 hover:text-foreground hover:bg-white/5">
            <ExternalLink size={13} />
          </a>
        )}
        <button
          onClick={onBlock}
          disabled={busy}
          title={c.blocked ? 'Unblock internet' : 'Block internet'}
          aria-label={c.blocked ? 'Unblock' : 'Block'}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-40 ${
            c.blocked
              ? 'text-emerald-200/90 hover:bg-emerald-500/10 border border-emerald-500/25'
              : 'text-rose-200/85 hover:bg-rose-500/10 border border-rose-500/25'
          }`}>
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : c.blocked ? (
            <CheckCircle2 size={12} />
          ) : (
            <Ban size={12} />
          )}
          <span className="hidden sm:inline">
            {c.blocked ? 'Unblock' : 'Block'}
          </span>
        </button>

        {/* overflow menu (Rename / WoL) — bottom-sheet on mobile, popover on desktop */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            title="More"
            aria-label="More actions"
            className="p-2 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-white/5 active:bg-white/10">
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <>
              {/* backdrop */}
              <div
                className="fixed inset-0 z-30 sm:bg-transparent bg-black/60 backdrop-blur-sm sm:backdrop-blur-none animate-in fade-in duration-150"
                onClick={() => setMenuOpen(false)}
              />

              {/* mobile: bottom sheet */}
              <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border-t border-border/40 bg-card shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
                {/* grab handle */}
                <div className="flex justify-center pt-2.5 pb-1">
                  <span className="block h-1 w-10 rounded-full bg-border/60" />
                </div>

                {/* device summary header */}
                <div className="px-5 pt-2 pb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        c.online ? 'bg-emerald-400' : 'bg-zinc-600'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold text-foreground truncate">
                        {label}
                      </div>
                      <div className="text-xs text-muted-foreground/80 font-mono mt-0.5 truncate">
                        {c.ip ? `${c.ip} · ` : ''}{c.mac}
                      </div>
                    </div>
                    {c.iface && (
                      <span className={`text-xs px-2 py-1 rounded border font-mono shrink-0 ${ifaceClass}`}>
                        {c.iface}
                      </span>
                    )}
                  </div>
                </div>

                {/* actions */}
                <div className="px-3 pb-3 space-y-1">
                  <SheetItem
                    icon={c.blocked ? <CheckCircle2 size={18} /> : <Ban size={18} />}
                    label={c.blocked ? 'Unblock internet' : 'Block internet'}
                    tone={c.blocked ? 'good' : 'danger'}
                    onClick={() => {
                      setMenuOpen(false);
                      onBlock();
                    }}
                  />
                  {c.ip && (
                    <SheetItem
                      icon={<ExternalLink size={18} />}
                      label="Open in browser"
                      sublabel={`http://${c.ip}`}
                      onClick={() => {
                        setMenuOpen(false);
                        window.open(`http://${c.ip}`, '_blank');
                      }}
                    />
                  )}
                  <SheetItem
                    icon={<Pencil size={18} />}
                    label="Rename"
                    onClick={() => {
                      setMenuOpen(false);
                      onRename();
                    }}
                  />
                  <SheetItem
                    icon={<Zap size={18} />}
                    label="Wake on LAN"
                    sublabel="Send magic packet"
                    onClick={() => {
                      setMenuOpen(false);
                      onWol();
                    }}
                  />
                  {c.ip && (
                    <SheetItem
                      icon={<Globe size={18} />}
                      label="Copy IP"
                      sublabel={c.ip}
                      onClick={() => {
                        setMenuOpen(false);
                        onCopyIp();
                      }}
                    />
                  )}
                  <SheetItem
                    icon={<Wifi size={18} />}
                    label="Copy MAC"
                    sublabel={c.mac}
                    onClick={() => {
                      setMenuOpen(false);
                      onCopyMac();
                    }}
                  />
                </div>

                <button
                  onClick={() => setMenuOpen(false)}
                  className="w-full px-4 py-4 text-sm font-medium text-foreground/85 border-t border-border/30 active:bg-white/5">
                  Cancel
                </button>
              </div>

              {/* desktop: anchored popover */}
              <div className="hidden sm:block absolute right-0 top-full mt-1 z-40 min-w-44 rounded-lg border border-border/40 bg-popover shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <MenuItem
                  icon={<Pencil size={12} />}
                  label="Rename"
                  onClick={() => {
                    setMenuOpen(false);
                    onRename();
                  }}
                />
                <MenuItem
                  icon={<Zap size={12} />}
                  label="Wake on LAN"
                  onClick={() => {
                    setMenuOpen(false);
                    onWol();
                  }}
                />
                {c.ip && (
                  <MenuItem
                    icon={<ExternalLink size={12} />}
                    label="Open in browser"
                    onClick={() => {
                      setMenuOpen(false);
                      window.open(`http://${c.ip}`, '_blank');
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 text-xs text-foreground/85 hover:bg-white/5 text-left">
      <span className="text-muted-foreground/65">{icon}</span>
      {label}
    </button>
  );
}

function SheetItem({
  icon,
  label,
  sublabel,
  tone,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  tone?: 'good' | 'danger';
  onClick: () => void;
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-200'
      : tone === 'good'
        ? 'text-emerald-200'
        : 'text-foreground/90';
  const iconBg =
    tone === 'danger'
      ? 'bg-rose-500/15 text-rose-300'
      : tone === 'good'
        ? 'bg-emerald-500/15 text-emerald-300'
        : 'bg-white/5 text-muted-foreground';
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl active:bg-white/10 text-left transition-colors">
      <span className={`shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full ${iconBg}`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${toneClass}`}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-xs text-muted-foreground/75 font-mono truncate mt-0.5">
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}
