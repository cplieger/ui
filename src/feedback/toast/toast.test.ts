import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { toast } from "./toast.js";

afterEach(() => {
  for (const d of document.querySelectorAll("dialog")) {
    d.close();
  }
  document.body.replaceChildren();
});

const stack = () => document.querySelector(".cp-toaster") as HTMLElement;
const toasts = () => [
  ...document.querySelectorAll<HTMLElement>(".cp-toast-slot:not([data-cp-leaving]) .cp-toast"),
];
const gone = () => new Promise((r) => setTimeout(r, 700));

describe("toast", () => {
  it("shows a toast in the stack, said as it appears, in the top layer", () => {
    toast({ kind: "success", title: "Saved", body: "The next check uses the new interval." });
    expect(stack().matches(":popover-open")).toBe(true);
    const [t] = toasts();
    expect(t?.getAttribute("role")).toBe("status");
    expect(t?.dataset["kind"]).toBe("success");
    expect(t?.querySelector("strong")?.textContent).toBe("Saved");
    expect(t?.querySelector("p")?.textContent).toBe("The next check uses the new interval.");
  });

  it("makes an error an alert that stays, and a passing toast one that drains", () => {
    toast({ kind: "error", title: "Sonarr refused the API key" });
    toast({ kind: "info", title: "The next check starts at 14:30", life: 3000 });
    const [error, info] = toasts();
    expect(error?.getAttribute("role")).toBe("alert");
    expect(error?.querySelector(".cp-toast-time")).toBeNull();
    const line = info?.querySelector<HTMLElement>(".cp-toast-time");
    expect(line?.style.getPropertyValue("--cp-toast-life")).toBe("3000ms");
  });

  it("leaves when its time runs out", async () => {
    toast({ title: "Copied" });
    toasts()[0]?.querySelector(".cp-toast-time")?.dispatchEvent(new AnimationEvent("animationend"));
    await gone();
    expect(toasts()).toHaveLength(0);
  });

  it("dismisses on a press anywhere on it but its own buttons", async () => {
    const undone: string[] = [];
    toast({
      title: "3 entries removed",
      actions: [{ label: "Undo", run: () => undone.push("undo"), keep: true }],
    });
    const t = toasts()[0] as HTMLElement;
    await userEvent.click(t.querySelector(".cp-toast-actions button") as HTMLElement);
    expect(undone).toEqual(["undo"]);
    expect(toasts()).toHaveLength(1);
    await userEvent.click(t.querySelector("strong") as HTMLElement);
    await gone();
    expect(toasts()).toHaveLength(0);
  });

  it("dismisses on its close button", async () => {
    toast({ kind: "error", title: "Radarr is offline" });
    await userEvent.click(toasts()[0]?.querySelector(".cp-toast-close") as HTMLElement);
    await gone();
    expect(toasts()).toHaveLength(0);
  });

  it("keeps a toast with an action until dismissed, and runs and closes on a plain action", async () => {
    let ran = false;
    toast({ title: "3 entries removed", actions: [{ label: "Undo", run: () => (ran = true) }] });
    expect(toasts()[0]?.querySelector(".cp-toast-time")).toBeNull();
    await userEvent.click(toasts()[0]?.querySelector(".cp-toast-actions button") as HTMLElement);
    expect(ran).toBe(true);
    await gone();
    expect(toasts()).toHaveLength(0);
  });

  it("turns a working toast into its outcome, which then drains", () => {
    const t = toast({ title: "Checking 0 of 412 entries…", busy: true });
    const el = toasts()[0] as HTMLElement;
    expect(el.querySelector(".cp-loader")).not.toBeNull();
    expect(el.querySelector(".cp-toast-time")).toBeNull();
    t.update({
      kind: "success",
      title: "Check finished",
      body: "33 entries have a better release.",
    });
    expect(el.dataset["kind"]).toBe("success");
    expect(el.querySelector(".cp-loader")).toBeNull();
    expect(el.querySelector(".cp-toast-time")).not.toBeNull();
    expect(el.querySelector("strong")?.textContent).toBe("Check finished");
  });

  it("counts a working toast in place, its loader and focused button kept", async () => {
    const ran: string[] = [];
    const actions = (n: number) => [
      { label: "Open", keep: true, run: () => ran.push(`open ${String(n)}`) },
      { label: "Cancel" },
    ];
    const t = toast({ title: "Checking 0 of 412 entries…", busy: true, actions: actions(0) });
    const el = toasts()[0] as HTMLElement;
    const loader = el.querySelector(".cp-loader");
    const open = el.querySelector<HTMLButtonElement>(".cp-toast-actions button");
    open?.focus();
    t.update({ title: "Checking 103 of 412 entries…", busy: true, actions: actions(103) });
    expect(el.querySelector("strong")?.textContent).toBe("Checking 103 of 412 entries…");
    expect(el.querySelector(".cp-loader")).toBe(loader);
    expect(el.querySelector(".cp-toast-actions button")).toBe(open);
    expect(document.activeElement).toBe(open);
    await userEvent.click(open as HTMLElement);
    expect(ran).toEqual(["open 103"]);
    t.update({
      kind: "success",
      title: "Check finished",
      body: "33 entries have a better release.",
    });
    expect(el.querySelector(".cp-toast-actions")).toBeNull();
    expect([...el.querySelectorAll(".cp-toast-text > *")].map((n) => n.tagName)).toEqual([
      "STRONG",
      "P",
    ]);
  });

  it("shows four at most, the oldest passing one making room", () => {
    toast({ kind: "error", title: "kept" });
    for (const n of [1, 2, 3, 4]) {
      toast({ title: `passing ${String(n)}` });
    }
    expect(toasts().map((t) => t.querySelector("strong")?.textContent)).toEqual([
      "kept",
      "passing 2",
      "passing 3",
      "passing 4",
    ]);
  });

  it("stays readable and pressable inside a modal dialog that opens, and comes back out as it closes", async () => {
    toast({ title: "first" });
    const d = document.createElement("dialog");
    document.body.append(d);
    d.showModal();
    toast({ title: "second" });
    const box = toasts()[1]?.getBoundingClientRect();
    const top = document.elementFromPoint((box?.left ?? 0) + 4, (box?.top ?? 0) + 4);
    expect(stack().contains(top)).toBe(true);
    expect(stack().parentElement).toBe(d);
    d.close();
    await new Promise((r) => setTimeout(r, 0));
    expect(stack().parentElement).toBe(document.body);
    expect(stack().matches(":popover-open")).toBe(true);
  });
});
