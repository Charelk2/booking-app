# Notifications API and Card Usage

`NotificationCard` displays a single alert in the drawer or full screen modal. The
frontend converts API responses using `getNotificationDisplayProps` which maps
each notification to `NotificationCard` props.

Important fields returned by `/api/v1/notifications`:

- **sender_name** – name or business name of the actor that triggered the
  notification. When not stored, the backend derives it from related booking
  requests or bookings.
- **link** – relative path to navigate to when the card is clicked. The UI uses
  `router.push(link)` so paths must be valid client routes.
- **avatar_url** – optional profile picture for the relevant artist or client.

Clicking a card marks the notification read then navigates to `link`. The card
shows a coloured icon based on the status, the sender name as the title and a
short subtitle derived from the notification type.
