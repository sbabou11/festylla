"""
api/comptabilite-pdf.py — Vercel Serverless Python
Génère le rapport comptable PDF avec reportlab.
Style identique au /api/rapport-pdf (rapport événement).
POST /api/comptabilite-pdf — body JSON :
  {
    event: { nom, couleur },
    vue: 'tresorerie' | 'resultat',
    operations: [...],
    kpis: {...},
    parCategorie: [...],
  }
"""
import json, io, sys, traceback
from http.server import BaseHTTPRequestHandler
from datetime import datetime


def parse_body(req):
    length = int(req.headers.get('Content-Length', 0))
    return json.loads(req.rfile.read(length) or b'{}')


def euro_str(v):
    """Formate un montant en € (positif). v est en euros (pas en centimes)."""
    return f"{(v or 0):,.2f} EUR".replace(',', ' ')


def now_str():
    return datetime.now().strftime('%d/%m/%Y %H:%M')


def darken(h, f=0.15):
    h = h.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return f"#{int(r*(1-f)):02x}{int(g*(1-f)):02x}{int(b*(1-f)):02x}"


def lighten(h, f=0.85):
    h = h.lstrip('#')
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    r = min(255, int(r + (255 - r) * f))
    g = min(255, int(g + (255 - g) * f))
    b = min(255, int(b + (255 - b) * f))
    return f"#{r:02x}{g:02x}{b:02x}"


