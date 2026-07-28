// Kuratierte thematische Gliederung des Archivs.
//
// Die ursprünglichen Blog-Kategorien sind historisch gewachsen und für ein
// Nachschlagewerk zu uneinheitlich. Diese Datei bildet daraus zehn Teile -
// dieselbe Gliederung, die auch das gedruckte Buch verwendet. Buch und Website
// teilen sich dieses Modul, damit beide dieselbe Struktur zeigen.

export const PART_ORDER = [
  "Fallgeschichten aus der Praxis",
  "Lebensberatung & Ausbildung",
  "Selbstmitgefühl & innere Arbeit",
  "Gesellschaft, Philosophie & Sonstiges",
  "Unternehmensberatung, Marketing & KI",
  "Mentaltraining, NLP & Coaching",
  "Psychische Gesundheit & Krisen",
  "Grundlagen & Menschenbild",
  "Beziehung, Bindung & Familie",
  "Methoden, Übungen & Tools",
];

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// Kurzbeschreibungen: erscheinen auf den Teilseiten der Website und helfen
// zugleich Suchmaschinen und KI-Systemen, den Inhalt einzuordnen.
export const PART_DESCRIPTIONS = {
  "Fallgeschichten aus der Praxis":
    "Anonymisierte Fallgeschichten, Gesprächsanalysen und Falldarstellungen aus Beratung, Supervision und Therapie – vom Erstgespräch bis zum Prozessverlauf.",
  "Lebensberatung & Ausbildung":
    "Berufsbild, Ausbildung und Praxisführung in der Lebens- und Sozialberatung: rechtliche Grenzen, Supervision, Mediation, Ausbildungsinhalte und Materialien.",
  "Selbstmitgefühl & innere Arbeit":
    "Selbstmitgefühl, Selbstwert, Scham und innere Achtsamkeit – mit Übungen, Meditationsskripten und Impulsen für die eigene und die begleitete Arbeit.",
  "Gesellschaft, Philosophie & Sonstiges":
    "Philosophische, gesellschaftliche und bildungspolitische Perspektiven auf Beratung, Menschenbild und Zeitgeschehen.",
  "Unternehmensberatung, Marketing & KI":
    "Selbstständigkeit, Positionierung, Marketing und der Einsatz künstlicher Intelligenz in Beratung, Coaching und Praxisorganisation.",
  "Mentaltraining, NLP & Coaching":
    "Mentaltraining, NLP, Hypnose und lösungsorientiertes Coaching – Methoden zur Zustandssteuerung, Zielarbeit und Veränderungsbegleitung.",
  "Psychische Gesundheit & Krisen":
    "Belastung, Angst, Burnout, Trauma und Krisenintervention – inklusive Z-Diagnosen, Diagnostik und dem Umgang mit akuten Belastungssituationen.",
  "Grundlagen & Menschenbild":
    "Der personzentrierte Ansatz nach Carl Rogers und verwandte Grundlagen: Menschenbild, Aktualisierungstendenz, therapeutische Beziehung und Diagnostikverständnis.",
  "Beziehung, Bindung & Familie":
    "Bindungstheorie, Paardynamik, Trennung, Elternarbeit und familiäre Systeme – von der Bindungsforschung bis zur konkreten Paarberatung.",
  "Methoden, Übungen & Tools":
    "Konkrete Werkzeuge für die Praxis: Übungen, Arbeitsblätter, Reflexionshilfen, Modelle und Strukturierungshilfen für Einzel- und Gruppenarbeit.",
};

