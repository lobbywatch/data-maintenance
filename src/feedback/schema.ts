import * as z from "zod";
import { personSchema } from "../lwdata/schema.ts";

export type Versioned<T> = {
  version: string;
  data: T;
};

export const feedbackFormFieldNameSchema = z.templateLiteral([
  z.enum(["response", "comment"]),
  "_",
  z.number(),
]);

const responseSchema = z.enum(["ok", "wrong"]);
export const feedbackFormPayloadSchema = z.record(
  feedbackFormFieldNameSchema,
  z.union([responseSchema, z.string()]),
);

export const completeFeedbackSchema = z.record(
  z.string(),
  z.xor([
    z.strictObject({
      response: z.literal(responseSchema.enum.ok),
    }),
    z.strictObject({
      response: z.literal(responseSchema.enum.wrong),
      comment: z.string().min(1).max(500),
    }),
  ]),
);
export type CompleteFeedback = z.infer<typeof completeFeedbackSchema>;

const stringToNumber = z.codec(z.string().regex(z.regexes.number), z.number(), {
  decode: (str) => Number.parseFloat(str),
  encode: (num) => num.toString(),
});

export const createFeedbackRequestSchema = z.strictObject({
  personId: stringToNumber,
});

export const feedbackRequestSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("new"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
  }),
  z.strictObject({
    state: z.literal("partial"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    feedback: completeFeedbackSchema,
  }),
  z.strictObject({
    state: z.literal("complete"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    feedback: completeFeedbackSchema,
  }),
]);
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
