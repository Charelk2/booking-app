from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from .. import models
from .quote_totals import compute_quote_totals_snapshot


def generate_pdf(invoice: models.Invoice) -> bytes:
    """Generate a branded Invoice PDF using ReportLab Platypus.

    Matches global styling used for receipts: brand header + status badge,
    summary grid, parties, line items, and totals.
    """
    # Helpers
    def _zar(v):
        try:
            return f"ZAR {float(v or 0):,.2f}"
        except Exception:
            return "ZAR —"

    # Extract context (best-effort)
    inv_id = getattr(invoice, "id", None)
    status = getattr(invoice, "status", None) or "unpaid"
    issue_date = getattr(invoice, "issue_date", None)
    due_date = getattr(invoice, "due_date", None)
    amount_due = getattr(invoice, "amount_due", None)
    payment_method = getattr(invoice, "payment_method", None)
    notes = getattr(invoice, "notes", None)

    client_name = None
    client_email = None
    artist_name = None
    artist_email = None
    try:
        if getattr(invoice, "client", None):
            client_name = getattr(invoice.client, "name", None)
            client_email = getattr(invoice.client, "email", None)
    except Exception:
        pass
    try:
        if getattr(invoice, "artist", None):
            artist_name = getattr(invoice.artist, "name", None)
            artist_email = getattr(invoice.artist, "email", None)
    except Exception:
        pass

    # Quote-derived items and totals
    items = []  # list[tuple[str, float]]
    accommodation_note = None
    subtotal = None
    discount = None
    total = None
    try:
        qv2 = getattr(invoice, "quote", None)
        if qv2 is not None:
            try:
                for s in (getattr(qv2, "services", None) or []):
                    desc = (s.get("description") or "Service").strip() or "Service"
                    price = float(s.get("price") or 0)
                    if price:
                        items.append((desc, price))
            except Exception:
                pass
            try:
                sv = float(getattr(qv2, "sound_fee", 0) or 0)
                if sv:
                    items.append(("Sound", sv))
            except Exception:
                pass
            try:
                tv = float(getattr(qv2, "travel_fee", 0) or 0)
                if tv:
                    items.append(("Travel", tv))
            except Exception:
                pass
            try:
                acc = getattr(qv2, "accommodation", None)
                if (acc or "").strip():
                    accommodation_note = str(acc)
            except Exception:
                pass
            try:
                subtotal = float(getattr(qv2, "subtotal", 0) or 0)
            except Exception:
                subtotal = None
            try:
                discount = float(getattr(qv2, "discount", 0) or 0)
            except Exception:
                discount = None
            try:
                total = float(getattr(qv2, "total", 0) or 0)
            except Exception:
                total = None
    except Exception:
        pass

    # Document + styles
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Invoice {inv_id}",
        author="Booka",
    )
    brand = colors.HexColor("#6C3BFF")
    success = colors.HexColor("#16a34a")
    warn = colors.HexColor("#f59e0b")
    danger = colors.HexColor("#dc2626")
    muted = colors.HexColor("#6b7280")
    border = colors.HexColor("#e5e7eb")

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitleBrand", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=18, textColor=colors.black, spaceAfter=6))
    styles.add(ParagraphStyle(name="Muted", parent=styles["Normal"], fontName="Helvetica", fontSize=9, textColor=muted))
    styles.add(ParagraphStyle(name="Strong", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10))
    styles.add(ParagraphStyle(name="NormalSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=10))

    story = []

    # Header: Brand + Status badge
    # NOTE: For now, invoices are always rendered as PAID (business rule).
    # We keep the underlying status untouched for data, but the badge is fixed.
    status_text = "PAID"
    status_color = success

    header_tbl = Table(
        [
            [Paragraph("<b>Booka</b>", styles["TitleBrand"]), Paragraph(status_text, ParagraphStyle(name="StatusBadge", parent=styles["Normal"], textColor=status_color, backColor=colors.whitesmoke, leading=12, fontName="Helvetica-Bold", alignment=1))],
        ],
        colWidths=[doc.width * 0.75, doc.width * 0.25],
        hAlign="LEFT",
    )
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (1, 0), (1, 0), "RIGHT")]))
    story.append(header_tbl)
    story.append(Spacer(1, 6))

    # Summary grid
    issue_str = f"{issue_date:%Y-%m-%d}" if issue_date else "—"
    due_str = f"{due_date:%Y-%m-%d}" if due_date else "—"
    # Total To Pay from backend snapshot for header visibility
    try:
        snapshot_header = compute_quote_totals_snapshot(getattr(invoice, "quote", None))
    except Exception:
        snapshot_header = None
    total_to_pay = None
    try:
        if snapshot_header and snapshot_header.client_total_incl_vat is not None:
            total_to_pay = float(snapshot_header.client_total_incl_vat)
        elif amount_due is not None:
            total_to_pay = float(amount_due or 0)
    except Exception:
        total_to_pay = None
    summary_data = [
        [Paragraph("<font color='#6b7280'>Invoice #</font>", styles["NormalSmall"]), Paragraph(str(inv_id or "—"), styles["Strong"]),
         Paragraph("<font color='#6b7280'>Issued</font>", styles["NormalSmall"]), Paragraph(issue_str, styles["NormalSmall"])],
        [Paragraph("<font color='#6b7280'>Currency</font>", styles["NormalSmall"]), Paragraph("ZAR", styles["NormalSmall"]),
         Paragraph("<font color='#6b7280'>Amount</font>", styles["NormalSmall"]), Paragraph(_zar(total_to_pay if total_to_pay is not None else (amount_due if amount_due is not None else total)), styles["Strong"])],
        [Paragraph("<font color='#6b7280'>Due</font>", styles["NormalSmall"]), Paragraph(due_str, styles["NormalSmall"]), Paragraph("", styles["NormalSmall"]), Paragraph("", styles["NormalSmall"])],
    ]
    if payment_method:
        summary_data.append([Paragraph("<font color='#6b7280'>Payment Method</font>", styles["NormalSmall"]), Paragraph(payment_method, styles["NormalSmall"]), Paragraph("", styles["NormalSmall"]), Paragraph("", styles["NormalSmall"])])
    summary_tbl = Table(summary_data, colWidths=[doc.width*0.15, doc.width*0.35, doc.width*0.15, doc.width*0.35])
    summary_tbl.setStyle(TableStyle([
        ("INNERGRID", (0,0), (-1,-1), 0.25, border),
        ("BOX", (0,0), (-1,-1), 0.25, border),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("BACKGROUND", (0,0), (-1,-1), colors.whitesmoke),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    story.append(summary_tbl)
    story.append(Spacer(1, 8))

    # Parties: Bill To / From
    client_block = [Paragraph("Bill To", styles["Muted"]), Paragraph((client_name or "") + (f"\n{client_email}" if client_email else ""), styles["NormalSmall"]) ]
    artist_block = [Paragraph("From", styles["Muted"]), Paragraph((artist_name or "") + (f"\n{artist_email}" if artist_email else ""), styles["NormalSmall"]) ]
    parties_tbl = Table([[client_block, artist_block]], colWidths=[doc.width*0.5, doc.width*0.5])
    parties_tbl.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP")]))
    story.append(parties_tbl)
    story.append(Spacer(1, 8))

    # Line items
    line_rows = [[Paragraph("Description", styles["Strong"]), Paragraph("Amount", styles["Strong"])]]
    if items:
        for desc, price in items:
            line_rows.append([Paragraph(desc, styles["NormalSmall"]), Paragraph(_zar(price), styles["NormalSmall"])])
    else:
        # If no explicit items were captured, show invoice total context
        line_rows.append([Paragraph("Booking", styles["NormalSmall"]), Paragraph(_zar(total or amount_due), styles["NormalSmall"])])
    if accommodation_note:
        line_rows.append([Paragraph("Accommodation", styles["NormalSmall"]), Paragraph(accommodation_note, styles["NormalSmall"])])
    items_tbl = Table(line_rows, colWidths=[doc.width*0.65, doc.width*0.35])
    items_tbl.setStyle(TableStyle([
        ("BOX", (0,0), (-1,-1), 0.25, border),
        ("INNERGRID", (0,0), (-1,-1), 0.25, border),
        ("BACKGROUND", (0,0), (-1,0), colors.Color(0.95,0.95,0.97)),
        ("ALIGN", (1,1), (1,-1), "RIGHT"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(items_tbl)
    story.append(Spacer(1, 6))

    # Totals
    totals_rows = []
    if subtotal is not None:
        totals_rows.append([Paragraph("Subtotal", styles["NormalSmall"]), Paragraph(_zar(subtotal), styles["NormalSmall"])])
    if (discount or 0) > 0:
        totals_rows.append([Paragraph("Discount", styles["NormalSmall"]), Paragraph("- " + _zar(discount or 0), styles["NormalSmall"])])
    # Provider VAT (15%) for visibility
    try:
        if total is not None:
            vat_provider = round(float(total or 0) - float((subtotal or 0) - (discount or 0)), 2)
            if vat_provider > 0:
                totals_rows.append([Paragraph("VAT (15%)", styles["NormalSmall"]), Paragraph(_zar(vat_provider), styles["NormalSmall"])])
    except Exception:
        pass
    # Platform Service Fee (incl. VAT) sourced from backend totals snapshot
    fee_incl = None
    snapshot = None
    try:
        qv2 = getattr(invoice, "quote", None)
        snapshot = compute_quote_totals_snapshot(qv2) if qv2 is not None else None
    except Exception:
        snapshot = None
    if snapshot and (snapshot.platform_fee_ex_vat is not None) and (snapshot.platform_fee_vat is not None):
        try:
            fee_incl = float(snapshot.platform_fee_ex_vat + snapshot.platform_fee_vat)
        except Exception:
            fee_incl = None
    if isinstance(fee_incl, float) and fee_incl > 0:
        totals_rows.append([
            Paragraph("Booka Service Fee (3% — VAT included)", styles["NormalSmall"]),
            Paragraph(_zar(fee_incl), styles["NormalSmall"]),
        ])

    # Total To Pay (client total incl. VAT from snapshot when available)
    total_to_pay = None
    try:
        if snapshot and snapshot.client_total_incl_vat is not None:
            total_to_pay = float(snapshot.client_total_incl_vat)
        elif amount_due is not None:
            total_to_pay = float(amount_due or 0)
    except Exception:
        total_to_pay = None
    if total_to_pay is not None:
        totals_rows.append([Paragraph("Total To Pay", styles["Strong"]), Paragraph(_zar(total_to_pay), styles["Strong"])])
    # Display rule: show Amount Due as ZAR 0.00 for paid invoices (visual only)
    display_due = 0.0 if str(status).lower() == "paid" or str(status_text).upper() == "PAID" else amount_due
    if amount_due is not None:
        totals_rows.append([Paragraph("Amount Due", styles["Strong"]), Paragraph(_zar(display_due), styles["Strong"])])
    if totals_rows:
        totals_tbl = Table(totals_rows, colWidths=[doc.width*0.65, doc.width*0.35])
        totals_tbl.setStyle(TableStyle([("ALIGN", (1,0), (1,-1), "RIGHT"), ("TOPPADDING", (0,0), (-1,-1), 2), ("BOTTOMPADDING", (0,0), (-1,-1), 2)]))
        story.append(totals_tbl)

    # Notes
    if notes:
        story.append(Spacer(1, 8))
        story.append(Paragraph("Notes", styles["Muted"]))
        story.append(Paragraph(str(notes), styles["NormalSmall"]))

    story.append(Spacer(1, 12))
    story.append(Paragraph("Thank you for booking with Booka.", styles["Muted"]))

    # Build and return bytes
    doc.build(story)
    buffer.seek(0)
    return buffer.read()
