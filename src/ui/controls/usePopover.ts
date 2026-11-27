import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { swallowNextClick } from "../input/swallowClick";

export interface PopoverOptions {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** A key that closes the open popover the way Esc does (the shortcut that opens it). */
  isCloseKey?(event: KeyboardEvent): boolean;
  /**
   * Puts the panel where it belongs on the screen (it is `position: fixed`, see
   * Popover.module.css). Runs when the popover opens, before an item takes the focus, and again
   * when the window changes size.
   */
  place(panel: HTMLElement, opener: HTMLElement): void;
}

export interface Popover {
  openerRef: RefObject<HTMLButtonElement | null>;
  openerProps: {
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    onClick(): void;
  };
  panelRef: RefObject<HTMLDivElement | null>;
  panelProps: {
    id: string;
    "data-gesture": "ignore";
    onKeyDown(event: ReactKeyboardEvent<HTMLElement>): void;
  };
  /** For an item: closes the popover, gives the focus back to the opener, then runs the action. */
  choose(action: () => void): void;
  /** Renders the panel: on the page itself, above the table and everything laid over it. */
  portal(panel: ReactNode): ReactNode;
}

/** The item a popover opens on: the checked or current one. */
const SELECTED = 'button[aria-checked="true"], button[aria-current="true"]';

/**
 * A popover that opens from a button: the point-of-view menu, the app menu and the round list.
 * Its items are the buttons inside the panel. The panel is rendered on the page itself, so that
 * neither the table nor a card over it can cover it.
 *
 * - The opener carries `aria-expanded` and, while open, `aria-controls`; pressing it toggles.
 * - Opening moves the focus to the checked or current item, or to the first one.
 * - Up, Down, Home and End move between the items; Enter and Space press the focused one.
 * - Esc closes it and Tab closes it, and both give the focus back to the opener (Tab then moves
 *   on from there). Esc stops at the popover, so nothing behind it reacts.
 * - A press outside closes it and goes no further: neither the press nor the click that ends it
 *   reaches what is under the pointer, so the table does not step and no button is pressed. Only
 *   another popover's button still opens its own popover with that click.
 * - The panel carries `data-gesture="ignore"`: the table's gestures and wheel stepping skip it.
 */
export function usePopover({ open, onOpenChange, isCloseKey, place }: PopoverOptions): Popover {
  const id = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onOpenChange, place });
  useEffect(() => {
    latest.current = { onOpenChange, place };
  });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const opener = openerRef.current;
    if (!open || !panel || !opener) {
      return;
    }
    const onResize = () => latest.current.place(panel, opener);
    latest.current.place(panel, opener);
    (panel.querySelector<HTMLElement>(SELECTED) ?? panel.querySelector("button"))?.focus();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (panelRef.current?.contains(target) || openerRef.current?.contains(target))
      ) {
        return;
      }
      event.stopPropagation();
      if (!(target instanceof Element && target.closest("[aria-expanded]"))) {
        swallowNextClick();
      }
      latest.current.onOpenChange(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const close = () => {
    onOpenChange(false);
    openerRef.current?.focus();
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const last = items.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = index >= last ? 0 : index + 1;
        break;
      case "ArrowUp":
        next = index <= 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Tab":
        // Not prevented: the focus goes on from the opener to the control after (or before) it.
        close();
        return;
      default:
        if (event.key !== "Escape" && !isCloseKey?.(event.nativeEvent)) {
          return;
        }
        close();
        next = -1;
    }
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };

  return {
    openerRef,
    openerProps: {
      "aria-expanded": open,
      "aria-controls": open ? id : undefined,
      onClick: () => onOpenChange(!open),
    },
    panelRef,
    panelProps: { id, "data-gesture": "ignore", onKeyDown },
    choose: (action) => {
      close();
      action();
    },
    portal: (panel) => createPortal(panel, document.body),
  };
}

/** The viewport's size, for placing a panel. */
export function viewport(): { width: number; height: number } {
  return { width: document.documentElement.clientWidth, height: window.innerHeight };
}

/**
 * Places a panel under its opener, right edges together, as tall as the room below allows. A
 * panel wider than the room to the opener's left moves right until it is on the screen.
 */
export function placeBelow(panel: HTMLElement, opener: HTMLElement): void {
  const rect = opener.getBoundingClientRect();
  const { width, height } = viewport();
  const top = rect.bottom + 6;
  const right = Math.min(width - rect.right, width - panel.offsetWidth - 8);
  panel.style.top = `${top}px`;
  panel.style.right = `${Math.max(8, right)}px`;
  panel.style.maxHeight = `${Math.max(120, height - top - 8)}px`;
}
