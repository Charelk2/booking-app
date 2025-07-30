from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .. import models


def generate_pdf(quote: models.QuoteV2) -> bytes:
    """Return PDF bytes for the given quote."""
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    c.setFont("Helvetica", 14)
    c.drawString(50, 800, f"Quote #{quote.id}")
    c.setFont("Helvetica", 10)
    c.drawString(50, 780, f"Created: {quote.created_at:%Y-%m-%d}")
    c.drawString(50, 760, f"Artist ID: {quote.artist_id}")
    c.drawString(50, 740, f"Client ID: {quote.client_id}")
    c.drawString(50, 720, "Services")
    y = 700
    for item in quote.services:
        c.drawString(60, y, f"- {item['description']}")
        c.drawRightString(550, y, f"R{item['price']}")
        y -= 20
    c.line(50, y + 5, 550, y + 5)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(550, y - 20, f"Total: R{quote.total}")
    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
