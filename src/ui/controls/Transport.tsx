import { useI18n } from "../../i18n/context";
import { cx } from "../cx";
import { Icon, type IconName } from "../Icon";
import { usePressRepeat } from "../input/usePressRepeat";
import { cycleSpeed } from "../viewer/commands";
import { shortcutKey } from "../viewer/shortcuts";
import type { NavCommand, NavSource, TransportProps } from "../viewer/types";
import styles from "./Transport.module.css";

type Source = Exclude<NavSource, "autoplay">;

interface NavButtonProps {
  icon: IconName;
  label: string;
  command: NavCommand;
  disabled: boolean;
  /** The grid-area class of the phone layouts. */
  area: string | undefined;
  onNav(command: NavCommand, source: Source): boolean;
}

/** The tooltip: the label and the key that does the same, e.g. "Previous own turn (Shift+←)". */
function useTitle(label: string, command: NavCommand): string {
  const { m } = useI18n();
  const key = shortcutKey({ type: "nav", command });
  return key ? m.tools.withKey(label, key) : label;
}

/** A transport button that steps once per click and repeats while held. */
function RepeatButton({ icon, label, command, disabled, area, onNav }: NavButtonProps) {
  const handlers = usePressRepeat({ disabled, onStep: (source) => onNav(command, source) });
  return (
    <button
      type="button"
      className={cx(styles.icon, area)}
      aria-label={label}
      title={useTitle(label, command)}
      aria-disabled={disabled}
      {...handlers}
    >
      <Icon name={icon} className={styles.glyph} />
    </button>
  );
}

/** A transport button for jumps (rounds, key moments): one press, one jump. */
function JumpButton({ icon, label, command, disabled, area, onNav }: NavButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.icon, area)}
      aria-label={label}
      title={useTitle(label, command)}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onNav(command, "user");
        }
      }}
    >
      <Icon name={icon} className={styles.glyph} />
    </button>
  );
}

/**
 * The replay controls (SPEC §4.1): rounds and own turns on the first row, key moments, steps,
 * autoplay and its speed on the second. Buttons at a limit are aria-disabled (they keep the
 * focus); step and own-turn buttons repeat while held. On phones in portrait the turn label, the
 * key moments and the speed move to the ⋯ menu.
 */
export function Transport({
  roundName,
  turn,
  limits,
  playing,
  speed,
  breakpoint,
  onNav,
  onTogglePlay,
  onSpeed,
  onRoundList,
}: TransportProps) {
  const { m } = useI18n();
  const compact = breakpoint === "phonePortrait";
  const speedKeys = `${shortcutKey({ type: "speed", delta: 1 }) ?? "+"} / ${shortcutKey({ type: "speed", delta: -1 }) ?? "−"}`;
  const playKey = shortcutKey({ type: "togglePlay" });
  const roundsKey = shortcutKey({ type: "rounds" });
  const playDisabled = limits.gameEnd && !playing;

  return (
    <div className={styles.nav} role="toolbar" aria-label={m.transport.label}>
      <div className={styles.row}>
        <JumpButton
          icon="prevRound"
          label={m.viewer.prevRound}
          command={{ kind: "roundStartOrPrev" }}
          disabled={limits.gameStart}
          area={styles.pr}
          onNav={onNav}
        />
        <button
          type="button"
          className={cx(styles.round, styles.rl)}
          aria-label={m.table.openRoundList(roundName)}
          title={roundsKey ? m.tools.withKey(m.help.rounds, roundsKey) : m.help.rounds}
          onClick={onRoundList}
        >
          <span className={styles.roundName}>{roundName}</span>
          <Icon name="caret" className={styles.caret} />
        </button>
        <JumpButton
          icon="nextRound"
          label={m.viewer.nextRound}
          command={{ kind: "nextRound" }}
          disabled={limits.lastRound}
          area={styles.nr}
          onNav={onNav}
        />
        <span className={styles.gap} aria-hidden="true" />
        <RepeatButton
          icon="prevTurn"
          label={m.transport.prevTurn}
          command={{ kind: "ownTurn", dir: -1 }}
          disabled={limits.gameStart}
          area={styles.pt}
          onNav={onNav}
        />
        {compact ? null : (
          <span className={cx(styles.turn, styles.tl)}>{m.transport.turn(turn)}</span>
        )}
        <RepeatButton
          icon="nextTurn"
          label={m.transport.nextTurn}
          command={{ kind: "ownTurn", dir: 1 }}
          disabled={limits.gameEnd}
          area={styles.nt}
          onNav={onNav}
        />
      </div>
      <div className={styles.row}>
        {compact ? null : (
          <JumpButton
            icon="prevKey"
            label={m.transport.prevMoment}
            command={{ kind: "keyMoment", dir: -1 }}
            disabled={limits.gameStart}
            area={styles.pk}
            onNav={onNav}
          />
        )}
        <RepeatButton
          icon="prevStep"
          label={m.viewer.prevStep}
          command={{ kind: "step", dir: -1 }}
          disabled={limits.gameStart}
          area={styles.ps}
          onNav={onNav}
        />
        <button
          type="button"
          className={cx(styles.play, styles.pl)}
          aria-label={m.transport.autoplay}
          aria-pressed={playing}
          aria-disabled={playDisabled}
          title={playKey ? m.tools.withKey(m.transport.autoplay, playKey) : m.transport.autoplay}
          onClick={() => {
            if (!playDisabled) {
              onTogglePlay();
            }
          }}
        >
          <Icon name={playing ? "pause" : "play"} className={styles.playGlyph} />
          <span className={styles.playLabel}>{m.transport.autoplay}</span>
        </button>
        <RepeatButton
          icon="nextStep"
          label={m.viewer.nextStep}
          command={{ kind: "step", dir: 1 }}
          disabled={limits.gameEnd}
          area={styles.ns}
          onNav={onNav}
        />
        {compact ? null : (
          <JumpButton
            icon="nextKey"
            label={m.transport.nextMoment}
            command={{ kind: "keyMoment", dir: 1 }}
            disabled={limits.gameEnd}
            area={styles.nk}
            onNav={onNav}
          />
        )}
        {compact ? null : (
          <>
            <span className={styles.gap} aria-hidden="true" />
            <button
              type="button"
              className={cx(styles.speed, styles.sp)}
              aria-label={m.transport.speed(speed)}
              title={m.tools.withKey(m.settings.autoplaySpeed, speedKeys)}
              onClick={() => onSpeed(cycleSpeed(speed))}
            >
              {m.transport.speedValue(speed)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
