import React from 'react';

/** Card container used by the Settings page panels. */
export function SettingsCard({
  title,
  icon,
  actions,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/10 bg-white/[0.01]">
        <div className="flex items-center gap-1.5 text-[11px] text-foreground/80 font-medium">
          {icon && <span className="text-muted-foreground/60">{icon}</span>}
          {title}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

/** Animated placeholder rows used while a settings card loads. */
export function SkeletonRows({
  rows = 3,
  block = false,
}: {
  rows?: number;
  block?: boolean;
}) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`rounded ${block ? 'h-12' : 'h-3'} bg-white/[0.04]`}
          style={{ width: block ? '100%' : `${60 + ((i * 17) % 30)}%` }}
        />
      ))}
    </div>
  );
}

/** Read-only label / value row with optional mono / wide / coloured value. */
export function InfoRow({
  label,
  value,
  mono,
  full,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  full?: boolean;
  valueClass?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? 'col-span-2' : ''}`}>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground/40">
        {label}
      </span>
      <span
        className={`text-[11px] truncate ${mono ? 'font-mono' : ''} ${valueClass || 'text-foreground/80'}`}
        title={value}>
        {value}
      </span>
    </div>
  );
}

/** Switch + label + hint row. */
export function ToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 ${disabled ? 'opacity-40' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`mt-0.5 relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          value ? 'bg-emerald-500/50' : 'bg-white/10'
        } disabled:cursor-not-allowed`}>
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/80">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

/** Numeric input row with optional unit suffix. */
export function NumberRow({
  label,
  hint,
  value,
  onChange,
  step,
  min,
  max,
  suffix,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/80">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="w-16 h-7 text-[11px] tabular-nums text-right rounded-md border border-border/30 bg-transparent px-2 focus:outline-none focus:ring-1 focus:ring-ring/30"
        />
        {suffix && (
          <span className="text-[10px] text-muted-foreground/50">{suffix}</span>
        )}
      </div>
    </div>
  );
}
