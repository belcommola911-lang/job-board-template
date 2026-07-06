/**
 * Palette re-theme codemod — swaps the template's TEAL brand family for a
 * fork's target palette in one reviewable pass.
 *
 * The template board KEEPS its teal: this is fork-time tooling only (see
 * docs/fork-checklist.md § Re-theming the palette). It rewrites hex and
 * rgb()/rgba() literals of the teal family (TEMPLATE_PALETTE below) across
 * the rendered surfaces:
 *
 *     app/**  components/**  lib/**      (.ts / .tsx / .css)
 *     public/site.webmanifest
 *
 * Replacement rules:
 *   - hex matching is CASE-INSENSITIVE (#0d9488 == #0D9488); the 8-digit
 *     #RRGGBBAA form is rewritten with its 2-digit alpha suffix preserved
 *     (#0D9488CC → <primary>CC), while longer/odd hex runs are left alone;
 *   - rgb(r, g, b) / rgba(r, g, b, a) forms of the roles flagged `rgba` are
 *     rewritten to the target's RGB, PRESERVING each alpha and the original
 *     comma spacing;
 *   - anything not in TEMPLATE_PALETTE is untouched: semantic success
 *     greens, cream/ink/peach neutrals, amber 'featured', red error, blue
 *     info, per-category pastel hero bgColors, third-party brand colors.
 *
 * Judgment calls are deliberately NOT automated — every run ends with a
 * MANUAL REVIEW list (teal+emerald brand gradients, OG dark-canvas accents,
 * email V2 palette object, widget CSS vars, out-of-scope surfaces).
 *
 * Usage:
 *   npm run retheme -- docs/examples/palette-deep-berry.json           # dry-run (default)
 *   npm run retheme -- docs/examples/palette-deep-berry.json --apply   # write changes
 *
 * Exit codes:
 *   0 — ran clean (dry-run or apply)
 *   1 — usage/validation error, or verification found surviving old-palette values
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── the template's teal family, in role form ───────────────────────────────

export const PALETTE_ROLE_NAMES = [
    'primary',
    'primaryDark',
    'primaryDeep',
    'primaryLight',
    'pale',
    'paleLight',
    'chipLight',
    'chip',
    'chipTint',
    'tint',
] as const;

export type PaletteRoleName = (typeof PALETTE_ROLE_NAMES)[number];

export interface TemplateRole {
    /** Template hexes retired by this role (uppercase '#RRGGBB'). */
    hexes: ReadonlyArray<string>;
    /** Whether the codebase also uses rgb()/rgba() tints of this role. */
    rgba: boolean;
}

/**
 * The teal family as shipped by the template. A fork supplies a target hex
 * per ROLE (JSON file — see docs/examples/palette-deep-berry.json); the
 * rgba/rgb tint triplets are derived from the role hexes automatically.
 */
export const TEMPLATE_PALETTE: Readonly<Record<PaletteRoleName, TemplateRole>> = {
    primary: { hexes: ['#0D9488'], rgba: true }, // teal-600 — buttons, links, focus
    primaryDark: { hexes: ['#0F766E'], rgba: true }, // teal-700 — hovers, gradient dark stop
    primaryDeep: { hexes: ['#115E59', '#134E4A'], rgba: false }, // teal-800/900 — deep headings
    primaryLight: { hexes: ['#14B8A6'], rgba: true }, // teal-500 — icons, secondary accents
    pale: { hexes: ['#2DD4BF'], rgba: true }, // teal-400 — pale accent, gradient light stop
    paleLight: { hexes: ['#5EEAD4'], rgba: false }, // teal-300
    chipLight: { hexes: ['#99F6E4'], rgba: false }, // teal-200
    chip: { hexes: ['#B2F5EA'], rgba: false }, // chip / badge background
    chipTint: { hexes: ['#CCFBF1'], rgba: false }, // teal-100
    tint: { hexes: ['#F0FDFA'], rgba: false }, // teal-50 — tinted section backgrounds
};

