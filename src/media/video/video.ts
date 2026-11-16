/**
 * video.ts — `enhanceVideo()` puts the library's controls under a native
 * `<video>`: play and pause, a seek bar with the current and total time, and
 * one caption track whose cues an offset moves, the showing caption redrawn
 * at once.
 * @module
 */

import { until, whenAborted } from "../../core/lifetime/lifetime.js";

export interface VideoWords {
  /** The play button's name. Default "Play". */
  readonly play?: string;
  /** The play button's name while the video plays. Default "Pause". */
  readonly pause?: string;
  /** The seek bar's name. Default "Seek". */
  readonly seek?: string;
}

export interface VideoOptions {
  /** Removes the bar and the listeners, and gives back the native controls
   *  and each caption's own times; after it aborts, setting `offset` and
   *  `load()` do nothing. */
  readonly signal?: AbortSignal;
  /** Seconds added to every caption's times. Default 0. */
  readonly offset?: number;
  /** Seconds an arrow key moves the seek bar. Default 5. */
  readonly step?: number;
  readonly words?: VideoWords;
}

export interface Video {
  /** Seconds added to every caption's times; setting it moves every cue and
   *  redraws the showing caption. A value that is not finite is ignored. */
  offset: number;
  /** The video's current time, in seconds. */
  readonly position: number;
  /** Loads `src`, such as a MediaSource object URL, and moves to `at`
   *  seconds once its metadata loads; a video that was playing carries on, a
   *  paused one stays paused. Default `at`: where the video is now. A call
   *  made before an earlier call's source has loaded its metadata, or after
   *  it failed, replaces that call's move and takes over its playback and,
   *  by default, its `at`. */
  load(src: string, at?: number): void;
}

const ERROR = "data-cp-error";

