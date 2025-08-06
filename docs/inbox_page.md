# Inbox Page Overview

Clients and artists communicate through the **Inbox** page.

![Inbox layout](inbox_screenshot.svg)

## UX Flow

1. Conversation list shows all booking requests.  
   Unread threads display a red dot and are sorted by `last_message_timestamp`.
2. Selecting a conversation opens the chat area.  
   Quotes appear as special bubbles with **Accept** and **Decline** buttons.
3. **Show Details** toggles a side panel with booking information and quick
   links for deposit payments and calendar events.

![Inbox flow](inbox_flow.svg)

Notifications for new messages link directly to the relevant conversation.
System messages guide users when a booking request is created or a quote
is ready. These messages can include an `action` field such as
`review_quote` that tells the frontend to display a matching
call-to-action button in the thread.

The conversation list merges booking requests created by the user with
those where they are the artist. Non-artist users only fetch their client
requests to avoid API errors.

For the API fields used for sorting and previews, see the bullet about
`last_message_content` and `last_message_timestamp` in the
[README](../README.md).
