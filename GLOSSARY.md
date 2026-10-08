# tracker-keeper

A browser app for following cross stitch charts: import a chart PDF, fix what the import got wrong, and track stitching progress.

## Charts

**Chart**:
The stitch grid that comes from importing a chart PDF: what goes in each cell, plus the chart's legend.
_Avoid_: Pattern, design

**Source PDF**:
The original PDF one or more charts were imported from. It is kept as the reference for what the designer actually printed. A PDF that holds several separate designs produces several charts.
_Avoid_: Original, file, upload

**PDF style**:
One way a source PDF prints a chart (for example symbols on white, symbols on color, or color blocks). A PDF that prints the same chart in several PDF styles still yields one chart.
_Avoid_: Print style, variant, version, copy, display style

**Display style**:
How the app draws a chart on screen (symbols only, color blocks, or color with symbols). It is a viewing choice, so switching it never changes the chart, and it is independent of the PDF styles in the source PDF.
_Avoid_: Variant, print style, view mode

**Correction**:
A change to a chart that makes it match its source PDF more closely, fixing something the import got wrong. Every project of that chart sees it.
_Avoid_: Fix, edit, adjustment

**Import issue**:
A problem the import finds in a chart that suggests it doesn't match its source PDF: a legend count mismatch, a symbol not in the legend, a legend entry with no stitches, or a size mismatch. Each one belongs to a chart, never to a project, and names the cells it concerns; it goes away once corrections make it no longer true, or once the stitcher dismisses it as matching the source PDF.
_Avoid_: Warning, error, flag, problem, discrepancy

**Symbol**:
The mark printed in a chart cell that tells the stitcher which legend entry belongs there. It is identified by its font and character code, or by its drawn shape when it isn't text.
_Avoid_: Glyph, icon, key

**Thread**:
One specific floss, identified by brand and code (for example DMC 310).
_Avoid_: Floss, color, colour

**Legend**:
The chart's table that maps each symbol to what to stitch with.
_Avoid_: Key, palette, color list

**Legend entry**:
One row of the legend: one symbol and the thread or threads it stands for. Two legend entries may look the same color yet still be different entries.
_Avoid_: Palette entry, color, colour

**Blend**:
A legend entry that uses more than one thread in the needle at once (for example 1 strand of 310 + 1 strand of 3371).
_Avoid_: Mix, tweed

## Stitching

**Project**:
One stitching of a chart, with its own progress. The same chart can have several projects.
_Avoid_: Progress file, session, WIP

**Adjustment**:
A deliberate change in one project that makes one cell a different legend entry, so that project's stitching differs from the chart on purpose. The chart itself is unchanged.
_Avoid_: Correction, override, edit

**Substitution**:
In one project, stitching every cell of a legend entry with a different thread from the one the legend names (for example, using 3866 because 3865 isn't on hand). The cells and symbol stay the same.
_Avoid_: Swap, replacement, adjustment
