// Chromium's tagged PDF has no mapping for MathML, and KaTeX hides its visual
// glyphs from accessibility, so display equations were absent from the PDF
// structure tree. Before printing, the renderer labels each display equation
// as an image whose text alternative is its TeX source; Chromium then emits a
// Figure with /Alt at the equation's reading position. Only the print session
// runs this; the web DOM keeps KaTeX's MathML (decision 0110, #17).
//
// The .katex-display span is also the overflow region, whose print handler
// removes role and aria-label during Page.printToPDF, so the label is guarded
// against removal on these spans. A label on the inner .katex box produces no
// structure element.
//
// The function is serialized into the page, so it must stay self-contained.
export function tagDisplayEquationsForPrint(document) {
  const guarded = new Set(["role", "aria-label"]);
  const displays = [...document.querySelectorAll(".katex-display")];
  const labels = displays.map((display) => display
    .querySelector('annotation[encoding="application/x-tex"]')
    ?.textContent
    ?.trim() ?? "");
  const missing = labels.flatMap((label, index) => (label ? [] : [index]));
  if (displays.length === 0 || missing.length > 0) {
    return { displays: displays.length, labelled: 0, missing: missing.slice(0, 20) };
  }
  displays.forEach((display, index) => {
    const removeAttribute = display.removeAttribute.bind(display);
    display.removeAttribute = (name) => {
      if (!guarded.has(String(name).toLowerCase())) removeAttribute(name);
    };
    display.setAttribute("role", "img");
    display.setAttribute("aria-label", labels[index]);
  });
  return { displays: displays.length, labelled: displays.length, missing: [] };
}

export function assertDisplayEquationTags(result) {
  if (
    !result
    || !Number.isSafeInteger(result.displays)
    || result.displays < 1
    || result.labelled !== result.displays
  ) {
    throw new Error(`Display equations could not be tagged for print: ${JSON.stringify(result)}`);
  }
  return result;
}
