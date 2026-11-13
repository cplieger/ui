/**
 * controls.ts — the gallery's switchers, disclosures, popups and questions,
 * on the library's modules.
 */

import { ask } from "@cplieger/ui/ask";
import { enhanceDisclosure } from "@cplieger/ui/disclosure";
import { createIcons } from "@cplieger/ui/icons";
import { enhanceTabs } from "@cplieger/ui/tabs";
import { toast } from "@cplieger/ui/toast";

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

for (const details of document.querySelectorAll<HTMLDetailsElement>("[data-disclosures] details")) {
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
