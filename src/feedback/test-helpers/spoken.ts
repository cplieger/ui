import { expect } from "vitest";

/**
 * Asserts the page's polite region says `text`, once it holds a message.
 * The announcer clears the region and writes 100 ms later on a timer that
 * a loaded host can hold past `expect.poll`'s second, so this waits for the
 * write itself, however late, rather than for a time.
 */
export async function spoken(text: string): Promise<void> {
  const region = document.querySelector('[aria-live="polite"]');
  expect(region, "an installed announcer's polite region").not.toBeNull();
  if (region === null) {
    return;
  }
  if (region.textContent === "") {
    await new Promise<void>((resolve) => {
      const written = new MutationObserver(() => {
        if (region.textContent !== "") {
          written.disconnect();
          resolve();
        }
      });
      written.observe(region, { childList: true, characterData: true, subtree: true });
    });
  }
  expect(region.textContent).toBe(text);
}
