/**
 * Unit tests for the palette re-theme replacement engine (scripts/retheme.ts,
 * docs/fork-checklist.md § Re-theming the palette).
 *
 * Exercises the PURE helpers only — no filesystem walk, no colors changed
 * anywhere. The template board keeps its teal; these tests prove the codemod
 * a fork runs is total (hex case-insensitivity, rgb/rgba alpha preservation)
 * and surgical (no-op on every non-palette color).
 */
import { describe, expect, it } from 'vitest';
import {
    PALETTE_ROLE_NAMES,
    TEMPLATE_PALETTE,
    buildReplacementRules,
    countPaletteSurvivors,
    replacePaletteColors,
    type TargetPalette,
} from '@/scripts/retheme';

/** The canonical teal → deep-berry mapping (docs/examples/palette-deep-berry.json). */
const DEEP_BERRY: TargetPalette = {
    primary: '#BE185D',
    primaryDark: '#9D174D',
    primaryDeep: '#831843',
    primaryLight: '#DB2777',
    pale: '#F472B6',
    paleLight: '#F9A8D4',
    chipLight: '#FBCFE8',
    chip: '#FBCFE8',
    chipTint: '#FCE7F3',
    tint: '#FDF2F8',
};

const RULES = buildReplacementRules(DEEP_BERRY);

const ALL_TEMPLATE_HEXES = PALETTE_ROLE_NAMES.flatMap((role) => [...TEMPLATE_PALETTE[role].hexes]);

describe('buildReplacementRules', () => {
    it('creates one rule per template hex when no target equals its source', () => {
        // 10 roles, primaryDeep carries two template hexes → 11 rules.
        expect(RULES).toHaveLength(ALL_TEMPLATE_HEXES.length);
        expect(RULES).toHaveLength(11);
    });

    it('throws when a role is missing from the target palette', () => {
        const incomplete = { ...DEEP_BERRY } as Record<string, string>;
        delete incomplete.tint;
        expect(() => buildReplacementRules(incomplete as TargetPalette)).toThrow(/missing role 'tint'/);
    });

    it('throws on a malformed hex value', () => {
        expect(() => buildReplacementRules({ ...DEEP_BERRY, primary: 'BE185D' })).toThrow(/6-digit hex/);
        expect(() => buildReplacementRules({ ...DEEP_BERRY, pale: '#F472B' })).toThrow(/6-digit hex/);
    });

    it('skips identity mappings so keeping a template value is a no-op', () => {
        const keepPrimaryTeal = { ...DEEP_BERRY, primary: '#0D9488' };
        const rules = buildReplacementRules(keepPrimaryTeal);
        expect(rules.some((r) => r.role === 'primary')).toBe(false);
        const source = "background: '#0d9488'; border: 1px solid rgba(13,148,136,0.3);";
        const { content, count } = replacePaletteColors(source, rules);
        expect(content).toBe(source);
        expect(count).toBe(0);
    });
});

describe('replacePaletteColors — hex replacement', () => {
    it('matches hexes case-insensitively', () => {
        const source = 'a{color:#0D9488} b{color:#0d9488} c{color:#0f766E}';
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe('a{color:#BE185D} b{color:#BE185D} c{color:#9D174D}');
        expect(count).toBe(3);
    });

    it('rewrites every template hex to its role target', () => {
        const source = ALL_TEMPLATE_HEXES.join(' ');
        const { content, count } = replacePaletteColors(source, RULES);
        expect(count).toBe(ALL_TEMPLATE_HEXES.length);
        for (const hex of ALL_TEMPLATE_HEXES) {
            expect(content.toUpperCase()).not.toContain(hex);
        }
        // Both primaryDeep template hexes collapse onto the single deep target.
        expect(content).toBe(
            '#BE185D #9D174D #831843 #831843 #DB2777 #F472B6 #F9A8D4 #FBCFE8 #FBCFE8 #FCE7F3 #FDF2F8',
        );
        expect(countPaletteSurvivors(content, RULES)).toBe(0);
    });

    it('preserves the 2-digit alpha suffix of #RRGGBBAA literals', () => {
        // The NP Hiring pilot shipped #5eead4cc / #5eead488 (HomepageHero) —
        // a 6-digit-only pass silently skipped them.
        const source = 'box-shadow: 0 0 0 3px #0D9488FF; color: #5eead4cc;';
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe('box-shadow: 0 0 0 3px #BE185DFF; color: #F9A8D4cc;');
        expect(count).toBe(2);
        expect(countPaletteSurvivors(source, RULES)).toBe(2);
        expect(countPaletteSurvivors(content, RULES)).toBe(0);
    });

    it('does not rewrite inside a longer or odd-length hex run', () => {
        const source = 'const hash = "#0D9488FF00"; const odd = "#0d9488a";';
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe(source);
        expect(count).toBe(0);
    });
});

describe('replacePaletteColors — rgb()/rgba() tints', () => {
    it('preserves each alpha and the original comma spacing', () => {
        const cases: Array<[string, string]> = [
            ['rgba(13,148,136,0.3)', 'rgba(190,24,93,0.3)'],
            ['rgba(13, 148, 136, 0.15)', 'rgba(190, 24, 93, 0.15)'],
            ['rgba(45,212,191,.5)', 'rgba(244,114,182,.5)'],
            ['rgba(20,184,166,1)', 'rgba(219,39,119,1)'],
            ['rgba(15, 118, 110, 0.85)', 'rgba(157, 23, 77, 0.85)'],
        ];
        for (const [source, expected] of cases) {
            const { content, count } = replacePaletteColors(source, RULES);
            expect(content).toBe(expected);
            expect(count).toBe(1);
        }
    });

    it('rewrites the plain rgb() form (computed-style comparisons)', () => {
        // components/auth/HeaderAuth.tsx compares against the browser's
        // serialized 'rgb(13, 148, 136)' — the codemod must keep that in sync.
        const source = "const isBrand = bg === 'rgb(13, 148, 136)';";
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe("const isBrand = bg === 'rgb(190, 24, 93)';");
        expect(count).toBe(1);
    });

    it('leaves rgba() forms of non-tint roles alone (chip has rgba: false)', () => {
        const source = 'background: rgba(178,245,234,0.5);'; // #B2F5EA as a triplet
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe(source);
        expect(count).toBe(0);
    });
});

describe('replacePaletteColors — non-palette colors are untouched', () => {
    it('is a no-op on emerald partners, pastels, neutrals, and OG accents', () => {
        const source = [
            "success: '#10B981'", // standalone emerald stays green
            "successDark: '#059669'",
            "successPale: '#D1FAE5'",
            "heroBg: '#a0c3d6'", // per-category pastel hero bg
            "amberFeatured: '#F59E0B'",
            "redError: '#DC2626'",
            "dotTexture: 'rgba(16, 185, 129, 0.15)'", // OG dark-canvas texture (manual-review item)
            "twitter: '#1DA1F2'",
        ].join('\n');
        const { content, count } = replacePaletteColors(source, RULES);
        expect(content).toBe(source);
        expect(count).toBe(0);
    });
});
