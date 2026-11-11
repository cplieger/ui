import { reportErrors } from "@cplieger/ui/form";

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
const PRESSABLE = "button:not(:disabled), label:has(input:not(:disabled))";
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


// Icon twirls and toggles. The settings cog has six teeth, so a 60 degree
// notch lands it looking as it started.
for (const b of document.querySelectorAll(".cog-turn")) {
  b.addEventListener("click", () => {
    b.classList.remove("turning");
    void b.offsetWidth;
    b.classList.add("turning");
  });
  b.addEventListener("animationend", () => b.classList.remove("turning"));
}

for (const b of document.querySelectorAll(".twirl-click")) {
  b.addEventListener("click", () => {
    b.classList.remove("spun");
    void b.offsetWidth;
    b.classList.add("spun");
  });
}

for (const b of document.querySelectorAll("[data-toggle]")) {
  b.addEventListener("click", () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    const icon = b.querySelector(".cp-icon");
    if (b.dataset.toggle === "pin") {
      icon.dataset.cpIcon = on ? "pin-filled" : "pin";
      b.classList.toggle("unpinned", !on);
    }
    if (b.dataset.toggle === "heart") icon.dataset.cpIcon = on ? "heart-filled" : "heart";
  });
  b.addEventListener("animationend", () => b.classList.remove("unpinned"));
}

// Colour pops: a chip cycles through states and flashes on each change.
const states = [
  ["success", "check", "Up"],
  ["warning", "clock", "Slow"],
  ["danger", "x", "Down"],
];
for (const c of document.querySelectorAll(".chip-pop")) {
  let i = 0;
  c.addEventListener("click", () => {
    i = (i + 1) % states.length;
    const [tone, icon, word] = states[i];
    c.dataset.tone = tone;
    c.querySelector(".cp-icon").dataset.cpIcon = icon;
    c.querySelector(".word").textContent = word;
    c.classList.remove("popped");
    void c.offsetWidth;
    c.classList.add("popped");
  });
}

// A filter row toggles; its wash fades in CSS.
for (const f of document.querySelectorAll(".filter-fade")) {
  f.addEventListener("click", () => f.setAttribute("aria-pressed", String(f.getAttribute("aria-pressed") !== "true")));
}

// Odometer
function setOdometer(el, value) {
  const digits = String(value).padStart(el.children.length, "0");
  [...el.children].forEach((col, i) => {
    col.style.setProperty("--odo-y", `-${Number(digits[i])}em`);
  });
}
for (const o of document.querySelectorAll(".odometer")) {
  for (let i = 0; i < Number(o.dataset.digits); i++) {
    const col = document.createElement("span");
    col.className = "col";
    for (let d = 0; d < 10; d++) {
      const s = document.createElement("span");
      s.textContent = String(d);
      col.append(s);
    }
    o.append(col);
  }
  let v = Number(o.dataset.value);
  setOdometer(o, v);
  document.querySelector(`[data-bump="${o.id}"]`)?.addEventListener("click", () => {
    v += 1 + Math.floor(Math.random() * 37);
    setOdometer(o, v % 10 ** o.children.length);
    o.setAttribute("aria-label", String(v));
  });
}

// Sliding tab pill
for (const list of document.querySelectorAll(".slide-tabs")) {
  const pill = list.querySelector(".pill");
  const place = () => {
    const sel = list.querySelector('[aria-selected="true"]');
    pill.style.setProperty("--x", `${sel.offsetLeft}px`);
    pill.style.setProperty("--w", `${sel.offsetWidth}px`);
  };
  const sizes = new ResizeObserver(place);
  sizes.observe(list);
  for (const tab of list.querySelectorAll(".cp-tab")) {
    sizes.observe(tab);
    tab.addEventListener("click", () => {
      for (const t of list.querySelectorAll(".cp-tab")) t.setAttribute("aria-selected", String(t === tab));
      place();
      tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced() ? "auto" : "smooth" });
    });
  }
  place();
}

// Segmented choices and toggle groups: one pill under the chosen one. It
// lands without motion on load and on a resize, and slides on a choice.
for (const group of document.querySelectorAll(".cp-segmented, .g-toggles")) {
  const pill = document.createElement("span");
  pill.className = "pill";
  pill.setAttribute("aria-hidden", "true");
  pill.dataset.still = "";
  group.prepend(pill);
  const chosen = () =>
    group.classList.contains("g-toggles")
      ? group.querySelector('button[aria-pressed="true"]')
      : group.querySelector("label:has(:checked)");
  const place = (still) => {
    const c = chosen();
    pill.hidden = !c;
    if (!c) return;
    if (still) pill.dataset.still = "";
    pill.style.setProperty("--x", `${c.offsetLeft}px`);
    pill.style.setProperty("--y", `${c.offsetTop}px`);
    pill.style.setProperty("--w", `${c.offsetWidth}px`);
    pill.style.setProperty("--h", `${c.offsetHeight}px`);
    if (still) requestAnimationFrame(() => requestAnimationFrame(() => delete pill.dataset.still));
  };
  new ResizeObserver(() => place(true)).observe(group);
  group.addEventListener("change", () => place(false));
  group.addEventListener("click", () => requestAnimationFrame(() => place(false)));
  place(true);
}

