# Licensing

Copyright © 2026 lusoris contributors

This repository uses a split licence. The licence follows the nature of the
material, not merely its filename extension. A file-specific copyright or
licence notice overrides this general allocation for that file or identified
part.

## Technical material: EUPL v1.2 or later

Project-authored software and technical execution material is licensed under
the European Union Public Licence v1.2 or, at your option, a later version as
permitted by Article 5 of that licence. The enclosed licence text has the SPDX
identifier `EUPL-1.2`; the later-version choice is stated in prose because
SPDX does not define a separate `-or-later` identifier for the EUPL.

This scope includes project-authored:

- source code and build or deployment code;
- scripts, command-line tools, workers, and application code;
- automated tests and test harnesses;
- machine-executable experiment runners and policies;
- configuration files, data schemas, manifests, and workflow definitions;
- package metadata, lockfiles, and other technical build infrastructure; and
- functional website and book-generation code.

The verbatim EUPL v1.2 English text is in [`LICENSE`](LICENSE).

Text provenance: [`LICENSE`](LICENSE) is the canonical English text published
by the [SPDX License List](https://spdx.org/licenses/EUPL-1.2), which links the
[European Commission source](https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12).

## Original research and presentation: CC BY-SA 4.0

Original project prose, mathematical exposition, original diagrams and plots,
and the project-authored presentation of the generated book and sites are
licensed under the Creative Commons Attribution-ShareAlike 4.0 International
Public License (`CC-BY-SA-4.0`). This includes the copyrightable selection,
arrangement, typography, and visual composition of those rendered editions.
The software that implements the rendering remains covered by the EUPL scope
above.

When redistributing or adapting material in this scope, attribute it as:

> 20 Watts Was Enough — Copyright © 2026 lusoris contributors — CC BY-SA 4.0

Include a link to this repository when reasonably practicable, identify
changes, and comply with the ShareAlike terms. The verbatim legal code is in
[`LICENSES/CC-BY-SA-4.0.txt`](LICENSES/CC-BY-SA-4.0.txt).

Text provenance: the enclosed legal code is copied verbatim from the
[Creative Commons official plain-text legal code](https://creativecommons.org/licenses/by-sa/4.0/legalcode.txt).

The static web distribution accompanies these project licences with
[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt) and the applicable files
under [`LICENSES/`](LICENSES/). Its build fails if the notices do not match the
packages actually bundled into the browser application.

The browser application bundles `elkjs@0.9.3`, which Mermaid uses for diagram
layout, under the Eclipse Public License 2.0; the full licence text is in
[`THIRD_PARTY_NOTICES.txt`](THIRD_PARTY_NOTICES.txt). The bundled file is
JavaScript compiled from Java. Its source code is available from the
[elkjs repository at tag `0.9.3`](https://github.com/kieler/elkjs/tree/0.9.3)
(commit `a8304cf79fde75bc2ab1a89d28320f53f8637436`) and the
[Eclipse Layout Kernel repository](https://github.com/eclipse/elk) that the
elkjs build compiles. The EPL applies to that module only; it does not change
the licences of the project's own files. The web build fails when an EPL-2.0
package is bundled without a matching source offer here.

Tagged native `20w` files carry a separate generated Go-module notice and SPDX
inventory. The reviewed Goldmark MIT text is retained verbatim in
[`LICENSES/goldmark-MIT.txt`](LICENSES/goldmark-MIT.txt); release preparation
fails if that text or the compiled module graph differs from the reviewed
identity.

The CLRS generator wheelhouse foundation retains the reviewed Promise 2.3 MIT
text verbatim in [`LICENSES/promise-MIT.txt`](LICENSES/promise-MIT.txt). Its
source distribution and candidate wheel keep their own MIT terms; the
foundation fails if the retained text differs from the recorded identity.

## Material not relicensed by this repository

The licences above apply only to rights that the project contributors are
entitled to license. In particular:

- [`sources/`](sources/README.md) is excluded wholesale unless an individual
  file contains an explicit project licence notice. Link-only provenance
  records, licensed snapshots, source leads, quotations, and any separately
  rights-cleared imports retain their own recorded terms.
- Official taxonomy snapshots and other official or third-party datasets
  retain their original copyright, database rights, licences, notices, and
  statutory conditions. Project processing does not replace those terms.
- DFG classification labels in the taxonomy and book are retained only under
  the DFG scientific-redistribution terms recorded in the source provenance;
  they are not included in the project's commercial-use grant. ANZSRC and
  EuroSciVoc material carry their separately recorded CC BY 4.0 terms.
- Papers, articles, standards, laws, images, software dependencies, and all
  other third-party material retain their respective terms.
- A citation, hyperlink, bibliography entry, factual reference, or lawful
  quotation does not relicense the cited or quoted work.
- Generated outputs can combine project-licensed material with third-party
  material. Each included component remains subject to its own notices and
  terms; the project licences do not expand rights in that third-party
  material.

No patent, trademark, publicity, privacy, personality, or other right is
granted beyond the rights expressly covered by the applicable licence.

## Contributions

By contributing, you represent that you have the necessary rights and agree
that your contribution will be licensed under the applicable scope above. Mark
third-party material and exceptions explicitly; do not assume that academic or
public availability makes a work open-licensed.
