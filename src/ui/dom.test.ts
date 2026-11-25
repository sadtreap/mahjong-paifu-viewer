// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { focusIsLost, isTextEntry, nextTabbable, usesArrowKeys } from "./dom";
import { dragHasLog, sourceFromDataTransfer } from "./logSource";

function element(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.firstElementChild as Element;
}

describe("isTextEntry", () => {
  it("is true for text fields and textareas", () => {
    expect(isTextEntry(element("<textarea></textarea>"))).toBe(true);
    expect(isTextEntry(element('<input type="text">'))).toBe(true);
    expect(isTextEntry(element('<input type="search">'))).toBe(true);
  });

  it("is false for buttons, sliders, checkboxes and plain elements", () => {
    expect(isTextEntry(element("<button></button>"))).toBe(false);
    expect(isTextEntry(element('<input type="range">'))).toBe(false);
    expect(isTextEntry(element('<input type="checkbox">'))).toBe(false);
    expect(isTextEntry(element("<div></div>"))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });

  it("treats select boxes and sliders as using the arrow keys", () => {
    expect(usesArrowKeys(element("<select></select>"))).toBe(true);
    expect(usesArrowKeys(element('<input type="range">'))).toBe(true);
    expect(usesArrowKeys(element('<input type="checkbox">'))).toBe(false);
    expect(usesArrowKeys(element("<button></button>"))).toBe(false);
  });
});

describe("focus helpers", () => {
  it("finds the next focusable control after an element, skipping its own controls", () => {
    document.body.innerHTML = `
      <button id="before"></button>
      <div id="box"><button id="inside"></button></div>
      <span tabindex="-1"></span>
      <button id="off" disabled></button>
      <input id="next" type="file">
      <textarea id="later"></textarea>`;
    const box = document.getElementById("box") as HTMLElement;
    expect(nextTabbable(box)?.id).toBe("next");
    expect(nextTabbable(document.getElementById("later") as HTMLElement)).toBeNull();
    document.body.innerHTML = "";
  });

  it("knows when the focus fell back to the page", () => {
    document.body.innerHTML = "<button></button>";
    const button = document.querySelector("button") as HTMLButtonElement;
    expect(focusIsLost()).toBe(true);
    button.focus();
    expect(focusIsLost()).toBe(false);
    button.remove();
    expect(focusIsLost()).toBe(true);
  });
});

function transfer(data: { files?: File[]; text?: string; types?: string[] }): DataTransfer {
  const files = data.files ?? [];
  return {
    files: Object.assign([...files], { item: (i: number) => files[i] ?? null }),
    types: data.types ?? [
      ...(files.length > 0 ? ["Files"] : []),
      ...(data.text ? ["text/plain"] : []),
    ],
    getData: (type: string) => (type === "text/plain" ? (data.text ?? "") : ""),
  } as unknown as DataTransfer;
}

describe("sourceFromDataTransfer", () => {
  it("prefers a file over text", () => {
    const file = new File(["{}"], "log.json");
    expect(sourceFromDataTransfer(transfer({ files: [file], text: "x" }))).toEqual({
      kind: "file",
      file,
    });
  });

  it("falls back to the text and ignores blank text", () => {
    expect(sourceFromDataTransfer(transfer({ text: "<mjloggm>" }))).toEqual({
      kind: "text",
      text: "<mjloggm>",
    });
    expect(sourceFromDataTransfer(transfer({ text: "  " }))).toBeNull();
    expect(sourceFromDataTransfer(null)).toBeNull();
  });

  it("recognizes drags that carry files or text", () => {
    expect(dragHasLog(transfer({ types: ["Files"] }))).toBe(true);
    expect(dragHasLog(transfer({ types: ["text/plain"] }))).toBe(true);
    expect(dragHasLog(transfer({ types: ["text/html"] }))).toBe(false);
  });
});
