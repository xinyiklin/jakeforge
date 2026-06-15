import { useState, type DragEvent } from "react";
import { Upload } from "lucide-react";

import { Modal } from "./Modal";
import { fileToText } from "../lib/importResume";

// One import surface: pick a file OR paste text. A picked file just fills the
// textarea with its extracted text, so both routes converge on a single
// reviewable buffer that "Import" parses and seeds.
export function ImportModal({
  onImport,
  onClose
}: {
  onImport: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ingestFile(file: File | null | undefined) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      setText(await fileToText(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void ingestFile(event.dataTransfer.files?.[0]);
  }

  function submit() {
    if (!text.trim()) return;
    onImport(text);
    onClose();
  }

  return (
    <Modal title="Import resume" onClose={onClose}>
      <div className="modal__body import">
        <p className="import__hint">
          Upload a file or paste your resume. LaTeX is detected automatically. This replaces the current resume.
        </p>

        <label className="import__drop" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <input
            type="file"
            accept=".txt,.md,.markdown,.tex,.docx"
            hidden
            onChange={(e) => void ingestFile(e.target.files?.[0])}
          />
          <Upload size={16} aria-hidden="true" />
          <span>{busy ? "Reading…" : "Choose a file — or drop it here"}</span>
          <small>.txt · .md · .tex · .docx</small>
        </label>

        <div className="import__divider">
          <span>or paste</span>
        </div>

        <textarea
          className="import__text"
          rows={8}
          placeholder="Paste resume text or LaTeX source…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {error ? <p className="import__error">{error}</p> : null}
      </div>

      <div className="modal__foot">
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn btn--primary" onClick={submit} disabled={busy || !text.trim()}>
          Import
        </button>
      </div>
    </Modal>
  );
}
