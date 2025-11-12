from __future__ import annotations

from io import BytesIO
from typing import Any, Optional
from sqlalchemy.orm import Session

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .. import models
from sqlalchemy import text


def _zar(v: Optional[float]) -> str:
    try:
        return f"ZAR {float(v or 0):,.2f}"
    except Exception:
        return "ZAR —"


def _get_provider_label(db: Session, provider_user_id: int) -> str:
    try:
        prof = (
            db.query(models.ServiceProviderProfile)
            .filter(models.ServiceProviderProfile.user_id == provider_user_id)
            .first()
        )
        if prof and prof.business_name:
            return prof.business_name
        user = db.query(models.User).filter(models.User.id == provider_user_id).first()
        if user:
            return f"{user.first_name or ''} {user.last_name or ''}".strip() or (user.email or "Provider")
    except Exception:
        pass
    return "Provider"


def _coalesce_event_date(db: Session, booking_id: Optional[int]) -> Optional[str]:
    if not booking_id:
        return None
    try:
        bs = db.query(models.BookingSimple).filter(models.BookingSimple.id == booking_id).first()
        if not bs:
            return None
        bk = db.query(models.Booking).filter(models.Booking.quote_id == bs.quote_id).first()
        if bk and getattr(bk, "start_time", None):
            return bk.start_time.strftime("%Y-%m-%d")
        if getattr(bs, "date", None):
            return bs.date.strftime("%Y-%m-%d")
    except Exception:
        return None
    return None


def _fetch_gross_total(db: Session, booking_id: Optional[int]) -> Optional[float]:
    if not booking_id:
        return None
    try:
        bs = db.query(models.BookingSimple).filter(models.BookingSimple.id == booking_id).first()
        if not bs:
            return None
        qv2 = db.query(models.QuoteV2).filter(models.QuoteV2.id == bs.quote_id).first()
        if qv2 and getattr(qv2, "total", None) is not None:
            return float(qv2.total or 0)
        if getattr(bs, "charged_total_amount", None) is not None:
            return float(bs.charged_total_amount or 0)
    except Exception:
        return None
    return None


