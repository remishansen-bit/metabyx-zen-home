import jsPDF from "jspdf";
import type { Branch, MetabyxState } from "./store";

/**
 * Generate a calm, printable PDF report of branches + BMR history and trigger
 * a download. Lives in the client bundle (pdf is rendered locally; no server).
 */
export function exportLibraryPdf(state: MetabyxState) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 30);
  doc.setFontSize(22);
  doc.text("METABYX · Library", margin, y);
  y += 26;
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 130);
  doc.text(
    `Exported ${new Date().toLocaleString()}  ·  ${state.branches.length} branches  ·  BMR ${state.lastBmr}`,
    margin,
    y,
  );
  y += 24;

  // BMR history strip
  if (state.bmrHistory.length > 0) {
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 30);
    doc.text("BMR history", margin, y);
    y += 12;
    const w = pageW - margin * 2;
    const h = 60;
    doc.setDrawColor(220);
    doc.rect(margin, y, w, h);
    const pts = state.bmrHistory.slice(-30);
    if (pts.length > 1) {
      const min = Math.min(...pts.map((p) => p.value));
      const max = Math.max(...pts.map((p) => p.value));
      const range = Math.max(1, max - min);
      doc.setDrawColor(180, 140, 50);
      doc.setLineWidth(1.2);
      for (let i = 1; i < pts.length; i++) {
        const x1 = margin + ((i - 1) / (pts.length - 1)) * w;
        const x2 = margin + (i / (pts.length - 1)) * w;
        const y1 = y + h - ((pts[i - 1].value - min) / range) * h;
        const y2 = y + h - ((pts[i].value - min) / range) * h;
        doc.line(x1, y1, x2, y2);
      }
    }
    y += h + 24;
  }

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text("Branches", margin, y);
  y += 14;

  const sorted = [...state.branches].sort((a, b) => b.createdAt - a.createdAt);
  if (sorted.length === 0) {
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("No branches yet.", margin, y);
  }

  for (const b of sorted) {
    const wrappedDetail = doc.splitTextToSize(b.detail || "", pageW - margin * 2);
    const wrappedReflection = b.reflection
      ? doc.splitTextToSize(`Reflection: ${b.reflection}`, pageW - margin * 2)
      : [];
    const blockH =
      30 + wrappedDetail.length * 12 + wrappedReflection.length * 12 + 10;
    ensureSpace(blockH);

    doc.setDrawColor(230);
    doc.line(margin, y, pageW - margin, y);
    y += 14;

    doc.setFontSize(11);
    doc.setTextColor(20, 20, 30);
    doc.text(b.title || "(untitled)", margin, y);
    doc.setFontSize(8);
    doc.setTextColor(140);
    const meta = `${b.category.toUpperCase()} · ${new Date(b.createdAt).toLocaleDateString()} · ${b.status}${
      typeof b.rating === "number" ? ` · ${b.rating}/5` : ""
    }`;
    doc.text(meta, pageW - margin, y, { align: "right" });
    y += 12;

    doc.setFontSize(10);
    doc.setTextColor(60);
    doc.text(wrappedDetail, margin, y);
    y += wrappedDetail.length * 12;

    if (wrappedReflection.length > 0) {
      y += 4;
      doc.setTextColor(100);
      doc.text(wrappedReflection, margin, y);
      y += wrappedReflection.length * 12;
    }
    y += 10;
  }

  doc.save(`metabyx-library-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export type { Branch };

/**
 * Compact PDF summary matching the categorized JSON export. Same categories,
 * same counts, plus the user's archetype/baseline so the printout reads as a
 * single human-readable snapshot of "everything Metabyx knows".
 */
export function exportSummaryPdf(
  state: MetabyxState,
  meta: {
    archetype?: string | null;
    baselineBmr?: number | null;
    preferences?: Record<string, unknown>;
  } = {},
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 30);
  doc.setFontSize(22);
  doc.text("METABYX · Summary", margin, y);
  y += 24;
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Exported ${new Date().toLocaleString()}`, margin, y);
  y += 22;

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text("Account", margin, y);
  y += 16;
  doc.setFontSize(10);
  doc.setTextColor(60);
  const rows: [string, string][] = [
    ["Archetype", meta.archetype ?? "—"],
    ["Baseline BMR", meta.baselineBmr != null ? String(meta.baselineBmr) : "—"],
    ["Current BMR", String(state.lastBmr)],
  ];
  for (const [k, v] of rows) {
    doc.text(k, margin, y);
    doc.text(v, pageW - margin, y, { align: "right" });
    y += 14;
  }
  y += 8;

  doc.setFontSize(12);
  doc.setTextColor(20, 20, 30);
  doc.text("Included data", margin, y);
  y += 16;
  const categories: [string, number][] = [
    ["Branches & reflections", state.branches.length],
    ["BMR history points", state.bmrHistory.length],
    ["Emotion events", (state.emotionEvents ?? []).length],
    ["Account preferences", meta.preferences ? Object.keys(meta.preferences).length : 0],
  ];
  doc.setFontSize(10);
  doc.setTextColor(60);
  for (const [label, count] of categories) {
    doc.text(label, margin, y);
    doc.text(`${count} ${count === 1 ? "item" : "items"}`, pageW - margin, y, {
      align: "right",
    });
    y += 14;
  }
  y += 8;

  if (meta.preferences) {
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 30);
    doc.text("Preferences", margin, y);
    y += 16;
    doc.setFontSize(10);
    doc.setTextColor(60);
    for (const [k, v] of Object.entries(meta.preferences)) {
      const label = String(k);
      const value = typeof v === "string" || typeof v === "number" || typeof v === "boolean"
        ? String(v)
        : JSON.stringify(v);
      doc.text(label, margin, y);
      doc.text(value.slice(0, 60), pageW - margin, y, { align: "right" });
      y += 14;
    }
  }

  doc.save(`metabyx-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}