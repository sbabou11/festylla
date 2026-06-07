/**
 * utils/xlsxBuilder.js — v2
 * Générateur XLSX natif OpenXML avec styles ET graphiques natifs Excel.
 * Graphiques : barres (BarChart) et camembert (PieChart) via drawingML.
 * Aucune dépendance externe sauf JSZip (chargé depuis CDN jsdelivr).
 */

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;')

const col26 = (n) => {
  let s = ''; n++
  while (n > 0) { const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26) }
  return s
}
const addr = (r, c) => `${col26(c)}${r+1}`

export const lighten = (hex, f) => {
  hex = hex.replace('#','')
  const r=Math.min(255,Math.floor(parseInt(hex.slice(0,2),16)+(255-parseInt(hex.slice(0,2),16))*f))
  const g=Math.min(255,Math.floor(parseInt(hex.slice(2,4),16)+(255-parseInt(hex.slice(2,4),16))*f))
  const b=Math.min(255,Math.floor(parseInt(hex.slice(4,6),16)+(255-parseInt(hex.slice(4,6),16))*f))
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')
}
export const darken = (hex, f) => {
  hex = hex.replace('#','')
  const r=Math.max(0,Math.floor(parseInt(hex.slice(0,2),16)*(1-f)))
  const g=Math.max(0,Math.floor(parseInt(hex.slice(2,4),16)*(1-f)))
  const b=Math.max(0,Math.floor(parseInt(hex.slice(4,6),16)*(1-f)))
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('')
}
const argb = (hex) => 'FF' + hex.replace('#','').toUpperCase().slice(0,6)

// EMU : 1cm = 360000 EMU, 1px ≈ 9144 EMU
const cm = (v) => Math.round(v * 360000)

// ══════════════════════════════════════════════════════════════════════════
// XlsxBuilder — Workbook principal
// ══════════════════════════════════════════════════════════════════════════
export class XlsxBuilder {
  constructor(brand = '#1a6b7a') {
    this.brand  = brand
    this.brandL = lighten(brand, 0.88)
    this.brandD = darken(brand, 0.18)
    this.sheets = []
    this._charts  = []   // { sheetIdx, chartXml, drawingXml, anchorCol, anchorRow, widthCm, heightCm }
    this._chartId = 0
    this.styleIndex = {
      header:0, subhead:1, th:2, td:3, td2:4, kpiLabel:5, kpiVal:6,
      pos:7, neg:8, total:9, numRight:10, center:11, amber:12, purple:13, green:14, red:15
    }
  }

  addSheet(name) {
    const s = new XlsxSheet(name, this)
    this.sheets.push(s)
    return s
  }

