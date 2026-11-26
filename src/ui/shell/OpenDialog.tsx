import type { ReactNode } from "react";
import { useI18n } from "../../i18n/context";
import type { SampleId } from "../samples";
import { Dialog } from "./Dialog";
import { FileButton, FormatNotes, PasteForm, SampleButtons } from "./LoadControls";
import styles from "./OpenDialog.module.css";

export interface OpenDialogProps {
  open: boolean;
  onClose(): void;
  loading: boolean;
  /** A load error to show (an ErrorMessage), or null. */
  error: ReactNode | null;
  onFile(file: File): void;
  onText(text: string): void;
  onSample(id: SampleId): void;
}

/**
 * The toolbar's Open action: choose a file, paste log data or a Tenhou link, or open a sample,
 * with a reminder that dropping a file or pasting anywhere on the page works too.
 */
export function OpenDialog({
  open,
  onClose,
  loading,
  error,
  onFile,
  onText,
  onSample,
}: OpenDialogProps) {
  const { m } = useI18n();
  return (
    <Dialog open={open} onClose={onClose} title={m.open.heading} closeLabel={m.open.close}>
      <div className={styles.body} aria-busy={loading}>
        {error}
        {loading && (
          <p className={styles.loading} role="status">
            {m.load.loading}
          </p>
        )}
        <p className={styles.hint}>{m.open.hint}</p>
        <FileButton
          label={m.welcome.openFile}
          primary
          disabled={loading}
          onFile={onFile}
          className={styles.file}
        />
        <PasteForm disabled={loading} onText={onText} />
        <SampleButtons disabled={loading} onSample={onSample} />
        <FormatNotes />
      </div>
    </Dialog>
  );
}
