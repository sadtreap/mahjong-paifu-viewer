import { useI18n } from "../../i18n/context";
import { Dialog } from "./Dialog";
import { useTouchFirst } from "./device";
import { LoadForm, type LoadFormProps } from "./LoadForm";

export interface OpenDialogProps extends LoadFormProps {
  open: boolean;
  onClose(): void;
}

/**
 * The load form in a dialog, for opening another log while a game is shown. It is also where a
 * load that failed over a game reports its error. With a keyboard at hand the paste box takes the
 * focus; on a touch device it waits for a tap, so the on-screen keyboard does not cover the form.
 */
export function OpenDialog({ open, onClose, ...form }: OpenDialogProps) {
  const { m } = useI18n();
  const touchFirst = useTouchFirst();
  return (
    <Dialog open={open} onClose={onClose} title={m.open.heading} closeLabel={m.open.close}>
      <LoadForm autoFocus={!touchFirst} {...form} />
    </Dialog>
  );
}
