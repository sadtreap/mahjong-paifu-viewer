import { useI18n } from "../../i18n/context";
import { Icon, type IconName } from "../Icon";
import { usePressRepeat } from "../input/usePressRepeat";
import { cycleSpeed } from "../viewer/commands";
import { shortcutKey } from "../viewer/shortcuts";
import type { NavCommand, NavSource, TransportProps } from "../viewer/types";
import { RoundList } from "./RoundList";
import { Scrubber } from "./Scrubber";
import styles from "./Transport.module.css";

type Source = Exclude<NavSource, "autoplay">;

interface NavButtonProps {
  icon: IconName;
  label: string;
  command: NavCommand;
  /** At a limit: shown disabled, still focusable. */
  disabled: boolean;
  /** Drawn as a button of its own; otherwise bare until hovered or focused. */
  outlined?: boolean;
  size?: "lg";
  onNav(command: NavCommand, source: Source): boolean;
}

/** The tooltip: the label and the key that does the same, e.g. "Previous own turn (Shift+←)". */
function useTitle(label: string, command: NavCommand): string {
  const { m } = useI18n();
  const key = shortcutKey({ type: "nav", command });
  return key ? m.tools.withKey(label, key) : label;
}

/** A step or own-turn button: one move per click, and it repeats while held. */
function RepeatButton({
  icon,
  label,
  command,
  disabled,
  outlined = false,
  size,
  onNav,
}: NavButtonProps) {
  const handlers = usePressRepeat({ disabled, onStep: (source) => onNav(command, source) });
  return (
    <button
      type="button"
      data-variant={outlined ? undefined : "ghost"}
      data-icon=""
      data-size={size}
      aria-label={label}
      title={useTitle(label, command)}
      aria-disabled={disabled}
      {...handlers}
    >
      <Icon name={icon} />
    </button>
  );
}

/** A round button: one press, one jump. */
function JumpButton({ icon, label, command, disabled, onNav }: NavButtonProps) {
  return (
    <button
      type="button"
      data-variant="ghost"
      data-icon=""
      aria-label={label}
      title={useTitle(label, command)}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onNav(command, "user");
        }
      }}
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * The replay controls. Three groups whose centre names what their arrows move by: the round (the
 * round button, which opens the round list), the turn ("Turn 8", moving by the viewed player's own
 * turns) and the step (Play or Pause). Then the speed, and before them all the scrubber and, while
 * the round's result card is hidden, "Show result".
 *
 * One element in three shapes, by `arrangement`: a bar on the felt, rows in the side column, or
 * the block under the table (where the step buttons are large). Buttons at a limit are
 * aria-disabled, so they keep the focus. Nothing in it moves when "Show result" comes and goes or
 * the round's name changes length (see the stylesheet).
 */
export function Transport({
  arrangement,
  turn,
  limits,
  playing,
  speed,
  onNav,
  onTogglePlay,
  onSpeed,
  onShowResult,
  scrubber,
  roundList,
  rootRef,
}: TransportProps) {
  const { m } = useI18n();
  const size = arrangement === "stack" ? "lg" : undefined;
  // In the bar every control is bare; on their own, the ones pressed most get an outline.
  const bare = arrangement === "wide";
  const playLabel = playing ? m.transport.pause : m.transport.play;
  const playKey = shortcutKey({ type: "togglePlay" });
  // The key for the round's result shows a hidden card again.
  const showKey = shortcutKey({ type: "nav", command: { kind: "roundEnd" } });
  const playDisabled = limits.gameEnd && !playing;
  const speedKeys = `${shortcutKey({ type: "speed", delta: 1 }) ?? "+"} / ${shortcutKey({ type: "speed", delta: -1 }) ?? "−"}`;
  const separator = <span className={styles.separator} aria-hidden="true" />;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a group of controls, not a form fieldset.
    <div
      ref={rootRef}
      className={styles.transport}
      role="group"
      aria-label={m.transport.label}
      data-arrangement={arrangement}
      data-gesture="ignore"
      data-open={roundList.open ? "" : undefined}
    >
      <div className={styles.top}>
        {onShowResult && (
          <span className={styles.show}>
            <button
              type="button"
              data-variant={bare ? "ghost" : undefined}
              title={showKey ? m.tools.withKey(m.transport.showResult, showKey) : undefined}
              onClick={onShowResult}
            >
              {m.transport.showResult}
            </button>
          </span>
        )}
        <div className={styles.scrub}>
          <Scrubber {...scrubber} />
        </div>
      </div>
      <div className={styles.jumps}>
        <div className={styles.group}>
          <JumpButton
            icon="prevRound"
            label={m.viewer.prevRound}
            command={{ kind: "roundStartOrPrev" }}
            disabled={limits.gameStart}
            onNav={onNav}
          />
          <RoundList {...roundList} bare={bare} />
          <JumpButton
            icon="nextRound"
            label={m.viewer.nextRound}
            command={{ kind: "nextRound" }}
            disabled={limits.lastRound}
            onNav={onNav}
          />
        </div>
        {separator}
        <div className={styles.group}>
          <RepeatButton
            icon="prevTurn"
            label={m.transport.prevTurn}
            command={{ kind: "ownTurn", dir: -1 }}
            disabled={limits.gameStart}
            onNav={onNav}
          />
          <span className={styles.turn}>{m.transport.turn(turn)}</span>
          <RepeatButton
            icon="nextTurn"
            label={m.transport.nextTurn}
            command={{ kind: "ownTurn", dir: 1 }}
            disabled={limits.gameEnd}
            onNav={onNav}
          />
        </div>
      </div>
      <div className={styles.steps}>
        {separator}
        <div className={styles.group}>
          <RepeatButton
            icon="prevStep"
            label={m.viewer.prevStep}
            command={{ kind: "step", dir: -1 }}
            disabled={limits.gameStart}
            outlined={!bare}
            size={size}
            onNav={onNav}
          />
          <button
            type="button"
            data-variant="primary"
            data-icon=""
            data-size={size}
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
            outlined={!bare}
            size={size}
            onNav={onNav}
          />
        </div>
        {separator}
        <button
          type="button"
          data-variant={bare ? "ghost" : undefined}
          data-size={size}
          className={styles.speed}
          aria-label={m.transport.speed(speed)}
          title={m.tools.withKey(m.transport.speed(speed), speedKeys)}
          onClick={() => onSpeed(cycleSpeed(speed))}
        >
          {m.transport.speedValue(speed)}
        </button>
      </div>
    </div>
  );
}
