import { useEffect, useState } from 'react';
import {
  MapPin,
  Globe,
  Wifi,
  Cloud,
  Sun,
  Moon,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
} from 'lucide-react';
import { dashboardApi, type DashboardOverview } from '@/features/dashboard/api';

function weatherIcon(code: number, isDay: boolean, size = 16) {
  // Map WMO codes to lucide icons.
  if (code === 0) return isDay ? <Sun size={size} /> : <Moon size={size} />;
  if (code === 45 || code === 48) return <CloudFog size={size} />;
  if (code >= 51 && code <= 67) return <CloudRain size={size} />;
  if (code >= 71 && code <= 77) return <CloudSnow size={size} />;
  if (code >= 80 && code <= 82) return <CloudRain size={size} />;
  if (code >= 85 && code <= 86) return <CloudSnow size={size} />;
  if (code >= 95) return <CloudLightning size={size} />;
  return <Cloud size={size} />;
}

function Tile({
  icon,
  label,
  primary,
  secondary,
  accent = '#94a3b8',
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary?: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-4 py-3 min-w-0 flex-1">
      <span className="shrink-0" style={{ color: accent }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground/70">
          {label}
        </div>
        <div className="text-sm font-medium text-foreground/90 truncate leading-tight">
          {primary}
        </div>
        {secondary && (
          <div className="text-xs text-muted-foreground/60 truncate">
            {secondary}
          </div>
        )}
      </div>
    </div>
  );
}

export function OverviewBar() {
  const [data, setData] = useState<DashboardOverview | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      const d = await dashboardApi.overview();
      if (alive && d) setData(d);
    };
    run();
    // Cached server-side for 10 min; refresh every 5 min on the client.
    const id = setInterval(run, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const loc = data?.location;
  const wx = data?.weather;
  const where = loc
    ? [loc.city, loc.country].filter(Boolean).join(', ')
    : 'Locating…';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        icon={<MapPin size={15} />}
        label="Location"
        primary={where}
        secondary={loc?.timezone}
        accent="#f5b942"
      />
      <Tile
        icon={<Globe size={15} />}
        label="Public IP"
        primary={data?.public_ip || '—'}
        secondary={loc?.isp}
        accent="#60a5fa"
      />
      <Tile
        icon={<Wifi size={15} />}
        label="LAN"
        primary={data?.local_ip || '—'}
        secondary={data?.hostname}
        accent="#22d3ee"
      />
      <Tile
        icon={wx ? weatherIcon(wx.code, wx.is_day, 15) : <Cloud size={15} />}
        label={wx ? wx.description : 'Weather'}
        primary={wx ? `${wx.temp.toFixed(1)}°C` : '—'}
        secondary={
          wx
            ? `feels ${wx.feels_like.toFixed(0)}° · ${wx.humidity.toFixed(0)}% · ${wx.wind.toFixed(0)} km/h`
            : undefined
        }
        accent={wx?.is_day ? '#fbbf24' : '#a78bfa'}
      />
    </div>
  );
}
