import type { Locale } from "../locales";
import { en, type Messages } from "./en";
import { ja } from "./ja";
import { ko } from "./ko";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, ko, ja };
