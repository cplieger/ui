# video

`@cplieger/ui/video`

A video under the library's controls: play and pause, a seek bar with the current and total time, and one caption track whose times an offset moves, the caption on screen redrawn the moment the offset changes. It suits a preview pane, such as checking a subtitle's timing against the picture.

```html
<div class="cp-video">
  <video controls playsinline preload="metadata">
    <track kind="subtitles" src="/api/preview/subtitle?id=12" srclang="en" label="English" default>
  </video>
</div>
```

```ts
import { enhanceVideo } from "@cplieger/ui/video";

const video = enhanceVideo(pane, { signal: page.signal });
video.load(URL.createObjectURL(mediaSource));
offsetField.addEventListener("change", () => {
  // A signed stepper writes a typographic minus, which Number() refuses.
  video.offset = Number(offsetField.value.replace("\u2212", "-"));
});
```

- The markup plays with no script, under the browser's own controls. `enhanceVideo` turns those off and adds its bar: a quiet play and pause button named "Play" or "Pause", a `.cp-range` seek bar named "Seek" that says "0:03 of 0:12", and the times as "0:03 / 0:12", from an hour as "1:02:03". Until the total is known, the bar shows the current time alone and the seek bar is marked unavailable with `aria-disabled`: it stays still and keeps focus, so a person seeking by keys keeps their place while a new source loads.
- The button follows the video's own `play`, `pause` and `ended`, so a call to `video.play()` from the app keeps it right. While the video waits for data, the pane is `aria-busy` and the button's glyph turns. When the source fails, or every `<source>` the video lists does, before `enhanceVideo()` runs or after, the pane takes `data-cp-error` and the button and the seek bar turn off. The app says why beside it, in a `.cp-notice`. The mark goes and the controls come back once a new source starts loading: the handle's `load()`, or `video.load()` after the app changes the `<source>` list. Chromium and WebKit load a `<source>` added after every one failed only once `video.load()` runs.
- Dragging the seek bar moves its fill and time, and the release seeks. Left and right, swapped right to left, and down and up move by `step` seconds, 5 by default. Home and End go to either end.
- The captions use the `subtitles` or `captions` track that is showing, the browser's pick or the app's, else the one whose `<track>` is marked `default`, else the first, else the first text track. The first time a disabled track becomes the caption track, the module shows it. That track stays the caption track until the app or the browser shows another, and the module turns it off again then or when the signal aborts. A track the app turns off stays off, and a track the app shows takes the offset. `offset` adds its seconds to every caption's own times, never below 0, and the caption on screen changes at once, paused or playing. A value that is not a finite number, such as `Number()` of a text it cannot read, leaves the offset and every caption as they were. A track the app replaces takes the current offset once its cues load, and a cue the app adds with `addCue()`, such as a window of captions fed beside a MediaSource, takes it as it is added. A cue's own times are the ones the app last gave it: a cue the app retimes, in its track or out of it, takes the offset from its new times. A track that stops being the caption track, as an earlier `chapters` track does once a `subtitles` track is added, gets its cues' own times back.
- The browser draws the captions itself, so they keep the person's own caption settings. With its own controls off, a browser puts a caption it places on the picture's bottom edge, so the pane lifts each such caption `--cp-space-3` above that edge, at any size and in full screen. In Chromium and Safari the caption area moves up only while every caption on screen is placed by the browser, so a caption the browser places stays on the edge while one the app placed shows beside it. In Firefox each such cue of the caption track gets a `line` that ends that far above the edge, and its own `line`, `snapToLines` and `lineAlign` come back when the cue is removed, when its track stops being the caption track and when the signal aborts. A cue the app gives a line, such as `line = 0` for the top, stays where the app put it.
- When the pane stops being shown, such as a closed tab panel or a `hidden` ancestor, the video pauses where it is. `load(src, at)` loads a new source and moves to `at` seconds once its metadata loads, by default where the video is now, so a stream the app starts again on reopening carries on from the same place. A video that was playing plays on, and a paused one stays paused. Each `load()` replaces the one before it, so a source that failed or was replaced moves nothing itself. A `load()` made while an earlier call's source is still loading, or after it failed, as a Retry is, keeps that call's playback and, with no `at` of its own, goes where that call was going.
- `words` names the button and the seek bar in the app's words: `{ play, pause, seek }`.
- `signal` removes the bar and the listeners, and gives back the browser's controls and each caption's own times and line. After it aborts, setting `offset` and calling `load()` do nothing, and under a signal that has already aborted the captions are never moved.

## A stream fed by MediaSource

The module never fetches. The app owns the stream: it sets `mediaSource.duration` to the item's length, so the bar spans the whole item, and places each part it appends at its time in the item with `sourceBuffer.timestampOffset`. A seek outside what is buffered fires the video's `seeking`, where the app starts its fetch again from `video.currentTime`.

```ts
const source = new MediaSource();
video.load(URL.createObjectURL(source), 0);
source.addEventListener("sourceopen", () => {
  source.duration = item.seconds;
  const buffer = source.addSourceBuffer('video/webm; codecs="vp9,opus"');
  stream(buffer, 0);
});
pane.querySelector("video")?.addEventListener("seeking", (e) => {
  restartStreamAt((e.target as HTMLVideoElement).currentTime);
});
```