// Progress: small steps a little faster than the fill's 480ms glide, so it
// never comes to rest between them; it turns green once the fill arrives.
for (const b of document.querySelectorAll("[data-run]")) {
  const bar = document.getElementById(b.dataset.run);
  const fill = bar.firstElementChild;
  let run = 0;
  b.addEventListener("click", () => {
    const mine = ++run;
    bar.classList.remove("full");
    fill.style.transition = "none";
    fill.style.setProperty("--p", "0%");
    void fill.offsetWidth;
    fill.style.transition = "";
    let p = 0;
    const tick = () => {
      if (mine !== run) return;
      p = Math.min(100, p + 3 + Math.random() * 5);
      fill.style.setProperty("--p", `${p}%`);
      if (p < 100) setTimeout(tick, 260);
      else
        setTimeout(() => {
          if (mine !== run) return;
          bar.classList.add("full");
        }, 480);
    };
    tick();
  });
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

// ---------------------------------------------------------------- toasts
// A passing toast leaves when its draining line ends, so a pointer or focus
// on the stack, which pauses the line in CSS, pauses its timer too. An error
// stays until dismissed. A finger can swipe one away.
const TOAST_ICON = { info: "info", success: "circle-check", warning: "triangle-alert", error: "octagon-alert" };
let toaster = null;
// design-patterns.md "Notifications": 7 seconds, paused while hovered or
// focused; an error, or any toast with an action, stays until dismissed.
function toast({ kind = "info", title, body = "", action = null, actions = [], sticky = kind === "error" || Boolean(action) || actions.length > 0, life = 7000, busy = false }) {
  toaster ??= document.body.appendChild(el("section", { class: "g-toaster", "aria-label": "Notifications" }));
  const close = el("button", { class: "cp-button g-close", "data-variant": "quiet", type: "button", "aria-label": "Dismiss" }, icon("x"));
  const text = el("div", {}, el("strong", { text: title }), ...(body ? [el("p", { text: body })] : []));
  const node = el(
    "div",
    { class: "g-toast", "data-kind": kind, role: kind === "error" ? "alert" : "status" },
    busy ? el("span", { class: "loader load-twirl g-toast-load", "aria-hidden": "true" }, el("span")) : icon(TOAST_ICON[kind]),
    text,
    close,
  );
  const all = action ? [action, ...actions] : actions;
  if (all.length) {
    text.append(el("div", { class: "g-toast-actions" }, ...all.map((a) => el("button", { class: "cp-button", "data-size": "sm", type: "button", text: a.label, onclick: () => { a.run?.(); if (!a.keep) leave(); } }))));
  }
  if (!sticky && !busy) {
    const line = el("span", { class: "g-time" });
    line.style.setProperty("--life", `${life}ms`);
    line.addEventListener("animationend", () => leave());
    node.append(line);
  }
  const slot = el("div", { class: "g-slot" }, el("div", { class: "g-toast-wrap" }, node));
  const leave = () => goAway(slot);
  close.addEventListener("click", leave);
  // A press anywhere on the toast dismisses it, except on its own buttons
  // and links, and except a press that ends a text selection.
  node.addEventListener("click", (e) => {
    if (e.target.closest("button, a") || String(getSelection()).length > 0) return;
    leave();
  });
  swipeAway(node, leave);
  toaster.append(slot);
  // At most four at once: the oldest passing one makes room.
  const slots = $$(".g-slot:not(.leaving)", toaster);
  if (slots.length > 4) goAway(slots.find((s) => s.querySelector(".g-time")) ?? slots[0]);
  return {
    leave,
    node,
    update(next) {
      node.dataset.kind = next.kind;
      node.setAttribute("role", next.kind === "error" ? "alert" : "status");
      text.querySelector(".g-toast-actions")?.remove();
      node.firstElementChild.replaceWith(icon(TOAST_ICON[next.kind]));
      text.firstElementChild.textContent = next.title;
      if (next.body !== undefined) {
        text.querySelector("p")?.remove();
        if (next.body) text.append(el("p", { text: next.body }));
      }
      const line = el("span", { class: "g-time" });
      line.style.setProperty("--life", `${next.life ?? 7000}ms`);
      line.addEventListener("animationend", () => leave());
      node.append(line);
    },
  };
}
// A toast leaves in two beats: it slides out toward its edge and fades
// (280ms, speeding up), then its row closes so the ones above settle down
// (220ms). Reduced motion only fades.
function goAway(slot) {
  if (slot.classList.contains("leaving")) return;
  slot.classList.add("leaving");
  const out = reduced() ? 120 : 280;
  setTimeout(() => slot.classList.add("closing"), out);
  setTimeout(() => slot.remove(), out + (reduced() ? 0 : 240));
}
function swipeAway(node, leave) {
  let start = null;
  node.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || e.target.closest("button")) return;
    start = { x: e.clientX, id: e.pointerId };
    node.setPointerCapture(e.pointerId);
  });
  node.addEventListener("pointermove", (e) => {
    if (start?.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    node.style.translate = `${dx}px 0`;
    node.style.opacity = String(1 - Math.min(Math.abs(dx) / 200, 0.7));
  });
  const end = (e) => {
    if (start?.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    start = null;
    if (Math.abs(dx) > 80) leave();
    else {
      node.style.translate = "";
      node.style.opacity = "";
    }
  };
  node.addEventListener("pointerup", end);
  node.addEventListener("pointercancel", end);
}
for (const b of $$("[data-toast-kind]")) {
  b.addEventListener("click", () => {
    const kind = b.dataset.toastKind;
    const preset = {
      info: { title: "The next check starts at 14:30" },
      success: { title: "Saved", body: "The next check uses the new interval." },
      warning: { title: "AniList is slow to answer", body: "Verdicts may be up to an hour old." },
      error: { title: "Sonarr refused the API key", body: "Paste a new key in Settings, then Sources." },
    }[kind];
    toast({ kind, ...preset });
  });
}
$("[data-toast-undo]")?.addEventListener("click", () =>
  toast({ kind: "success", title: "3 entries removed", action: { label: "Undo", run: () => toast({ kind: "info", title: "3 entries restored" }) } }),
);
$("[data-toast-busy]")?.addEventListener("click", () => {
  let n = 0;
  let stopped = false;
  const t = toast({ kind: "info", title: "Checking 0 of 412 entries…", busy: true, actions: [{ label: "Open", keep: true, run: () => say("Opening the check") }, { label: "Cancel", run: () => (stopped = true) }] });
  const tick = setInterval(() => {
    if (stopped) return clearInterval(tick);
    n = Math.min(412, n + 103);
    t.node.querySelector("strong").textContent = `Checking ${n} of 412 entries…`;
    if (n === 412) {
      clearInterval(tick);
      t.update({ kind: "success", title: "Check finished", body: "33 entries have a better release." });
    }
  }, 600);
});
$("[data-toast-sticky]")?.addEventListener("click", () =>
  toast({ kind: "warning", title: "Radarr is offline", body: "Changes wait until it answers again.", sticky: true }),
);

// A trigger with filters or labels on: data-active, and its icon swaps to
// the filled drawing named by data-cp-icon-on.
const markActive = (b, on) => {
  b.toggleAttribute("data-active", on);
  const ic = $(".cp-icon[data-cp-icon-on]", b);
  if (!ic) return;
  ic.dataset.cpIconOff ??= ic.dataset.cpIcon;
  ic.dataset.cpIcon = on ? ic.dataset.cpIconOn : ic.dataset.cpIconOff;
};

// ---------------------------------------------------------- anchors
// Each popover anchors to the button that opens it, by a name unique to the
// pair, so CSS anchor positioning places and flips it.
// A popover shared by several buttons (one menu for every row) takes the
// anchor of the one pressed; a button inside its own popover anchors nothing.
$$("[popovertarget]").forEach((b, i) => {
  const pop = document.getElementById(b.getAttribute("popovertarget"));
  if (!pop || pop.contains(b)) return;
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
$$("[role='menu'][popover]").forEach(menuKeys);

// A context menu opens where the pointer is: a right click, or a finger held
// still for half a second. The hold selects no text and opens no browser
// menu, and the lift that ends it clicks nothing. Each row's ⋯ button opens
// the same menu under itself.
const ctx = $("#ctx-menu");
if (ctx) {
  const show = () => ctx.matches(":popover-open") || ctx.showPopover();
  // popover="manual": the browser's light dismiss would take the finger's
  // lift after a hold as a press outside and close the menu it just opened.
  // A press outside or Escape closes it instead.
  document.addEventListener("pointerdown", (e) => {
    if (ctx.matches(":popover-open") && !ctx.contains(e.target) && !e.target.closest?.("[data-context-open]")) ctx.hidePopover();
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ctx.matches(":popover-open")) ctx.hidePopover();
  });
  // Opened from a button, the menu hands focus back to it as it closes.
  let opener = null;
  ctx.addEventListener("toggle", (e) => {
    if (e.newState !== "closed") return;
    if (opener && (ctx.contains(document.activeElement) || document.activeElement === document.body)) opener.focus();
    opener = null;
  });
  const openAt = (x, y, row) => {
    ctx.style.setProperty("position-anchor", "none");
    ctx.style.positionArea = "none";
    ctx.style.left = `${Math.min(x, innerWidth - 220)}px`;
    ctx.style.top = `${Math.min(y, innerHeight - 220)}px`;
    ctx.dataset.row = row?.dataset.name ?? "";
    opener = null;
    show();
  };
  for (const zone of $$("[data-context]")) {
    zone.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!held) openAt(e.clientX, e.clientY, e.target.closest("[data-name]"));
    });
    let hold = 0;
    let start = null;
    let held = false;
    const drop = () => {
      clearTimeout(hold);
      start = null;
    };
    zone.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" || e.target.closest("button")) return;
      held = false;
      start = { x: e.clientX, y: e.clientY };
      hold = setTimeout(() => {
        held = true;
        openAt(start.x, start.y, e.target.closest("[data-name]"));
      }, 500);
    });
    zone.addEventListener("pointermove", (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) drop();
    });
    for (const t of ["pointerup", "pointercancel"]) zone.addEventListener(t, drop);
    // The lift after a hold would click the row under the finger.
    zone.addEventListener("click", (e) => {
      if (!held) return;
      held = false;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    zone.addEventListener("selectstart", (e) => start && e.preventDefault());
  }
  for (const b of $$("[data-context-open]")) {
    const name = `--g-ctx-${b.closest("[data-name]").dataset.name}`;
    b.style.setProperty("anchor-name", name);
    b.addEventListener("click", () => {
      if (ctx.matches(":popover-open") && opener === b) return ctx.hidePopover();
      opener = b;
      ctx.style.removeProperty("left");
      ctx.style.removeProperty("top");
      ctx.style.positionArea = "";
      ctx.style.setProperty("position-anchor", name);
      ctx.dataset.row = b.closest("[data-name]").dataset.name;
      show();
    });
  }
}

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
// drag out of a field closes nothing. A dialog holding changes the person
// typed keeps them: it shakes instead, and Escape or Cancel still close it.
const typedIn = (d) => $$("input, textarea, select", d).some((f) =>
  f.type === "checkbox" || f.type === "radio" ? f.checked !== f.defaultChecked : f.tagName === "SELECT" ? [...f.options].some((o) => o.selected !== o.defaultSelected) : f.value !== f.defaultValue);
for (const d of $$("dialog[data-keep-typed]")) {
  // A cancel drops the edits; a save makes them the dialog's new start.
  d.addEventListener("close", () => {
    const form = $("form", d);
    if (d.returnValue && d.returnValue !== "cancel") {
      for (const f of $$("input, textarea", form)) f.defaultValue = f.value;
    }
    form.reset();
  });
}
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
    if (d.hasAttribute("data-keep-typed") && typedIn(d)) {
      d.classList.remove("g-refused");
      void d.offsetWidth;
      d.classList.add("g-refused");
      say("Your changes are still here. Save them, or press Cancel.");
      return;
    }
    d.close("cancel");
  });
}

for (const d of $$("dialog[data-says]")) {
  d.addEventListener("close", () => d.returnValue && d.returnValue !== "cancel" && toast({ kind: d.returnValue === "delete" ? "success" : "info", title: d.dataset.says }));
}

// --------------------------------------------------------- command palette
const cmdPalette = $("#palette");
if (cmdPalette) {
  const input = $("input", cmdPalette);
  const list = $("[role='listbox']", cmdPalette);
  const all = $$("[role='option']", list);
  const visible = () => all.filter((o) => !o.hidden);
  const activate = (o) => {
    for (const n of all) n.setAttribute("aria-selected", String(n === o));
    if (o) {
      input.setAttribute("aria-activedescendant", o.id);
      o.scrollIntoView({ block: "nearest" });
    }
  };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    for (const o of all) o.hidden = q !== "" && !o.textContent.toLowerCase().includes(q);
    activate(visible()[0]);
    $(".g-none", cmdPalette).hidden = visible().length > 0;
  });
  input.addEventListener("keydown", (e) => {
    const v = visible();
    const at = v.findIndex((o) => o.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowDown") activate(v[(at + 1) % v.length]);
    else if (e.key === "ArrowUp") activate(v[(at - 1 + v.length) % v.length]);
    else if (e.key === "Enter" && v[at]) run(v[at]);
    else return;
    e.preventDefault();
  });
  const run = (o) => {
    cmdPalette.close();
    toast({ kind: "info", title: o.querySelector("span:not(.cp-icon)").textContent });
  };
  list.addEventListener("click", (e) => {
    const o = e.target.closest("[role='option']");
    if (o) run(o);
  });
  const open = () => {
    input.value = "";
    input.dispatchEvent(new Event("input"));
    cmdPalette.showModal();
  };
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      open();
    }
  });
  $("[data-palette-open]")?.addEventListener("click", open);
}

