# Investment Manager V2 Beta 1

A Firebase-backed investor management dashboard for tracking investor capital, monthly profit, payments, cheques, and reports with a Persian/Jalali user experience.

## Beta 1 highlights

- Modular front-end structure with separate `css/`, `js/`, and `assets/` directories.
- Transaction-based ledger model with backward compatibility for legacy investor `capital` and `payments` fields.
- Monthly compound-profit engine that calculates future profit on active capital plus unpaid profit.
- ISO-8601 internal date storage with Jalali display and picker editing.
- Investor summary cards and dashboard KPI cards for active capital, accumulated profit, paid profit, and today's settlement amount.

## Data model

Investor records continue to live in the existing Firebase/Firestore path. Beta 1 adds a compatible `transactions` array to investor documents.

Supported transaction types:

- `capital_deposit`
- `capital_withdrawal`
- `profit_payment`
- `compound_profit`
- `settlement`
- `adjustment`

Each transaction contains:

```json
{
  "id": "string",
  "investorId": "string",
  "type": "capital_deposit",
  "amount": 1000000,
  "date": "2026-07-17",
  "description": "سرمایه اولیه",
  "createdAt": "2026-07-17T00:00:00.000Z"
}
```

## Development

This is a static Firebase client application. Open `index.html` in a browser or serve the repository root with any static file server.

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
