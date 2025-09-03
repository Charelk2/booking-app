# Travel Estimator

The travel estimator predicts costs for different travel modes based on trip distance.

## Inputs
- `distance_km` (float): total travel distance in kilometres.

## Outputs
Returns a list of mode-cost pairs:

```json
[
  {"mode": "driving", "cost": 123.45},
  {"mode": "flight", "cost": 456.78}
]
```

`booking_quote.calculate_quote_breakdown` selects the cheapest mode for the quote total and exposes all estimates via the `/api/v1/quotes/calculate` endpoint.

## Sound Provisioning

The quote calculator also estimates sound equipment costs based on the musician's service settings:

- **Own sound (driving only):** adds no charge when driving. If flying is cheaper, the calculator switches to the artist's external providers and marks the override.
- **Artist-arranged flat:** includes the artist's `sound_flat_price`.
- **External providers:** picks the artist's preferred provider for the event city and uses that service's price.

If no provider is configured for the event city, the estimator falls back to
the first preferred provider with a stored price.

The response now includes `sound_cost`, `sound_mode`, and `sound_mode_overridden` fields.

The Booking Wizard automatically recomputes travel mode and sound estimates on
the review step whenever the user changes the event date or location, ensuring
the displayed quote always reflects the latest inputs.

Weather forecasts for destinations are fetched asynchronously. The `/api/v1/travel-forecast`
endpoint now returns a task identifier; clients call `/api/v1/travel-forecast/{task_id}` to
retrieve the result once ready. The worker retries failed requests and stores
unresolvable jobs in a dead-letter queue.
