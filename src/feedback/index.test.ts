import { it, describe } from "node:test";
import { createFeedbackRequests, parseFeedback } from "./index.ts";
import * as assert from "node:assert/strict";
import { ZodError } from "zod";

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

describe("createFeedbackRequests", () => {
  const testCases = [
    {
      formData: {
        personIds: ["20", "49"],
        type_20: "mp",
        type_49: "mp",
      },
      expectedResult: [
        { personId: 20, personType: "mp" },
        { personId: 49, personType: "mp" },
      ],
    },
    {
      formData: { personIds: "20", type_20: "mp" },
      expectedResult: [{ personId: 20, personType: "mp" }],
    },
  ];
  for (const { formData, expectedResult } of testCases) {
    it(`must parse valid form data: ${JSON.stringify(formData)}`, async () => {
      const reqs = await createFeedbackRequests(formData);
      assert.partialDeepStrictEqual(reqs, expectedResult);
    });
  }

  const invalidFormData = [
    { personIds: ["21"], type_20: "mp" },
    { personIds: ["20"], type_20: "m" },
    { personIds: ["20"] },
  ];
  for (const formData of invalidFormData) {
    it(`must throw when given invalid form data: ${JSON.stringify(formData)}`, async () => {
      await assert.rejects(() => createFeedbackRequests(formData), ZodError);
    });
  }
});
