# qr

`@cplieger/ui/qr`

A text drawn as a QR code, such as the `otpauth://` link an authenticator app scans to add an account. The code is encoded in the page, so a secret it holds is never sent anywhere to be drawn.

```ts
import { qrCode } from "@cplieger/ui/qr";

box.replaceChildren(qrCode(uri));
```

- `qrCode(text, options)` returns an `svg.cp-qr`. The stylesheet draws it dark on a light square in both themes and under forced colours, because a scanner reads only dark on light. It is 12rem across unless `--cp-qr-size` sets another size.
- The encoder is a port of [Project Nayuki's QR Code generator](https://github.com/nayuki/QR-Code-generator) (MIT), whose notice is in `THIRD_PARTY_NOTICES.md`.
- The code follows ISO/IEC 18004 at versions 1 to 40. It uses the smallest version that holds the text, in one segment of the smallest mode that holds it: digits, the standard's upper-case alphanumeric set, or else the text's UTF-8 bytes. A text too long for version 40 throws a `RangeError`.
- `level` sets the error correction: `"L"`, `"M"` (the default), `"Q"` or `"H"`, which recover about 7, 15, 25 or 30% of a damaged code. A higher level takes a larger code for the same text.
- `quiet` sets the light margin in whole modules. It is 4 by default, the standard's least, and a smaller value throws a `RangeError`.
- The image is hidden from assistive technology, because the text written beside it, such as the authenticator key in groups of four, is the way in for a reader who cannot scan. `label` names it instead, for a code shown with no text beside it.
- `encodeQr(text, level)` returns the symbol itself: its `version`, `level`, `mask`, `mode`, `size` in modules and `modules` row by row, 1 for dark, for a page that draws it another way.
- The SVG carries no `style` attribute, so a strict content policy accepts it.
