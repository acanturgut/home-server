import React from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

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
    <div
      className={`flex items-start gap-3 py-1 ${disabled ? 'opacity-40' : ''}`}>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/85">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground/55 mt-0.5 leading-snug">
            {hint}
          </div>
        )}
      </div>
      <Switch
        size="sm"
        checked={value}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v)}
        className="mt-0.5"
      />
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
    <div className="flex items-start gap-3 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-foreground/85">{label}</div>
        {hint && (
          <div className="text-[10px] text-muted-foreground/55 mt-0.5 leading-snug">
            {hint}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Input
          inputSize="sm"
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="w-20 tabular-nums text-right"
        />
        {suffix && (
          <span className="text-[10px] text-muted-foreground/55 w-12">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
