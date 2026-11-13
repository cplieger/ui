import { clearError, reportErrors, showError } from "@cplieger/ui/form";
import { toast } from "@cplieger/ui/toast";

// The gallery's own behaviour for the cards that do not run on src/ yet, in plain DOM.
const root = document.documentElement;

// What @cplieger/ui/icons' createIcons does: an absolute URL per icon, so
// the custom property resolves the same wherever the stylesheet reads it.
function paintIcon(el) {
  el.style.setProperty("--cp-icon-image", `url("${new URL(`icons/svg/${el.dataset.cpIcon}.svg`, location.href)}")`);
}
for (const el of document.querySelectorAll("[data-cp-icon]")) paintIcon(el);
new MutationObserver((records) => {
  for (const r of records) if (r.target instanceof HTMLElement) paintIcon(r.target);
}).observe(document.body, { subtree: true, attributeFilter: ["data-cp-icon"] });
// A spin that runs on the compositor can come back frozen after the tab was
// hidden, until a repaint (a hover) jumps it to its current angle. Re-seating
// each endless animation's clock on return rebuilds it where it should be.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  for (const a of document.getAnimations()) {
    if (a.playState !== "running" || a.effect?.getComputedTiming().iterations !== Infinity) continue;
    const t = a.currentTime;
    a.currentTime = t;
  }
});
const reduced = () =>
  root.dataset.motion === "reduced" ||
  (root.dataset.motion !== "full" && matchMedia("(prefers-reduced-motion: reduce)").matches);

// Pointer tier: a copy of @cplieger/ui/pointer. A hovering fine pointer
// beside a touchscreen (an iPad on a Magic Keyboard) wins the first guess,
// a press sets its pointer's tier, and a mouse or trackpad that only moves
// sets fine.
const mq = (q) => matchMedia(q).matches;
root.dataset.pointer =
  mq("(any-pointer: fine)") && mq("(any-hover: hover)") ? "fine" : mq("(any-pointer: coarse)") || navigator.maxTouchPoints > 0 ? "coarse" : "fine";
addEventListener(
  "pointerdown",
  (e) => {
    if (e.pointerType) root.dataset.pointer = e.pointerType === "mouse" ? "fine" : "coarse";
  },
  { capture: true, passive: true },
);
addEventListener(
  "pointermove",
  (e) => {
    if (e.pointerType === "mouse" && root.dataset.pointer !== "fine") root.dataset.pointer = "fine";
  },
  { capture: true, passive: true },
);
const coarse = () => root.dataset.pointer === "coarse";

// Press: a copy of @cplieger/ui/press's installPress. One data-cp-pressed
// attribute that a mouse, a finger and a key set the same way. :active cannot
// carry it: iOS Safari applies it only under a touchstart listener, and a
// quick tap holds it for a frame or two.
const PRESSABLE = 'button:not(:disabled), label:has(input:not(:disabled)), [role="option"]:not([aria-disabled="true"])';
// Android shows a touch press after its 100ms tap timeout (ViewConfiguration
// TAP_TIMEOUT), so a scroll that starts on a control cancels before it shows.
const TOUCH_DELAY = 100;
// Blink holds :active this long after a tap (kMinimumActiveInterval).
const MIN_HOLD = 150;
const releases = new WeakMap();
let held = null; // { el, id, x, y, timer, since } while a press is down

function pressOn(h) {
  clearTimeout(releases.get(h.el));
  h.el.dataset.cpPressed = "";
  h.since = performance.now();
}

function pressOff(cancel) {
  const h = held;
  held = null;
  if (!h) return;
  clearTimeout(h.timer);
  if (cancel) {
    if (h.since !== undefined) delete h.el.dataset.cpPressed;
    return;
  }
  if (h.since === undefined) pressOn(h); // a tap quicker than TOUCH_DELAY
  const left = MIN_HOLD - (performance.now() - h.since);
  releases.set(
    h.el,
    setTimeout(() => delete h.el.dataset.cpPressed, Math.max(0, left)),
  );
}

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!e.isPrimary || e.button !== 0) return;
    const el = e.target instanceof Element ? e.target.closest(PRESSABLE) : null;
    if (!el) return;
    pressOff(true);
    const h = { el, id: e.pointerId, x: e.clientX, y: e.clientY };
    held = h;
    if (e.pointerType === "touch") h.timer = setTimeout(() => pressOn(h), TOUCH_DELAY);
    else pressOn(h);
  },
  { passive: true },
);
document.addEventListener("pointerup", (e) => held?.id === e.pointerId && pressOff(false));
document.addEventListener("pointercancel", (e) => held?.id === e.pointerId && pressOff(true));
// A finger that travels is scrolling or dragging, whether or not the browser
// has sent pointercancel yet. Android's touch slop is 8dp.
const SLOP = 8;
document.addEventListener(
  "pointermove",
  (e) => {
    if (held?.id !== e.pointerId || e.pointerType !== "touch") return;
    if (Math.hypot(e.clientX - held.x, e.clientY - held.y) > SLOP) pressOff(true);
  },
  { passive: true },
);
document.addEventListener("pointerout", (e) => {
  if (held?.id === e.pointerId && e.pointerType === "mouse" && !held.el.contains(e.relatedTarget)) pressOff(true);
});
document.addEventListener("keydown", (e) => {
  if (e.repeat || !(e.target instanceof Element)) return;
  const el = e.target.closest(PRESSABLE);
  if (!el) return;
  const enter = e.key === "Enter" && el.matches("button");
  if (e.key !== " " && !enter) return;
  pressOff(true);
  held = { el, id: "key" };
  pressOn(held);
  if (enter) pressOff(false);
});
document.addEventListener("keyup", (e) => e.key === " " && held?.id === "key" && pressOff(false));

