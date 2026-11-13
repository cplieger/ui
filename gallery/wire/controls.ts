/**
 * controls.ts — the gallery's switchers, disclosures, popups and questions,
 * on the library's modules.
 */

import { enhanceDisclosure } from "@cplieger/ui/disclosure";
import { enhanceTabs } from "@cplieger/ui/tabs";

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
