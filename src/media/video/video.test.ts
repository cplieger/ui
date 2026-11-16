import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { enhanceVideo, type Video } from "./video.js";

// A 12-second clip the gallery already ships, fetched into a blob so the
// source is an object URL, as a MediaSource-fed pane's is.
const SAMPLE = new URL("../../../gallery/media/sample.webm", import.meta.url).href;
const VTT = [
  "WEBVTT",
  "",
  "00:00:01.000 --> 00:00:02.000",
  "One",
  "",
  "00:00:03.000 --> 00:00:04.000",
  "Two",
  "",
].join("\n");

let life = new AbortController();
const urls: string[] = [];

afterEach(() => {
  life.abort();
  life = new AbortController();
  document.body.replaceChildren();
  for (const url of urls.splice(0)) {
    URL.revokeObjectURL(url);
  }
});

function objectUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  urls.push(url);
  return url;
}

let clip: Blob | undefined;
async function sample(): Promise<string> {
  clip ??= await (await fetch(SAMPLE)).blob();
  return objectUrl(clip);
}

function trackElement(): HTMLTrackElement {
  const track = document.createElement("track");
  track.kind = "subtitles";
  track.srclang = "en";
  track.label = "English";
  track.default = true;
  track.src = objectUrl(new Blob([VTT], { type: "text/vtt" }));
  return track;
}

interface Pane {
  root: HTMLElement;
  video: HTMLVideoElement;
  play: HTMLButtonElement;
  seek: HTMLInputElement;
  time: HTMLElement;
  handle: Video;
}

async function pane(options: { step?: number; offset?: number } = {}): Promise<Pane> {
  const root = document.createElement("div");
  root.className = "cp-video";
  const video = document.createElement("video");
  video.controls = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.append(trackElement());
  root.append(video);
  document.body.append(root);
  const handle = enhanceVideo(root, { ...options, signal: life.signal });
  // The module's own loadeddata listener runs first, so the bar is drawn.
  const loaded = new Promise((resolve) => {
    video.addEventListener("loadeddata", resolve, { once: true });
  });
  handle.load(await sample());
  await loaded;
  const part = (name: string): HTMLElement =>
    root.querySelector(`[data-part="${name}"]`) as HTMLElement;
  return {
    root,
    video,
    play: part("play") as HTMLButtonElement,
    seek: root.querySelector("input.cp-range") as HTMLInputElement,
    time: part("time"),
    handle,
  };
}

function cues(video: HTMLVideoElement): TextTrackCue[] {
  return [...(video.textTracks[0]?.cues ?? [])];
}

// Registered after load(), so the module's own listener has seeked when this resolves.
function metadata(video: HTMLVideoElement): Promise<unknown> {
  return new Promise((resolve) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
  });
}

/** A pane with no source, holding a script-built subtitles track. */
function bare(): { root: HTMLElement; track: TextTrack } {
  const root = document.createElement("div");
  root.className = "cp-video";
  const video = document.createElement("video");
  root.append(video);
  document.body.append(root);
  return { root, track: video.addTextTrack("subtitles", "English", "en") };
}

/** A pane whose video lists one `<source>` that cannot play. */
function failingSources(): {
  root: HTMLElement;
  video: HTMLVideoElement;
  source: HTMLSourceElement;
} {
  const root = document.createElement("div");
  root.className = "cp-video";
  const video = document.createElement("video");
  video.controls = true;
  video.muted = true;
  const source = document.createElement("source");
  source.type = "video/webm";
  source.src = objectUrl(new Blob(["not a video"], { type: "video/webm" }));
  video.append(source);
  root.append(video);
  document.body.append(root);
  return { root, video, source };
}

function controls(root: HTMLElement): { play: HTMLButtonElement; seek: HTMLInputElement } {
  return {
    play: root.querySelector('[data-part="play"]') as HTMLButtonElement,
    seek: root.querySelector("input.cp-range") as HTMLInputElement,
  };
}

/** Two subtitle languages from markup, the second marked `default`. */
function twoLanguages(): {
  root: HTMLElement;
  video: HTMLVideoElement;
  en: TextTrack;
  ja: TextTrack;
} {
  const root = document.createElement("div");
  root.className = "cp-video";
  const video = document.createElement("video");
  const en = trackElement();
  en.default = false;
  const ja = trackElement();
  ja.srclang = "ja";
  ja.label = "日本語";
  video.append(en, ja);
  root.append(video);
  document.body.append(root);
  return { root, video, en: en.track, ja: ja.track };
}