// --------------------------------------------------------------- fields
for (const f of $$(".g-search")) {
  const input = $("input", f);
  $(".g-clear", f)?.addEventListener("click", () => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
}
// A textarea counts its characters and grows where the engine cannot size
// it to its content.
const sizesToContent = CSS.supports("field-sizing", "content");
for (const t of $$("textarea[data-max]")) {
  const out = document.getElementById(t.dataset.count);
  const max = Number(t.dataset.max);
  const update = () => {
    out.textContent = `${t.value.length} / ${max}`;
    out.toggleAttribute("data-over", t.value.length > max);
    t.setAttribute("aria-invalid", String(t.value.length > max));
    if (!sizesToContent) {
      t.style.height = "auto";
      t.style.height = `${t.scrollHeight + 2}px`;
    }
  };
  t.addEventListener("input", update);
  update();
}
for (const r of $$(".g-range")) {
  const out = document.getElementById(r.dataset.out);
  const row = r.parentElement;
  const tip = el("span", { class: "g-range-tip", "aria-hidden": "true" });
  row.append(tip);
  const update = () => {
    const share = (r.value - r.min) / (r.max - r.min);
    r.style.setProperty("--fill", `${share * 100}%`);
    if (out) out.value = `${r.value}${r.dataset.unit ?? ""}`;
    // the thumb's centre travels the track less its own width (18px)
    const thumb = 18;
    tip.style.setProperty("--tip-x", `${Math.round(r.offsetLeft + thumb / 2 + share * (r.offsetWidth - thumb))}px`);
    tip.textContent = `${r.value}${r.dataset.unit ?? ""}`;
  };
  r.addEventListener("input", update);
  r.addEventListener("pointerdown", () => {
    row.dataset.held = "";
    addEventListener("pointerup", () => delete row.dataset.held, { once: true });
  });
  new ResizeObserver(update).observe(r);
  update();
}
for (const z of $$(".g-drop")) {
  const input = $("input", z);
  const list = document.getElementById(z.dataset.list);
  const show = (files) => {
    list.replaceChildren(...[...files].map((f) => el("li", {}, icon("file-text"), ` ${f.name} (${Math.max(1, Math.round(f.size / 1024))} KB)`)));
    say(`${files.length} file${files.length === 1 ? "" : "s"} chosen`);
  };
  z.addEventListener("dragover", (e) => {
    e.preventDefault();
    z.classList.add("over");
  });
  z.addEventListener("dragleave", () => z.classList.remove("over"));
  z.addEventListener("drop", (e) => {
    e.preventDefault();
    z.classList.remove("over");
    show(e.dataTransfer.files);
  });
  input.addEventListener("change", () => show(input.files));
}
// -------------------------------------------------------- relative time
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const rtfNarrow = new Intl.RelativeTimeFormat(undefined, { numeric: "always", style: "narrow" });
const dtf = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
function relative(ms, narrow = false) {
  const s = Math.round((ms - Date.now()) / 1000);
  const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return (narrow ? rtfNarrow : rtf).format(Math.round(s / n), u);
  return rtf.format(s < 0 ? Math.min(-1, s) : s, "second").replace(/\d+ seconds? ago/, "just now");
}
function liveTimes() {
  for (const t of $$("time[data-ago]")) {
    const at = Date.now() - Number(t.dataset.ago) * 1000;
    t.dateTime ||= new Date(at).toISOString();
    t.textContent = relative(Date.parse(t.dateTime), t.dataset.style === "narrow");
    t.title = dtf.format(Date.parse(t.dateTime));
  }
}
liveTimes();
setInterval(liveTimes, 30000);

// -------------------------------------------------------- content tabs
// Arrow keys move along the tabs and select, as the WAI-ARIA tabs pattern's
// automatic activation does; each tab shows its panel.
for (const list of $$("[data-tabs]")) {
  const tabs = $$("[role='tab']", list);
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    }
    tab.click();
  };
  list.addEventListener("keydown", (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const t = tabs[(next + tabs.length) % tabs.length];
    t.focus();
    select(t);
  });
  for (const t of tabs) t.addEventListener("click", () => {
    for (const x of tabs) {
      x.tabIndex = x === t ? 0 : -1;
      const panel = document.getElementById(x.getAttribute("aria-controls"));
      if (panel) panel.hidden = x !== t;
    }
  });
}

// ------------------------------------------------------------- tables
// A sortable header sorts its column and the rows glide to their places.
// Each sort button names what a press does: the other order on the sorted
// column, ascending on the others.
function sortNames(table) {
  for (const b of $$(".g-sort", table)) {
    const th = b.closest("th");
    const now = th.getAttribute("aria-sort");
    b.setAttribute("aria-label", `Sort by ${b.textContent.trim()}, ${now === "ascending" ? "descending" : "ascending"}`);
  }
}
for (const table of $$("table[data-sortable]")) {
  sortNames(table);
  const all = $("[data-select-all]", table);
  if (all) all.setAttribute("aria-label", `Select all ${$$("tbody tr", table).length} entries on this page`);
  const body = $("tbody", table);
  for (const btn of $$(".g-sort", table)) {
    btn.addEventListener("click", () => {
      const th = btn.closest("th");
      const col = [...th.parentElement.children].indexOf(th);
      const dir = th.getAttribute("aria-sort") === "ascending" ? "descending" : "ascending";
      for (const h of $$("th", table)) h.removeAttribute("aria-sort");
      th.setAttribute("aria-sort", dir);
      const rows = $$("tr", body);
      const before = new Map(rows.map((r) => [r, r.getBoundingClientRect().top]));
      const key = (r) => r.children[col].dataset.sort ?? r.children[col].textContent.trim();
      rows.sort((a, b) => {
        const [x, y] = [key(a), key(b)];
        const c = isNaN(x) || isNaN(y) ? x.localeCompare(y) : Number(x) - Number(y);
        return dir === "ascending" ? c : -c;
      });
      body.append(...rows);
      if (!reduced()) {
        for (const r of rows) {
          const dy = before.get(r) - r.getBoundingClientRect().top;
          if (dy) r.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        }
      }
      sortNames(table);
      say(`Sorted by ${btn.textContent.trim()}, ${dir}`);
    });
  }
}
// The bar counts the selection and names it on every bulk action. Once
// this whole page is selected and more rows match, it offers them all;
// Escape in the table or the bar clears, unless a menu or dialog is open.
for (const bar of $$("[data-batch]")) {
  const group = bar.dataset.batch;
  const boxes = $$(`[data-group="${group}"]`);
  const all = $(`[data-select-all="${group}"]`);
  const count = $(".cp-batch-count", bar);
  const every = $("[data-select-every]", bar);
  const total = Number(bar.dataset.total ?? boxes.length);
  let everything = false;
  let said = "";
  const update = () => {
    const on = boxes.filter((b) => b.checked).length;
    if (on < boxes.length) everything = false;
    const n = everything ? total : on;
    bar.hidden = n === 0;
    count.textContent = `${n} selected`;
    if (every) every.hidden = everything || on < boxes.length || total <= boxes.length;
    for (const b of $$("[data-names-count]", bar)) {
      const label = $(".roll > span:first-child", b) ?? b;
      label.textContent = `${b.dataset.namesCount} ${n}`;
    }
    const words = n ? count.textContent : "Selection cleared";
    if (words !== said) say(words);
    said = words;
  };
  const clear = () => {
    everything = false;
    for (const b of boxes) b.checked = false;
    boxes[0]?.dispatchEvent(new Event("change"));
    update();
  };
  for (const b of [...boxes, all]) b?.addEventListener("change", update);
  every?.addEventListener("click", () => {
    everything = true;
    update();
    $("[data-clear]", bar).focus();
  });
  $("[data-clear]", bar)?.addEventListener("click", () => {
    clear();
    (all ?? boxes[0])?.focus();
  });
  const table = all?.closest("table");
  for (const zone of [bar, table]) {
    zone?.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || bar.hidden || document.querySelector(":popover-open:not(.cp-tooltip), dialog[open]")) return;
      e.preventDefault();
      clear();
      (all ?? boxes[0])?.focus();
    });
  }
  said = "Selection cleared";
  update();
}
// A row's Grab answers in its own cell, with no toast: the Save cycle
// above plays on it, and this says it once a press.
for (const b of $$("[data-grab-row]")) {
  b.addEventListener("click", () => {
    if (b.dataset.said) return;
    b.dataset.said = "";
    say(`Grabbing ${b.dataset.grabRow}`);
    setTimeout(() => delete b.dataset.said, 1600);
  });
}
$("[data-load-table]")?.addEventListener("click", (e) => {
  const table = document.getElementById(e.currentTarget.dataset.loadTable);
  const body = $("tbody", table);
  const keep = [...body.children];
  table.setAttribute("aria-busy", "true");
  body.replaceChildren(...keep.map(() => el("tr", { class: "g-skeleton-row" }, ...[...keep[0].children].map(() => el("td")))));
  setTimeout(() => {
    body.replaceChildren(...keep);
    table.removeAttribute("aria-busy");
  }, 1400);
});

