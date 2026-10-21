import { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Card, CardHeader } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { StatTile } from '@/components/ui/stat-tile';
import { usePolling } from '@/hooks/usePolling';
import { dnsApi, type DNSRecord, type DNSStatus } from '@/features/dns/api';
import { BlocklistCard } from '@/features/dns/BlocklistCard';
import { RecordsCard } from '@/features/dns/RecordsCard';
import { RouterSetupGuide } from '@/features/dns/RouterSetupGuide';

/**
 * Settings → DNS tab: router setup guide, live stats of the embedded DNS
 * server, its A/AAAA/CNAME records and the ad blocker.
 */
export function DNSSettingsTab() {
  const [status, setStatus] = useState<DNSStatus | null>(null);
  const [records, setRecords] = useState<DNSRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lanIp, setLanIp] = useState('');

  useEffect(() => {
    dnsApi.hostIp().then(setLanIp);
  }, []);

  const load = useCallback(async () => {
    const [s, rs] = await Promise.all([dnsApi.status(), dnsApi.records()]);
    if (s) setStatus(s);
    if (rs) setRecords(rs);
    setLoading(false);
  }, []);
  usePolling(load, 15_000);

  if (loading) return <SkeletonRows rows={4} block />;

  return (
    <div className="space-y-4">
      <RouterSetupGuide lanIp={lanIp} defaultOpen={!status?.queries} />
      <ServerCard status={status} />
      <RecordsCard records={records} reload={load} />
      <BlocklistCard />
    </div>
  );
}

function ServerCard({ status }: { status: DNSStatus | null }) {
  const n = (v: number | undefined) => (v ?? 0).toLocaleString();
  const upstreams = status?.upstreams ?? [];
  return (
    <Card className="space-y-4">
      <CardHeader
        title="DNS server"
        icon={<Globe />}
        description="Local names resolve here; everything else is forwarded upstream."
      />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatTile
          label="Status"
          value={status?.running ? 'Running' : 'Stopped'}
          tone={status?.running ? 'success' : 'destructive'}
        />
        <StatTile
          label="Listening on"
          value={status?.bind_addr || ':53'}
          mono
        />
        <StatTile label="Upstream" value={upstreams.join(', ') || '—'} mono />
        <StatTile label="Queries" value={n(status?.queries)} />
        <StatTile label="Local hits" value={n(status?.local_hits)} />
        <StatTile label="Forwarded" value={n(status?.forwarded)} />
        <StatTile label="Blocked" value={n(status?.blocked_hits)} />
        <StatTile
          label="Upstream errors"
          value={n(status?.upstream_errors)}
          tone={status?.upstream_errors ? 'warning' : undefined}
        />
        <StatTile label="Records" value={n(status?.record_count)} />
      </div>
      {status?.last_error && (
        <Alert>
          <span className="font-mono">{status.last_error}</span>
        </Alert>
      )}
    </Card>
  );
}