/** A fork's replacement palette: one hex per role. */
export type TargetPalette = Record<PaletteRoleName, string>;

// ─── pure replacement engine (unit-tested: tests/lib/retheme.test.ts) ───────

export interface ReplacementRule {
    role: PaletteRoleName;
    /** Template hex being retired (uppercase '#RRGGBB'). */
    fromHex: string;
    /** Replacement hex (uppercase '#RRGGBB'). */
    toHex: string;
    /** Also rewrite rgb()/rgba() forms of fromHex, preserving alpha. */
    rewriteRgb: boolean;
}

export interface ReplaceResult {
    content: string;
    count: number;
}

const HEX_SHAPE = /^#[0-9A-Fa-f]{6}$/;

function hexToRgbTriplet(hex: string): [number, number, number] {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}

/**
 * Expands a target palette into concrete replacement rules. Validates every
 * role is present and a 6-digit hex; SKIPS identity mappings (target hex ==
 * template hex) so running the template's own palette is a total no-op.
 */
export function buildReplacementRules(target: TargetPalette): ReplacementRule[] {
    const rules: ReplacementRule[] = [];
    for (const role of PALETTE_ROLE_NAMES) {
        const raw = target[role];
        if (typeof raw !== 'string') {
            throw new Error(
                `[retheme] target palette is missing role '${role}' — every TEMPLATE_PALETTE role must be present (see docs/examples/palette-deep-berry.json)`,
            );
        }
        const toHex = raw.toUpperCase();
        if (!HEX_SHAPE.test(toHex)) {
            throw new Error(
                `[retheme] target palette role '${role}' is '${raw}' — expected a 6-digit hex like #BE185D`,
            );
        }
        const template = TEMPLATE_PALETTE[role];
        for (const fromHex of template.hexes) {
            if (fromHex === toHex) continue; // identity — nothing to rewrite for this hex
            rules.push({ role, fromHex, toHex, rewriteRgb: template.rgba });
        }
    }
    return rules;
}

/**
 * Applies the rules to one file's content. Pure: returns a NEW string plus
 * the number of replacements; never mutates inputs, never touches the
 * filesystem. Hexes match case-insensitively; rgb()/rgba() forms keep their
 * original comma spacing and (for rgba) the exact alpha.
 */
export function replacePaletteColors(
    content: string,
    rules: ReadonlyArray<ReplacementRule>,
): ReplaceResult {
    let out = content;
    let count = 0;
    for (const rule of rules) {
        const hexBody = rule.fromHex.slice(1);
        // Optional #RRGGBBAA alpha suffix is captured and re-emitted verbatim
        // (the NP Hiring pilot shipped #5eead4cc-style literals).
        const hexRe = new RegExp(`#${hexBody}([0-9A-Fa-f]{2})?(?![0-9A-Fa-f])`, 'gi');
        out = out.replace(hexRe, (_m, alpha: string | undefined) => {
            count += 1;
            return alpha ? `${rule.toHex}${alpha}` : rule.toHex;
        });
        if (!rule.rewriteRgb) continue;
        const [r, g, b] = hexToRgbTriplet(rule.fromHex);
        const [tr, tg, tb] = hexToRgbTriplet(rule.toHex);
        const rgbaRe = new RegExp(
            String.raw`rgba\(\s*${r}(\s*,\s*)${g}(\s*,\s*)${b}(\s*,\s*)([0-9]*\.?[0-9]+%?)\s*\)`,
            'g',
        );
        out = out.replace(rgbaRe, (_m, s1: string, s2: string, s3: string, alpha: string) => {
            count += 1;
            return `rgba(${tr}${s1}${tg}${s2}${tb}${s3}${alpha})`;
        });
        const rgbRe = new RegExp(String.raw`rgb\(\s*${r}(\s*,\s*)${g}(\s*,\s*)${b}\s*\)`, 'g');
        out = out.replace(rgbRe, (_m, s1: string, s2: string) => {
            count += 1;
            return `rgb(${tr}${s1}${tg}${s2}${tb})`;
        });
    }
    return { content: out, count };
}

