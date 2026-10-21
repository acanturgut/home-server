import { useEffect, useState, type FormEvent } from 'react';
import { Key, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { SkeletonRows } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { settingsApi, type ApiToken } from '@/features/settings/api';
import { useAction } from '@/hooks/useAction';
import { useConfirm } from '@/hooks/useConfirm';
import { API_BASE } from '@/lib/api';
import { errorMessage, relTime } from '@/lib/format';

const ASK_URL = `${API_BASE || window.location.origin}/api/ai/ask`;
const CURL_EXAMPLE = `curl -X POST ${ASK_URL} \\
  -H 'Authorization: Bearer <token>' \\
  -H 'Content-Type: application/json' \\
  -d '{"prompt":"Turn off the lights"}'`;

/** "5m", "3d"…, or "never" for a missing / Go zero time. */
const when = (iso?: string) => {
  const t = Date.parse(iso ?? '');
  return t > 0 ? relTime(t) : 'never';
};

const mask = (token: string) => `${token.slice(0, 6)}…${token.slice(-4)}`;

/** Settings → API tokens (admin only): bearer tokens for Shortcuts and scripts. */
export function ApiTokensTab() {
  const confirm = useConfirm();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [revealId, setRevealId] = useState<string | null>(null);

  useEffect(() => {
    settingsApi.listTokens().then(
      (d) => setTokens(d.tokens ?? []),
      (e) => setLoadError(errorMessage(e)),
    );
  }, []);

  const create = useAction(async (tokenName: string) => {
    const tok = await settingsApi.createToken(tokenName);
    setTokens((t) => [tok, ...(t ?? [])]);
    setRevealId(tok.id);
    setName('');
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) void create.run(name.trim());
  };

  const onRotate = async (t: ApiToken) => {
    const ok = await confirm({
      title: `Rotate “${t.name}”?`,
      body: 'It gets a new secret. Clients using the old one stop working until you update them.',
      confirmLabel: 'Rotate',
      destructive: true,
    });
    if (!ok) return;
    try {
      const tok = await settingsApi.rotateToken(t.id);
      setTokens((arr) => arr?.map((x) => (x.id === t.id ? tok : x)) ?? null);
      setRevealId(t.id);
    } catch (e) {
      toast('Rotating the token failed', {
        tone: 'error',
        description: errorMessage(e),
      });
    }
  };

  const onDelete = async (t: ApiToken) => {
    const ok = await confirm({
      title: `Delete “${t.name}”?`,
      body: 'Clients using it stop working immediately.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await settingsApi.deleteToken(t.id);
      setTokens((arr) => arr?.filter((x) => x.id !== t.id) ?? null);
    } catch (e) {
      toast('Deleting the token failed', {
        tone: 'error',
        description: errorMessage(e),
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={onCreate} className="flex items-end gap-2">
          <Field label="New token name" className="flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="iPhone Shortcut, Pi script…"
            />
          </Field>
          <Button type="submit" loading={create.busy} disabled={!name.trim()}>
            {!create.busy && <Plus />}
            Create
          </Button>
        </form>
        {create.error && <Alert className="mt-3">{create.error}</Alert>}
      </Card>

      {loadError ? (
        <Alert>{loadError}</Alert>
      ) : !tokens ? (
        <SkeletonRows rows={2} block />
      ) : tokens.length === 0 ? (
        <EmptyState
          dashed
          icon={<Key />}
          title="No API tokens yet"
          description="Create one above, then use it from a Shortcut or script."
        />
      ) : (
        tokens.map((t) => {
          const revealed = revealId === t.id;
          return (
            <Card key={t.id} className="space-y-3">
              <CardHeader
                title={t.name}
                icon={<Key />}
                description={`Created ${when(t.created_at)} · Last used ${when(t.last_used_at)}`}
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRevealId(revealed ? null : t.id)}
                    >
                      {revealed ? 'Hide' : 'Show'}
                    </Button>
                    <IconButton
                      icon={<RotateCcw />}
                      label={`Rotate ${t.name}`}
                      onClick={() => onRotate(t)}
                    />
                    <IconButton
                      icon={<Trash2 />}
                      label={`Delete ${t.name}`}
                      onClick={() => onDelete(t)}
                    />
                  </>
                }
              />
              <CodeBlock
                text={revealed ? t.token : mask(t.token)}
                copy={revealed}
              />
            </Card>
          );
        })
      )}

      <Card className="space-y-3">
        <CardHeader
          title="Using a token"
          description="Tokens only work on POST /api/ai/ask, sent in the Authorization header."
        />
        <CodeBlock text={CURL_EXAMPLE} />
        <p className="text-muted-foreground">
          Home-control phrases (turn on or off, dim, status) run directly.
          Anything else goes to your local model with a snapshot of the home as
          context.
        </p>
      </Card>
    </div>
  );
}
