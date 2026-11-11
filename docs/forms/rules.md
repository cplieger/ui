# rules

`@cplieger/ui/rules`

Rules that read as sentences with pickers in them, such as "When the audio is [Japanese], fetch [English] [+]". They sit in columns like a table, the condition, the verb, the targets and the row's buttons, so every picker starts where the one above it does. In a box under 36rem each rule wraps as a plain sentence.

```html
<div class="cp-rules">
  <ol>
    <li data-when="by default" data-fixed>
      <span data-part="when">By default,</span>
      <span data-part="verb">fetch</span>
      <span data-part="targets">
        <span class="cp-rule-target"><span class="cp-select"><select class="cp-input" aria-label="Language by default">…</select></span></span>
      </span>
    </li>
  </ol>
  <div><button class="cp-button" type="button" data-add-rule>Add a rule for an audio language</button></div>
</div>
```

```ts
import { enhanceRules } from "@cplieger/ui/rules";

enhanceRules(rules, {
  max: 3,
  target: (rule) => languagePicker(rule.dataset.when),
  rule: () => audioRule("Japanese"),
  words: { add: (when, full, n) => (full ? `Add a language ${when}. ${n} is the most.` : `Add a language ${when}`) },
  signal: page.signal,
});
```

- A rule is an `<li>` with `data-when`, the words that name it in its buttons, such as "when the audio is Japanese", and its `data-part="when"`, `"verb"` and `"targets"`. Each target is a `.cp-rule-target` holding its picker.
- The rules give each rule a + after its targets, and each rule without `data-fixed` a remove of its own. Each target gets a remove, shown while its rule holds more than one, so a rule always keeps one. The buttons are quiet and small, and the stylesheet draws their + and ×.
- + adds a target from `target(rule)` up to `max`. At `max` it stays in place with `aria-disabled="true"` and its name says why, and the limit is said through [announce](../feedback/announce.md). A removed target is said too, by default "French removed".
- `data-add-rule` appends a rule from `rule()`, and focus goes to its +. Removing a rule moves focus to the next rule's +, or the one before it, or to Add a rule.
- Focus always lands on a button, never on a picker, because a focused `<select>` opens its picker at once on iOS.
- A target's remove is named from its picker's chosen text, by default "Remove French by default", and follows a change of it. `words` gives other `add`, `removeTarget`, `removeRule`, `removed` and `full` words. Each button the rules make has its name as its tip too.
- A rule or a target the person adds fades in and settles 4px, and only fades under reduced motion. `onChange` runs after each add and removal, and `signal` removes the listeners.