// ---------------------------------------------------- reorderable list
// A handle drags an item; Alt with an arrow key, or its Move up and Move
// down, move it by one. The others slide aside and the order is announced.
for (const list of $$("[data-reorder]")) {
  const rows = () => $$(":scope > li", list);
  const flip = (fn) => {
    const before = new Map(rows().map((r) => [r, r.getBoundingClientRect().top]));
    fn();
    if (reduced()) return;
    for (const r of rows()) {
      const dy = before.get(r) - r.getBoundingClientRect().top;
      if (dy) r.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    }
  };
  const moved = (r) => {
    sync?.();
    const i = rows().indexOf(r);
    $$(".g-rank", list).forEach((n, k) => (n.textContent = String(k + 1)));
    say(`${r.dataset.name}, position ${i + 1} of ${rows().length}`);
  };
  // Move up and Move down on every item: a single press moves it, with no drag
  // (WCAG 2.2, 2.5.7). Focus stays on the button pressed, which moves with its
  // item; at an end the button is aria-disabled, so it keeps focus there too.
  const sync = () => {
    const all = rows();
    all.forEach((r, i) => {
      $("[data-move='-1']", r)?.setAttribute("aria-disabled", String(i === 0));
      $("[data-move='1']", r)?.setAttribute("aria-disabled", String(i === all.length - 1));
    });
  };
  sync();
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-move]");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const r = b.closest("li");
    flip(() => (b.dataset.move === "-1" ? r.previousElementSibling?.before(r) : r.nextElementSibling?.after(r)));
    b.focus();
    sync();
    moved(r);
  });
  list.addEventListener("keydown", (e) => {
    const r = e.target.closest("li");
    if (!r || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    flip(() => (e.key === "ArrowUp" ? r.previousElementSibling?.before(r) : r.nextElementSibling?.after(r)));
    e.target.focus();
    moved(r);
  });
  let drag = null;
  list.addEventListener("pointerdown", (e) => {
    const h = e.target.closest(".g-handle");
    if (!h || e.button !== 0) return;
    e.preventDefault();
    const r = h.closest("li");
    h.setPointerCapture(e.pointerId);
    drag = { r, h, id: e.pointerId, y0: e.clientY, boxes: rows().map((x) => ({ x, top: x.offsetTop, h: x.offsetHeight })) };
    drag.from = drag.boxes.findIndex((b) => b.x === r);
    drag.to = drag.from;
    r.classList.add("lifted");
  });
  list.addEventListener("pointermove", (e) => {
    if (drag?.id !== e.pointerId) return;
    const dy = e.clientY - drag.y0;
    const me = drag.boxes[drag.from];
    drag.r.style.translate = `0 ${dy}px`;
    const mid = me.top + me.h / 2 + dy;
    let to = drag.boxes.findIndex((b) => mid < b.top + b.h / 2);
    if (to < 0) to = drag.boxes.length - 1;
    else if (to > drag.from) to -= 1;
    drag.to = to;
    drag.boxes.forEach((b, i) => {
      if (b.x === drag.r) return;
      let s = 0;
      if (drag.from < to && i > drag.from && i <= to) s = -me.h;
      if (drag.from > to && i >= to && i < drag.from) s = me.h;
      b.x.style.transition = "translate 0.2s cubic-bezier(0.2, 0, 0, 1)";
      b.x.style.translate = s ? `0 ${s}px` : "";
    });
  });
  const end = (e) => {
    if (drag?.id !== e.pointerId) return;
    const d = drag;
    drag = null;
    const others = d.boxes.map((b) => b.x).filter((x) => x !== d.r);
    flip(() => {
      for (const b of d.boxes) {
        b.x.style.transition = "none";
        b.x.style.translate = "";
      }
      const anchor = others[d.to];
      if (anchor) anchor.before(d.r);
      else list.append(d.r);
    });
    requestAnimationFrame(() => d.boxes.forEach((b) => (b.x.style.transition = "")));
    d.r.classList.remove("lifted");
    moved(d.r);
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}

for (const c of $$(".g-chip")) {
  c.addEventListener("click", () => c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed") !== "true")));
}

// --------------------------------------------------------- disclosure
// <details name> is the platform's accordion; an engine that sizes to auto
// glides it open, and the others snap, which is usable.

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
// First-run setup. The host says which step is current (data-current); the
// page's h1 names it, "Step 2 of 3: Connect Sonarr"; a done step is a
// button back to it; the current one is ringed and named current. Test
// connection follows connection-test.md: data-state and aria-disabled, and
// a failure marks the field it blames.
for (const flow of $$("[data-steps]")) {
  const steps = $$("[data-step]", flow);
  const marks = $$(".g-steps > li", flow);
  const title = $(".g-step-title", flow);
  const compact = $(".g-steps-compact", flow);
  // Focus follows a change of step, so a screen reader lands on the new
  // one; the first step on load takes none.
  const show = (i, moved = true) => {
    flow.dataset.current = String(i);
    steps.forEach((s, k) => (s.hidden = k !== i));
    marks.forEach((m, k) => {
      const name = m.dataset.name;
      m.dataset.state = k < i ? "done" : k === i ? "current" : "todo";
      if (k < i) m.replaceChildren(el("button", { type: "button", "data-go": String(k), text: name }));
      else m.replaceChildren(name, ...(k === i ? [el("span", { class: "g-sr", text: " (current step)" })] : []));
      if (k === i) m.setAttribute("aria-current", "step");
      else m.removeAttribute("aria-current");
    });
    title.textContent = `Step ${i + 1} of ${steps.length}: ${steps[i].dataset.title}`;
    compact.textContent = `Step ${i + 1} of ${steps.length}`;
    if (moved) title.focus();
  };
  flow.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) return show(Number(go.dataset.go));
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
    const test = e.target.closest("[data-test]");
    if (test && test.getAttribute("aria-disabled") !== "true") {
      const out = document.getElementById(test.dataset.test);
      const url = document.getElementById(test.dataset.url);
      const err = document.getElementById(`${url.id}-error`);
      test.dataset.state = "testing";
      test.setAttribute("aria-disabled", "true");
      $(".label", test).textContent = "Testing…";
      out.dataset.tone = "neutral";
      out.textContent = "";
      setTimeout(() => {
        test.removeAttribute("aria-disabled");
        $(".label", test).textContent = "Test connection";
        const ok = /^https?:\/\/\S+:\d+/.test(url.value);
        test.dataset.state = ok ? "ok" : "failed";
        out.dataset.tone = ok ? "success" : "danger";
        out.replaceChildren(icon(ok ? "circle-check" : "circle-x"), ok ? " Connected, Sonarr 4.0.9" : " Sonarr did not answer");
        url.setAttribute("aria-invalid", String(!ok));
        err.hidden = ok;
        if (!ok) url.focus();
      }, 1100);
    }
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

// ----------------------------------------------------------- bottom bar
for (const nav of $$(".g-bottom-nav")) {
  nav.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    for (const x of $$("a", nav)) x.toggleAttribute("aria-current", x === a);
    for (const x of $$("a", nav)) if (x === a) x.setAttribute("aria-current", "page");
    $(".g-phone-body", nav.closest(".g-phone")).textContent = `${a.textContent.trim()}: this destination's screen.`;
  });
}

// --------------------------------------------------------- header status
// The first state that holds: offline, problems, working, all good. A
// change is announced politely, as the words of the link itself.
const STATES = [
  { state: "ok", words: "All good", icon: null },
  { state: "working", words: "Working: 3", icon: "spinner-arc" },
  { state: "problems", words: "2 problems", icon: "triangle-alert" },
  { state: "offline", words: "Offline", icon: "wifi-off" },
];
for (const s of $$("[data-status-demo]")) {
  const link = $(".g-status", s.closest(".card"));
  let i = 0;
  s.addEventListener("click", () => {
    i = (i + 1) % STATES.length;
    const st = STATES[i];
    link.dataset.state = st.state;
    link.replaceChildren(st.icon ? icon(st.icon) : el("span", { class: "g-dot" }), el("span", { class: "g-status-word", text: st.words }));
    // a busy glyph that does not spin: it says working without motion
    if (st.icon === "spinner-arc") link.querySelector(".cp-icon").style.animation = "none";
    link.setAttribute("aria-label", st.words);
    announce(st.words);
  });
}

// ------------------------------------------------------------ virtual list
// 20,000 rows: only those in view, plus a few each side, are in the DOM,
// each keyed by its id so a live update changes it in place. The focused
// row stays drawn when it scrolls away, so focus never drops to the body.
for (const host of $$("[data-virtual]")) {
  const total = Number(host.dataset.virtual);
  const H = 48;
  const words = ["Frieren", "Mushishi", "Dungeon", "Heron", "Monogatari", "Ping Pong", "Haikyu", "Mob Psycho", "Odd Taxi", "Kaiju"];
  let rows = Array.from({ length: total }, (_, i) => ({ id: `t${i}`, title: `${words[i % words.length]} ${Math.floor(i / words.length) + 1}`, n: (i * 7) % 26 }));
  let view = rows;
  const spacer = $(".g-spacer", host);
  const drawn = new Map();
  const count = document.getElementById(host.dataset.count);
  const draw = () => {
    spacer.style.blockSize = `${view.length * H}px`;
    const first = Math.max(0, Math.floor(host.scrollTop / H) - 5);
    const last = Math.min(view.length, Math.ceil((host.scrollTop + host.clientHeight) / H) + 5);
    const keep = new Set(view.slice(first, last).map((r) => r.id));
    const focused = document.activeElement?.closest?.(".g-vrow")?.dataset.id;
    if (focused) keep.add(focused);
    for (const [id, node] of drawn) if (!keep.has(id)) { node.remove(); drawn.delete(id); }
    view.forEach((r, i) => {
      if (!keep.has(r.id)) return;
      let node = drawn.get(r.id);
      if (!node) {
        node = el("div", { class: "g-vrow", "data-id": r.id }, el("a", { href: `#${r.id}` }), el("small"));
        drawn.set(r.id, node);
        spacer.append(node);
      }
      node.style.top = `${i * H}px`;
      node.firstChild.textContent = r.title;
      node.lastChild.textContent = `${r.n} of 26 episodes`;
    });
  };
  host.addEventListener("scroll", draw, { passive: true });
  const filter = document.getElementById(host.dataset.filter);
  filter?.addEventListener("input", () => {
    const q = filter.value.trim().toLowerCase();
    view = q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
    host.scrollTop = 0;
    draw();
    count.textContent = `${view.length.toLocaleString()} of ${rows.length.toLocaleString()} titles`;
    clearTimeout(host.sayTimer);
    host.sayTimer = setTimeout(() => announce(count.textContent), 500);
  });
  $(`[data-live-update="${host.id}"]`)?.addEventListener("click", () => {
    rows = rows.map((r) => (Math.random() < 0.3 ? { ...r, n: Math.min(26, r.n + 1) } : r));
    const ids = new Set(view.map((r) => r.id));
    view = rows.filter((r) => ids.has(r.id));
    draw();
  });
  count.textContent = `${total.toLocaleString()} of ${total.toLocaleString()} titles`;
  draw();
}

