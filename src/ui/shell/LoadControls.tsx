import { useId, useState } from "react";
import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { SAMPLE_IDS, SAMPLE_PLAYER_COUNTS, type SampleId } from "../samples";
import styles from "./LoadControls.module.css";

/**
 * A button that opens the file picker: a label around a visually hidden file input, so the input
 * itself takes the focus and the keyboard (Space or Enter opens the picker).
 */
export function FileButton({
  label,
  disabled,
  primary = false,
  onFile,
  className,
}: {
  label: string;
  disabled: boolean;
  primary?: boolean;
  onFile(file: File): void;
  className?: string;
}) {
  return (
    <label className={cx(styles.fileButton, primary && styles.primary, className)}>
      {/* No accept filter: the format is detected from the content, and some systems grey out
          files whose extension a filter does not list. */}
      <input
        type="file"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file again still fires a change.
          event.target.value = "";
          if (file) {
            onFile(file);
          }
        }}
      />
      {label}
    </label>
  );
}

/** The textarea for pasted log data or a Tenhou link, with its Load button. */
export function PasteForm({ disabled, onText }: { disabled: boolean; onText(text: string): void }) {
  const { m } = useI18n();
  const [text, setText] = useState("");
  const id = useId();
  return (
    <form
      className={styles.paste}
      onSubmit={(event) => {
        event.preventDefault();
        if (text.trim() !== "") {
          onText(text);
        }
      }}
    >
      <label htmlFor={id} className={styles.pasteLabel}>
        {m.load.pasteLabel}
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        value={text}
        placeholder={m.load.pastePlaceholder}
        spellCheck={false}
        rows={5}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className={styles.submit} disabled={disabled || text.trim() === ""}>
        {m.load.loadButton}
      </button>
    </form>
  );
}

/** "Samples: [4-player] [3-player]", each button titled with the sample's longer description. */
export function SampleButtons({
  disabled,
  onSample,
  className,
}: {
  disabled: boolean;
  onSample(id: SampleId): void;
  className?: string;
}) {
  const { m } = useI18n();
  const labelId = useId();
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a border and legend layout for two buttons.
    <div className={cx(styles.samples, className)} role="group" aria-labelledby={labelId}>
      <span id={labelId}>{m.welcome.samples}</span>
      {SAMPLE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={styles.sample}
          disabled={disabled}
          title={m.load.samples[id]}
          onClick={() => onSample(id)}
        >
          {SAMPLE_PLAYER_COUNTS[id] === 3 ? m.welcome.sample3 : m.welcome.sample4}
        </button>
      ))}
    </div>
  );
}

/** Supported formats, player counts and the privacy note, folded away. */
export function FormatNotes() {
  const { m } = useI18n();
  return (
    <details className={styles.notes}>
      <summary>{m.load.formatsHeading}</summary>
      <ul>
        {m.load.formats.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p>{m.load.playerCounts}</p>
      <p>{m.load.privacy}</p>
    </details>
  );
}