/** Counts surviving OLD-palette literals (hex or rgb/rgba triplet) in content. */
export function countPaletteSurvivors(
    content: string,
    rules: ReadonlyArray<ReplacementRule>,
): number {
    let n = 0;
    const seen = new Set<string>();
    for (const rule of rules) {
        if (seen.has(rule.fromHex)) continue;
        seen.add(rule.fromHex);
        const hexRe = new RegExp(`#${rule.fromHex.slice(1)}(?:[0-9A-Fa-f]{2})?(?![0-9A-Fa-f])`, 'gi');
        n += (content.match(hexRe) ?? []).length;
        if (!rule.rewriteRgb) continue;
        const [r, g, b] = hexToRgbTriplet(rule.fromHex);
        const tripletRe = new RegExp(String.raw`rgba?\(\s*${r}\s*,\s*${g}\s*,\s*${b}\b`, 'g');
        n += (content.match(tripletRe) ?? []).length;
    }
    return n;
}

// ─── file collection (rendered surfaces only) ───────────────────────────────

const SCAN_DIRS: ReadonlyArray<string> = ['app', 'components', 'lib'];
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const SCAN_ROOT_FILES: ReadonlyArray<string> = ['public/site.webmanifest'];
const EXCLUDE_DIR_NAMES = new Set(['node_modules', '.next', '.git']);

function walk(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(full, out);
        } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            out.push(full);
        }
    }
}

function collectTargetFiles(root: string): string[] {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) {
        const abs = path.join(root, dir);
        if (fs.existsSync(abs)) walk(abs, files);
    }
    for (const rel of SCAN_ROOT_FILES) {
        const abs = path.join(root, rel);
        if (fs.existsSync(abs)) files.push(abs);
    }
    return files;
}

// ─── palette file loading ───────────────────────────────────────────────────

function loadTargetPalette(filePath: string): { name: string; roles: TargetPalette } {
    let raw: string;
    try {
        raw = fs.readFileSync(filePath, 'utf-8');
    } catch (error: unknown) {
        throw new Error(
            `[retheme] cannot read palette file '${filePath}': ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error: unknown) {
        throw new Error(
            `[retheme] palette file '${filePath}' is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`[retheme] palette file '${filePath}' must be a JSON object`);
    }
    const obj = parsed as Record<string, unknown>;
    const roles = obj.roles;
    if (typeof roles !== 'object' || roles === null || Array.isArray(roles)) {
        throw new Error(
            `[retheme] palette file '${filePath}' must have a 'roles' object — copy docs/examples/palette-deep-berry.json`,
        );
    }
    const known = new Set<string>(PALETTE_ROLE_NAMES);
    const unknown = Object.keys(roles as Record<string, unknown>).filter((k) => !known.has(k));
    if (unknown.length > 0) {
        throw new Error(
            `[retheme] unknown role key(s) in '${filePath}': ${unknown.join(', ')} — valid roles: ${PALETTE_ROLE_NAMES.join(', ')}`,
        );
    }
    const name = typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : path.basename(filePath);
    // buildReplacementRules() validates presence + hex shape of every role.
    return { name, roles: roles as TargetPalette };
}

// ─── reporting ──────────────────────────────────────────────────────────────

interface FileOutcome {
    rel: string;
    count: number;
    content: string;
}

function printPerFileCounts(changed: ReadonlyArray<FileOutcome>, scanned: number, apply: boolean): void {
    console.log(`\n── PER-FILE CHANGES ${'─'.repeat(52)}`);
    const sorted = [...changed].sort((a, b) => b.count - a.count || a.rel.localeCompare(b.rel));
    for (const { rel, count } of sorted) {
        console.log(`  ${rel.padEnd(64)} ${String(count).padStart(4)}`);
    }
    const total = changed.reduce((sum, f) => sum + f.count, 0);
    console.log(
        `\n  ${apply ? 'CHANGED' : 'WOULD CHANGE'}: ${total} replacement(s) across ${changed.length} file(s) (${scanned} scanned)`,
    );
}