  // ── Graphique barres verticales — vraies références de cellules ──
  // sheetName : nom onglet source | catRef/valRef : ex "$B$14:$B$19"
  addBarChart(sheetIdx, title, sheetName, catRef, valRef, anchorCol, anchorRow, widthCm=14, heightCm=10) {
    this._chartId++
    const sn = sheetName.replace(/'/g, "''")
    const ser =
      `<c:ser><c:idx val="0"/><c:order val="0"/>` +
      `<c:spPr><a:solidFill><a:srgbClr val="${argb(this.brand).slice(2)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>` +
      `<c:cat><c:strRef><c:f>'${sn}'!${catRef}</c:f></c:strRef></c:cat>` +
      `<c:val><c:numRef><c:f>'${sn}'!${valRef}</c:f><c:numCache><c:formatCode>#,##0.00</c:formatCode></c:numCache></c:numRef></c:val>` +
      `</c:ser>`
    this._addChart(sheetIdx, this._chartId, this._barXml(title, ser, 'col'), anchorCol, anchorRow, widthCm, heightCm)
  }

  // ── Graphique camembert — vraies références de cellules ──
  addPieChart(sheetIdx, title, sheetName, catRef, valRef, count, anchorCol, anchorRow, widthCm=12, heightCm=10) {
    this._chartId++
    const sn = sheetName.replace(/'/g, "''")
    const palette = [this.brand,'#F59E0B','#10B981','#8B5CF6','#EF4444','#06B6D4','#F97316']
    const dPts = palette.slice(0, count).map((col,i) =>
      `<c:dPt><c:idx val="${i}"/><c:spPr><a:solidFill><a:srgbClr val="${argb(col).slice(2)}"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`
    ).join('')
    const ser =
      `<c:ser><c:idx val="0"/><c:order val="0"/>` +
      dPts +
      `<c:dLbls><c:numFmt formatCode="0%" sourceLinked="0"/><c:spPr><a:noFill/></c:spPr><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="1"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/></c:dLbls>` +
      `<c:cat><c:strRef><c:f>'${sn}'!${catRef}</c:f></c:strRef></c:cat>` +
      `<c:val><c:numRef><c:f>'${sn}'!${valRef}</c:f></c:numRef></c:val>` +
      `</c:ser>`
    const ns = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<c:chartSpace ${ns}>` +
        `<c:chart>` +
          `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
          `<c:plotArea><c:layout/><c:pieChart><c:varyColors val="1">${ser}</c:pieChart></c:plotArea>` +
          `<c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/>` +
        `</c:chart>` +
        `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>` +
      `</c:chartSpace>`
    this._addChart(sheetIdx, this._chartId, xml, anchorCol, anchorRow, widthCm, heightCm)
  }

  // ── Graphique barres horizontales — vraies références de cellules ──
  addBarHChart(sheetIdx, title, sheetName, catRef, valRef, anchorCol, anchorRow, widthCm=14, heightCm=10) {
    this._chartId++
    const sn = sheetName.replace(/'/g, "''")
    const ser =
      `<c:ser><c:idx val="0"/><c:order val="0"/>` +
      `<c:spPr><a:solidFill><a:srgbClr val="${argb(this.brand).slice(2)}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>` +
      `<c:cat><c:strRef><c:f>'${sn}'!${catRef}</c:f></c:strRef></c:cat>` +
      `<c:val><c:numRef><c:f>'${sn}'!${valRef}</c:f></c:numRef></c:val>` +
      `</c:ser>`
    this._addChart(sheetIdx, this._chartId, this._barXml(title, ser, 'bar'), anchorCol, anchorRow, widthCm, heightCm)
  }

  _barXml(title, serXml, dir) {
    const ns = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    const catPos = dir === 'bar' ? 'l' : 'b'
    const valPos = dir === 'bar' ? 'b' : 'l'
    const catOrient = dir === 'bar' ? 'maxMin' : 'minMax'
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<c:chartSpace ${ns}><c:chart>` +
        `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" b="1"/><a:t>${esc(title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
        `<c:plotArea><c:layout/>` +
          `<c:barChart><c:barDir val="${dir}"/><c:grouping val="clustered"/>` +
            serXml +
            `<c:gapWidth val="150"/><c:axId val="10"/><c:axId val="100"/>` +
          `</c:barChart>` +
          `<c:catAx><c:axId val="10"/><c:scaling><c:orientation val="${catOrient}"/></c:scaling><c:axPos val="${catPos}"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="100"/></c:catAx>` +
          `<c:valAx><c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="${valPos}"/><c:numFmt formatCode="#,##0.00" sourceLinked="0"/><c:majorGridlines/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:crossAx val="10"/></c:valAx>` +
        `</c:plotArea>` +
        `<c:legend><c:legendPos val="b"/></c:legend><c:plotVisOnly val="1"/>` +
      `</c:chart>` +
      `<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>` +
      `</c:chartSpace>`
  }

  _addChart(sheetIdx, id, chartXml, anchorCol, anchorRow, widthCm, heightCm) {
    // Drawing XML — positionne le graphique dans la feuille
    const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
          xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
          xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
  <xdr:oneCellAnchor>
    <xdr:from><xdr:col>${anchorCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${anchorRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:ext cx="${cm(widthCm)}" cy="${cm(heightCm)}"/>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="${id+1}" name="Chart ${id}"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="${cm(widthCm)}" cy="${cm(heightCm)}"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`

    this._charts.push({ sheetIdx, id, chartXml, drawingXml, anchorCol, anchorRow, widthCm, heightCm })
  }

  // ── Styles XML ────────────────────────────────────────────────────────────
  _stylesXml() {
    const b=argb(this.brand), bl=argb(this.brandL), bd=argb(this.brandD)
    const W='FFFFFFFF',GBG='FFF8F9FA',GRN='FFD1FAE5',REDD='FFFEE2E2',AMB='FFFEF3C7',PUR='FFEDE9FE'
    const BLK='FF0F172A',GRNF='FF065F46',REDF='FF991B1B',GRYM='FF64748B'
    const bdr=(c='FFE2E8F0')=>`<border><left style="thin"><color rgb="${c}"/></left><right style="thin"><color rgb="${c}"/></right><top style="thin"><color rgb="${c}"/></top><bottom style="thin"><color rgb="${c}"/></bottom></border>`
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="10">
    <font><sz val="11"/><name val="Arial"/></font>
    <font><b/><sz val="16"/><color rgb="${W}"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="${bd}"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="${W}"/><name val="Arial"/></font>
    <font><sz val="10"/><color rgb="${BLK}"/><name val="Arial"/></font>
    <font><b/><sz val="9"/><color rgb="${GRYM}"/><name val="Arial"/></font>
    <font><b/><sz val="20"/><color rgb="${bd}"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="${GRNF}"/><name val="Arial"/></font>
    <font><b/><sz val="10"/><color rgb="${REDF}"/><name val="Arial"/></font>
    <font><b/><sz val="11"/><color rgb="${W}"/><name val="Arial"/></font>
  </fonts>
  <fills count="12">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${b}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${bl}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${W}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${GBG}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${GRN}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${REDD}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${bd}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${AMB}"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="${PUR}"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/></border>
    ${bdr()}
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="16">
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="3" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="3" borderId="0" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="4" fontId="7" fillId="6" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="4" fontId="8" fillId="7" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="4" fontId="9" fillId="8" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="4" fontId="4" fillId="4" borderId="1" xfId="0"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="9" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="10" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="8" fillId="7" borderId="1" xfId="0"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
  }

  // ── Génération ZIP ────────────────────────────────────────────────────────
  _buildSharedStrings() {
    this._ssMap = {}; this._ssArr = []
    this.sheets.flatMap(s=>Object.values(s._cells))
      .filter(c=>c.t==='s')
      .forEach(c=>{ const v=String(c.v??''); if(!(v in this._ssMap)){this._ssMap[v]=this._ssArr.length;this._ssArr.push(v)} })
  }

  _sharedStringsXml() {
    this._buildSharedStrings()
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this._ssArr.length}" uniqueCount="${this._ssArr.length}">${this._ssArr.map(s=>`<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`
  }

  _contentTypes() {
    const sheets = this.sheets.map((_,i)=>
      `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('')
    const drawings = [...new Set(this._charts.map(c=>c.sheetIdx))].map(i=>
      `<Override PartName="/xl/drawings/drawing${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`
    ).join('')
    const charts = this._charts.map(c=>
      `<Override PartName="/xl/charts/chart${c.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
    ).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${sheets}${drawings}${charts}
  <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
</Types>`
  }

  _rels() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
  }

  _workbookXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${this.sheets.map((s,i)=>`<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>
</workbook>`
  }

  _workbookRels() {
    const sheets = this.sheets.map((_,i)=>
      `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`
    ).join('')
    const n = this.sheets.length
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets}
  <Relationship Id="rId${n+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
  <Relationship Id="rId${n+2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId${n+3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
</Relationships>`
  }

  _loadJSZip() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) { resolve(window.JSZip); return }
      const s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'
      s.onload = () => resolve(window.JSZip)
      s.onerror = reject
      document.head.appendChild(s)
    })
  }

  _themeXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">` +
      `<a:themeElements>` +
        `<a:clrScheme name="Office">` +
          `<a:dk1><a:sysClr lastClr="000000" val="windowText"/></a:dk1>` +
          `<a:lt1><a:sysClr lastClr="FFFFFF" val="window"/></a:lt1>` +
          `<a:dk2><a:srgbClr val="1F3864"/></a:dk2>` +
          `<a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>` +
          `<a:accent1><a:srgbClr val="${this.brand.replace('#','')}"/></a:accent1>` +
          `<a:accent2><a:srgbClr val="ED7D31"/></a:accent2>` +
          `<a:accent3><a:srgbClr val="A9D18E"/></a:accent3>` +
          `<a:accent4><a:srgbClr val="FFC000"/></a:accent4>` +
          `<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5>` +
          `<a:accent6><a:srgbClr val="70AD47"/></a:accent6>` +
          `<a:hlink><a:srgbClr val="0563C1"/></a:hlink>` +
          `<a:folHlink><a:srgbClr val="954F72"/></a:folHlink>` +
        `</a:clrScheme>` +
        `<a:fontScheme name="Office">` +
          `<a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>` +
          `<a:minorFont><a:latin typeface="Calibri"/></a:minorFont>` +
        `</a:fontScheme>` +
        `<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>` +
      `</a:themeElements>` +
      `</a:theme>`
  }

  async download(filename) {
    const JSZip = await this._loadJSZip()
    const zip   = new JSZip()

    zip.file('[Content_Types].xml', this._contentTypes())
    zip.file('_rels/.rels', this._rels())
    zip.file('xl/workbook.xml', this._workbookXml())
    zip.file('xl/styles.xml', this._stylesXml())
    zip.file('xl/sharedStrings.xml', this._sharedStringsXml())
    zip.file('xl/_rels/workbook.xml.rels', this._workbookRels())
    zip.file('xl/theme/theme1.xml', this._themeXml())

    // Feuilles
    this.sheets.forEach((s, i) => {
      const sheetCharts = this._charts.filter(c => c.sheetIdx === i)
      zip.file(`xl/worksheets/sheet${i+1}.xml`, s._toXml(this._ssMap, sheetCharts.length > 0, i+1))
      if (sheetCharts.length > 0) {
        const dwgXml = this._buildDrawingXml(sheetCharts)
        zip.file(`xl/drawings/drawing${i+1}.xml`, dwgXml)
        zip.file(`xl/drawings/_rels/drawing${i+1}.xml.rels`, this._buildDrawingRels(sheetCharts))
        // CRITIQUE : relation sheet → drawing (manquait)
        const sheetRel = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="/xl/drawings/drawing${i+1}.xml"/>` +
          `</Relationships>`
        zip.file(`xl/worksheets/_rels/sheet${i+1}.xml.rels`, sheetRel)
      }
    })

    // Graphiques
    this._charts.forEach(c => {
      zip.file(`xl/charts/chart${c.id}.xml`, c.chartXml)
    })

    const blob = await zip.generateAsync({ type:'blob', compression:'DEFLATE' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), { href:url, download:filename })
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  _buildDrawingXml(charts) {
    // Structure exacte validée par Excel — basée sur openpyxl
    const anchors = charts.map((ch, localIdx) => {
      const rid = `rId${localIdx+1}`
      return `<oneCellAnchor>` +
        `<from><col>${ch.anchorCol}</col><colOff>0</colOff><row>${ch.anchorRow}</row><rowOff>0</rowOff></from>` +
        `<ext cx="${cm(ch.widthCm)}" cy="${cm(ch.heightCm)}"/>` +
        `<graphicFrame>` +
          `<nvGraphicFramePr>` +
            `<cNvPr id="${localIdx+1}" name="Chart ${localIdx+1}"/>` +
            `<cNvGraphicFramePr/>` +
          `</nvGraphicFramePr>` +
          `<xfrm/>` +
          `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
            `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
              `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/>` +
            `</a:graphicData>` +
          `</a:graphic>` +
        `</graphicFrame>` +
        `<clientData/>` +
      `</oneCellAnchor>`
    }).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<wsDr xmlns="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing">` +
      anchors +
      `</wsDr>`
  }

  _buildDrawingRels(charts) {
    // rId indexé localement (rId1, rId2...) — Target relatif depuis xl/drawings/
    const rels = charts.map((ch, i) =>
      `<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="/xl/charts/chart${ch.id}.xml"/>`
    ).join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      rels +
      `</Relationships>`
  }
}

// ══════════════════════════════════════════════════════════════════════════
// XlsxSheet
// ══════════════════════════════════════════════════════════════════════════
export class XlsxSheet {
  constructor(name, wb) {
    this.name   = name
    this._wb    = wb
    this._cells = {}
    this._merges= []
    this._cols  = []
    this._rows  = {}
  }

  set(row, col, value, styleIdx=3, numFmt=null) {
    const a  = addr(row, col)
    const isN= typeof value === 'number'
    this._cells[a] = { a, r:row, c:col, v:value??'', t:isN?'n':'s', s:styleIdx, z:numFmt }
    return this
  }

  merge(r1,c1,r2,c2) { this._merges.push({r1,c1,r2,c2}); return this }
  colWidths(ws) { this._cols = ws; return this }
  rowHeight(row, h) { this._rows[row] = h; return this }

  _toXml(ssMap, hasDrawing=false, sheetNum=1) {
    const maxR = Math.max(...Object.values(this._cells).map(c=>c.r), 0)
    const maxC = Math.max(...Object.values(this._cells).map(c=>c.c), 0)
    const colsXml = this._cols.length
      ? `<cols>${this._cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : ''
    const rowsMap = {}
    Object.values(this._cells).forEach(c=>{ if(!rowsMap[c.r])rowsMap[c.r]=[]; rowsMap[c.r].push(c) })
    const rowsXml = Object.entries(rowsMap).sort(([a],[b])=>+a-+b).map(([ri,cells])=>{
      const h=this._rows[+ri], rowAttr=h?` ht="${h}" customHeight="1"`:''
      const cellsXml = cells.sort((a,b)=>a.c-b.c).map(cell=>{
        let val='',type=''
        if(cell.t==='n'&&typeof cell.v==='number'){val=`<v>${cell.v}</v>`;type=''}
        else{const str=String(cell.v??'');const idx=ssMap[str];if(idx!==undefined){val=`<v>${idx}</v>`;type=' t="s"'}else{val=`<is><t xml:space="preserve">${esc(str)}</t></is>`;type=' t="inlineStr"'}}
        return `<c r="${cell.a}"${type} s="${cell.s}">${val}</c>`
      }).join('')
      return `<row r="${+ri+1}"${rowAttr}>${cellsXml}</row>`
    }).join('')
    const mergesXml = this._merges.length
      ? `<mergeCells count="${this._merges.length}">${this._merges.map(m=>`<mergeCell ref="${addr(m.r1,m.c1)}:${addr(m.r2,m.c2)}"/>`).join('')}</mergeCells>`
      : ''
    const drawingXml = hasDrawing
      ? `<drawing r:id="rId1"/>`
      : ''
    const relsNs = hasDrawing ? ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` : ''
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"${relsNs}>
  <sheetView showGridLines="0" workbookViewId="0"/>
  ${colsXml}<sheetData>${rowsXml}</sheetData>${mergesXml}${drawingXml}
</worksheet>`
  }
}
