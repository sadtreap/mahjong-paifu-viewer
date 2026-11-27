import { useState } from "react";
import type { LiveStatusProps } from "../viewer/types";

/**
 * The viewer's only live region: what the current step shows, in words, for screen readers (it is
 * not on screen). While `quiet` (autoplay, holds, wheel bursts, scrubs) the region is off, so the
 * steps flying by are not read; when quiet ends the text is put in again, so the step it settled
 * on is announced once. An `announcement` ("Link copied") takes the text's place while it is set,
 * and is read even while quiet; each one is put in anew, so the same words are read again.
 */
export function LiveStatus({ text, quiet, announcement }: LiveStatusProps) {
  const [wasQuiet, setWasQuiet] = useState(quiet);
  const [serial, setSerial] = useState(0);
  if (wasQuiet !== quiet) {
    setWasQuiet(quiet);
    if (wasQuiet) {
      setSerial((value) => value + 1);
    }
  }
  const silent = quiet && announcement === null;
  return (
    <p className="sr-only" aria-live={silent ? "off" : "polite"} aria-atomic="true">
      <span key={announcement ? `said-${announcement.id}` : serial}>
        {announcement?.text ?? text}
      </span>
    </p>
  );
}