function printVerification(outcomes: ReadonlyArray<FileOutcome>, rules: ReadonlyArray<ReplacementRule>, apply: boolean): number {
    console.log(`\n── VERIFICATION — surviving old-palette values ${'─'.repeat(25)}`);
    if (!apply) {
        console.log('  (dry-run: verifying the WOULD-BE result, nothing was written)');
    }
    const survivors = outcomes
        .map(({ rel, content }) => ({ rel, n: countPaletteSurvivors(content, rules) }))
        .filter(({ n }) => n > 0)
        .sort((a, b) => b.n - a.n || a.rel.localeCompare(b.rel));
    if (survivors.length === 0) {
        console.log('  ✅ none — every template-palette literal in scope was rewritten');
        return 0;
    }
    let total = 0;
    for (const { rel, n } of survivors) {
        total += n;
        console.log(`  ❌ ${rel} (${n})`);
    }
    console.log(`  ❌ ${total} surviving old-palette value(s) across ${survivors.length} file(s)`);
    return total;
}

/** Per-file counts of a regex across the FINAL contents, as 'rel (n)' lines. */
function matchReport(outcomes: ReadonlyArray<FileOutcome>, re: RegExp, onlyPrefix?: string): string[] {
    const lines: string[] = [];
    for (const { rel, content } of outcomes) {
        if (onlyPrefix && !rel.startsWith(onlyPrefix)) continue;
        const n = (content.match(re) ?? []).length;
        if (n > 0) lines.push(`${rel} (${n})`);
    }
    return lines;
}