// Sparkles: a few stars leave the element's centre, spin and fade.
function sparkle(el, count = 8, opts = {}) {
  if (reduced()) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const pops = ["--pop-1", "--pop-2", "--pop-3", "--pop-4"];
  // A fingertip covers about 1cm around the touch point and the hand sits
  // below it, so on touch the stars start past the finger and fly up and to
  // the sides, over 240 degrees from 150 (lower left) round to 30 (lower right).
  const touch = coarse();
  const from = touch ? (5 * Math.PI) / 6 : 0;
  const arc = touch ? (4 * Math.PI) / 3 : 2 * Math.PI;
  const reach = opts.reach ?? (touch ? 44 : 22);
  const scale = opts.scale ?? 1;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "sparkle";
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty("--sparkle", `var(${pops[i % pops.length]})`);
    document.body.append(s);
    const angle = from + ((i + 0.5 + (Math.random() - 0.5) * 0.6) / count) * arc;
    const dist = reach + Math.random() * reach;
    const size = ((touch ? 0.9 : 0.6) + Math.random() * 0.7) * scale;
    s.animate(
      [
        { transform: "translate(0, 0) scale(0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(${size}) rotate(180deg)`,
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: `translate(${Math.cos(angle) * dist * 1.2}px, ${Math.sin(angle) * dist * 1.2 + 6}px) scale(0) rotate(260deg)`,
          opacity: 0,
        },
      ],
      { duration: (opts.duration ?? 700) + Math.random() * 200, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    ).finished.then(() => s.remove());
  }
}



// Confirm in place: busy for under a second, then done, then back by itself.
// A press while busy or done does nothing, so the button never starts a
// second action it cannot show. Save, Grab and a confirmed delete all run it.
function confirmCycle(b) {
  if (b.dataset.state) return;
  const icon = b.querySelector(".cp-icon");
  const words = b.querySelector(".roll > span, .label");
  const idleIcon = icon.dataset.cpIcon;
  // read at the press: a label such as "Grab 3" changes with the selection
  const idleWords = words.textContent;
  const doneWords = b.querySelector(".roll") ? null : "Saved";
  b.dataset.state = "busy";
  b.setAttribute("aria-busy", "true");
  icon.dataset.cpIcon = "spinner-arc";
  words.textContent = b.dataset.busyWords ?? "Saving…";
  setTimeout(() => {
    b.dataset.state = "done";
    b.removeAttribute("aria-busy");
    icon.dataset.cpIcon = "check";
    if (doneWords) words.textContent = doneWords;
    setTimeout(() => {
      words.textContent = idleWords;
      icon.dataset.cpIcon = idleIcon;
      delete b.dataset.state;
    }, 1600);
  }, 900);
}
for (const b of document.querySelectorAll(".btn-done[data-demo-save]")) {
  b.addEventListener("click", () => confirmCycle(b));
}


// The settings cog has six teeth, so a 60 degree notch lands it looking as
// it started.
for (const b of document.querySelectorAll(".cog-turn")) {
  b.addEventListener("click", () => {
    b.classList.remove("turning");
    void b.offsetWidth;
    b.classList.add("turning");
  });
  b.addEventListener("animationend", () => b.classList.remove("turning"));
}

// Five quick presses on a wordmark flip its mark: a rare surprise.
for (const w of document.querySelectorAll("[data-five-press]")) {
  const mark = w.querySelector(".cp-mark");
  let clicks = [];
  w.addEventListener("click", () => {
    const now = performance.now();
    clicks = clicks.filter((t) => now - t < 1500).concat(now);
    if (clicks.length >= 5) {
      clicks = [];
      mark.classList.remove("flip");
      void mark.offsetWidth;
      mark.classList.add("flip");
      sparkle(mark, 14);
    }
  });
  mark.addEventListener("animationend", () => mark.classList.remove("flip"));
}

