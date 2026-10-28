# Bundled DMC colors come from craft-color-codes (CC BY 4.0)

DMC publishes no licensed code → RGB table, so every table online is someone's approximation, and most carry no license or say "personal use only". We bundle `dmc-floss.json` from [makebead/craft-color-codes](https://github.com/makebead/craft-color-codes) (commit `84dbdc2`), unchanged, under CC BY 4.0, and credit it in the app's README. Of the tables with a license, it is the only one that documents its provenance: it cross-checks three sources and settles conflicts by a written rule (for example DMC 309 is red, not the grey-brown older tables carry). The license costs only a credit line, which fits the permissive license in ADR-0001.

The table is a fallback. A color printed in the PDF wins once the legend reader picks it up, and the stitcher can set a thread's color with a correction. Getting a shade slightly wrong is therefore cheap.

## Considered Options

- **sharlagelfand/dmc (MIT)**: no credit needed, but it copies an unlicensed table unchanged and keeps its known errors.
- **No table at all**: no license question, but every chart without printed colors would import grey until each color is set by hand.
- **Measuring our own table** from a full set of DMC floss with a color sensor: clean license and true-to-thread colors, but a day or more of measuring. Worth revisiting if the bundled colors prove too far off, or to drop the credit.

## Consequences

The craft-color-codes data is itself partly built on unlicensed upstream tables, so its license is real but its chain isn't entirely clean. Color values are close to plain facts, so we accept that risk.
