import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Globe,
  MapPin,
  Moon,
  Sun,
  Wifi,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatTile } from '@/components/ui/stat-tile';
import type { DashboardOverview } from '@/features/dashboard/api';

/** WMO weather code → icon. */
function weatherIcon(code: number, isDay: boolean) {
  if (code === 0) return isDay ? <Sun /> : <Moon />;
  if (code === 45 || code === 48) return <CloudFog />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return <CloudRain />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow />;
  if (code >= 95) return <CloudLightning />;
  return <Cloud />;
}

/** Location, public IP, LAN and weather tiles. `data` is null until loaded. */
export function OverviewBar({ data }: { data: DashboardOverview | null }) {
  const loc = data?.location;
  const wx = data?.weather;
  const tiles = [
    {
      label: 'Location',
      icon: <MapPin />,
      value: loc
        ? [loc.city, loc.country].filter(Boolean).join(', ')
        : 'Locating…',
      sub: loc?.timezone,
    },
    {
      label: 'Public IP',
      icon: <Globe />,
      value: data?.public_ip || '—',
      sub: loc?.isp,
      mono: true,
    },
    {
      label: 'LAN',
      icon: <Wifi />,
      value: data?.local_ip || '—',
      sub: data?.hostname,
      mono: true,
    },
    {
      label: wx?.description ?? 'Weather',
      icon: wx ? weatherIcon(wx.code, wx.is_day) : <Cloud />,
      value: wx ? `${wx.temp.toFixed(1)}°C` : '—',
      sub:
        wx &&
        `Feels ${wx.feels_like.toFixed(0)}° · ${wx.humidity.toFixed(0)}% · ${wx.wind.toFixed(0)} km/h`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="px-4 py-3">
          <StatTile
            label={t.label}
            icon={t.icon}
            value={t.value}
            sub={t.sub}
            mono={t.mono}
          />
        </Card>
      ))}
    </div>
  );
}
