import { it, describe } from "node:test";
import { parsePartialFeedback } from "./index.ts";
import * as assert from "node:assert/strict";

describe("parsePartialFeedback", () => {
  it("must parse a correct form payload", () => {
    const payload = {
      response_14870: "ok",
      comment_14870: "",
      response_14155: "ok",
      comment_14155: "",
      response_15628: "wrong",
      comment_15628: "haha",
      comment_7957: "", // textarea field always shows up
    };

    const parsed = parsePartialFeedback(payload);

    assert.deepStrictEqual(parsed, {
      14870: { response: "ok" },
      14155: { response: "ok" },
      15628: { response: "wrong", comment: "haha" },
    });
  });
});
