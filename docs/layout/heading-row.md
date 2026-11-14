# Heading row

The head of a page or a section: a title block, then a `.cp-toolbar` of what the page can do. It needs no script. Once the row is under 40rem wide, in a narrow detail panel as on a phone, the toolbar takes a line of its own.

## Markup

```html
<div class="cp-heading-row">
  <div>
    <h1>Frieren: Beyond Journey's End</h1>
    <p class="cp-meta">Season 1, 28 episodes. English and French wanted.</p>
  </div>
  <div class="cp-toolbar">
    <button class="cp-button" type="button">Resume automation</button>
    <button class="cp-button" data-variant="primary" type="button">Find subtitles</button>
  </div>
</div>
```

The title's line of facts sits 4px under it. The toolbar is optional.

## An item's hero

A `.cp-cover` before the title block makes the row an item's hero: the poster, 7rem wide, with the title block beside it from its top. When the row cannot hold the poster and 18rem of words, about 26.5rem, the title block goes under the poster. The row follows its own box, so a hero in a narrow panel wraps as it does on a phone. The toolbar, when the page has actions, stays level with the title at the row's end.

```html
<header class="cp-heading-row">
  <span class="cp-cover" data-harmony="2">
    <img src="/api/covers/sonarr/12/poster.jpg" alt="">
    <span class="cp-icon" data-cp-icon="tv" aria-hidden="true"></span>
  </span>
  <div>
    <h1>Frieren: Beyond Journey's End</h1>
    <p data-part="alt-title" lang="ja">葬送のフリーレン</p>
    <p data-part="meta"><span>TV, 2023</span><span>28 episodes</span></p>
    <ul data-part="lines">
      <li>Sonarr: on the best release</li>
    </ul>
    <nav data-part="links" aria-label="Frieren elsewhere">
      <a href="#releases">Releases</a>
      <a href="https://anilist.co/anime/154587" rel="external">AniList<span class="cp-visually-hidden">, opens AniList</span></a>
    </nav>
    <div class="cp-cluster">
      <span class="cp-chip" data-tone="success"><span class="cp-icon" data-cp-icon="circle-check" aria-hidden="true"></span>On the best</span>
    </div>
  </div>
  <div class="cp-toolbar">…the page's actions…</div>
</header>
```

Each part of the title block is optional, in this order:

- `data-part="alt-title"`: the title in its own language, muted, 2px under the title. Give it the `lang` of its language.
- The line of facts: a `p.cp-meta` for a sentence, or a `p[data-part="meta"]` of one `<span>` per fact, which the row spaces apart, so no dot joins them. It sits 8px under an alternative title.
- `data-part="lines"`: a `<ul>` of one line per copy or source, each saying its state in words.
- `data-part="links"`: the item's other pages and the services that hold it, each an `<a>` drawn as a pill. The stylesheet draws a chevron after a link that stays in the app and the external mark after one with `rel="external"`. Write what a screen reader needs to know in a `.cp-visually-hidden` span, such as ", opens AniList", since the mark is drawn.
- A last `.cp-cluster` of `.cp-chip`s: the item's states.

The lines, the links and the chips each sit 12px under what comes before them.

The heading is the page's `<h1>`, or an `<h2>` in a card or a dialog. The poster takes the row's 7rem, so the app sets no size on it.

## The poster's stand-in

The `.cp-cover` shows its glyph on its harmony colour until the `<img>` has loaded, and while there is none. Give it the kind's glyph: `film` for a film and `tv` for a series. The same cover stands in at a [table](../data/table.md)'s title cell and in a [combobox](../forms/combobox.md) option, at their own sizes.
