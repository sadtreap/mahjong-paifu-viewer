import { type ReactNode, useState } from "react";
import type { StatusLineProps } from "../viewer/types";
import styles from "./StatusLine.module.css";

export interface StatusLineViewProps extends StatusLineProps {
  /** "Turn 9 · ", shown before the text on phones in portrait only. */
  prefix?: string | null;
  /** "Show result" (overlay mode, after Hide), after the text. */
  result?: ReactNode;
  /** The back chip, between the text and the counter. */
  back?: ReactNode;
}

/**
 * The dock's status line. Its text is the viewer's only live region (SPEC §4.1). While `quiet`
 * (autoplay, holds, wheel bursts, scrubs) the region is off, so the steps flying by are not
 * read; when quiet ends the text is put in again, so the step it settled on is announced once.
 * An `announcement` ("Link copied") takes the text's place while it is set.
 */
export function StatusLine({
  text,
  quiet,
  announcement,
  counter,
  legend,
  prefix = null,
  result = null,
  back = null,
}: StatusLineViewProps) {
  const [wasQuiet, setWasQuiet] = useState(quiet);
  const [serial, setSerial] = useState(0);
  if (wasQuiet !== quiet) {
    setWasQuiet(quiet);
    if (wasQuiet) {
      setSerial((value) => value + 1);
    }
  }
  return (
    <p className={styles.status}>
      <span className={styles.text} aria-live={quiet ? "off" : "polite"} aria-atomic="true">
        <span key={serial}>
          {announcement === null && prefix ? <span className={styles.prefix}>{prefix}</span> : null}
          {announcement ?? text}
        </span>
      </span>
      {legend !== null && legend !== undefined ? (
        <span className={styles.legend}>{legend}</span>
      ) : null}
      {result !== null && <span className={styles.result}>{result}</span>}
      {back !== null && <span className={styles.back}>{back}</span>}
      <span className={styles.counter}>{counter}</span>
    </p>
  );
}
