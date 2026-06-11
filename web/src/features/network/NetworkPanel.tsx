import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, RefreshCw, Wifi, X, Check } from 'lucide-react';
import {
  networkApi,
  type NetworkDevice,
  type NetworkScan,
} from '@/features/network/api';
import { relTime } from '@/lib/format';

/**
 * LAN devices view. Reads /proc/net/arp on the server (host-network container)
 * and enriches with reverse DNS + a small inline OUI vendor table. Custom
 * per-MAC display names are persisted server-side.
 */
export function NetworkPanel() {
  const [scan, setScan] = useState<NetworkScan | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'online'>('online');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await networkApi.list();
      if (r) setScan(r);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const devices = useMemo(() => {
    if (!scan) return [];
    let out: NetworkDevice[] = scan.devices;
    if (filter === 'online') out = out.filter((d) => d.online);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      out = out.filter(
        (d) =>
          d.ip.includes(needle) ||
          d.mac.toLowerCase().includes(needle) ||
          (d.hostname || '').toLowerCase().includes(needle) ||
          (d.custom_name || '').toLowerCase().includes(needle) ||
          (d.vendor || '').toLowerCase().includes(needle),
      );
    }
    return out;
  }, [scan, filter, q]);

  const onlineCount = scan?.devices.filter((d) => d.online).length ?? 0;
  const totalCount = scan?.devices.length ?? 0;

  const startEdit = (d: NetworkDevice) => {
    setEditing(d.mac);
    setDraft(d.custom_name || d.hostname || '');
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };
  const commitEdit = async (mac: string) => {
    try {
      await networkApi.rename(mac, draft.trim());
      cancelEdit();
      await load();
    } catch (e) {
      console.error('rename failed', e);
      window.alert('Rename failed: ' + (e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
            <Wifi size={14} className="text-muted-foreground/70" />
            Network
          </h2>
          <p className="text-xs text-muted-foreground/70">
            {scan
              ? `${onlineCount} online · ${totalCount} known${
                  scan.gateway ? ` · gateway ${scan.gateway}` : ''
                } · scanned ${relTime(new Date(scan.scanned_at).getTime())}`
              : 'Scanning…'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/25 hover:border-border/50 hover:bg-white/[0.03] text-muted-foreground/75 hover:text-foreground/90 transition-colors disabled:opacity-50">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-0.5 rounded-md border border-border/20 bg-muted/15 p-0.5">
          <FilterBtn
            active={filter === 'online'}
            onClick={() => setFilter('online')}
            label="Online"
            count={onlineCount}
          />
          <FilterBtn
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            label="All"
            count={totalCount}
          />
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search IP, MAC, name or vendor…"
          className="flex-1 min-w-[180px] text-xs px-2.5 py-1 rounded-md border border-border/20 bg-card/30 placeholder:text-muted-foreground/65 focus:outline-none focus:border-border/45"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border/20 bg-card/30 overflow-hidden">
        <div className="grid grid-cols-[110px_1fr_140px_100px_50px] gap-3 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground/70 border-b border-border/15">
          <span>IP</span>
          <span>Name</span>
          <span>MAC</span>
          <span>Vendor</span>
          <span className="text-right">State</span>
        </div>
        {devices.length === 0 ? (
          <p className="text-xs text-muted-foreground/65 italic text-center py-10">
            {scan ? 'No devices match.' : 'Reading ARP table…'}
          </p>
        ) : (
          <div className="divide-y divide-border/10">
            {devices.map((d) => {
              const isEditing = editing === d.mac;
              const display =
                d.custom_name ||
                d.hostname ||
                (scan?.gateway === d.ip ? 'Router' : '');
              return (
                <div
                  key={d.mac + d.ip}
                  className={`grid grid-cols-[110px_1fr_140px_100px_50px] gap-3 px-3 py-1.5 items-center text-xs transition-colors hover:bg-white/[0.02] ${
                    d.online ? '' : 'opacity-55'
                  }`}>
                  <span className="font-mono tabular-nums text-foreground/85">
                    {d.ip}
                  </span>
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit(d.mac);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        placeholder={d.hostname || 'Custom name'}
                        className="flex-1 text-xs px-1.5 py-0.5 rounded border border-border/40 bg-background focus:outline-none focus:border-primary/50"
                      />
                      <button
                        onClick={() => commitEdit(d.mac)}
                        className="p-1 rounded text-emerald-400/80 hover:bg-white/5"
                        title="Save">
                        <Check size={11} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="p-1 rounded text-muted-foreground/60 hover:bg-white/5"
                        title="Cancel">
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(d)}
                      className="group flex items-center gap-1.5 min-w-0 text-left"
                      title="Click to rename">
                      <span
                        className={`truncate ${
                          d.custom_name
                            ? 'text-foreground/90 font-medium'
                            : display
                              ? 'text-foreground/75'
                              : 'text-muted-foreground/35'
                        }`}>
                        {display || 'unnamed'}
                      </span>
                      {d.custom_name && d.hostname && (
                        <span className="text-xs text-muted-foreground/35 truncate">
                          {d.hostname}
                        </span>
                      )}
                      <Pencil
                        size={9}
                        className="opacity-0 group-hover:opacity-60 text-muted-foreground shrink-0 transition-opacity"
                      />
                    </button>
                  )}
                  <span className="font-mono text-xs text-muted-foreground/65 truncate">
                    {d.mac}
                  </span>
                  <span className="text-muted-foreground/70 truncate">
                    {d.vendor || (
                      <span className="text-muted-foreground/30">—</span>
                    )}
                  </span>
                  <span className="text-right">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full ${
                        d.online ? 'bg-emerald-400' : 'bg-muted-foreground/30'
                      }`}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-0.5 text-xs rounded transition-colors ${
        active
          ? 'bg-card/80 text-foreground/90'
          : 'text-muted-foreground/65 hover:text-foreground/85'
      }`}>
      {label}{' '}
      <span className="text-muted-foreground/65 tabular-nums">{count}</span>
    </button>
  );
}
