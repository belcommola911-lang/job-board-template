/**
 * Auto Internal Linking System (A24)
 *
 * Scans text content and auto-links relevant keywords to internal pages.
 * This extends the existing `autoLinkStates()` pattern from lib/blog.ts
 * to cover job categories, employment types, and career resources.
 *
 * PER-FORK NOTE: the matching patterns are built from `brand.niche` tokens
 * (short + adjective), so they retarget automatically when a fork edits
 * config/brand.ts. One residue remains: the colloquial 'psych NP' spelling
 * (LEGACY_COLLOQUIAL_ROLE below) has no brand token to derive from — it is
 * the reference niche's slang abbreviation, kept literal so matching on the
 * template is unchanged. Forks should replace it with their own colloquial
 * role spelling (or drop it); the niche-copy debt scanner counts it.
 */

import { brand } from '@/config/brand';

/** Escape a literal string for embedding in a RegExp. */
function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Colloquial role spelling with no `brand.niche` source token (see the
 * per-fork note in the file header). RegExp-source fragment, not a literal.
 */
const LEGACY_COLLOQUIAL_ROLE = 'psych\\s+NP';

/**
 * Alternation of the role spellings the auto-linker recognizes. Order and
 * membership intentionally mirror the original hardcoded alternation
 * (PMHNP|psychiatric|psych\s+NP) so matching behavior on the template is
 * byte-identical: `brand.niche.medium` ('Psychiatric NP') is deliberately
 * NOT added — the original patterns never matched that spelling, and adding
 * it would change which phrases get linked.
 */
const NICHE_ROLE_ALTERNATION = [
    escapeRegex(brand.niche.short),
    escapeRegex(brand.niche.adjective),
    LEGACY_COLLOQUIAL_ROLE,
].join('|');

const JOB_NOUN = '(?:jobs?|positions?|opportunities?)';

/** `<qualifier> <role> jobs/positions/opportunities` matcher. */
function nicheJobsPattern(qualifier: string): RegExp {
    return new RegExp(
        `\\b(${qualifier}\\s+(?:${NICHE_ROLE_ALTERNATION})\\s+${JOB_NOUN})\\b`,
        'gi',
    );
}

