import { useEffect } from 'react';
import type { Persona } from '@/lib/chat';

/**
 * Hidden helper that listens for `chat:persona-add` window events and appends
 * the supplied persona (deduped by id) into the persisted list. Renders nothing.
 */
export function PersonaQuickAdd({
  personas,
  onSave,
}: {
  personas: Persona[];
  onSave: (arr: Persona[]) => void;
}) {
  useEffect(() => {
    const onAdd = (e: Event) => {
      const detail = (e as CustomEvent).detail as Persona | undefined;
      if (!detail || !detail.id || !detail.name) return;
      if (personas.some((p) => p.id === detail.id)) return;
      onSave([...personas, detail]);
    };
    window.addEventListener('chat:persona-add', onAdd as EventListener);
    return () =>
      window.removeEventListener('chat:persona-add', onAdd as EventListener);
  }, [personas, onSave]);
  return null;
}
