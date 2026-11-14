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
    const { root, video, play } = await pane();
    await userEvent.click(play);
    await expect.poll(() => video.paused).toBe(false);
    await expect.poll(() => play.getAttribute("aria-label")).toBe("Pause");
    expect(root.hasAttribute("data-cp-playing")).toBe(true);
    video.pause();
    await expect.poll(() => play.getAttribute("aria-label")).toBe("Play");
    expect(root.hasAttribute("data-cp-playing")).toBe(false);
    await expect
      .poll(() => play.querySelector(".cp-icon")?.getAttribute("data-cp-icon"))
      .toBe("play");
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
    handle.load(await sample());
    await expect.poll(() => handle.position).toBeCloseTo(7.5, 1);
    handle.load(await sample(), 3);
    await expect.poll(() => handle.position).toBeCloseTo(3, 1);
  });

  it("marks a source that fails and turns its controls off", async () => {
    const { root, video, play, seek, handle } = await pane();
    handle.load(objectUrl(new Blob(["not a video"], { type: "video/webm" })));
    await expect.poll(() => root.hasAttribute("data-cp-error")).toBe(true);
    expect(video.error).not.toBeNull();
    expect([play.disabled, seek.disabled]).toEqual([true, true]);
    expect(root.hasAttribute("aria-busy")).toBe(false);
  });

  it("gives back the native controls and the cues' own times once its signal aborts", async () => {
    const { root, video, handle } = await pane();
    await expect.poll(() => cues(video).length).toBe(2);
    handle.offset = 2;
    life.abort();
    expect(video.controls).toBe(true);
    expect(root.querySelector('[data-part="bar"]')).toBeNull();
    expect(cues(video).map((c) => [c.startTime, c.endTime])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
