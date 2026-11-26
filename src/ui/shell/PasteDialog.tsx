import { useI18n } from "../../i18n/context";
import { Dialog } from "./Dialog";
import { PasteForm } from "./LoadControls";

export interface PasteDialogProps {
  open: boolean;
  onClose(): void;
  loading: boolean;
  /** Called with the pasted text (log data or a Tenhou link) when Load is pressed. */
  onText(text: string): void;
}

/** The welcome card's "Paste a link or log": a textarea for log data or a Tenhou link. */
export function PasteDialog({ open, onClose, loading, onText }: PasteDialogProps) {
  const { m } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={m.welcome.pasteHeading} closeLabel={m.open.close}>
      <PasteForm disabled={loading} onText={onText} />
    </Dialog>
  );
}
