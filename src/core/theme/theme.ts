/**
 * theme.ts — The stored theme choice, light, dark or system, written to an
 * attribute on `<html>` as the concrete theme and following the OS while it
 * is system. `applyTheme` and `themeInitSnippet` apply it before first paint;
 * the module imports nothing, so a pre-paint bundle loads it alone.
 * @module
 */

/** The persisted preference: a pinned concrete theme, or `"system"` to follow
 *  the OS preference live. Distinct from the resolved value written to the
 *  document element, which is always concrete. */
export type ThemeChoice = "light" | "dark" | "system";
type Resolved = "light" | "dark";

/** Persistence adapter for the theme preference. Encapsulates WHERE and HOW the
 *  value is stored, so an app can keep the theme inside its own structure (for
 *  example a field of a larger JSON blob) rather than a bare localStorage key. */
export interface ThemeStorage {
  /** Read the persisted preference, or `null` when nothing is stored yet. */
  get(): string | null;
  /** Persist the preference value. */
  set(value: string): void;
  /** Call `onExternalChange` when the stored value changes outside this
   *  controller, as in another tab. Returns an unsubscribe. The default adapter
   *  implements it over the `storage` event. */
  subscribe?(onExternalChange: () => void): () => void;
}

/** Where the preference is persisted, which attribute carries the resolved
 *  theme, and a hook for each application. `storageKey` is the only required
 *  field; supply `storage` when the value must live somewhere other than a
 *  bare localStorage key. */
export interface ThemeOptions {
  /** localStorage key the default adapter persists under. Unused when a custom
   *  `storage` adapter is supplied (the adapter owns where the value lives). */
  storageKey: string;
  /** Persistence adapter. Defaults to bare `localStorage[storageKey]`. Supply a
   *  custom adapter to read/write the theme inside your own structure — e.g. a
   *  `theme` field of a JSON blob: `get` parses the blob and returns the field,
   *  `set` does a read-modify-write of that field. Everything else (tri-state
   *  resolution, following the OS while `system`, the applied attribute) is
   *  unchanged; a 2-state app simply never calls `set("system")`. */
  storage?: ThemeStorage;
  /** Attribute set on `<html>` with the resolved value. Default `data-theme`. */
  attribute?: string;
  /** Called with the resolved concrete theme whenever it changes/applies. */
  onChange?: (resolved: Resolved) => void;
  /** Called when the OS preference changes, whatever the choice, so a label
   *  such as "System (now dark)" stays true. */
  onSystemChange?: (system: Resolved) => void;
  /** Aborting it does what `dispose` does. */
  signal?: AbortSignal;
}

/** A live theme controller. The preference (`get`) and the theme actually
 *  applied (`resolved`) are separate values and differ whenever the preference
 *  is `"system"`. A controller keeps a matchMedia listener until `dispose`. */
export interface ThemeController {
  /** The stored preference (may be `"system"`). */
  get(): ThemeChoice;
  /** Persist + apply a preference. */
  set(choice: ThemeChoice): void;
  /** The concrete resolved theme (`"system"` → OS value via matchMedia). */
  resolved(): Resolved;
  /** Cycle light → dark → system → light. */
  cycle(): void;
  /** The current OS preference. */
  getSystem(): Resolved;
  /** Remove the matchMedia and storage listeners. */
  dispose(): void;
}

const DARK_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_ATTRIBUTE = "data-theme";

function isChoice(value: string | null): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/** The bare-localStorage adapter. Reads and writes may throw where storage is
 *  blocked; the callers catch. */
function defaultStorage(storageKey: string): ThemeStorage {
  return {
    get: () => window.localStorage.getItem(storageKey),
    set: (value) => {
      window.localStorage.setItem(storageKey, value);
    },
    subscribe: (onExternalChange) => {
      // The storage event fires only in other documents of the origin, so a
      // tab's own write never calls back (HTML "The storage event").
      const onStorage = (e: StorageEvent): void => {
        let ours: boolean;
        try {
          ours = e.storageArea === window.localStorage;
        } catch {
          // Reading localStorage throws where storage is blocked.
          ours = false;
        }
        if (ours && (e.key === storageKey || e.key === null)) {
          onExternalChange();
        }
      };
      window.addEventListener("storage", onStorage);
      return () => {
        window.removeEventListener("storage", onStorage);
      };
    },
  };
}

function readChoice(storage: ThemeStorage): ThemeChoice {
  let stored: string | null;
  try {
    stored = storage.get();
  } catch {
    stored = null;
  }
  return isChoice(stored) ? stored : "system";
}

function systemTheme(): Resolved {
  const match = (window as { matchMedia?: (q: string) => MediaQueryList }).matchMedia;
  return typeof match === "function" && match.call(window, DARK_QUERY).matches ? "dark" : "light";
}

function resolve(choice: ThemeChoice, system: Resolved): Resolved {
  return choice === "system" ? system : choice;
}

/** Resolve the stored choice once and write the attribute, leaving no
 *  listener: the call for an external blocking pre-paint script. Never throws:
 *  a storage error or an unknown stored value resolves as "system", and a
 *  missing `matchMedia` as "light". Returns the value written. */
