import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  RotateCcw,
  Wifi,
  WifiOff,
  Thermometer,
  Layers,
  Clock,
  Fan,
  AlertTriangle,
  Printer as PrinterIcon,
  Camera as CameraIcon,
  CameraOff,
  Pause,
  Play,
  Square,
  Lightbulb,
  Gauge,
  Home as HomeIcon,
  Upload,
  Download,
  FileText,
  PlayCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  bambuApi,
  type BambuPrinter,
  type BambuStatus,
  type BambuFile,
  type BambuPrintRequest,
} from '@/features/bambu/api';

export function BambuPage() {
  const [printers, setPrinters] = useState<BambuPrinter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<BambuPrinter | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErrorMsg(null);
    const list = await bambuApi.list();
    const items = Array.isArray(list) ? list : [];
    setPrinters(items);
    if (items.length > 0 && !items.find((p) => p.id === selectedId)) {
      setSelectedId(items[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const selected = useMemo(
    () => printers.find((p) => p.id === selectedId) ?? null,
    [printers, selectedId],
  );

  const onDelete = async (p: BambuPrinter) => {
    if (!confirm(`Remove printer "${p.name}"?`)) return;
    try {
      await bambuApi.remove(p.id);
      await refresh();
    } catch (err: any) {
      setErrorMsg(err?.message ?? String(err));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        <Loader2 className="animate-spin mr-2" size={16} /> Loading printers…
      </div>
    );
  }

  if (printers.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <EmptyState onAdd={() => setShowAdd(true)} />
        {showAdd && (
          <PrinterDialog
            onClose={() => setShowAdd(false)}
            onSaved={() => {
              setShowAdd(false);
              refresh();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {printers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border transition-colors ${
                p.id === selectedId
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/30 text-foreground/80 border-border/40 hover:bg-muted/60'
              }`}>
              <PrinterIcon size={14} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(selected)}>
                <Pencil size={14} className="mr-1.5" /> Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(selected)}>
                <Trash2 size={14} className="mr-1.5" /> Remove
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} className="mr-1.5" /> Add printer
          </Button>
        </div>
      </div>

      {selected && <PrinterView printer={selected} />}

      {showAdd && (
        <PrinterDialog
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
      {editing && (
        <PrinterDialog
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-10 text-center">
      <PrinterIcon
        size={36}
        className="mx-auto mb-4 text-muted-foreground/60"
      />
      <h2 className="text-lg font-semibold">No Bambu printers added yet</h2>
      <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-md mx-auto">
        Bambu printers must be in <span className="text-foreground">LAN Only
        Mode</span> (printer screen → Settings → Network). Have the LAN IP,
        Serial Number, and 8-digit Access Code from the printer's WLAN screen
        ready before continuing.
      </p>
      <Button onClick={onAdd}>
        <Plus size={14} className="mr-1.5" /> Add your printer
      </Button>
    </div>
  );
}

function PrinterView({ printer }: { printer: BambuPrinter }) {
  const [status, setStatus] = useState<BambuStatus | null>(null);
  const [cameraOn, setCameraOn] = useState(true);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const st = await bambuApi.status(printer.id);
      if (alive && st && typeof st === 'object' && 'progress' in st) {
        setStatus(st as BambuStatus);
      }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [printer.id]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CameraPanel
          printer={printer}
          on={cameraOn}
          onToggle={() => setCameraOn((v) => !v)}
        />
        <StatusPanel printer={printer} status={status} />
      </div>
      <ControlsPanel printer={printer} status={status} />
      <FilesPanel printer={printer} />
    </div>
  );
}

function CameraPanel({
  printer,
  on,
  onToggle,
}: {
  printer: BambuPrinter;
  on: boolean;
  onToggle: () => void;
}) {
  // Bust the cache on toggle so the browser reconnects to a fresh stream.
  const [nonce, setNonce] = useState(0);
  const reload = () => setNonce((n) => n + 1);

  const src = on ? `${bambuApi.cameraUrl(printer.id)}?n=${nonce}` : '';

  return (
    <div className="rounded-xl overflow-hidden border border-border/40 bg-black">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border/40">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CameraIcon size={12} />
          Live camera
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={reload} disabled={!on}>
            <RotateCcw size={12} className="mr-1" /> Reconnect
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {on ? (
              <>
                <CameraOff size={12} className="mr-1" /> Pause
              </>
            ) : (
              <>
                <CameraIcon size={12} className="mr-1" /> Play
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="aspect-video bg-black flex items-center justify-center">
        {on ? (
          <CameraStream src={src} key={src} />
        ) : (
          <div className="text-muted-foreground text-sm">Stream paused</div>
        )}
      </div>
    </div>
  );
}

function CameraStream({ src }: { src: string }) {
  const [errored, setErrored] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    setErrored(false);
  }, [src]);
  if (errored) {
    return (
      <div className="text-red-300 text-sm flex flex-col items-center gap-2 p-6 text-center">
        <AlertTriangle size={20} />
        Couldn't load the camera stream.
        <span className="text-xs text-muted-foreground">
          Check the Access Code, that the printer is on LAN Only mode, and
          that ffmpeg can reach <code>:322</code> on the printer.
        </span>
      </div>
    );
  }
  // <img> with a multipart MJPEG src works in every browser, including iOS Safari.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      ref={imgRef}
      src={src}
      alt="Bambu camera"
      className="w-full h-full object-contain"
      onError={() => setErrored(true)}
    />
  );
}

function StatusPanel({
  printer,
  status,
}: {
  printer: BambuPrinter;
  status: BambuStatus | null;
}) {
  if (!status) {
    return (
      <div className="rounded-xl border border-border/40 p-6 text-sm text-muted-foreground">
        Waiting for first MQTT report from {printer.name}…
      </div>
    );
  }

  const stateLabel = humanState(status);

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold flex items-center gap-2">
            {status.online ? (
              <Wifi size={14} className="text-emerald-400" />
            ) : (
              <WifiOff size={14} className="text-muted-foreground" />
            )}
            {stateLabel}
          </div>
          {status.subtask_name && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {status.subtask_name}
            </div>
          )}
          {!status.online && status.last_error && (
            <div className="text-xs text-red-400 mt-1">
              {status.last_error}
            </div>
          )}
        </div>
        {status.wifi_signal && (
          <div className="text-[11px] text-muted-foreground">
            Wi-Fi {status.wifi_signal}
          </div>
        )}
      </div>

      {status.progress > 0 || status.state === 'RUNNING' ? (
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{status.progress}%</span>
            <span>
              {status.layer_num}/{status.total_layers || '?'} layers ·{' '}
              {fmtRemaining(status.remaining_min)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-[width] duration-500"
              style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
            />
          </div>
          {status.stage_description && (
            <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <Layers size={10} /> {status.stage_description}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        <TempCard
          label="Nozzle"
          temp={status.nozzle_temper}
          target={status.nozzle_target}
        />
        <TempCard
          label="Bed"
          temp={status.bed_temper}
          target={status.bed_target}
        />
        <TempCard
          label="Chamber"
          temp={status.chamber_temper}
          target={0}
          hideTarget
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <FanCard label="Part" pct={status.fan_cool} />
        <FanCard label="Aux" pct={status.fan_aux} />
        <FanCard label="Chamber" pct={status.fan_chamber} />
      </div>

      {status.ams_trays && status.ams_trays.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            AMS
          </div>
          <div className="flex gap-2">
            {status.ams_trays.map((t) => (
              <div
                key={t.id}
                className="flex-1 rounded-md border border-border/40 p-2 text-[11px]">
                <div
                  className="h-3 w-full rounded-sm mb-1.5 border border-border/30"
                  style={{
                    background: t.color ? `#${t.color}` : 'transparent',
                  }}
                />
                <div className="truncate">{t.name || `Tray ${t.id + 1}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status.hms && status.hms.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-300">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle size={12} /> Active HMS warnings
          </div>
          {status.hms.map((h, i) => (
            <div key={i} className="font-mono text-[10px] mt-1 break-all">
              {h}
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
        {printer.host} · {printer.serial.slice(0, 6)}…
        {status.updated_at && (
          <>
            {' · '}
            <Clock size={9} className="inline mb-px" />{' '}
            {new Date(status.updated_at).toLocaleTimeString()}
          </>
        )}
      </div>
    </div>
  );
}

function TempCard({
  label,
  temp,
  target,
  hideTarget,
}: {
  label: string;
  temp: number;
  target: number;
  hideTarget?: boolean;
}) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-2 text-center">
      <div className="text-[10px] text-muted-foreground flex items-center justify-center gap-1">
        <Thermometer size={10} /> {label}
      </div>
      <div className="text-base font-semibold tabular-nums">
        {Math.round(temp)}°
      </div>
      {!hideTarget && target > 0 && (
        <div className="text-[10px] text-muted-foreground">→ {target}°</div>
      )}
    </div>
  );
}

function FanCard({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="rounded-md bg-muted/30 px-2 py-1.5 flex items-center justify-between">
      <span className="text-muted-foreground flex items-center gap-1">
        <Fan size={10} /> {label}
      </span>
      <span className="font-medium tabular-nums">{pct}%</span>
    </div>
  );
}

function ControlsPanel({
  printer,
  status,
}: {
  printer: BambuPrinter;
  status: BambuStatus | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nozzleTarget, setNozzleTarget] = useState('');
  const [bedTarget, setBedTarget] = useState('');
  const lightOn = !!status?.light_on;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setErr(null);
    try {
      await fn();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  const cmd = (action: string, args?: Record<string, unknown>) =>
    run(action, () => bambuApi.command(printer.id, action as any, args));

  const isPrinting = status?.state === 'RUNNING';
  const isPaused = status?.state === 'PAUSE' || status?.state === 'PAUSED';
  const offline = !status?.online;

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Controls</div>
        {busy && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 size={12} className="animate-spin" /> {busy}…
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {isPaused ? (
          <Button size="sm" disabled={offline} onClick={() => cmd('resume')}>
            <Play size={14} className="mr-1.5" /> Resume
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={offline || !isPrinting}
            onClick={() => cmd('pause')}>
            <Pause size={14} className="mr-1.5" /> Pause
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={offline || (!isPrinting && !isPaused)}
          onClick={() => {
            if (confirm('Stop the current print?')) cmd('stop');
          }}>
          <Square size={14} className="mr-1.5" /> Stop
        </Button>
        <Button
          size="sm"
          variant={lightOn ? 'default' : 'ghost'}
          disabled={offline}
          onClick={() => cmd('light', { on: !lightOn })}>
          <Lightbulb size={14} className="mr-1.5" /> Light {lightOn ? 'on' : 'off'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={offline || isPrinting}
          onClick={() => cmd('home')}>
          <HomeIcon size={14} className="mr-1.5" /> Home
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={offline}
          onClick={() => cmd('unload_filament')}>
          Unload
        </Button>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Gauge size={10} /> Print speed
        </div>
        <div className="flex gap-1.5">
          {[
            { lvl: 1, label: 'Silent' },
            { lvl: 2, label: 'Standard' },
            { lvl: 3, label: 'Sport' },
            { lvl: 4, label: 'Ludicrous' },
          ].map((s) => (
            <Button
              key={s.lvl}
              size="sm"
              variant="ghost"
              disabled={offline || !isPrinting}
              onClick={() => cmd('speed', { level: s.lvl })}>
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TempSetter
          label="Nozzle target °C"
          placeholder="e.g. 220"
          value={nozzleTarget}
          onChange={setNozzleTarget}
          disabled={offline}
          onSet={() => {
            const t = parseInt(nozzleTarget, 10);
            if (Number.isFinite(t)) cmd('nozzle_temp', { target: t });
          }}
        />
        <TempSetter
          label="Bed target °C"
          placeholder="e.g. 60"
          value={bedTarget}
          onChange={setBedTarget}
          disabled={offline}
          onSet={() => {
            const t = parseInt(bedTarget, 10);
            if (Number.isFinite(t)) cmd('bed_temp', { target: t });
          }}
        />
      </div>
    </div>
  );
}

function TempSetter({
  label,
  placeholder,
  value,
  onChange,
  onSet,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (s: string) => void;
  onSet: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="numeric"
          disabled={disabled}
        />
        <Button size="sm" onClick={onSet} disabled={disabled || !value}>
          Set
        </Button>
      </div>
    </div>
  );
}

function FilesPanel({ printer }: { printer: BambuPrinter }) {
  const [files, setFiles] = useState<BambuFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{ name: string; pct: number } | null>(
    null,
  );
  const [printingDlg, setPrintingDlg] = useState<BambuFile | null>(null);

  const refresh = async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await bambuApi.listFiles(printer.id);
      setFiles(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [printer.id]);

  const onFileChosen = async (file: File) => {
    setErr(null);
    setUploading({ name: file.name, pct: 0 });
    try {
      const res = await bambuApi.upload(printer.id, file, (pct) =>
        setUploading({ name: file.name, pct }),
      );
      setUploading(null);
      await refresh();
      // Auto-open the print dialog for the just-uploaded file.
      setPrintingDlg({
        name: res.name,
        path: res.path,
        size: file.size,
        is_dir: false,
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setUploading(null);
    }
  };

  const onDelete = async (f: BambuFile) => {
    if (!confirm(`Delete ${f.name}?`)) return;
    try {
      await bambuApi.deleteFile(printer.id, f.path);
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  };

  return (
    <div className="rounded-xl border border-border/40 bg-muted/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium flex items-center gap-2">
          <FileText size={14} /> Files on printer
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
            <RotateCcw size={12} className="mr-1" /> Refresh
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".3mf,.gcode"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFileChosen(f);
                e.target.value = '';
              }}
            />
            <span
              className="inline-flex items-center text-sm rounded-md bg-foreground text-background px-3 py-1.5 cursor-pointer hover:opacity-90"
              role="button">
              <Upload size={14} className="mr-1.5" /> Upload .3mf
            </span>
          </label>
        </div>
      </div>

      {uploading && (
        <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-xs">
          <div className="flex justify-between mb-1">
            <span className="truncate">{uploading.name}</span>
            <span className="tabular-nums">{uploading.pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-foreground transition-[width] duration-200"
              style={{ width: `${uploading.pct}%` }}
            />
          </div>
        </div>
      )}

      {err && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Listing files…
        </div>
      ) : files && files.length > 0 ? (
        <div className="divide-y divide-border/30">
          {files.map((f) => (
            <div
              key={f.path}
              className="flex items-center gap-2 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="truncate">{f.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {f.path} · {fmtBytes(f.size)}
                  {f.modified
                    ? ' · ' + new Date(f.modified).toLocaleString()
                    : ''}
                </div>
              </div>
              {f.name.toLowerCase().endsWith('.3mf') && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPrintingDlg(f)}>
                  <PlayCircle size={14} className="mr-1" /> Print
                </Button>
              )}
              <a
                href={bambuApi.downloadUrl(printer.id, f.path)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground px-2 py-1">
                <Download size={14} />
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(f)}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground py-6 text-center">
          No files on the printer yet. Upload a sliced <code>.3mf</code> from
          Bambu Studio to start.
        </div>
      )}

      {printingDlg && (
        <PrintDialog
          printer={printer}
          file={printingDlg}
          onClose={() => setPrintingDlg(null)}
        />
      )}
    </div>
  );
}

function PrintDialog({
  printer,
  file,
  onClose,
}: {
  printer: BambuPrinter;
  file: BambuFile;
  onClose: () => void;
}) {
  const [plate, setPlate] = useState(1);
  const [useAms, setUseAms] = useState(true);
  const [bedLeveling, setBedLeveling] = useState(true);
  const [flowCal, setFlowCal] = useState(true);
  const [vibrationCal, setVibrationCal] = useState(false);
  const [layerInspect, setLayerInspect] = useState(true);
  const [timelapse, setTimelapse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPrint = async () => {
    setBusy(true);
    setErr(null);
    try {
      const req: BambuPrintRequest = {
        filename: file.path,
        plate,
        use_ams: useAms,
        bed_leveling: bedLeveling,
        flow_calibration: flowCal,
        vibration_cal: vibrationCal,
        layer_inspect: layerInspect,
        timelapse,
      };
      await bambuApi.print(printer.id, req);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4"
      onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background border border-border/50 rounded-xl w-full max-w-md p-5 shadow-xl space-y-4">
        <h3 className="text-base font-semibold">Print {file.name}</h3>
        <Field label="Plate index">
          <Input
            type="number"
            min={1}
            value={plate}
            onChange={(e) => setPlate(parseInt(e.target.value, 10) || 1)}
          />
        </Field>
        <div className="space-y-2">
          <Toggle label="Use AMS" value={useAms} onChange={setUseAms} />
          <Toggle
            label="Auto bed leveling"
            value={bedLeveling}
            onChange={setBedLeveling}
          />
          <Toggle
            label="Flow calibration"
            value={flowCal}
            onChange={setFlowCal}
          />
          <Toggle
            label="Vibration calibration"
            value={vibrationCal}
            onChange={setVibrationCal}
          />
          <Toggle
            label="First-layer AI inspection"
            value={layerInspect}
            onChange={setLayerInspect}
          />
          <Toggle label="Timelapse" value={timelapse} onChange={setTimelapse} />
        </div>
        {err && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {err}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onPrint} disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <>
                <PlayCircle size={14} className="mr-1.5" /> Start print
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function fmtBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function PrinterDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: BambuPrinter;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [host, setHost] = useState(existing?.host ?? '');
  const [serial, setSerial] = useState(existing?.serial ?? '');
  const [accessCode, setAccessCode] = useState(existing?.access_code ?? '');
  const [model, setModel] = useState(existing?.model ?? 'A1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        host: host.trim(),
        serial: serial.trim(),
        access_code: accessCode.trim(),
        model: model.trim(),
      };
      if (existing) {
        await bambuApi.update(existing.id, payload);
      } else {
        await bambuApi.add(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4"
      onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="bg-background border border-border/50 rounded-xl w-full max-w-md p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">
            {existing ? 'Edit printer' : 'Add Bambu printer'}
          </h3>
        </div>
        <Field label="Display name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workshop A1"
            autoFocus
          />
        </Field>
        <Field label="Model">
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="A1 / P1S / X1C"
          />
        </Field>
        <Field label="LAN IP">
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.50.42"
          />
        </Field>
        <Field label="Serial number">
          <Input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="01P00A123456789"
            spellCheck={false}
          />
        </Field>
        <Field label="Access code">
          <Input
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="12345678"
            inputMode="numeric"
          />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Find Serial + Access Code on the printer: Settings → WLAN screen.
          Make sure LAN Only Mode is enabled.
        </p>
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : existing ? (
              'Save changes'
            ) : (
              'Add printer'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-foreground/80 mb-1 block">
        {label}
      </span>
      {children}
    </label>
  );
}

function humanState(s: BambuStatus): string {
  if (!s.online) return 'Offline';
  switch (s.state) {
    case 'RUNNING':
      return 'Printing';
    case 'PAUSE':
    case 'PAUSED':
      return 'Paused';
    case 'FINISH':
      return 'Finished';
    case 'FAILED':
      return 'Failed';
    case 'IDLE':
      return 'Idle';
    case 'PREPARE':
      return 'Preparing';
    default:
      return s.state || 'Unknown';
  }
}

function fmtRemaining(min: number): string {
  if (!min || min <= 0) return '—';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}
