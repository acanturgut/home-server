import { Card } from '@/components/ui/card';
import { Section } from '@/components/ui/section';
import { EndpointCard } from '@/features/settings/components/EndpointCard';
import { ENDPOINTS } from '@/features/settings/endpoints';
import { plural } from '@/lib/format';

const GROUPS = [...new Set(ENDPOINTS.map((e) => e.group))].map((group) => ({
  group,
  endpoints: ENDPOINTS.filter((e) => e.group === group),
}));

/** Settings → API: every server route, each runnable in place. */
export function ApiTab() {
  return (
    <div className="space-y-6">
      {GROUPS.map(({ group, endpoints }) => (
        <Section
          key={group}
          title={group}
          description={plural(endpoints.length, 'endpoint')}
        >
          <Card className="space-y-0.5 p-2">
            {endpoints.map((ep) => (
              <EndpointCard key={`${ep.method} ${ep.path}`} ep={ep} />
            ))}
          </Card>
        </Section>
      ))}
    </div>
  );
}
