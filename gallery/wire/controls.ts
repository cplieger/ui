/**
 * controls.ts — the gallery's switchers, disclosures, popups and questions,
 * on the library's modules.
 */

import { ask } from "@cplieger/ui/ask";
import { closeDialog } from "@cplieger/ui/dialog";
import { enhanceDisclosure } from "@cplieger/ui/disclosure";
import { guardChanges } from "@cplieger/ui/form";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceTabs } from "@cplieger/ui/tabs";
import { toast } from "@cplieger/ui/toast";
import { enhanceTokens } from "@cplieger/ui/tokens";

const icons = createIcons<string>({ base: new URL("icons/svg/", location.href).href });

// Tabs as links under a router: a press moves aria-current in place, as an
// app's router does, instead of following the link.
for (const nav of document.querySelectorAll<HTMLElement>("nav.cp-tabs[data-tabs-router]")) {
  const tabs = enhanceTabs(nav);
  nav.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a") : null;
    if (link !== null && link.parentElement === nav) {
      e.preventDefault();
      tabs.select(link);
    }
  });
}

for (const details of document.querySelectorAll<HTMLDetailsElement>(
  "[data-disclosures] details, .cp-list-row > details",
)) {
  enhanceDisclosure(details);
}

const fileWords = (n: number): string =>
  n === 0 ? "Choose what to delete" : `Delete ${String(n)} ${n === 1 ? "file" : "files"}`;

const revoke = async (): Promise<string | null> =>
  (await ask("Apps using it stop working at once. This cannot be undone.", {
    title: "Revoke the key?",
    tone: "danger",
    icon: icons.icon("triangle-alert"),
    details: [
      { label: "Key", value: "ci-deploy" },
      { label: "Last used", value: "2 days ago" },
    ],
    confirmLabel: "Revoke",
    cancelLabel: "Keep it",
  }))
    ? "Key revoked"
    : null;

const applyUnchecked = async (): Promise<string | null> =>
  (await ask("Nothing confirmed that +0.400 s matches the audio.", {
    title: "Apply an unchecked change?",
    focus: "decline",
    icon: icons.icon("triangle-alert"),
    confirmLabel: "Apply",
    cancelLabel: "Keep the current timing",
  }))
    ? "Applied +0.400 s"
    : null;

const rename = async (): Promise<string | null> => {
  const name = await ask("Rename the passkey", {
    input: { initialValue: "Laptop", maxLength: 64 },
    confirmLabel: "Rename",
  });
  return name === null ? null : `Renamed to ${name}`;
};

const deleteGroups = async (): Promise<string | null> => {
  const groups = await ask("Choose which to delete. The files are removed from the disk.", {
    title: "Delete subtitles for 4 episodes?",
    tone: "danger",
    icon: icons.icon("triangle-alert"),
    choices: [
      { value: "managed", label: "3 managed files", note: "Fetched by this app", count: 3 },
      { value: "found", label: "1 found on disk", note: "Not fetched by this app", count: 1 },
    ],
    confirmLabel: fileWords,
    cancelLabel: "Keep them",
  });
  return groups === null ? null : "Deleted";
};

// Each button marked data-ask puts its question, and says the answer.
const questions = new Map<string, () => Promise<string | null>>([
  ["danger", revoke],
  ["unchecked", applyUnchecked],
  ["value", rename],
  ["grouped", deleteGroups],
]);
for (const b of document.querySelectorAll<HTMLButtonElement>("button[data-ask]")) {
  const question = questions.get(b.dataset["ask"] ?? "");
  if (question === undefined) {
    continue;
  }
  b.addEventListener("click", () => {
    void question().then((said) => {
      if (said !== null) {
        toast({ kind: "success", title: said });
      }
    });
  });
}

const changes = (n: number): string =>
  n === 1 ? "1 unsaved change" : `${String(n)} unsaved changes`;

// A form of settings on the guard: the save bar shows its count, Save makes
// the values the start, and a save in another tab loads at once or, with
// changes waiting, through the notice that keeps them.
for (const form of document.querySelectorAll<HTMLFormElement>("form[data-unsaved]")) {
  const tags = form.querySelector<HTMLElement>(".cp-tokens");
  if (tags !== null) {
    enhanceTokens(tags, { name: "tags" });
  }
  const bar = form.querySelector<HTMLElement>(".cp-savebar");
  const count = bar?.querySelector("[data-part='count']");
  const notice = form.querySelector<HTMLElement>(".cp-notice");
  const nav = form.querySelector<HTMLElement>("nav.cp-tabs");
  // Each category is a part of the one form, shown by its link's query.
  const show = (category: string | null): void => {
    for (const part of form.querySelectorAll<HTMLElement>("[data-category]")) {
      part.hidden = part.dataset["category"] !== category;
    }
    const link = nav?.querySelector<HTMLAnchorElement>(`a[href="?category=${category ?? ""}"]`);
    link?.setAttribute("aria-current", "page");
    for (const other of nav?.querySelectorAll("a") ?? []) {
      if (other !== link) {
        other.removeAttribute("aria-current");
      }
    }
  };
  nav?.addEventListener("click", (e) => {
    const link = e.target instanceof Element ? e.target.closest("a") : null;
    if (link !== null) {
      show(new URL(link.href).searchParams.get("category"));
    }
  });
  const paint = (n: number): void => {
    if (bar !== null && bar !== undefined && count !== null && count !== undefined) {
      bar.hidden = n === 0;
      count.textContent = changes(n);
    }
  };
  const guard = guardChanges(form, {
    words: { question: "Leave without saving?" },
    within: (to) => to.pathname === location.pathname && to.searchParams.has("category"),
    onChange: (c) => {
      paint(c.length);
    },
  });
  paint(guard.count);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    guard.saved();
    notice?.setAttribute("hidden", "");
    toast({ kind: "success", title: "Saved" });
  });
  const latest = { name: "Release tracker (home)", every: "60", notify: true, tags: ["anime"] };
  const load = (): void => {
    const kept = guard.rebase(latest);
    if (notice !== null) {
      notice.hidden = true;
    }
    const first = guard.changes()[0];
    const part = first?.closest<HTMLElement>("[data-category]");
    if (part?.hidden === true) {
      show(part.dataset["category"] ?? null);
    }
    const field =
      first?.matches("input, select, textarea") === true ? first : first?.querySelector("input");
    (field as HTMLElement | null | undefined)?.focus();
    toast({
      kind: "success",
      title: "Loaded the latest",
      ...(kept === 0
        ? {}
        : { body: `Your ${changes(kept)} ${kept === 1 ? "is" : "are"} still here.` }),
    });
  };
  notice?.querySelector("[data-rebase]")?.addEventListener("click", load);
  document.querySelector(`[data-elsewhere="${form.id}"]`)?.addEventListener("click", () => {
    if (guard.count === 0) {
      load();
    } else if (notice !== null) {
      notice.hidden = false;
    }
  });
}

// The message dialog asks before Escape or Cancel drops what was written;
// Send closes it without asking.
for (const form of document.querySelectorAll<HTMLFormElement>("form[data-guard-message]")) {
  const dialog = form.closest("dialog");
  guardChanges(form, {
    words: { question: "Discard this message?", discard: "Discard", keep: "Keep writing" },
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (dialog !== null) {
      closeDialog(dialog, "sent");
    }
    toast({ kind: "success", title: "Message sent" });
  });
}
