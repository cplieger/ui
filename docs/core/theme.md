# theme

`@cplieger/ui/theme`

A stored theme choice of `light`, `dark` or `system`. In `system` it follows the OS preference live through `matchMedia`, and with the default storage, or an adapter with `subscribe`, every tab follows a choice made in another.

## Usage

```ts
import { createTheme, themeInitSnippet } from "@cplieger/ui/theme";

const theme = createTheme({ storageKey: "app-theme" });
theme.set("dark");
theme.cycle(); // light -> dark -> system -> light
theme.resolved(); // "light" | "dark" (system resolved to a concrete value)
theme.dispose();
```

Before first paint, an external blocking `<script src>` in `<head>` applies the stored choice. The module imports nothing, so that script loads only this file:

```ts
import { applyTheme } from "@cplieger/ui/theme";

applyTheme({ storageKey: "app-theme" });
```

Where the page allows an inline script, `themeInitSnippet` gives the same as a string:

```html
<script>
  /* server-render this: themeInitSnippet("app-theme") */
</script>
```

## API

- `createTheme(opts)` returns a `ThemeController` with `get()`, `set(choice)`, `resolved()`, `cycle()`, `getSystem()` and `dispose()`.
- `ThemeOptions` = `{ storageKey; storage?; attribute?; onChange?; onSystemChange?; signal? }`. Aborting `signal` does what `dispose()` does. `attribute` defaults to `data-theme` and is set on `<html>` with the resolved value. `onSystemChange(system)` runs on every OS change, whatever the choice, so a label such as "System (now dark)" stays true.
- `applyTheme({ storageKey, storage?, attribute? })` resolves the stored choice once, writes the attribute and returns the value, leaving no listener. It never throws: a storage error or an unknown value resolves as `system`, and a missing `matchMedia` as `light`. It and `createTheme` resolve the same stored value the same way.
- `themeInitSnippet(storageKey, attribute?)` returns a self-contained script as a string. Inline it in a blocking `<head>` script so the right theme paints before stylesheets load, a place where a real import cannot run.
- `themeInitSnippetFromJSON(storageKey, field, attribute?)` does the same when the theme is a field of a JSON value. The inline script reads `localStorage[storageKey]`, parses it, takes `field`, and applies the resolved theme before the first paint.

```html
<script>
  /* server-render this: themeInitSnippetFromJSON("app.ui-state", "theme") */
</script>
```

### Custom `storage` adapter

By default the choice is a plain string in `localStorage[storageKey]`. Pass a `storage` adapter to keep it anywhere else, for example as a `theme` field of a JSON value you already own:

```ts
const KEY = "app.ui-state";
const theme = createTheme({
  storageKey: KEY, // unused by a custom adapter, but still required
  storage: {
    get: () => JSON.parse(localStorage.getItem(KEY) ?? "{}").theme ?? null,
    set: (value) => {
      const blob = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      blob.theme = value; // read-modify-write; siblings untouched
      localStorage.setItem(KEY, JSON.stringify(blob));
    },
  },
});
```

`ThemeStorage` is `{ get(): string | null; set(value: string): void; subscribe?(onExternalChange): () => void }`. With `subscribe`, the controller re-reads and applies the choice when another tab changes it, and writes nothing back, so two tabs never echo each other. The default adapter subscribes through the `storage` event, which fires only in the other tabs of the origin. Only storage goes through it. Resolving the choice, following the OS in `system` and setting the attribute work the same way. A two-state app with only light and dark never calls `set("system")`, and nothing forces the third state. An adapter that throws, because storage is blocked or the JSON is bad, falls back to keeping the choice in memory.

## Notes

- Both snippets read `window.localStorage` directly. They run before any module loads, so they cannot use a custom `storage` adapter. Use `themeInitSnippet` for a plain key and `themeInitSnippetFromJSON` for a JSON field.
- The snippets fall back to the OS preference, `prefers-color-scheme`, when storage is unavailable, the value is missing or malformed, or the field is absent or `"system"`. That matches `createTheme`'s default at runtime, so a dark-mode user does not see a flash of the light theme.
- The `storageKey`, `field` and `attribute` are escaped for an inline `<script>`, so a value containing `</script>` or other HTML-breaking characters is safe.
