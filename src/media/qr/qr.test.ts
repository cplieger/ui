import { afterEach, describe, expect, it } from "vitest";

import { encodeQr, qrCode, type QrLevel } from "./qr.js";

afterEach(() => {
  document.body.replaceChildren();
});

// The Annex I symbol is the standard's own example; the other expected
// symbols are the output of Project Nayuki's qrcodegen, which qr.ts ports,
// as module strings or the SHA-256 of the rows joined; the capacities are
// the standard's Table 7.
const ANNEX_I_1M = [
  "111111100011101111111",
  "100000101110001000001",
  "101110100110001011101",
  "101110100101101011101",
  "101110101101101011101",
  "100000100001001000001",
  "111111101010101111111",
  "000000000000000000000",
  "101010100010100010010",
  "110100001011010100010",
  "000110111011011101110",
  "110011010101110110010",
  "001001110111011100001",
  "000000001010001000010",
  "111111100000100010001",
  "100000100010001001011",
  "101110101110101011101",
  "101110100101010101110",
  "101110101101011100101",
  "100000100001110111000",
  "111111101001011100101",
];

const OTPAUTH =
  "otpauth://totp/Release%20tracker:mika?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Release%20tracker";
const FILL = "abcdefghijklmnopqrstuvwxyz0123456789-_.~".repeat(80);

const rows = (text: string, level: QrLevel): string[] => {
  const { size, modules } = encodeQr(text, level);
  return Array.from({ length: size }, (_, y) =>
    Array.from(modules.slice(y * size, (y + 1) * size)).join(""),
  );
};

async function digest(text: string, level: QrLevel): Promise<string> {
  const bytes = new TextEncoder().encode(rows(text, level).join(""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("encodeQr", () => {
  it("draws the standard's Annex I text, 01234567 at 1-M, module for module", () => {
    const symbol = encodeQr("01234567", "M");
    expect(symbol).toMatchObject({ version: 1, level: "M", mode: "numeric", mask: 0, size: 21 });
    expect(rows("01234567", "M")).toEqual(ANNEX_I_1M);
  });

  it.each([
    ["L", 5, 4, "5e63773d34ea2dceee37fce6bcab201ca5b2bb587eff9d84e5a601407dbad92c"],
    ["M", 6, 6, "f1595e38fcd148755211b08bff7078a4cdfc903315e7c1cde5041304c99bafb2"],
    ["Q", 8, 3, "04f11cc11ef8fc239488e08f8356db2b6fb0f35b0dd86d68d76addef4b4e1e98"],
    ["H", 10, 5, "b1056b3e0ebfda8fa3d9f96626b697f033471540d9bca43affd1cca33a84b252"],
  ] as const)(
    "draws an authenticator link at level %s as version %i with mask %i",
    async (level, version, mask, hash) => {
      expect(encodeQr(OTPAUTH, level)).toMatchObject({ version, mask, mode: "byte" });
      expect(await digest(OTPAUTH, level)).toBe(hash);
    },
  );

  it.each([
    [150, "L", 7, 2, "cde3f02b10b3f37f501bcb2d85a3df4635ae55b07f421aaf5019cc20b3002028"],
    [210, "M", 10, 2, "49dd509be574bc8bb104654aca1356463723187701fd7e771775eca9f4e0cd2a"],
    [800, "Q", 27, 2, "0c24de20c6706b2c5ca0bd782649011e32f92dfb6ab5d6a3dc13e33e8687f00c"],
    [1273, "H", 40, 2, "9bb11c40046431a35821584de0f0eafd2a19b4af71991f7dd338baf5c2cd4018"],
  ] as const)(
    "draws %i bytes at level %s as version %i, with its version information",
    async (length, level, version, mask, hash) => {
      const text = FILL.slice(0, length);
      expect(encodeQr(text, level)).toMatchObject({ version, mask, size: version * 4 + 17 });
      expect(await digest(text, level)).toBe(hash);
    },
  );

  it("picks the smallest mode that holds the text, counting UTF-8 bytes in byte mode", () => {
    expect(encodeQr("3141592653589793").mode).toBe("numeric");
    expect(encodeQr("HELLO WORLD $%*+-./:").mode).toBe("alphanumeric");
    expect(encodeQr("Hello").mode).toBe("byte");
    // 14 bytes fill version 1 at M; "é" is two of them.
    expect(encodeQr("é".repeat(7), "M").version).toBe(1);
    expect(encodeQr(`${"é".repeat(7)}a`, "M").version).toBe(2);
  });

  it.each([
    ["L", 17],
    ["M", 14],
    ["Q", 11],
    ["H", 7],
  ] as const)("holds version 1's %s byte capacity of %i and steps up past it", (level, bytes) => {
    expect(encodeQr("a".repeat(bytes), level).version).toBe(1);
    expect(encodeQr("a".repeat(bytes + 1), level).version).toBe(2);
  });

  it.each([
    ["L", "a", 2953],
    ["M", "a", 2331],
    ["Q", "a", 1663],
    ["H", "a", 1273],
    ["L", "7", 7089],
    ["L", "A", 4296],
  ] as const)(
    "holds version 40's %s capacity of %s × %i and refuses one more",
    (level, char, count) => {
      expect(encodeQr(char.repeat(count), level).version).toBe(40);
      expect(() => encodeQr(char.repeat(count + 1), level)).toThrow(RangeError);
    },
  );

  it("refuses a level the standard does not have", () => {
    expect(() => encodeQr("a", "X" as QrLevel)).toThrow(RangeError);
    expect(() => encodeQr("a", "constructor" as QrLevel)).toThrow(RangeError);
  });
});

describe("qrCode", () => {
  it("draws every dark module once inside a 4-module quiet zone, with no style attribute", () => {
    const svg = qrCode(OTPAUTH);
    const { size, modules } = encodeQr(OTPAUTH);
    expect(svg.classList.contains("cp-qr")).toBe(true);
    expect(svg.getAttribute("viewBox")).toBe(`0 0 ${size + 8} ${size + 8}`);
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg.outerHTML).not.toContain("style");
    const dark = new Set<string>();
    for (const [, x, y, run] of (svg.querySelector("path")?.getAttribute("d") ?? "").matchAll(
      /M(\d+) (\d+)h(\d+)/g,
    )) {
      for (let i = 0; i < Number(run); i++) {
        dark.add(`${Number(x) + i - 4},${Number(y) - 4}`);
      }
    }
    const expected = new Set<string>();
    modules.forEach((m, i) => {
      if (m === 1) {
        expected.add(`${i % size},${Math.floor(i / size)}`);
      }
    });
    expect(dark).toEqual(expected);
  });

  it("is hidden from assistive technology unless it has a label", () => {
    expect(qrCode("a").getAttribute("aria-hidden")).toBe("true");
    const named = qrCode("a", { label: "Scan with your authenticator app" });
    expect(named.getAttribute("role")).toBe("img");
    expect(named.getAttribute("aria-label")).toBe("Scan with your authenticator app");
    expect(named.hasAttribute("aria-hidden")).toBe(false);
  });

  it("takes a wider quiet zone and the level, and refuses one under 4 modules", () => {
    expect(qrCode("a", { quiet: 6, level: "H" }).getAttribute("viewBox")).toBe("0 0 33 33");
    expect(() => qrCode("a", { quiet: 3 })).toThrow(RangeError);
    expect(() => qrCode("a", { quiet: 4.5 })).toThrow(RangeError);
  });
});