/** m:ss, or h:mm:ss from an hour. */
function clock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const s = String(t % 60).padStart(2, "0");
  const m = Math.floor(t / 60) % 60;
  const h = Math.floor(t / 3600);
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${s}` : `${String(m)}:${s}`;
}

const isCaption = (t: TextTrack): boolean => t.kind === "subtitles" || t.kind === "captions";

/** The times a cue takes for `start` and `end`, never below 0, or undefined
 *  for a start that is not finite, which throws, or a NaN end. An unbounded
 *  end is a cue's own (`endTime` is an unrestricted double). */
function cueTimes(start: number, end: number): readonly [number, number] | undefined {
  const from = Math.max(0, start);
  const to = Math.max(0, end);
  return Number.isFinite(from) && !Number.isNaN(to) ? [from, to] : undefined;
}

/** Moves `cue`, which is in `track`, and returns the times it now has. A cue
 *  moved in place keeps its old slot in Gecko's active list, so it goes out
 *  and back in, which also reruns the engine's choice of the showing cue
 *  while the video is paused (pinned by the test "moves every cue by the
 *  offset and redraws the showing caption while paused", red in Firefox
 *  without it). */
function place(
  track: TextTrack,
  cue: TextTrackCue,
  start: number,
  end: number,
): readonly [number, number] | undefined {
  const times = cueTimes(start, end);
  if (times === undefined) {
    return undefined;
  }
  track.removeCue(cue);
  [cue.startTime, cue.endTime] = times;
  TextTrack.prototype.addCue.call(track, cue);
  return times;
}

type Times = readonly [number, number];

const carries = (cue: TextTrackCue, [start, end]: Times): boolean =>
  cue.startTime === start && cue.endTime === end;

/** `root` is a `.cp-video` holding the `<video>`, which carries `controls`
 *  so a page with no script still plays it. */
export function enhanceVideo(root: HTMLElement, options: VideoOptions = {}): Video {
  const video = root.querySelector("video");
  if (video === null) {
    throw new Error("enhanceVideo: the root holds no <video>");
  }
  const { signal } = options;
  const listen = until(signal);
  const words = { play: "Play", pause: "Pause", seek: "Seek", ...options.words };
  const step = options.step ?? 5;
  let offset = Number.isFinite(options.offset) ? (options.offset ?? 0) : 0;
  const hadControls = video.controls;
  video.controls = false;

  const bar = document.createElement("div");
  bar.dataset["part"] = "bar";
  const play = document.createElement("button");
  play.type = "button";
  play.className = "cp-button";
  play.dataset["variant"] = "quiet";
  play.dataset["part"] = "play";
  const glyph = document.createElement("span");
  glyph.className = "cp-icon";
  glyph.setAttribute("aria-hidden", "true");
  play.append(glyph);
  const seek = document.createElement("input");
  seek.type = "range";
  seek.className = "cp-range";
  seek.min = "0";
  seek.step = "any";
  seek.value = "0";
  seek.setAttribute("aria-label", words.seek);
  const time = document.createElement("span");
  time.dataset["part"] = "time";
  bar.append(play, seek, time);
  root.append(bar);

  /** Each moved cue's own times and the times the module gave it. */
  const moved = new WeakMap<TextTrackCue, { readonly own: Times; readonly wrote: Times }>();
  /** A cue's own times: the kept ones while it carries what the module
   *  wrote, else the ones the app last gave it, since cue times are
   *  writable (https://html.spec.whatwg.org/multipage/media.html#texttrackcue). */
  const ownTimes = (cue: TextTrackCue): Times => {
    const m = moved.get(cue);
    return m !== undefined && carries(cue, m.wrote) ? m.own : [cue.startTime, cue.endTime];
  };
  let held = false;
  let busy = video.readyState < HTMLMediaElement.HAVE_METADATA && video.currentSrc !== "";

  const total = (): number => {
    if (Number.isFinite(video.duration)) {
      return video.duration;
    }
    // A source has no seekable range before its metadata, and WebKit's
    // GStreamer backend (Linux) loses the duration of a source whose
    // `seekable` is read then: it reports 0 and refuses seeks (measured; the
    // test "keeps the duration and place of each source it loads" pins it).
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      return Number.NaN;
    }
    const n = video.seekable.length;
    return n > 0 ? video.seekable.end(n - 1) : Number.NaN;
  };

  const drawButton = (): void => {
    const playing = !video.paused && !video.ended;
    const name = playing ? words.pause : words.play;
    play.setAttribute("aria-label", name);
    play.dataset["cpTip"] = name;
    glyph.dataset["cpIcon"] = busy ? "spinner-arc" : playing ? "pause" : "play";
    if (busy) {
      root.setAttribute("aria-busy", "true");
    } else {
      root.removeAttribute("aria-busy");
    }
  };

  /** Until the total is known the seek bar is marked unavailable, not
   *  disabled, so a focused bar keeps focus across `load()`. */
  const unknown = (): boolean => seek.getAttribute("aria-disabled") === "true";

  const drawTime = (at: number): void => {
    const end = total();
    const known = Number.isFinite(end) && end > 0;
    seek.disabled = root.hasAttribute(ERROR);
    if (known) {
      seek.removeAttribute("aria-disabled");
    } else {
      seek.setAttribute("aria-disabled", "true");
    }
    seek.max = known ? String(end) : "0";
    if (!held) {
      seek.value = String(at);
    }
    const share = known ? Math.min(1, Math.max(0, seek.valueAsNumber / end)) : 0;
    seek.style.setProperty("--cp-range-fill", `${String(share * 100)}%`);
    const now = clock(held ? seek.valueAsNumber : at);
    time.textContent = known ? `${now} / ${clock(end)}` : now;
    seek.setAttribute("aria-valuetext", known ? `${now} of ${clock(end)}` : now);
  };

  const draw = (): void => {
    drawButton();
    drawTime(video.currentTime);
  };

  const setBusy = (on: boolean): void => {
    busy = on;
    drawButton();
  };

  /** Marks a failed source and turns its controls off until `clearError`. */
  const showError = (): void => {
    root.setAttribute(ERROR, "");
    play.disabled = true;
    busy = false;
  };

  const clearError = (): void => {
    if (!root.hasAttribute(ERROR)) {
      return;
    }
    root.removeAttribute(ERROR);
    play.disabled = false;
    seek.disabled = false;
  };

  /** Failed `<source>` children fire `error` at each one, not at the video,
   *  and leave `video.error` null; after the last one the video has no
   *  source (https://html.spec.whatwg.org/multipage/media.html#concept-media-load-algorithm). */
  const sourcesFailed = (): boolean =>
    video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE &&
    video.querySelector(":scope > source") !== null;

  const seekTo = (at: number): void => {
    const end = total();
    video.currentTime = Math.max(0, Number.isFinite(end) ? Math.min(at, end) : at);
    drawTime(video.currentTime);
  };

  /** Tracks whose own `addCue` places a new cue at the offset. */
  const placing = new Set<TextTrack>();
  /** Tracks the module turned from disabled to showing, turned off again
   *  when they stop being the caption track. */
  const turnedOn = new Set<TextTrack>();
  /** Tracks that have been the caption track. A track is shown only the
   *  first time, so a track the app turns off stays off. */
  const seen = new WeakSet<TextTrack>();
  /** The cues the module moved in each track; a disabled track lists none. */
  const movedIn = new Map<TextTrack, Set<TextTrackCue>>();
  const record = (t: TextTrack, cue: TextTrackCue, own: Times, wrote: Times): void => {
    moved.set(cue, { own, wrote });
    const cues = movedIn.get(t) ?? new Set();
    movedIn.set(t, cues.add(cue));
  };
  /** Set by the teardown, or at once for a signal that has already aborted,
   *  so the captions are never moved after their times were given back. */
  let dead = signal?.aborted === true;

  /** The subtitles or captions track whose `<track>` is marked `default`. */
  const marked = (): TextTrack | undefined =>
    [...video.querySelectorAll<HTMLTrackElement>(":scope > track")].find(
      (e) => e.default && isCaption(e.track),
    )?.track;

  /** The track the captions use: a subtitles or captions track the app or
   *  the browser shows, else the one the module showed, else the marked one,
   *  else the first, else the first text track. */
  const captionTrack = (): TextTrack | undefined => {
    const tracks = [...video.textTracks];
    const captions = tracks.filter(isCaption);
    return (
      captions.find((t) => t.mode === "showing" && !turnedOn.has(t)) ??
      captions.find((t) => turnedOn.has(t)) ??
      marked() ??
      captions[0] ??
      tracks[0]
    );
  };

  /** Gives `t` back its cues' own times, its own `addCue` and its mode. */
  const release = (t: TextTrack): void => {
    for (const cue of movedIn.get(t) ?? []) {
      const m = moved.get(cue);
      // A cue the app retimed since the last move keeps the app's times.
      if (m === undefined || !carries(cue, m.wrote)) {
        continue;
      }
      if (cue.track === t && t.mode !== "disabled") {
        place(t, cue, ...m.own);
      } else {
        [cue.startTime, cue.endTime] = m.own;
      }
    }
    movedIn.delete(t);
    Reflect.deleteProperty(t, "addCue");
    placing.delete(t);
    if (turnedOn.delete(t)) {
      t.mode = "disabled";
    }
  };

  const applyOffset = (): void => {
    if (dead) {
      return;
    }
    // A track the app turned off since keeps the mode the app gave it.
    for (const t of [...turnedOn]) {
      if (t.mode !== "showing") {
        turnedOn.delete(t);
      }
    }
    const track = captionTrack();
    for (const t of [...placing]) {
      if (t !== track) {
        release(t);
      }
    }
    if (track === undefined) {
      return;
    }
    if (!seen.has(track)) {
      seen.add(track);
      if (track.mode === "disabled") {
        track.mode = "showing";
        turnedOn.add(track);
      }
    }
    if (!placing.has(track)) {
      placing.add(track);
      // A cue the app adds later, such as a MediaSource window's captions,
      // fires no event.
      track.addCue = (cue: TextTrackCue): void => {
        const own = ownTimes(cue);
        const times = cueTimes(own[0] + offset, own[1] + offset);
        if (times !== undefined) {
          [cue.startTime, cue.endTime] = times;
          record(track, cue, own, times);
        }
        TextTrack.prototype.addCue.call(track, cue);
      };
    }
    for (const cue of [...(track.cues ?? [])]) {
      const own = ownTimes(cue);
      const wrote = place(track, cue, own[0] + offset, own[1] + offset);
      if (wrote !== undefined) {
        record(track, cue, own, wrote);
      }
    }
  };

  play.addEventListener(
    "click",
    () => {
      if (video.paused || video.ended) {
        // A refused play() leaves the video paused, and the button says so.
        video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    },
    listen,
  );
  // `loadedmetadata` too: a <source> added after every one failed resumes the
  // selection with no `loadstart`, which Firefox does without `video.load()`
  // (https://html.spec.whatwg.org/multipage/media.html#concept-media-load-algorithm, "Waiting").
  for (const type of ["loadstart", "loadedmetadata"]) {
    video.addEventListener(type, clearError, listen);
  }
  for (const type of ["play", "pause", "ended", "emptied"]) {
    video.addEventListener(type, drawButton, listen);
  }
  for (const type of ["timeupdate", "durationchange", "loadedmetadata", "progress", "seeked"]) {
    video.addEventListener(
      type,
      () => {
        drawTime(video.currentTime);
      },
      listen,
    );
  }
  video.addEventListener(
    "loadstart",
    () => {
      setBusy(true);
    },
    listen,
  );
  video.addEventListener(
    "waiting",
    () => {
      setBusy(true);
    },
    listen,
  );
  for (const type of ["loadedmetadata", "loadeddata", "canplay", "playing", "seeked"]) {
    video.addEventListener(
      type,
      () => {
        setBusy(false);
      },
      listen,
    );
  }
  // A <source>'s error does not bubble, and a <track>'s is no failure of the video.
  video.addEventListener(
    "error",
    (e) => {
      if (e.target === video || (e.target instanceof HTMLSourceElement && sourcesFailed())) {
        showError();
        draw();
      }
    },
    until(signal, true),
  );

  seek.addEventListener(
    "pointerdown",
    () => {
      held = true;
    },
    listen,
  );
  for (const type of ["pointerup", "pointercancel"]) {
    document.addEventListener(
      type,
      () => {
        held = false;
      },
      listen,
    );
  }
  // A drag moves the fill and the time; the release seeks.
  seek.addEventListener(
    "input",
    () => {
      drawTime(unknown() ? video.currentTime : seek.valueAsNumber);
    },
    listen,
  );
  seek.addEventListener(
    "change",
    () => {
      if (unknown()) {
        drawTime(video.currentTime);
      } else {
        seekTo(seek.valueAsNumber);
      }
    },
    listen,
  );
  seek.addEventListener(
    "keydown",
    (e) => {
      if (unknown()) {
        return;
      }
      const back = seek.matches(":dir(rtl)") ? "ArrowRight" : "ArrowLeft";
      const forward = back === "ArrowLeft" ? "ArrowRight" : "ArrowLeft";
      const by: Record<string, number> = {
        [back]: -step,
        [forward]: step,
        ArrowDown: -step,
        ArrowUp: step,
      };
      let to: number | undefined;
      if (e.key in by) {
        to = video.currentTime + (by[e.key] ?? 0);
      } else if (e.key === "Home") {
        to = 0;
      } else if (e.key === "End") {
        to = total();
      }
      if (to !== undefined && Number.isFinite(to)) {
        e.preventDefault();
        seekTo(to);
      }
    },
    listen,
  );

  // A <track> element's cues arrive with its load, which does not bubble.
  root.addEventListener(
    "load",
    (e) => {
      if (e.target instanceof HTMLTrackElement) {
        applyOffset();
      }
    },
    until(signal, true),
  );
  // The browser picks which <track> shows in a task queued before the
  // track's `addtrack` (https://html.spec.whatwg.org/multipage/media.html#honor-user-preferences-for-automatic-text-track-selection),
  // so whether to show such a track is decided again after that pick.
  video.textTracks.addEventListener(
    "addtrack",
    (e) => {
      const fromMarkup = [...video.querySelectorAll<HTMLTrackElement>(":scope > track")].some(
        (el) => el.track === e.track,
      );
      if (fromMarkup && e.track !== null) {
        seen.delete(e.track);
      }
      applyOffset();
    },
    listen,
  );
  // `change` follows a mode the app or the browser sets.
  for (const type of ["removetrack", "change"]) {
    video.textTracks.addEventListener(type, applyOffset, listen);
  }

  // A closed pane stops the video where it is, so reopening carries on.
  const shown = new ResizeObserver(() => {
    if (!video.paused && !root.checkVisibility()) {
      video.pause();
    }
  });
  shown.observe(root);

  /** The move a load() makes once its source's metadata loads. */
  let pending:
    { readonly stop: AbortController; readonly from: number; readonly resume: boolean } | undefined;

  // A source that failed before this call has already fired its error.
  if (video.error !== null || sourcesFailed()) {
    showError();
  }
  applyOffset();
  draw();

  // After the setup, so a signal that has already aborted undoes it.
  whenAborted(signal, () => {
    dead = true;
    shown.disconnect();
    bar.remove();
    root.removeAttribute(ERROR);
    root.removeAttribute("aria-busy");
    video.controls = hadControls;
    for (const t of [...placing]) {
      release(t);
    }
  });

  return {
    get offset() {
      return offset;
    },
    set offset(value: number) {
      if (!dead && Number.isFinite(value)) {
        offset = value;
        applyOffset();
      }
    },
    get position() {
      return video.currentTime;
    },
    load(src: string, at?: number) {
      if (dead) {
        return;
      }
      // A pending load has already reset the element to paused at 0.
      const resume = pending?.resume ?? (!video.paused && !video.ended);
      const from = at ?? pending?.from ?? video.currentTime;
      // A source that failed or was replaced never fires loadedmetadata, so
      // its move would otherwise land on the next source.
      pending?.stop.abort();
      const stop = new AbortController();
      pending = { stop, from, resume };
      video.addEventListener(
        "loadedmetadata",
        () => {
          pending = undefined;
          // A seek to 0 on a fresh source would fire a needless `seeking`.
          if (from > 0) {
            seekTo(from);
          }
          if (resume) {
            video.play().catch(() => undefined);
          }
        },
        {
          once: true,
          signal: signal === undefined ? stop.signal : AbortSignal.any([signal, stop.signal]),
        },
      );
      video.src = src;
    },
  };
}