// Category keywords → internal page mappings
const CATEGORY_LINKS: { pattern: RegExp; href: string; label: string }[] = [
    // Employment types
    { pattern: nicheJobsPattern('remote'), href: '/jobs/remote', label: `remote ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('telehealth'), href: '/jobs/telehealth', label: `telehealth ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('travel'), href: '/jobs/travel', label: `travel ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('per\\s*[-\\s]?diem'), href: '/jobs/per-diem', label: `per diem ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('inpatient'), href: '/jobs/inpatient', label: `inpatient ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('outpatient'), href: '/jobs/outpatient', label: `outpatient ${brand.niche.short} jobs` },

    // Specialties
    { pattern: nicheJobsPattern('new\\s*[-\\s]?grad'), href: '/jobs/new-grad', label: `new grad ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('child\\s+(?:and\\s+)?adolescent'), href: '/jobs/child-adolescent', label: `child & adolescent ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('substance\\s+abuse'), href: '/jobs/substance-abuse', label: `substance abuse ${brand.niche.short} jobs` },
    { pattern: nicheJobsPattern('addiction'), href: '/jobs/addiction', label: `addiction ${brand.niche.short} jobs` },

    // Resources
    { pattern: new RegExp(`\\b(${escapeRegex(brand.niche.short)}\\s+salary\\s+(?:guide|data|information|comparison))\\b`, 'gi'), href: '/salary-guide', label: `${brand.niche.short} salary guide` },
    { pattern: new RegExp(`\\b(${escapeRegex(brand.niche.short)}\\s+job\\s+alerts?)\\b`, 'gi'), href: '/job-alerts', label: `${brand.niche.short} job alerts` },
];

// Link limit per article to avoid over-optimization
const MAX_LINKS_PER_CONTENT = 5;

/**
 * Auto-link category keywords in HTML content.
 * Skips content inside existing <a> tags, <code>, and headings.
 * Each pattern is linked at most once per content block.
 */
export function autoLinkCategories(html: string): string {
    let linksAdded = 0;
    let result = html;

    for (const { pattern, href, label } of CATEGORY_LINKS) {
        if (linksAdded >= MAX_LINKS_PER_CONTENT) break;

        // Reset regex state
        pattern.lastIndex = 0;

        // Only replace the first occurrence
        const match = pattern.exec(result);
        if (!match) continue;

        const matchIndex = match.index;

        // Check if this match is inside an existing tag (simplified check)
        const beforeMatch = result.slice(0, matchIndex);
        const openTags = (beforeMatch.match(/<a[\s>]/gi) || []).length;
        const closeTags = (beforeMatch.match(/<\/a>/gi) || []).length;
        if (openTags > closeTags) continue; // Inside an <a> tag

        // Check if inside <code> or <h1-h6>
        const lastOpenCode = beforeMatch.lastIndexOf('<code');
        const lastCloseCode = beforeMatch.lastIndexOf('</code>');
        if (lastOpenCode > lastCloseCode) continue;

        const lastOpenHeading = Math.max(
            beforeMatch.lastIndexOf('<h1'), beforeMatch.lastIndexOf('<h2'),
            beforeMatch.lastIndexOf('<h3'), beforeMatch.lastIndexOf('<h4'),
        );
        const lastCloseHeading = Math.max(
            beforeMatch.lastIndexOf('</h1>'), beforeMatch.lastIndexOf('</h2>'),
            beforeMatch.lastIndexOf('</h3>'), beforeMatch.lastIndexOf('</h4>'),
        );
        if (lastOpenHeading > lastCloseHeading) continue;

        // Replace this occurrence with an internal link
        const replacement = `<a href="${href}" class="text-teal-600 hover:underline font-medium" title="Browse ${label}">${match[0]}</a>`;

        result =
            result.slice(0, matchIndex) +
            replacement +
            result.slice(matchIndex + match[0].length);

        linksAdded++;
    }

    return result;
}

/**
 * Generate "Related Resources" links for a job page based on job attributes.
 * Returns an array of { label, href } objects for rendering.
 */
export function getJobRelatedResources(job: {
    state?: string | null;
    stateCode?: string | null;
    isRemote?: boolean | null;
    mode?: string | null;
    jobType?: string | null;
    title?: string;
}): { label: string; href: string }[] {
    const links: { label: string; href: string }[] = [];

    // State page
    if (job.state) {
        const stateSlug = job.state.toLowerCase().replace(/\s+/g, '-');
        links.push({
            label: `All ${brand.niche.short} Jobs in ${job.state}`,
            href: `/jobs/state/${stateSlug}`,
        });
    }

    // Work mode
    if (job.isRemote) {
        links.push({ label: `Remote ${brand.niche.short} Jobs`, href: '/jobs/remote' });
    }
    if (job.mode?.toLowerCase().includes('telehealth')) {
        links.push({ label: `Telehealth ${brand.niche.short} Jobs`, href: '/jobs/telehealth' });
    }

    // Job type
    if (job.jobType?.toLowerCase() === 'per diem') {
        links.push({ label: `Per Diem ${brand.niche.short} Jobs`, href: '/jobs/per-diem' });
    } else if (job.jobType?.toLowerCase() === 'travel') {
        links.push({ label: `Travel ${brand.niche.short} Jobs`, href: '/jobs/travel' });
    }

    // Title-based specialties
    const titleLower = job.title?.toLowerCase() || '';
    if (titleLower.includes('new grad') || titleLower.includes('entry level')) {
        links.push({ label: `New Grad ${brand.niche.short} Jobs`, href: '/jobs/new-grad' });
    }
    if (titleLower.includes('child') || titleLower.includes('adolescent') || titleLower.includes('pediatric')) {
        links.push({ label: `Child & Adolescent ${brand.niche.short} Jobs`, href: '/jobs/child-adolescent' });
    }
    if (titleLower.includes('substance') || titleLower.includes('addiction')) {
        links.push({ label: `Addiction ${brand.niche.short} Jobs`, href: '/jobs/addiction' });
    }
    if (titleLower.includes('inpatient')) {
        links.push({ label: `Inpatient ${brand.niche.short} Jobs`, href: '/jobs/inpatient' });
    }
    if (titleLower.includes('outpatient')) {
        links.push({ label: `Outpatient ${brand.niche.short} Jobs`, href: '/jobs/outpatient' });
    }

    // Always add salary guide
    links.push({ label: `2026 ${brand.niche.short} Salary Guide`, href: '/salary-guide' });

    return links;
}
