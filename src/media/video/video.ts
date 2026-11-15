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
   *  and each caption's own times. */
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

/** The track the captions show on: the first subtitles or captions track,
 *  else the first text track. */
function captionTrack(video: HTMLVideoElement): TextTrack | undefined {
  const tracks = [...video.textTracks];
  return tracks.find((t) => t.kind === "subtitles" || t.kind === "captions") ?? tracks[0];
}

/** The times a cue takes for `start` and `end`, never below 0, or undefined
 *  for a start that is not finite, which throws, or a NaN end. An unbounded
 *  end is a cue's own (`endTime` is an unrestricted double). */
function cueTimes(start: number, end: number): readonly [number, number] | undefined {
  const from = Math.max(0, start);
  const to = Math.max(0, end);
  return Number.isFinite(from) && !Number.isNaN(to) ? [from, to] : undefined;
}

/** Moves `cue`, which is in `track`. A cue moved in place keeps its old slot
 *  in Gecko's active list, so it goes out and back in, which also reruns the
 *  engine's choice of the showing cue while the video is paused (pinned by
 *  the test "moves every cue by the offset and redraws the showing caption
 *  while paused", red in Firefox without it). */
function place(track: TextTrack, cue: TextTrackCue, start: number, end: number): void {
  const times = cueTimes(start, end);
  if (times === undefined) {
    return;
  }
  track.removeCue(cue);
  [cue.startTime, cue.endTime] = times;
  TextTrack.prototype.addCue.call(track, cue);
}

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

  // Each cue's own times, kept the first time an offset moves it.
  const own = new WeakMap<TextTrackCue, readonly [number, number]>();
  let held = false;
  let busy = video.readyState < HTMLMediaElement.HAVE_METADATA && video.currentSrc !== "";

  const total = (): number => {
    if (Number.isFinite(video.duration)) {
      return video.duration;
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

  const seekTo = (at: number): void => {
    const end = total();
    video.currentTime = Math.max(0, Number.isFinite(end) ? Math.min(at, end) : at);
    drawTime(video.currentTime);
  };

  /** Tracks whose own `addCue` places a new cue at the offset. */
  const placing = new Set<TextTrack>();

  const applyOffset = (): void => {
    const track = captionTrack(video);
    if (track === undefined) {
      return;
    }
    if (track.mode === "disabled") {
      track.mode = "showing";
    }
    if (!placing.has(track)) {
      placing.add(track);
      // A cue the app adds later, such as a MediaSource window's captions,
      // fires no event.
      track.addCue = (cue: TextTrackCue): void => {
        const [start, end] = own.get(cue) ?? [cue.startTime, cue.endTime];
        own.set(cue, [start, end]);
        const times = cueTimes(start + offset, end + offset);
        if (times !== undefined) {
          [cue.startTime, cue.endTime] = times;
        }
        TextTrack.prototype.addCue.call(track, cue);
      };
    }
    for (const cue of [...(track.cues ?? [])]) {
      const [start, end] = own.get(cue) ?? [cue.startTime, cue.endTime];
      own.set(cue, [start, end]);
      place(track, cue, start + offset, end + offset);
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
      root.removeAttribute(ERROR);
      play.disabled = false;
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
  video.addEventListener(
    "error",
    () => {
      root.setAttribute(ERROR, "");
      play.disabled = true;
      setBusy(false);
      drawTime(video.currentTime);
    },
    listen,
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
  video.textTracks.addEventListener("addtrack", applyOffset, listen);

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

  whenAborted(signal, () => {
    shown.disconnect();
    bar.remove();
    root.removeAttribute(ERROR);
    root.removeAttribute("aria-busy");
    video.controls = hadControls;
    const track = captionTrack(video);
    for (const cue of [...(track?.cues ?? [])]) {
      const times = own.get(cue);
      if (track !== undefined && times !== undefined) {
        place(track, cue, ...times);
      }
    }
    for (const t of placing) {
      Reflect.deleteProperty(t, "addCue");
    }
  });

  applyOffset();
  draw();

  return {
    get offset() {
      return offset;
    },
    set offset(value: number) {
      if (Number.isFinite(value)) {
        offset = value;
        applyOffset();
      }
    },
    get position() {
      return video.currentTime;
    },
    load(src: string, at?: number) {
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
