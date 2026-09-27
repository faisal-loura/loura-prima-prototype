import "server-only";
import type { Ctx } from "./context";

/*
 * Second prototype fixture: the monthly demand forecast (draft 0.1).
 *
 * Only the inputs are seeded — the four records a planner would already have.
 * The walkthrough itself is run live in front of an audience: ask in the
 * composer, approve the proposed task, watch the agent draft, ask Sales, and
 * revise. Nothing here pre-writes the forecast or its requests.
 *
 * It also serves the reuse check in the Release 1 charter: same platform,
 * records, and agents as the sales-order case, a different activity, and no
 * scenario-specific code or screens.
 *
 * All quantities are fictional. They test product behavior; they do not
 * establish Prima's process, cadence, or data quality.
 */

const SALES_HISTORY = `Sales history — CRS-10 croissant boxes (fictional)

Item: CRS-10, croissant box, 10 pieces
Channel: all customers

August 2026    11,450 boxes
September 2026 10,980 boxes
October 2026   11,170 boxes
Three-month average: 11,200 boxes/month

Same month last year (November 2025): 10,000 boxes

Note: this export is raw order history. It has not been cleaned of one-off
orders, stockouts, or past promotions.`;

const HOLIDAY_CALENDAR = `Holiday calendar — November 2026 (fictional)

School mid-term holiday: 2–9 November 2026 (8 days).

Comparable school-holiday months in this history (Nov 2025, Apr 2026) sold
about 15% below the surrounding months for CRS-10.

Caution: Hijri-dated periods such as Ramadan move about 11 days earlier each
Gregorian year, so same-month comparisons across years do not align. No Hijri
period falls in November 2026.`;

const SALES_INTELLIGENCE = `Sales intelligence — new café group contract (fictional)

A café group (12 outlets) is in commercial discussion for a standing order of
about 2,000 CRS-10 boxes per month.

Status at the time of writing: NOT CONFIRMED. No signature date, no start date,
no signed document attached. Recorded as commercial intelligence only.`;

const LAST_FORECAST = `Forecast vs actual — CRS-10, October 2026 (fictional)

Forecast issued: 11,000 boxes
Actual sold:     11,170 boxes
Difference:      +170 boxes (+1.5%)

Kept as a reference point. Prima has not named who is responsible for forecast
error, so no error measurement is maintained here.`;

/** Inserted once; a second run finds the sales history and does nothing. */
export async function seedForecastCase(sys: Ctx) {
  const org = sys.me.org_id;
  const marker = "Sales history — CRS-10 croissant boxes";
  const { data: existing } = await sys.db.from("sources").select("id").eq("title", marker).maybeSingle();
  if (existing) return { skipped: true };

  const { data: people } = await sys.db.from("members").select("user_id,email");
  const id = (email: string) => (people ?? []).find((p) => p.email === email)?.user_id as string;
  const sam = id("sam@loura.test");
  const omar = id("omar@loura.test");
  const faisal = id("faisal@loura.test") ?? sam;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const must = (res: { data: unknown; error: { message: string } | null }, what: string): Record<string, any> => {
    if (res.error) throw new Error(`forecast seed ${what}: ${res.error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.data as Record<string, any>;
  };
  const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

  // Sales answers commercial questions in this case.
  if (omar) await sys.db.from("members").update({ title: "Commercial & sales" }).eq("user_id", omar);

  const observed = ago(40);
  const sourceSpecs: Record<string, unknown>[] = [
    {
      title: marker, kind: "record", origin: "Sales export (fictional)", content: SALES_HISTORY,
      data: { kind: "sales_history", sku: "CRS-10", unit: "boxes", three_month_average: 11200, same_month_last_year: 10000, months: { "2026-08": 11450, "2026-09": 10980, "2026-10": 11170 } },
      owner_id: faisal,
    },
    {
      title: "Holiday calendar — November 2026", kind: "record", origin: "Planning calendar (fictional)", content: HOLIDAY_CALENDAR,
      data: { kind: "calendar", month: "2026-11", school_holiday: { from: "2026-11-02", to: "2026-11-09" }, comparable_effect_pct: -15 },
      owner_id: faisal,
    },
    { title: "Sales intelligence — new café group contract", kind: "document", origin: "Noted by Omar Nasser (fictional)", content: SALES_INTELLIGENCE, data: {}, owner_id: omar ?? faisal },
    { title: "Forecast vs actual — CRS-10, October 2026", kind: "document", origin: "Planning record (fictional)", content: LAST_FORECAST, data: {}, owner_id: faisal },
  ];
  for (const row of sourceSpecs) {
    must(await sys.db.from("sources").insert({ org_id: org, restricted: false, observed_at: observed, ...row }).select("id").single(), "source");
  }

  return { skipped: false, sources: sourceSpecs.length };
}
