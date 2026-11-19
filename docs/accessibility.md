# Accessibility

This page is the accessibility bar that every part of `@cplieger/ui` is built and reviewed against. It names the standards ui follows, how ui meets each criterion and how each one is tested. Read it before you build or review an element, a screen or a gallery card, and cite the criterion by its heading here.

## The bar

- The floor is [WCAG 2.2](https://www.w3.org/TR/WCAG22/) at Level AA. Each custom widget also follows its pattern in the [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/) for its keys, name, role and states.
- Each WCAG 2.2 AAA criterion is adopted unless it does not apply to an app interface or would harm another group of people. Of the 31 AAA criteria, 30 are adopted and 1 does not apply: [1.2.9](#129-audio-only-live) Audio-only (live), because ui ships no live audio.
- Each requirement of the [WCAG 3.0 Working Draft of 10 September 2026](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/) that is stricter than WCAG 2.2, testable on an app interface and never in conflict with WCAG 2.2 is adopted. A later draft that drops one does not remove it while it still helps people. WCAG 3 is a draft, so ui claims no WCAG 3 conformance.
- Native HTML comes first. Anything a person must perceive goes through native HTML or [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/). A WAI-ARIA 1.3 feature is used only as an addition whose absence loses nothing, and only where published results show it works in each browser and screen reader pairing. [ARIA](#aria) has the evidence.
- An addition that makes a screen reader say more without telling the person more is refused. That covers a duplicate name, a description that repeats the name, and ARIA that restates what the HTML element already says. This page calls it the noise rule.
- Contrast uses the WCAG 2 ratios, as [Contrast](#contrast) explains.

Automated checks find only part of the problems, so the [axe check](#the-axe-check) is the floor and the [checks by hand](#checks-by-hand) cover the rest.

## Sources

- [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/), W3C Recommendation of 12 December 2024, also published as ISO/IEC 40500:2025. Each criterion below links its Understanding page.
- [WCAG 3.0](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/), W3C Working Draft of 10 September 2026. Every requirement in it has the status Developing.
- [WAI-ARIA 1.2](https://www.w3.org/TR/wai-aria-1.2/), W3C Recommendation.
- [WAI-ARIA 1.3](https://www.w3.org/TR/wai-aria-1.3/), W3C Working Draft of 4 June 2026, and its [Editor's Draft](https://w3c.github.io/aria/).
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/), for each widget's keyboard and naming model.
- [a11ysupport.io](https://a11ysupport.io/), the [ARIA-AT test results](https://aria-at.w3.org/) and WebAIM's [Up and Coming ARIA](https://webaim.org/blog/up-and-coming-aria/) of 30 May 2025, for support in each browser and screen reader pairing.
- [axe-core 4.13.0](https://github.com/dequelabs/axe-core/tree/v4.13.0), the rule engine of the axe check.

## How to read the criteria

Each criterion below starts with its level or type, the ruling and who meets it:

- `Met by ui` means a ui element or the stylesheet meets it, whatever the app writes.
- `Met by the app` means the app's own content, words or server meet it, and this page states the app's duty.
- `Met by ui and the app` means both share it.

The list under each criterion says how it is tested:

- `axe` names the rules of the [axe check](#the-axe-check) that test it.
- `Unit` names the unit or browser tests in `src/`.
- `SVG text` names the [SVG text check](#the-svg-text-check), the axe check's own measure of text inside SVG.
- `Manual` names the [checks by hand](#checks-by-hand), with the gallery pages they cover.

## Where ui falls short

These adopted criteria are not fully met yet, and one item is a default the bar sets beyond its criterion. Each item says what falls short, what the bar requires and the elements whose fix closes it.

- [1.4.6 Contrast (enhanced)](#146-contrast-enhanced): Secondary text and ink on a solid hold 7:1 only when the operating system asks for more contrast, and not every platform offers that setting. The bar requires a contrast choice in the page, beside the theme choice, with three values: follow the system, more and standard. More applies what `prefers-contrast: more` applies, and standard overrides a system that asks for more. Owed by `foundations/colour` and `core/theme`.
- [1.4.8 Visual presentation](#148-visual-presentation): The criterion is met through its Note 1, since the person's own paragraph spacing applies. The bar asks more of ui's default: prose paragraphs are 33.7px top to top at the 14px body size, 2.41 times the font size, and the bar requires at least 2.5 times, a paragraph gap of at least 0.95em. Owed by `content/prose`.
- [2.5.5 Target size (enhanced)](#255-target-size-enhanced): A mouse user gets 32px controls and 24px targets and cannot ask for 44px. The bar requires a stored choice of larger targets, with the values follow the device and larger, that gives every control the touch sizes while hover keeps working. On the touch sizes each icon segment stays 36px wide, a Copy button attached to its machine text is 42px tall, a chosen value's remove button is 40px, and a toast's buttons are 26px and 28px tall, and the bar requires 44px. Owed by `core/theme`, `core/pointer`, `forms/segmented`, `forms/copy`, `forms/tokens` and `feedback/toast`.
- [2.3.3 Animation from interactions](#233-animation-from-interactions): Under reduced motion a filter chip's check still grows for 220ms and the drop zone's icon still moves for 300ms. A chosen value typed again only shakes, so under reduced motion nothing shows it was refused. The bar requires every glide to take the short duration and every cue to have a still form. Owed by `buttons/filter-chip`, `forms/file` and `forms/tokens`.
- [2.4.6 Headings and labels](#246-headings-and-labels): A stepper whose value is a button that resets it, such as a zoom, names that button only by its value, so pressing 90% gives 100% with nothing saying so. The bar requires the button to say what it does, in a tip the description carries, such as Reset to 100%. Owed by `forms/stepper`.
- [4.1.3 Status messages](#413-status-messages): A toast is put in the page as a live region that already holds its words, which some browser and screen-reader pairings do not speak. A field of chosen values drops a value typed again with nothing said. The bar requires a toast's words to reach a live region that was already in the page, once, and the refusal to be said. Owed by `feedback/toast` and `forms/tokens`.
- [2.5.8 Target size (minimum)](#258-target-size-minimum): When a feed row wraps its lines, its summary is one line tall and under 24px from the row's other targets. In a context panel's list, links one word long sit on consecutive lines under 24px apart. The bar requires each target to be 24px, or to keep 24px of spacing from the next. Owed by `data/feed` and `layout/context-panel`.
- [2.5.3 Label in name](#253-label-in-name): The account button is named Account while it shows the person's initials, so a voice user who says the initials reaches nothing. WCAG 3 2.3.5.5 asks the same. The bar requires the name to contain the visible words, or the initials to be hidden from the name as a picture of the person. Owed by `navigation/account`.
- [4.1.2 Name, role, value](#412-name-role-value): A list row's cut line takes focus so a keyboard and a tap reach its full text, but it is a `span` with no role, which a screen reader announces as nothing. WCAG 3 2.3.5.6 and 2.12.1.1 ask the same. A key shown for copying takes focus as a scroll region with no role and no name, even when it fits. A finished upload's row takes focus with no role and no name when its Retry leaves. The bar requires each focus stop to have a role and a name: the cut line becomes a button named by the whole line, the key takes focus only while it overflows, as a region named by its field's label, and the upload's row is a group named by its file and its state. Owed by `data/list-row`, `forms/copy` and `forms/file`.
- [1.4.13 Content on hover or focus](#1413-content-on-hover-or-focus): The tooltip hides when the pointer leaves its control, so the pointer cannot move onto the tip, and Escape pressed while a tip still waits out its rest lets it appear. WCAG 3 2.4.5.2 asks for the same hoverable tip. The bar requires the tip to stay while the pointer is over the control or the tip, to hide when it leaves both, and Escape to cancel a tip that has not appeared yet. Owed by `overlays/tooltip`.
- [2.5.6 Concurrent input mechanisms](#256-concurrent-input-mechanisms): A tooltip marked to toggle on a tap, such as an info button's, shows on the finger's press and hides as the same touch leaves the control after its lift, so a tap never shows it and its words are out of reach by touch. The bar requires a tap to show the tip, and a second tap or a tap elsewhere to hide it. Owed by `overlays/tooltip`.
- [2.4.13 Focus appearance](#2413-focus-appearance): A menu item with focus, and the option the arrows reach in a combobox's list, a select panel or the palette, are marked only by the selected wash, which differs from the overlay surface by 1.2:1 in light and 1.1:1 in dark, with no ring. WCAG 3 2.3.1.2 and 2.3.1.3 ask the same. The bar requires the reached row to change by at least 3:1 over at least a 2px perimeter, as every other focused control does. Owed by `overlays/menu`, `forms/combobox`, `overlays/select-panel` and `overlays/palette`.
- [2.4.3 Focus order](#243-focus-order): A toast that leaves while it holds focus, after its Undo or its Dismiss is pressed by key, drops focus to the page. The bar requires focus to move to the next toast's button, else back to the control that was focused before. Owed by `feedback/toast`.
- [WCAG 3 2.2.2.3](#2223-numerical-metadata-available): A relative time shows its exact date and time under a mouse only: a time takes no focus and no tap, so a keyboard or touch user who sees "8 minutes ago" cannot see when that was. The bar requires the exact time to be reachable by keyboard and by touch too. Owed by `data/relative-time`.
- [2.4.12 Focus not obscured (enhanced)](#2412-focus-not-obscured-enhanced): No stylesheet sets `scroll-padding` for the sticky header, the foot bar or the status line. The bar requires that no part of a focused control sits under them. Owed by `layout/app-frame`.
- [3.2.5 Change on request](#325-change-on-request): Markdown output opens web links in a new tab and the link does not say so, which WCAG 3 2.12.5.3 also asks. The bar requires the link's name to say it opens a new tab. Owed by `content/markdown`.
- [WCAG 3 2.6.1.4](#2614-no-visual-motion-no-exceptions): The loader moves for as long as its work runs, and under reduced motion the loader and the refresh line pulse for as long. The bar requires each to stop within 5 seconds on a whole cycle, at a still frame, as the spinners and the skeleton do, while its words keep saying the work runs. Until then their motion past 5 seconds is a trigger under WCAG 3 2.6.1.5, which the bar meets by removing it, never by a warning. Owed by `feedback/loader` and `feedback/loading-region`.
- [WCAG 3 2.1.5.5, 2.1.5.6, 2.1.6.7, 2.1.6.8, 2.12.4.3 and 2.12.4.4](#2155-caption-language-adjustable): The video bar has play, seek and time only. The bar requires a captions button that turns the track on and off, a choice of captions track and a chapter list from a `chapters` track. Where the engine exposes `audioTracks`, it also requires a choice of audio track. Owed by `media/video`.
- [WCAG 3 2.1.5.1](#2151-captions-adjustable): The video's `::cue` rule sets the caption colour, background and font, which can override the person's caption settings. The bar requires the person's caption settings to win. Owed by `media/video`.
- [3.3.2 Labels or instructions](#332-labels-or-instructions): A pair of fields, such as a path mapping, names each field by a hidden label and shows that name only as a placeholder, which goes once the field holds a value. WCAG 3 2.3.5.2 asks the same. The bar requires each field's name to stay on screen as its label. Owed by `forms/pairs`.
- [WCAG 3 2.12.5.1](#21251-change-of-content-notified): Removing a rule from a sentence editor says nothing, and the save bar's count is not said when it appears or changes. The bar requires a list that loses a member and a count that changes to be said politely. Owed by `forms/rules` and `layout/settings`.
- [WCAG 3 2.4.1.5](#2415-no-keyboard-conflicts): The palette's Ctrl+K takes the browser's own Ctrl+K on Windows and Linux, and the person cannot change it. The bar requires a stored shortcut map in which the person can change or turn off each shortcut, with a row for each on the settings page. The palette's default stays Ctrl+K, or Command+K on a Mac. Owed by `overlays/palette` and `overlays/keys`.

## WCAG 2.2 criteria

WCAG 2.2 has 86 success criteria: 31 at Level A, 24 at AA and 31 at AAA. Criterion 4.1.1 Parsing is obsolete and is not listed. Of the 86, 84 are adopted and 2 do not apply. Criterion 2.2.3 No timing is adopted with an exception for the recovery page and the passkey ceremony, whose time limits protect every account.

### 1.1.1 Non-text content

Level A. Adopted. Met by ui and the app. [Understanding 1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html)

An icon is decorative (`aria-hidden`) and the control holding it carries the name. Every icon-only control, link and tab has an accessible name and a tooltip with the same words. A chart has a text alternative and a table view. An image's `alt` is the app's.

- axe: `image-alt`, `svg-img-alt`, `role-img-alt`, `input-image-alt`, `object-alt`, `aria-meter-name`, `aria-progressbar-name`, `image-redundant-alt`, `button-name`, `link-name`.
- Manual: tree names per gallery card.

### 1.2.1 Audio-only and video-only (prerecorded)

Level A. Adopted for media an app authors. Met by the app. [Understanding 1.2.1](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-and-video-only-prerecorded.html)

ui produces no media. Its video element plays the person's own library files, which the app neither authors nor can change. WCAG's statement of partial conformance for third-party content covers them. ui's part is that the player never hides a track the file carries and every control works by keyboard.

- Manual: the media cards (video: tracks, controls).

### 1.2.2 Captions (prerecorded)

Level A. Adopted for media an app authors. Met by ui and the app. [Understanding 1.2.2](https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html)

The video element shows the file's `captions` or `subtitles` track, the one marked `default` or else the first, and keeps it in sync under the offset. The person cannot yet turn it off or choose another track, which WCAG 3 asks for. [Where ui falls short](#where-ui-falls-short) has the shape. A third-party file without captions falls under WCAG's statement of partial conformance.

- axe: `video-caption`, its needs-review results checked by hand.
- Unit: src/media/video tests.
- Manual: the media cards.

### 1.2.3 Audio description or media alternative (prerecorded)

Level A. Adopted for media an app authors. Met by the app. [Understanding 1.2.3](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-or-media-alternative-prerecorded.html)

An app's own video ships an audio description or a text alternative beside it. ui adds nothing that blocks either.

- Manual: the media cards, where the gallery's sample has none.

### 1.2.4 Captions (live)

Level AA. Does not apply, because ui ships no live media element. [Understanding 1.2.4](https://www.w3.org/WAI/WCAG22/Understanding/captions-live.html)

The video element plays files only. An app that streams live media is out of ui's scope and owes live captions.

- Nothing to test, because ui has no live media.

### 1.2.5 Audio description (prerecorded)

Level AA. Adopted for media an app authors. Met by the app. [Understanding 1.2.5](https://www.w3.org/WAI/WCAG22/Understanding/audio-description-prerecorded.html)

As 1.2.3, at AA: an app's own prerecorded video has an audio description.

- Manual: the media cards.

### 1.2.6 Sign language (prerecorded)

Level AAA. Adopted for media an app authors. Met by the app. [Understanding 1.2.6](https://www.w3.org/WAI/WCAG22/Understanding/sign-language-prerecorded.html)

An app's own instructional video carries sign-language interpretation. Not reachable for the person's own library files, which the app cannot change (WCAG's conformance note: AAA cannot be met for some content).

- Manual: the media cards, where the gallery's sample has none.

### 1.2.7 Extended audio description (prerecorded)

Level AAA. Adopted for media an app authors. Met by the app. [Understanding 1.2.7](https://www.w3.org/WAI/WCAG22/Understanding/extended-audio-description-prerecorded.html)

An app's own video carries extended audio description where pauses are too short. Same reach as 1.2.6.

- Manual: the media cards.

### 1.2.8 Media alternative (prerecorded)

Level AAA. Adopted for media an app authors. Met by the app. [Understanding 1.2.8](https://www.w3.org/WAI/WCAG22/Understanding/media-alternative-prerecorded.html)

An app's own video carries a full text alternative (a transcript) beside it. Same reach as 1.2.6.

- Manual: the media cards.

### 1.2.9 Audio-only (live)

Level AAA. Does not apply, because ui ships no live audio. [Understanding 1.2.9](https://www.w3.org/WAI/WCAG22/Understanding/audio-only-live.html)

No ui element plays live audio.

- Nothing to test in ui.

### 1.3.1 Info and relationships

Level A. Adopted. Met by ui. [Understanding 1.3.1](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)

Native structure first: headings, lists, `table` with `th`, `scope` and `caption`, `fieldset` and `legend`, `label`, landmarks from `header`, `nav`, `main`, `aside`. A custom widget takes its APG pattern's ARIA 1.2 roles and states.

- axe: `list`, `listitem`, `definition-list`, `dlitem`, `th-has-data-cells`, `td-headers-attr`, `table-fake-caption`, `td-has-header`, `scope-attr-valid`, `empty-table-header`, `table-duplicate-name`, `heading-order`, `empty-heading`, `p-as-heading`, `page-has-heading-one`, `aria-required-children`, `aria-required-parent`, `aria-hidden-body`, `region`, `landmark-*`.
- Manual: the accessibility tree of each gallery card.

### 1.3.2 Meaningful sequence

Level A. Adopted. Met by ui. [Understanding 1.3.2](https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html)

Reading order is DOM order: no ui stylesheet reorders content with `order`, `*-reverse` or absolute placement of content. Logical properties mirror the layout under `dir="rtl"` without reordering the DOM.

- Manual: keyboard order against layout order per gallery card.
- Manual: a right-to-left pass per screen.

### 1.3.3 Sensory characteristics

Level A. Adopted. Met by ui and the app. [Understanding 1.3.3](https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html)

A state is a tinted fill, a glyph and a word. No ui instruction points at a shape, a colour or a place alone. An app's own instructions follow [Words on screen](design-patterns.md#words-on-screen).

- Manual: each gallery card.

### 1.3.4 Orientation

Level AA. Adopted. Met by ui. [Understanding 1.3.4](https://www.w3.org/WAI/WCAG22/Understanding/orientation.html)

Layout follows the window's width and the element's container, never the orientation. Nothing locks orientation.

- axe: `css-orientation-lock`.
- Manual: phone portrait 390x844 and landscape 844x390 per screen.

### 1.3.5 Identify input purpose

Level AA. Adopted. Met by ui and the app. [Understanding 1.3.5](https://www.w3.org/WAI/WCAG22/Understanding/identify-input-purpose.html)

Sign-in, set-up and account fields carry their `autocomplete` tokens (`username`, `current-password`, `new-password`, `webauthn`). An app's own fields about the person do the same.

- axe: `autocomplete-valid`.
- Manual: the sign-in, set-up and settings screens.

### 1.3.6 Identify purpose

Level AAA. Adopted. Met by ui. [Understanding 1.3.6](https://www.w3.org/WAI/WCAG22/Understanding/identify-purpose.html)

The purpose of regions comes from landmarks, of controls from native elements and `autocomplete`, and icons are decorative beside a named control, so a user agent can restyle or replace them.

- axe: `region`, `landmark-*`.
- Manual: the accessibility tree of each gallery card.

### 1.4.1 Use of color

Level A. Adopted. Met by ui. [Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)

Colour is never alone. A state has its glyph and word, and a link in text is underlined. A chart's series have a legend and the table view, and a selected row has a check and its ink.

- axe: `link-in-text-block`.
- Manual: forced colours and a greyscale screenshot per gallery card.

### 1.4.2 Audio control

Level A. Adopted. Met by ui. [Understanding 1.4.2](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)

Nothing plays on load: the video element is `preload="metadata"` with no `autoplay`.

- axe: `no-autoplay-audio`.
- Manual: the media cards.

### 1.4.3 Contrast (minimum)

Level AA. Adopted. Met by ui. [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

The stylesheet owns lightness. Every text pair holds 4.5:1 (primary text 7:1) for any seed in the envelope, in both themes ([Contrast](design-colour.md#contrast)).

- Unit: src/system/system-css.test.ts contrast tests over every hue.
- axe: `color-contrast` in light and dark at 1440 and 390, for text in HTML, since axe files text inside SVG as needs review.
- SVG text: each visible `svg text` against the pixels under its glyphs at 4.5:1, or 3:1 for large text, in every page, overlay and details state.

### 1.4.4 Resize text

Level AA. Adopted. Met by ui. [Understanding 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)

Type is set in rem from the person's root size. No container fixes a text height.

- axe: `meta-viewport`, `meta-viewport-large`.
- Manual: text-only 200% at 1280 per page.

### 1.4.5 Images of text

Level AA. Adopted. Met by ui. [Understanding 1.4.5](https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html)

Text is text. The wordmark's logotype is the criterion's own exception.

- Manual: each gallery card.

### 1.4.6 Contrast (enhanced)

Level AAA. Adopted, partly met, owed by `foundations/colour` and `core/theme`. Met by ui. [Understanding 1.4.6](https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html)

Primary text holds 7:1 on steps 1 to 3 at rest. Under `prefers-contrast: more` every text pair and ink on a solid holds 7:1. Secondary text and ink on a solid hold 4.5:1 at rest. WCAG lets a presentation the person chooses meet the criterion (technique G174). The operating system's contrast setting is not on every platform, so the page owes its own choice of more contrast. [Where ui falls short](#where-ui-falls-short) has the shape.

- Unit: contrast tests at rest and under `prefers-contrast: more`.
- axe: `color-contrast-enhanced` in the `contrast: more` state.
- SVG text: as 1.4.3 at 7:1, or 4.5:1 for large text, under `prefers-contrast: more`.

### 1.4.7 Low or no background audio

Level AAA. Adopted for media an app authors. Met by the app. [Understanding 1.4.7](https://www.w3.org/WAI/WCAG22/Understanding/low-or-no-background-audio.html)

The criterion covers prerecorded audio-only content that is mostly speech, not a video's soundtrack. An app's own such audio has no background sound, background sound at least 20 dB under the speech, or background sound the person can turn off. The video element, which plays an audio-only file too, blocks none of these. The person's library files are third-party content, which WCAG's statement of partial conformance covers.

- Manual: the media cards, where the gallery's sample has none.

### 1.4.8 Visual presentation

Level AAA. Adopted. Met by ui. [Understanding 1.4.8](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)

Colours are chosen by the person through the theme and forced colours. Prose stops at 68 characters. Text is start-aligned, never justified. Body leading 1.55 meets space-and-a-half (technique C21). The person's own paragraph spacing applies with no loss, which meets the criterion through its Note 1 (tested through 1.4.12). The bar goes further and asks ui's default to meet the values too. Prose paragraphs are 12px apart on a 21.7px line at the 14px body size, so the top of one paragraph's last line is 33.7px from the top of the next paragraph's first line. That is 2.41 times the font size, under the 2.5 times Understanding 1.4.8 describes, as [Where ui falls short](#where-ui-falls-short) records. Text at 200% reflows with no horizontal scroll.

- Manual: the content cards (prose measure, leading, paragraph gap), reflow per page.

### 1.4.9 Images of text (no exception)

Level AAA. Adopted. Met by ui. [Understanding 1.4.9](https://www.w3.org/WAI/WCAG22/Understanding/images-of-text-no-exception.html)

As 1.4.5. ui ships no image of text except the wordmark's logotype.

- Manual: each gallery card.

### 1.4.10 Reflow

Level AA. Adopted. Met by ui. [Understanding 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)

Nothing is wider than a 320px window and nothing is clipped. A list row's state and its own action wrap under its words when the three do not fit. A popover too tall for either side of its button, a combobox's list among them, shrinks into the room under or over it, across the row's whole width, and scrolls. A data table wider than its panel scrolls inside its own focusable region (two-dimensional content, the criterion's exception).

- Unit: the 320px tests in src/system/system-css.test.ts.
- Manual: 320x256 and 640x360 per page.
- axe: a 320px reflow assertion.

### 1.4.11 Non-text contrast

Level AA. Adopted. Met by ui. [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

A boundary holds 3:1 on steps 1 to 3 (4.5:1 under `prefers-contrast: more`), and the focus ring is the accent's step 9. Series slots hold 3:1 on every surface, and in forced colours every control keeps a system-colour border and rings in the system's highlight, a checkbox, a radio, a switch and a range too, which keep their own colours there. A skeleton's lines draw in GrayText there, so a region that loads never shows as an empty box.

- Unit: boundary and series contrast tests, the forced-colours ring of the controls that keep their own colours, and the skeleton's forced-colours fill.
- Manual: forced colours and a contrast check per gallery card.

### 1.4.12 Text spacing

Level AA. Adopted. Met by ui. [Understanding 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)

No text container has a fixed height or a clipping overflow. Boxes grow with their text.

- axe: `avoid-inline-spacing`.
- Manual: the WCAG text-spacing style per page, clipping and overlap per text node.

### 1.4.13 Content on hover or focus

Level AA. Adopted, partly met, owed by `overlays/tooltip`. Met by ui. [Understanding 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)

A tooltip shows on focus at once and on a pointer resting 500ms. Escape and blur hide a shown tip without moving focus, so it is dismissible and persistent. It hides as soon as the pointer leaves the control, so the pointer cannot move onto the tip, and Escape pressed while a tip still waits out its rest lets it appear, as [Where ui falls short](#where-ui-falls-short) records.

- Manual: the anchored overlay cards (tooltip, hover card).

### 2.1.1 Keyboard

Level A. Adopted. Met by ui. [Understanding 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)

Native controls first. Each composite widget implements its APG pattern's keys. A scroll region that holds no control is focusable.

- axe: `scrollable-region-focusable`, `nested-interactive`, `frame-focusable-content`, `server-side-image-map`, `accesskeys`.
- Manual: each gallery card's APG key table.

### 2.1.2 No keyboard trap

Level A. Adopted. Met by ui. [Understanding 2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html)

Only a modal `dialog` holds focus, and Escape closes it. A roving group leaves on Tab.

- Manual: Tab and Shift+Tab through every gallery card, every overlay open.

### 2.1.3 Keyboard (no exception)

Level AAA. Adopted. Met by ui. [Understanding 2.1.3](https://www.w3.org/WAI/WCAG22/Understanding/keyboard-no-exception.html)

Every action has a keyboard path with no timing. Reorder works by Move up and Move down or Alt with an arrow, a range by its keys, a chart through its keyboard explorer and table view, a drop zone by its file button.

- axe: `scrollable-region-focusable`.
- Manual: each gallery card's APG key table.

### 2.1.4 Character key shortcuts

Level A. Adopted. Met by ui. [Understanding 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html)

No ui module binds a shortcut of a character key alone. The palette opens with Ctrl or Command and a letter, and the composer sends with Ctrl or Command and Enter. Type-ahead runs only while its menu or list has focus (the criterion's exception).

- Manual: a search of every `keydown` handler, and the keyboard check.

### 2.2.1 Timing adjustable

Level A. Adopted. Met by ui and the app. [Understanding 2.2.1](https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html)

A passing toast lasts 7 seconds only when its result stays visible elsewhere, and pauses while hovered or focused. An error or a toast with an action stays until dismissed. Copy's 1.6-second word is also announced. Sign-in expiries are the server's.

- axe: `meta-refresh`.
- Unit: src/feedback/toast tests.
- Manual: the message cards.

### 2.2.2 Pause, stop, hide

Level A. Adopted. Met by ui. [Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)

No loop over 5 seconds runs beside other content. A spinner turns six times in 4.8 seconds and a skeleton beats twice in 3.2 seconds, then each rests. The loader and the refresh line still loop while their work runs, which is the essential case of the preload note in Understanding 2.2.2, and under reduced motion they pulse. A live dot's ring plays twice, 3.6 seconds. WCAG 3 asks more, as [Where ui falls short](#where-ui-falls-short) shows.

- axe: `blink`, `marquee`.
- Manual: reduced motion and a 5-second sample of `getAnimations()` per gallery card.

### 2.2.3 No timing

Level AAA. Adopted. Met by ui and the app. [Understanding 2.2.3](https://www.w3.org/WAI/WCAG22/Understanding/no-timing.html)

No ui element sets a time limit on an activity. The account flows' recovery page (15 minutes) and passkey ceremony expiry are the server's security limits. A recovery link that never expires is a standing credential that harms every account holder, so those two steps are excepted. Each says how to start again with nothing typed lost.

- Manual: the sign-in, set-up and settings screens.

### 2.2.4 Interruptions

Level AAA. Adopted. Met by ui. [Understanding 2.2.4](https://www.w3.org/WAI/WCAG22/Understanding/interruptions.html)

Nothing interrupts: arriving messages never move focus or scroll once the person has scrolled up, passing toasts are polite, only an error of the person's own action is assertive, and a banner never takes focus.

- axe: `meta-refresh-no-exceptions`.
- Manual: the message cards, the long list and log cards (live regions, feed).

### 2.2.5 Re-authenticating

Level AAA. Adopted. Met by ui and the app. [Understanding 2.2.5](https://www.w3.org/WAI/WCAG22/Understanding/re-authenticating.html)

The URL is the state, so after 'Your session ended. Sign in to continue.' the sign-in returns to the same view. An app keeps the person's unsaved input across the sign-in.

- Manual: the sign-in, set-up and settings screens.

### 2.2.6 Timeouts

Level AAA. Adopted. Met by the app. [Understanding 2.2.6](https://www.w3.org/WAI/WCAG22/Understanding/timeouts.html)

An app whose sessions can end on inactivity while a form holds unsaved input warns of the duration, or keeps the data for 20 hours. ui supplies the notice and the form's change guard.

- Manual: the sign-in, set-up and settings screens, where this page states the app's duty.

### 2.3.1 Three flashes or below threshold

Level A. Adopted. Met by ui. [Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)

Nothing flashes: a done fill flashes in once, and pulses run under once a second.

- Manual: a `getAnimations()` sample per gallery card.

### 2.3.2 Three flashes

Level AAA. Adopted. Met by ui. [Understanding 2.3.2](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html)

As 2.3.1, with no threshold allowance.

- Manual: a `getAnimations()` sample per gallery card.

### 2.3.3 Animation from interactions

Level AAA. Adopted, partly met, owed by `buttons/filter-chip`, `forms/file` and `forms/tokens`. Met by ui. [Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)

Under `prefers-reduced-motion: reduce` presses do not scale, springs ease out at the short duration, dialogs and added rows only fade and reordered items move at once ([Motion](design.md#motion)). Fades are not motion animation under this criterion. A choice's pill lands at once, and a confirming button held at one width keeps its width and its neighbours still in both settings. A filter chip's check and the drop zone's icon keep their full length under reduced motion, and a chosen value typed again only shakes, so under reduced motion nothing shows it.

- Unit: reduced-motion tests in src/system.
- Manual: reduced motion per gallery card.

### 2.4.1 Bypass blocks

Level A. Adopted. Met by ui. [Understanding 2.4.1](https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html)

The app frame starts with the skip link to `main` and every region is a landmark.

- axe: `bypass`, `region`, `skip-link`, `landmark-*`.
- Unit: skip link test in src/system/system-css.test.ts.

### 2.4.2 Page titled

Level A. Adopted. Met by ui and the app. [Understanding 2.4.2](https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html)

A route change sets `<title>` to the screen's name ([Navigation and the URL](design-patterns.md#navigation-and-the-url)).

- axe: `document-title`.
- Manual: the navigation cards.

### 2.4.3 Focus order

Level A. Adopted, partly met, owed by `feedback/toast`. Met by ui. [Understanding 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)

Focus follows the DOM. A modal dialog returns focus to its opener. A route change focuses the new screen's `h1`. A repaint that hides the focused control, such as a save bar's Discard once nothing waits, moves focus to the first field that held a change, never to the page. An item whose Retry leaves takes focus as a group named by the item and its new state. A toast that leaves while it holds focus drops focus to the page.

- axe: `tabindex`.
- Manual: keyboard order and focus after a route change.

### 2.4.4 Link purpose (in context)

Level A. Adopted. Met by ui. [Understanding 2.4.4](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html)

A link's words name its destination. An external link adds where it goes in a visually hidden span. An icon-only link carries its name.

- axe: `link-name`, `area-alt`.
- Manual: link names per gallery card.

### 2.4.5 Multiple ways

Level AA. Adopted. Met by the app. [Understanding 2.4.5](https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html)

An app reaches each screen from its header destinations and from the palette's Jump to anything or a search. ui supplies both.

- Manual: the header and status cards and the navigation cards, where this page states the app's duty.

### 2.4.6 Headings and labels

Level AA. Adopted, partly met, owed by `forms/stepper`. Met by ui and the app. [Understanding 2.4.6](https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html)

Each section has a heading and each control a label that names what it does. A stepper's value button that resets the value is named only by the value.

- axe: `empty-heading`, `label`, `page-has-heading-one`.
- Manual: each gallery card.

### 2.4.7 Focus visible

Level AA. Adopted. Met by ui. [Understanding 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)

Every `:focus-visible` element inside `.cp` draws a 2px outline at a 2px offset in the focus ring colour, and `Highlight` in forced colours.

- Unit: ring tests in src/system/system-css.test.ts, a narrow settings select's ring cut by no box round it among them.
- Manual: every focus stop.

### 2.4.8 Location

Level AAA. Adopted. Met by ui. [Understanding 2.4.8](https://www.w3.org/WAI/WCAG22/Understanding/location.html)

Breadcrumbs, the current destination's `aria-current` and the screen's title say where the person is.

- Manual: the navigation cards.

### 2.4.9 Link purpose (link only)

Level AAA. Adopted. Met by ui. [Understanding 2.4.9](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-link-only.html)

A link's own words name its purpose, without its sentence. Two links with the same words go to the same place.

- axe: `identical-links-same-purpose`.
- Manual: link text read alone per gallery card.

### 2.4.10 Section headings

Level AAA. Adopted. Met by ui and the app. [Understanding 2.4.10](https://www.w3.org/WAI/WCAG22/Understanding/section-headings.html)

Content and settings are organised under headings in order.

- axe: `heading-order`, `page-has-heading-one`.

### 2.4.11 Focus not obscured (minimum)

Level AA. Adopted. Met by ui. [Understanding 2.4.11](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html)

A focused control is never wholly under the sticky header, the foot bar, the status line, a toast or an open popover.

- Manual: `elementsFromPoint()` at the focused box's corners and centre per focus stop.

### 2.4.12 Focus not obscured (enhanced)

Level AAA. Adopted, partly met, owed by `layout/app-frame`. Met by ui. [Understanding 2.4.12](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html)

As 2.4.11 with no part hidden: the page scrolls a focused control clear of every sticky part. No ui stylesheet sets `scroll-padding` for the sticky parts yet, so a focused control may sit partly under one, as [Where ui falls short](#where-ui-falls-short) records.

- Manual: the 2.4.11 probe, where any covered corner fails.

### 2.4.13 Focus appearance

Level AAA. Adopted, partly met, owed by `overlays/menu`, `forms/combobox`, `overlays/select-panel` and `overlays/palette`. Met by ui. [Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)

The ring is a solid 2px outline at a 2px offset, so its area exceeds a 2px perimeter of the control, in the accent's step 9, which holds 3:1 against every surface at every hue and chroma. On the header the ring takes the shell's ink, because the light shell is the accent's own fill. Inside a split button, whose fill is the ring's colour, focus rings the whole split outside its shape and marks the focused part with an inset ring in the split's ink. A date or time field rings while focus is in it, because WebKit focuses one of its parts and the field never matches `:focus-visible`. A menu item with focus, and the option the arrows reach in a listbox, a select panel or the palette, show only the selected wash, with no ring, as [Where ui falls short](#where-ui-falls-short) records.

- Unit: the ring's 3:1 on every surface, on the header and inside a split button, and a date or time field's ring with focus in a part, src/system/system-css.test.ts.
- Manual: ring width and its contrast against adjacent colours from a clipped screenshot per focus stop.

### 2.5.1 Pointer gestures

Level A. Adopted. Met by ui. [Understanding 2.5.1](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)

No ui element needs a multipoint or path gesture: a drag has buttons, a sheet closes by its button and Escape.

- Manual: the list cards (reorder), the dialog cards (sheet).

### 2.5.2 Pointer cancellation

Level A. Adopted. Met by ui. [Understanding 2.5.2](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html)

Actions run on `click`. A press only draws on the down event. A drag lifts on a handle's press and a drop back where it began, or Escape, cancels it.

- Manual: the list cards (reorder), each gallery card.

### 2.5.3 Label in name

Level A. Adopted, partly met, owed by `navigation/account`. Met by ui. [Understanding 2.5.3](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html)

A control's accessible name starts with its visible words, and a hidden destination word is added after them. The account button's name does not contain its visible initials, as [Where ui falls short](#where-ui-falls-short) records.

- axe: `label-content-name-mismatch` (experimental in 4.13.0).
- Manual: name against visible text per control.

### 2.5.4 Motion actuation

Level A. Adopted. Met by ui. [Understanding 2.5.4](https://www.w3.org/WAI/WCAG22/Understanding/motion-actuation.html)

No ui element responds to device or body motion.

- Manual: a code search finds no `devicemotion` or `deviceorientation`.

### 2.5.5 Target size (enhanced)

Level AAA. Adopted, partly met, owed by `core/theme`, `core/pointer`, `forms/segmented`, `forms/copy`, `forms/tokens` and `feedback/toast`. Met by ui. [Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)

On the coarse tier targets are 44px at least, except an icon segment, which stays 36px wide, and a Copy button attached to its machine text, 42px tall. On the fine tier controls are 32px and targets 24px at least. The tier follows the last real pointer, so a mouse user with a tremor gets 32px. The person's own choice of large targets is in [Where ui falls short](#where-ui-falls-short).

- Unit: hit-area tests in src/system/system-css.test.ts.
- Manual: every target on both tiers.

### 2.5.6 Concurrent input mechanisms

Level AAA. Adopted, partly met, owed by `overlays/tooltip`. Met by ui. [Understanding 2.5.6](https://www.w3.org/WAI/WCAG22/Understanding/concurrent-input-mechanisms.html)

The tier follows each real input and never locks one out. `touch-action: manipulation` only removes the double-tap zoom. A tooltip marked to toggle on a tap never shows on a tap, as [Where ui falls short](#where-ui-falls-short) records.

- Unit: src/core/pointer tests.
- Manual: the foundation cards, the anchored overlay cards (a toggletip tapped in a touch context).

### 2.5.7 Dragging movements

Level AA. Adopted. Met by ui. [Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)

Every drag has a single-pointer alternative: reorder's Move up and Move down, a range's track press and its stepper, a drop zone's file button.

- Manual: the choice cards, the picker and file cards, the list cards.

### 2.5.8 Target size (minimum)

Level AA. Adopted, partly met, owed by `data/feed` and `layout/context-panel`. Met by ui. [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)

Every target is 24px at least on the fine tier, and links inside a line of text keep the inline exception. A feed row's summary when the row wraps its lines and the links of a context panel's list fall short, as [Where ui falls short](#where-ui-falls-short) records.

- Unit: hit-area tests.
- axe: `target-size` at 1440 and 390.
- axe: a 24px target assertion.

### 3.1.1 Language of page

Level A. Adopted. Met by ui and the app. [Understanding 3.1.1](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html)

The page sets `lang` on `<html>`, as [Set up](design.md#set-up) asks.

- axe: `html-has-lang`, `html-lang-valid`, `html-xml-lang-mismatch`.

### 3.1.2 Language of parts

Level AA. Adopted. Met by ui and the app. [Understanding 3.1.2](https://www.w3.org/WAI/WCAG22/Understanding/language-of-parts.html)

An app sets `lang` on a part it knows is in another language, such as a Japanese title, and ui elements keep it.

- axe: `valid-lang`.

### 3.1.3 Unusual words

Level AAA. Adopted. Met by the app. [Understanding 3.1.3](https://www.w3.org/WAI/WCAG22/Understanding/unusual-words.html)

A word used in a restricted sense, a service's jargon among them, is explained where it appears, by `.cp-help`, a definition in prose or a linked glossary.

- Manual: ui's own words, where this page states the app's duty.

### 3.1.4 Abbreviations

Level AAA. Adopted. Met by the app. [Understanding 3.1.4](https://www.w3.org/WAI/WCAG22/Understanding/abbreviations.html)

An abbreviation is expanded at its first use or in a glossary, never in a `title` alone, which no keyboard or touch user can read. Common units such as GB are numerals and units per [Words on screen](design-patterns.md#words-on-screen).

- Manual: ui's own words, where this page states the app's duty.

### 3.1.5 Reading level

Level AAA. Adopted. Met by ui and the app. [Understanding 3.1.5](https://www.w3.org/WAI/WCAG22/Understanding/reading-level.html)

Interface words stay at lower secondary reading level: a verb and its object, errors that name the fix, no jargon in ui's own words. Names and titles are the criterion's exception.

- Manual: ui's own strings.

### 3.1.6 Pronunciation

Level AAA. Adopted. Met by the app. [Understanding 3.1.6](https://www.w3.org/WAI/WCAG22/Understanding/pronunciation.html)

Where a word's meaning depends on its pronunciation, the app gives it, for example with `ruby`. Prose renders `ruby`.

- Manual: the content cards (prose renders ruby).

### 3.2.1 On focus

Level A. Adopted. Met by ui. [Understanding 3.2.1](https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html)

Focus never changes context: a focused tooltip only shows its words.

- Manual: focus each control and watch for navigation, dialogs and moved focus.

### 3.2.2 On input

Level A. Adopted. Met by ui. [Understanding 3.2.2](https://www.w3.org/WAI/WCAG22/Understanding/on-input.html)

A changed setting may save at once but never navigates, opens a window or moves focus. A select never navigates on change.

- Manual: change each control and watch for the same.

### 3.2.3 Consistent navigation

Level AA. Adopted. Met by ui and the app. [Understanding 3.2.3](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html)

The app frame fixes the header, rail, main and status order on every screen.

- Manual: the layout cards.

### 3.2.4 Consistent identification

Level AA. Adopted. Met by ui and the app. [Understanding 3.2.4](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification.html)

An action keeps one name and one icon wherever it appears.

- Manual: across the gallery cards.

### 3.2.5 Change on request

Level AAA. Adopted, partly met, owed by `content/markdown`. Met by ui. [Understanding 3.2.5](https://www.w3.org/WAI/WCAG22/Understanding/change-on-request.html)

Only the person starts a change of context. A link that opens a new tab says so in its words (technique H83). Markdown output opens web links in a new tab without saying so, as [Where ui falls short](#where-ui-falls-short) records.

- axe: `meta-refresh-no-exceptions`.
- Manual: the content cards.

### 3.2.6 Consistent help

Level A. Adopted. Met by the app. [Understanding 3.2.6](https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html)

An app's help link, when it has one, sits in the same place on every screen: the header status panel's foot or the header.

- Manual: the header and status cards, where this page states the app's duty.

### 3.3.1 Error identification

Level A. Adopted. Met by ui. [Understanding 3.3.1](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)

A field in error gets `aria-invalid="true"` and a `.cp-field-error` sentence tied by `aria-describedby` while it shows. A hidden error is never in a field's `aria-describedby`, since a screen reader reads a description from hidden text too and the field would say an error it does not have. A required field is marked `aria-required="true"`, never `required`: Firefox and WebKit read an empty `required` field as an invalid entry before anything is typed, and Firefox keeps it under `aria-invalid="false"`.

- Unit: src/forms/form and src/forms/pairs tests.
- axe: no field is described by an error it hides, and no empty field is `required` unless the app marked it invalid, on every page in every state.
- Manual: each form's error flow.

### 3.3.2 Labels or instructions

Level A. Adopted, partly met, owed by `forms/pairs`. Met by ui. [Understanding 3.3.2](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html)

Every control has a visible label. A toolbar search field's placeholder and name say what it searches.

- axe: `label`, `select-name`, `aria-input-field-name`, `form-field-multiple-labels`, `label-title-only`.
- Manual: the text field cards, the choice cards, the picker and file cards and the form editor cards.

### 3.3.3 Error suggestion

Level AA. Adopted. Met by ui and the app. [Understanding 3.3.3](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html)

An error names the fix, such as 'Enter 5 minutes or more'.

- Manual: each form's error flow.

### 3.3.4 Error prevention (legal, financial, data)

Level AA. Adopted. Met by ui and the app. [Understanding 3.3.4](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html)

A destructive action is confirmed (popconfirm, ask, a confirmation dialog naming the action and its object) or undone from a toast. A form is checked before it saves.

- Manual: the anchored overlay cards, the dialog cards.

### 3.3.5 Help

Level AAA. Adopted. Met by ui and the app. [Understanding 3.3.5](https://www.w3.org/WAI/WCAG22/Understanding/help.html)

`.cp-help` under a field says a format or a source where it is needed.

- Manual: the text field cards, the choice cards, the picker and file cards and the form editor cards.

### 3.3.6 Error prevention (all)

Level AAA. Adopted. Met by ui and the app. [Understanding 3.3.6](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-all.html)

Every submission is checked with a chance to correct it, and a destructive one is also confirmed or reversible.

- Manual: each form's error flow.

### 3.3.7 Redundant entry

Level A. Adopted. Met by ui. [Understanding 3.3.7](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html)

A form never loses what the person typed, across an error, a save, or a value saved elsewhere (form's `guardChanges`).

- Unit: src/forms/form tests.
- Manual: the form editor cards.

### 3.3.8 Accessible authentication (minimum)

Level AA. Adopted. Met by ui. [Understanding 3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html)

Sign-in offers passkeys and single sign-on beside the password, fields allow paste and password managers through `autocomplete`, and nothing asks to solve a puzzle.

- Manual: the sign-in, set-up and settings screens (paste, autocomplete, no CAPTCHA).

### 3.3.9 Accessible authentication (enhanced)

Level AAA. Adopted. Met by ui. [Understanding 3.3.9](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-enhanced.html)

As 3.3.8. No step asks to recognise an object or the person's own content.

- Manual: the sign-in, set-up and settings screens.

### 4.1.2 Name, role, value

Level A. Adopted, partly met, owed by `data/list-row`, `forms/copy` and `forms/file`. Met by ui. [Understanding 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)

Native elements first. A custom widget has its APG role, its name, and each state and value in ARIA 1.2, kept current by its module. A list row's cut line takes focus with no role, as [Where ui falls short](#where-ui-falls-short) records.

- axe: `aria-*`, `button-name`, `input-button-name`, `input-image-alt`, `link-name`, `area-alt`, `label`, `select-name`, `summary-name`, `nested-interactive`, `presentation-role-conflict`, `focus-order-semantics`, `duplicate-id`, `duplicate-id-active`, `duplicate-id-aria`, `frame-title`, `frame-title-unique`.
- Manual: each engine's own accessibility tree per gallery card.

### 4.1.3 Status messages

Level AA. Adopted, partly met, owed by `feedback/toast` and `forms/tokens`. Met by ui. [Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

`@cplieger/ui/announce`, Copy and the header status speak through live regions that exist before their text arrives. A relative time is `aria-live="off"`, so its minute rewrites inside a banner's region are not said again. Only a blocking problem uses `role="alert"`. A range's output repeats the slider's value, so it is silenced (`aria-live="off"`) and the slider says its value once, in the output's words. A toast is inserted as a live region already holding its words, and a value typed again into a field of chosen values is dropped with nothing said.

- axe: `aria-allowed-role` and `aria-required-attr` on the regions.
- Manual: a live-region observer and the AT-SPI events.

## WCAG 3 requirements ui adopts

The WCAG 3.0 Working Draft of 10 September 2026 has 216 requirements. ui adopts 109 that are stricter than WCAG 2.2, or that set a duty on media an app authors. [Other WCAG 3 requirements](#other-wcag-3-requirements) lists the rest.

### 2.1.4.1 Transcripts findable

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#transcripts-findable)

An app's own video has its transcript beside it on the same view, not behind a link elsewhere. The person's own library files are third-party content the app cannot change, under WCAG 2.2's statement of partial conformance.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.4.5 Descriptive transcripts available

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#descriptive-transcripts-available)

An app's own video with visual information its audio does not carry has a descriptive transcript (dialogue plus what is seen). The person's own library files are third-party content the app cannot change, under WCAG 2.2's statement of partial conformance.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.4.6 Speakers identified in transcripts

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speakers-identified-in-transcripts)

Each speaker is named in an app's own transcripts when there are several.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.4.7 Speaker language identified in transcripts

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speaker-language-identified-in-transcripts)

A transcript names the language each speaker uses when an app's own media mixes languages.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.4.8 Sounds identified in transcripts

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sounds-identified-in-transcripts)

Sounds needed to follow an app's own media are written in its transcript.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.4.9 Visual information identified in transcripts

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#visual-information-identified-in-transcripts)

Visual information needed to follow an app's own media (actions, charts, scene changes, on-screen text) is written in its transcript.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.5.1 Captions adjustable

A supplemental requirement. Adopted, partly met, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-adjustable)

The video element leaves caption appearance to the person's own caption settings in the browser and operating system: font size, weight, style, colour, background, transparency and placement. The stylesheet's `::cue` rule sets the colour, background and font, which can override those settings. [Where ui falls short](#where-ui-falls-short) has the fix.

- Manual: the media cards (the person's caption style applied in each engine, with and without the `::cue` rule).

### 2.1.5.5 Caption language adjustable

A supplemental requirement. Adopted, not met yet, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#caption-language-adjustable)

The video element lets the person choose among the file's captions and subtitles tracks. The module turns the native controls off and shows one track with no choice, as [Where ui falls short](#where-ui-falls-short) records.

- Unit: src/media/video tests (track choice).
- Manual: the media cards.

### 2.1.5.6 Captions controllable

A supplemental requirement. Adopted, not met yet, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-controllable)

The video element has a captions button that turns the showing track on and off. There is none once the native controls are off, as [Where ui falls short](#where-ui-falls-short) records.

- Unit: src/media/video tests (captions on and off by keyboard and pointer).
- Manual: the media cards.

### 2.1.5.7 Captions unobstructed

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-unobstructed)

The video element's bar sits under the picture, never over it, so it never covers a caption or the picture's own text.

- Manual: the media cards (caption box against the bar's box per engine).

### 2.1.5.8 Captions synchronized

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-synchronized)

The offset moves every cue by the same seconds and redraws the showing caption at once, so the person can bring a file's captions into sync with its audio.

- Unit: src/media/video offset tests in three engines.
- Manual: the media cards.

### 2.1.5.11 Speakers identified in captions

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speakers-identified-in-captions)

Each speaker is named in an app's own captions when there are several.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.5.12 Speaker language identified in captions

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speaker-language-identified-in-captions)

The language of each speaker is named in an app's own captions when several are spoken.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.6.3 Audio descriptions synchronized

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-synchronized)

An app's own audio description never speaks over dialogue or meaningful sound.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.6.7 Audio description language adjustable

A supplemental requirement. Adopted where the engine exposes audio tracks, not met yet, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-description-language-adjustable)

Where a file carries several audio tracks and the engine exposes them, the video element lets the person choose one, which covers a described track. `HTMLMediaElement.audioTracks` ships in Safari only, behind a flag in Chromium and a preference in Firefox. Elsewhere the engine gives the page no way to switch, so the requirement does not apply there. [Where ui falls short](#where-ui-falls-short) records it.

- Manual: the media cards (WebKit with a two-track file. Chromium and Firefox recorded n/a with that reason).

### 2.1.6.8 Audio descriptions controllable

A supplemental requirement. Adopted where the engine exposes audio tracks, not met yet, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-controllable)

As 2.1.6.7: choosing the described or the plain audio track turns audio description on and off. [Where ui falls short](#where-ui-falls-short) records it.

- Manual: the media cards.

### 2.1.6.9 Speakers identified in audio descriptions

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speakers-identified-in-audio-descriptions)

Each speaker is named in an app's own audio descriptions when there are several.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.6.10 Speaker language identified in audio descriptions

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speaker-language-identified-in-audio-descriptions)

The language of each speaker is named in an app's own audio descriptions when several are spoken.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.6.11 Sounds identified in audio descriptions

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sounds-identified-in-audio-descriptions)

Sounds needed to follow an app's own media are described in its captions and transcripts.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.7.2 Sign language controllable

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sign-language-controllable)

An app's own sign-language interpretation, when it is a separate overlay rather than burned in, can be shown and hidden.

- Manual: the media cards, where the gallery's sample has none.

### 2.1.8.3 Visual depth not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#visual-depth-not-relied-on)

Depth is never the only cue: a raised surface, an open overlay or a lifted row also has a boundary, a heading or a state word, and the depth tokens are decoration ([Shape and depth](design.md#shape-and-depth)).

- Manual: each gallery card with shadows removed (forced colours drops them, and the card must still read).

### 2.1.8.4 Sound not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sound-not-relied-on)

No ui element plays a sound, so nothing is conveyed by sound.

- Manual: a code search finds no `Audio`, `AudioContext` or sound file in src.

### 2.1.8.5 Spatial audio not relied on

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#spatial-audio-not-relied-on)

An app's own clip that places sounds in space, played in ui's video element, never conveys information by where a sound seems to come from alone. Its words, captions or transcript say it too. The video element plays the file as it is and blocks none of this.

- Manual: the media cards, where the gallery's sample has none.

### 2.2.1.4 Blocks of text adjustable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#blocks-of-text-adjustable)

The draft's values are @@, so ui adopts the testable part, that text stays manipulable. A person's style for margins, measure, line height and justification overrides ui's with no loss, since no text box has a fixed height or a clipping overflow, and ui never justifies text. Tested at WCAG 2.2 1.4.12's values until the draft sets its own.

- Manual: the 1.4.12 text-spacing style plus `text-align: justify` and `max-inline-size: none` per page, clipping and overlap per text node.

### 2.2.1.5 Text style adjustable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-style-adjustable)

As 2.2.1.4 for type: a person's own typeface, font width, decoration and capitalisation override ui's with no loss. Icons are SVG masks, never an icon font, so a font override leaves them whole. Words are written in sentence case in the markup, so a person's style that drops `text-transform` loses nothing.

- Manual: a user style setting `font-family`, `font-stretch`, `text-decoration` and `text-transform: none` per page, clipping and missing glyphs per gallery card.

### 2.2.1.11 Text customizations retained

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-customizations-retained)

ui ships no print stylesheet, so a printed or saved page keeps the person's own text settings (zoom, minimum font size, user styles).

- Manual: a code search finds no `@media print` in src or css/system.

### 2.2.2.1 Text detectable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-detectable)

Every visible word is in the DOM as text: no ui element draws words in a canvas or carries meaning in CSS `content`. A chart's labels are SVG `<text>` or HTML. A glyph drawn by CSS beside a state word is decoration.

- axe: `svg-img-alt`, `role-img-alt`.
- Manual: the accessibility tree of each gallery card against its visible words.

### 2.2.2.2 Human language detectable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#human-language-detectable)

Stricter than 3.1.2, which excepts names and technical terms. Every element that shows text in a known language other than the page's carries its `lang`. The elements keep a `lang` the app sets on an item, so a title in Japanese stays `lang="ja"`. The app sets it whenever its data knows the language.

- axe: `html-has-lang`, `html-lang-valid`, `valid-lang`.
- Manual: the list cards (Long names), the media cards, the content cards.

### 2.2.2.3 Numerical metadata available

A core requirement. Adopted, partly met, owed by `data/relative-time`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#numerical-metadata-available)

A date or time is a `<time datetime>` with its absolute value in the machine form, and a relative time shows the absolute date on hover and in its accessible text, and beside its words in a wide wrapped row. A keyboard or touch user cannot reach the absolute date elsewhere yet. A number keeps its unit beside it ([Words on screen](design-patterns.md#words-on-screen)).

- Unit: src/data/relative-time tests.
- Manual: the message cards, the detail and figure cards.

### 2.2.3.2 Non-literal language explained

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#non-literal-language-explained)

ui's own words (defaults, errors, empty states) are literal: no idiom or metaphor ([Words on screen](design-patterns.md#words-on-screen)). An app's interface words follow the same rule.

- Manual: ui's default words on each gallery card.

### 2.2.3.3 Summaries available

A core requirement. Adopted for an app's own long-form text. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#summaries-available)

No ui screen holds 300 words of continuous prose. An app's own long-form text (a help page, release notes) opens with a summary.

- Nothing to test in ui. This page states the app's duty.

### 2.2.3.6 No nested clauses

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-nested-clauses)

ui's own words use one clause per sentence. An app's interface words do the same.

- Manual: ui's default words on each gallery card.

### 2.2.3.7 No unnecessary words

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-unnecessary-words)

ui's own words say what happens with no filler ([Words on screen](design-patterns.md#words-on-screen)). An app's interface words do the same.

- Manual: ui's default words on each gallery card.

### 2.3.2.1 Pointer activation indicated (minimum)

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-activation-indicated-minimum)

A press shows at once on touch, where there is no pointer: a pressed control darkens to its active fill and, outside reduced motion, scales to 0.97 (core/press, [Motion](design.md#motion)).

- Manual: touch context per gallery card, the active state's fill change sampled on press.

### 2.3.2.4 Default pointer used

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#default-pointer-used)

ui never draws the pointer: `cursor` is only ever a standard keyword (`pointer`, `text`, `grab`, `not-allowed`), which the operating system draws with the person's own pointer size and colour, never `url()` or `none`.

- Unit: src/system/system-css.test.ts (no `cursor: url(` or `cursor: none` in css/system).

### 2.3.2.5 Pointer focus indicated

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-focus-indicated)

As 2.3.2.4: no ui element hides the pointer.

- As 2.3.2.4.

### 2.3.2.6 Pointer visible

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-visible)

As 2.3.2.4: no ui element hides the pointer, the video's picture included.

- As 2.3.2.4.

### 2.3.3.1 Focus relevant

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-relevant)

Nothing hidden or static takes focus, and a composite widget (radio group, tabs, segmented control, toolbar, listbox, menu, grid) is one tab stop with arrows inside it (APG. Core/roving-focus). A scroll region that only holds text takes focus because WCAG 2.2's 2.1.1 needs it for keyboard scrolling. It is operable, not static.

- axe: `aria-hidden-focus`.
- Manual: keyboard order per gallery card.

### 2.3.3.2 Focus retained

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-retained)

A dialog, sheet or popover closes by Escape and its visible close button, so the person returns to the whole page in one step, with focus back on what opened it.

- Manual: the anchored overlay cards, the dialog cards (Escape, close, focus returned).

### 2.3.4.2 Consistent control location

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-control-location)

Stricter than 3.2.3: every repeated control keeps its place, not only navigation. The app frame fixes the header's actions, the rail, the status line and the save bar on every screen. An app puts a repeated control in the same place.

- Manual: the layout cards, the sign-in, set-up and settings screens, the search, messages and not-found screens (same control's box across screens at each width).

### 2.3.5.2 Interactive element names available

A core requirement. Adopted, partly met, owed by `forms/pairs`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#interactive-element-names-available)

Stricter than 3.3.2 and 4.1.2 together: every control has a persistent visible label, text or an icon, never only a placeholder or a tooltip, and the same name in the tree. An icon-only control shows its name in a tooltip on hover and focus.

- axe: `label`, `button-name`, `link-name`, `select-name`, `aria-input-field-name`.
- Manual: placeholder-only and tooltip-only labels per gallery card.

### 2.3.5.3 Changes to elements notified

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#changes-to-elements-notified)

A change of a control's name, state or value shows on screen and in the tree at once: `aria-pressed`, `aria-expanded`, `aria-checked`, `aria-current` and `aria-busy` are kept current by each module, beside the visible change.

- Unit: each module's state tests.
- Manual: the accessibility tree before and after each action per gallery card.

### 2.3.5.4 Input constraints used

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#input-constraints-used)

Stricter than 3.3.2: a field's limits are stated before input, in its hint (required, format, length, range) and natively (`required`, `maxlength`, `min`, `max`, `pattern`), so they reach the tree.

- Manual: the text field cards, the choice cards, the picker and file cards and the form editor cards (hint present, native attribute present, both in the tree).

### 2.4.1.2 Keyboard accessible

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#keyboard-accessible)

Stricter than 2.1.1: all content, not only all functions, is reachable by keyboard. A tooltip's words show on focus, a scroll region that holds content takes focus, a collapsed section opens from its button, and no content appears only on hover or right-click.

- axe: `scrollable-region-focusable`.
- Manual: keyboard per gallery card.

### 2.4.1.3 Bidirectional navigation

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#bidirectional-navigation)

Shift+Tab always goes back to the previous stop: no ui element catches Tab to move focus itself, except a modal dialog, which loops both ways inside it (native `showModal`).

- Manual: Tab and Shift+Tab through each gallery card.

### 2.4.1.4 Custom keys documented

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#custom-keys-documented)

Every custom shortcut is listed in the shortcut list (`@cplieger/ui/keys`), opened by '?' and from the header, on the view it works on.

- Manual: the dialog cards (each shortcut the gallery binds appears in its list).

### 2.4.1.5 No keyboard conflicts

A core requirement. Adopted, partly met, owed by `overlays/palette` and `overlays/keys`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-keyboard-conflicts)

Stricter than 2.1.4, which covers single keys only. No custom shortcut takes a key the browser or the operating system uses, unless the person can change it. The palette's Ctrl+K takes Chrome's and Firefox's own Ctrl+K, a web search, on Windows and Linux, and the person cannot change it. [Where ui falls short](#where-ui-falls-short) has the shape.

- Manual: the dialog cards (each shortcut against the engines' and platforms' published shortcut lists).

### 2.4.1.6 Focus placed

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-placed)

When the person leaves a context and comes back, focus returns where it was. A closed dialog, sheet, popover or menu gives focus back to its invoker, as native `dialog` and popovers do and each module keeps. A list-detail's Back returns focus to the row that opened it.

- Manual: the anchored overlay cards, the dialog cards, the navigation cards (focus after close and after Back).

### 2.4.1.8 Focus user-controlled

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-user-controlled)

Stricter than 3.2.1: focus moves only because of the person. ui moves focus only after the person's own action: opening a dialog, a route change the person started, a batch's last press. Arriving messages, toasts, banners and live updates never move it.

- Manual: focus sampled before and after each live update per gallery card.

### 2.4.1.9 Focus movement relevant

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-movement-relevant)

Tab never moves focus into content that was not visible before: a collapsed accordion, a closed menu and a hidden tab panel hold no tab stop. The skip link is the draft's own exception.

- Manual: each focus stop's visibility (`checkVisibility()`) recorded before the Tab that reached it, per gallery card.

### 2.4.2.1 Navigation keys described

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#navigation-keys-described)

A key outside the APG's tables and the common Tab, arrow, Enter, Space and Escape set is described where it is used. The chart's keys and the sentence editor's keys are in their hints, and every shortcut is in the shortcut list.

- Manual: the form editor cards, the dialog cards, the chart cards (hint present for each non-common key).

### 2.4.2.2 No repetitive adjacent interactive elements

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-repetitive-adjacent-interactive-elements)

Adjacent controls never do the same thing: a card or a media card is one link, never a linked image beside a linked title. Dismissal is the draft's exception (a toast's close beside Escape).

- Manual: adjacent controls with one target per gallery card.

### 2.4.3.3 Consistent pointer cancellation

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-pointer-cancellation)

Every action cancels the same way: an action runs on `click`, so moving off the control before release cancels it, and a drag is dropped back where it began or cancelled by Escape.

- Manual: the list cards (reorder), each gallery card.

### 2.4.3.4 Pointer pressure not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-pressure-not-relied-on)

No ui element reads pointer pressure.

- Manual: a code search finds no `pressure`, `tangentialPressure` or `force` read in src.

### 2.4.3.5 Pointer speed not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-speed-not-relied-on)

No ui element reads pointer speed: a toast swipes away past 80px of travel, however slowly, and a reordered row moves by where the pointer is, never by how fast.

- Manual: a code search finds no velocity or pointer-time read in src, the toast cards (swipe) and the reorder card.

### 2.4.4.1 Speech not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#speech-not-relied-on)

No ui element takes speech input.

- Manual: a code search finds no `SpeechRecognition` in src.

### 2.4.5.5 Input method flexible

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#input-method-flexible)

The person can switch between mouse, touch, pen and keyboard at any moment: the pointer tier follows the last input (core/pointer), and no element works with one input only.

- Manual: each gallery card with a pointer action, operated by pointer, then keyboard, then touch in one session.

### 2.4.5.6 Body movements not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#body-movements-not-relied-on)

No ui element reads device motion or body movement.

- Manual: a code search finds no `devicemotion` or `deviceorientation` in src.

### 2.4.5.7 Eye tracking not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#eye-tracking-not-relied-on)

No ui element reads gaze.

- Manual: a code search.

### 2.4.5.8 Pointer accessible

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-accessible)

A press never stops the focus the engine gives it. The combobox and the select panel keep focus in their field on a press in their popup, which is the APG combobox pattern. The pressed option becomes the active descendant, the field keeps focus, and the click picks it.

- Manual: focus after a press and a press-drag-away per gallery card.

### 2.4.6.1 Biometrics not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#biometrics-not-relied-on)

Sign-in never needs a biometric: a passkey's user check is the platform authenticator's, which always offers its PIN or password beside a fingerprint or face, and sign-in also offers a password or single sign-on.

- Manual: the sign-in, set-up and settings screens.

### 2.4.6.2 Voice identification not relied on

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#voice-identification-not-relied-on)

No sign-in step uses the voice.

- Manual: the sign-in, set-up and settings screens.

### 2.5.1.3 Errors indicated in multiple ways

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#errors-indicated-in-multiple-ways)

A field's error shows in three ways: the danger ink, the error glyph and its sentence (`.cp-field-error`), and the field's own border turns danger.

- Manual: the form editor cards (each way present per form card, and still two under forced colours).

### 2.5.1.4 Error messages persistent

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#error-messages-persistent)

An error stays until the person fixes it or dismisses it: a field's error until its value is valid, an error toast and a page notice until dismissed (2.2.1).

- Unit: src/feedback/toast tests (an error toast has no timer).
- Manual: the form editor cards, the message cards.

### 2.5.1.5 Errors associated

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#errors-associated)

Stricter than 3.3.1: the error sentence sits under its field and is tied to it by `aria-describedby`, with `aria-invalid="true"` on the field.

- Unit: src/forms/form tests.
- Manual: the form editor cards (association in the engine's own tree).

### 2.5.1.6 Error messages collocated

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#error-messages-collocated)

The error sentence is placed under its field. A form's summary, when it has one, links each error to its field.

- Manual: the form editor cards.

### 2.5.2.1 Errors preventable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#errors-preventable)

Stricter than 3.3.4, which covers legal, financial and data submissions only. Every form is checked before it saves with a chance to correct it, and an action that cannot be checked is confirmed or undone (see 3.3.6, adopted).

- Manual: each form's error flow.

### 2.5.2.2 Submission status notified

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#submission-status-notified)

A submission says whether it saved or failed at the moment it ends: the save bar's words change and are announced politely, and a failure is announced and stays on screen.

- Manual: the form editor cards, the sign-in, set-up and settings screens (live-region observer at submit).

### 2.5.2.3 Data entry validated

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#data-entry-validated)

An error first appears when the person leaves the field or submits, never mid-typing. A hard limit already crossed (the text area's count over its maximum) shows at once, because waiting would let the person type more they must delete.

- Manual: the form editor cards (no `aria-invalid` while typing a partial value. Set on blur and on submit).

### 2.6.1.3 No visual motion

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-visual-motion)

No ui motion runs past 5 seconds except a busy indicator while its work runs, which the draft and Understanding 2.2.2 count as essential. Under reduced motion the skeleton and the spinners stand still, and the loader and the refresh line only pulse.

- Manual: reduced motion and a 5-second sample of `getAnimations()` per gallery card.

### 2.6.1.4 No visual motion (no exceptions)

A supplemental requirement. Adopted, partly met, owed by `feedback/loader` and `feedback/loading-region`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-visual-motion-no-exceptions)

With no exceptions, a busy indicator also settles within 5 seconds. Every spinner turns six times in 4.8 seconds (`--cp-spin`) and a skeleton fades out and back twice in 3.2 seconds, then each rests on the frame it started from, while `aria-busy` and its words keep saying the work runs. The loader loops for as long as its work runs, and under reduced motion the loader and the refresh line pulse for as long, as [Where ui falls short](#where-ui-falls-short) records. Until they rest, that motion is a trigger under 2.6.1.5.

- Unit: src/system/system-css.test.ts busy indicators.
- Manual: a 6-second sample of `getAnimations()` per busy card, with and without reduced motion.

### 2.6.1.5 Trigger warning available

A core requirement. Adopted, partly met, owed by `feedback/loader` and `feedback/loading-region`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#trigger-warning-available)

The loader's motion past 5 seconds, and its pulse and the refresh line's under reduced motion, are a trigger today, as 2.6.1.4 records. The bar meets this requirement by removing the trigger, never by a warning, which would add noise before every spinner. Once each indicator stops within 5 seconds, no trigger remains and the requirement stops applying. The spinners and the skeleton already rest within 5 seconds. ui has no flashing and no pseudo-motion.

- Unit: src/system/system-css.test.ts busy indicators.
- Manual: a 6-second sample of `getAnimations()` per busy card, with and without reduced motion.

### 2.6.1.6 Haptic stimulation adjustable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#haptic-stimulation-adjustable)

No ui element vibrates the device.

- Manual: a code search finds no `navigator.vibrate` in src.

### 2.6.1.7 Audio shifting adjustable

A core requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-shifting-adjustable)

An app's own clip whose audio shifts to suggest motion lets the person pause or turn the shift off. The video element's pause stops the whole clip, and the element leaves room for a control of the app's own that turns the shift off. No ui element shifts audio of its own.

- Manual: the media cards, where the gallery's sample has none.

### 2.7.2.1 Page/view title available

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#page-view-title-available)

Stricter than 2.4.2, which titles pages: each view of a single-page app has its own title. ui's screens give the title words. The app's router sets `document.title` on every route change.

- axe: `document-title`.
- Manual: the navigation cards, the layout cards, the sign-in, set-up and settings screens and the search, messages and not-found screens (title after each in-page navigation).

### 2.7.2.3 All steps listed

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#all-steps-listed)

A multi-step process lists all its steps at each step, visibly and in the tree, in the step track (`.cp-steps`, an ordered list), unless the steps depend on the person's choices.

- Manual: the card and step cards (Step track), the sign-in, set-up and settings screens (set-up).

### 2.7.2.4 Current step indicated

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#current-step-indicated)

The current step is marked visibly and by `aria-current="step"`.

- axe: `aria-valid-attr-value`.
- Manual: the card and step cards, the sign-in, set-up and settings screens.

### 2.7.2.5 Page/view change notified

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#page-view-change-notified)

A view change shows on screen and is announced. After a route change the person started, focus moves to the new view's heading, or its title is announced through a polite live region, so a screen reader says the new view. The app's router does it, and ui's screens supply a focusable `h1`.

- Manual: the navigation cards (focus and announcement after each in-page navigation in three engines).

### 2.7.2.6 Return to start supported

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#return-to-start-supported)

The wordmark in the header links to the app's start on every screen.

- Manual: the header and status cards, the layout cards.

### 2.7.2.7 Return to start prominent

A recommended practice. Adopted. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#return-to-start-prominent)

The wordmark is the header's first element, so its link is early in the DOM and in a prominent place. A recommended practice in the draft, adopted because it costs nothing and adds no noise.

- Manual: the header and status cards.

### 2.7.3.2 Blocks of content available (minimum)

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#blocks-of-content-available-minimum)

Stricter than 1.3.1, which asks for structure but not space: each block is a landmark, a headed section or a list, and the spacing scale sets it apart from its neighbours ([Space and layout](design.md#space-and-layout)).

- axe: `region`, `landmark-*`.
- Manual: spacing between blocks per gallery card.

### 2.7.3.3 Sections labeled

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sections-labeled)

Stricter than 2.4.6, which judges labels only when present: each landmark, panel and section has a heading or an `aria-labelledby` name, unless its purpose is plain from context.

- axe: `landmark-unique`, `region`, `aria-dialog-name`.
- Manual: the accessibility tree's names of landmarks and regions per page.

### 2.7.3.4 Heading structure available

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#heading-structure-available)

Headings nest in order from one `h1` per view, and an element's own headings take their level from where it is placed.

- axe: `heading-order`, `page-has-heading-one`, `empty-heading`.
- Manual: the headings of each page.

### 2.7.3.5 Order detectable

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#order-detectable)

Ordered content is an `ol`, or carries `aria-posinset` and `aria-setsize` where it is a virtual list, so each item's position is in the tree.

- axe: `list`, `listitem`.
- Manual: the list cards (Ordered cards), the long list and log cards (long lists).

### 2.7.3.6 Blocks of content available (enhanced)

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#blocks-of-content-available-enhanced)

Blocks are set apart by space and a boundary or a surface step, not by space alone.

- Manual: each gallery card.

### 2.7.4.1 Overlay content dismissible

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#overlay-content-dismissible)

Stricter than 1.4.13, which covers hover content only. Every overlay that covers the main content has a way to dismiss it: Escape, and a visible close or an outside press. That covers the dialog, sheet, popover, menu, palette and toast stack.

- Manual: the anchored overlay cards, the dialog cards (Escape and close per overlay in three engines).

### 2.8.1.1 Consistent structural order

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-structural-order)

The app frame keeps header, rail, main and status line in the same order on every screen and width.

- Manual: the layout cards, the sign-in, set-up and settings screens and the search, messages and not-found screens.

### 2.8.1.3 Consistent navigation labels

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-navigation-labels)

Stricter than 3.2.4, which asks for consistent identification: a repeated navigation item keeps its exact words on every view. The rail and bottom navigation take the same item list.

- Manual: the header and status cards, the navigation cards.

### 2.9.2.4 Time limits conveyed

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#time-limits-conveyed)

A time limit ui shows (the recovery link's 15 minutes, a device code's expiry) is stated at the start, with its length and how to start again.

- Manual: the sign-in, set-up and settings screens.

### 2.9.3.1 Preselections visible

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#preselections-visible)

A preselected choice that touches money, privacy or safety is visible by default, never inside a collapsed section. On settings a privacy or security default sits on its page with its value shown.

- Manual: the sign-in, set-up and settings screens (settings).

### 2.9.4.1 Going back supported

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#going-back-supported)

In a multi-step process (set-up), Back returns to the previous step and forward again with every value kept.

- Manual: the sign-in, set-up and settings screens (set-up).

### 2.9.4.3 Progress saved

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#progress-saved)

A multi-step process resumes at its first unfinished step: set-up reads each step's state from the server, and a form's unsaved input survives an error and a sign-in (2.2.5).

- Manual: the sign-in, set-up and settings screens (reload mid set-up).

### 2.9.5.1 Required action available

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#required-action-available)

A required field is marked by its label and natively by `required`, and a step that cannot go on says what it waits for in words beside its button.

- Manual: the text field cards, the choice cards, the picker and file cards and the form editor cards, the sign-in, set-up and settings screens.

### 2.9.5.2 Information requirements available at start

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#information-requirements-available-at-start)

Set-up opens with its steps and what each needs (the step track and an introduction). An app's other multi-step process does the same.

- Manual: the sign-in, set-up and settings screens.

### 2.9.5.3 Process instructions available

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#process-instructions-available)

Each step of a multi-step process carries its instructions in its hint and heading.

- Manual: the sign-in, set-up and settings screens.

### 2.10.1.1 Consequences of choices explained

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consequences-of-choices-explained)

A choice with security or privacy consequences (open sign-up, a token's scope, sharing) carries a hint naming its effect and its risk, beside the control.

- Manual: the sign-in, set-up and settings screens (settings), the form editor cards.

### 2.11.1.2 Contextual help available

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#contextual-help-available)

Context help sits beside what it explains: a field's hint, and `.cp-help` beside a term in a restricted sense (3.1.3).

- Manual: the text field cards, the choice cards, the picker and file cards and the form editor cards.

### 2.11.1.3 Disabled controls explained

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#disabled-controls-explained)

A visible disabled control says why and how to enable it, in words beside it or in its description. ui prefers a control that stays enabled and explains on press (design-patterns.md).

- Manual: each disabled control per gallery card has a reason in the tree.

### 2.11.2.1 Feedback mechanism available

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#feedback-mechanism-available)

Each app links its issue tracker from its help or about place. ui supplies nothing extra.

- Nothing to test in ui. This page states the app's duty.

### 2.12.1.2 User settings supported

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#user-settings-supported)

ui follows the person's settings: text and icons in rem follow the font size, `prefers-color-scheme` picks the theme until the person chooses, `prefers-reduced-motion`, `prefers-contrast` and `forced-colors` each change the stylesheet, and page zoom reflows.

- Unit: src/system/system-css.test.ts (media-query tests).
- Manual: each setting per gallery card.

### 2.12.1.3 Virtual cursor supported

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#virtual-cursor-supported)

A screen reader's browse mode reaches everything: no visible content is `aria-hidden`, no element takes `role="application"`, and content shown on hover is also in the DOM on focus.

- axe: `aria-hidden-body`, `aria-hidden-focus`, `presentation-role-conflict`.
- Manual: the accessibility tree of each gallery card.

### 2.12.1.4 Notifications adjustable

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#notifications-adjustable)

A toast that leaves on its own carries a result that stays visible elsewhere, pauses while hovered or focused, and every other notification stays until dismissed (2.2.1), so none is lost to its timing.

- Unit: src/feedback/toast tests.
- Manual: the message cards.

### 2.12.3.4 Layout reflow supported

A supplemental requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#layout-reflow-supported)

Stricter than 1.4.10: a part that scrolls sideways inside a page that scrolls down (a code block's long lines, a chip row) is no more than 320 CSS px tall, or wraps. Tables keep the two-dimensional exception.

- Manual: the content cards (A long line).

### 2.12.4.2 Media alternatives searchable

A supplemental requirement. Adopted for media an app authors. Met by the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#media-alternatives-searchable)

An app's own transcript is text on the page, so the browser's find searches it.

- Manual: the media cards, where the gallery's sample has none.

### 2.12.4.3 Media alternatives controllable

A supplemental requirement. Adopted, not met yet, owed by `media/video`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#media-alternatives-controllable)

As 2.1.5.6 and 2.1.6.8: captions and audio description can be turned on and off from the video element's bar. [Where ui falls short](#where-ui-falls-short) records it.

- As 2.1.5.6.

### 2.12.4.4 Media chapters available

A supplemental requirement. Adopted, not met yet, owed by `media/video`. Met by ui and the app. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#media-chapters-available)

The video element lists a file's `chapters` track, when it carries one, as a list of seek points. It reads no chapters track yet, as [Where ui falls short](#where-ui-falls-short) records. An app's own video of five minutes or more carries chapters.

- Unit: src/media/video tests.
- Manual: the media cards.

### 2.12.5.1 Change of content notified

A core requirement. Adopted, partly met, owed by `forms/rules` and `layout/settings`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#change-of-content-notified)

Stricter than 4.1.3: a meaningful change above the person's place or in a list's size is announced, such as new rows arriving in a feed or a count changing, through `@cplieger/ui/announce`, politely.

- Manual: the long list and log cards (feed, keyed list), the message cards.
- Unit: a removed row of pairs is said.

### 2.12.5.2 Change of focus notified

A core requirement. Adopted, stricter than WCAG 2.2. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#change-of-focus-notified)

When ui moves focus (2.4.1.8's cases), the new focus is visible and lands on an element with a name, so the screen reader says where it is. A form's error summary takes focus as a group named by its heading and described by its list, and a document's error notice as a group named by its sentences.

- Manual: the dialog cards, the navigation cards (name and ring at each automatic focus move).

### 2.12.5.3 Change of user agent notified

A core requirement. Adopted, partly met, owed by `content/markdown`. Met by ui. [Draft](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#change-of-user-agent-notified)

A change of window or device is announced before it happens. No ui element opens fullscreen or a new window on its own. A link that opens a new tab says so in its words, as 3.2.5 asks, except the web links of markdown output, as [Where ui falls short](#where-ui-falls-short) records.

- Manual: the content cards.

## Other WCAG 3 requirements

Of the rest, 48 are met through a WCAG 2.2 criterion at the same strength, 6 ask the same as a WCAG 2.2 criterion ui does not meet yet, 12 do not apply, and 41 are not adopted. An assertion is an organisation's statement about its own process, not a property of the interface, and ui claims no WCAG 3 conformance, so no assertion is adopted. A requirement whose values the draft still leaves undetermined cannot be tested, so it waits for a draft that sets them.

| Requirement | Type | Ruling |
| --- | --- | --- |
| [2.1.1.1 Images detectable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#images-detectable) | core | Met through WCAG 2.2 [1.1.1](#111-non-text-content) |
| [2.1.1.2 Decorative images hidden](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#decorative-images-hidden) | core | Met through WCAG 2.2 [1.1.1](#111-non-text-content) |
| [2.1.1.3 Image alternatives available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#image-alternatives-available) | core | Met through WCAG 2.2 [1.1.1](#111-non-text-content) |
| [2.1.1.4 Image alternatives equivalent](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#image-alternatives-equivalent) | core | Met through WCAG 2.2 [1.1.1](#111-non-text-content) |
| [2.1.3.1 Non-text content not relied on](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#non-text-content-not-relied-on) | core | Met through WCAG 2.2 [1.1.1](#111-non-text-content) |
| [2.1.4.2 Dialogue transcripts available (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#dialogue-transcripts-available-prerecorded) | core | Met through WCAG 2.2 [1.2.8](#128-media-alternative-prerecorded) |
| [2.1.4.3 Dialogue transcripts available (live)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#dialogue-transcripts-available-live) | core | Does not apply, because ui ships no live media element |
| [2.1.4.4 Transcripts equivalent (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#transcripts-equivalent-prerecorded) | core | Met through WCAG 2.2 [1.2.8](#128-media-alternative-prerecorded) |
| [2.1.4.10 Transcripts style guide](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#transcripts-style-guide) | assertion | Not adopted, because it is an assertion |
| [2.1.4.11 Transcripts usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#transcripts-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.1.4.12 Transcripts reviewed by content authors](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#transcripts-reviewed-by-content-authors) | assertion | Not adopted, because it is an assertion |
| [2.1.5.2 Captions available (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-available-prerecorded) | core | Met through WCAG 2.2 [1.2.2](#122-captions-prerecorded) |
| [2.1.5.3 Captions equivalent (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-equivalent-prerecorded) | core | Met through WCAG 2.2 [1.2.2](#122-captions-prerecorded) |
| [2.1.5.4 Captions available (live)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-available-live) | core | Does not apply, because ui ships no live media element |
| [2.1.5.9 Captions centered (immersive)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-centered-immersive) | core | Does not apply, because ui has no 360-degree or immersive content |
| [2.1.5.10 Direction indicated (immersive)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#direction-indicated-immersive) | core | Does not apply, because ui has no 360-degree or immersive content |
| [2.1.5.13 Sounds identified in captions](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sounds-identified-in-captions) | core | Met through WCAG 2.2 [1.2.2](#122-captions-prerecorded) |
| [2.1.5.14 Captions style guide](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-style-guide) | assertion | Not adopted, because it is an assertion |
| [2.1.5.15 Captions usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.1.5.16 Captions reviewed by content authors](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#captions-reviewed-by-content-authors) | assertion | Not adopted, because it is an assertion |
| [2.1.6.1 Audio descriptions available (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-available-prerecorded) | core | Met through WCAG 2.2 [1.2.5](#125-audio-description-prerecorded) |
| [2.1.6.2 Audio descriptions equivalent (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-equivalent-prerecorded) | core | Met through WCAG 2.2 [1.2.5](#125-audio-description-prerecorded) |
| [2.1.6.4 Audio descriptions available (live)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-available-live) | supplemental | Does not apply, because ui ships no live media element |
| [2.1.6.5 Extended audio descriptions available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#extended-audio-descriptions-available) | core | Met through WCAG 2.2 [1.2.7](#127-extended-audio-description-prerecorded) |
| [2.1.6.6 Extended audio descriptions equivalent](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#extended-audio-descriptions-equivalent) | core | Met through WCAG 2.2 [1.2.7](#127-extended-audio-description-prerecorded) |
| [2.1.6.12 Visual information identified in audio descriptions](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#visual-information-identified-in-audio-descriptions) | core | Met through WCAG 2.2 [1.2.5](#125-audio-description-prerecorded) |
| [2.1.6.13 Audio descriptions style guide](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-style-guide) | assertion | Not adopted, because it is an assertion |
| [2.1.6.14 Audio descriptions usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.1.6.15 Audio descriptions reviewed by content authors](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#audio-descriptions-reviewed-by-content-authors) | assertion | Not adopted, because it is an assertion |
| [2.1.7.1 Sign language available (prerecorded)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sign-language-available-prerecorded) | supplemental | Met through WCAG 2.2 [1.2.6](#126-sign-language-prerecorded) |
| [2.1.7.3 Sign language policy (live)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sign-language-policy-live) | assertion | Not adopted, because it is an assertion |
| [2.1.8.1 Hue not relied on](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#hue-not-relied-on) | core | Met through WCAG 2.2 [1.4.1](#141-use-of-color) |
| [2.1.8.2 Graphical object contrast sufficient](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#graphical-object-contrast-sufficient) | core | Met through WCAG 2.2 [1.4.11](#1411-non-text-contrast) |
| [2.1.9.1 Accessible video player selected](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#accessible-video-player-selected) | assertion | Does not apply, because it applies only to a video that does not play in standard browsers. ui uses the native `<video>` |
| [2.1.9.2 Accessible audio player selected](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#accessible-audio-player-selected) | assertion | Does not apply, because it applies only to an audio format that does not play in standard browsers |
| [2.2.1.1 Blocks of text readable (minimum)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#blocks-of-text-readable-minimum) | core | Not adopted, because the draft leaves its values undetermined (@@), so nothing can be tested |
| [2.2.1.2 Text style readable (minimum)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-style-readable-minimum) | core | Not adopted, because the draft leaves its values undetermined (@@), so nothing can be tested |
| [2.2.1.3 Text contrast sufficient (minimum)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-contrast-sufficient-minimum) | core | Not adopted, because the draft's contrast method is undecided, so contrast stays on WCAG 2's ratios |
| [2.2.1.6 Text size adjustable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-size-adjustable) | core | Met through WCAG 2.2 [1.4.4](#144-resize-text) |
| [2.2.1.7 Text color adjustable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-color-adjustable) | core | Met through WCAG 2.2 [1.4.8](#148-visual-presentation) |
| [2.2.1.8 Blocks of text readable (enhanced)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#blocks-of-text-readable-enhanced) | supplemental | Not adopted, because the draft leaves its values undetermined (@@), so nothing can be tested |
| [2.2.1.9 Text style readable (enhanced)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-style-readable-enhanced) | supplemental | Not adopted, because the draft leaves its values undetermined (@@), so nothing can be tested |
| [2.2.1.10 Text contrast sufficient (enhanced)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-contrast-sufficient-enhanced) | supplemental | Not adopted, because the draft's contrast method is undecided, so contrast stays on WCAG 2's ratios |
| [2.2.3.1 Abbreviations explained](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#abbreviations-explained) | core | Met through WCAG 2.2 [3.1.4](#314-abbreviations) |
| [2.2.3.4 Common words used](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#common-words-used) | supplemental | Met through WCAG 2.2 [3.1.5](#315-reading-level) |
| [2.2.3.5 Diacritics available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#diacritics-available) | core | Does not apply, because ui ships words in no language that drops diacritics for proficient readers (Arabic, Hebrew). An app that localises into one keeps them |
| [2.2.3.8 Clear language review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#clear-language-review) | assertion | Not adopted, because it is an assertion |
| [2.2.3.9 Visual aids review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#visual-aids-review) | assertion | Not adopted, because it is an assertion |
| [2.3.1.1 Default focus indicator used](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#default-focus-indicator-used) | supplemental | Not adopted, because the draft offers it as an alternative to 2.3.1.2 and 2.3.1.3, which ui meets with its own ring |
| [2.3.1.2 Focus indicator contrast sufficient](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-indicator-contrast-sufficient) | core | Same as WCAG 2.2 [2.4.13](#2413-focus-appearance)'s area of change, which ui does not meet yet, owed by `overlays/menu`, `forms/combobox`, `overlays/select-panel` and `overlays/palette`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.3.1.3 Focus indicator size sufficient](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-indicator-size-sufficient) | supplemental | Same as WCAG 2.2 [2.4.13](#2413-focus-appearance)'s area of change, which ui does not meet yet, owed by `overlays/menu`, `forms/combobox`, `overlays/select-panel` and `overlays/palette`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.3.1.4 Focus indicator style guide](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-indicator-style-guide) | assertion | Not adopted, because it is an assertion |
| [2.3.2.2 Pointer activation indicated (enhanced)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-activation-indicated-enhanced) | supplemental | Does not apply, because it applies where the platform has no visible pointer (touch, eye tracking). Showing a pointer there is the platform's setting, and a page-drawn pointer would lag behind the real one |
| [2.3.2.3 Pointer contrast sufficient](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-contrast-sufficient) | core | Does not apply, because it applies when the author changes the pointer's look. ui only names standard `cursor` keywords, which the operating system draws at the person's size and colour |
| [2.3.2.7 Enhanced pointer available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#enhanced-pointer-available) | supplemental | Not adopted, because every platform ui targets has a larger, recoloured pointer in its accessibility settings, and a pointer the page draws would replace it, lag behind the real pointer and lose its shapes |
| [2.3.3.3 Focus order meaningful](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#focus-order-meaningful) | core | Met through WCAG 2.2 [2.4.3](#243-focus-order) |
| [2.3.4.1 Consistent interactions](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-interactions) | assertion | Not adopted, because it is an assertion |
| [2.3.4.3 Conventional pattern used](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#conventional-pattern-used) | assertion | Not adopted, because it is an assertion |
| [2.3.5.1 Interactive element contrast sufficient](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#interactive-element-contrast-sufficient) | core | Met through WCAG 2.2 [1.4.11](#1411-non-text-contrast) |
| [2.3.5.5 Label included in programmatic name](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#label-included-in-programmatic-name) | core | Same as WCAG 2.2 [2.5.3](#253-label-in-name), which ui does not meet yet, owed by `navigation/account`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.3.5.6 Roles, values, states, properties available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#roles-values-states-properties-available) | core | Same as WCAG 2.2 [4.1.2](#412-name-role-value), which ui does not meet yet, owed by `data/list-row` and `forms/copy`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.4.1.1 Keyboard operable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#keyboard-operable) | core | Met through WCAG 2.2 [2.1.1](#211-keyboard) |
| [2.4.1.7 No keyboard traps](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-keyboard-traps) | core | Met through WCAG 2.2 [2.1.2](#212-no-keyboard-trap) |
| [2.4.2.3 Keyboard effort comparable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#keyboard-effort-comparable) | assertion | Not adopted, because it is an assertion |
| [2.4.3.1 Pointer activation controllable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#pointer-activation-controllable) | core | Met through WCAG 2.2 [2.5.2](#252-pointer-cancellation) |
| [2.4.3.2 Simple pointer input available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#simple-pointer-input-available) | core | Met through WCAG 2.2 [2.5.1](#251-pointer-gestures) and [2.5.7](#257-dragging-movements) |
| [2.4.4.2 Real-time text available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#real-time-text-available) | core | Does not apply, because ui has no voice communication |
| [2.4.4.3 Generated speech testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#generated-speech-testing) | assertion | Not adopted, because it is an assertion |
| [2.4.5.1 Hover or focus content dismissible](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#hover-or-focus-content-dismissible) | core | Met through WCAG 2.2 [1.4.13](#1413-content-on-hover-or-focus) |
| [2.4.5.2 Hover content persistent](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#hover-content-persistent) | core | Same as WCAG 2.2 [1.4.13](#1413-content-on-hover-or-focus)'s hoverable condition, which ui does not meet yet, owed by `overlays/tooltip`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.4.5.3 Hover or focus content persistent](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#hover-or-focus-content-persistent) | supplemental | Met through WCAG 2.2 [1.4.13](#1413-content-on-hover-or-focus) |
| [2.4.5.4 Path-based gesture not relied on](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#path-based-gesture-not-relied-on) | core | Met through WCAG 2.2 [2.5.1](#251-pointer-gestures) |
| [2.5.1.1 Error notifications available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#error-notifications-available) | core | Met through WCAG 2.2 [3.3.1](#331-error-identification) |
| [2.5.1.2 Error suggestions provided](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#error-suggestions-provided) | supplemental | Met through WCAG 2.2 [3.3.3](#333-error-suggestion) |
| [2.5.2.4 Error prevention review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#error-prevention-review) | assertion | Not adopted, because it is an assertion |
| [2.6.1.1 No flashing over threshold](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-flashing-over-threshold) | core | Met through WCAG 2.2 [2.3.1](#231-three-flashes-or-below-threshold) |
| [2.6.1.2 No flashing over threshold (no exceptions)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-flashing-over-threshold-no-exceptions) | supplemental | Met through WCAG 2.2 [2.3.2](#232-three-flashes) |
| [2.6.1.8 Safe content review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#safe-content-review) | assertion | Not adopted, because it is an assertion |
| [2.7.1.1 Conventional layout review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#conventional-layout-review) | assertion | Not adopted, because it is an assertion |
| [2.7.2.2 Location within product review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#location-within-product-review) | assertion | Not adopted, because it is an assertion |
| [2.7.3.1 Relationships detectable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#relationships-detectable) | supplemental | Met through WCAG 2.2 [1.3.1](#131-info-and-relationships) |
| [2.7.3.7 Clear structure review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#clear-structure-review) | assertion | Not adopted, because it is an assertion |
| [2.7.3.8 Key information usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#key-information-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.8.1.2 Consistent navigation order](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-navigation-order) | supplemental | Met through WCAG 2.2 [3.2.3](#323-consistent-navigation) |
| [2.9.1.1 Automated entry allowed](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#automated-entry-allowed) | core | Met through WCAG 2.2 [3.3.8](#338-accessible-authentication-minimum) |
| [2.9.1.2 Cognitive test alternatives available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#cognitive-test-alternatives-available) | core | Met through WCAG 2.2 [3.3.9](#339-accessible-authentication-enhanced) |
| [2.9.2.1 Timeout adjustable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#timeout-adjustable) | supplemental | Met through WCAG 2.2 [2.2.1](#221-timing-adjustable) |
| [2.9.2.2 No time limits](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-time-limits) | supplemental | Met through WCAG 2.2 [2.2.3](#223-no-timing) |
| [2.9.2.3 No unnecessary time limits](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-unnecessary-time-limits) | assertion | Not adopted, because it is an assertion |
| [2.9.3.2 Deceptive practices usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#deceptive-practices-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.9.3.3 Deceptive messaging expert review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#deceptive-messaging-expert-review) | assertion | Not adopted, because it is an assertion |
| [2.9.4.2 No redundant entry](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-redundant-entry) | supplemental | Met through WCAG 2.2 [3.3.7](#337-redundant-entry) |
| [2.9.6.1 Usability testing for unnecessary steps](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#usability-testing-for-unnecessary-steps) | assertion | Not adopted, because it is an assertion |
| [2.10.1.2 Consequences explained before agreement](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consequences-explained-before-agreement) | supplemental | Does not apply, because ui has no agreement flow. An app that adds one owes it |
| [2.10.1.3 Diverse disabilities considered](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#diverse-disabilities-considered) | assertion | Not adopted, because it is an assertion |
| [2.10.1.4 Algorithm inclusivity review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#algorithm-inclusivity-review) | assertion | Not adopted, because it is an assertion |
| [2.10.2.1 Inclusive data set](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#inclusive-data-set) | assertion | Not adopted, because it is an assertion |
| [2.10.2.2 No harm from algorithms](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#no-harm-from-algorithms) | assertion | Not adopted, because it is an assertion |
| [2.11.1.1 Consistent help available](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#consistent-help-available) | supplemental | Met through WCAG 2.2 [3.2.6](#326-consistent-help) |
| [2.11.1.4 Sensory characteristics not relied on](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#sensory-characteristics-not-relied-on) | core | Met through WCAG 2.2 [1.3.3](#133-sensory-characteristics) |
| [2.11.1.5 Supported decision-making review](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#supported-decision-making-review) | assertion | Not adopted, because it is an assertion |
| [2.11.1.6 Help usability testing](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#help-usability-testing) | assertion | Not adopted, because it is an assertion |
| [2.12.1.1 Assistive technology supported](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#assistive-technology-supported) | core | Same as WCAG 2.2 [4.1.2](#412-name-role-value), which ui does not meet yet, owed by `data/list-row` and `forms/copy`, as [Where ui falls short](#where-ui-falls-short) records |
| [2.12.3.1 Orientation supported (minimum)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#orientation-supported-minimum) | core | Met through WCAG 2.2 [1.3.4](#134-orientation) |
| [2.12.3.2 Orientation supported (enhanced)](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#orientation-supported-enhanced) | supplemental | Met through WCAG 2.2 [1.3.4](#134-orientation) |
| [2.12.3.3 Text reflow supported](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#text-reflow-supported) | supplemental | Met through WCAG 2.2 [1.4.10](#1410-reflow) |
| [2.12.4.1 Page/view audio adjustable](https://www.w3.org/TR/2026/WD-wcag-3.0-20260910/#page-view-audio-adjustable) | core | Met through WCAG 2.2 [1.4.2](#142-audio-control) |

## ARIA

- Native HTML first: a `button`, `a`, `input`, `select`, `dialog`, `details`, `table` or landmark element before any role.
- A custom widget takes the WAI-ARIA 1.2 roles, states and properties of its APG pattern, and its module keeps each state current.
- A WAI-ARIA 1.3 feature is an addition whose absence loses nothing. It is used only where a source below shows support in each pairing of a browser and a screen reader. Support in browsers alone is not enough, because a screen reader must also read the feature.
- The noise rule applies to every attribute.

ui uses no ARIA 1.3 feature. The tables below record the evidence for each feature in each pairing, from a11ysupport.io, the ARIA-AT test plans and WebAIM's tests of May 2025. A feature is ruled again when a source publishes results for its pairings. A use then lands with its pairing table on this page.

### `aria-description`

An ARIA 1.3 attribute. Ruling: no use.

| Pairing | Conveys the description | Conveys a change of it | Tested |
| --- | --- | --- | --- |
| JAWS 2023.2306 + Chrome 115 | yes | yes | 2023-07-26 |
| JAWS 2023.2306 + Edge 115 | yes | yes | 2022-07-26 |
| JAWS 2023.2306 + Firefox 115 | yes | yes | 2022-07-26 |
| NVDA 2023.1 + Chrome 115 | yes | yes | 2022-07-26 |
| NVDA 2023.1 + Edge 115 | yes | yes | 2022-07-26 |
| NVDA 2023.1 + Firefox 115 | yes | no | 2022-07-26 |
| Narrator (Windows 11 22H2) + Edge 115 | yes | no | 2022-07-26 |
| VoiceOver (macOS 15.7.3) + Safari 26.2 | yes | no | 2026-02-28 |
| VoiceOver (iOS 18.7.3) + Safari 18.7.3 | yes | no | 2026-02-27 |
| TalkBack 13.5 + Chrome 115 | yes | no | 2023-07-26 |
| Orca 44 + Firefox 115 | yes | no | 2023-07-26 |

Evidence: a11ysupport.io: Partial (17 of 22 assertion results). WebAIM (May 2025, JAWS, NVDA, Narrator, VoiceOver and TalkBack, current versions): only NVDA and iOS VoiceOver handled it well, which disagrees with a11ysupport's macOS VoiceOver result of February 2026. ARIA-AT: No test plan. Feature page: [a11ysupport.io](https://a11ysupport.io/tech/aria/aria-description_attribute).

Every description ui gives is visible text on screen, tied by `aria-describedby` (ARIA 1.2), which every pairing reads and every sighted person also sees. A description only a screen reader hears, such as WebAIM's 'You are here' on a breadcrumb that already has its name and `aria-current`, is the noise this page refuses. The pairings also disagree, and most do not announce a change.

### `aria-details` with several ids

An ARIA 1.3 attribute. Several ids are new in 1.3. Ruling: no use.

| Pairing | Conveys that details exist | Reaches the details' content | Tested |
| --- | --- | --- | --- |
| JAWS 2021.2107 + Chrome 105 | yes | no | 2022-09-16 |
| JAWS 2021.2107 + Edge 105 | yes | no | 2022-09-16 |
| JAWS 2022.2207 + Firefox 104 | yes | no | 2022-09-16 |
| NVDA 2022.2.2 + Chrome 105 | yes | yes | 2022-09-16 |
| NVDA 2022.2.2 + Edge 105 | yes | yes | 2022-09-16 |
| NVDA 2022.2.2 + Firefox 104 | yes | yes | 2022-09-16 |
| Narrator (Windows 11 21H2) + Edge 105 | no | no | 2022-09-16 |
| VoiceOver (macOS 12.6) + Safari 16 | no | no | 2022-09-16 |
| VoiceOver (iOS 16) + Safari 16 | no | no | 2022-09-16 |
| TalkBack 12.5 + Chrome 105 | no | no | 2022-09-16 |
| Orca 42 + Firefox 104 | yes | yes | 2022-09-16 |

Evidence: a11ysupport.io tests the single-id form (ARIA 1.2) only: no pairing has a result for several ids. WebAIM (May 2025): Announced in some screen readers, but there is no way to reach the details from the element, so 'more of a placeholder'. ARIA-AT: No test plan. Feature page: [a11ysupport.io](https://a11ysupport.io/tech/aria/aria-details_attribute).

No pairing has evidence for several ids, and even the single id reaches the content only in NVDA and Orca. ui's one case for details is a chart and its table view. The chart already has its text alternative tied by `aria-describedby` and its table one button away, which every pairing reaches.

### `aria-braillelabel`

An ARIA 1.3 attribute. Ruling: no use.

| Pairing | Braille shows the braille label | Speech keeps the name | Tested |
| --- | --- | --- | --- |
| every pairing | no data | no data | - |

Evidence: a11ysupport.io: No page (404 on 16 November 2026). ARIA-AT: No test plan. WebAIM (May 2025): Not tested. Feature page: [the ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/#aria-braillelabel).

No pairing evidence. ui also has no name whose braille form should differ from its spoken one: names are words, and a glyph-only control's name is already a word.

### `aria-brailleroledescription`

An ARIA 1.3 attribute. Ruling: no use.

| Pairing | Braille shows the braille role | Speech keeps the role description | Tested |
| --- | --- | --- | --- |
| every pairing | no data | no data | - |

Evidence: a11ysupport.io: No page (404). ARIA-AT: No test plan. WebAIM (May 2025): Not tested. Feature page: [the ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/#aria-brailleroledescription).

No pairing evidence. ui's one `aria-roledescription`, the chart's 'chart', is one short word whose braille contraction the display already makes.

### `role="mark"`

An ARIA 1.3 role. Ruling: no use.

| Pairing | Conveys highlighted text | Conveys its end | Tested |
| --- | --- | --- | --- |
| every pairing | no data | no data | - |

Evidence: a11ysupport.io: No page (404). ARIA-AT: No test plan. WebAIM (May 2025): Support 'still inconsistent', with `role="mark"` 'catching on'. Feature page: [the ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/#mark).

Native HTML comes first. Should ui ever highlight text for reference, such as search hits, it uses `<mark>`, whose role engines map from HTML. ui highlights no text for reference today: the syntax highlighter's colours are styling, not marks.

### `role="comment"`

An ARIA 1.3 role. Ruling: no use.

| Pairing | Conveys a comment | Conveys what it comments on | Tested |
| --- | --- | --- | --- |
| every pairing | no data | no data | - |

Evidence: a11ysupport.io: No page (404). ARIA-AT: No test plan. WebAIM (May 2025): Support 'still inconsistent'. Feature page: [the ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/#comment).

ui has no annotation or review feature for a comment to belong to.

### `role="suggestion"`

An ARIA 1.3 role. Ruling: no use.

| Pairing | Conveys a proposed change | Conveys its insertion and deletion | Tested |
| --- | --- | --- | --- |
| every pairing | no data | no data | - |

Evidence: a11ysupport.io: No page (404). ARIA-AT: No test plan. WebAIM (May 2025): Support 'still inconsistent'. Feature page: [the ARIA 1.3 Editor's Draft](https://w3c.github.io/aria/#suggestion).

ui proposes no edits. A code diff is not a suggestion: its `+` and `-` are text and its colours are styling.

### Other ARIA 1.3 additions

- `role="sectionheader"` and `role="sectionfooter"`: no use: native first. ui's sections use `header` and `footer` inside `section` or `article`, which HTML-AAM maps, and no source above has pairing results for the roles.
- `role="image"`: no use: a synonym of `img` (ARIA 1.2), which every pairing reads. A native `img` or an `svg` with `role="img"` stays.
- `aria-errormessage` as an id list: no use: ui ties each error by `aria-describedby` (1.2), which every pairing reads. WebAIM (May 2025) found even single-id `aria-errormessage` limited outside JAWS, NVDA and iOS VoiceOver.

## Contrast

Contrast uses the WCAG 2 ratios: 4.5:1 for text, 3:1 for large text, boundaries and states, and 7:1 for criterion 1.4.6. APCA was removed from the WCAG 3 drafts in 2023 and the draft's contrast method is not decided, so an APCA score only compares two candidate colours. [Colour](design-colour.md#contrast) lists the pairs the stylesheet holds in each theme.

## Testing

### The axe check

`gallery/a11y.ts` runs axe-core over every gallery page and frame and every reference page in `docs/system/`, in Chromium, Firefox and WebKit. Each engine has three test files: `gallery/a11y-<engine>.node.test.ts` checks the pages, `gallery/a11y-overlays-<engine>.node.test.ts` their overlays, and `gallery/a11y-charts-<engine>.node.test.ts` the charts page and its overlays, whose SVG text check takes the longest. Each runs one test per page and state. CI runs them with the other tests, split over three jobs (`cplieger.vitestShards` in `package.json`), and any violation fails the pull request.

- axe-core is pinned to 4.13.0 as an exact dev dependency. A bump comes as a dependency update, and the check fails until each rule the new version adds is ruled in the table below.
- The check selects rules by id, never by tag, so a rule that tests an adopted criterion runs even when axe marks it experimental. It also asserts that the rules it runs and the rules it leaves out together equal `axe.getRules()`.
- Each page runs in the light and dark themes at 1440 by 900 and 390 by 844 CSS pixels. Both themes at 1440 also run under `prefers-contrast: more`, where `color-contrast-enhanced` and the SVG text check hold the 7:1 pairs and the other rules have nothing new to find.
- Each overlay, every `[popover]` and `dialog`, is opened the way a person opens it and checked alone, in each of the page's six states. A dialog becomes a bottom sheet at 390, and the overlays' text must hold 7:1 under more contrast. A menu or panel opens by its button, a list of suggestions by ArrowDown in its field, and the tooltip by the pointer resting on a control with a tip. An overlay inside another opens after the one holding it. The tooltip is skipped on a page with no control that has a tip, since it never shows there. Any other overlay with nothing on the page to open it is opened by script, and the check's report names it. A button whose overlay is built when it is pressed, such as a question or a toast, is pressed on a fresh page, and what it opens is checked.
- Every closed `details` is opened and checked in a pass of its own in each of the six page states. The members of a group that share a `name` open one per pass, since opening one closes the others.
- A run fails unless axe reports every rule it was given, but for `bypass`, its one page-level rule, which it runs only on a whole page. A test page with a button that has no name must report `button-name` in every engine, so a run where axe did not start cannot pass.
- axe reports some failures only as needs review. The check fails on those results for `aria-braille-equivalent`, `aria-prohibited-attr`, `bypass`, `duplicate-id-aria`, `frame-title-unique`, `identical-links-same-purpose` and `no-autoplay-audio`, because axe files their real failures there. Every other needs-review result is written to the check's report as a notice, and the review of each pull request reads them against this page.

### The SVG text check

axe files text inside SVG, such as a chart's axis labels, as needs review, so the check measures it itself, in every page, overlay and details state. It scrolls each visible `svg text` into view and takes three screenshots: one with the text's fill transparent, which shows what is behind the glyphs, and one each with the fill magenta and green, which show the pixels the glyphs cover. Each pixel is read against whichever of the two differs more from what is behind it, so a magenta-like or green-like background hides no glyph. Each pixel the glyphs cover at least half of must hold 4.5:1 between the text's fill and what is behind it, or 3:1 for large text. For text on a wide opaque halo, a stroke painted under its fill at least a quarter of the font size wide, the halo is what is behind it. A narrower stroke is part of the letter, as WCAG's definition of the contrast ratio says in its Note 5, so the fill is measured against what is under the glyphs. A text under a fixed or sticky bar waits for a view where it is clear. Under `prefers-contrast: more` the ratios are 7:1 and 4.5:1. A test page with text that falls short, text on a halo, text with a narrow stroke, faded text, text half over a magenta-like fill and text off screen in a scrolling box proves the measure in each engine.

Of axe 4.13.0's 105 rules, 100 run in every state, 1 runs only under `prefers-contrast: more`, and 4 do not run: `aria-roledescription`, `audio-caption`, `hidden-content` and `landmark-complementary-is-top-level`. The [table of rules](#axe-rules) gives the reason for each.

### No tolerated violations

The check has no list of tolerated violations, for any element or page. It lands with none, and a change that brings one fails until it is fixed. A rule leaves the check only by a ruling in the [table of rules](#axe-rules), which applies to every page.

### Checks by hand

axe cannot judge everything, so each element is also checked by hand against this page and its APG pattern, in Chromium, Firefox and WebKit:

- Keys and order: every key of the pattern's table, focus order against the layout, and no trap.
- Focus: the ring is visible, at least 2px, at 3:1 against its neighbours, and not hidden under a sticky part, a toast or an open popover.
- The accessibility tree: names, roles, states and values in each engine's own tree, read through AT-SPI on Linux.
- Zoom and reflow: 200% and 400% zoom, a 320 CSS pixel window, text-only zoom to 200%, and the WCAG text spacing.
- Motion: reduced motion and every animation's length.
- Forced colours in Chromium and Firefox. WebKit has no forced colours mode.
- Target size on both pointer tiers, against 24px and against 44px.
- Content on hover or focus, live region announcements, focus after a route change, and each form's error flow.
- Dragging, pointer gestures and orientation.

### Screen reader checks

No screen reader runs in CI. The flows that most need one are live announcements, route changes, dialogs and sheets, the combobox and the palette, charts' text alternatives and table view, the drag alternative, error summaries and sign-in. They are checked with NVDA and Firefox or Chrome on Windows, VoiceOver and Safari on macOS and iOS, and TalkBack and Chrome on Android.

### axe rules

| Rule | Runs | Needs review fails | WCAG 2.2 | Reason |
| --- | --- | --- | --- | --- |
| [`accesskeys`](https://dequeuniversity.com/rules/axe/4.13/accesskeys) | every state | no | [2.1.1](#211-keyboard) | ui sets no `accesskey`. The rule keeps any added one unique, so two shortcuts never collide (WCAG 3 no keyboard conflicts). |
| [`area-alt`](https://dequeuniversity.com/rules/axe/4.13/area-alt) | every state | no | [2.4.4](#244-link-purpose-in-context), [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-allowed-attr`](https://dequeuniversity.com/rules/axe/4.13/aria-allowed-attr) | every state | no | [4.1.2](#412-name-role-value) | Its needs-review results, an unknown element with no role or a deprecated attribute, are checked by hand per page. |
| [`aria-allowed-role`](https://dequeuniversity.com/rules/axe/4.13/aria-allowed-role) | every state | no | [4.1.2](#412-name-role-value) | A role that contradicts its element is ARIA that restates its element, which the noise rule refuses. |
| [`aria-braille-equivalent`](https://dequeuniversity.com/rules/axe/4.13/aria-braille-equivalent) | every state | yes | [4.1.2](#412-name-role-value) | axe files its failures as needs review. ui uses no braille attribute, so any result is a defect. |
| [`aria-command-name`](https://dequeuniversity.com/rules/axe/4.13/aria-command-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-conditional-attr`](https://dequeuniversity.com/rules/axe/4.13/aria-conditional-attr) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-deprecated-role`](https://dequeuniversity.com/rules/axe/4.13/aria-deprecated-role) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-dialog-name`](https://dequeuniversity.com/rules/axe/4.13/aria-dialog-name) | every state | no | [4.1.2](#412-name-role-value) | A dialog without a name is announced as a bare dialog. |
| [`aria-hidden-body`](https://dequeuniversity.com/rules/axe/4.13/aria-hidden-body) | every state | no | [1.3.1](#131-info-and-relationships), [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-hidden-focus`](https://dequeuniversity.com/rules/axe/4.13/aria-hidden-focus) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-input-field-name`](https://dequeuniversity.com/rules/axe/4.13/aria-input-field-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-meter-name`](https://dequeuniversity.com/rules/axe/4.13/aria-meter-name) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`aria-progressbar-name`](https://dequeuniversity.com/rules/axe/4.13/aria-progressbar-name) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`aria-prohibited-attr`](https://dequeuniversity.com/rules/axe/4.13/aria-prohibited-attr) | every state | yes | [4.1.2](#412-name-role-value) | axe files a name ARIA 1.2 prohibits as needs review when the element also has text, or an `aria-labelledby` whose targets show, since a screen reader still says something. ARIA 1.2 forbids authors to name these roles, so a browser may drop the name. Any result is a defect. |
| [`aria-required-attr`](https://dequeuniversity.com/rules/axe/4.13/aria-required-attr) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-required-children`](https://dequeuniversity.com/rules/axe/4.13/aria-required-children) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`aria-required-parent`](https://dequeuniversity.com/rules/axe/4.13/aria-required-parent) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`aria-roledescription`](https://dequeuniversity.com/rules/axe/4.13/aria-roledescription) | no | no | [4.1.2](#412-name-role-value) | Deprecated and off in axe since testing found `aria-roledescription` supported across browsers and screen readers ([axe-core #3948](https://github.com/dequelabs/axe-core/pull/3948)). Its role list is narrower than ARIA 1.2 allows, so it flags conforming markup such as the chart's `aria-roledescription`. `aria-prohibited-attr` checks the one case ARIA 1.2 forbids, the attribute on `generic`. Each use is checked by hand against the noise rule. |
| [`aria-roles`](https://dequeuniversity.com/rules/axe/4.13/aria-roles) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-tab-name`](https://dequeuniversity.com/rules/axe/4.13/aria-tab-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-text`](https://dequeuniversity.com/rules/axe/4.13/aria-text) | every state | no | [4.1.2](#412-name-role-value) | `role=text` around a focusable child hides the child's role and name. |
| [`aria-toggle-field-name`](https://dequeuniversity.com/rules/axe/4.13/aria-toggle-field-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-tooltip-name`](https://dequeuniversity.com/rules/axe/4.13/aria-tooltip-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-treeitem-name`](https://dequeuniversity.com/rules/axe/4.13/aria-treeitem-name) | every state | no | [4.1.2](#412-name-role-value) | A tree item without a name is read as its position only. |
| [`aria-valid-attr-value`](https://dequeuniversity.com/rules/axe/4.13/aria-valid-attr-value) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`aria-valid-attr`](https://dequeuniversity.com/rules/axe/4.13/aria-valid-attr) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`audio-caption`](https://dequeuniversity.com/rules/axe/4.13/audio-caption) | no | no | [1.2.1](#121-audio-only-and-video-only-prerecorded) | Deprecated and off in axe. Its check can only return needs review (axe cannot hear whether a track carries captions), and ui ships no `<audio>` element. |
| [`autocomplete-valid`](https://dequeuniversity.com/rules/axe/4.13/autocomplete-valid) | every state | no | [1.3.5](#135-identify-input-purpose) | Tests an adopted A or AA criterion. |
| [`avoid-inline-spacing`](https://dequeuniversity.com/rules/axe/4.13/avoid-inline-spacing) | every state | no | [1.4.12](#1412-text-spacing) | Tests an adopted A or AA criterion. |
| [`blink`](https://dequeuniversity.com/rules/axe/4.13/blink) | every state | no | [2.2.2](#222-pause-stop-hide) | Tests an adopted A or AA criterion. |
| [`button-name`](https://dequeuniversity.com/rules/axe/4.13/button-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`bypass`](https://dequeuniversity.com/rules/axe/4.13/bypass) | every state | yes | [2.4.1](#241-bypass-blocks) | axe files its failures as needs review. A ui page with no landmark, no heading and no skip link is a defect, so the check counts them. |
| [`color-contrast-enhanced`](https://dequeuniversity.com/rules/axe/4.13/color-contrast-enhanced) | `contrast: more` only | no | [1.4.6](#146-contrast-enhanced) | AAA 1.4.6 is adopted. Primary text holds 7:1 at rest, and every text pair holds it under `prefers-contrast: more`. The rule runs in the `contrast: more` state, where every pair must hold 7:1. At rest, secondary text holds 4.5:1 by design. It files text inside SVG as needs review, which the [SVG text check](#the-svg-text-check) measures. Its other needs-review results go to the contrast check by hand. |
| [`color-contrast`](https://dequeuniversity.com/rules/axe/4.13/color-contrast) | every state | no | [1.4.3](#143-contrast-minimum) | It files text inside SVG as needs review, which the [SVG text check](#the-svg-text-check) measures. Its other needs-review results, such as text over an image or a gradient, overlapping boxes and pseudo-elements, go to the contrast check by hand in each theme. |
| [`css-orientation-lock`](https://dequeuniversity.com/rules/axe/4.13/css-orientation-lock) | every state | no | [1.3.4](#134-orientation) | Experimental in 4.13.0. It is the only automated test of 1.3.4, it reads ui's own stylesheets on the gallery's origin, and axe is pinned, so a later change to it arrives in a reviewed bump. |
| [`definition-list`](https://dequeuniversity.com/rules/axe/4.13/definition-list) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`dlitem`](https://dequeuniversity.com/rules/axe/4.13/dlitem) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`document-title`](https://dequeuniversity.com/rules/axe/4.13/document-title) | every state | no | [2.4.2](#242-page-titled) | Tests an adopted A or AA criterion. |
| [`duplicate-id-active`](https://dequeuniversity.com/rules/axe/4.13/duplicate-id-active) | every state | no | [4.1.2](#412-name-role-value) | Deprecated and off in axe with 4.1.1 ([axe-core #4071](https://github.com/dequelabs/axe-core/pull/4071)). Kept: HTML requires unique ids, and ui's invokers (`popovertarget`, `commandfor`) and labels resolve by id, so a repeated id on a focusable element opens or names the wrong thing. It checks focusable elements, which duplicate-id-aria does not. |
| [`duplicate-id-aria`](https://dequeuniversity.com/rules/axe/4.13/duplicate-id-aria) | every state | yes | [4.1.2](#412-name-role-value) | axe files its failures as needs review. A repeated id that ARIA or a label points at gives a control the wrong name or relation, so the check counts them. |
| [`duplicate-id`](https://dequeuniversity.com/rules/axe/4.13/duplicate-id) | every state | no | [4.1.2](#412-name-role-value) | Deprecated and off in axe with 4.1.1 ([axe-core #4071](https://github.com/dequelabs/axe-core/pull/4071)). Kept for the same reason as duplicate-id-active: it covers the ids neither duplicate-id-active nor duplicate-id-aria checks, among them a popover's own id that `popovertarget` and `commandfor` resolve. |
| [`empty-heading`](https://dequeuniversity.com/rules/axe/4.13/empty-heading) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.6](#246-headings-and-labels) | An empty heading is a stop in the headings list with nothing to read. |
| [`empty-table-header`](https://dequeuniversity.com/rules/axe/4.13/empty-table-header) | every state | no | [1.3.1](#131-info-and-relationships) | An empty header cell gives every cell under it no header to read. |
| [`focus-order-semantics`](https://dequeuniversity.com/rules/axe/4.13/focus-order-semantics) | every state | no | [4.1.2](#412-name-role-value) | Experimental in 4.13.0. A focusable `div`, `span`, `p` or heading with no widget role is a tab stop a screen reader cannot name or describe. A scroll region must carry its region role and name. axe is pinned, so a change to it arrives in a reviewed bump. |
| [`form-field-multiple-labels`](https://dequeuniversity.com/rules/axe/4.13/form-field-multiple-labels) | every state | no | [3.3.2](#332-labels-or-instructions) | Tests an adopted A or AA criterion. |
| [`frame-focusable-content`](https://dequeuniversity.com/rules/axe/4.13/frame-focusable-content) | every state | no | [2.1.1](#211-keyboard) | Tests an adopted A or AA criterion. |
| [`frame-tested`](https://dequeuniversity.com/rules/axe/4.13/frame-tested) | every state | no | none | It checks that axe ran inside every frame, such as the gallery's frame cards. The check injects axe into each frame and sets the rule's `isViolation` option, so an untested frame fails the run. |
| [`frame-title-unique`](https://dequeuniversity.com/rules/axe/4.13/frame-title-unique) | every state | yes | [4.1.2](#412-name-role-value) | axe files its failures as needs review. Two frames with one title cannot be told apart in a frames list, so the check counts them. |
| [`frame-title`](https://dequeuniversity.com/rules/axe/4.13/frame-title) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`heading-order`](https://dequeuniversity.com/rules/axe/4.13/heading-order) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.10](#2410-section-headings) | A skipped heading level misstates the structure a screen-reader user navigates by. |
| [`hidden-content`](https://dequeuniversity.com/rules/axe/4.13/hidden-content) | no | no | none | Experimental and a review item. Its check returns only needs review, for every element hidden with `display: none` or `visibility: hidden`, so it cannot fail a run. The accessibility tree check by hand shows what each card hides. |
| [`html-has-lang`](https://dequeuniversity.com/rules/axe/4.13/html-has-lang) | every state | no | [3.1.1](#311-language-of-page) | Tests an adopted A or AA criterion. |
| [`html-lang-valid`](https://dequeuniversity.com/rules/axe/4.13/html-lang-valid) | every state | no | [3.1.1](#311-language-of-page) | Tests an adopted A or AA criterion. |
| [`html-xml-lang-mismatch`](https://dequeuniversity.com/rules/axe/4.13/html-xml-lang-mismatch) | every state | no | [3.1.1](#311-language-of-page) | Tests an adopted A or AA criterion. |
| [`identical-links-same-purpose`](https://dequeuniversity.com/rules/axe/4.13/identical-links-same-purpose) | every state | yes | [2.4.9](#249-link-purpose-link-only) | AAA 2.4.9 is adopted. axe reports two links with the same words and different addresses only as needs review (its after step never yields a violation), so the check counts them: ui's ruling is that links with the same words go to the same place. |
| [`image-alt`](https://dequeuniversity.com/rules/axe/4.13/image-alt) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`image-redundant-alt`](https://dequeuniversity.com/rules/axe/4.13/image-redundant-alt) | every state | no | [1.1.1](#111-non-text-content) | An `alt` that repeats the text beside it is read twice: the noise rule. |
| [`input-button-name`](https://dequeuniversity.com/rules/axe/4.13/input-button-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`input-image-alt`](https://dequeuniversity.com/rules/axe/4.13/input-image-alt) | every state | no | [1.1.1](#111-non-text-content), [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`label-content-name-mismatch`](https://dequeuniversity.com/rules/axe/4.13/label-content-name-mismatch) | every state | no | [2.5.3](#253-label-in-name) | Experimental in 4.13.0. It is the only automated test of 2.5.3, which speech-input users depend on (they say the words they see). axe is pinned, so a change to it arrives in a reviewed bump. |
| [`label-title-only`](https://dequeuniversity.com/rules/axe/4.13/label-title-only) | every state | no | [3.3.2](#332-labels-or-instructions) | A field named only by `title` shows no label until hover. |
| [`label`](https://dequeuniversity.com/rules/axe/4.13/label) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`landmark-banner-is-top-level`](https://dequeuniversity.com/rules/axe/4.13/landmark-banner-is-top-level) | every state | no | [1.3.1](#131-info-and-relationships) | A nested banner landmark is reported inside its parent, so landmark navigation misplaces it. |
| [`landmark-complementary-is-top-level`](https://dequeuniversity.com/rules/axe/4.13/landmark-complementary-is-top-level) | no | no | none | Deprecated and off in axe: ARIA now defines `complementary` as a sibling or a direct descendant of the main content ([w3c/aria #1698](https://github.com/w3c/aria/pull/1698)), so the rule flags conforming markup ([axe-core #4950](https://github.com/dequelabs/axe-core/issues/4950)). |
| [`landmark-contentinfo-is-top-level`](https://dequeuniversity.com/rules/axe/4.13/landmark-contentinfo-is-top-level) | every state | no | [1.3.1](#131-info-and-relationships) | A nested contentinfo landmark is reported inside its parent, so landmark navigation misplaces it. |
| [`landmark-main-is-top-level`](https://dequeuniversity.com/rules/axe/4.13/landmark-main-is-top-level) | every state | no | [1.3.1](#131-info-and-relationships) | A nested main landmark is reported inside its parent, so landmark navigation misplaces it. |
| [`landmark-no-duplicate-banner`](https://dequeuniversity.com/rules/axe/4.13/landmark-no-duplicate-banner) | every state | no | [1.3.1](#131-info-and-relationships) | A page has one banner landmark. A second one makes landmark navigation ambiguous. |
| [`landmark-no-duplicate-contentinfo`](https://dequeuniversity.com/rules/axe/4.13/landmark-no-duplicate-contentinfo) | every state | no | [1.3.1](#131-info-and-relationships) | A page has one contentinfo landmark. A second one makes landmark navigation ambiguous. |
| [`landmark-no-duplicate-main`](https://dequeuniversity.com/rules/axe/4.13/landmark-no-duplicate-main) | every state | no | [1.3.1](#131-info-and-relationships) | A page has one main landmark. A second one makes landmark navigation ambiguous. |
| [`landmark-one-main`](https://dequeuniversity.com/rules/axe/4.13/landmark-one-main) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.1](#241-bypass-blocks) | The main landmark is the skip link's target and the first stop of landmark navigation. |
| [`landmark-unique`](https://dequeuniversity.com/rules/axe/4.13/landmark-unique) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.1](#241-bypass-blocks) | Two landmarks with one role and one name cannot be told apart in a landmarks list. |
| [`link-in-text-block`](https://dequeuniversity.com/rules/axe/4.13/link-in-text-block) | every state | no | [1.4.1](#141-use-of-color) | Tests an adopted A or AA criterion. |
| [`link-name`](https://dequeuniversity.com/rules/axe/4.13/link-name) | every state | no | [2.4.4](#244-link-purpose-in-context), [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`list`](https://dequeuniversity.com/rules/axe/4.13/list) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`listitem`](https://dequeuniversity.com/rules/axe/4.13/listitem) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`marquee`](https://dequeuniversity.com/rules/axe/4.13/marquee) | every state | no | [2.2.2](#222-pause-stop-hide) | Tests an adopted A or AA criterion. |
| [`meta-refresh-no-exceptions`](https://dequeuniversity.com/rules/axe/4.13/meta-refresh-no-exceptions) | every state | no | [2.2.4](#224-interruptions), [3.2.5](#325-change-on-request) | AAA 2.2.4 and 3.2.5 are adopted. ui pages never refresh, so any delayed refresh is a defect. |
| [`meta-refresh`](https://dequeuniversity.com/rules/axe/4.13/meta-refresh) | every state | no | [2.2.1](#221-timing-adjustable) | Tests an adopted A or AA criterion. |
| [`meta-viewport-large`](https://dequeuniversity.com/rules/axe/4.13/meta-viewport-large) | every state | no | [1.4.4](#144-resize-text) | A viewport that caps zoom below 500% limits a low-vision user on a phone. |
| [`meta-viewport`](https://dequeuniversity.com/rules/axe/4.13/meta-viewport) | every state | no | [1.4.4](#144-resize-text) | Tests an adopted A or AA criterion. |
| [`nested-interactive`](https://dequeuniversity.com/rules/axe/4.13/nested-interactive) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`no-autoplay-audio`](https://dequeuniversity.com/rules/axe/4.13/no-autoplay-audio) | every state | yes | [1.4.2](#142-audio-control) | axe files its failures as needs review. ui never plays sound on load (1.4.2), so any result is a defect. |
| [`object-alt`](https://dequeuniversity.com/rules/axe/4.13/object-alt) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`p-as-heading`](https://dequeuniversity.com/rules/axe/4.13/p-as-heading) | every state | no | [1.3.1](#131-info-and-relationships) | Experimental in 4.13.0. A paragraph styled as a heading is missing from the headings list. It is a heuristic on bold, italic and size, so each of its results is read. One that is not a heading is answered by the markup or recorded here as the rule's reason to leave. |
| [`page-has-heading-one`](https://dequeuniversity.com/rules/axe/4.13/page-has-heading-one) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.10](#2410-section-headings) | A page without a level-one heading has no start in the headings list. |
| [`presentation-role-conflict`](https://dequeuniversity.com/rules/axe/4.13/presentation-role-conflict) | every state | no | [4.1.2](#412-name-role-value) | A `role=none` element that is focusable or carries global ARIA is exposed anyway, so its decoration is read. |
| [`region`](https://dequeuniversity.com/rules/axe/4.13/region) | every state | no | [1.3.1](#131-info-and-relationships), [2.4.1](#241-bypass-blocks) | Content outside every landmark is missed by landmark navigation. |
| [`role-img-alt`](https://dequeuniversity.com/rules/axe/4.13/role-img-alt) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`scope-attr-valid`](https://dequeuniversity.com/rules/axe/4.13/scope-attr-valid) | every state | no | [1.3.1](#131-info-and-relationships) | A `scope` on a data cell or with a wrong value ties cells to the wrong header. |
| [`scrollable-region-focusable`](https://dequeuniversity.com/rules/axe/4.13/scrollable-region-focusable) | every state | no | [2.1.1](#211-keyboard), [2.1.3](#213-keyboard-no-exception) | Tests an adopted A or AA criterion. |
| [`select-name`](https://dequeuniversity.com/rules/axe/4.13/select-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`server-side-image-map`](https://dequeuniversity.com/rules/axe/4.13/server-side-image-map) | every state | no | [2.1.1](#211-keyboard) | Tests an adopted A or AA criterion. |
| [`skip-link`](https://dequeuniversity.com/rules/axe/4.13/skip-link) | every state | no | [2.4.1](#241-bypass-blocks) | A skip link whose target is missing or cannot take focus does nothing. |
| [`summary-name`](https://dequeuniversity.com/rules/axe/4.13/summary-name) | every state | no | [4.1.2](#412-name-role-value) | Tests an adopted A or AA criterion. |
| [`svg-img-alt`](https://dequeuniversity.com/rules/axe/4.13/svg-img-alt) | every state | no | [1.1.1](#111-non-text-content) | Tests an adopted A or AA criterion. |
| [`tabindex`](https://dequeuniversity.com/rules/axe/4.13/tabindex) | every state | no | [2.4.3](#243-focus-order) | A positive `tabindex` breaks the order the layout shows. |
| [`table-duplicate-name`](https://dequeuniversity.com/rules/axe/4.13/table-duplicate-name) | every state | no | [1.3.1](#131-info-and-relationships) | A summary that repeats the caption is read twice: the noise rule. |
| [`table-fake-caption`](https://dequeuniversity.com/rules/axe/4.13/table-fake-caption) | every state | no | [1.3.1](#131-info-and-relationships) | Experimental in 4.13.0. A caption set in a cell is read as data. axe is pinned, so a change to it arrives in a reviewed bump. |
| [`target-size`](https://dequeuniversity.com/rules/axe/4.13/target-size) | every state | no | [2.5.8](#258-target-size-minimum) | Off in axe by default, so it runs only by id or tag. 2.5.8 is AA and adopted. Its needs-review results, a target partly covered by another, go to the target check by hand. |
| [`td-has-header`](https://dequeuniversity.com/rules/axe/4.13/td-has-header) | every state | no | [1.3.1](#131-info-and-relationships) | Experimental in 4.13.0. A data cell with no header is read without its column or row. axe is pinned, so a change to it arrives in a reviewed bump. |
| [`td-headers-attr`](https://dequeuniversity.com/rules/axe/4.13/td-headers-attr) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`th-has-data-cells`](https://dequeuniversity.com/rules/axe/4.13/th-has-data-cells) | every state | no | [1.3.1](#131-info-and-relationships) | Tests an adopted A or AA criterion. |
| [`valid-lang`](https://dequeuniversity.com/rules/axe/4.13/valid-lang) | every state | no | [3.1.2](#312-language-of-parts) | Tests an adopted A or AA criterion. |
| [`video-caption`](https://dequeuniversity.com/rules/axe/4.13/video-caption) | every state | no | [1.2.2](#122-captions-prerecorded) | Its check returns only pass or needs review, because axe cannot tell whether a video has sound or whether a `subtitles` track carries the sounds. Its needs-review results are checked by hand. The gallery's media sample has an audio stream and a `subtitles` track. |
