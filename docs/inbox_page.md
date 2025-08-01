# Inbox Page Overview

Clients and artists communicate through the dedicated **Inbox** page. The layout is split into three sections:

1. **Conversation list** on the left displays all booking requests. Each item shows the `last_message_content` as a short preview, falling back to the event or service name when there are no messages. Conversations are sorted by `last_message_timestamp` so the most recently active threads appear first. Unread threads show a red dot indicator.
2. **Chat area** in the center shows all messages for the selected request. Quotes appear as special bubbles with **Accept** and **Decline** buttons for clients.
3. **Booking details panel** on the right summarises key information from the request and, when a quote is accepted, provides quick links to pay the deposit and add the event to a calendar.

Notifications for new messages link directly to the relevant conversation in the Inbox. When the artist sends a final quote the client can open it here, accept it and proceed with payment without leaving the page.

The conversation list merges booking requests created by the user with those where they are the artist. If the logged-in user is not an artist the page only fetches their client requests to avoid API errors.

For an overview of the API fields used for sorting and previews, see the bullet about `last_message_content` and `last_message_timestamp` in the [README](../README.md).
