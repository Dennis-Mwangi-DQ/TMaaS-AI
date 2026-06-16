const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, NumberFormat, PageBreak, LevelFormat,
  TabStopType, TabStopPosition, UnderlineType
} = require( 'docx' );
const fs = require( 'fs' );

// ─── COLOUR PALETTE ───────────────────────────────────────────────────────────
const C = {
  navy: "0D2137",
  blue: "1A5276",
  midBlue: "2E86C1",
  lightBlue: "D6EAF8",
  teal: "148F77",
  lightTeal: "D0ECE7",
  amber: "D4AC0D",
  lightAmber: "FEF9E7",
  red: "C0392B",
  lightRed: "FADBD8",
  green: "1E8449",
  lightGreen: "D5F5E3",
  gray: "5D6D7E",
  lightGray: "EBF5FB",
  white: "FFFFFF",
  black: "0D0D0D",
  border: "BDC3C7",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function cellBorder ( color = C.border )
{
  const b = { style: BorderStyle.SINGLE, size: 4, color };
  return { top: b, bottom: b, left: b, right: b };
}

function shading ( fill, type = ShadingType.CLEAR ) { return { fill, type }; }

function txt ( text, opts = {} )
{
  return new TextRun( {
    text,
    font: opts.font || "Arial",
    size: opts.size || 22,
    bold: opts.bold || false,
    italics: opts.italic || false,
    color: opts.color || C.black,
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
  } );
}

function para ( children, opts = {} )
{
  if ( typeof children === 'string' ) children = [ txt( children, opts ) ];
  return new Paragraph( {
    heading: opts.heading,
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before || 0, after: opts.after || 120 },
    border: opts.border,
    numbering: opts.numbering,
    indent: opts.indent,
    children,
  } );
}

function heading1 ( text, color = C.navy )
{
  return new Paragraph( {
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: C.midBlue, space: 4 } },
    children: [ txt( text, { size: 32, bold: true, color } ) ],
  } );
}

function heading2 ( text, color = C.blue )
{
  return new Paragraph( {
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 100 },
    children: [ txt( text, { size: 26, bold: true, color } ) ],
  } );
}

function heading3 ( text, color = C.midBlue )
{
  return new Paragraph( {
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [ txt( text, { size: 23, bold: true, color } ) ],
  } );
}

function spacer ( before = 160, after = 0 )
{
  return new Paragraph( { spacing: { before, after }, children: [ txt( "" ) ] } );
}

function bullet ( text, level = 0, color = C.black )
{
  return new Paragraph( {
    numbering: { reference: "bullets", level },
    spacing: { before: 60, after: 60 },
    children: [ txt( text, { color } ) ],
  } );
}

function numbered ( text, level = 0 )
{
  return new Paragraph( {
    numbering: { reference: "numbers", level },
    spacing: { before: 60, after: 60 },
    children: [ typeof text === 'string' ? txt( text ) : text ],
  } );
}

// ─── COLOURED CALLOUT BOX ─────────────────────────────────────────────────────
function calloutBox ( label, bodyLines, fillColor, borderColor, labelColor = C.white )
{
  const rows = [
    new TableRow( {
      children: [
        new TableCell( {
          width: { size: 9360, type: WidthType.DXA },
          borders: cellBorder( borderColor ),
          shading: shading( borderColor ),
          margins: { top: 80, bottom: 80, left: 140, right: 140 },
          children: [ para( [ txt( label, { bold: true, color: labelColor, size: 22 } ) ], { before: 0, after: 0 } ) ],
        } ),
      ],
    } ),
    ...bodyLines.map( line =>
      new TableRow( {
        children: [
          new TableCell( {
            width: { size: 9360, type: WidthType.DXA },
            borders: cellBorder( borderColor ),
            shading: shading( fillColor ),
            margins: { top: 60, bottom: 60, left: 160, right: 160 },
            children: [ para( [ txt( line, { size: 20 } ) ], { before: 0, after: 0 } ) ],
          } ),
        ],
      } )
    ),
  ];
  return new Table( { width: { size: 9360, type: WidthType.DXA }, columnWidths: [ 9360 ], rows } );
}

