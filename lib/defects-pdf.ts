/**
 * Client-side PDF export for the Defect Register.
 *
 * Uses jsPDF + jspdf-autotable (both browser-only) so they are imported
 * dynamically the moment the user requests a download. This keeps them out of
 * the initial server-rendered bundle.
 */

export interface DefectPdfRow {
  /** Human-readable defect type, e.g. "Rail Crack". */
  defectType: string
  /** Human-readable severity label, e.g. "High". */
  severity: string
  /** Human-readable status label, e.g. "Block Requested". */
  status: string
  /** Work/asset description shown as the defect summary. */
  description: string
  /** Segment display name, e.g. "Station C → Station D". */
  segment: string
  /** Department responsible for the defect. */
  department: string
  /** Formatted due date. */
  dueDate: string
  /** Whether the defect is past due and not resolved. */
  overdue: boolean
  /** AI priority score (already formatted) or a status hint such as "—". */
  score: string
}

export interface DefectPdfOptions {
  /** Display name of the user generating the report. */
  generatedBy?: string | null
  /** Corridor being reported on, e.g. "Corridor 1 - Demo Line". */
  corridorLabel?: string | null
}

const BRAND_COLOR: [number, number, number] = [124, 58, 237] // violet-600
const OVERDUE_COLOR: [number, number, number] = [220, 38, 38] // red-600

function formatGeneratedAt(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Builds and triggers the download of a PDF containing the supplied defects.
 */
export async function downloadDefectsPdf(
  rows: DefectPdfRow[],
  options: DefectPdfOptions = {},
): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const { autoTable } = await import("jspdf-autotable")

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  const generatedAt = new Date()
  const overdueCount = rows.filter((r) => r.overdue).length

  // --- Report header -----------------------------------------------------
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(23, 23, 23)
  doc.text("Defect Register", 40, 46)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(110, 110, 110)
  doc.text("RailSync — Maintenance", 40, 62)

  const metaLines: string[] = []
  if (options.corridorLabel) metaLines.push(options.corridorLabel)
  metaLines.push(
    `${rows.length} defect${rows.length === 1 ? "" : "s"} tracked${
      overdueCount > 0 ? ` · ${overdueCount} overdue` : ""
    }`,
  )
  metaLines.push(`Generated ${formatGeneratedAt(generatedAt)}`)
  if (options.generatedBy) metaLines.push(`By ${options.generatedBy}`)
  doc.text(metaLines.join("   |   "), 40, 80)

  // --- Table -------------------------------------------------------------
  autoTable(doc, {
    startY: 96,
    head: [
      [
        "Type",
        "Severity",
        "Status",
        "Description",
        "Segment",
        "Department",
        "Due Date",
        "AI Score",
      ],
    ],
    body: rows.map((r) => [
      r.defectType,
      r.severity,
      r.status,
      r.description,
      r.segment,
      r.department,
      r.overdue ? `Due ${r.dueDate} (Overdue)` : `Due ${r.dueDate}`,
      r.score,
    ]),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 5,
      valign: "middle",
      lineColor: [229, 231, 235],
      lineWidth: 0.5,
      textColor: [55, 65, 81],
    },
    headStyles: {
      fillColor: BRAND_COLOR,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [250, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 60 },
      2: { cellWidth: 90 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 120 },
      5: { cellWidth: 70 },
      6: { cellWidth: 110 },
      7: { cellWidth: 60, halign: "center" },
    },
    didParseCell: (data) => {
      // Highlight overdue due dates in red.
      if (data.section === "body" && data.column.index === 6) {
        const value = String(data.cell.raw ?? "")
        if (value.includes("(Overdue)")) {
          data.cell.styles.textColor = OVERDUE_COLOR
          data.cell.styles.fontStyle = "bold"
        }
      }
    },
  })

  // --- Footer on every page (added after the table so the total page count
  // is known). ------------------------------------------------------------
  const pageHeight = doc.internal.pageSize.getHeight()
  const pageCount = doc.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text("RailSync Defect Register", 40, pageHeight - 24)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 40, pageHeight - 24, {
      align: "right",
    })
  }

  const yyyymmdd = [
    generatedAt.getFullYear(),
    String(generatedAt.getMonth() + 1).padStart(2, "0"),
    String(generatedAt.getDate()).padStart(2, "0"),
  ].join("-")

  doc.save(`defect-register-${yyyymmdd}.pdf`)
}
