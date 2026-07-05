/**
 * Indefinite-article helper for brand.niche tokens.
 *
 * Rendered copy must never hardcode "a "/"an " in front of a niche token:
 * `a ${brand.niche.short}` reads fine on the PMHNP template ("a PMHNP") but
 * breaks the moment a fork swaps the token for one that takes the other
 * article ("an NP", "an FNP", "an MD"). Compose the article + token with
 * `indefinite()` / `Indefinite()` instead.
 *
 * Decision rules (in order):
 *
 *  1. OVERRIDES — a small, documented map for words English spells one way
 *     and speaks another: silent-h words ("an hour", "an honest…") and
 *     "yoo"-sounding u-words ("a university", "a unique…"). Extend per fork
 *     if a niche token hits a new edge case.
 *
 *  2. Initialism rule — if the first word starts with 2+ capital letters
 *     (e.g. 'PMHNP', 'NP', 'FNP-C', 'CRNA'), it is read letter by letter,
 *     so the article follows the SPOKEN NAME of the first letter. Letters
 *     whose names start with a vowel sound take "an":
 *       A ("ay"), E ("ee"), F ("ef"), H ("aitch"), I ("eye"), L ("el"),
 *       M ("em"), N ("en"), O ("oh"), R ("ar"), S ("es"), X ("ex").
 *     Everything else takes "a" (P → "pee" → "a PMHNP", C → "see" → "a CRNA").
 *
 *  3. Spelling rule — for ordinary words, first letter a/e/i/o/u → "an",
 *     otherwise "a" ("a nurse practitioner", "an advanced practice").
 */

/** Initialism letters whose spoken names begin with a vowel sound. */
const VOWEL_SOUND_LETTER_NAMES = new Set([
    'A', 'E', 'F', 'H', 'I', 'L', 'M', 'N', 'O', 'R', 'S', 'X',
]);

const VOWEL_LETTERS = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * Documented exceptions to the spelling rule, keyed by the lowercased first
 * word of the term. Silent-h words sound vowel-initial; "yoo"-sounding
 * u-words sound consonant-initial.
 */
const OVERRIDES: Readonly<Record<string, 'a' | 'an'>> = {
    // Silent h → vowel sound.
    heir: 'an',
    heirloom: 'an',
    honest: 'an',
    honor: 'an',
    honorary: 'an',
    hour: 'an',
    hourly: 'an',
    // "yoo"/"wuh" onset → consonant sound.
    european: 'a',
    once: 'a',
    one: 'a',
    unicorn: 'a',
    unique: 'a',
    unit: 'a',
    university: 'a',
    user: 'a',
};

function articleFor(term: string): 'a' | 'an' {
    const firstWord = term.trim().split(/\s+/)[0] ?? '';
    if (firstWord === '') return 'a';

    const override = OVERRIDES[firstWord.toLowerCase()];
    if (override) return override;

    // ALL-CAPS initialism-like first word: judge by the first letter's
    // spoken name ("en", "ef", "pee", …), not its spelling.
    if (/^[A-Z]{2,}/.test(firstWord)) {
        return VOWEL_SOUND_LETTER_NAMES.has(firstWord[0]) ? 'an' : 'a';
    }

    return VOWEL_LETTERS.has(firstWord[0].toLowerCase()) ? 'an' : 'a';
}

/** `indefinite('NP')` → `'an NP'`; `indefinite('PMHNP')` → `'a PMHNP'`. */
export function indefinite(term: string): string {
    return `${articleFor(term)} ${term}`;
}

/**
 * Sentence-start variant: capitalized article.
 * `Indefinite('NP')` → `'An NP'`; `Indefinite('PMHNP')` → `'A PMHNP'`.
 */
export function Indefinite(term: string): string {
    return `${articleFor(term) === 'an' ? 'An' : 'A'} ${term}`;
}