// ─── SCORE BADGE CELL ─────────────────────────────────────────────────────────
function scoreBadgeCell ( score, max, fillColor )
{
  return new TableCell( {
    width: { size: 1200, type: WidthType.DXA },
    borders: noBorders,
    shading: shading( fillColor ),
    margins: { top: 80, bottom: 80, left: 80, right: 80 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph( {
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [ txt( `${ score }/${ max }`, { bold: true, size: 22, color: C.white } ) ],
      } ),
    ],
  } );
}

// ─── MAIN DOCUMENT ────────────────────────────────────────────────────────────
const CONTENT_W = 9360; // US Letter 1" margins

const doc = new Document( {
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          },
          {
            level: 1, format: LevelFormat.BULLET, text: "\u25E6", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1080, hanging: 360 } } }
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } }
          },
        ],
      },
    ],
  },

  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: C.black } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: C.navy },
        paragraph: { spacing: { before: 360, after: 120 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: C.blue },
        paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: "Arial", color: C.midBlue },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },

  sections: [
    // ══════════════════════════════════════════════════════════════════════════
    // COVER PAGE
    // ══════════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        // Top accent bar (via shaded table)
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ CONTENT_W ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( {
                  borders: noBorders,
                  shading: shading( C.navy ),
                  width: { size: CONTENT_W, type: WidthType.DXA },
                  margins: { top: 200, bottom: 200, left: 240, right: 240 },
                  children: [
                    new Paragraph( {
                      spacing: { before: 0, after: 0 },
                      children: [ txt( "AI READINESS ADVISORY", { bold: true, size: 28, color: C.white } ) ],
                    } ),
                    new Paragraph( {
                      spacing: { before: 40, after: 0 },
                      children: [ txt( "TMaaS Agent A — DQ Digital Transformation Assessment", { size: 20, color: "AED6F1" } ) ],
                    } ),
                  ],
                } ),
              ],
            } ),
          ],
        } ),

        spacer( 800 ),

        // Client / session info box
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 2400, 6960 ],
          rows: [
            ...( [
              [ "Client Organisation", "[CLIENT NAME]" ],
              [ "Industry / Sector", "[INDUSTRY]" ],
              [ "Assessment Date", "[DATE]" ],
              [ "Session Reference", "[SESSION-REFERENCE]" ],
              [ "Assessed By", "[AGENT NAME / VERSION]" ],
              [ "Document Version", "v1.0 — DRAFT FOR REVIEW" ],
            ].map( ( [ label, value ] ) =>
              new TableRow( {
                children: [
                  new TableCell( {
                    borders: cellBorder( C.border ),
                    shading: shading( C.lightGray ),
                    width: { size: 2400, type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [ para( [ txt( label, { bold: true, size: 20 } ) ] ) ],
                  } ),
                  new TableCell( {
                    borders: cellBorder( C.border ),
                    width: { size: 6960, type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [ para( [ txt( value, { size: 20, color: C.blue } ) ] ) ],
                  } ),
                ],
              } )
            ) ),
          ],
        } ),

        spacer( 600 ),

        // Readiness level badge
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ CONTENT_W ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( {
                  borders: cellBorder( C.midBlue ),
                  shading: shading( C.lightBlue ),
                  width: { size: CONTENT_W, type: WidthType.DXA },
                  margins: { top: 200, bottom: 200, left: 200, right: 200 },
                  verticalAlign: VerticalAlign.CENTER,
                  children: [
                    new Paragraph( {
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 60 },
                      children: [ txt( "OVERALL READINESS LEVEL", { bold: true, size: 18, color: C.gray } ) ],
                    } ),
                    new Paragraph( {
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 60 },
                      children: [ txt( "[READINESS TIER]", { bold: true, size: 40, color: C.navy } ) ],
                    } ),
                    new Paragraph( {
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 0 },
                      children: [ txt( "Composite Score: [X] / [MAX]", { size: 22, color: C.blue } ) ],
                    } ),
                  ],
                } ),
              ],
            } ),
          ],
        } ),

        spacer( 800 ),

        para( [ txt( "Confidential advisory output generated by DQ TMaaS Agent A. This document is indicative and does not constitute a formal engagement.", { size: 18, color: C.gray, italic: true } ) ], { align: AlignmentType.CENTER } ),
      ],
    },

    // ══════════════════════════════════════════════════════════════════════════
    // MAIN CONTENT
    // ══════════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },

      headers: {
        default: new Header( {
          children: [
            new Table( {
              width: { size: 9720, type: WidthType.DXA },
              columnWidths: [ 6000, 3720 ],
              rows: [
                new TableRow( {
                  children: [
                    new TableCell( {
                      borders: noBorders,
                      width: { size: 6000, type: WidthType.DXA },
                      children: [
                        new Paragraph( {
                          spacing: { before: 0, after: 0 },
                          children: [
                            txt( "AI Readiness Advisory  ", { bold: true, size: 18, color: C.navy } ),
                            txt( "| DQ TMaaS Agent A", { size: 18, color: C.gray } ),
                          ],
                        } ),
                      ],
                    } ),
                    new TableCell( {
                      borders: noBorders,
                      width: { size: 3720, type: WidthType.DXA },
                      children: [
                        new Paragraph( {
                          alignment: AlignmentType.RIGHT,
                          spacing: { before: 0, after: 0 },
                          children: [ txt( "[CLIENT NAME] | CONFIDENTIAL", { size: 18, color: C.gray } ) ],
                        } ),
                      ],
                    } ),
                  ],
                } ),
              ],
            } ),
            new Paragraph( {
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.midBlue, space: 2 } },
              spacing: { before: 0, after: 80 },
              children: [ txt( "" ) ],
            } ),
          ],
        } ),
      },

      footers: {
        default: new Footer( {
          children: [
            new Paragraph( {
              border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.border, space: 2 } },
              spacing: { before: 80, after: 0 },
              tabStops: [ { type: TabStopType.RIGHT, position: TabStopPosition.MAX } ],
              children: [
                txt( "Confidential — For Internal Use Only", { size: 16, color: C.gray, italic: true } ),
                txt( "\tPage ", { size: 16, color: C.gray } ),
                new TextRun( { children: [ PageNumber.CURRENT ], font: "Arial", size: 16, color: C.gray } ),
              ],
            } ),
          ],
        } ),
      },

      children: [

        // ── SECTION 1: EXECUTIVE SUMMARY ──────────────────────────────────────
        heading1( "1. Executive Summary" ),

        para( [
          txt( "This advisory report presents the findings of a structured AI readiness assessment conducted by DQ TMaaS Agent A. The assessment evaluates the organisation's capability to adopt, implement, and sustain artificial intelligence solutions across seven critical dimensions. It provides an evidence-based score, prioritised blockers, and a sequenced roadmap for AI adoption." ),
        ], { after: 160 } ),

        // Readiness tier summary table
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 2200, 2200, 2480, 2480 ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( {
                  borders: cellBorder( C.border ),
                  shading: shading( C.navy ),
                  width: { size: 2200, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "Readiness Tier", { bold: true, size: 20, color: C.white } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  shading: shading( C.navy ),
                  width: { size: 2200, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "Composite Score", { bold: true, size: 20, color: C.white } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  shading: shading( C.navy ),
                  width: { size: 2480, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "Primary Strength", { bold: true, size: 20, color: C.white } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  shading: shading( C.navy ),
                  width: { size: 2480, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "Primary Gap", { bold: true, size: 20, color: C.white } ) ], { before: 0, after: 0 } ) ],
                } ),
              ],
            } ),
            new TableRow( {
              children: [
                new TableCell( {
                  borders: cellBorder( C.border ),
                  shading: shading( C.lightBlue ),
                  width: { size: 2200, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "[READINESS TIER]", { bold: true, size: 20, color: C.blue } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  width: { size: 2200, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "[X] / [MAX]", { size: 20 } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  width: { size: 2480, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "[Top scoring dimension]", { size: 20 } ) ], { before: 0, after: 0 } ) ],
                } ),
                new TableCell( {
                  borders: cellBorder( C.border ),
                  width: { size: 2480, type: WidthType.DXA },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [ para( [ txt( "[Lowest scoring dimension]", { size: 20 } ) ], { before: 0, after: 0 } ) ],
                } ),
              ],
            } ),
          ],
        } ),

        spacer( 200 ),

        // Readiness tier definitions
        heading2( "Readiness Tier Definitions" ),

        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 1800, 1400, 6160 ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( "Tier", { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( "Score Range", { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 6160, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( "Description", { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
              ],
            } ),
            ...( [
              [ "Not Ready", "0–4", "Critical gaps across all dimensions. No AI deployment recommended." ],
              [ "Foundation Needed", "5–8", "Structural gaps must be resolved. Limited, low-risk AI pilots only." ],
              [ "Developing", "9–11", "Foundational elements in place. Targeted deployments feasible with oversight." ],
              [ "Ready", "12–13", "Strong readiness. AI deployment is viable across multiple use cases." ],
              [ "Advanced", "14", "Fully prepared. Organisation can pursue strategic, complex AI initiatives." ],
            ].map( ( [ tier, range, desc ], i ) =>
              new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( tier, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( range, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 6160, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( desc, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } )
            ) ),
          ],
        } ),

        spacer( 200 ),

        // Narrative summary
        heading2( "Narrative Assessment" ),
        para( "[AGENT: Insert a 3–5 sentence narrative that describes the overall readiness posture in plain language. Reference the tier, explain what the score means operationally, identify the single most important strength and the single most urgent gap, and set the tone for the recommendations that follow. Avoid generic statements — ground the narrative in the organisation's specific score profile.]", { after: 160 } ),

        // ── SECTION 2: DIMENSION SCORECARD ────────────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "2. Dimension Scorecard" ),

        para( "The table below presents scores across all seven assessment dimensions. Each dimension is rated 1 (Partial) or 2 (Strong) based on responses gathered during the discovery session. A score of 1 indicates the foundational element exists but gaps prevent reliable AI delivery; a score of 2 indicates adequate capability for the current readiness tier.", { after: 160 } ),

        // Dimension scorecard header
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 3200, 1000, 1600, 3560 ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 3200, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( "Dimension", { bold: true, color: C.white } ) ], { before: 0, after: 0 } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 1000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [ new Paragraph( { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [ txt( "Score", { bold: true, color: C.white } ) ] } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 1600, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [ para( [ txt( "Status", { bold: true, color: C.white } ) ], { before: 0, after: 0 } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 3560, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( "Assessment Summary", { bold: true, color: C.white } ) ], { before: 0, after: 0 } ) ] } ),
              ],
            } ),
            // Template rows — one per dimension
            ...( [
              [ "Systems Integration", "[X]", "[STATUS]", "[One sentence assessment of systems integration readiness.]" ],
              [ "Data Accessibility", "[X]", "[STATUS]", "[One sentence assessment of data accessibility.]" ],
              [ "Data Quality History", "[X]", "[STATUS]", "[One sentence assessment of data quality.]" ],
              [ "Use Case Specificity", "[X]", "[STATUS]", "[One sentence assessment of use case definition.]" ],
              [ "Implementation Capability", "[X]", "[STATUS]", "[One sentence assessment of technical and delivery capability.]" ],
              [ "Adoption Conditions", "[X]", "[STATUS]", "[One sentence assessment of change management and adoption readiness.]" ],
              [ "Leadership Sponsorship", "[X]", "[STATUS]", "[One sentence assessment of executive support and governance.]" ],
            ].map( ( [ dim, score, status, summary ], i ) =>
              new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 3200, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( dim, { bold: true } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( C.lightBlue ), width: { size: 1000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [ new Paragraph( { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [ txt( score, { bold: true, color: C.blue } ) ] } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1600, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 80, right: 80 }, children: [ para( [ txt( status, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 3560, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( summary, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } )
            ) ),
          ],
        } ),

        spacer( 240 ),

        // ── SECTION 3: DIMENSION-LEVEL DEEP DIVES ─────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "3. Dimension-Level Analysis" ),

        para( "This section provides a detailed breakdown of each dimension, including the evidence gathered during assessment, specific gaps identified, and the implications for AI deployment.", { after: 200 } ),

        // Template for each dimension — repeat 7×
        ...[ "Systems Integration", "Data Accessibility", "Data Quality History", "Use Case Specificity", "Implementation Capability", "Adoption Conditions", "Leadership Sponsorship" ].flatMap( ( dim, i ) => [
          heading2( `3.${ i + 1 }  ${ dim }` ),

          new Table( {
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [ 2000, 7360 ],
            rows: [
              ...[
                [ "Score", `[X] / 2   |   Status: [PARTIAL / STRONG]` ],
                [ "Evidence gathered", "[AGENT: Summarise the specific answers and signals observed in this dimension during the discovery session. Be concrete — cite what the client said, what systems they described, or what processes exist.]" ],
                [ "Gaps identified", "[AGENT: List the specific gaps in this dimension that prevent higher readiness. Be explicit about what is missing and why it matters.]" ],
                [ "AI deployment impact", "[AGENT: Explain how this dimension's current score limits or enables AI deployment. What AI initiative types are blocked or enabled by this score?]" ],
                [ "Recommended actions", "[AGENT: Provide 2–3 specific, actionable steps the organisation can take to improve this dimension's score within 90 days.]" ],
              ].map( ( [ label, value ], j ) =>
                new TableRow( {
                  children: [
                    new TableCell( { borders: cellBorder( C.border ), shading: shading( C.lightGray ), width: { size: 2000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( label, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                    new TableCell( { borders: cellBorder( C.border ), width: { size: 7360, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( value, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  ],
                } )
              ),
            ],
          } ),
          spacer( 200 ),
        ] ),

        // ── SECTION 4: CRITICAL BLOCKERS ──────────────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "4. Critical Blockers" ),

        para( "The following blockers represent the highest-priority obstacles to AI deployment. Until these are resolved, investment in AI tooling is unlikely to deliver reliable value. Each blocker is assessed for severity, root cause, and resolution pathway.", { after: 160 } ),

        // Blocker template — repeat as needed
        ...[ 1, 2, 3 ].flatMap( n => [
          new Table( {
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [ CONTENT_W ],
            rows: [
              new TableRow( {
                children: [
                  new TableCell( {
                    borders: cellBorder( C.red ),
                    shading: shading( C.red ),
                    width: { size: CONTENT_W, type: WidthType.DXA },
                    margins: { top: 80, bottom: 80, left: 160, right: 160 },
                    children: [ para( [ txt( `BLOCKER ${ n }: [BLOCKER TITLE IN CAPS]`, { bold: true, color: C.white, size: 22 } ) ], { before: 0, after: 0 } ) ],
                  } ),
                ],
              } ),
              ...( [
                [ "Affected Dimensions", "[List dimensions affected by this blocker]" ],
                [ "Severity", "[Critical / High / Medium] — [One sentence rationale]" ],
                [ "Root Cause", "[AGENT: Explain the underlying cause of this blocker based on assessment evidence. Distinguish between process, technology, and people causes.]" ],
                [ "Business Impact", "[AGENT: Describe the business risk of not resolving this blocker. What AI initiatives are blocked, and what is the cost of inaction?]" ],
                [ "Resolution Pathway", "[AGENT: Provide a clear, actionable resolution pathway. Include who needs to act, what needs to happen, and a realistic timeframe.]" ],
                [ "Dependencies", "[AGENT: Identify any other blockers or external factors that must be resolved before or alongside this blocker.]" ],
              ].map( ( [ label, value ] ) =>
                new TableRow( {
                  children: [
                    new TableCell( { borders: cellBorder( C.border ), shading: shading( C.lightGray ), width: { size: 2400, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( label, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                    new TableCell( { borders: cellBorder( C.border ), width: { size: 6960, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [ para( [ txt( value, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  ],
                } )
              ) ),
            ],
          } ),
          spacer( 240 ),
        ] ),

        // ── SECTION 5: RECOMMENDED AI USE CASES ───────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "5. Recommended AI Use Cases" ),

        para( "The following use cases are recommended based on the organisation's current readiness tier, sector context, and strategic priorities. Each is assessed across feasibility, complexity, indicative cost, expected benefit, and minimum readiness threshold.", { after: 160 } ),

        // Priority use case ranking table
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 400, 3200, 1400, 1600, 1400, 2360 ],
          rows: [
            new TableRow( {
              children: [
                ...[ [ "#", 400 ], [ "Use Case", 3200 ], [ "Min. Readiness", 1400 ], [ "Complexity", 1600 ], [ "Est. Cost", 1400 ], [ "Expected Benefit", 2360 ] ].map( ( [ h, w ] ) =>
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ new Paragraph( { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [ txt( h, { bold: true, color: C.white, size: 18 } ) ] } ) ] } )
                ),
              ],
            } ),
            ...[ 1, 2, 3 ].map( ( n, i ) =>
              new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( C.lightBlue ), width: { size: 400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ new Paragraph( { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [ txt( `${ n }`, { bold: true, size: 20, color: C.blue } ) ] } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 3200, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( "[Use Case Name]", { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( "[TIER]", { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1600, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( "[Low/Med/High]", { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( "[RANGE]", { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 2360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( "[Expected outcome]", { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } )
            ),
          ],
        } ),

        spacer( 240 ),

        // Detail cards for each use case
        heading2( "Use Case Detail Cards" ),

        ...[ 1, 2, 3 ].flatMap( n => [
          heading3( `Use Case ${ n }: [USE CASE NAME]` ),
          new Table( {
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnWidths: [ 2400, 6960 ],
            rows: [
              ...( [
                [ "Description", "[AGENT: 2–3 sentence description of what this AI use case does and how it works operationally.]" ],
                [ "Business Rationale", "[AGENT: Why is this use case appropriate for this organisation at this readiness level? Connect to their specific context.]" ],
                [ "Minimum Readiness", "[Readiness tier name] — [Explain why this tier is the minimum threshold for this use case]" ],
                [ "Technical Complexity", "[Low / Medium / High] — [Explain what integration, infrastructure, or data requirements drive this complexity rating]" ],
                [ "Indicative Cost", "[CURRENCY RANGE] implementation | [ONGOING COST if SaaS] — [Note what drives cost variance]" ],
                [ "Data Requirements", "[AGENT: What data does this use case need? How clean, structured, and accessible does it need to be? What is the minimum viable dataset?]" ],
                [ "Integration Points", "[AGENT: What systems, APIs, or workflows does this use case need to connect to? What integration complexity exists?]" ],
                [ "Expected Benefits", "[AGENT: What measurable outcomes should the organisation expect? Include qualitative and quantitative benefit hypotheses.]" ],
                [ "Key Risks", "[AGENT: What are the top 2–3 risks with this use case? Include technical, operational, and adoption risks.]" ],
                [ "Recommended Sequencing", "[AGENT: When in the 90-day roadmap should this use case be initiated? What must be true before it can start?]" ],
                [ "Vendor / Build Note", "[AGENT: Should this be built in-house, procured via SaaS, or co-developed? Name indicative vendor categories if relevant.]" ],
              ].map( ( [ label, value ], i ) =>
                new TableRow( {
                  children: [
                    new TableCell( { borders: cellBorder( C.border ), shading: shading( C.lightGray ), width: { size: 2400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( label, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                    new TableCell( { borders: cellBorder( C.border ), shading: shading( C.white ), width: { size: 6960, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( value, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  ],
                } )
              ) ),
            ],
          } ),
          spacer( 200 ),
        ] ),

        // ── SECTION 6: ROADMAP ─────────────────────────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "6. Recommended Roadmap" ),

        para( "The roadmap below sequences recommended actions across three horizons: immediate stabilisation (0–30 days), foundational build (31–90 days), and AI deployment (91–180 days). Actions are prioritised by their impact on unlocking readiness and their dependency relationships.", { after: 160 } ),

        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 1800, 1400, 4360, 1800 ],
          rows: [
            new TableRow( {
              children: [
                ...[ [ "Horizon", 1800 ], [ "Timeline", 1400 ], [ "Action", 4360 ], [ "Owner / Accountable", 1800 ] ].map( ( [ h, w ] ) =>
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: w, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, children: [ para( [ txt( h, { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } )
                ),
              ],
            } ),
            ...[
              [ "Immediate", "Days 1–30", "[AGENT: Highest priority 30-day action — typically a data inventory, executive alignment session, or integration scoping exercise]", "[Role/Team]" ],
              [ "Immediate", "Days 1–30", "[AGENT: Second 30-day action]", "[Role/Team]" ],
              [ "Immediate", "Days 1–30", "[AGENT: Third 30-day action]", "[Role/Team]" ],
              [ "Foundation", "Days 31–90", "[AGENT: First foundational build action — infrastructure, data pipeline, or organisational enablement]", "[Role/Team]" ],
              [ "Foundation", "Days 31–90", "[AGENT: Second foundational build action]", "[Role/Team]" ],
              [ "Foundation", "Days 31–90", "[AGENT: Third foundational build action]", "[Role/Team]" ],
              [ "Deployment", "Days 91–180", "[AGENT: First AI use case deployment action]", "[Role/Team]" ],
              [ "Deployment", "Days 91–180", "[AGENT: Second AI use case deployment action]", "[Role/Team]" ],
              [ "Deployment", "Days 91–180", "[AGENT: Ongoing monitoring and iteration framework]", "[Role/Team]" ],
            ].map( ( [ horizon, time, action, owner ], i ) =>
            {
              const fill = horizon === "Immediate" ? C.lightRed : horizon === "Foundation" ? C.lightAmber : C.lightGreen;
              const hFill = i % 2 === 0 ? fill : C.white;
              return new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( hFill ), width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( horizon, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( hFill ), width: { size: 1400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( time, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( hFill ), width: { size: 4360, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( action, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( hFill ), width: { size: 1800, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [ para( [ txt( owner, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } );
            } ),
          ],
        } ),

        spacer( 240 ),

        // ── SECTION 7: RISKS & ASSUMPTIONS ────────────────────────────────────
        heading1( "7. Risks, Assumptions & Constraints" ),

        heading2( "7.1  Key Assumptions" ),
        para( "[AGENT: List 3–5 assumptions made during this assessment. For example, assumptions about data availability, organisational stability, budget authority, or stakeholder access.]", { after: 80 } ),
        ...[ 1, 2, 3 ].map( n => bullet( `[ASSUMPTION ${ n }: State the assumption clearly and note its impact on recommendations if it proves incorrect.]` ) ),

        spacer( 120 ),
        heading2( "7.2  Key Risks" ),

        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 3200, 1200, 1200, 3760 ],
          rows: [
            new TableRow( {
              children: [
                ...[ [ "Risk", 3200 ], [ "Likelihood", 1200 ], [ "Impact", 1200 ], [ "Mitigation", 3760 ] ].map( ( [ h, w ] ) =>
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: w, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( h, { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } )
                ),
              ],
            } ),
            ...[
              [ "[Risk 1: e.g. Data governance delays stall pipeline build]", "High", "High", "[Mitigation action]" ],
              [ "[Risk 2: e.g. Lack of executive sponsor reduces adoption]", "Medium", "High", "[Mitigation action]" ],
              [ "[Risk 3: e.g. Budget constraints limit vendor options]", "Medium", "Medium", "[Mitigation action]" ],
              [ "[Risk 4: e.g. Technical talent gaps extend delivery timeline]", "Low", "High", "[Mitigation action]" ],
            ].map( ( [ risk, lik, imp, mit ], i ) =>
              new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 3200, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( risk, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1200, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( lik, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 1200, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( imp, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 3760, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [ para( [ txt( mit, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } )
            ),
          ],
        } ),

        spacer( 200 ),
        heading2( "7.3  Constraints Noted" ),
        para( "[AGENT: Note any constraints that limited the depth of this assessment — e.g. single-session discovery, limited stakeholder access, no access to live systems. These constrain the reliability of specific recommendations.]", { after: 160 } ),

        // ── SECTION 8: NEXT STEPS ──────────────────────────────────────────────
        new Paragraph( { children: [ new PageBreak() ], spacing: { before: 0, after: 0 } } ),
        heading1( "8. Immediate Next Steps" ),

        para( "The following actions should be initiated within 30 days of receiving this report:", { after: 120 } ),

        ...[
          [ "Priority 1 Action (Days 1–7)", "[AGENT: Most urgent action. Should resolve the highest-severity blocker or unlock a critical dependency. Name who is accountable and what the deliverable looks like.]" ],
          [ "Priority 2 Action (Days 8–14)", "[AGENT: Second action. Should run in parallel or immediately after Priority 1. Specify the owner and expected output.]" ],
          [ "Priority 3 Action (Days 15–30)", "[AGENT: Third action. This may be a scoping or planning exercise that sets up the foundational build phase.]" ],
          [ "Governance checkpoint (Day 30)", "[AGENT: Recommend a specific governance touchpoint — who reviews progress, what criteria are used to proceed to the foundational build phase, and who convenes the meeting.]" ],
        ].flatMap( ( [ label, detail ] ) => [
          heading3( label ),
          para( [ txt( detail, { size: 20 } ) ], { before: 0, after: 120 } ),
        ] ),

        // ── SECTION 9: APPENDIX ────────────────────────────────────────────────
        heading1( "9. Appendix" ),

        heading2( "9.1  Assessment Methodology" ),
        para( "This advisory is produced using a structured seven-dimension scoring framework administered by DQ TMaaS Agent A. Each dimension is assessed via discovery session questions, scored 1 (Partial) or 2 (Strong), and aggregated to a composite score out of 14. Scores are mapped to five readiness tiers: Not Ready (0–4), Foundation Needed (5–8), Developing (9–11), Ready (12–13), and Advanced (14). Recommendations are calibrated to the organisation's tier and sector context.", { after: 120 } ),

        heading2( "9.2  Dimension Definitions" ),

        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ 2400, 6960 ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 2400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( "Dimension", { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                new TableCell( { borders: cellBorder( C.border ), shading: shading( C.navy ), width: { size: 6960, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( "What It Measures", { bold: true, color: C.white, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
              ],
            } ),
            ...( [
              [ "Systems Integration", "The degree to which core business systems are connected, API-accessible, and capable of feeding or consuming AI outputs reliably." ],
              [ "Data Accessibility", "Whether the data required to train, validate, and run AI models is available, accessible, and in a format suitable for machine processing." ],
              [ "Data Quality History", "The organisation's track record of maintaining clean, consistent, and well-governed data — a leading indicator of AI model reliability." ],
              [ "Use Case Specificity", "The clarity with which the organisation can define the business problem AI should solve, the success metrics, and the operational context." ],
              [ "Implementation Capability", "The internal or contracted technical, project, and change management capability to build, deploy, and iterate on AI systems." ],
              [ "Adoption Conditions", "The organisational culture, user readiness, and change management infrastructure required for AI solutions to be used in practice." ],
              [ "Leadership Sponsorship", "The presence of executive sponsors who understand AI, can allocate resources, resolve blockers, and signal organisational commitment." ],
            ].map( ( [ dim, def ], i ) =>
              new TableRow( {
                children: [
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 2400, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( dim, { bold: true, size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                  new TableCell( { borders: cellBorder( C.border ), shading: shading( i % 2 === 0 ? C.lightGray : C.white ), width: { size: 6960, type: WidthType.DXA }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [ para( [ txt( def, { size: 20 } ) ], { before: 0, after: 0 } ) ] } ),
                ],
              } )
            ) ),
          ],
        } ),

        spacer( 200 ),
        heading2( "9.3  Session Notes & Raw Evidence" ),
        para( "[AGENT: Insert a verbatim or near-verbatim record of the key answers, responses, and signals observed during the discovery session. Include direct quotes where available. This section provides the audit trail that supports the scores and recommendations above. Organise by dimension.]", { after: 160 } ),

        spacer( 200 ),
        // Confidentiality footer
        new Table( {
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnWidths: [ CONTENT_W ],
          rows: [
            new TableRow( {
              children: [
                new TableCell( {
                  borders: cellBorder( C.navy ),
                  shading: shading( C.navy ),
                  width: { size: CONTENT_W, type: WidthType.DXA },
                  margins: { top: 120, bottom: 120, left: 200, right: 200 },
                  children: [
                    new Paragraph( {
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 40 },
                      children: [ txt( "CONFIDENTIAL ADVISORY OUTPUT", { bold: true, color: C.white, size: 20 } ) ],
                    } ),
                    new Paragraph( {
                      alignment: AlignmentType.CENTER,
                      spacing: { before: 0, after: 0 },
                      children: [ txt( "Generated by DQ TMaaS Agent A · This document is indicative and does not constitute a formal engagement · © DQ Digital Transformation", { color: "AED6F1", size: 18, italic: true } ) ],
                    } ),
                  ],
                } ),
              ],
            } ),
          ],
        } ),
      ],
    },
  ],
} );

Packer.toBuffer( doc ).then( buffer =>
{
  fs.writeFileSync( "/mnt/user-data/outputs/AI_Readiness_Advisory_Template.docx", buffer );
  console.log( "Done" );
} );