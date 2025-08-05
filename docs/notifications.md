# Notifications API and Card Usage

`NotificationCard` displays a single alert in the drawer or full screen modal.
The frontend converts API responses using `getNotificationDisplayProps` which
maps each notification to `NotificationCard` props. Message notifications are
created whenever a new chat message is sent. The card subtitle includes a short
snippet of the latest message so clients can quickly decide whether they need to
open the conversation.

Important fields returned by `/api/v1/notifications`:

- **sender_name** – name or business name of the actor that triggered the
  notification. When not stored, the backend derives it from related booking
  requests or bookings. `getNotificationDisplayProps` also falls back to parsing
  the sender name from message strings like `"New message from Bob: Hi"` when
  this field is missing.
- **link** – relative path to navigate to when the card is clicked. The UI uses
  `router.push(link)` so paths must be valid client routes.
- **avatar_url** – optional profile picture for the relevant artist or client.
  When absent, the UI displays a default placeholder image so booking
  confirmations and deposit reminders still show an avatar.

Clicking a card marks the notification read then navigates to `link`. The card
shows a coloured icon based on the status, the sender name as the title and a
short subtitle derived from the notification type.

For message notifications the `link` points directly to
`/inbox?requestId={id}`, opening the Inbox with that conversation active.
This lets users jump from the notification drawer straight to the chat thread
without any intermediate redirect.