// Random loading: each shape picks its next move, sometimes a new colour,
// plays it, rests a random beat and picks again. Every move keeps the twirl's
// square-to-circle turn. The square looks the same at every quarter turn, so
// each move ends at 0deg and starts where its turn requires, and a squash on
// landing always squashes downward. A new colour passes through the hue
// halfway between, round the wheel, so it never greys out on the way.
// The surprise colours as [lightness %, chroma, hue] numbers, read from the
// stylesheet's --pop-1 to --pop-4 at each move, so a change of scheme or of
// the accent's hue reaches the next move. A probe resolves each to oklch.
const probe = document.createElement("span");
probe.hidden = true;
document.body.append(probe);
const palette = () =>
  [1, 2, 3, 4].map((n) => {
    probe.style.color = `var(--pop-${n})`;
    const m = /oklch\(([\d.]+)%? ([\d.]+) ([\d.]+)/.exec(getComputedStyle(probe).color);
    if (!m) return [70, 0.15, 0];
    const l = Number(m[1]);
    return [l <= 1 ? l * 100 : l, Number(m[2]), Number(m[3])];
  });
const colourOf = ([l, c, h]) => `oklch(${l}% ${c} ${((h % 360) + 360) % 360})`;
const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 0.01);
const midway = (x, y) => {
  const d = ((((y[2] - x[2]) % 360) + 540) % 360) - 180;
  return [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, x[2] + d / 2];
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (lo, hi) => lo + Math.random() * (hi - lo);
const SPRING = "cubic-bezier(0.6, 0, 0.3, 1.2)";
const turn = (from) => ({
  frames: [{ rotate: `${from}deg`, borderRadius: "30%" }, { borderRadius: "50%", offset: 0.5 }, { rotate: "0deg", borderRadius: "30%" }],
  ms: Math.abs(from) >= 180 ? 760 : 540,
  easing: SPRING,
});
// A hop rises `share` of the shape's size; a squash to 80% height lifts the base by a tenth of
// the shape, so the squash frame moves it down as much to keep it grounded.
const hop = (from, share, size) => ({
  frames: [
    { rotate: `${from}deg`, translate: "0 0", scale: "1", borderRadius: "30%", easing: "cubic-bezier(0.2, 0.6, 0.4, 1)" },
    { rotate: `${from / 2}deg`, translate: `0 -${share * size}px`, scale: "0.94 1.06", borderRadius: "50%", offset: 0.42, easing: "cubic-bezier(0.6, 0, 0.8, 0.4)" },
    { rotate: "0deg", translate: `0 ${size / 10}px`, scale: "1.2 0.8", borderRadius: "30%", offset: 0.74, easing: "cubic-bezier(0.3, 0, 0.3, 1.4)" },
    { rotate: "0deg", translate: "0 0", scale: "1", borderRadius: "30%" },
  ],
  ms: 640 + share * 300,
  // each segment above carries its own curve: up slowing, down speeding, and
  // a spring out of the squash
  easing: "linear",
});
// hop: the range of a hop's height as a share of the shape's size
const movesFor = (size, [lo, hi]) => [
  () => turn(-90),
  () => turn(90),
  () => turn(-180),
  () => ({
    frames: [{ rotate: "-360deg", borderRadius: "30%" }, { borderRadius: "50%", offset: 0.2 }, { borderRadius: "50%", offset: 0.8 }, { rotate: "0deg", borderRadius: "30%" }],
    ms: 1000,
    easing: "cubic-bezier(0.55, 0, 0.3, 1.1)",
  }),
  () => hop(0, between(lo, hi), size),
  () => hop(0, between(lo, hi), size),
  () => hop(-90, between(lo + 0.1, hi + 0.1), size),
  () => ({
    frames: [{ scale: "1", borderRadius: "30%" }, { scale: "1.28", borderRadius: "50%", offset: 0.4 }, { scale: "0.94", borderRadius: "36%", offset: 0.75 }, { scale: "1", borderRadius: "30%" }],
    ms: 620,
    easing: "ease-in-out",
  }),
];
// Every move plays at 1.15 times its listed length, and a shape rests 0.22
// to 1s between moves.
const PACE = 1.15;
// Bumped when the surprise colours change, so each loader takes its own
// colour from the new set at its next move.
let paletteVersion = 0;
function twirlAtRandom(shape, slot, hopRange, rest = [220, 1000]) {
  let colour = palette()[slot];
  let seen = paletteVersion;
  shape.style.backgroundColor = colourOf(colour);
  const step = () => {
    // a hidden loader has no size to hop by and nobody watching it
    const size = shape.offsetHeight;
    if (reduced() || size === 0) {
      setTimeout(step, 600);
      return;
    }
    const move = pick(movesFor(size, hopRange))();
    const set = palette();
    const others = set.filter((h) => !same(h, colour));
    let next = Math.random() < 0.4 && others.length > 0 ? pick(others) : colour;
    if (seen !== paletteVersion) {
      seen = paletteVersion;
      next = set[slot];
    }
    const frames = move.frames.map((f) => ({ ...f }));
    frames[0].backgroundColor = colourOf(colour);
    frames.at(-1).backgroundColor = colourOf(next);
    // Every move has a middle frame with an offset; the midway colour sits
    // just before it at the same offset, which keeps the offsets in order.
    if (!same(next, colour)) frames.splice(1, 0, { backgroundColor: colourOf(midway(colour, next)), offset: frames[1].offset });
    shape.animate(frames, { duration: move.ms * PACE * between(0.9, 1.15), easing: move.easing }).finished.then(() => {
      colour = next;
      shape.style.backgroundColor = colourOf(colour);
      setTimeout(step, between(...rest));
    });
  };
  setTimeout(step, between(0, 700));
}
// The trio hops up to about three quarters of its size; the single loader,
// which sits beside words, hops lower.
for (const trio of document.querySelectorAll(".boot-random")) {
  trio.classList.add("is-random");
  [...trio.children].forEach((shape, n) => twirlAtRandom(shape, n, [0.45, 0.72]));
}
for (const one of document.querySelectorAll(".load-twirl")) {
  one.classList.add("is-random");
  // Alone, it rests a third as long, so it moves as often as the trio does.
  twirlAtRandom(one.firstElementChild, Math.floor(Math.random() * 4), [0.3, 0.5], [70, 330]);
}

// Full-screen previews: the button opens its frame over the window, and
// Escape or a click closes it. Reopening replays the status line's delay.
for (const b of document.querySelectorAll("[data-full]")) {
  const screen = b.parentElement.querySelector(".screen");
  const close = () => {
    screen.classList.remove("is-full");
    b.focus();
  };
  b.addEventListener("click", () => {
    screen.classList.add("is-full");
    const status = screen.querySelector(".boot-status");
    status.replaceWith(status.cloneNode(true));
    screen.focus();
  });
  screen.addEventListener("click", () => screen.classList.contains("is-full") && close());
  screen.addEventListener("keydown", (e) => e.key === "Escape" && close());
}

// Page controls
const controls = document.querySelector(".controls");
const control = (name) => controls.querySelector(`[name="${name}"]`);
controls.addEventListener("input", () => {
  root.dataset.theme = control("theme").value;
  root.dataset.motion = control("motion").checked ? "reduced" : "full";
  root.style.setProperty("--cp-accent-h", control("hue").value);
  root.style.setProperty("--cp-neutral-h", control("hue").value);
  // last, so the loaders read the colours this change produced
  paletteVersion++;
});
root.dataset.motion = "full";

// Gallery behaviour: what the platform lacks, one small enhancer each, with
// no dependency. The code above runs first and provides paintIcon,
// sparkle, reduced and coarse.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
};
const icon = (name, extra = "") => {
  const s = el("span", { class: `cp-icon ${extra}`.trim(), "data-cp-icon": name, "aria-hidden": "true" });
  paintIcon(s);
  return s;
};
// Icons added after load get their drawing too.
new MutationObserver((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (!(n instanceof Element)) continue;
      if (n.matches("[data-cp-icon]")) paintIcon(n);
      for (const c of n.querySelectorAll("[data-cp-icon]")) paintIcon(c);
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// A polite announcement that is not a toast, through announce(), so it is
// heard from inside an open modal dialog too.
const say = (text) => announce(text);

// ---------------------------------------------------------- anchors
// Each popover anchors to the button that opens it, by a name unique to the
// pair, so CSS anchor positioning places and flips it.
// A popover shared by several buttons (one menu for every row) takes the
// anchor of the one pressed; a button inside its own popover anchors nothing.
// A .cp-popover is the library's, placed by installAnchors().
$$("[popovertarget]").forEach((b, i) => {
  const pop = document.getElementById(b.getAttribute("popovertarget"));
  if (!pop || pop.contains(b) || pop.matches(".cp-popover")) return;
  const name = `--g-anchor-${i}`;
  b.style.setProperty("anchor-name", name);
  if (!pop.style.getPropertyValue("position-anchor")) pop.style.setProperty("position-anchor", name);
  b.addEventListener("click", () => pop.style.setProperty("position-anchor", name));
});

// -------------------------------------------------------------- menus
// role="menu" popovers: focus moves in on open, arrows and Home and End move
// it, a letter jumps to the next item starting with it, Enter or Space runs
// an item, and the menu closes and gives focus back. Escape and a click
// outside are the platform's.
const items = (menu) => $$("[role^='menuitem']:not([aria-disabled='true'])", menu);
function menuKeys(menu) {
  menu.addEventListener("toggle", (e) => {
    if (e.newState === "open") items(menu)[0]?.focus();
  });
  menu.addEventListener("keydown", (e) => {
    const list = items(menu);
    const at = list.indexOf(document.activeElement);
    const go = (i) => list[(i + list.length) % list.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(list.length - 1);
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const next = [...list.slice(at + 1), ...list.slice(0, at + 1)].find((n) => n.textContent.trim().toLowerCase().startsWith(k));
      next?.focus();
    } else return;
    e.preventDefault();
  });
  menu.addEventListener("click", (e) => {
    const item = e.target.closest("[role^='menuitem']");
    if (!item || item.getAttribute("aria-disabled") === "true") return;
    if (item.getAttribute("role") === "menuitemradio") {
      for (const r of $$(`[role="menuitemradio"][data-group="${item.dataset.group}"]`, menu)) r.setAttribute("aria-checked", String(r === item));
    }
    menu.hidePopover();
    if (item.dataset.say) toast({ kind: item.dataset.tone === "danger" ? "warning" : "info", title: item.dataset.say });
  });
}
$$("[role='menu'][popover]:not(.cp-menu)").forEach(menuKeys);

// ------------------------------------------------------------ dialogs
// Buttons open and close dialogs through commandfor; this fills in only for
// an engine without invoker commands.
if (!("command" in HTMLButtonElement.prototype)) {
  for (const b of $$("[commandfor]")) {
    b.addEventListener("click", () => {
      const d = document.getElementById(b.getAttribute("commandfor"));
      const c = b.getAttribute("command");
      if (c === "show-modal") d.showModal();
      else if (c === "close") d.close();
    });
  }
}
// A press outside a dialog closes it, as closedby="any" does in the engines
// that ship it (Safari does not yet). It must start and end outside, so a
// drag out of a field closes nothing.
for (const d of $$("dialog.g-dialog")) {
  const outside = (e) => {
    const r = d.getBoundingClientRect();
    return e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
  };
  let startedOutside = false;
  d.addEventListener("pointerdown", (e) => (startedOutside = outside(e)));
  d.addEventListener("click", (e) => {
    if (!startedOutside || !outside(e)) return;
    startedOutside = false;
    d.close("cancel");
  });
}

for (const d of $$("dialog.g-dialog[data-says]")) {
  d.addEventListener("close", () => d.returnValue && d.returnValue !== "cancel" && toast({ kind: d.returnValue === "delete" ? "success" : "info", title: d.dataset.says }));
}



// ---------------------------------------------------------------- theme
// The page's look follows the chosen theme, and the change reveals the new
// look in a circle growing from the control that asked for it.
const system = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(choice, from) {
  const next = choice === "system" ? (system.matches ? "dark" : "light") : choice;
  const set = () => {
    root.dataset.theme = next;
    const sel = $(".controls [name='theme']");
    if (sel) sel.value = next;
  };
  if (root.dataset.theme === next) return set();
  if (!document.startViewTransition || reduced()) return set();
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : 0;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(set).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 480, easing: "cubic-bezier(0.2, 0, 0, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}
for (const r of $$("input[name='g-theme']")) {
  r.addEventListener("change", () => applyTheme(r.value, r.closest("label")));
}
for (const s of $$("input[name='g-accent']")) {
  s.addEventListener("change", () => {
    root.style.setProperty("--cp-accent-h", s.value);
    const hue = $(".controls [name='hue']");
    if (hue) hue.value = s.value;
    paletteVersion++;
  });
}

// ------------------------------------------------------- settings form
// A change shows the save bar with its count; Save confirms on the button,
// Discard puts every field back.
for (const form of $$("form[data-settings]")) {
  const bar = $(".cp-savebar", form);
  // The theme and accent apply at once, so they are never unsaved.
  const fields = $$("input, select, textarea", form).filter((f) => f.name && !f.name.startsWith("g-") && !f.closest(".cp-savebar"));
  const value = (f) => (f.type === "checkbox" || f.type === "radio" ? f.checked : f.value);
  let saved = new Map(fields.map((f) => [f, value(f)]));
  const count = () => fields.filter((f) => saved.get(f) !== value(f)).length;
  const update = () => {
    const n = count();
    bar.hidden = n === 0;
    $(".g-dirty", bar).textContent = `${n} unsaved change${n === 1 ? "" : "s"}`;
  };
  form.addEventListener("input", update);
  form.addEventListener("change", update);
  $("[data-discard]", form).addEventListener("click", () => {
    for (const f of fields) {
      if (f.type === "checkbox" || f.type === "radio") f.checked = saved.get(f);
      else f.value = saved.get(f);
    }
    update();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = $("[type='submit']", form);
    btn.dataset.state = "busy";
    btn.querySelector(".cp-icon").dataset.cpIcon = "spinner-arc";
    setTimeout(() => {
      btn.dataset.state = "done";
      btn.querySelector(".cp-icon").dataset.cpIcon = "check";
      saved = new Map(fields.map((f) => [f, value(f)]));
      setTimeout(() => {
        delete btn.dataset.state;
        btn.querySelector(".cp-icon").dataset.cpIcon = "download";
        update();
      }, 1200);
    }, 700);
  });
  update();
}

// --------------------------------------------------------------- sign-in
// An empty password is the field's error; a refused one is a notice over
// the form that names neither half, with a shake; any other signs in, the
// button confirming.
for (const form of $$("form[data-sign-in]")) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const btn = $("[type='submit']", form);
    if (btn.getAttribute("aria-disabled") === "true") return;
    const pw = $("input[type='password'], input[name='password']", form);
    const err = document.getElementById(pw.getAttribute("aria-describedby").split(" ").find((id) => id.endsWith("-error")));
    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("aria-disabled", "true");
    $(".label", btn).textContent = "Signing in…";
    setTimeout(() => {
      btn.removeAttribute("aria-busy");
      btn.removeAttribute("aria-disabled");
      const refused = $("#si-refused", form);
      $(".label", btn).textContent = "Sign in";
      if (pw.value === "") {
        // A missing field is the field's own error.
        refused.hidden = true;
        pw.setAttribute("aria-invalid", "true");
        err.hidden = false;
        pw.focus();
      } else if (pw.value === "wrong") {
        // A refusal never says which half was wrong (design-account.md): a
        // notice over the form, and the password selected to type again.
        pw.removeAttribute("aria-invalid");
        err.hidden = true;
        refused.hidden = false;
        const panel = form.closest(".cp-panel");
        panel.classList.remove("g-refused");
        void panel.offsetWidth;
        panel.classList.add("g-refused");
        pw.focus();
        pw.select();
      } else {
        refused.hidden = true;
        pw.removeAttribute("aria-invalid");
        err.hidden = true;
        btn.dataset.state = "done";
        $(".label", btn).textContent = "Signed in";
        btn.querySelector(".cp-icon").dataset.cpIcon = "check";
      }
    }, 900);
  });
}