// Direkte Zuordnung der ursprünglichen Blog-Kategorien zu den Teilen.
const CAT_PART = {
  Fallgeschichten: "Fallgeschichten aus der Praxis",
  "Selbstmitgefühl": "Selbstmitgefühl & innere Arbeit",
  "Mentaltraining & NLP": "Mentaltraining, NLP & Coaching",
  "LSB Praxis": "Lebensberatung & Ausbildung",
  Unternehmensberatung: "Unternehmensberatung, Marketing & KI",
  "Z-Diagnosen": "Psychische Gesundheit & Krisen",
  KI: "Unternehmensberatung, Marketing & KI",
  "Marketing mit KI": "Unternehmensberatung, Marketing & KI",
  Supervision: "Lebensberatung & Ausbildung",
  Privat: "Gesellschaft, Philosophie & Sonstiges",
  Ausbildungen: "Lebensberatung & Ausbildung",
  Wissenswert: "Gesellschaft, Philosophie & Sonstiges",
  "Positive Psychologie": "Mentaltraining, NLP & Coaching",
  Psychosoziales: "Gesellschaft, Philosophie & Sonstiges",
  "Paartherapie & Beziehung": "Beziehung, Bindung & Familie",
  Biografiearbeit: "Lebensberatung & Ausbildung",
  Mediation: "Lebensberatung & Ausbildung",
};

// Schlagwortregeln für Artikel, deren Blog-Kategorie "Sonstiges" war oder
// fehlte. Die erste passende Regel gewinnt.
const RULES = [
  ["Grundlagen & Menschenbild", ["personzentriert", "rogers", "menschenbild", "aktualisierungstendenz",
    "watzlawick", "individualpsychologie", "adler", "sachse", "diagnostik im personzentrierten",
    "bio-psycho-soziale", "systemtheorie", "therapeutische beziehung"]],
  ["Psychische Gesundheit & Krisen", ["burnout", "angst", "trauma", "krise", "depression", "sucht",
    "zittern", "forensische psychiatrie", "demenz", "panik", "realitätsverlust", "psychotraumat"]],
  ["Beziehung, Bindung & Familie", ["bindung", "bowlby", "trennung", "scheidung", "co-abhängigkeit",
    "elternarbeit", "polyamor", "misstrauen", "zwei nicht mehr", "parentifizierung"]],
  ["Selbstmitgefühl & innere Arbeit", ["kränkung", "selbstmitgefühl", "selbstwert", "resilien",
    "mitleid oder mitgefühl", "achtsam", "ego depletion", "zuckersucht", "perfektion"]],
  ["Methoden, Übungen & Tools", ["johari", "motto-ziel", "genogramm", "stuhlübung", "zwischen ich und du",
    "meditation", "einsprech-skript", "plananalyse", "nägel auf einem nagelkopf", "team-fallblatt",
    "reflexionshilfen", "gruppenprozess", "zielprozess"]],
  ["Gesellschaft, Philosophie & Sonstiges", ["höhlengleichnis", "politisierung", "niedergang des westens",
    "philosophie", "eudaimonia", "unterrichtsprinzipien", "fürsorgepflicht der schule", "nudging",
    "nlp-techniken"]],
  ["Lebensberatung & Ausbildung", ["lebensberater", "lehrgang", "präsenztage", "wko beratungsförderung",
    "supervision", "psychodynamisch verstehen", "inhalte vom"]],
];

const FALLBACK = "Gesellschaft, Philosophie & Sonstiges";

/** Ordnet einen Artikel anhand von Kategorie und Titel einem Teil zu. */
export function classifyPart(category, title) {
  if (CAT_PART[category]) return CAT_PART[category];
  const haystack = String(title ?? "").toLowerCase();
  for (const [part, keywords] of RULES) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return part;
  }
  return FALLBACK;
}

/**
 * Gruppiert Artikel (Astro-Collection-Einträge) in die Teile-Reihenfolge.
 * Leere Teile entfallen, die römischen Ziffern bleiben dadurch lückenlos.
 */
export function groupIntoParts(articles, slugify) {
  const byPart = new Map(PART_ORDER.map((name) => [name, []]));
  for (const article of articles) {
    const part = classifyPart(article.data.category ?? "", article.data.title ?? article.id);
    byPart.get(part).push(article);
  }
  for (const list of byPart.values()) {
    list.sort((a, b) => (a.data.title ?? "").localeCompare(b.data.title ?? "", "de"));
  }
  return PART_ORDER.map((name) => ({ name, articles: byPart.get(name) }))
    .filter((part) => part.articles.length > 0)
    .map((part, index) => ({
      name: part.name,
      roman: ROMAN[index],
      slug: slugify(part.name),
      description: PART_DESCRIPTIONS[part.name] ?? "",
      articles: part.articles,
    }));
}
