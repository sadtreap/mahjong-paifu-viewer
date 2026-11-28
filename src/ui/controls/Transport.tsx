import { useI18n } from "../../i18n/context";
import { Icon, type IconName } from "../Icon";
import { usePressRepeat } from "../input/usePressRepeat";
import { cycleSpeed } from "../viewer/commands";
import { shortcutKey } from "../viewer/shortcuts";
import type { NavCommand, NavSource, TransportProps } from "../viewer/types";
import { Scrubber } from "./Scrubber";
import styles from "./Transport.module.css";

type Source = Exclude<NavSource, "autoplay">;

interface RepeatButtonProps {
  icon: IconName;
  label: string;
  command: NavCommand;
  /** At a limit: shown disabled, still focusable. */
  disabled: boolean;
  onNav(command: NavCommand, source: Source): boolean;
}

/** The tooltip: the label and the key that does the same, e.g. "Previous own turn (Shift+←)". */
function useTitle(label: string, command: NavCommand): string {
  const { m } = useI18n();
  const key = shortcutKey({ type: "nav", command });
  return key ? m.tools.withKey(label, key) : label;
}

/** A step or own-turn button: one move per click, and it repeats while held. */
function RepeatButton({ icon, label, command, disabled, onNav }: RepeatButtonProps) {
  const handlers = usePressRepeat({ disabled, onStep: (source) => onNav(command, source) });
  return (
    <button
      type="button"
      data-variant="ghost"
      data-icon=""
      aria-label={label}
      title={useTitle(label, command)}
      aria-disabled={disabled}
      {...handlers}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * The replay controls, one row under the table: the buttons that move by the viewed player's own
 * turns and by single steps around Play or Pause, the step slider of the round with the step's
 * number beside it, and the autoplay speed. On a narrow screen the slider takes a line of its own.
 * Buttons at a limit are aria-disabled, so they keep the focus.
 */
export function Transport({
  limits,
  playing,
  speed,
  onNav,
  onTogglePlay,
  onSpeed,
  scrubber,
}: TransportProps) {
  const { m } = useI18n();
  const playLabel = playing ? m.transport.pause : m.transport.play;
  const playKey = shortcutKey({ type: "togglePlay" });
  const playDisabled = limits.gameEnd && !playing;
  const speedKeys = `${shortcutKey({ type: "speed", delta: 1 }) ?? "+"} / ${shortcutKey({ type: "speed", delta: -1 }) ?? "−"}`;
  const steps = Math.max(1, scrubber.steps);
  const step = Math.min(Math.max(scrubber.step, 0), steps - 1) + 1;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of controls, not a form fieldset.
    <div className={styles.transport} role="group" aria-label={m.transport.label}>
      <div className={styles.buttons}>
        <RepeatButton
          icon="prevTurn"
          label={m.transport.prevTurn}
          command={{ kind: "ownTurn", dir: -1 }}
          disabled={limits.gameStart}
          onNav={onNav}
        />
        <RepeatButton
          icon="prevStep"
          label={m.viewer.prevStep}
          command={{ kind: "step", dir: -1 }}
          disabled={limits.gameStart}
          onNav={onNav}
        />
        <button
          type="button"
          data-variant="primary"
          data-icon=""
          className={styles.play}
          aria-label={playLabel}
          title={playKey ? m.tools.withKey(playLabel, playKey) : playLabel}
          aria-disabled={playDisabled}
          onClick={() => {
            if (!playDisabled) {
              onTogglePlay();
            }
          }}
        >
          <Icon name={playing ? "pause" : "play"} />
        </button>
        <RepeatButton
          icon="nextStep"
          label={m.viewer.nextStep}
          command={{ kind: "step", dir: 1 }}
          disabled={limits.gameEnd}
          onNav={onNav}
        />
        <RepeatButton
          icon="nextTurn"
          label={m.transport.nextTurn}
          command={{ kind: "ownTurn", dir: 1 }}
          disabled={limits.gameEnd}
          onNav={onNav}
        />
      </div>
      <div className={styles.scrub}>
        <Scrubber {...scrubber} />
      </div>
      {/* The slider's value text says the same, in words. */}
      <span className={styles.at} aria-hidden="true">
        {step} / {steps}
      </span>
      <button
        type="button"
        data-variant="ghost"
        className={styles.speed}
        aria-label={m.transport.speed(speed)}
        title={m.tools.withKey(m.transport.speed(speed), speedKeys)}
        onClick={() => onSpeed(cycleSpeed(speed))}
      >
        {m.transport.speedValue(speed)}
      </button>
    </div>
  );
}
