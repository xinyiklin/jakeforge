import { useState } from "react";

import type { DocStyle } from "./useDocStyle";
import type { RenderPdfResult, Template } from "./useTemplates";
import { buildResumeFileName, downloadBlob, extractApplicantName, sanitizeFileBase } from "../lib/downloads";
import { toTemplateSchema, type ResumeData, type ResumeTemplateSchema } from "../lib/resumeData";

type RenderTex = (resumeText: string, templateId?: string, options?: { rawTex?: boolean; docStyle?: DocStyle }) => Promise<string>;
type RenderPdf = (resumeText: string, templateId?: string, options?: { rawTex?: boolean; docStyle?: DocStyle }) => Promise<RenderPdfResult>;
type RenderTexFromSchema = (schema: ResumeTemplateSchema, templateId?: string, options?: { docStyle?: DocStyle }) => Promise<string>;
type RenderPdfFromSchema = (schema: ResumeTemplateSchema, templateId?: string, options?: { docStyle?: DocStyle }) => Promise<RenderPdfResult>;

type UseResumeExportArgs = {
  // The structured editor model. When present, LaTeX exports (.tex / PDF·LaTeX)
  // render straight from it through the template — the SAME faithful path the
  // on-screen compile preview uses — instead of a serialize→reparse round-trip.
  editedResume: ResumeData | null;
  // The current resume serialized to plain text. Clean-print operates on THIS;
  // it is also the LaTeX fallback when no structured model exists.
  currentResumeText: string;
  selectedTemplateId: string;
  selectedTemplate: Template | null;
  renderTex: RenderTex;
  renderPdf: RenderPdf;
  renderTexFromSchema: RenderTexFromSchema;
  renderPdfFromSchema: RenderPdfFromSchema;
  // The Format-menu values. Forwarded to the LaTeX renderer so the compiled PDF
  // mirrors the on-screen typography (spacing + leading).
  docStyle: DocStyle;
  tectonic: { available: boolean };
  setTexStatus: (value: string) => void;
};

// Owns the resume export surface: clean-PDF browser print, LaTeX .tex / PDF
// render, and in-app PDF preview, plus the per-action status/flag state those
// buttons read.
export function useResumeExport({
  editedResume,
  currentResumeText,
  selectedTemplateId,
  selectedTemplate,
  renderTex,
  renderPdf,
  renderTexFromSchema,
  renderPdfFromSchema,
  docStyle,
  tectonic,
  setTexStatus
}: UseResumeExportArgs) {
  // Render the CURRENT resume to LaTeX/PDF. With a structured model, go straight
  // through the template (faithful — matches the compile preview); otherwise fall
  // back to the serialize→reparse text path.
  function renderCurrentTex(): Promise<string> {
    return editedResume
      ? renderTexFromSchema(toTemplateSchema(editedResume), selectedTemplateId, { docStyle })
      : renderTex(currentResumeText, selectedTemplateId, { docStyle });
  }
  function renderCurrentPdf(): Promise<RenderPdfResult> {
    return editedResume
      ? renderPdfFromSchema(toTemplateSchema(editedResume), selectedTemplateId, { docStyle })
      : renderPdf(currentResumeText, selectedTemplateId, { docStyle });
  }

  const [isDownloadingTex, setIsDownloadingTex] = useState(false);
  const [isRenderingLatexPdf, setIsRenderingLatexPdf] = useState(false);

  // In-app PDF preview state (Tectonic compile → blob URL → overlay).
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewPdfUrl, setPreviewPdfUrl] = useState("");

  // Name downloads after the applicant: Xinyi_Lin_Resume.pdf → Resume.pdf. When
  // the user edits the suggested name, `overrideBase` carries their chosen base
  // (extension excluded); we sanitize and re-attach the extension.
  function resumeDownloadName(ext: string, overrideBase?: string): string {
    if (overrideBase && overrideBase.trim()) {
      return `${sanitizeFileBase(overrideBase)}.${ext}`;
    }
    return buildResumeFileName(extractApplicantName(currentResumeText), "", ext);
  }

  async function handleDownloadTex(overrideBase?: string) {
    if (!editedResume && !currentResumeText) return;
    setIsDownloadingTex(true);
    setTexStatus("Rendering LaTeX source…");
    try {
      const tex = await renderCurrentTex();
      const templateLabel = selectedTemplate?.name ?? selectedTemplateId;
      const fileName = resumeDownloadName("tex", overrideBase);
      downloadBlob(new Blob([tex], { type: "application/x-tex" }), fileName);
      setTexStatus(`Downloaded ${fileName} using the ${templateLabel} template.`);
    } catch (error) {
      setTexStatus(error instanceof Error ? error.message : "TEX render failed.");
    } finally {
      setIsDownloadingTex(false);
    }
  }

  async function handleDownloadLatexPdf(overrideBase?: string) {
    if (!editedResume && !currentResumeText) return;
    if (!tectonic.available) {
      setTexStatus("Tectonic is not installed. Install with `brew install tectonic` to enable in-app LaTeX PDF rendering.");
      return;
    }
    setIsRenderingLatexPdf(true);
    setTexStatus("Compiling LaTeX → PDF with Tectonic…");
    try {
      const outcome = await renderCurrentPdf();
      if ("error" in outcome) {
        setTexStatus(
          outcome.missingTectonic
            ? "Tectonic is not installed. Install with `brew install tectonic` to enable in-app LaTeX PDF rendering."
            : `LaTeX PDF compile failed: ${outcome.error}`
        );
        return;
      }
      const fileName = resumeDownloadName("pdf", overrideBase);
      downloadBlob(outcome.pdf, fileName);
      setTexStatus(`Downloaded ${fileName} rendered via Tectonic + ${selectedTemplate?.name ?? selectedTemplateId}.`);
    } catch (error) {
      setTexStatus(error instanceof Error ? error.message : "LaTeX PDF render failed.");
    } finally {
      setIsRenderingLatexPdf(false);
    }
  }

  async function handlePreview() {
    if (!editedResume && !currentResumeText) return;
    if (!tectonic.available) {
      setTexStatus("Tectonic is not installed. Install with `brew install tectonic` to enable PDF preview.");
      return;
    }
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl("");
    }
    setIsPreviewOpen(true);
    setIsPreviewLoading(true);
    setPreviewError("");
    try {
      const outcome = await renderCurrentPdf();
      if ("error" in outcome) {
        setPreviewError(
          outcome.missingTectonic ? "Tectonic is not installed. Install with `brew install tectonic`." : outcome.error
        );
        return;
      }
      setPreviewPdfUrl(URL.createObjectURL(outcome.pdf));
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "PDF preview failed.");
    } finally {
      setIsPreviewLoading(false);
    }
  }

  function handleClosePreview() {
    setIsPreviewOpen(false);
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl("");
    }
    setPreviewError("");
  }

  return {
    isDownloadingTex,
    isRenderingLatexPdf,
    isPreviewOpen,
    isPreviewLoading,
    previewError,
    previewPdfUrl,
    resumeDownloadName,
    handleDownloadTex,
    handleDownloadLatexPdf,
    handlePreview,
    handleClosePreview
  };
}
