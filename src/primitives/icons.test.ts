/// <reference types="@vitest/browser-playwright" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { cdp } from "vitest/browser";

import { type IconName, createIcons, iconNames } from "./icons.js";

// The reference rule docs/icons.md gives hosts, which the library does not ship.
const REFERENCE_CSS = `
.uip-icon {
  display: inline-block;
  flex: none;
  inline-size: var(--icon-size);
  block-size: var(--icon-size);
  background-color: currentColor;
  mask: var(--uip-icon) center / contain no-repeat;
}
.uip-icon[data-uip-icon-size="inline"] { --icon-size: 1em; }
.uip-icon[data-uip-icon-size="ui"] { --icon-size: 20px; }
@media (forced-colors: active) {
  .uip-icon { forced-color-adjust: none; }
  @supports (forced-color-adjust: preserve-parent-color) {
    .uip-icon { forced-color-adjust: preserve-parent-color; }
  }
}
`;

const cleanups: (() => void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

function mount(...nodes: Node[]): void {
  const host = document.createElement("div");
  host.append(...nodes);
  document.body.append(host);
  cleanups.push(() => {
    host.remove();
  });
}

function styled(): void {
  const style = document.createElement("style");
  style.textContent = REFERENCE_CSS;
  document.head.append(style);
  cleanups.push(() => {
    style.remove();
  });
}

describe("createIcons", () => {
  it("builds a decorative span with the namespaced attributes and the default ui size", () => {
    const { icon } = createIcons({ base: "/static/icons/" });
    const span = icon("refresh-cw");
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toBe("uip-icon");
    expect(span.getAttribute("data-uip-icon")).toBe("refresh-cw");
    expect(span.getAttribute("data-uip-icon-size")).toBe("ui");
    expect(span.getAttribute("aria-hidden")).toBe("true");
    expect(span.hasAttribute("data-icon")).toBe(false);
    expect(span.childNodes).toHaveLength(0);
    expect(icon("x", "hero").getAttribute("data-uip-icon-size")).toBe("hero");
  });

  it("writes --uip-icon through the CSSOM, never a style attribute", () => {
    const setAttribute = vi.spyOn(Element.prototype, "setAttribute");
    const span = createIcons({ base: "/static/icons/" }).icon("x", "lg");
    expect(span.style.getPropertyValue("--uip-icon")).toBe('url("/static/icons/x.svg")');
    expect(setAttribute.mock.calls.map((call) => call[0])).not.toContain("style");
  });

  it("base writes the value a url resolver returning base + name + .svg writes", () => {
    const base = createIcons({ base: "/i/" });
    const url = createIcons({ url: (name) => `/i/${name}.svg` });
    for (const name of iconNames) {
      expect(base.icon(name).style.getPropertyValue("--uip-icon")).toBe(
        url.icon(name).style.getPropertyValue("--uip-icon"),
      );
    }
  });

  it("takes a host's own name union with a hashed-URL resolver", () => {
    type Own = "pin" | "unpin";
    const hashed: Record<Own, string> = {
      pin: "/assets/pin-3f2a.svg",
      unpin: "/assets/unpin-91bc.svg",
    };
    const { icon } = createIcons<Own>({ url: (name) => hashed[name] });
    for (const name of ["pin", "unpin"] as const) {
      const span = icon(name, "inline");
      expect(span.getAttribute("data-uip-icon")).toBe(name);
      expect(span.style.getPropertyValue("--uip-icon")).toBe(`url("${hashed[name]}")`);
    }
  });

  it("keeps a quote, a backslash or a line break in a URL inside the CSS string", () => {
    const { icon } = createIcons<"a">({ url: () => '/x"); background: red; ("\\\n.svg' });
    const span = icon("a");
    mount(span);
    expect(span.style.getPropertyValue("background")).toBe("");
    expect(span.style.getPropertyValue("--uip-icon")).toBe(
      String.raw`url("/x\22 ); background: red; (\22 \5c \a .svg")`,
    );
  });

  it("throws a TypeError unless exactly one of url and base is given", () => {
    const bad: unknown[] = [
      {},
      { url: undefined, base: undefined },
      { url: (name: string) => name, base: "/i/" },
      { url: (name: string) => name, base: 1 },
      { url: "/i/" },
      { base: 1 },
    ];
    for (const opts of bad) {
      expect(() => createIcons(opts as never)).toThrow(TypeError);
    }
    expect(() => createIcons({ url: (name) => name, base: undefined })).not.toThrow();
    expect(() => createIcons({ base: "/i/", url: undefined })).not.toThrow();
  });

  it("types an unknown shipped name as an error", () => {
    const { icon } = createIcons({ base: "/i/" });
    // @ts-expect-error "nope" is not an IconName.
    expect(icon("nope").getAttribute("data-uip-icon")).toBe("nope");
    const name: IconName = "zap";
    expect(icon(name).getAttribute("data-uip-icon")).toBe("zap");
  });
});

describe("the reference rule", () => {
  const svg = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>',
  )}`;

  function button(color: string): { button: HTMLButtonElement; span: HTMLSpanElement } {
    const span = createIcons<"box">({ url: () => svg }).icon("box");
    const b = document.createElement("button");
    b.style.color = color;
    b.append(span, "Refresh");
    mount(b);
    return { button: b, span };
  }

  it("paints the icon in the button's text colour, light and dark", () => {
    styled();
    for (const color of ["rgb(17, 24, 39)", "rgb(243, 244, 246)"]) {
      const { button: b, span } = button(color);
      const cs = getComputedStyle(span);
      expect(cs.backgroundColor).toBe(getComputedStyle(b).color);
      expect(cs.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(cs.maskImage).toContain("url(");
      expect(span.getBoundingClientRect().width).toBe(20);
    }
  });

  // Under forced-color-adjust: none, Chromium's span inherits the parent's
  // unforced colour; preserve-parent-color is what this test holds to.
  it("keeps the icon in the forced text colour under forced colours", async () => {
    styled();
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
    expect(matchMedia("(forced-colors: active)").matches).toBe(true);
    const { button: b, span } = button("rgb(255, 0, 0)");
    expect(getComputedStyle(b).color).not.toBe("rgb(255, 0, 0)");
    expect(getComputedStyle(span).backgroundColor).toBe(getComputedStyle(b).color);
    // A link's forced LinkText differs from the button's ButtonText, so this
    // holds only where the icon inherits its own parent's forced colour.
    const link = document.createElement("a");
    link.href = "#icons";
    link.style.color = "rgb(255, 0, 0)";
    const inLink = createIcons<"box">({ url: () => svg }).icon("box");
    link.append(inLink, "More");
    mount(link);
    const linkColor = getComputedStyle(link).color;
    expect(linkColor).not.toBe(getComputedStyle(b).color);
    expect(getComputedStyle(inLink).backgroundColor).toBe(linkColor);
    const selected = document.createElement("div");
    selected.style.cssText = "background: Highlight; color: HighlightText";
    const inSelected = createIcons<"box">({ url: () => svg }).icon("box");
    selected.append(inSelected, "Selected");
    mount(selected);
    expect(getComputedStyle(inSelected).backgroundColor).toBe(getComputedStyle(selected).color);
  });
});
