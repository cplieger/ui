import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhancePanel } from "./panel.js";

let life = new AbortController();

afterEach(() => {
  life.abort();
  life = new AbortController();
  for (const p of document.querySelectorAll<HTMLElement>(":popover-open")) {
    p.hidePopover();
  }
  document.body.replaceChildren();
});

function page(heading = true): {
  opener: HTMLButtonElement;
  panel: HTMLElement;
  after: HTMLButtonElement;
} {
  const root = document.createElement("div");
  // Static test markup, never caller text.
  root.setHTMLUnsafe(
    '<button type="button" id="opener" popovertarget="status">All good</button><button type="button" id="after">Search</button>' +
      `<div class="cp-popover" data-variant="panel" popover id="status">${heading ? "<h2>Status</h2>" : ""}<button type="button" id="first">Run a check</button><button type="button" id="last">Open the log</button></div>`,
  );
  document.body.append(root);
  const get = (id: string) => root.querySelector(`#${id}`) as HTMLElement;
  return {
    opener: get("opener") as HTMLButtonElement,
    panel: get("status"),
    after: get("after") as HTMLButtonElement,
  };
}

describe("enhancePanel", () => {
  it("moves focus to the panel's heading as it opens, or else to its first control", async () => {
    const a = page();
    enhancePanel(a.panel, { signal: life.signal });
    await userEvent.click(a.opener);
    expect(document.activeElement?.tagName).toBe("H2");
    a.panel.hidePopover();
    document.body.replaceChildren();
    const b = page(false);
    enhancePanel(b.panel, { signal: life.signal });
    await userEvent.click(b.opener);
    expect(document.activeElement?.id).toBe("first");
  });

  it("closes as Tab leaves its last control, and focus goes on from its opener", async () => {
    const { opener, panel, after } = page();
    enhancePanel(panel, { signal: life.signal });
    opener.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Tab}{Tab}");
    expect(document.activeElement?.id).toBe("last");
    await userEvent.keyboard("{Tab}");
    expect(panel.matches(":popover-open")).toBe(false);
    expect(document.activeElement).toBe(after);
  });
});
