# CBT QUESTION PAPER STUDIO — AGENT DEVELOPMENT DIRECTIVES & STANDARDS

This file defines the mandatory structural conventions, file naming standards, `data.json` schemas, and ZIP archiving rules for the CBT Question Paper Studio. All AI coding agents, background workers, and automated generators working on this repository MUST strictly follow these standards.

---

## 1. UNIFORM PDF IMAGE NAMING CONVENTIONS
* **Delimiter Specification**: Image files derived from cropped PDF question papers MUST strictly follow the delimited filename pattern:
  ```text
  <SectionName>__--__<QuestionNumber>__--__<PartNumber>.<extension>
  ```
  *Example*: `Section 1__--__28__--__1.png`, `Physics Sec A__--__5__--__2.png`
* **Helper Method**: Always construct image filenames using the `buildImageFileName(sectionName, questionNumber, partNumber, extension)` function from `/src/utils/constants.ts`.
* **Zero Discrepancies**: Image filenames in the filesystem/rawFiles map MUST match the `fileName` string referenced in the `images` array and `pdfData` coordinate objects inside `data.json`.

---

## 2. STANDARD `data.json` SCHEMA & HIERARCHY
The `data.json` file generated or exported by the application MUST conform to the standard structure below:

```json
{
  "testConfig": {
    "pdfFileHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "additionalData": {
      "examTitle": "JEE Advanced Practice Paper",
      "instructionPages": [1]
    }
  },
  "pdfCropperData": {
    "Physics": {
      "Section 1": {
        "q1": {
          "que": 1,
          "key": "q1",
          "type": "mcq",
          "marks": { "cm": 4, "im": -1, "pm": 0, "max": 4 },
          "answerOptions": "A, B, C, D",
          "correctAnswer": "A",
          "pdfData": [
            {
              "page": 2,
              "pageNumber": 2,
              "ymin": 0.12,
              "xmin": 0.035,
              "ymax": 0.35,
              "xmax": 0.49,
              "bounds": [0.035, 0.12, 0.455, 0.23],
              "filename": "Section 1__--__1__--__1.png"
            }
          ],
          "images": [
            {
              "id": "img-q1-1",
              "fileName": "Section 1__--__1__--__1.png",
              "resolvedUrl": "blob:http://localhost:3000/...",
              "sizeBytes": 45210
            }
          ]
        }
      }
    }
  },
  "appVersion": "2.6.0",
  "generatedBy": "pdfCropperPage"
}
```

### Key Schema Mandatory Requirements:
1. **Root Fields**: Must contain `testConfig`, `pdfCropperData`, `appVersion`, and `generatedBy`.
2. **Hierarchy**: `pdfCropperData` -> `SubjectName` -> `SectionName` -> `QuestionKey` (`q1`, `q2`, etc.).
3. **Question Object**: Must include `que`, `key`, `type` (`mcq`, `nat`, `msq`, `msm`), `marks`, `pdfData` (array of coordinate objects), and `images` array.
4. **Spatial Break Coordinates**: Multi-part stitched crops MUST store multiple coordinate objects in `pdfData` array corresponding to each cropped region fragment.

---

## 3. ZIP ARCHIVE BUNDLING SPECIFICATIONS
When serializing or exporting a Question Paper Archive (`.zip`), the output package MUST contain:

1. **Root Manifests**:
   - `data.json` (Root JSON matching the schema above).
   - `studio_manifest.json` (Full archive metadata & asset manifest).
2. **Raw Source Document**:
   - `source_document.pdf` (The original uploaded source PDF file).
   - `answer_key.pdf` or `answer_key.json` (If extracted or uploaded).
3. **Image Assets**:
   - All cropped question images placed directly in root (or subject subfolders for Ultimate format) named per standard `<SectionName>__--__<QNo>__--__<PartNo>.png`.
   - Zero orphan/missing image references between `data.json` and the ZIP entries.

---

## 4. PDF SCANNING & AUTO-EXTRACTION RULES
* **MCQ Option Enclosure**: Every MCQ bounding box MUST extend vertically to enclose all 4 options ($A, B, C, D$ or $1, 2, 3, 4$). Cutting off option text is strictly forbidden.
* **Document-Wide Column Consensus**: If 30%+ of pages in a document are 2-column, all sparse ending pages MUST adhere to 2-column spatial boundaries ($x: 0.035 \to 0.490$ for Left, $x: 0.508 \to 0.965$ for Right).
* **Instruction Directives**: Extracted blueprint directives (from instruction pages `1, 2` or `1-3`) MUST be passed to all parallel AI extraction workers to enforce section question counts and format rules.
