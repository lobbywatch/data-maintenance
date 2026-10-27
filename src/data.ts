import mariadb from "mariadb";
import * as config from "./config.ts";
import { Schema } from "effect";

const InterestSchema = Schema.Struct({
  id: Schema.Number,
  kind: Schema.Literals([
    "mitglied",
    "vorstand",
    "beirat",
    "geschaeftsfuehrend",
    "taetig",
    "gesellschafter",
    "finanziell",
  ]),
  function: Schema.NullOr(
    Schema.Literals(["praesident", "vizepraesident", "mitglied"]),
  ),
  organisationName: Schema.String,
  organisationLegalForm: Schema.String,
});

type Interest = Schema.Schema.Type<typeof InterestSchema>;
export const PersonSchema = Schema.Struct({
  type: Schema.Literals(["lobbyist", "mp"]),
  id: Schema.Number,
  firstName: Schema.String,
  lastName: Schema.String,
});

export type Person = Schema.Schema.Type<typeof PersonSchema>;

const pool = mariadb.createPool({
  host: config.get("db_host"),
  user: config.get("db_user"),
  password: config.get("db_password"),
  database: "lobbywat_lobbywatch",
  connectionLimit: 5,
});

export async function getPersons(): Promise<Array<Person>> {
  const connection = await pool.getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "select 'mp' as type, id, nachname, vorname from parlamentarier where im_rat_bis is null LIMIT 100", // TODO
  );
  connection.end();
  return Schema.decodeUnknownSync(Schema.Array(PersonSchema))(
    rows.map((row) => ({
      type: "mp",
      id: row.id,
      firstName: row.vorname,
      lastName: row.nachname,
    })),
  );
}

export async function getPerson(
  id: Person["id"],
  type: Person["type"],
): Promise<Person> {
  const connection = await pool.getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "SELECT 'mp' AS type, id, nachname, vorname FROM parlamentarier WHERE id = ?",
    [id],
  );
  connection.end();
  const persons = Schema.decodeUnknownSync(Schema.Array(PersonSchema))(
    rows.map((row) => ({
      type: "mp",
      id: row.id,
      firstName: row.vorname,
      lastName: row.nachname,
    })),
  );

  if (persons.length === 1) {
    return persons[0];
  }
  throw new Error(`found multiple persons for ${id}, ${type}`);
}

export async function getInterests(personId: number): Promise<Interest[]> {
  const connection = await pool.getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "SELECT ib.id as id, ib.art, ib.funktion_im_gremium, o.name_de AS org_name_de, o.rechtsform AS org_legal_form \
    FROM interessenbindung ib \
    JOIN organisation o ON ib.organisation_id = o.id \
     WHERE parlamentarier_id = ?",
    [personId],
  );
  connection.end();
  return Schema.decodeUnknownSync(Schema.Array(InterestSchema))(
    rows.map((row) => ({
      id: row.id,
      kind: row.art,
      function: row.funktion_im_gremium,
      organisationName: row.org_name_de,
      organisationLegalForm: row.org_legal_form,
    })),
    { errors: "all", reportInput: true },
  );
}
