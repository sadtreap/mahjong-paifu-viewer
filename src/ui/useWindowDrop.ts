import { useEffect, useRef, useState } from "react";
import { isTextEntry } from "./dom";
import { dragHasLog, type LogSource, sourceFromDataTransfer } from "./logSource";

/**
 * Accepts logs dropped anywhere in the window. Returns true while something loadable is dragged
 * over the window, for the drop overlay. Text dropped into a text field is left to the field, and
 * drags that start inside the page are ignored.
 */
export function useWindowDrop(onDrop: (source: LogSource) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  });

  useEffect(() => {
    let depth = 0;
    let internal = false;

    const reset = () => {
      depth = 0;
      setDragging(false);
    };
    const handleDragStart = () => {
      internal = true;
    };
    const handleDragEnd = () => {
      internal = false;
      reset();
    };
    const handleDragEnter = (event: DragEvent) => {
      if (internal || !dragHasLog(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      depth++;
      setDragging(true);
    };
    const handleDragOver = (event: DragEvent) => {
      if (internal || !dragHasLog(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };
    const handleDragLeave = (event: DragEvent) => {
      if (internal || !dragHasLog(event.dataTransfer)) {
        return;
      }
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        setDragging(false);
      }
    };
    const handleDrop = (event: DragEvent) => {
      if (internal) {
        internal = false;
        reset();
        return;
      }
      reset();
      const data = event.dataTransfer;
      const hasFiles = (data?.files.length ?? 0) > 0;
      if (!hasFiles && isTextEntry(event.target)) {
        return;
      }
      const source = sourceFromDataTransfer(data);
      if (source) {
        event.preventDefault();
        onDropRef.current(source);
      }
    };

    window.addEventListener("dragstart", handleDragStart);
    window.addEventListener("dragend", handleDragEnd);
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragstart", handleDragStart);
      window.removeEventListener("dragend", handleDragEnd);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  return dragging;
}
