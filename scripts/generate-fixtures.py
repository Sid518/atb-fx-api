"""Optional maintainer tool: generate independent exact expectations with Fraction.

Python is not required to run the API or its tests; the generated JSON is committed.
"""
import json
from decimal import Decimal
from fractions import Fraction
from pathlib import Path

rates = {"CAD": "1.00", "USD": "0.72", "EUR": "0.66", "GBP": "0.57",
         "AUD": "1.09", "JPY": "109.50"}
amounts = ["0", "0.01", "1.015", "123.45", "0.000000000001", "999999999999.999999999999"]

def rounded(value, places):
    # Fraction.__round__ is exact, including halfway cases; no float conversion.
    units = round(value * 10 ** places)
    digits = str(units).zfill(places + 1)
    return digits[:-places] + "." + digits[-places:]

rows = []
for source in rates:
    for target in rates:
        for amount in amounts:
            rate = Fraction(rates[target]) / Fraction(rates[source])
            rows.append({"from": source, "to": target, "amount": amount,
                         "convertedAmount": rounded(Fraction(amount) * rate, 2),
                         "exchangeRate": rounded(rate, 12)})
destination = Path(__file__).resolve().parents[1] / "test/fixtures/conversions.json"
destination.write_text(json.dumps(rows, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {len(rows)} independent exact reference cases.")
