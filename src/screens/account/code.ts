/**
 * code.ts — the field for a six-digit code from an authenticator app.
 * @module
 */

import { field, type Field } from "./dom.js";

/** A `.cp-field` for a six-digit code: numeric keys on a phone, and the
 *  code a password manager or the phone's messages offer. */
export function codeField(spec: {
  readonly label: string;
  readonly help?: string;
  readonly name?: string;
}): Field {
  const f = field({
    label: spec.label,
    name: spec.name ?? "code",
    autocomplete: "one-time-code",
    ...(spec.help === undefined ? {} : { help: spec.help }),
  });
  f.input.inputMode = "numeric";
  f.input.classList.add("cp-mono");
  return f;
}

/** The six digits typed, with spaces dropped, or undefined when the field
 *  holds anything else. */
export function sixDigits(value: string): string | undefined {
  const code = value.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : undefined;
}

/** `text` with spaces and dashes dropped, in groups of four joined by
 *  `by`, as a key or a code is read aloud and typed. */
export function inFours(text: string, by: string): string {
  return (text.replace(/[\s-]/g, "").match(/.{1,4}/g) ?? []).join(by);
}
