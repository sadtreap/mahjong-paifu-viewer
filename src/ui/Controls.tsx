import type { Round } from "../core/model";
import { useI18n } from "../i18n/context";
import styles from "./Controls.module.css";
import { Icon, type IconName } from "./Icon";
import type { NavAction } from "./keys";
import { roundLabel } from "./labels";
import { keyed } from "./layout";

export interface ControlsProps {
  rounds: Round[];
  round: number;
  step: number;
  stepCount: number;
  onAction: (action: NavAction) => void;
  onRound: (round: number) => void;
  onStep: (step: number) => void;
}

interface ButtonSpec {
  action: NavAction;
  icon: IconName;
  disabled: boolean;
}

/** Round selector, step buttons and the step slider. */
export function Controls({
  rounds,
  round,
  step,
  stepCount,
  onAction,
  onRound,
  onStep,
}: ControlsProps) {
  const { m } = useI18n();
  const atStart = round === 0 && step === 0;
  const atEnd = round === rounds.length - 1 && step === stepCount - 1;
  const buttons: ButtonSpec[] = [
    { action: "prevRound", icon: "prevRound", disabled: round === 0 },
    { action: "firstStep", icon: "first", disabled: step === 0 },
    { action: "prevStep", icon: "prev", disabled: atStart },
    { action: "nextStep", icon: "next", disabled: atEnd },
    { action: "lastStep", icon: "last", disabled: step === stepCount - 1 },
    { action: "nextRound", icon: "nextRound", disabled: round === rounds.length - 1 },
  ];

  return (
    <fieldset className={styles.controls}>
      <legend className="sr-only">{m.viewer.playback}</legend>
      <label className={styles.roundSelect}>
        <span className={styles.label}>{m.viewer.round}</span>
        <select value={round} onChange={(event) => onRound(Number(event.target.value))}>
          {keyed(rounds).map(({ key, index, item }) => (
            <option key={key} value={index}>
              {roundLabel(m, item)}
            </option>
          ))}
        </select>
      </label>
      <div className={styles.buttons}>
        {/* aria-disabled instead of disabled: a button that reaches its limit when pressed (Last
            step, First step) keeps the keyboard focus instead of dropping it to the page. */}
        {buttons.map(({ action, icon, disabled }) => (
          <button
            key={action}
            type="button"
            className={styles.button}
            aria-label={m.viewer[action]}
            title={m.viewer[action]}
            aria-disabled={disabled}
            onClick={() => {
              if (!disabled) {
                onAction(action);
              }
            }}
          >
            <Icon name={icon} />
          </button>
        ))}
      </div>
      <label className={styles.slider}>
        <span className="sr-only">{m.viewer.stepSlider}</span>
        <input
          type="range"
          min={0}
          max={Math.max(stepCount - 1, 0)}
          value={step}
          aria-valuetext={m.viewer.stepCounter(step + 1, stepCount)}
          onChange={(event) => onStep(Number(event.target.value))}
        />
      </label>
      {/* Not a live region: the status line already announces each step, and the slider's
          value text carries the counter. */}
      <output className={styles.counter} aria-live="off">
        {m.viewer.stepCounter(step + 1, stepCount)}
      </output>
    </fieldset>
  );
}
