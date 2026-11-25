import { useCallback, useState } from "react";
import { readStorage, writeStorage } from "../storage";

const STORAGE_NAME = "showAllHands";

/** "Show all hands" setting, on by default and remembered across visits. */
export function useShowAllHands(): [boolean, (show: boolean) => void] {
  const [show, setShow] = useState(() => readStorage(STORAGE_NAME) !== "false");
  const update = useCallback((next: boolean) => {
    setShow(next);
    writeStorage(STORAGE_NAME, String(next));
  }, []);
  return [show, update];
}
