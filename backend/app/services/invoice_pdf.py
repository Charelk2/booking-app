from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .. import models


def generate_pdf(invoice: models.Invoice) -> bytes:
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setFont("Helvetica", 14)
    c.drawString(50, 800, f"Invoice #{invoice.id}")
    c.setFont("Helvetica", 10)
    c.drawString(50, 780, f"Issued: {invoice.issue_date:%Y-%m-%d}")
    c.drawString(50, 760, f"Artist ID: {invoice.artist_id}")
    c.drawString(50, 740, f"Client ID: {invoice.client_id}")
    c.drawString(50, 700, "Services")
    c.drawRightString(550, 700, f"R{invoice.amount_due}")
    c.line(50, 695, 550, 695)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(550, 670, f"Total: R{invoice.amount_due}")
    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