/** Resolves once `count` addtrack events fired, by when the browser has made
 *  its own pick of a <track> to show. */
function addedTracks(video: HTMLVideoElement, count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    video.textTracks.addEventListener("addtrack", () => {
      left -= 1;
      if (left === 0) {
        resolve();
      }
    });
  });
}

/** Script-built subtitles tracks, each disabled and holding one cue at `at`. */
function disabledTracks(...at: number[]): { root: HTMLElement; tracks: TextTrack[] } {
  const { root, track } = bare();
  const video = root.querySelector("video") as HTMLVideoElement;
  const tracks = at.map((start, i) => {
    const t = i === 0 ? track : video.addTextTrack("subtitles", `Track ${String(i)}`, "en");
    t.mode = "disabled";
    t.addCue(new VTTCue(start, start + 1, String(start)));
    return t;
  });
  return { root, tracks };
}

const times = (track: TextTrack): number[][] =>
  [...(track.cues ?? [])].map((c) => [c.startTime, c.endTime]);

// Gecko's VTTCue refuses an unbounded end; the spec's unrestricted double allows it.
const unbounded = ((): boolean => {
  try {
    return new VTTCue(1, Infinity, "").endTime === Infinity;
  } catch {
    return false;
  }
})();

async function playingAt(video: HTMLVideoElement, play: HTMLButtonElement, at: number) {
  await seeked(video, at);
  await userEvent.click(play);
  await expect.poll(() => video.paused).toBe(false);
}

async function seeked(video: HTMLVideoElement, at: number): Promise<void> {
  const done = new Promise((resolve) => {
    video.addEventListener("seeked", resolve, { once: true });
  });
  video.currentTime = at;
  await done;
}