// -------------------------------------------------------------- stepper
// First-run setup, its steps on one page where an app gives each its own
// address. The host says which step is current (data-current); the page's
// h1 names it, "Step 2 of 3: Connect Sonarr"; a done step is a link back to
// it; the current one is ringed and named current. main.ts wires Test
// connection.
for (const flow of $$("[data-steps]")) {
  const steps = $$("[data-step]", flow);
  const marks = $$(".cp-steps > li", flow);
  const title = $("[data-step-title]", flow);
  const compact = $(".cp-steps-compact", flow);
  // Focus follows a change of step, so a screen reader lands on the new
  // one; the first step on load takes none.
  const show = (i, moved = true) => {
    flow.dataset.current = String(i);
    steps.forEach((s, k) => (s.hidden = k !== i));
    marks.forEach((m, k) => {
      const name = m.dataset.name;
      m.dataset.state = k < i ? "done" : k === i ? "current" : "todo";
      if (k < i) m.replaceChildren(el("a", { href: "#setup", "data-go": String(k), text: name }), el("span", { class: "cp-visually-hidden", text: ", done" }));
      else m.replaceChildren(name, ...(k === i ? [el("span", { class: "cp-visually-hidden", text: " (current step)" })] : []));
      if (k === i) m.setAttribute("aria-current", "step");
      else m.removeAttribute("aria-current");
    });
    title.textContent = `Step ${i + 1} of ${steps.length}: ${steps[i].dataset.title}`;
    compact.textContent = `Step ${i + 1} of ${steps.length}`;
    if (moved) title.focus();
  };
  flow.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) {
      e.preventDefault();
      return show(Number(go.dataset.go));
    }
    const at = Number(flow.dataset.current);
    if (e.target.closest("[data-next]")) {
      if (at === steps.length - 1) {
        sparkle(e.target.closest("button"), 8);
        $(".label", e.target.closest("button")).textContent = "All set";
        return;
      }
      show(at + 1);
    }
    if (e.target.closest("[data-back]")) show(Math.max(0, at - 1));
  });
  show(Number(flow.dataset.current ?? 0), false);
}

