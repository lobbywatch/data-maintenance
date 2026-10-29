import { Option, Schema } from "effect";
import type { RequestHandler, RequestParamHandler } from "express";
import { Drop } from "liquidjs";
import { MessageFormat } from "messageformat";

declare global {
  namespace Express {
    interface Response {
      t: (
        key: string,
        params: Parameters<MessageFormat["format"]>[0],
      ) => string;
    }

    interface Request {
      language: SupportedLanguages;
    }
  }
}

type SupportedLanguages = (typeof supportedLanguages)[number];
export const supportedLanguages = ["de", "fr"] as const;

class ResourceBundle {
  mfs: Map<string, MessageFormat> = new Map();
  constructor(language: "de" | "fr", translations: Record<string, string>) {
    for (const key in translations) {
      this.mfs.set(key, new MessageFormat(language, translations[key]));
    }
  }
  t(
    key: string,
    params: Parameters<MessageFormat["format"]>[0],
  ): string | undefined {
    return this.mfs.get(key)?.format(params);
  }
}

const de = {
  table_newFeedbackButton: "Rückmeldung anfragen",
  tableHeader_lastName: "Nachname",
  tableHeader_firstName: "Vorname",
  navTitle_feedback: "Rückmeldungen",
  navTitle_logout: "Ausloggen",
  feedbackForm_header_text: "Ihre Interessenbindungen",
  feedbackForm_tableHeader_kind: "Art",
  feedbackForm_tableHeader_function: "Funktion",
  feedbackForm_tableHeader_organisationName: "Organisation",
  feedbackForm_tableHeader_organisationLegalForm: "Rechtsform",
  feedbackForm_response_legend: "Ihre Rückmeldung",
  feedbackForm_responseLabel_ok: "Stimmt",
  feedbackForm_responseLabel_wrong: "Falsch",
  feedbackForm_responseLabel_comment: "Kommentar",
  feedbackForm_submitButton_label: "Abschliessen",
  feedbackForm_saveButton_label: "Speichern",
  feedbackRequests_headline: "Offene Rückmeldungsanfragen",
  requests_tableHeader_state: "Status",
  feedbackView_header_text: "Rückmeldungen von {$firstName} {$lastName}",
  feedbackView_tableHeader_kind: "Art",
  feedbackView_tableHeader_function: "Funktion",
  feedbackView_tableHeader_organisationName: "Organisation",
  feedbackView_tableHeader_organisationLegalForm: "Rechtsform",
  feedbackView_tableHeader_compensation: "Vergütung",
  feedbackView_tableHeader_compensationDescription: "Beschreibung",
  feedbackView_tableHeader_form: "Rückmeldung",
  feedbackView_tableHeader_response: "Antwort",
  feedbackView_tableHeader_comment: "Kommentar",
  feedbackRequests_viewLink_text: "Anschauen",
  feedbackRequests_createRequestLink_text: "Rückmeldung anfragen",
  feedbackRequests_noRequests_text: "Keine Anfragen vorhanden",
  feedback_already_complete:
    "Diese Rückmeldungen können nicht mehr bearbeitet werden.",
  feedback_complete_header: "Danke!",
  feedback_complete_text: "Wir haben Ihre Rückmeldungen erhalten.",
};

const fr = {
  table_newFeedbackButton: "demander commentaires",
  tableHeader_lastName: "nom",
  tableHeader_firstName: "prènom",
  navTitle_feedback: "commentaires",
  navTitle_logout: "se déconnecter",
};

const bundles = {
  de: new ResourceBundle("de", de),
  fr: new ResourceBundle("fr", fr),
};

const languageSchema = Schema.Literals(supportedLanguages);

export function param(options: {
  ignoreRoutes: Array<string>;
}): RequestParamHandler {
  return (req, res, next, lng) => {
    const parseLng = Schema.encodeUnknownOption(languageSchema)(lng);
    if (options.ignoreRoutes.some((route) => route.startsWith(req.url))) {
      next();
      return;
    }
    if (Option.isSome(parseLng)) {
      res.t = (key, options) => {
        const translation = bundles[parseLng.value].t(key, options);
        if (translation) {
          return translation;
        } else {
          const fallbackTranslation = bundles["de"].t(key, options);
          if (fallbackTranslation) {
            return fallbackTranslation;
          }
        }
        return `missing translation: ${key}`;
      };
      req.language = parseLng.value;
      next();
    } else {
      console.warn("unsupported language", lng, "on", req.url);
      res.sendStatus(404);
    }
  };
}

export class LanguageDrop extends Drop {
  constructor(lang, t) {
    super();
    this.language = lang;
    this.t = t;
  }
  language() {
    return this.language;
  }
  t(key, opt) {
    console.log(key);
    return this.t(key, opt);
  }
}
