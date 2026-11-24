import * as z from "zod";

const compensationSchema = z.strictObject({
  type: z.enum(["paid", "paidUnknown", "volunteer", "payingMember"]),
  amount: z.number(),
  description: z.string().nullable(),
});
export type Compsensation = z.infer<typeof compensationSchema>;

export const interestSchema = z.strictObject({
  id: z.number(),
  kind: z.enum([
    "mitglied",
    "vorstand",
    "beirat",
    "geschaeftsfuehrend",
    "taetig",
    "gesellschafter",
    "finanziell",
  ]),
  function: z.enum(["praesident", "vizepraesident", "mitglied"]).nullable(),
  organisationName: z.string(),
  organisationLegalForm: z.string(),
  compensation: compensationSchema,
});
export type Interest = z.infer<typeof interestSchema>;

export const personSchema = z.strictObject({
  type: z.enum(["lobbyist", "mp"]),
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
});
export type Person = z.infer<typeof personSchema>;
