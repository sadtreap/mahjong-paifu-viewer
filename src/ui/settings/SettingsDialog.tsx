import { type ReactNode, useId } from "react";
import { useI18n } from "../../i18n/context";
import { isLocale, LOCALE_LABELS, LOCALES } from "../../i18n/locales";
import { Dialog } from "../shell/Dialog";
import type { Settings, Theme, View } from "../viewer/types";
import styles from "./SettingsDialog.module.css";
import { AUTOPLAY_SPEEDS } from "./settings";
import { useSettings } from "./useSettings";

type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

const THEMES: readonly Theme[] = ["system", "light", "dark"];
const VIEWS: readonly View[] = ["3d", "flat"];

export interface SettingsDialogProps {
  open: boolean;
  onClose(): void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h3 id={id} className={styles.heading}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A group of radio buttons with a legend. */
function Choice<T extends string | number>({
  legend,
  options,
  value,
  label,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  value: T;
  label(option: T): string;
  onChange(option: T): void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.options}>
        {options.map((option) => (
          <label key={option} className={styles.option}>
            <input
              type="radio"
              name={name}
              checked={option === value}
              onChange={() => onChange(option)}
            />
            {label(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * The settings, applied as they change (nothing to save): display, review aids and controls, plus
 * the language (kept by the I18nProvider) and Reset to defaults.
 */
export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { m, locale, setLocale } = useI18n();
  const { settings, update, reset } = useSettings();
  const languageId = useId();

  const toggle = (key: BooleanSetting, text: string) => (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(event) => {
          const patch: Partial<Settings> = {};
          patch[key] = event.target.checked;
          update(patch);
        }}
      />
      <span>{text}</span>
    </label>
  );

  return (
    <Dialog open={open} onClose={onClose} title={m.settings.heading} closeLabel={m.settings.close}>
      <div className={styles.body}>
        <Section title={m.settings.display}>
          <Choice
            legend={m.settings.view}
            options={VIEWS}
            value={settings.view}
            label={(view) => (view === "3d" ? m.settings.view3d : m.settings.viewFlat)}
            onChange={(view) => update({ view })}
          />
          {toggle("showAllHands", m.viewer.showAllHands)}
          {toggle("dimTsumogiri", m.settings.dimTsumogiri)}
          {toggle("captions", m.settings.captions)}
          {toggle("motion", m.settings.motion)}
          <Choice
            legend={m.settings.theme}
            options={THEMES}
            value={settings.theme}
            label={(theme) => m.settings.themes[theme]}
            onChange={(theme) => update({ theme })}
          />
          <div className={styles.field}>
            <label htmlFor={languageId}>{m.settings.language}</label>
            <select
              id={languageId}
              value={locale}
              onChange={(event) => {
                if (isLocale(event.target.value)) {
                  setLocale(event.target.value);
                }
              }}
            >
              {LOCALES.map((value) => (
                <option key={value} value={value} lang={value}>
                  {LOCALE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </Section>
        <Section title={m.settings.review}>
          {toggle("showWaits", m.settings.showWaits)}
          {toggle("showNextDiscard", m.settings.showNextDiscard)}
          {toggle("movesShowRest", m.settings.movesShowRest)}
        </Section>
        <Section title={m.settings.controls}>
          {toggle("clickToStep", m.settings.clickToStep)}
          {toggle("wheelToStep", m.settings.wheelToStep)}
          {toggle("charKeys", m.settings.charKeys)}
          <Choice
            legend={m.settings.autoplaySpeed}
            options={AUTOPLAY_SPEEDS}
            value={settings.autoplaySpeed}
            label={(speed) => m.transport.speedValue(speed)}
            onChange={(autoplaySpeed) => update({ autoplaySpeed })}
          />
        </Section>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>
            {m.settings.reset}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