def generate_pdf(data):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor, white, black
    from reportlab.lib.units import mm

    W_pt, H_pt = A4
    ML, MR = 14 * mm, 14 * mm
    CW = W_pt - ML - MR

    brand_hex = data.get('event', {}).get('couleur', '#1a6b7a')
    BRAND = HexColor(brand_hex)
    BRANDD = HexColor(darken(brand_hex, 0.15))
    BRANDL = HexColor(lighten(brand_hex, 0.88))
    AMBER = HexColor('#ba7517')
    AMBERL = HexColor(lighten('#ba7517', 0.85))
    RED = HexColor('#a32d2d')
    REDL = HexColor(lighten('#a32d2d', 0.85))
    GREEN = HexColor('#065f46')
    GREENL = HexColor(lighten('#065f46', 0.85))
    MUTED = HexColor('#64748b')
    BG = HexColor('#f8f9fa')
    WHITE = white
    BLACK = black
    BORDER = HexColor('#e2e8f0')

    nom = data.get('event', {}).get('nom', 'Événement')
    app_version = data.get('appVersion', 'v1.0.0')  # version reçue du client
    vue = data.get('vue', 'tresorerie')
    ops = data.get('operations', [])
    kpis = data.get('kpis', {})
    par_cat = data.get('parCategorie', [])
    now = now_str()

    MODE_L = {
        'cash': 'Espèces', 'virement': 'Virement', 'cheque': 'Chèque',
        'compte': 'Compte', 'avantage': 'Avantage',
    }

    # ── KPIs ──────────────────────────────────────────────────────────
    recettes = kpis.get('recettes', 0)
    depenses = kpis.get('depenses', 0)
    solde = kpis.get('solde', 0)
    a_payer = kpis.get('aPayer', 0)
    soldes_restants = kpis.get('soldesRestants', 0)

    # Split par sens
    recettes_cat = [c for c in par_cat if c.get('sens') == 'recette']
    depenses_cat = [c for c in par_cat if c.get('sens') == 'depense']

    recettes_ops = sorted(
        [o for o in ops if o.get('sens') == 'recette'],
        key=lambda o: o.get('ts', 0), reverse=True,
    )
    depenses_ops = sorted(
        [o for o in ops if o.get('sens') == 'depense'],
        key=lambda o: o.get('ts', 0), reverse=True,
    )

    # ── Canvas init ──────────────────────────────────────────────────
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    page_num = [1]

    def header_footer():
        # Bandeau haut
        c.setFillColor(BRAND)
        c.rect(0, H_pt - 11 * mm, W_pt, 11 * mm, fill=1, stroke=0)
        c.setFillColor(HexColor(darken(brand_hex, 0.05)))
        c.rect(0, H_pt - 12.5 * mm, W_pt, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 6.5)
        c.drawString(ML, H_pt - 7 * mm, f'YllaCash — {nom}')
        c.setFont('Helvetica', 6.5)
        vue_label = 'Trésorerie' if vue == 'tresorerie' else 'Résultat analytique'
        c.drawRightString(W_pt - MR, H_pt - 7 * mm,
                          f'Comptabilité ({vue_label}) — Page {page_num[0]} — {now}')
        # Footer
        c.setFillColor(BG)
        c.rect(0, 0, W_pt, 9 * mm, fill=1, stroke=0)
        c.setFillColor(MUTED)
        c.setFont('Helvetica', 5.5)
        c.drawString(ML, 3 * mm, f'YllaCash {app_version} · Développée par Maison Ylla')
        c.drawCentredString(W_pt / 2, 3 * mm, 'Document confidentiel — Réservé aux administrateurs')
        c.setFont('Helvetica-Oblique', 5)
        c.drawRightString(W_pt - MR, 3 * mm, 'Comptabilité complète exportée')

    def new_page():
        c.showPage()
        page_num[0] += 1
        header_footer()
        return H_pt - 22 * mm  # y de départ après header

    def section_title(title, y, color=None, icon=''):
        col = color or BRAND
        c.setFillColor(col)
        c.roundRect(ML, y, CW, 8 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(WHITE)
        c.setFont('Helvetica-Bold', 9)
        c.drawString(ML + 6 * mm, y + 3 * mm, f'{icon}  {title}' if icon else title)
        return y - 12 * mm

    def kpi_card(label, value, x, y, w, h=18 * mm, color=None):
        col = color or BRAND
        c.setFillColor(BRANDL)
        c.roundRect(x, y, w, h, 2 * mm, fill=1, stroke=0)
        c.setFillColor(col)
        c.roundRect(x, y, 3 * mm, h, 2 * mm, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6)
        c.setFillColor(MUTED)
        c.drawString(x + 5 * mm, y + h - 5 * mm, label.upper())
        c.setFont('Helvetica-Bold', 10)
        c.setFillColor(col)
        c.drawString(x + 5 * mm, y + 4 * mm, value)

    def table_row(row_data, y, col_widths, alt=False, header=False, color=None,
                  amount_idx=None, amount_color=None):
        row_h = 7 * mm
        if header:
            bg = color or BRAND
        else:
            bg = BG if alt else WHITE
        c.setFillColor(bg)
        c.rect(ML, y, CW, row_h, fill=1, stroke=0)
        c.setFillColor(BORDER)
        c.setLineWidth(0.2)
        c.line(ML, y, ML + CW, y)
        c.line(ML, y + row_h, ML + CW, y + row_h)
        x = ML
        for i, (text, w) in enumerate(zip(row_data, col_widths)):
            if header:
                c.setFillColor(WHITE)
                c.setFont('Helvetica-Bold', 7)
            elif amount_idx is not None and i == amount_idx and amount_color is not None:
                c.setFillColor(amount_color)
                c.setFont('Helvetica-Bold', 7)
            else:
                c.setFillColor(BLACK)
                c.setFont('Helvetica', 7)
            txt = str(text or '')[:int(w / mm * 1.6)]
            c.drawString(x + 2 * mm, y + 2 * mm, txt)
            x += w
        return y - row_h

    # ── PAGE 1 : Couverture + KPI + Compte de résultat ────────────────
    header_footer()
    y = H_pt - 22 * mm

    # Titre principal
    c.setFillColor(BRAND)
    c.roundRect(ML, y - 18 * mm, CW, 18 * mm, 2 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 16)
    c.drawString(ML + 8 * mm, y - 8 * mm, 'Rapport comptable')
    c.setFont('Helvetica', 10)
    c.drawString(ML + 8 * mm, y - 14 * mm, f'{nom} — Vue {"Trésorerie" if vue == "tresorerie" else "Résultat analytique"}')
    y -= 24 * mm

    # KPI cards (4 cards sur 1 ligne)
    card_w = (CW - 9 * mm) / 4
    kpi_card('Recettes',  euro_str(recettes),  ML + 0 * (card_w + 3 * mm), y - 18 * mm, card_w, color=GREEN)
    kpi_card('Dépenses',  euro_str(depenses),  ML + 1 * (card_w + 3 * mm), y - 18 * mm, card_w, color=RED)
    kpi_card('Solde net', euro_str(solde),     ML + 2 * (card_w + 3 * mm), y - 18 * mm, card_w,
             color=GREEN if solde >= 0 else RED)
    kpi_card(
        'À payer' if vue == 'tresorerie' else 'Soldes spec.',
        euro_str(a_payer if vue == 'tresorerie' else soldes_restants),
        ML + 3 * (card_w + 3 * mm), y - 18 * mm, card_w, color=AMBER,
    )
    y -= 26 * mm

    # Compte de résultat simplifié
    y = section_title('Compte de résultat simplifié', y, icon='📋')

    # Header tableau
    cw_cat = [22 * mm, 90 * mm, 35 * mm, 35 * mm]
    y = table_row(['Sens', 'Catégorie', 'Total', 'Nb opérations'], y, cw_cat, header=True)

    # Recettes
    alt = False
    for cat in recettes_cat:
        y = table_row(
            ['↑ Recette', cat.get('categorie', ''), euro_str(cat.get('total', 0)), str(cat.get('count', 0))],
            y, cw_cat, alt=alt, amount_idx=2, amount_color=GREEN,
        )
        alt = not alt

    # Total recettes
    y = table_row(
        ['', '∑ Total recettes', euro_str(recettes), str(sum(c.get('count', 0) for c in recettes_cat))],
        y, cw_cat, color=BRANDD, header=True,
    )
    y -= 3 * mm

    # Dépenses
    alt = False
    for cat in depenses_cat:
        y = table_row(
            ['↓ Dépense', cat.get('categorie', ''), euro_str(cat.get('total', 0)), str(cat.get('count', 0))],
            y, cw_cat, alt=alt, amount_idx=2, amount_color=RED,
        )
        alt = not alt

    # Total dépenses
    y = table_row(
        ['', '∑ Total dépenses', euro_str(depenses), str(sum(c.get('count', 0) for c in depenses_cat))],
        y, cw_cat, color=BRANDD, header=True,
    )
    y -= 4 * mm

    # Résultat net
    c.setFillColor(BRAND if solde >= 0 else RED)
    c.roundRect(ML, y - 10 * mm, CW, 10 * mm, 2 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 12)
    c.drawString(ML + 8 * mm, y - 7 * mm, '= RÉSULTAT NET')
    c.drawRightString(ML + CW - 8 * mm, y - 7 * mm, euro_str(solde))
    y -= 14 * mm

    # Note explicative
    note = (
        'Vue Trésorerie : flux réels d\'argent en caisse. Les cachets non payés et soldes spectateurs ne sont pas dans le résultat.'
        if vue == 'tresorerie' else
        'Vue Résultat : activité analytique. Inclut tous les engagements (cachets prévus). Les soldes spectateurs représentent une dette.'
    )
    c.setFillColor(BG)
    c.roundRect(ML, y - 14 * mm, CW, 14 * mm, 1.5 * mm, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont('Helvetica-Oblique', 8)
    # Wrap simple : on découpe à ~110 caractères
    chunks = []
    cur = ''
    for word in note.split(' '):
        if len(cur) + len(word) + 1 > 100:
            chunks.append(cur)
            cur = word
        else:
            cur = (cur + ' ' + word).strip()
    if cur:
        chunks.append(cur)
    yy = y - 5 * mm
    for chunk in chunks[:2]:
        c.drawString(ML + 4 * mm, yy, chunk)
        yy -= 4 * mm
    y -= 18 * mm

    # ── PAGE 2 : Détail des recettes ──────────────────────────────────
    if recettes_ops:
        y = new_page()
        y = section_title(f'Recettes — {len(recettes_ops)} opérations', y, color=GREEN, icon='💰')

        # Colonnes adaptées au A4 portrait
        cw_rec = [22 * mm, 35 * mm, 65 * mm, 25 * mm, 35 * mm]
        y = table_row(['Date', 'Catégorie', 'Description', 'Mode', 'Montant'], y, cw_rec,
                      header=True, color=GREEN)
        alt = False
        for o in recettes_ops:
            if y < 20 * mm:
                y = new_page()
                y = table_row(['Date', 'Catégorie', 'Description', 'Mode', 'Montant'], y, cw_rec,
                              header=True, color=GREEN)
                alt = False
            try:
                d = datetime.fromtimestamp(o.get('ts', 0) / 1000) if o.get('ts') else None
                ds = d.strftime('%d/%m/%Y') if d else '—'
            except Exception:
                ds = '—'
            y = table_row([
                ds,
                o.get('categorie', '—'),
                o.get('description', '—'),
                MODE_L.get(o.get('mode', ''), o.get('mode', '—')),
                euro_str(o.get('montant', 0)),
            ], y, cw_rec, alt=alt, amount_idx=4, amount_color=GREEN)
            alt = not alt

        # Total
        y = table_row(['', '', '', 'TOTAL', euro_str(recettes)], y, cw_rec,
                      header=True, color=BRANDD)

    # ── PAGE 3 : Détail des dépenses ──────────────────────────────────
    if depenses_ops:
        y = new_page()
        y = section_title(f'Dépenses — {len(depenses_ops)} opérations', y, color=RED, icon='🛒')

        cw_dep = [22 * mm, 35 * mm, 55 * mm, 22 * mm, 23 * mm, 25 * mm]
        y = table_row(['Date', 'Catégorie', 'Description', 'Mode', 'Statut', 'Montant'], y, cw_dep,
                      header=True, color=RED)
        alt = False
        for o in depenses_ops:
            if y < 20 * mm:
                y = new_page()
                y = table_row(['Date', 'Catégorie', 'Description', 'Mode', 'Statut', 'Montant'], y, cw_dep,
                              header=True, color=RED)
                alt = False
            try:
                d = datetime.fromtimestamp(o.get('ts', 0) / 1000) if o.get('ts') else None
                ds = d.strftime('%d/%m/%Y') if d else '—'
            except Exception:
                ds = '—'
            statut_label = ('Payé' if o.get('statut') == 'paye'
                            else 'À payer' if o.get('statut') == 'planifie'
                            else 'Annulé' if o.get('statut') == 'annule' else '—')
            y = table_row([
                ds,
                o.get('categorie', '—'),
                o.get('description', '—'),
                MODE_L.get(o.get('mode', ''), o.get('mode', '—')),
                statut_label,
                euro_str(o.get('montant', 0)),
            ], y, cw_dep, alt=alt, amount_idx=5, amount_color=RED)
            alt = not alt

        # Total
        y = table_row(['', '', '', '', 'TOTAL', euro_str(depenses)], y, cw_dep,
                      header=True, color=BRANDD)

    c.save()
    return buf.getvalue()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            data = parse_body(self)
            pdf_bytes = generate_pdf(data)
            nom = data.get('event', {}).get('nom', 'Comptabilite')
            dt = datetime.now().strftime('%d_%m_%Y')
            filename = f'{nom} - Comptabilite - {dt}.pdf'

            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f'PDF error: {e}\n{traceback.format_exc()}'.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
