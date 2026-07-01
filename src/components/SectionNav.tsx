import { useEffect, useState, type RefObject } from "react";

import type { ResumeSectionData } from "../lib/resumeData";

// Extra slack (px) past a section's post-jump resting position within which it
// still counts as active — absorbs zoom/rounding without reaching the previous
// section's territory.
const ACTIVE_SLACK = 25;

function sectionNavLabel(heading: string, index: number) {
  const trimmed = heading.trim();
  return trimmed || `Section ${index + 1}`;
}

// True when the canvas pane scrolls internally (desktop layout); false when the
// page itself scrolls (stacked mobile layout, where .canvas is height:auto).
function elementScrolls(el: HTMLElement) {
  return el.scrollHeight > el.clientHeight + 1;
}

// Sidebar quick-nav over the resume's sections. Owns the active-section state
// and the scroll-spy so scroll ticks re-render only these buttons, not the
// whole app (the resume editor tree is expensive).
export function SectionNav({
  canvasRef,
  sections
}: {
  canvasRef: RefObject<HTMLElement | null>;
  sections: ResumeSectionData[];
}) {
  const [activeNavId, setActiveNavId] = useState<string>("header");

  const navSignature = sections.map((section) => section.id).join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Re-alias so the null-narrowing survives into the nested handlers.
    const canvasEl = canvas;

    function updateActiveFromScroll() {
      const nodes = Array.from(canvasEl.querySelectorAll<HTMLElement>("[data-section-id]"));
      if (!nodes.length) {
        setActiveNavId("header");
        return;
      }
      const usesCanvasScroll = elementScrolls(canvasEl);
      const frameTop = usesCanvasScroll ? canvasEl.getBoundingClientRect().top : 0;

      // At the very bottom the last section may never reach the activation
      // line (the scroll clamps first) — count it as active there so clicking
      // its nav item doesn't leave the previous section highlighted. Only when
      // the scroller actually scrolls; otherwise "at the bottom" is vacuous.
      const scroller = usesCanvasScroll ? canvasEl : document.documentElement;
      if (elementScrolls(scroller) && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1) {
        setActiveNavId(nodes[nodes.length - 1].dataset.sectionId ?? "header");
        return;
      }

      // A section is active once its top reaches where a nav jump would rest
      // it: the scroll container's scroll-padding plus the section's own
      // scroll-margin (both live in CSS and scale with the document font), plus
      // slack. Header is active while no section has crossed that line.
      const scrollPadding = parseFloat(getComputedStyle(canvasEl).scrollPaddingTop) || 0;
      const scrollMargin = parseFloat(getComputedStyle(nodes[0]).scrollMarginTop) || 0;
      const activeLine = scrollPadding + scrollMargin + ACTIVE_SLACK;

      let activeId = "header";
      for (const node of nodes) {
        const top = node.getBoundingClientRect().top - frameTop;
        if (top <= activeLine) activeId = node.dataset.sectionId ?? activeId;
        else break;
      }
      setActiveNavId(activeId);
    }

    // Coalesce scroll/resize bursts to one measurement pass per frame — the
    // handler does N geometry reads and scroll can tick at 120Hz.
    let frame = 0;
    function scheduleUpdate() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateActiveFromScroll();
      });
    }

    function updateActiveFromFocus(event: FocusEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const section = target.closest<HTMLElement>("[data-section-id]");
      setActiveNavId(section?.dataset.sectionId ?? "header");
    }

    updateActiveFromScroll();
    canvasEl.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    canvasEl.addEventListener("focusin", updateActiveFromFocus);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      canvasEl.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      canvasEl.removeEventListener("focusin", updateActiveFromFocus);
      window.removeEventListener("resize", scheduleUpdate);
    };
    // Re-attach when the section list changes so the initial highlight is
    // recomputed against the new DOM; listeners themselves query live.
  }, [canvasRef, navSignature]);

  function jumpToAnchor(anchorId: string) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (anchorId === "header") {
      if (elementScrolls(canvas)) canvas.scrollTo({ top: 0, behavior: "smooth" });
      else canvas.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveNavId("header");
      return;
    }

    const target = canvas.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(anchorId)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveNavId(anchorId);
  }

  return (
    <section className="panel panel--nav">
      <div className="panel__header">
        <h2 className="panel__title">Sections</h2>
        <span className="panel__count">{`${sections.length} ${sections.length === 1 ? "section" : "sections"}`}</span>
      </div>
      <div className="quick-nav" aria-label="Resume navigation">
        <button
          type="button"
          className={`quick-nav__item${activeNavId === "header" ? " is-active" : ""}`}
          aria-current={activeNavId === "header" ? "location" : undefined}
          onClick={() => jumpToAnchor("header")}
        >
          <span className="quick-nav__index">0</span>
          <span className="quick-nav__label">Header</span>
        </button>
        {sections.map((section, index) => (
          <button
            key={section.id}
            type="button"
            className={`quick-nav__item${activeNavId === section.id ? " is-active" : ""}`}
            aria-current={activeNavId === section.id ? "location" : undefined}
            onClick={() => jumpToAnchor(section.id)}
          >
            <span className="quick-nav__index">{index + 1}</span>
            <span className="quick-nav__label">{sectionNavLabel(section.heading, index)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