def generate_pdf(db: Session, payout_id: int) -> bytes:
    """Generate a remittance/payout statement PDF for a payout id.

    Best-effort: when fee/VAT data is not available, shows 0.00 fee lines and
    the payout amount as the net amount.
    """
    # Load payout row via raw SQL (no ORM model for payouts)
    row = db.execute(
        text(
            """
            SELECT id, booking_id, provider_id, amount, currency, status, type, scheduled_at, paid_at, method, reference
            FROM payouts WHERE id = :id
            """
        ),
        {"id": payout_id},
    ).first()
    if not row:
        raise ValueError("payout_not_found")

    booking_id = int(row[1]) if row[1] is not None else None
    provider_id = int(row[2]) if row[2] is not None else None
    amount = float(row[3] or 0)
    currency = row[4] or "ZAR"
    status = (row[5] or "").capitalize()
    stage = (row[6] or "").lower()  # first50 | final50 | unknown
    scheduled_at = row[7]
    paid_at = row[8]
    method = row[9] or ""
    reference = row[10] or ""

    provider_label = _get_provider_label(db, provider_id) if provider_id else "Provider"
    service_date = _coalesce_event_date(db, booking_id) or "—"
    gross_total = _fetch_gross_total(db, booking_id)

    # Fee + VAT: prefer payout.meta snapshot if present
    platform_fee = 0.0
    vat_on_fee = 0.0
    other_deductions = 0.0
    net_amount = amount
    # Try to pull meta from payouts
    meta_row = db.execute(text("SELECT meta FROM payouts WHERE id=:id"), {"id": payout_id}).first()
    meta = None
    try:
        if meta_row is not None:
            m = meta_row[0]
            if isinstance(m, str):
                import json as _json
                meta = _json.loads(m)
            else:
                meta = m
    except Exception:
        meta = None
    supplier_vat_rate = 0.0
    supplier_vat_amount = 0.0
    commissionable_base = None
    discount_ex = 0.0
    if isinstance(meta, dict):
        try:
            platform_fee = float(meta.get('commission_ex') or meta.get('commission') or 0)
        except Exception:
            platform_fee = platform_fee
        try:
            vat_on_fee = float(meta.get('vat_on_commission') or 0)
        except Exception:
            vat_on_fee = vat_on_fee
        try:
            commissionable_base = float(meta.get('commissionable_base') or meta.get('commissionable_base_ex') or 0)
        except Exception:
            commissionable_base = None
        try:
            discount_ex = float(meta.get('discount_ex') or 0)
        except Exception:
            discount_ex = 0.0
        try:
            supplier_vat_rate = float(meta.get('supplier_vat_rate') or 0)
        except Exception:
            supplier_vat_rate = 0.0
        try:
            supplier_vat_amount = float(meta.get('supplier_vat_amount') or 0)
        except Exception:
            supplier_vat_amount = 0.0
        try:
            if commissionable_base is not None:
                gross_total = commissionable_base
        except Exception:
            pass

    # Document
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Payout {payout_id}",
        author="Booka",
    )
    brand = colors.HexColor("#6C3BFF")
    muted = colors.HexColor("#6b7280")
    border = colors.HexColor("#e5e7eb")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleBrand", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, textColor=colors.black, spaceAfter=6))
    styles.add(ParagraphStyle(name="Muted", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=muted))
    styles.add(ParagraphStyle(name="Strong", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10))
    styles.add(ParagraphStyle(name="NormalSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=10))

    story: list[Any] = []

    # Header
    header_tbl = Table(
        [[Paragraph("<b>Payout Statement</b>", styles["TitleBrand"]), Paragraph(status.upper(), ParagraphStyle(name="Status", parent=styles["Normal"], textColor=colors.black, backColor=colors.whitesmoke, leading=12, fontName="Helvetica-Bold", alignment=1))]],
        colWidths=[doc.width * 0.75, doc.width * 0.25],
    )
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story.append(header_tbl)
    story.append(Spacer(1, 6))

    # Summary grid
    stage_label = "First 50%" if stage == "first50" else ("Final 50%" if stage == "final50" else "Payout")
    summary_data = [
        [Paragraph("<font color='#6b7280'>Payout #</font>", styles["NormalSmall"]), Paragraph(str(payout_id), styles["Strong"]),
         Paragraph("<font color='#6b7280'>Stage</font>", styles["NormalSmall"]), Paragraph(stage_label, styles["NormalSmall"])],
        [Paragraph("<font color='#6b7280'>Provider</font>", styles["NormalSmall"]), Paragraph(provider_label, styles["NormalSmall"]),
         Paragraph("<font color='#6b7280'>Booking</font>", styles["NormalSmall"]), Paragraph(str(booking_id or "—"), styles["NormalSmall"])],
        [Paragraph("<font color='#6b7280'>Service Date</font>", styles["NormalSmall"]), Paragraph(service_date, styles["NormalSmall"]),
         Paragraph("<font color='#6b7280'>Currency</font>", styles["NormalSmall"]), Paragraph(currency, styles["NormalSmall"])],
    ]
    summary_tbl = Table(summary_data, colWidths=[doc.width*0.15, doc.width*0.35, doc.width*0.15, doc.width*0.35])
    summary_tbl.setStyle(TableStyle([("INNERGRID", (0,0), (-1,-1), 0.25, border), ("BOX", (0,0), (-1,-1), 0.25, border), ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("BACKGROUND", (0,0), (-1,-1), colors.whitesmoke), ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
    story.append(summary_tbl)
    story.append(Spacer(1, 8))

    # Financials (vendor-aware if meta provided)
    line_rows = []
    line_rows.append([Paragraph("Provider Subtotal (EX VAT)", styles["NormalSmall"]), Paragraph(_zar(gross_total), styles["NormalSmall"])])
    if discount_ex and discount_ex > 0:
        line_rows.append([Paragraph("Discount (−)", styles["NormalSmall"]), Paragraph("- " + _zar(discount_ex), styles["NormalSmall"])])
    if supplier_vat_rate and supplier_vat_rate > 0:
        line_rows.append([Paragraph(f"VAT on Provider Supply ({int(round(supplier_vat_rate*100))}%)", styles["NormalSmall"]), Paragraph("+ " + _zar(supplier_vat_amount), styles["NormalSmall"])])
    line_rows.append([Paragraph("Platform Commission (EX)", styles["NormalSmall"]), Paragraph("- " + _zar(platform_fee), styles["NormalSmall"])])
    line_rows.append([Paragraph("VAT on Commission (15%)", styles["NormalSmall"]), Paragraph("- " + _zar(vat_on_fee), styles["NormalSmall"])])
    if other_deductions and other_deductions > 0:
        line_rows.append([Paragraph("Other Deductions", styles["NormalSmall"]), Paragraph("- " + _zar(other_deductions), styles["NormalSmall"])])
    # Stage-aware label for the payout amount line
    net_label = "Net Payout Amount"
    try:
        if stage == "first50":
            net_label = "Net Payout Amount (First 50%)"
        elif stage == "final50":
            net_label = "Net Payout Amount (Final 50%)"
    except Exception:
        pass
    line_rows.append([Paragraph(net_label, styles["Strong"]), Paragraph(_zar(net_amount), styles["Strong"])])
    fin_tbl = Table(line_rows, colWidths=[doc.width*0.65, doc.width*0.35])
    fin_tbl.setStyle(TableStyle([("ALIGN", (1,0), (1,-1), "RIGHT"), ("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border), ("BACKGROUND", (0, len(line_rows)-1), (-1, len(line_rows)-1), colors.Color(0.95,0.95,0.97))]))
    story.append(fin_tbl)
    story.append(Spacer(1, 8))

    # Computation (per stages): make the 50/50 split clear
    try:
        net_to_provider = float((gross_total or 0)) + float(supplier_vat_amount or 0) - float(platform_fee or 0) - float(vat_on_fee or 0)
    except Exception:
        net_to_provider = 0.0
    comp_title = Paragraph("Summary", styles["Strong"]) 
    comp_rows = [
        [Paragraph("Net to Provider after deductions", styles["NormalSmall"]), Paragraph(_zar(net_to_provider), styles["NormalSmall"])],
        [Paragraph("Split", styles["NormalSmall"]), Paragraph("50% now, 50% after event", styles["NormalSmall"])],
    ]
    story.append(comp_title)
    comp_tbl = Table(comp_rows, colWidths=[doc.width*0.65, doc.width*0.35])
    comp_tbl.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border)]))
    story.append(comp_tbl)
    story.append(Spacer(1, 8))

    # Method and references
    mm_rows = [
        [Paragraph("Payout Method", styles["NormalSmall"]), Paragraph(method or "—", styles["NormalSmall"])],
        [Paragraph("Scheduled", styles["NormalSmall"]), Paragraph(scheduled_at.strftime("%Y-%m-%d %H:%M") if scheduled_at else "—", styles["NormalSmall"])],
        [Paragraph("Paid", styles["NormalSmall"]), Paragraph(paid_at.strftime("%Y-%m-%d %H:%M") if paid_at else "—", styles["NormalSmall"])],
        [Paragraph("Reference", styles["NormalSmall"]), Paragraph(reference or "—", styles["NormalSmall"])],
    ]
    mm_tbl = Table(mm_rows, colWidths=[doc.width*0.25, doc.width*0.75])
    mm_tbl.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.25, border), ("INNERGRID", (0,0), (-1,-1), 0.25, border), ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6)]))
    story.append(mm_tbl)
    story.append(Spacer(1, 10))

    
    story.append(Paragraph("This is a remittance advice from Booka. It is not a client VAT invoice.", styles["Muted"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()
