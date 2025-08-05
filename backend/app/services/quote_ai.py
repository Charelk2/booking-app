import json
import logging
import os
from decimal import Decimal
from typing import Tuple
from urllib import request, error

logger = logging.getLogger(__name__)

OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def generate_quote_draft(description: str, price: Decimal) -> Tuple[str, Decimal]:
    """Return an AI-generated description and price adjustment.

    If the OpenAI API key is not configured or any error occurs during the
    request, a fallback description is returned and the adjustment is ``0``.
    """

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.info("OPENAI_API_KEY not set; skipping AI draft generation")
        return description, Decimal("0")

    prompt = (
        "Given the quote description "
        f"'{description}' priced at {price} ZAR, suggest an improved "
        "description and numeric price adjustment in ZAR as JSON with keys "
        "'description' and 'adjustment'."
    )

    payload = json.dumps(
        {
            "model": "gpt-3.5-turbo",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.7,
        }
    ).encode("utf-8")

    req = request.Request(
        OPENAI_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    try:
        with request.urlopen(req, timeout=15) as resp:
            body = resp.read()
        response = json.loads(body)
        content = response["choices"][0]["message"]["content"]
        data = json.loads(content)
        new_description = data.get("description", description)
        adjustment = Decimal(str(data.get("adjustment", 0)))
        return new_description, adjustment
    except Exception as exc:  # noqa: BLE001 - broad to ensure fallback
        logger.error("AI quote generation failed: %s", exc)
        return description, Decimal("0")
