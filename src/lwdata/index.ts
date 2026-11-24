import mariadb, { type Pool } from "mariadb";
import * as config from "../config.ts";
import {
  interestSchema,
  personSchema,
  type Compsensation,
  type Interest,
  type Person,
} from "./schema.ts";

// payingMember is shown in separate table
const INTEREST_TABLE_SORT_ORDER: Record<
  Exclude<Compsensation["type"], "payingMember">,
  number
> = {
  paid: 0,
  paidUnknown: -1,
  volunteer: 1,
};

let pool: Pool;

function getPool(): Pool {
  if (!pool) {
    pool = mariadb.createPool({
      host: config.get("db_host"),
      user: config.get("db_user"),
      password: config.get("db_password"),
      database: "lobbywat_lobbywatch",
      connectionLimit: 5,
    });
  }
  return pool;
}
export async function getPersons(): Promise<Array<Person>> {
  const connection = await getPool().getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "select 'mp' as type, id, nachname, vorname from parlamentarier where im_rat_bis is null LIMIT 100", // TODO
  );
  connection.end();

  return personSchema.array().parse(
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
  const connection = await getPool().getConnection();
  const rows = await connection.query<
    { id: number; vorname: string; nachname: string }[]
  >(
    "SELECT 'mp' AS type, id, nachname, vorname FROM parlamentarier WHERE id = ?",
    [id],
  );
  connection.end();
  const persons = personSchema.array().parse(
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

export async function getInterests(
  personId: number,
): Promise<{ memberships: Interest[]; mandates: Interest[] }> {
  const connection = await getPool().getConnection();
  const year = new Date().getFullYear() - 1; // TODO assuming feedbacks are requested in late winter/early spring
  const rows = await connection.query<
    {
      id: number;
      art: string;
      funktion_im_gremium: string;
      org_name_de: string;
      org_legal_form: string;
      verguetung: number;
      beschreibung: string;
    }[]
  >(
    "SELECT ib.id as id, ib.art, ib.funktion_im_gremium, o.name_de AS org_name_de, o.rechtsform AS org_legal_form, ibj.beschreibung, ibj.verguetung \
    FROM interessenbindung ib \
    JOIN organisation o ON ib.organisation_id = o.id \
    JOIN interessenbindung_jahr ibj ON ib.id = ibj.interessenbindung_id \
     WHERE ibj.jahr = ? AND parlamentarier_id = ? \
     ORDER BY org_name_de",
    [year, personId],
  );
  connection.end();

  const interests = interestSchema.array().parse(
    rows.map((row) => ({
      id: row.id,
      kind: row.art,
      function: row.funktion_im_gremium,
      organisationName: row.org_name_de,
      organisationLegalForm: row.org_legal_form,
      compensation: {
        type: getCompensationType(row.verguetung),
        description: cleanBeschreibung(row.beschreibung),
        amount: row.verguetung,
      },
    })),
  );

  return {
    memberships: interests.filter(isSimpleMembership),
    mandates: interests
      .filter((interest) => !isSimpleMembership(interest))
      .sort(
        (a, b) =>
          INTEREST_TABLE_SORT_ORDER[a.compensation.type] -
          INTEREST_TABLE_SORT_ORDER[b.compensation.type],
      ),
  };
}

function isSimpleMembership(interest: Interest) {
  return (
    interest.kind === "mitglied" &&
    interest.function === null &&
    interest.compensation.type === "payingMember"
  );
}

function getCompensationType(verguetung: Number): Compsensation["type"] {
  switch (verguetung) {
    case -1:
      return "payingMember";
    case 0:
      return "volunteer";
    case 1:
      return "paidUnknown";
    default:
      return "paid";
  }
}

function cleanBeschreibung(beschreibung: string): string | null {
  // do not return redundant descriptions, i.e.d those which are already encoded in the compensation itself, see formatCompensation() above
  if (
    beschreibung === "Bezahlt" ||
    beschreibung === "Bezahlendes Mitglied" ||
    beschreibung === "Ehrenamtlich"
  ) {
    return null;
  }
  return beschreibung;
}
