/**
 * Keeps the click that ends the current press from reaching anything, for a press that has been
 * acted on already (a tap the table stepped on). A
 * browser aims that click when it sends it, after the press ended, at whatever is under the
 * pointer then. A click from the keyboard passes, and a new press ends the wait should no click
 * come.
 */
export function swallowNextClick(): void {
  const done = () => {
    window.removeEventListener("click", swallow, true);
    window.removeEventListener("pointerdown", done, true);
  };
  const swallow = (event: MouseEvent) => {
    if (event.detail === 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    done();
  };
  window.addEventListener("click", swallow, true);
  window.addEventListener("pointerdown", done, true);
}
