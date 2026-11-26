/**
 * The pause between repeated steps while a hold lasts: 10 steps/s for the first second, then
 * 20/s, then 30/s.
 */
export function repeatInterval(elapsedMs: number): 100 | 50 | 33 {
  if (elapsedMs < 1000) {
    return 100;
  }
  return elapsedMs < 2000 ? 50 : 33;
}

export interface Repeater {
  /** Steps now, then on the repeat schedule until a step returns false or `stop` is called. */
  start(): void;
  stop(): void;
  readonly active: boolean;
}

/**
 * Runs `tick` on the hold schedule. Elapsed time is the sum of the scheduled pauses, so the
 * schedule does not depend on the clock (and fake timers drive it exactly).
 */
export function createRepeater(tick: () => boolean): Repeater {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let elapsed = 0;

  const stop = () => {
    active = false;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const run = () => {
    timer = null;
    if (!active) {
      return;
    }
    if (!tick()) {
      stop();
      return;
    }
    if (!active) {
      return;
    }
    const pause = repeatInterval(elapsed);
    elapsed += pause;
    timer = setTimeout(run, pause);
  };

  return {
    start() {
      stop();
      active = true;
      elapsed = 0;
      run();
    },
    stop,
    get active() {
      return active;
    },
  };
}
