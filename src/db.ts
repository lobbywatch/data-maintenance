import mariadb from "mariadb";
import * as config from "./config.ts";
import { type MP, MpSchema } from "./model.ts";
import { Schema } from "effect";

const pool = mariadb.createPool({
  host: config.get("db_host"),
  user: config.get("db_user"),
  password: config.get("db_password"),
  database: "lobbywat_lobbywatch",
  connectionLimit: 5,
});

export async function getMps(): Promise<Array<MP>> {
  const connection = await pool.getConnection();
  const rows = await connection.query<{ vorname: string; nachname: string }>(
    "select nachname, vorname from parlamentarier where im_rat_bis is null",
  );
  connection.end();
  return Schema.decodeUnknownSync(Schema.Array(MpSchema))(
    rows.map((row) => ({
      firstName: row.vorname,
      lastName: row.nachname,
    })),
  );
}
