/**
 * gate.ts — the URL gate every `href` and `src` the renderer writes passes,
 * the withhold rule, and the `payloadShaped` heuristic it applies by default.
 * @module
 */

/** A destination the gate admitted. */
export interface Gated {
  /** The URL the gate checked: `href` for an absolute destination. */
  readonly url: URL;
  /** The destination named no scheme and no host, and resolved against `base`. */
  readonly relative: boolean;
  /** The destination without surrounding whitespace and C0 controls. */
  readonly text: string;
}

const ADMITTED = new Set(["http:", "https:", "mailto:"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
// eslint-disable-next-line no-control-regex -- the C0 range is the point.
const C0 = /[\u0000-\u001f]/g;
const PROTOCOL_RELATIVE = /^[/\\]{2}/;
// The URL Standard's single- and double-dot path segments, lowercased.
const DOT_SEGMENTS = new Set([".", "%2e", "..", ".%2e", "%2e.", "%2e%2e"]);

function parse(text: string, base?: URL): URL | null {
  try {
    return new URL(text, base);
  } catch {
    return null;
  }
}

function hasDotSegment(text: string): boolean {
  const end = text.search(/[?#]/);
  const path = end < 0 ? text : text.slice(0, end);
  return path.split(/[/\\]/).some((segment) => DOT_SEGMENTS.has(segment.toLowerCase()));
}

/**
 * Judges a destination as written, its character references already decoded
 * once. Only `http:`, `https:` and `mailto:` pass, `//host` as `https:`; a
 * relative destination passes only with `base`, and never with a `.` or `..`
 * segment in any spelling the URL Standard reads as one, since resolving
 * would hide it. `null` means refused.
 */
export function gate(raw: string, base: URL | null): Gated | null {
  const text = raw.replaceAll(C0, "").trim();
  if (text === "") {
    return null;
  }
  const scheme = SCHEME.exec(text)?.[1];
  if (scheme !== undefined) {
    const url = ADMITTED.has(`${scheme.toLowerCase()}:`) ? parse(text) : null;
    return url === null ? null : { url, relative: false, text };
  }
  if (PROTOCOL_RELATIVE.test(text)) {
    const url = parse(`https:${text}`);
    return url === null ? null : { url, relative: false, text };
  }
  if (base === null || hasDotSegment(text)) {
    return null;
  }
  const url = parse(text, base);
  // A `file:` or other non-web base would carry the destination off the web.
  return url === null || (url.protocol !== "http:" && url.protocol !== "https:")
    ? null
    : { url, relative: true, text };
}

/**
 * The attribute value for an admitted destination: the gate's own
 * serialization, or a relative destination's own text when the document's
 * base resolves that text to the same URL, so the browser follows what the
 * gate checked either way.
 */
export function written(gated: Gated, documentBase: string): string {
  if (
    gated.relative &&
    parse(gated.text, parse(documentBase) ?? undefined)?.href === gated.url.href
  ) {
    return gated.text;
  }
  return gated.url.href;
}

/** Whether a destination is only a fragment of the page it sits on. */
export function fragmentOnly(gated: Gated): boolean {
  return gated.relative && gated.text.startsWith("#");
}

/**
 * Whether `withhold` keeps a link's `href` off the page. It judges only a
 * destination that leaves the page's origin: never a relative one, never
 * `mailto:`.
 */
export function withheld(
  gated: Gated,
  withhold: false | ((url: URL) => boolean),
  pageOrigin: string,
): boolean {
  if (withhold === false || gated.relative || gated.url.protocol === "mailto:") {
    return false;
  }
  return gated.url.origin !== pageOrigin && withhold(gated.url);
}

const LONG_TAIL = 200;
const PERCENT_RUN = /%[0-9a-f]{2}(?:%[0-9a-f]{2}){20,}/i;
const CREDENTIAL =
  /(?:(?:AKIA|ASIA)[A-Z0-9]{16}|(?:ssh-rsa|ssh-ed25519)[\s+%]|BEGIN[\s+%](?:RSA|DSA|EC|OPENSSH)[\s+%]PRIVATE[\s+%]KEY|xox[bpas]-[0-9a-zA-Z-]+|gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})/i;
// `=` counts only as trailing padding, so `name=` and a short id do not fuse into one run.
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}|[A-Za-z0-9+/]{39}=|[A-Za-z0-9+/]{38}==/;
// Encoded data in a DNS label is a run of letters and digits; a long word has no digit.
const DATA_LABEL = /^(?=.*\d)(?=.*[a-z])[a-z0-9]{32,}$/i;
const LONG_HOST = 100;

function payloadText(text: string): boolean {
  return (
    text.length >= LONG_TAIL ||
    PERCENT_RUN.test(text) ||
    CREDENTIAL.test(text) ||
    BASE64_RUN.test(text)
  );
}

/**
 * The exfiltration heuristic `withhold` applies by default: whether the
 * query and fragment, or the user info, carry 200 characters, 21 percent
 * escapes in a row, a 40-character base64 run or a credential marker, or the
 * host has a 32-character label of letters and digits holding a digit, a
 * credential marker or over 100 characters. The path is not read: commit
 * hashes and long paths are ordinary there. Outside the safety contract.
 */
export function payloadShaped(url: URL): boolean {
  const tail = (url.search + url.hash).slice(1);
  const userinfo = url.username + url.password;
  const host = url.hostname;
  return (
    payloadText(tail) ||
    payloadText(userinfo) ||
    host.length > LONG_HOST ||
    CREDENTIAL.test(host) ||
    host.split(".").some((label) => DATA_LABEL.test(label))
  );
}