// ------------------------------------------------------ inline outcomes
for (const b of $$("[data-outcome]")) {
  let fail = b.dataset.outcome === "fail";
  const cell = b.parentElement;
  const run = (btn) => {
    btn.setAttribute("aria-busy", "true");
    btn.querySelector(".label").textContent = "Downloading…";
    btn.querySelector(".cp-icon").dataset.cpIcon = "spinner-arc";
    setTimeout(() => {
      const out = el("span", { class: "g-outcome", "data-state": fail ? "error" : "done" });
      if (fail) {
        const retry = el("button", { class: "cp-button", "data-size": "sm", type: "button" }, icon("refresh-cw"), el("span", { class: "label", text: "Retry" }));
        out.append(el("span", { class: "cp-field-error" }, icon("circle-x"), "The provider timed out."), retry);
        retry.addEventListener("click", () => {
          fail = false;
          run(retry);
        });
        announce("Download failed: the provider timed out.", true);
      } else {
        out.append(el("a", { href: "#data" }, icon("circle-check"), "Downloaded · Pinned"));
        announce("Downloaded and pinned.");
      }
      cell.replaceChildren(out);
      (out.querySelector("button, a")).focus();
    }, 1400);
  };
  b.addEventListener("click", () => run(b));
}
for (const b of $$(".g-disclose")) {
  b.addEventListener("click", () => {
    const row = document.getElementById(b.getAttribute("aria-controls"));
    const body = $(".g-why", row) ?? row;
    const open = b.getAttribute("aria-expanded") !== "true";
    b.setAttribute("aria-expanded", String(open));
    body.glide?.cancel();
    if (open) {
      row.hidden = false;
      body.glide = glideHeight(body, 0, body.getBoundingClientRect().height);
    } else {
      body.glide = glideHeight(body, body.getBoundingClientRect().height, 0, () => (row.hidden = true));
    }
  });
}

// ------------------------------------------------------- batched action
for (const b of $$("[data-batch-total]")) {
  const total = Number(b.dataset.batchTotal);
  const size = Number(b.dataset.batchSize);
  const report = document.getElementById(b.dataset.report);
  let started = 0;
  const label = () => {
    const left = total - started;
    $(".label", b).textContent = started === 0 ? `Start the first ${Math.min(size, left)}` : left > size ? `Start the next ${size}` : `Start the remaining ${left}`;
  };
  b.addEventListener("click", () => {
    const n = Math.min(size, total - started);
    started += n;
    const failed = started === total ? 2 : 0;
    const left = total - started;
    report.textContent = `Started ${started} of ${total}. ${left ? `${left} remain.` : "None remain."}${failed ? ` ${failed} couldn't start: no provider has their language.` : ""}`;
    announce(report.textContent);
    if (left === 0) {
      b.disabled = true;
      $(".label", b).textContent = `All ${total} started`;
    } else label();
  });
  label();
}

// --------------------------------------------------------------- jobs
for (const list of $$("[data-jobs]")) {
  const tick = () => {
    for (const j of $$(".g-job:not([data-ended])", list)) {
      const p = $("progress", j);
      p.value = Math.min(Number(p.max), Number(p.value) + 1);
      $(".g-job-n", j).textContent = `${p.value} of ${p.max}`;
      if (p.value === Number(p.max)) end(j, "Finished", "circle-check", "success");
    }
  };
  const end = (j, words, ic, tone) => {
    j.dataset.ended = "";
    const phase = $(".g-job-phase", j);
    phase.dataset.tone = tone;
    phase.replaceChildren(icon(ic), words);
    $("[data-stop]", j)?.remove();
  };
  list.addEventListener("click", (e) => {
    const stop = e.target.closest("[data-stop]");
    if (stop) {
      const j = stop.closest(".g-job");
      end(j, "Stopped by you", "circle-minus", "neutral");
      announce(`${$(".g-job-kind", j).textContent} stopped`);
    }
    if (e.target.closest("[data-more-jobs]")) {
      const tmpl = $(".g-job", list);
      for (let k = 0; k < 3; k++) {
        const c = tmpl.cloneNode(true);
        delete c.dataset.ended;
        $("progress", c).value = 0;
        list.insertBefore(c, e.target.closest(".g-list-foot"));
      }
      e.target.closest(".g-list-foot").remove();
    }
  });
  setInterval(tick, 700);
}

// ---------------------------------------------- grouped confirmation
for (const d of $$("[data-grouped]")) {
  const boxes = $$("input[type='checkbox']", d);
  const go = $("[value='delete']", d);
  // The button counts what it deletes in one short phrase; the groups say
  // which files those are.
  const update = () => {
    const n = boxes.filter((b) => b.checked).reduce((sum, b) => sum + Number(b.dataset.count), 0);
    go.disabled = n === 0;
    go.textContent = n ? `Delete ${n} ${n === 1 ? "file" : "files"}` : "Choose what to delete";
  };
  for (const b of boxes) b.addEventListener("change", update);
  d.addEventListener("close", () => {
    for (const b of boxes) b.checked = false;
    update();
  });
  update();
}

// ----------------------------------------------------- signed stepper
// Arrow keys step 0.1, Shift with an arrow 1; only the field and its
// buttons change the value.
for (const n of $$(".g-nudge")) {
  const input = $("input", n);
  const fmt = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
  const read = () => Number(input.value.replace("−", "-").replace("+", "")) || 0;
  const set = (v) => {
    const c = Math.max(-60, Math.min(60, Math.round(v * 100) / 100));
    input.value = fmt(c);
    n.dispatchEvent(new CustomEvent("nudge", { bubbles: true, detail: c }));
  };
  for (const b of $$("[data-nudge]", n)) b.addEventListener("click", () => set(read() + Number(b.dataset.nudge)));
  $("[data-reset]", n)?.addEventListener("click", () => set(0));
  input.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    set(read() + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 1 : 0.1));
  });
  input.addEventListener("change", () => set(read()));
  set(read());
}

// ------------------------------------------------------ sentence editor
// Each rule is a sentence with pickers; + adds a language up to three, then
// it is disabled and says why.
const LANGS = ["English", "English (signs and songs)", "French", "German", "Spanish", "Japanese"];
const pickLang = (chosen = "English", when = "") => {
  const s = el("select", { class: "cp-input", "aria-label": when ? `Language ${when}` : "Language" }, ...[...LANGS, "nothing"].map((l) => el("option", { text: l })));
  s.value = chosen;
  return el("span", { class: "cp-select" }, s);
};
for (const ed of $$("[data-sentences]")) {
  const list = $("ol", ed);
  // Focus goes to a button, never a select: a focused <select> opens its
  // picker at once on iOS Safari.
  // Each language is an entry with its own remove, shown while the rule holds
  // more than one, so any added language can go and the rule keeps one.
  const sync = (row) => {
    const entries = $$(".g-pick", row);
    for (const e of entries) $(".g-pick-x", e).hidden = entries.length < 2;
    const add = $(".g-rule-add", row);
    const full = entries.length >= 3;
    if (full) add.setAttribute("aria-disabled", "true");
    else add.removeAttribute("aria-disabled");
    add.setAttribute("aria-label", full ? `Add a language ${row.dataset.when}: three is the most` : `Add a language ${row.dataset.when}`);
  };
  const entry = (row, pick) => {
    const name = () => $("select", pick).value;
    const x = el("button", { class: "cp-button g-pick-x", "data-variant": "quiet", "data-size": "sm", type: "button" }, icon("x"));
    const label = () => x.setAttribute("aria-label", `Remove ${name()} ${row.dataset.when}`);
    label();
    $("select", pick).addEventListener("change", label);
    x.addEventListener("click", () => {
      const gone = name();
      wrap.remove();
      sync(row);
      $(".g-rule-add", row).focus();
      say(`${gone} removed`);
    });
    const wrap = el("span", { class: "g-pick" }, pick, x);
    return wrap;
  };
  const plus = (row) => {
    const add = el("button", { class: "cp-button g-rule-add", "data-variant": "quiet", "data-size": "sm", type: "button" }, icon("plus"));
    add.addEventListener("click", () => {
      if ($$(".g-pick", row).length >= 3) return;
      $(".g-targets", row).append(entry(row, pickLang("French", row.dataset.when)));
      sync(row);
      if ($$(".g-pick", row).length >= 3) say("Three languages is the most");
    });
    return add;
  };
  const rule = (audio) => {
    const row = el("li", {});
    row.dataset.when = `when the audio is ${audio}`;
    const remove = el("button", { class: "cp-button", "data-variant": "quiet", "data-size": "sm", type: "button", "aria-label": `Remove the rule ${row.dataset.when}` }, icon("x"));
    remove.addEventListener("click", () => {
      const next = row.nextElementSibling ?? row.previousElementSibling;
      row.remove();
      $(".cp-button", next)?.focus();
    });
    row.append(
      el("span", { class: "g-rule-when" }, "When the audio is", pickLang(audio, "for the audio")),
      el("span", { class: "g-rule-verb", text: "fetch" }),
      el("span", { class: "g-targets" }),
      el("span", { class: "g-rule-acts" }, plus(row), remove),
    );
    $(".g-targets", row).append(entry(row, pickLang("English", row.dataset.when)));
    sync(row);
    return row;
  };
  $("[data-add-rule]", ed).addEventListener("click", () => {
    const r = rule("Japanese");
    list.append(r);
    $(".g-rule-add", r).focus();
  });
  // The default rule has no remove of its own; its languages do.
  const first = $("li", list);
  if (first) {
    first.dataset.when = "by default";
    const targets = $(".g-targets", first);
    for (const pick of $$(":scope > .cp-select", targets)) targets.append(entry(first, pick));
    first.append(el("span", { class: "g-rule-acts" }, plus(first)));
    sync(first);
  }
}


