import { useId, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useAction } from '@/hooks/useAction';
import type { RouterClient } from '@/features/network/api';

/**
 * Sets a device's display name; blank falls back to the name the device
 * reports. Open while `client` is set. Remount it per client (`key`) so
 * the field starts from that device's current name.
 */
export function RenameDialog({
  client,
  onClose,
  onRename,
}: {
  client: RouterClient | null;
  onClose: () => void;
  onRename: (c: RouterClient, name: string) => Promise<void>;
}) {
  const formId = useId();
  const [name, setName] = useState(
    client?.custom_name || client?.nickname || client?.hostname || '',
  );
  const save = useAction(async (c: RouterClient) => {
    await onRename(c, name.trim());
    onClose();
  });

  return (
    <Dialog
      open={!!client}
      onOpenChange={(open) => !open && onClose()}
      title="Rename device"
      description={client?.mac}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
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
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (client) void save.run(client);
        }}
      >
        <Field
          label="Display name"
          hint="Leave blank to use the name the device reports."
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        {save.error && <Alert>{save.error}</Alert>}
      </form>
    </Dialog>
  );
}