describe("enhanceVideo", () => {
  it("swaps the native controls for its bar and shows both times of a blob source", async () => {
    const { video, seek, time, play } = await pane();
    expect(video.controls).toBe(false);
    await expect.poll(() => time.textContent).toBe("0:00 / 0:12");
    expect(seek.getAttribute("aria-label")).toBe("Seek");
    expect(seek.getAttribute("aria-valuetext")).toBe("0:00 of 0:12");
    expect(seek.max).toBe(String(video.duration));
    expect([play.getAttribute("aria-label"), play.dataset["cpTip"]]).toEqual(["Play", "Play"]);
    expect(play.querySelector(".cp-icon")?.getAttribute("data-cp-icon")).toBe("play");
  });

  it("plays and pauses from its button, and follows the host's own calls", async () => {
    const { video, play } = await pane();
    await userEvent.click(play);
    await expect.poll(() => video.paused).toBe(false);
    await expect.poll(() => play.getAttribute("aria-label")).toBe("Pause");
    video.pause();
    await expect.poll(() => play.getAttribute("aria-label")).toBe("Play");
    await expect
      .poll(() => play.querySelector(".cp-icon")?.getAttribute("data-cp-icon"))
      .toBe("play");
  });

  it("says Play once the video ends", async () => {
    const { video, play } = await pane();
    await seeked(video, video.duration - 0.3);
    const ended = new Promise((resolve) => {
      video.addEventListener("ended", resolve, { once: true });
    });
    await userEvent.click(play);
    await ended;
    expect(play.getAttribute("aria-label")).toBe("Play");
    expect(play.querySelector(".cp-icon")?.getAttribute("data-cp-icon")).toBe("play");
  });

  it("is busy while a new source loads, and rests once its metadata loads", async () => {
    const { root, video, play, handle } = await pane();
    const glyph = (): string | null | undefined =>
      play.querySelector(".cp-icon")?.getAttribute("data-cp-icon");
    expect(root.hasAttribute("aria-busy")).toBe(false);
    const started = new Promise((resolve) => {
      video.addEventListener(
        "loadstart",
        () => {
          resolve([root.getAttribute("aria-busy"), glyph()]);
        },
        { once: true },
      );
    });
    handle.load(await sample());
    expect(await started).toEqual(["true", "spinner-arc"]);
    await metadata(video);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(glyph()).toBe("play");
  });

  it("seeks on release, never while a pointer drags", async () => {
    const { video, seek, time } = await pane();
    seek.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    seek.value = "6";
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    expect(video.currentTime).toBe(0);
    expect(time.textContent).toBe("0:06 / 0:12");
    await seeked(video, 2);
    expect(seek.valueAsNumber, "a held seek bar keeps the dragged value").toBe(6);
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    seek.dispatchEvent(new Event("change", { bubbles: true }));
    expect(video.currentTime).toBeCloseTo(6, 1);
    await expect.poll(() => seek.getAttribute("aria-valuetext")).toBe("0:06 of 0:12");
  });

  it("seeks by keys, by its step, to either end, and mirrored right to left", async () => {
    const { root, video, seek } = await pane({ step: 2 });
    seek.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(video.currentTime).toBeCloseTo(2, 1);
    await userEvent.keyboard("{ArrowUp}");
    expect(video.currentTime).toBeCloseTo(4, 1);
    await userEvent.keyboard("{ArrowDown}");
    expect(video.currentTime).toBeCloseTo(2, 1);
    await userEvent.keyboard("{End}");
    expect(video.currentTime).toBeCloseTo(video.duration, 1);
    await userEvent.keyboard("{Home}");
    expect(video.currentTime).toBe(0);
    root.dir = "rtl";
    await userEvent.keyboard("{ArrowLeft}");
    expect(video.currentTime).toBeCloseTo(2, 1);
    await expect.poll(() => seek.getAttribute("aria-valuetext")).toBe("0:02 of 0:12");
  });

  it("moves every cue by the offset and redraws the showing caption while paused", async () => {
    const { video, handle } = await pane();
    await expect.poll(() => cues(video).length).toBe(2);
    const track = video.textTracks[0] as TextTrack;
    expect(track.mode).toBe("showing");
    await seeked(video, 2.5);
    await expect.poll(() => track.activeCues?.length).toBe(0);
    handle.offset = 1;
    expect(handle.offset).toBe(1);
    expect(cues(video).map((c) => [c.startTime, c.endTime])).toEqual([
      [2, 3],
      [4, 5],
    ]);
    await expect.poll(() => (track.activeCues?.[0] as VTTCue | undefined)?.text).toBe("One");
    handle.offset = -2;
    expect(cues(video).map((c) => c.startTime)).toEqual([0, 1]);
    await expect.poll(() => track.activeCues?.length).toBe(0);
  });

  it("ignores an offset that is not a finite number, keeping every cue in place", async () => {
    const { video, handle } = await pane();
    await expect.poll(() => cues(video).length).toBe(2);
    handle.offset = 1;
    // The nudge stepper's text for one second earlier, read without its minus.
    expect(() => {
      handle.offset = Number("\u22121.00");
    }).not.toThrow();
    expect(handle.offset).toBe(1);
    expect(cues(video).map((c) => [c.startTime, c.endTime])).toEqual([
      [2, 3],
      [4, 5],
    ]);
    handle.offset = -0.5;
    expect(cues(video).map((c) => [c.startTime, c.endTime])).toEqual([
      [0.5, 1.5],
      [2.5, 3.5],
    ]);
  });

  it("moves a cue the app adds after the offset is set, and leaves later ones once it aborts", () => {
    const { root, track } = bare();
    const handle = enhanceVideo(root, { offset: 1, signal: life.signal });
    track.addCue(new VTTCue(1, 2, "One"));
    expect(times(track)).toEqual([[2, 3]]);
    handle.offset = 2;
    track.addCue(new VTTCue(5, 6, "Two"));
    expect(times(track)).toEqual([
      [3, 4],
      [7, 8],
    ]);
    life.abort();
    expect(times(track)).toEqual([
      [1, 2],
      [5, 6],
    ]);
    track.addCue(new VTTCue(9, 10, "Three"));
    expect(times(track).at(-1)).toEqual([9, 10]);
  });

  it("takes the times the app gives a cue it removes and adds again as its own", () => {
    const { root, track } = bare();
    enhanceVideo(root, { offset: 1, signal: life.signal });
    const cue = new VTTCue(1, 2, "One");
    track.addCue(cue);
    track.removeCue(cue);
    cue.startTime = 5;
    cue.endTime = 6;
    track.addCue(cue);
    expect(times(track)).toEqual([[6, 7]]);
  });

  it("takes the times the app gives a cue in place as its own, and keeps them once it aborts", () => {
    const { root, track } = bare();
    const handle = enhanceVideo(root, { offset: 1, signal: life.signal });
    const cue = new VTTCue(10, 11, "One");
    track.addCue(cue);
    expect(times(track)).toEqual([[11, 12]]);
    cue.startTime = 20;
    cue.endTime = 21;
    handle.offset = 2;
    expect(times(track)).toEqual([[22, 23]]);
    cue.startTime = 30;
    cue.endTime = 31;
    life.abort();
    expect(times(track)).toEqual([[30, 31]]);
  });

  it("leaves the captions alone under a signal that has already aborted", () => {
    const { root, track } = bare();
    track.addCue(new VTTCue(1, 2, "One"));
    const mode = track.mode;
    const handle = enhanceVideo(root, { offset: 1, signal: AbortSignal.abort() });
    expect(root.querySelector('[data-part="bar"]')).toBeNull();
    expect(times(track)).toEqual([[1, 2]]);
    expect(track.mode).toBe(mode);
    expect(Object.hasOwn(track, "addCue")).toBe(false);
    track.addCue(new VTTCue(5, 6, "Two"));
    handle.offset = 3;
    expect(times(track)).toEqual([
      [1, 2],
      [5, 6],
    ]);
  });

  it("moves no caption on an offset set after its signal aborts", () => {
    const { root, track } = bare();
    track.addCue(new VTTCue(1, 2, "One"));
    const handle = enhanceVideo(root, { offset: 1, signal: life.signal });
    expect(times(track)).toEqual([[2, 3]]);
    life.abort();
    handle.offset = 3;
    expect(times(track)).toEqual([[1, 2]]);
  });

  it("loads nothing on a load() after its signal aborts", async () => {
    const { video, handle } = await pane();
    const before = video.currentSrc;
    const next = await sample();
    life.abort();
    handle.load(next, 5);
    await new Promise((r) => setTimeout(r, 100));
    expect(video.currentSrc).toBe(before);
    expect(handle.position).toBe(0);
  });

  it("moves a script-built track created after it starts", async () => {
    const root = document.createElement("div");
    root.className = "cp-video";
    const video = document.createElement("video");
    root.append(video);
    document.body.append(root);
    enhanceVideo(root, { offset: 1, signal: life.signal });
    const added = new Promise((resolve) => {
      video.textTracks.addEventListener("addtrack", resolve, { once: true });
    });
    const track = video.addTextTrack("subtitles", "English", "en");
    track.addCue(new VTTCue(1, 2, "One"));
    await added;
    track.addCue(new VTTCue(3, 4, "Two"));
    expect(times(track)).toEqual([
      [2, 3],
      [4, 5],
    ]);
  });

  it.skipIf(!unbounded)("moves the start of a cue with no end", () => {
    const { root, track } = bare();
    track.addCue(new VTTCue(1, Infinity, "Live"));
    track.addCue(new VTTCue(3, 4, "Two"));
    const handle = enhanceVideo(root, { signal: life.signal });
    handle.offset = 2;
    expect(times(track)).toEqual([
      [3, Infinity],
      [5, 6],
    ]);
  });

  it("gives a replaced track the current offset", async () => {
    const { video, handle } = await pane({ offset: 0.5 });
    await expect.poll(() => cues(video)[0]?.startTime).toBe(1.5);
    handle.offset = 1;
    video.querySelector("track")?.remove();
    video.append(trackElement());
    await expect.poll(() => [...video.textTracks].at(-1)?.cues?.[0]?.startTime).toBe(2);
  });

  it("pauses where it is when its pane is hidden", async () => {
    const { root, video, play, handle } = await pane();
    await userEvent.click(play);
    await expect.poll(() => video.currentTime).toBeGreaterThan(0.2);
    root.hidden = true;
    await expect.poll(() => video.paused).toBe(true);
    const at = video.currentTime;
    expect(at).toBeGreaterThan(0.2);
    root.hidden = false;
    expect(handle.position).toBe(at);
  });

  it("starts a new source from where the old one was", async () => {
    const { video, handle } = await pane();
    await seeked(video, 7.5);
    const first = await sample();
    handle.load(first);
    await metadata(video);
    expect(video.currentSrc).toBe(first);
    expect(handle.position).toBeCloseTo(7.5, 1);
    handle.load(await sample(), 3);
    await metadata(video);
    expect(handle.position).toBeCloseTo(3, 1);
    expect(video.paused, "a paused video stays paused").toBe(true);
  });

  it("keeps the duration and place of each source it loads", async () => {
    const { video, handle } = await pane();
    for (const at of [3, 4, 5, 6, 7]) {
      // The bar draws on the progress a source reports before its metadata.
      video.addEventListener(
        "loadstart",
        () => {
          video.dispatchEvent(new Event("progress"));
        },
        { once: true },
      );
      handle.load(await sample(), at);
      await metadata(video);
      expect(video.duration, "the clip lasts 12.008 s").toBeCloseTo(12, 0);
      expect(handle.position).toBeCloseTo(at, 1);
    }
  });

  it("carries on playing a video that was playing when a new source loads", async () => {
    const { video, play, handle } = await pane();
    await userEvent.click(play);
    await expect.poll(() => video.currentTime).toBeGreaterThan(0.2);
    handle.load(await sample());
    await metadata(video);
    await expect.poll(() => video.paused).toBe(false);
    await expect.poll(() => play.getAttribute("aria-label")).toBe("Pause");
  });

  it("keeps a replaced load()'s place and playback for the call that replaced it", async () => {
    const { video, play, handle } = await pane();
    await playingAt(video, play, 1);
    const [a, b] = [await sample(), await sample()];
    handle.load(a, 4);
    handle.load(b);
    await metadata(video);
    expect(video.currentSrc).toBe(b);
    await expect.poll(() => video.paused).toBe(false);
    expect(handle.position).toBeGreaterThanOrEqual(4);
    expect(handle.position).toBeLessThan(5);
  });

  it("resumes the place and playback a failed source had on the next load()", async () => {
    const { root, video, play, handle } = await pane();
    await playingAt(video, play, 3);
    handle.load(objectUrl(new Blob(["not a video"], { type: "video/webm" })));
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    const at = handle.position;
    handle.load(await sample());
    await metadata(video);
    await expect.poll(() => video.paused).toBe(false);
    expect(handle.position).toBeGreaterThanOrEqual(3);
    expect(handle.position).toBeLessThan(4);
    expect(at, "the failed source reset the element").toBeLessThan(3);
  });

  it("drops the move of a source a later load() replaced before its metadata", async () => {
    const { video, handle } = await pane();
    const [a, b] = [await sample(), await sample()];
    handle.load(a, 8);
    handle.load(b, 0);
    await metadata(video);
    expect(video.currentSrc).toBe(b);
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.position).toBe(0);
  });

  it("drops the move of a source that failed, so the next one starts where it asks", async () => {
    const { root, video, handle } = await pane();
    handle.load(objectUrl(new Blob(["not a video"], { type: "video/webm" })), 9);
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    handle.load(await sample(), 0);
    await metadata(video);
    await new Promise((r) => setTimeout(r, 50));
    expect(handle.position).toBe(0);
  });

  it("keeps focus on a focused seek bar while a new source loads", async () => {
    const { video, seek, handle } = await pane();
    const next = await sample();
    seek.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(handle.position).toBeCloseTo(5, 1);
    handle.load(next, 8);
    await metadata(video);
    await new Promise((r) => setTimeout(r, 50));
    expect(document.activeElement).toBe(seek);
    expect(handle.position).toBeCloseTo(8, 1);
    expect(seek.hasAttribute("aria-disabled")).toBe(false);
  });

  it("marks the seek bar unavailable, focusable and still, until the total is known", async () => {
    const root = document.createElement("div");
    root.className = "cp-video";
    root.append(document.createElement("video"));
    document.body.append(root);
    const { position } = enhanceVideo(root, { signal: life.signal });
    expect(position).toBe(0);
    const seek = root.querySelector("input.cp-range") as HTMLInputElement;
    expect([seek.disabled, seek.getAttribute("aria-disabled")]).toEqual([false, "true"]);
    seek.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(seek);
    expect((root.querySelector("video") as HTMLVideoElement).currentTime).toBe(0);
  });

  it("marks a source that fails and turns its controls off", async () => {
    const { root, video, play, seek, handle } = await pane();
    handle.load(objectUrl(new Blob(["not a video"], { type: "video/webm" })));
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    expect(video.error).not.toBeNull();
    expect([play.disabled, seek.disabled]).toEqual([true, true]);
    expect(root.hasAttribute("aria-busy")).toBe(false);
  });

  it("marks a source that failed before it starts, and clears the mark once a source loads", async () => {
    const root = document.createElement("div");
    root.className = "cp-video";
    const video = document.createElement("video");
    video.controls = true;
    root.append(video);
    document.body.append(root);
    const failed = new Promise((resolve) => {
      video.addEventListener("error", resolve, { once: true });
    });
    video.src = objectUrl(new Blob(["not a video"], { type: "video/webm" }));
    await failed;
    const handle = enhanceVideo(root, { signal: life.signal });
    const play = root.querySelector('[data-part="play"]') as HTMLButtonElement;
    const seek = root.querySelector("input.cp-range") as HTMLInputElement;
    expect(root.hasAttribute("data-cp-error")).toBe(true);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect(play.querySelector(".cp-icon")?.getAttribute("data-cp-icon")).toBe("play");
    expect([play.disabled, seek.disabled]).toEqual([true, true]);
    handle.load(await sample());
    await metadata(video);
    expect(root.hasAttribute("data-cp-error")).toBe(false);
    expect([play.disabled, seek.disabled]).toEqual([false, false]);
  });

  it("marks a video whose every <source> fails, enhanced before the failure", async () => {
    const { root } = failingSources();
    enhanceVideo(root, { signal: life.signal });
    const { play, seek } = controls(root);
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect([play.disabled, seek.disabled]).toEqual([true, true]);
  });

  it("marks a video whose every <source> failed before it starts", async () => {
    const { root, video, source } = failingSources();
    await new Promise((resolve) => {
      source.addEventListener("error", resolve, { once: true });
    });
    await expect.poll(() => video.networkState).toBe(HTMLMediaElement.NETWORK_NO_SOURCE);
    expect(video.error).toBeNull();
    enhanceVideo(root, { signal: life.signal });
    const { play, seek } = controls(root);
    expect(root.hasAttribute("data-cp-error")).toBe(true);
    expect(root.hasAttribute("aria-busy")).toBe(false);
    expect([play.disabled, seek.disabled]).toEqual([true, true]);
  });

  it("clears the mark once the app adds a <source> and calls load()", async () => {
    const { root, video, source } = failingSources();
    enhanceVideo(root, { signal: life.signal });
    await new Promise((resolve) => {
      source.addEventListener("error", resolve, { once: true });
    });
    await expect.poll(() => video.networkState).toBe(HTMLMediaElement.NETWORK_NO_SOURCE);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(video.networkState, "the failure has settled").toBe(HTMLMediaElement.NETWORK_NO_SOURCE);
    expect(root.hasAttribute("data-cp-error")).toBe(true);
    const next = document.createElement("source");
    next.type = "video/webm";
    next.src = await sample();
    video.append(next);
    const loaded = metadata(video);
    video.load();
    await loaded;
    const { play, seek } = controls(root);
    expect(root.hasAttribute("data-cp-error")).toBe(false);
    expect([play.disabled, seek.disabled]).toEqual([false, false]);
  });

  it("turns the controls back on as a new source starts loading", async () => {
    const { root, video, source } = failingSources();
    const handle = enhanceVideo(root, { signal: life.signal });
    await new Promise((resolve) => {
      source.addEventListener("error", resolve, { once: true });
    });
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    const { play, seek } = controls(root);
    const started = new Promise((resolve) => {
      video.addEventListener(
        "loadstart",
        () => {
          resolve([root.hasAttribute("data-cp-error"), play.disabled, seek.disabled]);
        },
        { once: true },
      );
    });
    handle.load(await sample());
    expect(await started).toEqual([false, false, false]);
  });

  it("draws the seek bar from a mark that clears on loadedmetadata", async () => {
    const { root, video } = failingSources();
    enhanceVideo(root, { signal: life.signal });
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    video.dispatchEvent(new Event("loadedmetadata"));
    const { play, seek } = controls(root);
    expect(root.hasAttribute("data-cp-error")).toBe(false);
    expect([play.disabled, seek.disabled]).toEqual([false, false]);
  });

  it("leaves a playing video unmarked when its caption file fails", async () => {
    const { root, video } = await pane();
    const track = trackElement();
    URL.revokeObjectURL(track.src);
    const failed = new Promise((resolve) => {
      track.addEventListener("error", resolve, { once: true });
    });
    video.querySelector("track")?.remove();
    video.append(track);
    await failed;
    expect(root.hasAttribute("data-cp-error")).toBe(false);
    expect(controls(root).play.disabled).toBe(false);
  });

  it("shows one of two caption languages when it starts as their markup goes in", async () => {
    const { root, en, ja } = twoLanguages();
    const handle = enhanceVideo(root, { signal: life.signal });
    handle.load(await sample());
    handle.offset = 2;
    const showing = (): TextTrack[] => [en, ja].filter((t) => t.mode === "showing");
    await expect.poll(() => showing().map((t) => t.cues?.[0]?.startTime)).toEqual([3]);
  });

  it("moves the default of two languages alone, and gives every mode back once it aborts", async () => {
    const { root, video, en, ja } = twoLanguages();
    await addedTracks(video, 2);
    const before = [en.mode, ja.mode];
    const handle = enhanceVideo(root, { signal: life.signal });
    handle.load(await sample());
    handle.offset = 2;
    await expect.poll(() => ja.cues?.[0]?.startTime).toBe(3);
    const cue = ja.cues?.[0] as TextTrackCue;
    expect([en.mode, ja.mode]).toEqual(["disabled", "showing"]);
    life.abort();
    expect([en.mode, ja.mode]).toEqual(before);
    expect([cue.startTime, cue.endTime]).toEqual([1, 2]);
  });

  it("follows the track the app shows, and turns off the one it showed", async () => {
    const {
      root,
      tracks: [a, b],
    } = disabledTracks(1, 5);
    enhanceVideo(root, { offset: 1, signal: life.signal });
    expect([a?.mode, b?.mode]).toEqual(["showing", "disabled"]);
    expect(times(a as TextTrack)).toEqual([[2, 3]]);
    const cue = a?.cues?.[0] as TextTrackCue;
    (b as TextTrack).mode = "showing";
    await expect.poll(() => times(b as TextTrack)).toEqual([[6, 7]]);
    expect(a?.mode).toBe("disabled");
    expect([cue.startTime, cue.endTime]).toEqual([1, 2]);
  });

  it("leaves off a track the app turns off, and gives back its own times while it is off", async () => {
    const {
      root,
      tracks: [a],
    } = disabledTracks(1);
    const track = a as TextTrack;
    const list = (root.querySelector("video") as HTMLVideoElement).textTracks;
    const changed = (): Promise<unknown> =>
      new Promise((resolve) => {
        list.addEventListener("change", resolve, { once: true });
      });
    const handle = enhanceVideo(root, { offset: 1, signal: life.signal });
    expect(track.mode).toBe("showing");
    const cue = track.cues?.[0] as TextTrackCue;
    let change = changed();
    track.mode = "disabled";
    await change;
    handle.offset = 2;
    expect(track.mode).toBe("disabled");
    change = changed();
    track.mode = "showing";
    await change;
    expect([cue.startTime, cue.endTime]).toEqual([3, 4]);
    change = changed();
    track.mode = "disabled";
    await change;
    life.abort();
    expect(track.mode).toBe("disabled");
    expect([cue.startTime, cue.endTime]).toEqual([1, 2]);
  });

  it("gives back a track's own times once another becomes the caption track", async () => {
    const root = document.createElement("div");
    root.className = "cp-video";
    const video = document.createElement("video");
    root.append(video);
    document.body.append(root);
    const chapters = video.addTextTrack("chapters", "Chapters", "en");
    chapters.addCue(new VTTCue(1, 2, "Opening"));
    enhanceVideo(root, { offset: 1, signal: life.signal });
    expect(times(chapters)).toEqual([[2, 3]]);
    const added = new Promise((resolve) => {
      video.textTracks.addEventListener("addtrack", resolve, { once: true });
    });
    const subtitles = video.addTextTrack("subtitles", "English", "en");
    subtitles.addCue(new VTTCue(5, 6, "One"));
    await added;
    expect(times(chapters)).toEqual([[1, 2]]);
    expect(times(subtitles)).toEqual([[6, 7]]);
    chapters.addCue(new VTTCue(3, 4, "Middle"));
    expect(times(chapters).at(-1)).toEqual([3, 4]);
    life.abort();
    expect(times(chapters)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(times(subtitles)).toEqual([[5, 6]]);
  });

  it("gives back the native controls and the cues' own times once its signal aborts", async () => {
    const { root, video, handle } = await pane();
    await expect.poll(() => cues(video).length).toBe(2);
    const own = cues(video);
    handle.offset = 2;
    life.abort();
    expect(video.controls).toBe(true);
    expect(root.querySelector('[data-part="bar"]')).toBeNull();
    // The cues themselves: a track the module showed is disabled again and lists none.
    expect(own.map((c) => [c.startTime, c.endTime])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
