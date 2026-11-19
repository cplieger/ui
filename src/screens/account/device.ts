/**
 * device.ts — names the browser and system a session's user agent reports,
 * as "Firefox on Linux", for a session with no label of its own.
 * @module
 */

import type { AccountWords } from "./words.js";

// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\b(?:OPR|Opera)\//, "Opera"],
  [/\b(?:Firefox|FxiOS)\//, "Firefox"],
  [/\b(?:Chrome|CriOS|Chromium)\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

// iPhone and Android before macOS and Linux, which their agents also name.
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/\b(?:iPhone|iPod)\b/, "iOS"],
  [/\biPad\b/, "iPadOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/** A session's name: its label, else its browser and system, else the
 *  words for an unknown one. */
export function deviceName(
  s: { readonly label?: string; readonly user_agent?: string },
  w: AccountWords,
): string {
  if (s.label !== undefined && s.label !== "") {
    return s.label;
  }
  const ua = s.user_agent ?? "";
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  if (browser === undefined) {
    return system ?? w["sessions.unknownDevice"];
  }
  return system === undefined ? browser : w["sessions.browserOn"](browser, system);
}