// --------------------------------------------------------------- search
// Results narrow as you type, after a short pause that shows the loader;
// the matched words are marked; facets and tokens narrow further.
const results = $("#results");
if (results) {
  const all = $$(".g-result", results);
  const box = $("[data-tokens='search']");
  const input = $("input", box);
  const glass = $(".cp-icon", box);
  const loader = el("span", { class: "loader load-twirl", "aria-hidden": "true" }, el("span"));
  const busy = {
    set hidden(h) {
      if (h) loader.replaceWith(glass);
      else if (glass.isConnected) glass.replaceWith(loader);
    },
  };
  const none = $("#no-results");
  const meta = $("#result-count");
  const facets = $$("[data-facet]");
  const plain = new Map(all.map((r) => [r, [...r.childNodes].map((n) => n.cloneNode(true))]));
  let timer = 0;
  const words = () => [...$$(".cp-token", box).map((t) => t.dataset.value), input.value].map((w) => w.trim().toLowerCase()).filter(Boolean);
  const run = () => {
    const ws = words();
    const on = facets.filter((f) => f.getAttribute("aria-pressed") === "true").map((f) => f.dataset.facet);
    let shown = 0;
    all.forEach((r) => {
      r.replaceChildren(...plain.get(r).map((n) => n.cloneNode(true)));
      const text = r.textContent.toLowerCase();
      const hit = ws.every((w) => text.includes(w)) && (on.length === 0 || on.includes(r.dataset.kind));
      r.hidden = !hit;
      if (hit) {
        r.style.setProperty("--i", String(shown++));
        if (ws.length) markWords(r, ws);
      }
    });
    busy.hidden = true;
    results.removeAttribute("aria-busy");
    none.hidden = shown > 0;
    meta.textContent = `${shown} result${shown === 1 ? "" : "s"}`;
  };
  const later = () => {
    clearTimeout(timer);
    busy.hidden = false;
    results.setAttribute("aria-busy", "true");
    timer = setTimeout(run, 350);
  };
  input.addEventListener("input", later);
  box.addEventListener("tokens", later);
  for (const f of facets) f.addEventListener("click", () => setTimeout(later));
  $("#clear-search")?.addEventListener("click", () => {
    for (const t of $$(".cp-token", box)) t.remove();
    input.value = "";
    for (const f of facets) f.setAttribute("aria-pressed", "false");
    later();
  });
  run();
}
function markWords(node, words) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  for (const t of texts) {
    if (!re.test(t.data)) continue;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const m of t.data.matchAll(re)) {
      frag.append(t.data.slice(last, m.index), el("mark", { text: m[0] }));
      last = m.index + m[0].length;
    }
    frag.append(t.data.slice(last));
    t.replaceWith(frag);
  }
}

// ---------------------------------------------------------- foundations
for (const host of $$("[data-ladder]")) {
  for (const fam of host.dataset.ladder.split(" ")) {
    const row = el("div", { class: "g-ladder" }, el("span", { text: fam }));
    for (let i = 1; i <= 12; i++) {
      const s = el("span", { text: String(i) });
      s.style.background = `var(--cp-${fam}-${i})`;
      s.style.color = i >= 9 ? `var(--cp-${fam}-on)` : i >= 6 ? `var(--cp-${fam}-12)` : `var(--cp-${fam}-11)`;
      row.append(s);
    }
    const on = el("span", { text: "Aa" });
    on.style.background = `var(--cp-${fam}-9)`;
    on.style.color = `var(--cp-${fam}-on)`;
    on.style.fontWeight = "600";
    row.append(on);
    host.append(row);
  }
}

