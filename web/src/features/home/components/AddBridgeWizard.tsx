import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { homeApi, type HomeBridgeKind } from '@/features/home/api';
import {
  BRIDGE_KINDS,
  EMPTY_BRIDGE_FORM,
  canAdvance,
  toBridge,
  type BridgeForm,
} from '@/features/home/bridgeKinds';
import { usePairing } from '@/features/home/hooks/usePairing';
import {
  HostStep,
  HttpStep,
  KindStep,
  ReviewStep,
  TokenStep,
} from '@/features/home/components/WizardSteps';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { useAction } from '@/hooks/useAction';

/** Step-by-step flow for adding a smart-home bridge (admins only). */
export function AddBridgeWizard({
  onAdded,
  onCancel,
}: {
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<HomeBridgeKind | null>(null);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<BridgeForm>(EMPTY_BRIDGE_FORM);
  const set = (patch: Partial<BridgeForm>) =>
    setForm((f) => ({ ...f, ...patch }));
  const pairing = usePairing((token) => set({ token }));
  const submit = useAction(async (k: HomeBridgeKind) => {
    await homeApi.addBridge(toBridge(k, form));
    onAdded();
  });

  const back = () => {
    pairing.cancel();
    if (step > 1) return setStep(step - 1);
    setKind(null);
    setForm(EMPTY_BRIDGE_FORM);
  };
  const cancel = () => {
    pairing.cancel();
    onCancel();
  };

  const info = kind && BRIDGE_KINDS[kind];
  const props = kind && { kind, form, set };

  return (
    <Card className="space-y-4">
      <CardHeader
        title={info ? `Add ${info.label}` : 'Add a bridge'}
        description={
          info
            ? `Step ${step} of ${info.steps}`
            : 'Choose the kind of hub or device to connect.'
        }
      />

      {!props ? (
        <KindStep onPick={setKind} />
      ) : step === 1 ? (
        <HostStep {...props} />
      ) : step === 2 && props.kind === 'http' ? (
        <HttpStep {...props} />
      ) : step === 2 ? (
        <TokenStep {...props} pairing={pairing} />
      ) : (
        <ReviewStep {...props} />
      )}

      {submit.error && <Alert>{submit.error}</Alert>}

      <div className="flex items-center gap-2">
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
        {info && kind && (
          <>
            <Button variant="outline" className="ml-auto" onClick={back}>
              <ChevronLeft />
              Back
            </Button>
            {step < info.steps ? (
              <Button
                disabled={!canAdvance(kind, step, form) || pairing.busy}
                onClick={() => setStep(step + 1)}
              >
                Next
                <ChevronRight />
              </Button>
            ) : (
              <Button
                loading={submit.busy}
                disabled={!canAdvance(kind, step, form)}
                onClick={() => void submit.run(kind)}
              >
                Add bridge
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
