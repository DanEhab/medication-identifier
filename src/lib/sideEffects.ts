/**
 * Telling the two warning lists apart.
 *
 * A medicine's answer carries two of them and the model fills both from the
 * same knowledge, so the urgent ones turn up twice. Eltroxin's looked like
 * this:
 *
 *   stop and get help today   Chest pain
 *                             fast or irregular heartbeat
 *   call your doctor if       You experience chest pain or a very fast heart rate
 *                             you feel unusually anxious or have tremors
 *                             you become pregnant or are breastfeeding
 *
 * The first line of the second list is the first list again in a longer
 * sentence. That is worse than clutter: two lists that overlap make a reader
 * work out whether the repeated item means something different the second
 * time, and the answer is no.
 *
 * The rest of the second list is not a repeat at all — being pregnant is not
 * an emergency and belongs exactly where it is. So the lists stay, and only
 * the repeats come out.
 */

/** Words too common to carry meaning when deciding whether two lines agree. */
const NOISE = new Set([
  'you', 'your', 'have', 'has', 'with', 'from', 'that', 'this', 'they', 'them',
  'when', 'what', 'which', 'while', 'about', 'after', 'before', 'into', 'over',
  'very', 'some', 'any', 'more', 'most', 'other', 'also', 'than', 'then',
  'experience', 'experiencing', 'develop', 'developing', 'feel', 'feeling',
  'notice', 'noticing', 'get', 'getting', 'become', 'becomes', 'becoming',
  'severe', 'severely', 'sudden', 'suddenly', 'unusual', 'unusually',
  'symptoms', 'signs', 'effects', 'side',
]);

/** The words in a line that actually say what it is about. */
const meaningfulWords = (line: string): string[] =>
  line
    .toLowerCase()
    .replace(/[^a-z؀-ۿ\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !NOISE.has(word));

/**
 * Whether `line` already says everything `urgent` says.
 *
 * Each word of the urgent item has to appear in the line, allowing a longer
 * form of the same word — "heartbeat" satisfies "heart" — because the two
 * lists are written in different registers: one in fragments, one in
 * sentences. The direction matters: the urgent item must be covered by the
 * line, not the other way round, or a long sentence would swallow anything
 * that shared a word with it.
 */
const says = (line: string, urgent: string): boolean => {
  const urgentWords = meaningfulWords(urgent);
  if (urgentWords.length === 0) return false;

  const lineWords = meaningfulWords(line);
  return urgentWords.every((word) =>
    lineWords.some((candidate) => candidate === word
      || candidate.startsWith(word)
      || word.startsWith(candidate)));
};

/**
 * The "call your doctor" list with anything already in the urgent list removed.
 *
 * Only exact-in-substance repeats go. A line that merely shares a word with an
 * urgent one — "tremors" beside "trouble breathing" — is a different thing to
 * watch for and stays.
 */
export const withoutUrgentRepeats = (consult: string[], urgent: string[]): string[] =>
  consult.filter((line) => !urgent.some((item) => says(line, item)));
