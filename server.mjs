// jakeforge local server. Serves the Vite app and exposes only the LaTeX
// rendering endpoints the editor needs: template listing, resume → .tex / PDF
// rendering, and .tex import. Ported from role-fit-ai with the AI, job-tracker,
// applications, and DOCX surfaces removed.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import {
  listTemplates,
  renderResumeTex,
  renderResumeTexFromSchema,
  extractPlainTextFromLatex,
  checkTectonicAvailability,
  compileTexToPdf,
  defaultTemplateId
} from "./server/latex/index.mjs";
import { readBody, sendJson } from "./server/http.mjs";
import { extractDocxResume } from "./server/docx.mjs";

const root = process.cwd();
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 5186);
const host = process.env.HOST ?? "127.0.0.1";
// Hostnames the app is served from when bound beyond loopback (e.g. an EC2
// deployment reached by public IP during bring-up and by domain afterwards).
// Comma-separated; loopback names are always allowed so on-box smoke tests and
// container health checks keep working.
const allowedHostList = (process.env.ALLOWED_HOSTS ?? process.env.ALLOWED_HOST ?? "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);
const isLoopbackBind = host === "127.0.0.1" || host === "localhost" || host === "::1";

if (!isLoopbackBind && allowedHostList.length === 0) {
  console.error(
    `HOST=${host} binds beyond loopback but ALLOWED_HOSTS is not set — every /api request would be rejected.\n` +
      `Set ALLOWED_HOSTS to the hostname(s) the app is reached by, e.g. ALLOWED_HOSTS=resume.example.com,203.0.113.7`
  );
  process.exit(1);
}

const allowedHosts = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  `localhost:${port}`,
  `127.0.0.1:${port}`,
  `[::1]:${port}`
]);
for (const name of allowedHostList) {
  allowedHosts.add(name);
  allowedHosts.add(`${name}:${port}`);
  allowedHosts.add(`${name}:80`);
  allowedHosts.add(`${name}:443`);
}

async function handleListTemplates(req, res) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Use GET." });
    return;
  }
  try {
    const tectonic = await checkTectonicAvailability();
    sendJson(res, 200, { templates: listTemplates(), defaultTemplateId, tectonic });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Template list failed." });
  }
}

async function handleRenderResumeLatex(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const body = JSON.parse(await readBody(req));
    const resumeText = String(body.resumeText ?? "");
    const templateId = String(body.templateId ?? defaultTemplateId);
    const wantsPdf = Boolean(body.wantsPdf);
    // rawTex: the text already IS a full LaTeX document — compile as-is.
    const rawTex = Boolean(body.rawTex);
    // resume: structured editor data — render straight through the template.
    const structured = body.resume && typeof body.resume === "object" ? body.resume : null;
    // docStyle: editor Format values, so the PDF mirrors the on-screen spacing.
    const docStyle = body.docStyle && typeof body.docStyle === "object" ? body.docStyle : null;

    if (structured && JSON.stringify(structured).length > 400_000) {
      sendJson(res, 400, { error: "Resume data is too large to render." });
      return;
    }
    if (!structured && !rawTex && !resumeText.trim()) {
      sendJson(res, 400, { error: "Resume text is empty." });
      return;
    }
    if (resumeText.length > 200_000) {
      sendJson(res, 400, { error: "Resume text is too large to render." });
      return;
    }

    let tex;
    let resolvedTemplateId;
    if (structured) {
      ({ tex, templateId: resolvedTemplateId } = renderResumeTexFromSchema({ schema: structured, templateId, docStyle }));
    } else if (rawTex) {
      tex = resumeText;
      resolvedTemplateId = "raw";
    } else {
      ({ tex, templateId: resolvedTemplateId } = renderResumeTex({ resumeText, templateId, docStyle }));
    }

    let pdfBase64 = null;
    let pdfError = null;
    if (wantsPdf) {
      try {
        const pdfBuffer = await compileTexToPdf(tex);
        pdfBase64 = pdfBuffer.toString("base64");
      } catch (error) {
        pdfError = {
          code: error?.code ?? "COMPILE_FAILED",
          message: error instanceof Error ? error.message : "PDF compile failed."
        };
      }
    }

    sendJson(res, 200, { tex, templateId: resolvedTemplateId, pdfBase64, pdfError });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "LaTeX render failed." });
  }
}

async function handleImportResumeTex(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const body = JSON.parse(await readBody(req));
    const tex = String(body.tex ?? "");
    if (!tex.trim()) {
      sendJson(res, 400, { error: "LaTeX source is empty." });
      return;
    }
    if (tex.length > 200_000) {
      sendJson(res, 400, { error: "LaTeX source is too large to import." });
      return;
    }
    const text = extractPlainTextFromLatex(tex);
    if (!text.trim()) {
      sendJson(res, 422, { error: "Could not extract text from the LaTeX source. Paste the resume content directly instead." });
      return;
    }
    sendJson(res, 200, { text });
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "LaTeX import failed." });
  }
}

// Extract plain text from an uploaded DOCX (base64). The browser can't unzip +
// parse OOXML, so this runs server-side; the returned text feeds parseResumeData.
async function handleImportResumeDocx(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Use POST." });
    return;
  }
  try {
    const { docxBase64 } = JSON.parse(await readBody(req));
    const result = await extractDocxResume(docxBase64);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 400, { error: error instanceof Error ? error.message : "DOCX import failed." });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const distRoot = resolve(join(root, "dist"));
  const filePath = resolve(join(distRoot, pathname));

  // Require the dist root plus a trailing separator so a sibling like
  // <root>/dist-leak/x can't satisfy a bare startsWith prefix.
  if (filePath !== distRoot && !filePath.startsWith(distRoot + sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml"
      }[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch {
    const index = await readFile(join(root, "dist", "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(index);
  }
}

// Vite is a devDependency; import it lazily so a production install
// (`npm ci --omit=dev`) can boot without it.
const vite = isProduction
  ? null
  : await (await import("vite")).createServer({
      root,
      appType: "spa",
      server: { middlewareMode: true }
    });

const server = createServer((req, res) => {
  const pathname = new URL(req.url ?? "/", `http://${req.headers.host}`).pathname;

  // Same-origin/Host guard for the API: a website the user visits must not be
  // able to drive this server cross-origin or read the resume via DNS rebind.
  if (pathname.startsWith("/api/")) {
    if (!allowedHosts.has(req.headers.host ?? "")) {
      sendJson(res, 403, { error: "Forbidden host." });
      return;
    }
    if (req.headers.origin) {
      let originHost = ""; // malformed Origin → never matches → blocked
      try {
        originHost = new URL(req.headers.origin).host;
      } catch {
        /* keep sentinel */
      }
      if (!allowedHosts.has(originHost)) {
        sendJson(res, 403, { error: "Cross-origin request blocked." });
        return;
      }
    }
  }

  if (pathname === "/api/templates") {
    void handleListTemplates(req, res);
    return;
  }
  if (pathname === "/api/render-resume-latex") {
    void handleRenderResumeLatex(req, res);
    return;
  }
  if (pathname === "/api/import-resume-tex") {
    void handleImportResumeTex(req, res);
    return;
  }
  if (pathname === "/api/import-resume-docx") {
    void handleImportResumeDocx(req, res);
    return;
  }

  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end("Not found");
    });
    return;
  }

  void serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`jakeforge running at http://localhost:${port}/`);
});