export function applyTheme(
  opts: Pick<ThemeOptions, "storageKey" | "storage" | "attribute">,
): Resolved {
  const value = resolve(readChoice(opts.storage ?? defaultStorage(opts.storageKey)), systemTheme());
  try {
    document.documentElement.setAttribute(opts.attribute ?? DEFAULT_ATTRIBUTE, value);
  } catch {
    // An attribute name the DOM refuses leaves the page on its default theme.
  }
  return value;
}

/** Create a theme controller bound to the given storage key. Applies the
 *  resolved theme immediately and starts following the OS while in "system". */
export function createTheme(opts: ThemeOptions): ThemeController {
  const attribute = opts.attribute ?? DEFAULT_ATTRIBUTE;
  // try/catch-wrapped below, so blocked or absent storage degrades to
  // in-memory rather than throwing at construction.
  const storage: ThemeStorage = opts.storage ?? defaultStorage(opts.storageKey);
  const mql = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;

  let choice: ThemeChoice = readChoice(storage);

  const getSystem = (): Resolved => (mql?.matches === true ? "dark" : "light");
  const resolved = (): Resolved => resolve(choice, getSystem());

  const apply = (): void => {
    const value = resolved();
    document.documentElement.setAttribute(attribute, value);
    opts.onChange?.(value);
  };

  const set = (next: ThemeChoice): void => {
    choice = next;
    try {
      storage.set(next);
    } catch {
      // Storage denied, or a custom adapter threw — apply in memory only.
    }
    apply();
  };

  const cycle = (): void => {
    set(choice === "light" ? "dark" : choice === "dark" ? "system" : "light");
  };

  const onSystemChange = (): void => {
    if (choice === "system") {
      apply();
    }
    opts.onSystemChange?.(getSystem());
  };
  mql?.addEventListener("change", onSystemChange);

  // Another tab's choice re-applies here without writing it back, so two tabs
  // never echo each other.
  const unsubscribe = storage.subscribe?.(() => {
    choice = readChoice(storage);
    apply();
  });

  apply();

  const dispose = (): void => {
    mql?.removeEventListener("change", onSystemChange);
    unsubscribe?.();
  };
  if (opts.signal?.aborted === true) {
    dispose();
  } else {
    opts.signal?.addEventListener("abort", dispose, { once: true });
  }

  return {
    get: () => choice,
    set,
    resolved,
    cycle,
    getSystem,
    dispose,
  };
}

/** Build a self-contained IIFE string that reads the stored preference and sets
 *  the resolved theme attribute synchronously. Inline it in a blocking `<head>`
 *  script so the correct theme is painted before stylesheets parse:
 *
 *      <script>{themeInitSnippet("app-theme")}</script>
 */
export function themeInitSnippet(storageKey: string, attribute = DEFAULT_ATTRIBUTE): string {
  const key = jsonForScript(storageKey);
  const attr = jsonForScript(attribute);
  const system = `window.matchMedia("${DARK_QUERY}").matches?"dark":"light"`;
  return (
    `(function(){try{` +
    `var c=localStorage.getItem(${key});` +
    `if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}` +
    `var r=c==="system"?(${system}):c;` +
    `document.documentElement.setAttribute(${attr},r);` +
    // Falls back to the system preference, matching createTheme's runtime
    // default, rather than a hardcoded "light".
    `}catch(e){document.documentElement.setAttribute(${attr},${system});}})();`
  );
}

/** Like {@link themeInitSnippet}, but the preference is the `field` of a JSON
 *  object stored under `storageKey`, for a custom `storage` adapter that keeps
 *  the theme in a JSON blob. A missing, blank or non-object blob, or a
 *  `"system"` or unrecognized field, resolves to the OS preference. All three
 *  arguments are escaped for the inline-`<script>` context. */
export function themeInitSnippetFromJSON(
  storageKey: string,
  field: string,
  attribute = DEFAULT_ATTRIBUTE,
): string {
  const key = jsonForScript(storageKey);
  const fld = jsonForScript(field);
  const attr = jsonForScript(attribute);
  const system = `window.matchMedia("${DARK_QUERY}").matches?"dark":"light"`;
  return (
    `(function(){try{` +
    `var raw=localStorage.getItem(${key});` +
    `var o=raw?JSON.parse(raw):null;` +
    `var c=o&&typeof o==="object"?o[${fld}]:null;` +
    `if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}` +
    `var r=c==="system"?(${system}):c;` +
    `document.documentElement.setAttribute(${attr},r);` +
    // Same system-preference fallback as themeInitSnippet.
    `}catch(e){document.documentElement.setAttribute(${attr},${system});}})();`
  );
}

/** `JSON.stringify` a value, then neutralize the characters that could break
 *  out of an inline `<script>` context: `<` (so `</script>` can't close the
 *  tag) and the raw line separators U+2028 / U+2029 (invalid in JS strings in
 *  older engines, and stray line breaks in HTML). */
function jsonForScript(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\x3C")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
