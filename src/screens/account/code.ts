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

/** A recovery code as access normalises it: dashes and spaces dropped,
 *  then 16 ASCII letters and digits, upper-cased, with O read as 0 and I
 *  or L as 1; undefined for anything else. The ASCII test comes before
 *  case mapping, which turns ß into SS and ı into I. */
export function recoveryCode(value: string): string | undefined {
  const bare = value.replace(/[\s-]/g, "");
  if (!/^[0-9A-Za-z]{16}$/.test(bare)) {
    return undefined;
  }
  return bare.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
}

/** A `.cp-field` for a recovery code, which groups what is typed in fours
 *  as it is typed, keeping the caret after the same character. */
export function groupedField(
  spec: { readonly label: string; readonly help?: string; readonly name?: string },
  signal?: AbortSignal,
): Field {
  const f = field({
    label: spec.label,
    name: spec.name ?? "recovery_code",
    autocomplete: "off",
    ...(spec.help === undefined ? {} : { help: spec.help }),
  });
  const input = f.input;
  input.classList.add("cp-mono");
  input.setAttribute("autocapitalize", "characters");
  input.addEventListener(
    "input",
    () => {
      const caret = input.selectionStart ?? input.value.length;
      const before = input.value.slice(0, caret).replace(/[\s-]/g, "").length;
      const grouped = inFours(input.value, "-");
      if (grouped === input.value) {
        return;
      }
      input.value = grouped;
      // Each full group before the caret adds one dash.
      const at = before + Math.floor(Math.max(0, before - 1) / 4);
      input.setSelectionRange(at, at);
    },
    signal === undefined ? {} : { signal },
  );
  return f;
}
