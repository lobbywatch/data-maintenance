import { it, describe } from "node:test";
import { parseFeedback } from "./index.ts";
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
      comment_7957: "", // textarea fields always show up, even if empty
    };

    const parsed = parseFeedback(payload);

    assert.deepStrictEqual(parsed, {
      14870: { response: "ok" },
      14155: { response: "ok" },
      15628: { response: "wrong", comment: "haha" },
    });
  });
});
