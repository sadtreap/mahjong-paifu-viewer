import { type Ref, useId, useState } from "react";
import { useI18n } from "../i18n/context";
import { ErrorMessage } from "./ErrorMessage";
import styles from "./LoadScreen.module.css";
import type { LoadError } from "./loadErrors";
import type { LogSource } from "./logSource";
import { SAMPLE_IDS, sampleSource } from "./samples";

export interface LoadScreenProps {
  loading: boolean;
  error: LoadError | null;
  onLoad: (source: LogSource) => void;
  onDismissError: () => void;
  /** The heading, which takes focus (programmatically only) after "Open another log". */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Start screen: pick a file, paste log data or open a sample (dropping and pasting work anywhere). */
export function LoadScreen({
  loading,
  error,
  onLoad,
  onDismissError,
  headingRef,
}: LoadScreenProps) {
  const { m } = useI18n();
  const [text, setText] = useState("");
  const pasteId = useId();
  const headingId = useId();
  const samplesId = useId();

  return (
    <section className={styles.screen} aria-labelledby={headingId} aria-busy={loading}>
      <h2 ref={headingRef} id={headingId} className={styles.heading} tabIndex={-1}>
        {m.load.heading}
      </h2>
      <p className={styles.intro}>{m.load.intro}</p>

      {loading && (
        <p className={styles.loading} role="status">
          {m.load.loading}
        </p>
      )}
      {error && <ErrorMessage error={error} onDismiss={onDismissError} />}

      <label className={styles.fileButton}>
        {/* No accept filter: the format is detected from the content, and some systems grey out
            files whose extension a filter does not list. */}
        <input
          type="file"
          className="sr-only"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Reset so choosing the same file again still fires a change.
            event.target.value = "";
            if (file) {
              onLoad({ kind: "file", file });
            }
          }}
        />
        {m.load.chooseFile}
      </label>

      <form
        className={styles.paste}
        onSubmit={(event) => {
          event.preventDefault();
          onLoad({ kind: "text", text });
        }}
      >
        <label htmlFor={pasteId} className={styles.pasteLabel}>
          {m.load.pasteLabel}
        </label>
        <textarea
          id={pasteId}
          className={styles.textarea}
          value={text}
          placeholder={m.load.pastePlaceholder}
          spellCheck={false}
          rows={6}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={styles.submit} disabled={loading || text.trim() === ""}>
          {m.load.loadButton}
        </button>
      </form>

      <section className={styles.samples} aria-labelledby={samplesId}>
        <h3 id={samplesId} className={styles.samplesHeading}>
          {m.load.samplesHeading}
        </h3>
        <div className={styles.sampleButtons}>
          {SAMPLE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              disabled={loading}
              onClick={() => onLoad(sampleSource(id))}
            >
              {m.load.samples[id]}
            </button>
          ))}
        </div>
      </section>

      <div className={styles.notes}>
        <p>{m.load.pasteAnywhere}</p>
        <h3 className={styles.notesHeading}>{m.load.formatsHeading}</h3>
        <ul>
          {m.load.formats.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>{m.load.fourPlayerOnly}</p>
        <p>{m.load.privacy}</p>
      </div>
    </section>
  );
}
