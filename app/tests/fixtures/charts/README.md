# Real-chart fixtures

Real chart PDFs that are safe to commit. Everything else in the test suite uses synthetic PDFs.

**Never add a purchased or third-party chart here**, or anything derived from one (extracted data, expected outputs). Those stay in the maintainer's private suite (see Further Notes in #1).

## pumpkin-slut.pdf

- **Where it came from:** designed by Sara Kevorkian (Pointy Ends), the maintainer of this repo, in 2022, and added here by her as a test fixture.
- **How it was made:** designed in PCStitch and printed with "Microsoft Print to PDF".
- **License:** © 2022 Sara Kevorkian (Pointy Ends). All rights reserved. It's included only as a test fixture for tracker-keeper: you may use it to run this project's tests, but not redistribute or sell it. The repo's license doesn't cover this file.

What it exercises:

- **Path-drawn symbols.** Every symbol, in the chart and in both legends, is a filled path, not a font character. The only text is the title, margin numbers, page numbers and legend lines.
- **Multi-page joining.** 4 chart pages laid out 2 × 2, with row and column numbers in the margins. Rows and columns repeated from a neighbouring page are drawn shaded grey, symbols included.
- **Two legends.** A short one beside the chart on page 2 (symbol, color swatch, DMC code) and a full one on page 5 (symbol, swatch, strands, brand, code, name). The legends print no stitch counts.
- **Two printed sizes.** Page 5 prints both "Grid Size: 90W x 90H" and "Design Area: 67 x 86 stitches". The chart pages draw the full 90 × 90 grid.
- **Expected result:** a 90 × 90 chart with 10 legend entries, all DMC with 2 strands: 817, 986, 934, 740, 900, 3824, 3341, 3340, 921, 300.
- **Other details:** centre arrows in the margins.
