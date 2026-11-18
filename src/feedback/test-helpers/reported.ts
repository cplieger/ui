import { onTestFinished } from "vitest";

/**
 * Collects the errors reported to the page until the test ends. Taking
 * them keeps the runner from failing the test on an error the module
 * reports on purpose, such as a host's word function that threw.
 */
export function reported(): readonly unknown[] {
  const errors: unknown[] = [];
  const take = (e: ErrorEvent): void => {
    errors.push(e.error);
    e.preventDefault();
  };
  window.addEventListener("error", take);
  onTestFinished(() => {
    window.removeEventListener("error", take);
  });
  return errors;
}
