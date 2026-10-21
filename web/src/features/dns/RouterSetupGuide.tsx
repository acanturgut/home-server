import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Collapsible } from '@/components/ui/collapsible';
import { StatTile } from '@/components/ui/stat-tile';
import { Steps } from '@/components/ui/steps';
import { toast } from '@/components/ui/toast';
import { copyToClipboard } from '@/lib/format';

/** How to point the router's DHCP DNS at this host, so every LAN device resolves through it. */
export function RouterSetupGuide({
  lanIp,
  defaultOpen,
}: {
  lanIp: string;
  defaultOpen: boolean;
}) {
  const ip = lanIp || '<your-host-ip>';
  const copyIp = async () => {
    const ok = await copyToClipboard(lanIp);
    toast(ok ? 'IP copied' : "Couldn't copy the IP", {
      tone: ok ? 'success' : 'error',
    });
  };
  const mono = (text: string) => (
    <code className="font-mono text-foreground">{text}</code>
  );

  return (
    <Card>
      <Collapsible
        defaultOpen={defaultOpen}
        trigger={
          <>
            <span className="block font-medium">Set up on your router</span>
            <span className="block text-xs text-muted-foreground">
              Point every device on your network at this DNS server.
            </span>
          </>
        }
      >
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <StatTile
              label="This host's LAN IP"
              value={lanIp || 'Detecting…'}
              mono
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!lanIp}
              onClick={copyIp}
            >
              <Copy />
              Copy
            </Button>
          </div>

          <Steps
            items={[
              {
                title: 'Open your router admin page',
                body: (
                  <>
                    On most ASUS routers it's{' '}
                    <a
                      href="http://router.asus.com"
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-foreground underline underline-offset-2"
                    >
                      router.asus.com
                    </a>{' '}
                    (or {mono('192.168.50.1')}). Sign in with your admin
                    password.
                  </>
                ),
              },
              {
                title: 'Find the DHCP settings',
                body: (
                  <>
                    Go to {mono('LAN → DHCP Server')} and scroll to{' '}
                    {mono('DNS and WINS Server Setting')}.
                  </>
                ),
              },
              {
                title: 'Set DNS Server 1 to this host',
                body: (
                  <>
                    Set {mono('DNS Server 1')} to {mono(ip)}. Leave{' '}
                    {mono('DNS Server 2')} empty, or set a public fallback like{' '}
                    {mono('1.1.1.1')} so the internet keeps working while this
                    host reboots.
                  </>
                ),
              },
              {
                title: 'Stop advertising the router as DNS',
                body: (
                  <>
                    Set{' '}
                    {mono(
                      "Advertise router's IP in addition to user-specified DNS",
                    )}{' '}
                    to {mono('No')}. Otherwise clients may query the router and
                    skip this host.
                  </>
                ),
              },
              {
                title: 'Apply and renew leases',
                body: (
                  <>
                    Click {mono('Apply')}. Devices keep their old DNS until
                    their lease renews; turn Wi-Fi off and on to test sooner.
                  </>
                ),
              },
              {
                title: 'Verify',
                body: (
                  <>
                    From any device run {mono('nslookup home.lan')}. It should
                    resolve to {mono(ip)}, and the Queries counter below starts
                    climbing.
                  </>
                ),
              },
            ]}
          />

          <p className="text-sm text-muted-foreground">
            If your router doesn't allow custom DNS, set the DNS server by hand
            in each device's Wi-Fi settings.
          </p>
        </div>
      </Collapsible>
    </Card>
  );
}
