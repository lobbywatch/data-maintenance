import { Schema } from "effect";

export const MpSchema = Schema.Struct({
  firstName: Schema.String,
  lastName: Schema.String,
});

export type MP = Schema.Schema.Type<typeof MpSchema>;
