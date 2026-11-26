import * as z from "zod";
import { personSchema } from "../lwdata/schema.ts";

export type Versioned<T> = {
  version: null | string;
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

export const createFeedbackRequestSchema = z.preprocess(
  (value) => {
    if (!(value && typeof value === "object" && "personIds" in value)) {
      return null;
    }

    if (Array.isArray(value["personIds"])) {
      const persons = value.personIds.map((id) => ({
        id,
        type: value[`type_${id}`],
      }));

      return { persons };
    } else if (typeof value.personIds === "string") {
      return {
        persons: [
          { id: value.personIds, type: value[`type_${value.personIds}`] },
        ],
      };
    }
    return null;
  },
  z.strictObject({
    persons: z
      .strictObject({ id: stringToNumber, type: personSchema.shape.type })
      .array(),
  }),
);

export const feedbackRequestSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("new"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
  }),
  z.strictObject({
    state: z.literal("sent"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime(),
  }),
  z.strictObject({
    state: z.literal("failed"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    failedAt: z.iso.datetime(),
    message: z.string(),
  }),
  z.strictObject({
    state: z.literal("partial"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime(),
    feedback: completeFeedbackSchema,
  }),
  z.strictObject({
    state: z.literal("complete"),
    personId: z.number(),
    personType: personSchema.shape.type,
    requestId: z.string(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    sentAt: z.iso.datetime(),
    feedback: completeFeedbackSchema,
  }),
]);
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;