// ------------------------------------------------------- form validation
// The gallery's own checks for Add a source; the library shows what they
// find, and typed values stay.
for (const form of $$("form.cp-form:not([data-sign-in])")) {
  const summary = $("#f-summary", form);
  if (!summary) continue;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors = $$("[required]", form)
      .filter((f) => !f.value.trim() || (f.type === "url" && !/^https?:\/\/\S+/.test(f.value)))
      .map((field) => ({ field, message: field.type === "url" ? "Enter the address, starting with http:// or https://." : "Paste the key from Sonarr." }));
    reportErrors(form, errors, { summary, heading: (n) => `${n} fields need a fix before this saves` });
    if (errors.length === 0) toast({ kind: "success", title: "Source added" });
  });
}

// ------------------------------------------------------- settings nav
// The category in view is the current one; a press scrolls to it.
const snav = $(".cp-settings-nav");
if (snav) {
  const links = $$("a", snav);
  const mark = (id) => links.forEach((a) => (a.getAttribute("href") === `#${id}` ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const seen = new IntersectionObserver((entries) => {
    const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (top) mark(top.target.id);
  }, { rootMargin: "-20% 0px -60% 0px" });
  for (const a of links) {
    const sec = document.getElementById(a.getAttribute("href").slice(1));
    if (sec) seen.observe(sec);
  }
}

// ===================================================== pieces for app screens

// ------------------------------------------------------- the announcer
// One polite and one assertive region at the root, and a pair inside each
// modal dialog, made before it opens: showModal() makes everything outside
// the dialog inert, including the root's regions. announce() writes to the
// topmost open modal's pair, else the root's.
function regionsIn(host) {
  let pair = host.querySelector(":scope > .g-announce");
  if (!pair) {
    pair = el("div", { class: "g-announce g-sr" }, el("div", { "aria-live": "polite" }), el("div", { "aria-live": "assertive" }));
    host.append(pair);
  }
  return pair;
}
for (const d of $$("dialog")) regionsIn(d);
regionsIn(document.body);
function announce(text, assertive = false) {
  const open = $$("dialog[open]").filter((d) => d.matches(":modal")).at(-1);
  const pair = regionsIn(open ?? document.body);
  const region = pair.children[assertive ? 1 : 0];
  region.textContent = "";
  requestAnimationFrame(() => (region.textContent = text));
  return open ? open.id : "page";
}
$$("[data-announce]").forEach((b) => b.addEventListener("click", () => {
  const where = announce(b.dataset.announce, b.hasAttribute("data-assertive"));
  const log = document.getElementById(b.dataset.log);
  if (log) log.append(el("li", {}, el("q", { text: b.dataset.announce }), where === "page" ? ", from the page's live region" : ", from the dialog's own live region, while the page is inert"));
}));

// ------------------------------------------------------ master and detail
// The route opens the panel, so Back closes it. Wide: docked beside the
// list, its heading focused. Narrow: the same content in a modal dialog.
// Escape or Close goes back, and focus returns to the row's link.
for (const md of $$("[data-md]")) {
  const dock = $(".g-dock", md);
  const dialog = document.getElementById(md.dataset.md);
  const content = $(".g-dock-content", dock);
  const wide = matchMedia("(width >= 64rem)");
  let opener = null;
  const render = () => {
    const m = /^#md\/(.+)$/.exec(location.hash);
    if (!m) {
      dock.hidden = true;
      if (dialog.open) dialog.close();
      opener?.focus();
      return;
    }
    const link = $(`a[href="#md/${m[1]}"]`, md);
    opener = link;
    for (const a of $$("a[href^='#md/']", md)) a.toggleAttribute("aria-current", a === link);
    $$(".g-md-title").forEach((h) => (h.textContent = link.dataset.title));
    $$(".g-md-meta").forEach((p) => (p.textContent = link.dataset.meta));
    if (wide.matches) {
      if (dialog.open) dialog.close();
      dock.append(content);
      dock.hidden = false;
      $("h3", dock).focus();
    } else {
      dock.hidden = true;
      $(".g-body", dialog).append(content);
      if (!dialog.open) dialog.showModal();
    }
  };
  addEventListener("hashchange", render);
  wide.addEventListener("change", render);
  for (const b of $$("[data-md-close]")) b.addEventListener("click", () => history.back());
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    history.back();
  });
  render();
}

// ------------------------------------------------------------ pair rows
// A path must start with /, said once the field is left. main.ts runs the
// rows.
for (const ed of $$("[data-pairs]")) {
  ed.addEventListener("focusout", (e) => {
    const f = e.target;
    if (!f.matches("input")) return;
    if (f.value.trim() !== "" && !f.value.startsWith("/")) {
      showError(f, "Start with /");
    } else {
      clearError(f);
    }
  });
}

// ---------------------------------------------------------- upload dialog
for (const d of $$("[data-upload]")) {
  d.addEventListener("close", () => {
    if (d.returnValue !== "upload") return;
    const row = document.getElementById(d.dataset.upload);
    row.hidden = false;
    $(".g-up-state", row).replaceChildren(el("span", { class: "loader load-twirl g-toast-load", "aria-hidden": "true" }, el("span")), " Uploading…");
    setTimeout(() => {
      $(".g-up-state", row).replaceChildren(icon("circle-check"), " Uploaded");
      announce("Subtitle file uploaded");
    }, 1500);
  });
}

// A refresh that waits turns its own icon: Motion's one turn, repeated
// while busy. When the work ends, the turn in progress finishes, so
// the icon always comes to rest upright. Reduced motion pulses it instead.
const TURN = { duration: 900, easing: "cubic-bezier(0.55, 0, 0.3, 1)" };
function turnWhileBusy(ic) {
  const a = reduced()
    ? ic.animate([{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }], { duration: 2000, iterations: Infinity })
    : ic.animate([{ rotate: "0turn" }, { rotate: "1turn" }], { ...TURN, iterations: Infinity });
  const length = Number(a.effect.getTiming().duration);
  return () => a.effect.updateTiming({ iterations: Math.max(1, Math.ceil(Number(a.currentTime ?? 0) / length)) });
}

