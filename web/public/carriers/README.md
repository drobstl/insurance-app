# Carrier logos

The lead presentation's "A-rated carriers" strip (Rapport slide) renders a logo
for each carrier the agent shows. Logos are looked up **by convention**:

    /public/carriers/<carrier-id>.png

If the file exists it renders; if not, the strip falls back to a clean text
wordmark automatically — so logos can be added incrementally with no code change.

## Spec

- Format: PNG with a **transparent background** (SVG also fine — set the `logo`
  field in `web/lib/presentation-carriers.ts` to point at it).
- Size: roughly **40px tall** (the strip caps display at 20px tall / 120px wide).
- Use **official, approved** carrier marks (e.g. from the carrier's agent
  marketing portal). Do not scrape arbitrary versions off the web.

## File names (carrier id → name)

| file | carrier |
|------|---------|
| `mutual-of-omaha.png` | Mutual of Omaha |
| `americo.png` | Americo |
| `foresters.png` | Foresters Financial |
| `transamerica.png` | Transamerica |
| `mutual-trust.png` | Mutual Trust Life |
| `protective.png` | Protective |
| `banner.png` | Banner Life |
| `john-hancock.png` | John Hancock |
| `corebridge.png` | Corebridge Financial |
| `fg.png` | F&G |
| `american-amicable.png` | American Amicable |
| `royal-neighbors.png` | Royal Neighbors |
| `gerber.png` | Gerber Life |
| `sbli.png` | SBLI |
| `assurity.png` | Assurity |
| `national-life.png` | National Life Group |
| `gtl.png` | GTL |
| `ameritas.png` | Ameritas |
| `columbus-life.png` | Columbus Life |
| `lincoln.png` | Lincoln Financial |
| `prudential.png` | Prudential |
| `pacific-life.png` | Pacific Life |
| `north-american.png` | North American |
| `sagicor.png` | Sagicor |
| `united-home-life.png` | United Home Life |
| `liberty-bankers.png` | Liberty Bankers Life |
| `cincinnati-life.png` | Cincinnati Life |
| `aetna.png` | Aetna |
| `ethos.png` | Ethos |
| `occidental.png` | Occidental Life |
| `american-general.png` | American General |
| `kansas-city-life.png` | Kansas City Life |

The id list is the source of truth in `web/lib/presentation-carriers.ts`.
