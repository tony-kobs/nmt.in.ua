import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { importDocx } from "./importDocx";
import { lintTextbookMarkup } from "./lint";
import { replaceWordMath } from "./omml";

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function docx(documentXml: string): Uint8Array {
  return zipSync({
    "[Content_Types].xml": strToU8(CONTENT_TYPES),
    "_rels/.rels": strToU8(RELS),
    "word/document.xml": strToU8(documentXml),
    "word/numbering.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`,
    ),
  });
}

const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Правило скорочення</w:t></w:r></w:p>
    <w:p>
      <w:r><w:t>Список</w:t></w:r>
    </w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>перший пункт</w:t></w:r></w:p>
    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>другий пункт</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <m:oMath>
        <m:f>
          <m:num><m:r><m:t>1</m:t></m:r></m:num>
          <m:den><m:r><m:t>2</m:t></m:r></m:den>
        </m:f>
      </m:oMath>
    </w:p>
    <w:p>
      <m:oMath><m:phant><m:e><m:r><m:t>x</m:t></m:r></m:e></m:phant></m:oMath>
    </w:p>
  </w:body>
</w:document>`;

test("word math becomes latex or a review marker before mammoth sees the package", () => {
  const fraction = replaceWordMath(
    `<w:p><m:oMath><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath></w:p>`,
  );
  assert.match(fraction, /\\frac\{1\}\{2\}/);
  assert.equal(fraction.includes("oMath"), false);
  const flagged = replaceWordMath(
    `<w:p><m:oMath><m:phant><m:e><m:r><m:t>x</m:t></m:r></m:e></m:phant></m:oMath></w:p>`,
  );
  assert.match(flagged, /⟦формула⟧/);
});

test("a docx table, list and formulas become textbook markup", async () => {
  const imported = await importDocx(docx(documentXml), async () => ({ ok: false }));
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.match(imported.draft.markup, /Правило скорочення|скорочення/);
  assert.match(imported.draft.markup, /- перший пункт/);
  assert.match(imported.draft.markup, /- другий пункт/);
  assert.match(imported.draft.markup, /:::table/);
  assert.match(imported.draft.markup, /:::cell/);
  assert.match(imported.draft.markup, /\\frac\{1\}\{2\}/);
  assert.match(imported.draft.markup, /⟦формула⟧/);
  assert.equal(imported.draft.summary.tables >= 1, true);
  assert.equal(imported.draft.summary.formulas >= 1, true);
  assert.equal(imported.draft.summary.reviewFormulas >= 1, true);
  const issues = lintTextbookMarkup(imported.draft.markup);
  assert.equal(issues.some((issue) => issue.code === "import"), true);
  assert.equal(issues.some((issue) => issue.code === "formula" && issue.detail.includes("frac")), false);
});
