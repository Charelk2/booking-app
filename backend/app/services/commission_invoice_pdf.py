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
    """Minimal Commission Tax Invoice (Booka → Provider)."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Commission Invoice {getattr(invoice, 'id', '')}",
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
    story.append(Paragraph("TAX INVOICE – Agency commission", styles["TitleBrand"]))
    story.append(Spacer(1, 6))

    issuer = getattr(invoice, "issuer_snapshot", {}) or {}
    recipient = getattr(invoice, "recipient_snapshot", {}) or {}

    # Parties
    from_lines = [issuer.get("legal_name") or "Booka (Pty) Ltd"]
    if issuer.get("vat_number"):
        from_lines.append(f"VAT: {issuer.get('vat_number')}")
    to_lines = [recipient.get("legal_name") or recipient.get("business_name") or "Provider"]
    if recipient.get("vat_number"):
        to_lines.append(f"VAT: {recipient.get('vat_number')}")
    parties_tbl = Table([
        [Paragraph("From", styles["Muted"]), Paragraph("To", styles["Muted"])],
        [Paragraph("\n".join(from_lines), styles["NormalSmall"]), Paragraph("\n".join(to_lines), styles["NormalSmall"])],
    ], colWidths=[doc.width*0.5, doc.width*0.5])
    parties_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border)]))
    story.append(parties_tbl)
    story.append(Spacer(1, 8))

    try:
        import os
        vat = float(os.getenv('VAT_RATE', '0.15') or 0.15)
    except Exception:
        vat = 0.15
    # Use amount_due as total if present; otherwise compute roughly
    commission_ex = float(getattr(invoice, 'amount_due', 0) or 0) / (1 + vat)
    vat_amount = commission_ex * vat
    total = commission_ex + vat_amount

    rows = [[Paragraph("Description", styles["Strong"]), Paragraph("Amount", styles["Strong"])]]
    rows.append([Paragraph("Commission (EX VAT)", styles["NormalSmall"]), Paragraph(_zar(commission_ex), styles["NormalSmall"])])
    rows.append([Paragraph("VAT (15%)", styles["NormalSmall"]), Paragraph(_zar(vat_amount), styles["NormalSmall"])])
    rows.append([Paragraph("TOTAL", styles["Strong"]), Paragraph(_zar(total), styles["Strong"])])
    tbl = Table(rows, colWidths=[doc.width*0.65, doc.width*0.35])
    tbl.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border)]))
    story.append(tbl)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Settled by set-off from client funds held in escrow on the booking date.", styles["Muted"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