// ------------------------------------------------------------ pair rows
for (const ed of $$("[data-pairs]")) {
  const list = $("ul", ed);
  const tmpl = $("li", list).cloneNode(true);
  let n = 1;
  const check = (f) => {
    const err = f.nextElementSibling;
    const bad = f.value.trim() !== "" && !f.value.startsWith("/");
    f.setAttribute("aria-invalid", String(bad));
    err.hidden = !bad;
  };
  ed.addEventListener("focusout", (e) => e.target.matches("input") && check(e.target));
  ed.addEventListener("click", (e) => {
    if (e.target.closest("[data-remove-pair]")) {
      const row = e.target.closest("li");
      (row.nextElementSibling ?? row.previousElementSibling)?.querySelector("input")?.focus();
      row.remove();
    }
  });
  $("[data-add-pair]", ed).addEventListener("click", () => {
    const row = tmpl.cloneNode(true);
    n++;
    for (const f of $$("input", row)) {
      f.value = "";
      f.id = `${f.id.replace(/-\d+$/, "")}-${n}`;
      f.nextElementSibling.id = `${f.id}-error`;
      f.setAttribute("aria-describedby", `${f.id}-error`);
      f.removeAttribute("aria-invalid");
      f.nextElementSibling.hidden = true;
    }
    list.append(row);
    $("input", row).focus();
  });
}

// ---------------------------------------------------------- upload dialog
for (const d of $$("[data-upload]")) {
  const input = $("input[type='file']", d);
  const err = $(".cp-field-error", d);
  const go = $("[value='upload']", d);
  const name = $(".g-upload-name", d);
  input.addEventListener("change", () => {
    const f = input.files[0];
    const big = f && f.size > 10 * 1024 * 1024;
    err.hidden = !big;
    input.setAttribute("aria-invalid", String(Boolean(big)));
    go.disabled = !f || big;
    name.textContent = f ? `${f.name}, ${Math.max(1, Math.round(f.size / 1024))} KB` : "";
  });
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

// A refresh that waits turns its own icon: Motion's one turn (.twirl-click),
// repeated while busy. When the work ends, the turn in progress finishes, so
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
  offset?.addEventListener("nudge", (e) => {
    const cues = [...(track.cues ?? [])];
    base ??= cues.map((c) => [c.startTime, c.endTime]);
    cues.forEach((c, i) => {
      c.startTime = Math.max(0, base[i][0] + e.detail);
      c.endTime = Math.max(0.1, base[i][1] + e.detail);
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

// Tabs with manual activation: for panels that load on demand, the arrow
// keys move focus only, and Enter or Space selects (design-patterns.md
// "Tabs" rule 3).
for (const list of $$("[data-tabs-manual]")) {
  const tabs = $$("[role='tab']", list);
  list.addEventListener("keydown", (e) => {
    const at = tabs.indexOf(document.activeElement);
    if (at < 0) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      tabs[(next + tabs.length) % tabs.length].focus();
    }
  });
  for (const t of tabs) {
    t.addEventListener("click", () => {
      for (const x of tabs) {
        x.setAttribute("aria-selected", String(x === t));
        x.tabIndex = x === t ? 0 : -1;
        const panel = document.getElementById(x.getAttribute("aria-controls"));
        if (panel) panel.hidden = x !== t;
      }
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      panel.setAttribute("aria-busy", "true");
      panel.textContent = "Loading…";
      setTimeout(() => {
        panel.removeAttribute("aria-busy");
        panel.textContent = `${t.textContent}: loaded when selected.`;
      }, 500);
    });
  }
}

// The header's theme button switches light and dark in one press: pressed
// means dark, and its icon turns over to the theme it now shows.
for (const b of $$("[data-theme-toggle]")) {
  const ic = $(".cp-icon", b);
  const show = () => {
    const dark = root.dataset.theme === "dark";
    b.setAttribute("aria-pressed", String(dark));
    ic.dataset.cpIcon = dark ? "moon" : "sun";
    b.dataset.cpTip = dark ? "Switch to light" : "Switch to dark";
  };
  b.addEventListener("click", () => {
    ic.classList.remove("g-flip");
    void ic.offsetWidth;
    ic.classList.add("g-flip");
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", b);
  });
  new MutationObserver(show).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  show();
}

// The header status as a button over a non-modal panel: it opens with focus
// on its heading, and Tab past its end closes it.
for (const pop of $$("[data-status-panel]")) {
  pop.addEventListener("toggle", (e) => {
    if (e.newState === "open") $("h2", pop).focus();
  });
  pop.addEventListener("focusout", (e) => {
    if (pop.matches(":popover-open") && !pop.contains(e.relatedTarget)) pop.hidePopover();
  });
}

// Menu items that check: Space or a press toggles and keeps the menu open.
for (const item of $$("[role='menuitemcheckbox']")) {
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    item.setAttribute("aria-checked", String(item.getAttribute("aria-checked") !== "true"));
    say(`${item.textContent.trim()} ${item.getAttribute("aria-checked") === "true" ? "shown" : "hidden"}`);
  };
  item.addEventListener("click", toggle);
  item.addEventListener("keydown", (e) => e.key === " " && toggle(e));
}

// Active filters: chips that remove their filter, Clear, and "N of M"
// announced once a change settles.
for (const box of $$("[data-active-filters]")) {
  const count = document.getElementById(box.dataset.count);
  const total = Number(box.dataset.total);
  const update = () => {
    const n = $$(".cp-token", box).length;
    const shown = Math.round(total / (n + 1)) + (n ? 3 : 0);
    count.textContent = n ? `${shown} of ${total}` : `${total} titles`;
    $("[data-clear-filters]", box).hidden = n === 0;
    clearTimeout(box.t);
    box.t = setTimeout(() => announce(count.textContent), 500);
  };
  box.addEventListener("click", (e) => {
    const x = e.target.closest(".cp-token > button");
    if (x) {
      const next = x.closest(".cp-token").nextElementSibling?.querySelector("button") ?? $("[data-clear-filters]", box);
      x.closest(".cp-token").remove();
      next?.focus();
      update();
    }
    if (e.target.closest("[data-clear-filters]")) {
      for (const t of $$(".cp-token", box)) t.remove();
      update();
    }
  });
  box.addEventListener("filters-reset", update);
  update();
}

// The shortcut list: ? opens it anywhere outside a field.
const keysDialog = $("#keys");
if (keysDialog) {
  document.addEventListener("keydown", (e) => {
    if (e.key !== "?" || e.target.closest("input, textarea, select, [contenteditable]")) return;
    keysDialog.showModal();
  });
}

// A list that holds its place: changes that would move rows wait behind a
// line that offers them, so nothing moves under the reader (WCAG 3.2.2).
for (const list of $$("[data-hold]")) {
  const line = el("div", { class: "g-hold-line", role: "status" });
  let pending = 0;
  $(`[data-hold-push="${list.id}"]`)?.addEventListener("click", () => {
    pending += 3;
    line.replaceChildren(`${pending} newer rows`, el("button", { class: "cp-button", "data-size": "sm", type: "button", text: "Show", onclick: () => {
      let first = null;
      for (let k = pending; k > 0; k--) {
        first = el("li", { tabindex: "-1" }, el("div", { class: "g-row" }, icon("plus"), el("span", {}, `New grab ${k}`, el("small", { text: "just now" }))));
        list.prepend(first);
      }
      pending = 0;
      line.remove();
      first?.focus();
    } }));
    if (!line.isConnected) {
      line.hidden = true;
      list.before(line);
      glideShow(line, true);
    }
  });
}

// A toggle group: one pressed at a time.
for (const g of $$(".g-toggles")) {
  g.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    for (const x of $$("button", g)) x.setAttribute("aria-pressed", String(x === b));
    say(`${b.getAttribute("aria-label")} view`);
  });
}

// A toolbar that sends what does not fit into its More menu, in order.
for (const bar of $$("[data-overflow]")) {
  const items = $$("[data-item]", bar);
  const more = $("[data-more]", bar);
  const menu = document.getElementById(more.getAttribute("popovertarget"));
  const fit = () => {
    const wasHidden = new Set(items.filter((i) => i.hidden));
    const moreWasHidden = more.hidden;
    for (const i of items) i.hidden = false;
    // Measure the More button's real width and reserve exactly that, so it is
    // never clipped by the bar's overflow when it appears (a fixed 48px was
    // narrower than the "… More" button).
    more.hidden = false;
    menu.replaceChildren();
    const room = bar.clientWidth - more.offsetWidth - 4;
    let used = 0;
    const out = [];
    for (const i of items) {
      used += i.offsetWidth + 4;
      if (used > room) out.push(i);
    }
    for (const i of out) {
      i.hidden = true;
      menu.append(el("button", { role: "menuitem", type: "button", "data-say": i.textContent.trim() }, icon(i.querySelector(".cp-icon").dataset.cpIcon), i.textContent.trim()));
    }
    more.hidden = out.length === 0;
    // opacity only: a moving or scaling 18px icon blurs on a 1x screen
    const fade = (n) => !reduced() && n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
    for (const i of items) if (!i.hidden && wasHidden.has(i)) fade(i);
    if (!more.hidden && moreWasHidden) fade(more);
  };
  new ResizeObserver(fit).observe(bar);
  fit();
}

// A delete asks next to its button first, then confirms in place as Save does.
for (const pop of $$("[data-delete-confirm]")) {
  const opener = document.querySelector(`[popovertarget="${pop.id}"]`);
  $("[data-yes]", pop).addEventListener("click", () => {
    pop.hidePopover();
    opener.focus();
    confirmCycle(opener);
    say("4 files deleted");
  });
  $("[data-no]", pop).addEventListener("click", () => {
    pop.hidePopover();
    opener.focus();
  });
  pop.addEventListener("toggle", (e) => e.newState === "open" && $("[data-no]", pop).focus());
}

// An action that confirms and keeps its word, as Copy does.
for (const b of $$("[data-confirm-word]")) {
  b.addEventListener("click", () => {
    b.dataset.cpState = "done";
    say(b.dataset.confirmWord);
    clearTimeout(b.confirmTimer);
    b.confirmTimer = setTimeout(() => delete b.dataset.cpState, 1600);
  });
}

// A small confirmation next to its button.
for (const pop of $$("[data-popconfirm]")) {
  $("[data-yes]", pop).addEventListener("click", () => {
    pop.hidePopover();
    toast({ kind: "success", title: pop.dataset.popconfirm });
  });
  $("[data-no]", pop).addEventListener("click", () => pop.hidePopover());
  pop.addEventListener("toggle", (e) => e.newState === "open" && $("[data-no]", pop).focus());
}

// A select panel: a filter over a checkable list; Apply sets the choice
// and closes; Escape keeps the old one.
for (const pop of $$("[data-selectpanel]")) {
  const filter = $("input", pop);
  const opts = $$("[role='option']", pop);
  const btn = document.querySelector(`[popovertarget="${pop.id}"]`);
  let kept = opts.map((o) => o.getAttribute("aria-selected"));
  let at = 0;
  const vis = () => opts.filter((o) => !o.hidden);
  const activate = (i) => {
    const v = vis();
    at = (i + v.length) % v.length;
    opts.forEach((o) => o.classList.toggle("active", o === v[at]));
    if (v[at]) filter.setAttribute("aria-activedescendant", v[at].id);
  };
  let applied = false;
  pop.addEventListener("toggle", (e) => {
    if (e.newState === "closed" && !applied) opts.forEach((o, i) => o.setAttribute("aria-selected", kept[i]));
    applied = false;
    if (e.newState === "open") {
      kept = opts.map((o) => o.getAttribute("aria-selected"));
      filter.value = "";
      for (const o of opts) o.hidden = false;
      activate(0);
      filter.focus();
    }
  });
  filter.addEventListener("input", () => {
    const q = filter.value.toLowerCase();
    for (const o of opts) o.hidden = !o.textContent.toLowerCase().includes(q);
    activate(0);
  });
  const flip = (o) => o.setAttribute("aria-selected", String(o.getAttribute("aria-selected") !== "true"));
  filter.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") activate(at + 1);
    else if (e.key === "ArrowUp") activate(at - 1);
    else if (e.key === "Enter") vis()[at] && flip(vis()[at]);
    else if (e.key === "Escape") opts.forEach((o, i) => o.setAttribute("aria-selected", kept[i]));
    else return;
    if (e.key !== "Escape") e.preventDefault();
  });
  for (const o of opts) o.addEventListener("click", () => flip(o));
  const labelBtn = () => {
    const n = opts.filter((o) => o.getAttribute("aria-selected") === "true").length;
    $(".label", btn).textContent = n ? `Labels: ${n}` : "Labels";
    markActive(btn, n > 0);
  };
  $("[data-apply-panel]", pop).addEventListener("click", () => {
    applied = true;
    labelBtn();
    pop.hidePopover();
    btn.focus();
  });
  labelBtn();
}

