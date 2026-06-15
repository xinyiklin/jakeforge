import {
  newBullet,
  newEntry,
  newSection,
  newSkillEntry,
  type ResumeData,
  type ResumeEntry,
  type ResumeSectionData
} from "./lib/resumeData";

// Build a structured entry directly (skipping the text parser, whose spaced-dash
// → column heuristic would mangle date ranges like "Jun. 2025 – Aug. 2025").
function entry(
  titleLeft: string,
  subtitleLeft: string,
  titleRight: string,
  subtitleRight: string,
  bullets: string[]
): ResumeEntry {
  return {
    ...newEntry({ titleLeft, subtitleLeft, titleRight, subtitleRight }),
    bullets: bullets.map((text) => newBullet(text))
  };
}

function section(heading: string, type: ResumeSectionData["type"], items: ResumeEntry[]): ResumeSectionData {
  return { ...newSection(type, heading), items };
}

// The fill-in-the-blanks starter — a Jake's-template skeleton with placeholder
// prompts (mirrors role-fit-ai's `jakes-starter.tex`). It is both the first-run
// default and what the "Load sample" button restores, so a new user types over
// guidance instead of clearing out a stranger's resume.
export function buildStarterResume(): ResumeData {
  return {
    name: "Your Name",
    contact: ["you@email.com", "linkedin.com/in/yourprofile", "github.com/yourusername", "City, State"],
    sections: [
      section("Education", "standard", [
        entry("University Name", "B.S. in Computer Science", "Aug. 2022 – May 2026", "City, State", [])
      ]),
      section("Experience", "standard", [
        entry("Company Name", "Software Engineering Intern", "Jun. 2025 – Aug. 2025", "City, State", [
          "Accomplishment with a metric — what you built, shipped, or improved and by how much.",
          "Second accomplishment. Keep each bullet to one tight sentence."
        ]),
        entry("Another Company", "Role Title", "Jan. 2025 – May 2025", "Remote", [
          "What you owned and what the outcome was."
        ])
      ]),
      section("Projects", "standard", [
        entry("Project Name", "React, Node.js, PostgreSQL", "", "", [
          "One-sentence description of what the project does and your role in building it.",
          "Technical detail or user impact worth calling out."
        ]),
        entry("Another Project", "Python, FastAPI", "", "", [
          "What it does and what you learned or shipped."
        ])
      ]),
      section("Technical Skills", "skills", [
        newSkillEntry("Languages", "Python, TypeScript, JavaScript, SQL, Java"),
        newSkillEntry("Frameworks", "React, Node.js, Express, FastAPI"),
        newSkillEntry("Tools", "Git, Docker, AWS, PostgreSQL, Redis")
      ])
    ]
  };
}

// Regenerate every id when rehydrating saved JSON. The module-level id counter in
// resumeData.ts resets to 0 on reload, so freshly added rows would otherwise
// collide with the saved "section-1"/"entry-2" ids. New ids here use distinct
// prefixes so they can never clash with the counter's later output.
let rehydrateCounter = 0;
export function reidResume(data: ResumeData): ResumeData {
  const id = (prefix: string) => `seed-${prefix}-${(rehydrateCounter += 1)}`;
  return {
    name: data.name ?? "",
    contact: Array.isArray(data.contact) ? [...data.contact] : [],
    sections: (data.sections ?? []).map((s) => ({
      id: id("section"),
      heading: s.heading ?? "",
      type: s.type ?? "standard",
      items: (s.items ?? []).map((it) => ({
        id: id("entry"),
        titleLeft: it.titleLeft ?? "",
        titleRight: it.titleRight ?? "",
        subtitleLeft: it.subtitleLeft ?? "",
        subtitleRight: it.subtitleRight ?? "",
        bullets: (it.bullets ?? []).map((b) => ({ id: id("bullet"), text: b.text ?? "" }))
      }))
    }))
  };
}
