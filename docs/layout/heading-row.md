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

A `.cp-cover` before the title block makes the row an item's hero: the poster, 7rem wide, with the title block beside it from its top. Once the row is under 26.5rem, the poster, its gap and 18rem of words, the title block goes under the poster. The row follows its own box, so a hero in a narrow panel wraps as it does on a phone. The toolbar, when the page has actions, stays level with the title at the row's end, and takes its own line under 40rem.

```html
<header class="cp-heading-row">
  <span class="cp-cover" data-harmony="2">
    <img src="/api/covers/sonarr/12/poster.jpg" alt="">
    <span class="cp-icon" data-cp-icon="tv" aria-hidden="true"></span>
  </span>
  <div>
    <h1>Frieren: Beyond Journey's End</h1>
    <p data-part="alt-title" lang="ja">葬送のフリーレン</p>
    <p class="cp-cluster cp-meta"><span>TV, 2023</span><span>28 episodes</span></p>
    <ul class="cp-stack" data-gap="tight">
      <li><span class="cp-state" data-tone="success">On the best release</span> in Sonarr</li>
    </ul>
    <nav class="cp-cluster" data-gap="tight" aria-label="Frieren elsewhere">
      <a class="cp-filter-chip" href="#releases">Releases</a>
      <a class="cp-filter-chip" href="https://anilist.co/anime/154587" rel="external">AniList<span class="cp-visually-hidden">, opens AniList</span></a>
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
- The line of facts: a `p.cp-meta` for a sentence, or a `p.cp-cluster.cp-meta` of one `<span>` per fact, which the cluster spaces apart, so no dot joins them. It sits 8px under an alternative title.
- A `ul.cp-stack[data-gap="tight"]`: one line per copy or source, each saying its state in words, with a `.cp-state` for the state.
- A `nav.cp-cluster[data-gap="tight"]` of `a.cp-filter-chip`: the item's other pages and the services that hold it. The chip draws a chevron after a link that stays in the app and the external mark after one with `rel="external"`. Write what a screen reader needs to know in a `.cp-visually-hidden` span, such as ", opens AniList", since the mark is drawn.
- A last `.cp-cluster` of `.cp-chip`s: the item's states.

The lines, the links and the chips each sit 12px under what comes before them.

The heading is the page's `<h1>`, or an `<h2>` in a card or a dialog. The poster takes the row's 7rem, so the app sets no size on it. A hero with no actions, such as one that only reports, leaves the toolbar out and its title block takes the rest of the row.

## The poster's stand-in

The `.cp-cover` shows its glyph on its harmony colour until the `<img>` has loaded, and while there is none. Give it the kind's glyph: `film` for a film and `tv` for a series. The same cover stands in at a [table](../data/table.md)'s title cell and in a [combobox](../forms/combobox.md) option, at their own sizes.
