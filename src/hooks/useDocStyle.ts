import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

// User-adjustable typography for the HTML resume page (the editor, its read-only
// print mirror, and therefore the "PDF · clean" export). The same values are
// also sent to the LaTeX renderer so `.tex`, PDF preview, and PDF · LaTeX use the
// same rhythm.
export type DocStyle = {
  // Page zoom, Google-Docs style: 1 (= "100%") is the comfortable default page
  // (75% of the pane); width and font scale by the same factor.
  zoom: number;
  lineHeight: number; // body leading
  sectionGap: number; // em between sections
  entryGap: number; // em between entries in a section
  bulletGap: number; // em between bullets
  boldTitles: boolean; // entry title (role / project / school)
  boldHeadings: boolean; // section headings
  boldSkillLabels: boolean; // "Languages:" style labels
  italicSubtitles: boolean; // subtitle + location row
  italicDates: boolean; // the right-aligned date / link slot
  uppercaseHeadings: boolean; // force section headings to ALL CAPS (off = as typed)
  sectionRule: boolean; // the horizontal rule under each section heading
  contactDivider: string; // 1–2 char separator between header contact items
};

export const DOC_STYLE_DEFAULTS: DocStyle = {
  zoom: 1,
  lineHeight: 1.18,
  sectionGap: 0.85,
  entryGap: 0.42,
  bulletGap: 0.2,
  boldTitles: true,
  boldHeadings: false,
  boldSkillLabels: true,
  italicSubtitles: true,
  italicDates: false,
  uppercaseHeadings: true,
  sectionRule: true,
  contactDivider: "|"
};

type DocSpacingPreset = Pick<DocStyle, "lineHeight" | "sectionGap" | "entryGap" | "bulletGap">;

export const DOC_SPACING_PRESETS = {
  compact: {
    label: "Compact",
    values: {
      lineHeight: 1.16,
      sectionGap: 0.48,
      entryGap: 0.24,
      bulletGap: 0.08
    }
  },
  normal: {
    label: "Normal",
    values: {
      lineHeight: DOC_STYLE_DEFAULTS.lineHeight,
      sectionGap: DOC_STYLE_DEFAULTS.sectionGap,
      entryGap: DOC_STYLE_DEFAULTS.entryGap,
      bulletGap: DOC_STYLE_DEFAULTS.bulletGap
    }
  },
  relaxed: {
    label: "Relaxed",
    values: {
      lineHeight: 1.3,
      sectionGap: 1.15,
      entryGap: 0.62,
      bulletGap: 0.34
    }
  }
} as const satisfies Record<string, { label: string; values: DocSpacingPreset }>;

// Google-Docs-style zoom steps for the Resume tab's page-zoom select.
export const DOC_ZOOM_OPTIONS = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5] as const;

const STORAGE_KEY = "jakeforge.docStyle.v1";

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

function coerce(raw: unknown): DocStyle {
  const r = (raw ?? {}) as Partial<Record<keyof DocStyle, unknown>>;
  return {
    zoom: clamp(r.zoom, DOC_STYLE_DEFAULTS.zoom, 0.4, 2),
    lineHeight: clamp(r.lineHeight, DOC_STYLE_DEFAULTS.lineHeight, 1, 1.8),
    sectionGap: clamp(r.sectionGap, DOC_STYLE_DEFAULTS.sectionGap, 0, 2),
    entryGap: clamp(r.entryGap, DOC_STYLE_DEFAULTS.entryGap, 0, 1.6),
    bulletGap: clamp(r.bulletGap, DOC_STYLE_DEFAULTS.bulletGap, 0, 1.2),
    boldTitles: r.boldTitles !== false,
    boldHeadings: r.boldHeadings === true,
    boldSkillLabels: r.boldSkillLabels !== false,
    italicSubtitles: r.italicSubtitles !== false,
    italicDates: r.italicDates === true,
    uppercaseHeadings: r.uppercaseHeadings !== false,
    sectionRule: r.sectionRule !== false,
    // Cap at 2 chars; fall back to "|" when missing (not when intentionally blank).
    contactDivider: typeof r.contactDivider === "string" ? r.contactDivider.slice(0, 2) : DOC_STYLE_DEFAULTS.contactDivider
  };
}

function load(): DocStyle {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return coerce(JSON.parse(raw));
    return { ...DOC_STYLE_DEFAULTS };
  } catch {
    return { ...DOC_STYLE_DEFAULTS };
  }
}

export function useDocStyle() {
  const [style, setStyle] = useState<DocStyle>(load);
  const saveTimer = useRef<number | undefined>(undefined);

  // Persist (debounced — sliders emit a burst of changes per drag).
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
      } catch {
        // Storage unavailable (private mode); the style still applies this session.
      }
    }, 250);
    return () => window.clearTimeout(saveTimer.current);
  }, [style]);

  const cssVars = useMemo(
    () =>
      ({
        "--doc-zoom": String(style.zoom),
        "--doc-line": String(style.lineHeight),
        "--doc-section-gap": `${style.sectionGap}em`,
        "--doc-entry-gap": `${style.entryGap}em`,
        "--doc-bullet-gap": `${style.bulletGap}em`,
        "--doc-title-weight": style.boldTitles ? "700" : "400",
        "--doc-heading-weight": style.boldHeadings ? "700" : "400",
        "--doc-skill-label-weight": style.boldSkillLabels ? "700" : "400",
        "--doc-subtitle-style": style.italicSubtitles ? "italic" : "normal",
        "--doc-date-style": style.italicDates ? "italic" : "normal",
        "--doc-heading-transform": style.uppercaseHeadings ? "uppercase" : "none",
        "--doc-rule-width": style.sectionRule ? "1px" : "0",
        // Quoted so it's a valid CSS `content` <string> token.
        "--doc-contact-divider": JSON.stringify(style.contactDivider)
      }) as CSSProperties,
    [style]
  );

  function set<K extends keyof DocStyle>(key: K, value: DocStyle[K]) {
    setStyle((current) => ({ ...current, [key]: value }));
  }

  // Reset only the typography fields (toggles + contact divider). Zoom and the
  // spacing values are left as-is — the spacing presets already act as a reset
  // for those.
  const TYPOGRAPHY_DEFAULTS = {
    boldTitles: DOC_STYLE_DEFAULTS.boldTitles,
    boldHeadings: DOC_STYLE_DEFAULTS.boldHeadings,
    boldSkillLabels: DOC_STYLE_DEFAULTS.boldSkillLabels,
    italicSubtitles: DOC_STYLE_DEFAULTS.italicSubtitles,
    italicDates: DOC_STYLE_DEFAULTS.italicDates,
    uppercaseHeadings: DOC_STYLE_DEFAULTS.uppercaseHeadings,
    sectionRule: DOC_STYLE_DEFAULTS.sectionRule,
    contactDivider: DOC_STYLE_DEFAULTS.contactDivider
  } satisfies Partial<DocStyle>;

  function resetTypography() {
    setStyle((current) => ({ ...current, ...TYPOGRAPHY_DEFAULTS }));
  }

  function applySpacingPreset(preset: DocSpacingPreset) {
    setStyle((current) => ({ ...current, ...preset }));
  }

  const isTypographyDefault = useMemo(
    () => (Object.keys(TYPOGRAPHY_DEFAULTS) as (keyof typeof TYPOGRAPHY_DEFAULTS)[]).every((k) => style[k] === TYPOGRAPHY_DEFAULTS[k]),
    [style]
  );

  return { style, set, resetTypography, applySpacingPreset, isTypographyDefault, cssVars };
}

export type DocStyleControls = ReturnType<typeof useDocStyle>;
