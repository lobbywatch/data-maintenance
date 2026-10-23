import mariadb from "mariadb";
import * as config from "./config.ts";
import { Schema } from "effect";

const InterestSchema = Schema.Struct({ kind: Schema.Literals([]), function: Schema.Literals([]), organisation: Schema.Struct({ name: Schema.String }), lobbyGroup: Schema.Struct({ name: Schema.String }) })
type Interest = Schema.Schema.Type<typeof InterestSchema>
 export const MpSchema = Schema.Struct({

  id: Schema.Number,
  firstName: Schema.String,
  lastName: Schema.String,
});

export type MP = Schema.Schema.Type<typeof MpSchema>;

const pool = mariadb.createPool({
  host: config.get("db_host"),
  user: config.get("db_user"),
  password: config.get("db_password"),
  database: "lobbywat_lobbywatch",
  connectionLimit: 5,
});

export async function getMps(): Promise<Array<MP>> {
  const connection = await pool.getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "select id, nachname, vorname from parlamentarier where im_rat_bis is null",
  );
  connection.end();
  return Schema.decodeUnknownSync(Schema.Array(MpSchema))(
    rows.map((row) => ({
      id: row.id,
      firstName: row.vorname,
      lastName: row.nachname,
    })),
  );
}

export async function getInterests(mpId: string): Promise<Interest[]> {

  const connection = await pool.getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "SELECT ib.id  FROM interessenbindung ib WHERE parlamentarier_id = :id",
  );
  connection.end();
  return Schema.decodeUnknownSync(Schema.Array(InterestSchema))(
    rows.map((row) => ({
      id: row.id,
    })),
  );
}
