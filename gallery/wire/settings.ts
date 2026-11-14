/**
 * settings.ts — the gallery's wiring for the forms page's file fields and
 * the upload dialog, on the library's file and form modules.
 */

import { enhanceFiles, uploadFile, type UploadResult } from "@cplieger/ui/file";
import { reportErrors } from "@cplieger/ui/form";

// The gallery's made-up server: every second upload fails once, so the card
// shows Retry.
let sent = 0;
const failing = new Set<File>();
const send = (file: File, signal: AbortSignal): Promise<UploadResult> =>
  new Promise((done) => {
    if (sent++ % 2 === 1) {
      failing.add(file);
    }
    const timer = setTimeout(() => {
      done(
        failing.delete(file) ? { ok: false, message: "The server did not answer." } : { ok: true },
      );
    }, 1500);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
    });
  });

// A file field names its list by data-files and its limit by data-max-size.
// In a dialog, Upload with no file says so on the field, and a dialog's
// data-upload names the list its files upload into, in subflux's words.
for (const input of document.querySelectorAll<HTMLInputElement>("input[type='file'][data-files]")) {
  const list = document.getElementById(input.dataset["files"] ?? "");
  const form = input.form;
  const uploads = document.getElementById(
    form?.closest<HTMLElement>("[data-upload]")?.dataset["upload"] ?? "",
  );
  const files = enhanceFiles(input, {
    ...(list === null ? {} : { list }),
    ...(uploads === null
      ? {}
      : { words: { tooBig: (max) => `Files over ${max} can't be uploaded.` } }),
    maxSize: Number(input.dataset["maxSize"] ?? Infinity),
  });
  const summary = form?.querySelector<HTMLElement>("[data-summary]");
  if (form === null || summary === null || summary === undefined) {
    continue;
  }
  form.addEventListener("submit", (e) => {
    if (files.files.length === 0) {
      e.preventDefault();
      reportErrors(form, [{ field: input, message: "Choose a file to upload." }], {
        summary,
        heading: (n) => `${String(n)} fields need a fix`,
      });
      return;
    }
    if (uploads !== null) {
      for (const file of files.files) {
        uploadFile(uploads, file, send);
      }
    }
  });
}
