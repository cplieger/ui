import { describe, it, expect } from "vitest";

import * as announce from "@cplieger/ui/announce";
import * as ask from "@cplieger/ui/ask";
import * as dialog from "@cplieger/ui/dialog";
import * as disclosure from "@cplieger/ui/disclosure";
import * as focusTrap from "@cplieger/ui/focus-trap";
import * as modal from "@cplieger/ui/modal";
import * as popover from "@cplieger/ui/popover";
import * as popup from "@cplieger/ui/popup";
import * as rovingFocus from "@cplieger/ui/roving-focus";
import * as skeleton from "@cplieger/ui/skeleton";
import * as theme from "@cplieger/ui/theme";
import * as toast from "@cplieger/ui/toast";
import * as tooltip from "@cplieger/ui/tooltip";
import * as transition from "@cplieger/ui/transition";
import * as viewTransition from "@cplieger/ui/view-transition";

const api = {
  ...announce,
  ...ask,
  ...dialog,
  ...disclosure,
  ...focusTrap,
  ...modal,
  ...popover,
  ...popup,
  ...rovingFocus,
  ...skeleton,
  ...theme,
  ...toast,
  ...tooltip,
  ...transition,
  ...viewTransition,
};

describe("public surface", () => {
  it("exports every primitive", () => {
    expect(typeof api.viewTransition).toBe("function");
    expect(typeof api.runTransition).toBe("function");
    expect(typeof api.cancelTransition).toBe("function");
    expect(typeof api.trapFocus).toBe("function");
    expect(typeof api.announce).toBe("function");
    expect(typeof api.mountLiveRegions).toBe("function");
    expect(typeof api.createTheme).toBe("function");
    expect(typeof api.themeInitSnippet).toBe("function");
    expect(typeof api.themeInitSnippetFromJSON).toBe("function");
    expect(typeof api.createDialog).toBe("function");
    expect(typeof api.openDialog).toBe("function");
    expect(typeof api.closeDialog).toBe("function");
    expect(typeof api.createModal).toBe("function");
    expect(typeof api.createDisclosure).toBe("function");
    expect(typeof api.ask).toBe("function");
    expect(typeof api.initTooltips).toBe("function");
    expect(typeof api.createPopover).toBe("function");
    expect(typeof api.placeAnchored).toBe("function");
    expect(typeof api.pointAnchor).toBe("function");
    expect(typeof api.createToaster).toBe("function");
    expect(typeof api.info).toBe("function");
    expect(typeof api.success).toBe("function");
    expect(typeof api.error).toBe("function");
    expect(typeof api.toast.show).toBe("function");
  });
});
