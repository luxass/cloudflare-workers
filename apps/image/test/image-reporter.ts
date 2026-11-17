import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { TestAnnotation } from "vitest";
import type { Reporter, TestCase } from "vitest/node";

/** Saves real rendered PNG attachments so they can be opened after running the image suite. */
export default class ImageTestReporter implements Reporter {
  async onTestCaseAnnotate(testCase: TestCase, annotation: TestAnnotation): Promise<void> {
    const attachment = annotation.attachment;
    if (attachment?.contentType !== "image/png" || !attachment.body) {
      return;
    }

    const directory = join(testCase.project.config.root, ".vitest", "images");
    const filename = testCase.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const bytes =
      typeof attachment.body === "string"
        ? Buffer.from(attachment.body, attachment.bodyEncoding === "utf-8" ? "utf8" : "base64")
        : attachment.body;

    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${filename}.png`), bytes);
  }
}
