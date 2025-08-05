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