// The single-value jump field: options with a picture; the first Escape
// closes the list, the second clears the field; the count is announced.
for (const box of $$("[data-jump]")) {
  const input = $("input", box);
  const list = document.getElementById(box.dataset.jump);
  const opts = $$("[role='option']", list);
  const none = $("[role='status']", list);
  const anchorName = "--g-jump";
  box.style.setProperty("anchor-name", anchorName);
  list.style.setProperty("position-anchor", anchorName);
  let at = -1;
  let timer = 0;
  const vis = () => opts.filter((o) => !o.hidden);
  const mark = (i) => {
    const v = vis();
    at = v.length ? (i + v.length) % v.length : -1;
    opts.forEach((o) => o.setAttribute("aria-selected", String(o === v[at])));
    if (v[at]) input.setAttribute("aria-activedescendant", v[at].id);
    else input.removeAttribute("aria-activedescendant");
  };
  const open = () => {
    const q = input.value.trim().toLowerCase();
    for (const o of opts) o.hidden = q !== "" && !o.textContent.toLowerCase().includes(q);
    none.hidden = vis().length > 0;
    none.textContent = `No entry matches “${input.value.trim()}”`;
    if (!list.matches(":popover-open")) list.showPopover();
    input.setAttribute("aria-expanded", "true");
    mark(0);
    clearTimeout(timer);
    timer = setTimeout(() => announce(vis().length ? `${vis().length} entries` : none.textContent), 500);
  };
  const close = () => {
    if (list.matches(":popover-open")) list.hidePopover();
    input.setAttribute("aria-expanded", "false");
  };
  input.addEventListener("input", open);
  input.addEventListener("blur", () => setTimeout(close, 120));
  list.addEventListener("pointerdown", (e) => e.preventDefault());
  const go = (o) => {
    close();
    input.value = o.querySelector("strong").textContent;
    toast({ kind: "info", title: `Opened ${input.value}` });
  };
  list.addEventListener("click", (e) => {
    const o = e.target.closest("[role='option']");
    if (o) go(o);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") (list.matches(":popover-open") ? mark(at + 1) : open());
    else if (e.key === "ArrowUp") mark(at - 1);
    else if (e.key === "Enter" && at >= 0 && list.matches(":popover-open")) go(vis()[at]);
    else if (e.key === "Escape") (list.matches(":popover-open") ? close() : (input.value = ""));
    else return;
    e.preventDefault();
  });
  $("[data-jump-go]", box)?.addEventListener("click", () => (vis()[0] ? go(vis()[0]) : open()));
}

// Values that come from data are set through the CSSOM, which a style-src
// without 'unsafe-inline' allows, never as a style attribute.
for (const s of $$(".g-segs > span[data-fill]")) {
  s.style.setProperty("--of", s.dataset.of);
  s.style.setProperty("--fill", `${s.dataset.fill}%`);
}
for (const l of $$("label[data-hue]")) l.style.setProperty("--h", l.dataset.hue);

// A current step's share of its bar, set through the CSSOM.
for (const li of $$(".g-track > li[data-pct]")) li.style.setProperty("--pct", `${li.dataset.pct}%`);

// History: Load older adds the next days and focuses the first it added.
for (const b of $$("[data-load-older]")) {
  const host = $("[data-history]", b.closest(".card"));
  let round = 0;
  b.addEventListener("click", () => {
    round += 1;
    const day = el("h3", { class: "g-day", tabindex: "-1", text: round === 1 ? "Two weeks ago" : `${round + 1} weeks ago` });
    const list = el("ol", { class: "g-timeline" },
      el("li", {}, el("span", { class: "g-ev", "data-tone": "neutral" }, icon("search")), el("span", {}, el("strong", { text: "Checked" }), " against SeaDex"), el("time", { text: `${round + 1} weeks ago` })),
      el("li", {}, el("span", { class: "g-ev", "data-tone": "success" }, icon("download")), el("span", {}, el("strong", { text: "Grabbed" }), " a web release"), el("time", { text: `${round + 1} weeks ago` })));
    host.append(day, list);
    day.focus();
    say("2 older events loaded");
    if (round === 2) {
      b.replaceWith(el("p", { class: "g-note", text: "That is the whole history." }));
    }
  });
}

// Active filters: put the demo's chips back.
for (const b of $$("[data-reset-filters]")) {
  const box = $("[data-active-filters]", b.closest(".card"));
  const start = $$(".cp-token", box).map((t) => t.cloneNode(true));
  b.addEventListener("click", () => {
    for (const t of $$(".cp-token", box)) t.remove();
    $("[data-clear-filters]", box).before(...start.map((t) => t.cloneNode(true)));
    box.dispatchEvent(new Event("filters-reset"));
  });
}

// A state history strip from one letter per check: s answered, w slow,
// d failed, n not checked. The picture's name sums it up, and the same
// checks open as a table.
const STRIP = { s: ["success", "Answered"], w: ["warning", "Slow"], d: ["danger", "Failed"], n: ["neutral", "Not checked"] };
for (const host of $$("[data-strip]")) {
  const cells = [...host.dataset.strip];
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  const w = 100 / cells.length;
  svg.setAttribute("viewBox", "0 0 100 10");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("role", "img");
  const tally = Object.fromEntries(Object.keys(STRIP).map((k) => [k, cells.filter((c) => c === k).length]));
  const words = Object.entries(tally).filter(([, n]) => n).map(([k, n]) => `${n} ${STRIP[k][1].toLowerCase()}`);
  svg.setAttribute("aria-label", `${host.dataset.stripName}: ${words.join(", ")}`);
  cells.forEach((c, i) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", String(i * w + 0.15));
    r.setAttribute("width", String(w - 0.3));
    r.setAttribute("height", "10");
    r.setAttribute("rx", "0.6");
    r.dataset.tone = STRIP[c][0];
    svg.append(r);
  });
  const legend = el("div", { class: "g-legend" }, ...Object.entries(STRIP).filter(([k]) => tally[k]).map(([, [tone, word]]) => el("span", {}, el("span", { class: "g-dot", "data-tone": tone }), word)));
  const rows = cells.map((c, i) => el("tr", {}, el("td", { text: i === cells.length - 1 ? `Check ${i + 1}, the latest` : `Check ${i + 1}` }), el("td", { text: STRIP[c][1] }))).reverse();
  const table = el("table", { class: "cp-table" }, el("thead", {}, el("tr", {}, el("th", { text: "Check" }), el("th", { text: "State" }))), el("tbody", {}, ...rows));
  host.append(svg, legend, el("details", {}, el("summary", {}, icon("chevron-right"), "Show as a table"), el("div", { class: "cp-panel g-flush g-gap-top" }, table)));
}