function printManualReview(outcomes: ReadonlyArray<FileOutcome>): void {
    console.log(`\n── MANUAL REVIEW — judgment the codemod deliberately does NOT automate ──`);

    const gradientHits = matchReport(outcomes, /linear-gradient\([^)\n]*#(?:10B981|059669)/gi);
    console.log(`
  1. TEAL+EMERALD BRAND GRADIENTS — gradients that paired the old primary
     with an emerald partner (#10B981 / #059669) now mix your NEW primary
     with the OLD emerald. Make BOTH stops the new brand (primary →
     primaryDark). Emerald used ALONE for success states/badges stays
     GREEN — do not sweep #10B981/#059669 globally.
     Candidate lines (linear-gradient(...) still containing an emerald stop):`);
    if (gradientHits.length === 0) {
        console.log('       (none found)');
    } else {
        for (const line of gradientHits) console.log(`       - ${line}`);
    }

    const ogDotHits = matchReport(outcomes, /rgba\(\s*16\s*,\s*185\s*,\s*129\b/g, 'app/api/og/');
    const ogAccentHits = matchReport(outcomes, /#10B981(?![0-9A-Fa-f])/gi, 'app/api/og/');
    console.log(`
  2. OG ROUTES' DARK-CANVAS ACCENTS (app/api/og/*) — the rgba(16,185,129,X)
     dot texture and #10B981 text accents sit on the dark OG canvas and
     should follow the brand: rgba(16,185,129,X) → your primaryLight
     triplet (keep each alpha X); #10B981 accents → your pale hex.
     (#2DD4BF accents were already rewritten to 'pale' automatically.)`);
    const ogLines = [...ogDotHits.map((l) => `${l} rgba dot-texture`), ...ogAccentHits.map((l) => `${l} #10B981 accent`)];
    if (ogLines.length === 0) {
        console.log('       (none found)');
    } else {
        for (const line of ogLines) console.log(`       - ${line}`);
    }

    console.log(`
  3. EMAIL V2 PALETTE OBJECT (lib/email-templates-v2.ts +
     app/api/email-preview/v2-templates.ts) — hex VALUES were rewritten,
     but review by hand: palette keys are still NAMED 'teal'/'tealButton',
     the button gradient pairing and Outlook/MSO fallbacks must stay
     coherent, and email imagery under brand.assets.emailAssetsBase is
     not code — regenerate it in the new palette.

  4. WIDGET CSS VARIABLES (app/widget/route.ts) — the --pd-teal /
     --pd-teal-dark / --pd-mint VALUES were rewritten; the variable NAMES
     are part of the public embed surface (host pages may override them),
     so keep the names unless you version the widget.

  5. OUT OF SCOPE for this codemod — check separately:
       - config/ niche packs (e.g. config/niche/stats.ts accent colors)
         are per-fork authored files;
       - binary /public brand assets (logo, favicons, og-default.png,
         android-chrome-*.png) — regenerate in the new palette;
       - chart palettes only where they reuse the teal family.

  6. DO NOT TOUCH — cream/ink/peach neutrals, amber 'featured', red error,
     blue info, per-category pastel hero bgColors (e.g. #a0c3d6), semantic
     success greens, third-party brand colors (e.g. Twitter blue).`);
}

// ─── main ───────────────────────────────────────────────────────────────────

const USAGE = `Usage:
  npm run retheme -- <target-palette.json>            dry-run (default): report only
  npm run retheme -- <target-palette.json> --apply    write the changes

Example palette: docs/examples/palette-deep-berry.json`;

function main(): void {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        console.log(USAGE);
        process.exit(0);
    }
    const apply = args.includes('--apply');
    const positional = args.filter((a) => !a.startsWith('--'));
    if (positional.length !== 1) {
        console.error(`[retheme] expected exactly one palette file argument\n\n${USAGE}`);
        process.exit(1);
    }

    const palettePath = path.resolve(process.cwd(), positional[0]);
    const { name, roles } = loadTargetPalette(palettePath);
    const rules = buildReplacementRules(roles);

    console.log(`[retheme] target palette: ${name} (${positional[0]})`);
    console.log(`[retheme] mode: ${apply ? 'APPLY — writing files' : 'DRY-RUN — nothing written (pass --apply to write)'}`);
    if (rules.length === 0) {
        console.log('[retheme] target palette is identical to the template palette — nothing to do');
        process.exit(0);
    }
    console.log(`[retheme] ${rules.length} replacement rule(s) over ${SCAN_DIRS.join('/ ')}/ (.ts/.tsx/.css) + ${SCAN_ROOT_FILES.join(', ')}`);

    const root = path.resolve(__dirname, '..');
    const files = collectTargetFiles(root);
    const outcomes: FileOutcome[] = [];
    const changed: FileOutcome[] = [];
    for (const abs of files) {
        const rel = path.relative(root, abs).replace(/\\/g, '/');
        const original = fs.readFileSync(abs, 'utf-8');
        const { content, count } = replacePaletteColors(original, rules);
        const outcome: FileOutcome = { rel, count, content };
        outcomes.push(outcome);
        if (count === 0) continue;
        changed.push(outcome);
        if (apply) fs.writeFileSync(abs, content, 'utf-8');
    }

    printPerFileCounts(changed, files.length, apply);
    const survivors = printVerification(outcomes, rules, apply);
    printManualReview(outcomes);

    if (survivors > 0) {
        console.log('\n[retheme] FAIL — old-palette values survived the rewrite (see VERIFICATION above)');
        process.exit(1);
    }
    console.log(`\n[retheme] ${apply ? 'DONE' : 'DRY-RUN COMPLETE'} — now work the MANUAL REVIEW list above${apply ? '' : ', then re-run with --apply'}`);
    process.exit(0);
}

// Run only when invoked directly (ts-node scripts/retheme.ts …), NOT when the
// pure helpers are imported by tests/lib/retheme.test.ts. argv-based so it
// behaves under both CommonJS ts-node and vitest's ESM transform.
const invokedDirectly = /[\\/]retheme\.(ts|js)$/i.test(process.argv[1] ?? '');
if (invokedDirectly) {
    main();
}
