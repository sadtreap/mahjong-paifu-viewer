import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "../../i18n/context";
import { ErrorMessage } from "../ErrorMessage";
import { Icon } from "../Icon";
import type { LoadError } from "../loadErrors";
import { SAMPLE_IDS, type SampleId } from "../samples";
import type { Loading } from "../useLogLoader";
import { DownloadStatus } from "./DownloadStatus";
import styles from "./LoadForm.module.css";

export interface LoadFormProps {
  /** A load in progress; a download shows its status in place of the line of formats. */
  loading: Loading | null;
  /** The error of the last load, shown under the paste box. */
  error: LoadError | null;
  /** What the paste box holds when the form appears (read once). */
  initialText?: string;
  /** The paste box takes the focus when its dialog opens (see Dialog). */
  autoFocus?: boolean;
  onFile(file: File): void;
  onText(text: string): void;
  onSample(id: SampleId): void;
}

/**
 * Every way to open a log, for the landing card and the Open dialog: a box for a pasted Tenhou
 * link, log id or log text, a file picker and the bundled samples. Dropping a file and pasting
 * outside the box work as well (the app's window handlers). Nothing is switched off while a log
 * loads, because the loader keeps only the latest request. An error shows under the box and is
 * scrolled into view, so the box stays where the finger left it (with an on-screen keyboard up, the
 * box may be about all that shows).
 */
export function LoadForm({
  loading,
  error,
  initialText,
  autoFocus = false,
  onFile,
  onText,
  onSample,
}: LoadFormProps) {
  const { m } = useI18n();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [startText] = useState(initialText);
  const boxId = useId();
  const noteId = useId();
  const samplesId = useId();
  const downloading = loading === "download";

  useEffect(() => {
    if (error) {
      errorRef.current?.scrollIntoView?.({ block: "nearest" });
    }
  }, [error]);

  const submit = () => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    if (box.value.trim() === "") {
      // Nothing to open yet: show where it goes.
      box.focus();
      return;
    }
    onText(box.value);
  };

  // Enter opens, as in a one-line field; an Enter that only confirms an IME composition does not.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.form} aria-busy={loading !== null}>
      <div className={styles.entry}>
        <form
          className={styles.paste}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={boxId} className="sr-only">
            {m.load.pasteLabel}
          </label>
          {/* A textarea, because a pasted log has line breaks that a one-line input would drop. */}
          <textarea
            ref={boxRef}
            id={boxId}
            className={styles.box}
            rows={1}
            wrap="off"
            defaultValue={startText}
            placeholder={m.load.pastePlaceholder}
            aria-describedby={downloading ? undefined : noteId}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            data-autofocus={autoFocus || undefined}
            onKeyDown={handleKeyDown}
          />
          <button type="submit" data-variant="primary">
            {m.load.openButton}
          </button>
        </form>
        {error && (
          <div ref={errorRef}>
            <ErrorMessage error={error} />
          </div>
        )}
        {downloading ? (
          <DownloadStatus className={styles.note} />
        ) : (
          <p id={noteId} className={styles.note}>
            {m.load.formats}
          </p>
        )}
      </div>
      <div className={styles.more}>
        <div className={styles.file}>
          {/* No accept filter: the format is detected from the content, and some systems grey out
              files whose extension a filter does not list. */}
          <input
            ref={fileRef}
            type="file"
            hidden
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so choosing the same file again still fires a change.
              event.target.value = "";
              if (file) {
                onFile(file);
              }
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()}>
            <Icon name="open" />
            {m.load.chooseFile}
          </button>
          <span className={styles.drop}>{m.load.dropHint}</span>
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a fieldset would add a border and legend layout for two buttons. */}
        <div className={styles.samples} role="group" aria-labelledby={samplesId}>
          <span id={samplesId} className={styles.label}>
            {m.load.samplesLabel}
          </span>
          {SAMPLE_IDS.map((id) => (
            <button key={id} type="button" onClick={() => onSample(id)}>
              {m.load.samples[id]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
