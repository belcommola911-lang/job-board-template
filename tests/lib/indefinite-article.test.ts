import { describe, it, expect } from 'vitest';
import { indefinite, Indefinite } from '@/lib/utils/indefinite-article';

describe('indefinite()', () => {
    it('uses the spoken letter name for initialisms', () => {
        // P → "pee" (consonant sound), C → "see" (consonant sound).
        expect(indefinite('PMHNP')).toBe('a PMHNP');
        expect(indefinite('CRNA')).toBe('a CRNA');
        // N → "en", F → "ef", M → "em" (vowel sounds).
        expect(indefinite('NP')).toBe('an NP');
        expect(indefinite('FNP')).toBe('an FNP');
        expect(indefinite('MD')).toBe('an MD');
    });

    it('uses the spelling rule for ordinary words', () => {
        expect(indefinite('nurse practitioner')).toBe('a nurse practitioner');
        expect(indefinite('advanced practice')).toBe('an advanced practice');
    });

    it('judges multi-word terms by the first word only', () => {
        // 'Psychiatric' is Title Case, not an initialism → spelling rule.
        expect(indefinite('Psychiatric NP')).toBe('a Psychiatric NP');
        expect(indefinite('psychiatric mental health nurse practitioner'))
            .toBe('a psychiatric mental health nurse practitioner');
    });

    it('applies documented overrides (silent h, "yoo" u-words)', () => {
        expect(indefinite('hourly rate')).toBe('an hourly rate');
        expect(indefinite('honest review')).toBe('an honest review');
        expect(indefinite('university hospital')).toBe('a university hospital');
        expect(indefinite('unique opportunity')).toBe('a unique opportunity');
    });
});

describe('Indefinite()', () => {
    it('capitalizes the article for sentence starts', () => {
        expect(Indefinite('PMHNP')).toBe('A PMHNP');
        expect(Indefinite('NP')).toBe('An NP');
        expect(Indefinite('FNP')).toBe('An FNP');
        expect(Indefinite('nurse practitioner')).toBe('A nurse practitioner');
        expect(Indefinite('advanced practice')).toBe('An advanced practice');
    });
});
