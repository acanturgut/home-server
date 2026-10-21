import { useId, useState } from 'react';
import { homeApi, type HomeBridge } from '@/features/home/api';
import { BRIDGE_KINDS } from '@/features/home/bridgeKinds';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAction } from '@/hooks/useAction';

/**
 * Rename a bridge, change its host or replace its token. The server merges
 * the update and keeps the stored token when the field is left blank.
 */
export function EditBridgeDialog({
  bridge,
  onClose,
  onSaved,
}: {
  bridge: HomeBridge;
  onClose: () => void;
  onSaved: () => void;
}) {
  const formId = useId();
  const kind = BRIDGE_KINDS[bridge.kind];
  const [form, setForm] = useState({
    name: bridge.name,
    host: bridge.host,
    token: '',
  });
  const save = useAction(async () => {
    await homeApi.updateBridge(bridge.id, {
      name: form.name.trim(),
      ...(kind.hostPlaceholder && { host: form.host.trim() }),
      ...(form.token.trim() && { token: form.token.trim() }),
    });
    onSaved();
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={`Edit ${bridge.name}`}
      description={kind.label}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.busy}>
            Save
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        {kind.hostPlaceholder && (
          <Field label="IP address">
            <Input
              value={form.host}
              onChange={(e) => setForm({ ...form, host: e.target.value })}
              placeholder={kind.hostPlaceholder}
              className="font-mono"
              required
            />
          </Field>
        )}
        {kind.token && (
          <Field label={kind.token.label}>
            <Input
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
              placeholder="Leave blank to keep current token"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
        {save.error && <Alert>{save.error}</Alert>}
      </form>
    </Dialog>
  );
}
