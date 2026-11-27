// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../i18n/I18nProvider";
import type { MeldView, SeatView } from "../replay/types";
import { HandRow } from "./HandRow";
import { MeldTiles } from "./MeldTiles";
import { OwnHand } from "./table/OwnHand";

const kakan: MeldView = {
  type: "kakan",
  tiles: ["6z", "6z"],
  from: 1,
  calledTile: "6z",
  addedTile: "6z",
};
const seat: SeatView = {
  hand: ["1m", "2m", "3m", "9p"],
  drawn: null,
  melds: [kakan],
  kita: [],
  discards: [],
  score: 25000,
  riichi: false,
};

const meldGroup = () => screen.getByRole("group", { name: /^Added kan/ });

afterEach(cleanup);

describe("MeldTiles", () => {
  it("lays the called tile sideways and stacks a kakan's added tile on it", () => {
    render(
      <I18nProvider>
        <MeldTiles meld={kakan} owner={0} />
      </I18nProvider>,
    );
    const group = meldGroup();
    expect(within(group).getAllByRole("img")).toHaveLength(4);
    // From the next player: the called tile is the rightmost, with the added tile in the same slot.
    const stack = group.lastElementChild as HTMLElement;
    expect(stack.querySelectorAll("img")).toHaveLength(2);
    expect([...group.children].slice(0, 2).every((child) => child.tagName === "IMG")).toBe(true);
  });

  it("draws the stack low on the table's rows, where nothing may rise above the row", () => {
    const classOf = (ui: React.ReactElement) => {
      render(<I18nProvider>{ui}</I18nProvider>);
      const name = meldGroup().className;
      cleanup();
      return name;
    };
    const plain = classOf(<MeldTiles meld={kakan} owner={0} />);
    const low = classOf(<MeldTiles meld={kakan} owner={0} low />);
    expect(low).not.toBe(plain);
    expect(low.startsWith(plain)).toBe(true);
    expect(classOf(<HandRow seat={0} view={seat} name="B" revealed />)).toBe(low);
    expect(classOf(<OwnHand seat={0} view={seat} name="B" />)).toBe(low);
  });
});
