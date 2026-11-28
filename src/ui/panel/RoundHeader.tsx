import { useI18n } from "../../i18n/context";
import { Icon, type IconName } from "../Icon";
import { shortcutKey } from "../viewer/shortcuts";
import type { NavCommand, RoundHeaderProps } from "../viewer/types";
import styles from "./RoundHeader.module.css";

interface JumpProps {
  icon: IconName;
  label: string;
  command: NavCommand;
  /** At a limit: shown disabled, still focusable. */
  disabled: boolean;
  onNav: RoundHeaderProps["onNav"];
}

/** A round button: one press, one jump. */
function Jump({ icon, label, command, disabled, onNav }: JumpProps) {
  const { m } = useI18n();
  const key = shortcutKey({ type: "nav", command });
  return (
    <button
      type="button"
      data-variant="ghost"
      data-icon=""
      aria-label={label}
      title={key ? m.tools.withKey(label, key) : label}
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
 * The panel's head: the round on the table by name ("East 2, 1 honba"), under it the turn, the
 * tiles left in the live wall and the riichi deposits, and the two buttons that go to the round
 * before and after. Buttons at a limit are aria-disabled, so they keep the focus.
 */
export function RoundHeader({
  roundName,
  turn,
  wallRemaining,
  deposits,
  limits,
  onNav,
}: RoundHeaderProps) {
  const { m } = useI18n();
  // A round that could not be replayed has a name and nothing else.
  const facts = wallRemaining === null ? [] : [m.transport.turn(turn), m.board.wall(wallRemaining)];
  if (wallRemaining !== null && deposits > 0) {
    facts.push(m.info.deposits(deposits));
  }
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h2 className={styles.name}>{roundName}</h2>
        {facts.length > 0 && <p className={styles.facts}>{facts.join(" · ")}</p>}
      </div>
      <Jump
        icon="prevRound"
        label={m.viewer.prevRound}
        command={{ kind: "roundStartOrPrev" }}
        disabled={limits.gameStart}
        onNav={onNav}
      />
      <Jump
        icon="nextRound"
        label={m.viewer.nextRound}
        command={{ kind: "nextRound" }}
        disabled={limits.lastRound}
        onNav={onNav}
      />
    </header>
  );
}
