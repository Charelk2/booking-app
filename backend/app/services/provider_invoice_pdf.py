from __future__ import annotations

from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .. import models


def _zar(v):
    try:
        return f"ZAR {float(v or 0):,.2f}"
    except Exception:
        return "ZAR —"


def generate_pdf(invoice: models.Invoice) -> bytes:
    """Minimal Provider Invoice (agent) PDF.

    - Title: TAX INVOICE if supplier VAT-registered else INVOICE
    - Supplier: provider details (legal_name; VAT number when present)
    - Recipient: client details (best-effort)
    - Lines: Quote totals where available; EX/VAT/TOTAL shown for vendors.
    - Footer: Agent legend.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Provider Invoice {getattr(invoice, 'id', '')}",
        author="Booka",
    )
    styles = getSampleStyleSheet()
    muted = colors.HexColor("#6b7280")
    border = colors.HexColor("#e5e7eb")
    styles.add(ParagraphStyle(name="TitleBrand", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, textColor=colors.black, spaceAfter=6))
    styles.add(ParagraphStyle(name="Muted", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=muted))
    styles.add(ParagraphStyle(name="Strong", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10))
    styles.add(ParagraphStyle(name="NormalSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=10))

    story = []
    # Determine vendor vs non-vendor from issuer_snapshot if present
    issuer = getattr(invoice, "issuer_snapshot", {}) or {}
    recipient = getattr(invoice, "recipient_snapshot", {}) or {}
    is_vendor = bool(issuer.get("vat_registered"))
    title = "TAX INVOICE" if is_vendor else "INVOICE"
    story.append(Paragraph(title, styles["TitleBrand"]))
    story.append(Spacer(1, 6))

    # Parties
    supplier_lines = [issuer.get("legal_name") or issuer.get("business_name") or "Provider"]
    if issuer.get("billing_address_line1"):
      supplier_lines.append(str(issuer.get("billing_address_line1")))
    cityline = " ".join([str(issuer.get("billing_city") or ""), str(issuer.get("billing_postal_code") or "")]).strip()
    if cityline:
      supplier_lines.append(cityline)
    if issuer.get("vat_registered") and issuer.get("vat_number"):
      supplier_lines.append(f"VAT: {issuer.get('vat_number')}")
    client_lines = [recipient.get("legal_name") or recipient.get("name") or "Client"]
    if recipient.get("billing_address_line1"):
      client_lines.append(str(recipient.get("billing_address_line1")))
    parties_tbl = Table([
        [Paragraph("Supplier", styles["Muted"]), Paragraph("Recipient", styles["Muted"])],
        [Paragraph("\n".join(supplier_lines), styles["NormalSmall"]), Paragraph("\n".join(client_lines), styles["NormalSmall"])],
    ], colWidths=[doc.width*0.5, doc.width*0.5])
    parties_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border)]))
    story.append(parties_tbl)
    story.append(Spacer(1, 8))

    # Totals
    q = getattr(invoice, "quote", None)
    subtotal = float(getattr(q, "subtotal", 0) or 0)
    discount = float(getattr(q, "discount", 0) or 0)
    total = float(getattr(q, "total", 0) or 0)
    vat_amount = total - max(0.0, (subtotal - discount)) if is_vendor else 0.0

    rows = [[Paragraph("Description", styles["Strong"]), Paragraph("Amount", styles["Strong"])]]
    rows.append([Paragraph("Subtotal (EX VAT)", styles["NormalSmall"]), Paragraph(_zar(subtotal), styles["NormalSmall"])])
    if discount:
        rows.append([Paragraph("Discount (−)", styles["NormalSmall"]), Paragraph("- " + _zar(discount), styles["NormalSmall"])])
    if is_vendor:
        rows.append([Paragraph("VAT (15%)", styles["NormalSmall"]), Paragraph(_zar(vat_amount), styles["NormalSmall"])])
    rows.append([Paragraph("TOTAL", styles["Strong"]), Paragraph(_zar(total if is_vendor else max(0.0, subtotal - discount)), styles["Strong"])])
    tbl = Table(rows, colWidths=[doc.width*0.65, doc.width*0.35])
    tbl.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border)]))
    story.append(tbl)
    story.append(Spacer(1, 10))

    # Agent legend
    story.append(Paragraph("Issued by Booka (Pty) Ltd as agent on behalf of the supplier. Payment collected in escrow on the supplier’s behalf.", styles["Muted"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()