// The filter sheet stages: the foot counts what the choice would show,
// Show N results applies it, and Close or Escape put back what was there.
for (const d of $$("[data-filter-sheet]")) {
  const inputs = $$("input", d);
  const apply = $("[data-sheet-apply]", d);
  const opener = $("[data-filters-open]", d.closest(".card"));
  const clearOut = $("[data-filters-clear]", d.closest(".card"));
  const total = Number(d.dataset.total);
  let applied = inputs.map((i) => i.checked);
  const active = (states) => {
    const verdicts = inputs.filter((i, k) => i.name === "verdict" && states[k]).length;
    const kind = inputs.find((i, k) => i.name === "kind" && states[k])?.value;
    return verdicts + (kind && kind !== "all" ? 1 : 0);
  };
  const results = () => {
    const v = inputs.filter((i) => i.name === "verdict" && i.checked).map((i) => ({ best: 268, not: 33, missing: 9 })[i.value]);
    const kind = inputs.find((i) => i.name === "kind" && i.checked)?.value;
    const n = v.length ? v.reduce((a, b) => a + b, 0) : total;
    return Math.round(n * ({ all: 1, tv: 0.8, film: 0.2 })[kind ?? "all"]);
  };
  const recount = () => {
    const n = results();
    apply.textContent = n ? `Show ${n} results` : "No results";
    apply.toggleAttribute("aria-disabled", n === 0);
  };
  const label = () => {
    const n = active(applied);
    $(".label", opener).textContent = n ? `Filters, ${n}` : "Filters";
    markActive(opener, n > 0);
    clearOut.hidden = n === 0;
  };
  d.addEventListener("change", recount);
  $("[data-sheet-clear]", d).addEventListener("click", () => {
    for (const i of inputs) i.checked = i.name === "kind" && i.value === "all";
    recount();
  });
  d.addEventListener("close", () => {
    if (d.returnValue === "apply" && !apply.hasAttribute("aria-disabled")) {
      applied = inputs.map((i) => i.checked);
      toast({ kind: "info", title: `Showing ${results()} results` });
    } else inputs.forEach((i, k) => (i.checked = applied[k]));
    d.returnValue = "";
    label();
    recount();
  });
  apply.addEventListener("click", (e) => apply.hasAttribute("aria-disabled") && e.preventDefault());
  clearOut.addEventListener("click", () => {
    for (const i of inputs) i.checked = i.name === "kind" && i.value === "all";
    applied = inputs.map((i) => i.checked);
    label();
    recount();
    opener.focus();
    say("Filters cleared");
  });
  label();
  recount();
}

// The first sync's phase line moves on with it (a demo clock).
for (const host of $$("[data-first-sync]")) {
  const bar = $("progress", host);
  const phase = $(".g-sync-phase", host);
  setInterval(() => {
    const next = Number(bar.value) + 7;
    if (next > Number(bar.max)) {
      bar.value = 0;
    } else bar.value = next;
    phase.textContent = `Series ${bar.value} of ${bar.max}`;
  }, 900);
}

// A date range: a quick range fills both dates, a typed date clears it, and
// an end before the start is an error on the end.
for (const box of $$("[data-range]")) {
  const [from, to] = $$("input[type='date']", box);
  const err = document.getElementById(to.getAttribute("aria-describedby"));
  const iso = (d) => d.toISOString().slice(0, 10);
  const check = () => {
    const bad = from.value && to.value && to.value < from.value;
    to.toggleAttribute("aria-invalid", Boolean(bad));
    if (bad) to.setAttribute("aria-invalid", "true");
    err.hidden = !bad;
  };
  const preset = (v) => {
    const today = new Date();
    to.value = v === "all" ? "" : iso(today);
    from.value = v === "all" ? "" : iso(new Date(today.getTime() - (Number(v) - 1) * 86400000));
    check();
  };
  box.addEventListener("change", (e) => {
    if (e.target.name === "range-preset") preset(e.target.value);
    else if (e.target.type === "date") {
      for (const r of $$("[name='range-preset']", box)) r.checked = false;
      $(".cp-segmented", box).dispatchEvent(new Event("change"));
      check();
    }
  });
  preset($("[name='range-preset']:checked", box)?.value ?? "7");
}

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

// The filter panel's button counts its filters and takes the accent while
// any is on; Clear ends them, and the panel's Show names what it shows.
for (const pop of $$("[data-filter-panel]")) {
  const btn = document.querySelector(`[popovertarget="${pop.id}"]:not([popovertargetaction])`);
  const boxes = $$("input[type='checkbox']", pop);
  const show = $("[data-panel-show]", pop);
  const update = () => {
    const n = boxes.filter((b) => b.checked).length;
    $(".g-badge", btn).textContent = String(n);
    $(".g-badge", btn).hidden = n === 0;
    btn.setAttribute("aria-label", n ? `Filters, ${n} on` : "Filters");
    markActive(btn, n > 0);
    show.textContent = n ? `Show ${[0, 33, 42, 51][n]}` : "Show all 412";
  };
  pop.addEventListener("change", update);
  $("[data-panel-clear]", pop).addEventListener("click", () => {
    for (const b of boxes) b.checked = false;
    update();
  });
  update();
}


// ===================================================== motion helpers
// Heights glide in script, so every engine animates them: CSS can take a
// height to auto only where interpolate-size ships.
const glideMs = () => (reduced() ? 0 : 240);
function glideHeight(node, from, to, done) {
  // fill:forwards holds the end height until the caller commits open/closed;
  // without it the close animation reverts to the still-open natural height
  // for one frame before open=false, which reads as a jump back then a delay.
  const run = node.animate([{ blockSize: `${from}px`, overflow: "clip" }, { blockSize: `${to}px`, overflow: "clip" }], { duration: glideMs(), easing: "cubic-bezier(0.2, 0, 0, 1)", fill: "forwards" });
  run.onfinish = () => {
    done?.();
    run.cancel();
  };
  return run;
}

// A details opens and closes by gliding its height, the group's others
// closing as one opens; the open state flips after a close, so the content
// stays drawn while it shrinks.
function glideDetails(d) {
  const sum = $("summary", d);
  let run = null;
  // Exclusivity is managed here, not by the browser's <details name> group:
  // while a sibling is gliding shut it is still open, and restoring the
  // clicked panel's name made the native group force-close the just-opened
  // one, so a second click only closed the first. Lift the name and group in
  // JS by its original value instead.
  const group = d.getAttribute("name");
  if (group) {
    d.removeAttribute("name");
    d.dataset.group = group;
  }
  const shut = (x, after) => {
    const from = x.getBoundingClientRect().height;
    const to = $("summary", x).getBoundingClientRect().height;
    x.dataset.closing = "";
    x.glide?.cancel();
    x.glide = glideHeight(x, from, to, () => {
      delete x.dataset.closing;
      x.open = false;
      after?.();
    });
  };
  sum.addEventListener("click", (e) => {
    e.preventDefault();
    if (d.open && d.dataset.closing === undefined) return shut(d);
    const from = d.getBoundingClientRect().height;
    delete d.dataset.closing;
    d.glide?.cancel();
    const now = d.dataset.group;
    if (now) {
      for (const o of $$(`details[data-group="${now}"]`)) if (o !== d && o.open) shut(o);
    }
    d.open = true;
    const to = d.getBoundingClientRect().height;
    d.glide = glideHeight(d, from, to);
  });
  void run;
}
for (const d of $$("details")) glideDetails(d);

// An accordion's mode: One at a time groups its sections, so opening one
// closes the others; Any number lets each open on its own. Switching to one
// at a time keeps the first open section and closes the rest.
for (const mode of $$("[data-acc-mode]")) {
  const sections = $$("details", document.getElementById(mode.dataset.accMode));
  const group = sections[0]?.dataset.group ?? "acc";
  mode.addEventListener("change", (e) => {
    const one = e.target.value === "one";
    for (const s of sections) {
      if (one) s.dataset.group = group;
      else delete s.dataset.group;
    }
    if (one) for (const s of sections.filter((x) => x.open).slice(1)) $("summary", s).click();
  });
}

// A bar that appears or leaves pushes the content under it, so it glides
// open and shut instead of jumping.
function glideShow(node, show) {
  if (show === !node.hidden) return;
  if (show) {
    node.hidden = false;
    const to = node.getBoundingClientRect().height;
    node.animate([{ blockSize: "0px", opacity: 0, overflow: "clip" }, { blockSize: `${to}px`, opacity: 1, overflow: "clip" }], { duration: glideMs(), easing: "cubic-bezier(0.2, 0, 0, 1)" });
  } else {
    const from = node.getBoundingClientRect().height;
    node.animate([{ blockSize: `${from}px`, opacity: 1, overflow: "clip" }, { blockSize: "0px", opacity: 0, overflow: "clip" }], { duration: glideMs(), easing: "cubic-bezier(0.4, 0, 1, 1)" }).onfinish = () => (node.hidden = true);
  }
}
for (const bar of $$("[data-batch]")) {
  // the batch script toggles hidden; this turns each toggle into a glide
  let shown = !bar.hidden;
  new MutationObserver(() => {
    const now = !bar.hidden;
    if (now === shown) return;
    shown = now;
    bar.hidden = !now;
    glideShow(bar, now);
  }).observe(bar, { attributes: true, attributeFilter: ["hidden"] });
}

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
  const hold = btn.closest('[data-col="actions"]') ?? (btn.hasAttribute("data-footprint") ? btn : null);
  // a split button's main action holds its widest word, so its caret never moves
  const fixed = btn.closest(".g-btngroup");
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
    const w = fixed ? widest() : now.scrollWidth;
    roll.style.inlineSize = `${w}px`;
    if (hold && !fixed) btn.style.marginInlineEnd = `${Math.max(measure(idle), done.scrollWidth, measure(btn.dataset.busyWords ?? idle)) - w}px`;
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