// ------------------------------------------------------ stale content
for (const b of $$("[data-refresh]")) {
  const region = document.getElementById(b.dataset.refresh);
  const ic = $(".cp-icon", b);
  b.addEventListener("click", () => {
    if (b.getAttribute("aria-busy") === "true") return;
    $(".cp-notice", region)?.remove();
    region.setAttribute("aria-busy", "true");
    b.setAttribute("aria-busy", "true");
    const settle = ic ? turnWhileBusy(ic) : () => {};
    setTimeout(() => {
      region.removeAttribute("aria-busy");
      b.removeAttribute("aria-busy");
      settle();
      if (b.hasAttribute("data-fail")) {
        const retry = el("button", { class: "cp-button", "data-size": "sm", type: "button", text: "Retry" });
        retry.addEventListener("click", () => $(`[data-refresh="${region.id}"]:not([data-fail])`)?.click());
        region.prepend(el("div", { class: "cp-notice", "data-tone": "danger", role: "status" }, icon("circle-x"), el("span", { text: "The refresh failed: Sonarr did not answer. What you see is from 14:02." }), retry));
      }
    }, 1500);
  });
}

// ------------------------------------------------------------- video
// Our controls over the native element: play and pause, a seek bar with
// the times, and one caption track the timing preview re-renders.
for (const p of $$(".g-player")) {
  const v = $("video", p);
  const seek = $(".g-seek", p);
  const play = $("[data-play]", p);
  const time = $(".g-time-label", p);
  const offset = document.getElementById(p.dataset.offset);
  const t = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  let base = null;
  const track = v.textTracks[0];
  v.addEventListener("loadedmetadata", () => {
    seek.max = String(v.duration);
    time.textContent = `${t(0)} / ${t(v.duration)}`;
    track.mode = "showing";
  });
  v.addEventListener("timeupdate", () => {
    seek.value = String(v.currentTime);
    seek.dispatchEvent(new Event("input"));
    time.textContent = `${t(v.currentTime)} / ${t(v.duration || 0)}`;
  });
  seek.addEventListener("change", () => (v.currentTime = Number(seek.value)));
  play.addEventListener("click", () => (v.paused ? v.play() : v.pause()));
  v.addEventListener("play", () => {
    play.querySelector(".cp-icon").dataset.cpIcon = "pause";
    play.setAttribute("aria-label", "Pause");
  });
  v.addEventListener("pause", () => {
    play.querySelector(".cp-icon").dataset.cpIcon = "play";
    play.setAttribute("aria-label", "Play");
  });
  // The timing preview: every cue moves by the offset, and the caption on
  // screen redraws at once.
  offset?.addEventListener("change", (e) => {
    const by = Number(e.target.value.replace("\u2212", "-")) || 0;
    const cues = [...(track.cues ?? [])];
    base ??= cues.map((c) => [c.startTime, c.endTime]);
    cues.forEach((c, i) => {
      c.startTime = Math.max(0, base[i][0] + by);
      c.endTime = Math.max(0.1, base[i][1] + by);
    });
    track.mode = "hidden";
    track.mode = "showing";
  });
}

// ------------------------------------------------------------- proposal
for (const card of $$(".g-proposal")) {
  const apply = () => {
    card.dataset.state = "applied";
    $("p", card).textContent = card.dataset.applied;
    $(".g-row-inline", card).replaceChildren(el("button", { class: "cp-button", "data-size": "sm", type: "button", text: "Undo", onclick: () => location.reload() }));
    announce(card.dataset.applied);
  };
  $("[data-apply]", card)?.addEventListener("click", () => {
    if (card.hasAttribute("data-unverified")) document.getElementById(card.dataset.confirm).showModal();
    else apply();
  });
  $("[data-discard-proposal]", card)?.addEventListener("click", () => {
    card.remove();
    announce("Proposal discarded");
  });
  const confirmD = card.dataset.confirm && document.getElementById(card.dataset.confirm);
  confirmD?.addEventListener("close", () => confirmD.returnValue === "apply" && apply());
}

// --------------------------------------------- settings across sections
// A dot on each category with unsaved changes, in the nav and the select; a
// guard when leaving with unsaved changes; a banner when the settings
// changed elsewhere; and Save's error summary links a field in any section.
for (const form of $$("form[data-settings]")) {
  const links = $$(".cp-settings-nav a");
  const select = $(".g-cat-select select");
  const dirtySections = () => {
    const set = new Set();
    for (const f of $$("input, select, textarea", form)) {
      if (!f.name || f.name.startsWith("g-")) continue;
      const was = f.type === "checkbox" || f.type === "radio" ? f.defaultChecked : f.defaultValue;
      const now = f.type === "checkbox" || f.type === "radio" ? f.checked : f.value;
      if (was !== now) set.add(f.closest("section")?.id);
    }
    return set;
  };
  const mark = () => {
    const d = dirtySections();
    for (const a of links) a.toggleAttribute("data-dirty", d.has(a.getAttribute("href").slice(1)));
    if (select) for (const o of select.options) o.textContent = `${d.has(o.value) ? "• " : ""}${o.dataset.label}`;
  };
  if (select) {
    for (const o of select.options) o.dataset.label = o.textContent;
    select.addEventListener("change", () => document.getElementById(select.value).scrollIntoView({ behavior: reduced() ? "auto" : "smooth" }));
  }
  form.addEventListener("input", mark);
  form.addEventListener("change", mark);
  $("[data-discard]", form).addEventListener("click", () => setTimeout(mark));
  addEventListener("beforeunload", (e) => {
    if (dirtySections().size) e.preventDefault();
  });
  $("[data-elsewhere]")?.addEventListener("click", () => ($("#st-elsewhere").hidden = false));
  $("[data-keep-mine]")?.addEventListener("click", () => {
    $("#st-elsewhere").hidden = true;
    toast({ kind: "success", title: "Loaded the latest", body: "Your 1 unsaved change is still here." });
  });
  form.addEventListener("submit", (e) => {
    const name = $("#st-name", form);
    const summary = $("#st-summary");
    if (name.value.trim() === "") {
      e.stopImmediatePropagation();
      e.preventDefault();
      name.setAttribute("aria-invalid", "true");
      $("#st-name-error").hidden = false;
      summary.hidden = false;
      summary.focus();
    } else {
      name.removeAttribute("aria-invalid");
      $("#st-name-error").hidden = true;
      summary.hidden = true;
      for (const f of $$("input, select, textarea", form)) {
        if (f.type === "checkbox" || f.type === "radio") f.defaultChecked = f.checked;
        else f.defaultValue = f.value;
      }
      setTimeout(mark, 0);
    }
  }, { capture: true });
}

