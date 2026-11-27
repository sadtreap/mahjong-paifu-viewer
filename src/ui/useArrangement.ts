import { arrangementFor, SHORT, WIDE } from "./arrangement";
import { useMediaQuery } from "./useMediaQuery";
import type { Arrangement } from "./viewer/types";

/**
 * The page's arrangement, the same one the stylesheets' media queries pick, updated when the
 * viewport changes. "wide" where there is no matchMedia.
 */
export function useArrangement(): Arrangement {
  const wide = useMediaQuery(WIDE, true);
  const short = useMediaQuery(SHORT);
  return arrangementFor(wide, short);
}