// ======================================== hero icons, layouts and the rest of the scope

// Values that come from data are set through the CSSOM, which a style-src
// without 'unsafe-inline' allows, never as a style attribute.
for (const l of $$("label[data-hue]")) l.style.setProperty("--h", l.dataset.hue);

// A current step's share of its bar, set through the CSSOM.

// A frame drawn at a phone's, a tablet's or a desktop's width, scaled to
// fit its card; its own container queries do what the window's width would.
const WIDTHS = [["Phone", 390], ["Tablet", 820], ["Desktop", 1280]];
for (const [n, host] of $$(".g-shell[data-frame-name]").entries()) {
  const view = $(".g-shell-view", host);
  const frame = $(".g-shell-page", view);
  frame.setAttribute("role", "img");
  const group = el("div", { class: "cp-segmented", role: "radiogroup", "aria-label": `${host.dataset.frameName}: width` });
  let width = innerWidth < 600 ? 390 : 1280;
  const fit = () => {
    frame.style.setProperty("--w", `${width}px`);
    view.style.setProperty("--s", String(Math.min(1, view.clientWidth / width)));
    frame.setAttribute("aria-label", `${host.dataset.frameName}, at ${width}px`);
  };
  for (const [label, w] of WIDTHS) {
    const input = el("input", { type: "radio", name: `frame-${n}`, value: String(w) });
    input.checked = w === width;
    input.addEventListener("change", () => {
      width = w;
      fit();
    });
    group.append(el("label", {}, input, `${label}, ${w}px`));
  }
  host.prepend(group);
  new ResizeObserver(fit).observe(view);
  fit();
}


// ===================================================== motion helpers
// A dialog's exit: Chromium animates it in CSS (overlay and display allow
// discrete); an engine that cannot gets the same fade or slide in script
// before the dialog really closes.
if (!CSS.supports("overlay", "auto")) {
  for (const d of $$("dialog.g-dialog")) {
    const close = HTMLDialogElement.prototype.close;
    const leave = (value) => {
      if (!d.open || d.dataset.leaving !== undefined) return;
      if (reduced()) return close.call(d, value);
      d.dataset.leaving = "";
      const sheet = d.classList.contains("g-sheet");
      const rtl = getComputedStyle(d).direction === "rtl";
      const frames = sheet ? [{ translate: "0 0" }, { translate: rtl ? "-100% 0" : "100% 0" }] : [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.96 }];
      d.animate(frames, { duration: sheet ? 280 : 160, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" }).onfinish = (e) => {
        delete d.dataset.leaving;
        close.call(d, value);
        e.target.cancel();
      };
    };
    d.close = leave;
    d.addEventListener("cancel", (e) => {
      e.preventDefault();
      leave("cancel");
    });
    d.addEventListener("submit", (e) => {
      if (e.target.method !== "dialog") return;
      e.preventDefault();
      leave(e.submitter?.value ?? "");
    });
    d.addEventListener("command", (e) => {
      if (e.command !== "close") return;
      e.preventDefault();
      leave("");
    });
  }
}

// A word that changes, Grab to Grabbed: the label's box glides to the new
// word's width, so the button never sits wider than what it says.
for (const roll of $$(".roll")) {
  const btn = roll.closest("button");
  const [rest, done] = $$(":scope > span", roll);
  const idle = rest.textContent;
  // A row action keeps one footprint across all its words (idle, busy, done):
  // an end margin takes up what the current word leaves and glides with it,
  // so its start edge, its icon and the buttons beside it never move.
  const hold = btn.closest('[data-col="actions"]');
  const measure = (text) => {
    const keep = rest.textContent;
    rest.textContent = text;
    const w = rest.scrollWidth;
    rest.textContent = keep;
    return w;
  };
  const fit = () => {
    const now = btn.classList.contains("grabbed") || btn.dataset.state === "done" ? done : rest;
    const widest = () => Math.max(measure(idle), done.scrollWidth, measure(btn.dataset.busyWords ?? idle));
    const w = now.scrollWidth;
    roll.style.inlineSize = `${w}px`;
    if (hold) btn.style.marginInlineEnd = `${widest() - w}px`;
  };
  new MutationObserver(fit).observe(btn, { attributes: true, attributeFilter: ["class", "data-state"] });
  new ResizeObserver(fit).observe(rest);
  fit();
}

// A number that changes in a field or a button rolls to the new value, up
// when it grows, down when it shrinks, in whole pixels.
function rollTo(host, text, up) {
  // Track the committed value, not host.textContent: mid-roll the host holds a
  // .g-roll whose textContent is both numbers joined ("100110"), which a fast
  // second click would read as the old value and show two numbers at once.
  const prev = host.__rollVal ?? host.textContent;
  if (prev === text) return;
  host.__rollVal = text;
  if (reduced() || !host.isConnected) {
    host.replaceChildren(text);
    return;
  }
  const h = host.getBoundingClientRect().height || 18;
  const win = el("span", { class: "g-roll" }, el("span", { text: prev }), el("span", { text }));
  host.replaceChildren(win);
  const [a, b] = win.children;
  const d = Math.round(h);
  const ease = "cubic-bezier(0.2, 0, 0, 1)";
  a.animate([{ translate: "0 0" }, { translate: `0 ${up ? -d : d}px` }], { duration: 260, easing: ease, fill: "forwards" });
  b.animate([{ translate: `0 ${up ? d : -d}px` }, { translate: "0 0" }], { duration: 260, easing: ease }).onfinish = () => {
    if (host.__rollVal === text) host.replaceChildren(text);
  };
}
for (const g of $$("[role='group'][aria-label='Zoom']")) {
  const [out, label, inn] = $$("button", g);
  let z = 100;
  const step = (d) => {
    const next = Math.min(200, Math.max(50, z + d));
    if (next === z) return;
    rollTo(label, `${next}%`, next > z);
    z = next;
    say(`Zoom ${next}%`);
  };
  out.addEventListener("click", () => step(-10));
  inn.addEventListener("click", () => step(10));
  label.addEventListener("click", () => step(100 - z));
}
