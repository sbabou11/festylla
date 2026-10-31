"""
api/rapport-pdf.py — Vercel Serverless Python
Génère le Rapport de clôture PDF avec reportlab (testé et validé localement)
POST /api/rapport-pdf — body JSON
"""
import json, io, sys, traceback
from http.server import BaseHTTPRequestHandler
from datetime import datetime

def parse_body(req):
    length = int(req.headers.get('Content-Length', 0))
    return json.loads(req.rfile.read(length) or b'{}')

def euro(c):
    return f"{(c or 0)/100:,.2f} EUR".replace(',', ' ')

def now_str():
    return datetime.now().strftime('%d/%m/%Y %H:%M')

def hex_to_color(h):
    from reportlab.lib.colors import HexColor
    return HexColor(h.replace('#','') if not h.startswith('#') else h)

def darken(h, f=0.15):
    h = h.lstrip('#')
    r,g,b = int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    return f"#{int(r*(1-f)):02x}{int(g*(1-f)):02x}{int(b*(1-f)):02x}"

def lighten(h, f=0.85):
    h = h.lstrip('#')
    r,g,b = int(h[0:2],16),int(h[2:4],16),int(h[4:6],16)
    r=min(255,int(r+(255-r)*f)); g=min(255,int(g+(255-g)*f)); b=min(255,int(b+(255-b)*f))
    return f"#{r:02x}{g:02x}{b:02x}"

def generate_pdf(data):
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor, white, black, Color
    from reportlab.lib.units import mm
    from reportlab.graphics.shapes import Drawing
    from reportlab.graphics.charts.barcharts import VerticalBarChart, HorizontalBarChart
    from reportlab.graphics.charts.piecharts import Pie
    from reportlab.graphics import renderPDF

    W_pt, H_pt = A4
    ML, MR = 14*mm, 14*mm
    CW = W_pt - ML - MR

    brand_hex  = data.get('event',{}).get('couleur','#1a6b7a')
    BRAND      = HexColor(brand_hex)
    BRANDD     = HexColor(darken(brand_hex, 0.15))
    BRANDL     = HexColor(lighten(brand_hex, 0.88))
    AMBER      = HexColor('#ba7517')
    AMBERL     = HexColor(lighten('#ba7517', 0.85))
    RED        = HexColor('#a32d2d')
    REDL       = HexColor(lighten('#a32d2d', 0.85))
    GREEN      = HexColor('#065f46')
    GREENL     = HexColor(lighten('#065f46', 0.85))
    PURPLE     = HexColor('#534ab7')
    PURPL      = HexColor(lighten('#534ab7', 0.85))
    MUTED      = HexColor('#64748b')
    BG         = HexColor('#f8f9fa')
    WHITE      = white
    BLACK      = black
    BORDER     = HexColor('#e2e8f0')

    nom        = data.get('event',{}).get('nom','Événement')
    txs        = data.get('transactions', [])
    specs      = data.get('spectateurs', [])
    resas      = data.get('reservations', [])
    menu_lst   = data.get('menu', [])
    audit_lst  = data.get('audit', [])
    staff_lst  = data.get('staff', [])
    now        = now_str()

    TX_LABELS = {
        'credit':'Crédit','debit':'Encaissement','retrait':'Retrait résa',
        'benev-retrait':'Retrait bénévole','reservation':'Réservation',
        'annulation':'Annulation','benev-reservation':'Résa bénévole',
        'benev-annulation':'Annul. bénévole',
    }
    STATUS_L = {'pending':'En revue','processing':'En prépa.','ready':'Prête',
                'collected':'Retirée','cancelled':'Annulée'}

    # ── KPIs ─────────────────────────────────────────────────────────
    total_credits = sum(t.get('montant',0) for t in txs if t.get('type')=='credit')
    total_ventes  = sum(t.get('montant',0) for t in txs if t.get('type') in ('debit','retrait','benev-retrait'))
    total_soldes  = sum(s.get('solde',0) for s in specs)
    benev_r       = [r for r in resas if r.get('isBenev') and r.get('status')=='collected']
    cout_benev    = sum(sum((i.get('prix',0)*i.get('qty',1)) for i in r.get('items',[])) for r in benev_r)
    ca_nette      = total_ventes - cout_benev
    ecart         = total_credits - total_ventes - total_soldes
    resas_spec    = [r for r in resas if not r.get('isBenev')]
    collected_n   = len([r for r in resas_spec if r.get('status')=='collected'])
    taux          = round(collected_n/len(resas_spec)*100) if resas_spec else 0
    nb_spec       = len(specs)
    spec_solde    = [s for s in specs if (s.get('solde',0) or 0) > 0]

    # Articles
    art_map = {}
    for t in txs:
        for i in t.get('items',[]):
            k = i.get('nom','')
            if k not in art_map: art_map[k] = {'nom':k,'qty':0,'ca':0}
            art_map[k]['qty'] += i.get('qty',1)
            art_map[k]['ca']  += i.get('total',(i.get('prixUnit',0)*i.get('qty',1)))
    top_articles = sorted(art_map.values(), key=lambda a: a['ca'], reverse=True)[:10]

    # Staff stats
    staff_map = {}
    for t in txs:
        k = t.get('staff') or '—'
        if k not in staff_map: staff_map[k] = {'email':k,'nb':0,'vol':0}
        staff_map[k]['nb']  += 1
        staff_map[k]['vol'] += t.get('montant',0)
    staff_stats = sorted(staff_map.values(), key=lambda s: s['nb'], reverse=True)[:8]

    TX_TYPES = ['credit','debit','retrait','benev-retrait','reservation','annulation']
    tx_by_type = []
    for typ in TX_TYPES:
        txk = [t for t in txs if t.get('type')==typ]
        if txk:
            tx_by_type.append({'type':typ,'label':TX_LABELS.get(typ,typ),
                               'nb':len(txk),'vol':sum(t.get('montant',0) for t in txk)})

    # ── Helpers dessin ────────────────────────────────────────────────
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    TOTAL_PAGES = 10

    def header_footer(page):
        c.setFillColor(BRAND)
        c.rect(0, H_pt-11*mm, W_pt, 11*mm, fill=1, stroke=0)
        c.setFillColor(HexColor(darken(brand_hex, 0.05)))
        c.rect(0, H_pt-12.5*mm, W_pt, 1.5*mm, fill=1, stroke=0)
        c.setFillColor(WHITE); c.setFont('Helvetica-Bold', 6.5)
        c.drawString(ML, H_pt-7*mm, f'YllaCash — {nom}')
        c.setFont('Helvetica', 6.5)
        c.drawRightString(W_pt-MR, H_pt-7*mm, f'Rapport de clôture — Page {page}/{TOTAL_PAGES} — {now}')
        # Footer bas de page
        c.setFillColor(BG); c.rect(0, 0, W_pt, 9*mm, fill=1, stroke=0)
        c.setFillColor(MUTED); c.setFont('Helvetica', 5.5)
        c.drawString(ML, 3*mm, 'YllaCash v1.0  ·  Développée par Maison Ylla')
        c.drawCentredString(W_pt/2, 3*mm, 'Document confidentiel — Réservé aux administrateurs')
        c.setFont('Helvetica-Oblique', 5)
        c.drawRightString(W_pt-MR, 3*mm, 'Toute la gestion financière de votre événement en un seul endroit')

    def section_title(title, y, color=None, icon=''):
        # y = coordonnée BASSE disponible, le titre est dessiné AU-DESSUS
        col = color or BRAND
        c.setFillColor(col)
        c.roundRect(ML, y, CW, 8*mm, 1.5*mm, fill=1, stroke=0)
        c.setFillColor(WHITE); c.setFont('Helvetica-Bold', 9)
        c.drawString(ML+6*mm, y+3*mm, f'{icon}  {title}' if icon else title)
        return y - 30*mm  # 8mm titre + 22mm marge (total 30mm sous le bas du titre)

    def kpi_card(label, value, x, y, w, h=18*mm, color=None):
        col = color or BRAND
        c.setFillColor(BRANDL); c.roundRect(x, y, w, h, 2*mm, fill=1, stroke=0)
        c.setFillColor(col); c.roundRect(x, y, 3*mm, h, 2*mm, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 6); c.setFillColor(MUTED)
        c.drawString(x+5*mm, y+h-5*mm, label.upper())
        c.setFont('Helvetica-Bold', 10); c.setFillColor(col)
        c.drawString(x+5*mm, y+4*mm, value)

    def table_row(row_data, y, col_widths, alt=False, header=False, color=None):
        row_h = 7*mm
        bg = (color or (BG if alt else WHITE)) if not header else (BRAND if not color else color)
        # y = coordonnée BASSE, ligne dessinée AU-DESSUS
        c.setFillColor(bg); c.rect(ML, y, CW, row_h, fill=1, stroke=0)
        c.setFillColor(BORDER); c.setLineWidth(0.2)
        c.line(ML, y, ML+CW, y)
        c.line(ML, y+row_h, ML+CW, y+row_h)
        x = ML
        for text, w in zip(row_data, col_widths):
            c.setFillColor(WHITE if header else BLACK)
            c.setFont('Helvetica-Bold' if header else 'Helvetica', 7)
            txt = str(text or '')[:int(w/mm*1.6)]
            c.drawString(x+2*mm, y+2*mm, txt)
            x += w
        return y - row_h

    def bar_chart_inline(data_vals, labels, x, y, w, h, color=None):
        if not data_vals or max(data_vals) == 0: return
        col = color or BRAND
        d = Drawing(w, h)
        bc = VerticalBarChart()
        bc.x = 5*mm; bc.y = 8*mm
        bc.width = w - 10*mm; bc.height = h - 15*mm
        bc.data = [data_vals]
        bc.categoryAxis.categoryNames = [str(l)[:8] for l in labels]
        bc.categoryAxis.labels.fontSize = 5
        bc.categoryAxis.labels.angle = 30
        bc.valueAxis.labels.fontSize = 5
        bc.valueAxis.labelTextFormat = lambda v: f'{v/100:.0f}' if v >= 100 else str(int(v))
        bc.bars[0].fillColor = col
        bc.bars[0].strokeColor = None
        d.add(bc)
        renderPDF.draw(d, c, x, y)

    def pie_chart_inline(data_vals, labels, x, y, size, colors=None):
        if not data_vals or sum(data_vals) == 0: return
        d = Drawing(size, size)
        pie = Pie()
        pie.x = size*0.1; pie.y = size*0.1
        pie.width = size*0.8; pie.height = size*0.8
        pie.data = data_vals
        pie.labels = [str(l)[:10] for l in labels]
        pie.sideLabels = True
        pie.sideLabelsOffset = 0.1
        default_colors = [BRAND, AMBER, GREEN, PURPLE, RED, HexColor('#06b6d4'), HexColor('#f97316')]
        cols = colors or default_colors
        for i in range(len(data_vals)):
            pie.slices[i].fillColor = cols[i % len(cols)]
            pie.slices[i].strokeColor = WHITE
            pie.slices[i].strokeWidth = 0.5
        pie.slices.labelRadius = 1.2
        pie.slices.fontSize = 5
        d.add(pie)
        renderPDF.draw(d, c, x, y)

    START_Y = H_pt - 39*mm  # 20mm sous header (11mm) + 8mm titre = 31mm depuis haut

    # ════════════════════════════════════════════════════════════════
    # PAGE 1 — COUVERTURE
    # ════════════════════════════════════════════════════════════════
    c.setFillColor(BRAND)
    c.rect(0, H_pt - H_pt*0.62, W_pt, H_pt*0.62, fill=1, stroke=0)
    c.setFillColor(HexColor(darken(brand_hex, 0.12)))
    c.rect(0, H_pt - H_pt*0.62, W_pt, 2*mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont('Helvetica-Bold', 38); c.drawString(ML, H_pt*0.75, 'RAPPORT')
    c.setFont('Helvetica-Bold', 38); c.drawString(ML, H_pt*0.64, 'DE CLÔTURE')
    c.setFont('Helvetica', 16); c.setFillColor(HexColor(lighten(brand_hex, 0.6)))
    c.drawString(ML, H_pt*0.54, nom)
    # Généré + confidentiel dans la zone brand
    c.setFont('Helvetica', 9); c.setFillColor(HexColor(lighten(brand_hex, 0.45)))
    c.drawString(ML, H_pt*0.49, f'Généré le {now}')
    c.drawString(ML, H_pt*0.46, 'Document confidentiel — Réservé aux administrateurs')
    c.setFont('Helvetica-Bold', 8); c.setFillColor(HexColor(lighten(brand_hex, 0.35)))
    c.drawString(ML, H_pt*0.42, 'YllaCash v1.0  ·  Développée par Maison Ylla')
    kpis_cov = [
        ('CA Total ventes', euro(total_ventes), BRAND),
        ('Total rechargé',  euro(total_credits), GREEN),
        ('Soldes restants', euro(total_soldes), AMBER),
        ('CA Net',          euro(ca_nette), GREEN if ca_nette>=0 else RED),
    ]
    kW_cov = CW/4 - 3*mm
    kH_cov = 18*mm
    zone_brand_y = H_pt - H_pt*0.62
    y_r1 = zone_brand_y - 8*mm - kH_cov
    y_r2 = y_r1 - 4*mm - kH_cov
    for i,(lbl,val,col) in enumerate(kpis_cov):
        kpi_card(lbl, val, ML+i*(kW_cov+3*mm), y_r1, kW_cov, kH_cov, col)
    kpis_cov2 = [
        ('Spectateurs',   str(nb_spec), PURPLE),
        ('Transactions',  str(len(txs)), BRANDD),
        ('Réservations',  str(len(resas)), BRANDD),
        ('Coût bénévoles',euro(cout_benev), RED),
    ]
    for i,(lbl,val,col) in enumerate(kpis_cov2):
        kpi_card(lbl, val, ML+i*(kW_cov+3*mm), y_r2, kW_cov, kH_cov, col)
    # Footer couverture
    c.setFillColor(BG); c.rect(0, 0, W_pt, 9*mm, fill=1, stroke=0)
    c.setFillColor(MUTED); c.setFont('Helvetica', 5.5)
    c.drawString(ML, 3*mm, 'YllaCash v1.0  ·  Développée par Maison Ylla')
    c.drawCentredString(W_pt/2, 3*mm, 'Document confidentiel — Réservé aux administrateurs')
    c.setFont('Helvetica-Oblique', 5)
    c.drawRightString(W_pt-MR, 3*mm, 'Toute la gestion financière de votre événement en un seul endroit')
    header_footer(1)
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 2 — RÉCAPITULATIF FINANCIER
    # ════════════════════════════════════════════════════════════════
    header_footer(2)
    y = START_Y
    kpis2 = [
        ('CA Total ventes', euro(total_ventes), BRAND),
        ('Total rechargé',  euro(total_credits), GREEN),
        ('Soldes restants', euro(total_soldes), AMBER),
        ('Écart comptable', euro(ecart), GREEN if ecart==0 else RED),
        ('Coût bénévoles',  euro(cout_benev), RED),
        ('CA Net événement',euro(ca_nette), GREEN if ca_nette>=0 else RED),
    ]
    kW2 = CW/3 - 2*mm
    # KPIs dessinés EN PREMIER (derrière le titre)
    for i,(lbl,val,col) in enumerate(kpis2):
        kpi_card(lbl, val, ML+(i%3)*(kW2+3*mm), y-30*mm-(i//3)*22*mm, kW2, 18*mm, col)
    # Titre PAR-DESSUS (visible devant les KPIs)
    section_title('RÉCAPITULATIF FINANCIER & BILAN COMPTABLE', y, BRAND, '💰')
    y -= 74*mm  # 30mm marge_titre + 44mm KPIs (2×22mm)
    y = section_title('RÉPARTITION PAR TYPE DE TRANSACTION', y, BRANDD, '📊')
    cols_w = [50*mm, 30*mm, 50*mm, 40*mm]
    y = table_row(['Type','Nb transactions','Montant total','Moyenne'], y, cols_w, header=True)
    for i,t in enumerate(tx_by_type):
        nb = t['nb']; vol = t['vol']; avg = vol/nb if nb else 0
        y = table_row([t['label'], str(nb), euro(vol), euro(avg)], y, cols_w, alt=i%2==1)
        if y < 20*mm: break
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 3 — GRAPHIQUES
    # ════════════════════════════════════════════════════════════════
    header_footer(3)
    y = START_Y
    y = section_title('ANALYSE GRAPHIQUE DES TRANSACTIONS', y, BRAND, '📈')
    if tx_by_type:
        vals = [t['vol'] for t in tx_by_type]
        lbls = [t['label'][:8] for t in tx_by_type]
        bar_chart_inline(vals, lbls, ML, y-55*mm, CW*0.55, 55*mm, BRAND)
        pie_data = [t['nb'] for t in tx_by_type]
        pie_chart_inline(pie_data, lbls, ML+CW*0.57, y-55*mm, CW*0.43)
        y -= 60*mm
    y = section_title('INDICATEURS DE PERFORMANCE', y, BRANDD, '🎯')
    perf = [
        ('Taux retrait réservations', f'{taux}%'),
        ('Ticket moyen',              euro(total_ventes//len([t for t in txs if t.get('type')=='debit']) if [t for t in txs if t.get('type')=='debit'] else 0)),
        ('Solde moyen par spectateur',euro(total_soldes//nb_spec if nb_spec else 0)),
        ('Nb spectateurs avec solde', f'{len(spec_solde)} / {nb_spec}'),
    ]
    kW3 = CW/2 - 2*mm
    for i,(lbl,val) in enumerate(perf):
        kpi_card(lbl, val, ML+(i%2)*(kW3+4*mm), y-30*mm-(i//2)*22*mm, kW3, 18*mm)
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 4 — TOP ARTICLES
    # ════════════════════════════════════════════════════════════════
    header_footer(4)
    y = START_Y
    y = section_title('TOP ARTICLES VENDUS & PERFORMANCES DU MENU', y, AMBER, '🍽️')
    if top_articles:
        art_vals = [a['ca'] for a in top_articles[:8]]
        art_lbls = [a['nom'][:8] for a in top_articles[:8]]
        bar_chart_inline(art_vals, art_lbls, ML, y-55*mm, CW*0.55, 55*mm, AMBER)
        qty_vals = [a['qty'] for a in top_articles[:8]]
        bar_chart_inline(qty_vals, art_lbls, ML+CW*0.57, y-55*mm, CW*0.43, 55*mm, GREEN)
        y -= 60*mm
    cols_art = [10*mm, 50*mm, 25*mm, 25*mm, 35*mm, 25*mm]
    y = table_row(['#','Article','Unités','CA généré','% du CA','Stock'], y, cols_art, header=True, color=AMBER)
    for i,a in enumerate(top_articles):
        mi = next((m for m in menu_lst if m.get('nom')==a['nom']), {})
        pct = f"{a['ca']/total_ventes*100:.1f}%" if total_ventes else '—'
        y = table_row([f"#{i+1}", a['nom'][:18], str(a['qty']), euro(a['ca']), pct, str(mi.get('stock','—'))],
                      y, cols_art, alt=i%2==1)
        if y < 20*mm: break
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 5 — STATS STAFF
    # ════════════════════════════════════════════════════════════════
    header_footer(5)
    y = START_Y
    y = section_title('STATISTIQUES PAR STAND / STAFF', y, PURPLE, '👤')
    if staff_stats:
        s_vals = [s['nb'] for s in staff_stats]
        s_lbls = [s['email'][:8] for s in staff_stats]
        bar_chart_inline(s_vals, s_lbls, ML, y-50*mm, CW*0.55, 50*mm, PURPLE)
        pie_chart_inline([s['vol'] for s in staff_stats], s_lbls, ML+CW*0.57, y-50*mm, CW*0.43)
        y -= 55*mm
    cols_st = [50*mm, 25*mm, 40*mm, 30*mm, 30*mm]
    y = table_row(['Staff (email)','Nb tx','Volume','Crédits','Débits'], y, cols_st, header=True, color=PURPLE)
    for i,s in enumerate(staff_stats):
        cred = sum(1 for t in txs if t.get('staff')==s['email'] and t.get('type')=='credit')
        deb  = sum(1 for t in txs if t.get('staff')==s['email'] and t.get('type')=='debit')
        y = table_row([s['email'][:20], str(s['nb']), euro(s['vol']), str(cred), str(deb)],
                      y, cols_st, alt=i%2==1)
        if y < 20*mm: break
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 6 — TRANSACTIONS
    # ════════════════════════════════════════════════════════════════
    header_footer(6)
    y = START_Y
    y = section_title('TOUTES LES TRANSACTIONS — TRAÇABILITÉ COMPLÈTE', y, BRAND, '💳')
    cols_tx = [22*mm, 16*mm, 28*mm, 30*mm, 40*mm, 24*mm, 20*mm]
    y = table_row(['Date','Heure','Type','Bénéficiaire','Libellé','Montant','Staff'], y, cols_tx, header=True)
    sorted_txs = sorted(txs, key=lambda t: t.get('timestamp',''), reverse=True)
    for i,t in enumerate(sorted_txs):
        who = (t.get('benevoleNom') or t.get('specNom') or '—')[:15]
        mt_str = euro(t.get('montant',0))
        y = table_row([t.get('date','—'), t.get('heure','—'), TX_LABELS.get(t.get('type',''),t.get('type','—'))[:14],
                       who, (t.get('label','—'))[:20], mt_str, (t.get('staff','—'))[:12]],
                      y, cols_tx, alt=i%2==1)
        if y < 12*mm:
            c.showPage(); header_footer(6); y = START_Y
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 7 — SPECTATEURS
    # ════════════════════════════════════════════════════════════════
    header_footer(7)
    y = START_Y
    y = section_title('SPECTATEURS & SOLDES NON CONSOMMÉS', y, GREEN, '👥')
    cols_sp = [40*mm, 40*mm, 30*mm, 25*mm, 30*mm, 30*mm]
    y = table_row(['ID QR','Nom','Solde restant','Nb tx','Total rechargé','Total dépensé'], y, cols_sp, header=True, color=GREEN)
    for i,s in enumerate(sorted(specs, key=lambda s: s.get('solde',0) or 0, reverse=True)):
        my_tx = [t for t in txs if t.get('specId')==s.get('id')]
        cr  = sum(t.get('montant',0) for t in my_tx if t.get('type')=='credit')
        dep = sum(t.get('montant',0) for t in my_tx if t.get('type') in ('debit','retrait'))
        y = table_row([s.get('id','—')[:18], s.get('nom','—')[:18], euro(s.get('solde',0)),
                       str(len(my_tx)), euro(cr), euro(dep)], y, cols_sp, alt=i%2==1)
        if y < 12*mm:
            c.showPage(); header_footer(7); y = START_Y
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 8 — RÉSERVATIONS
    # ════════════════════════════════════════════════════════════════
    header_footer(8)
    y = START_Y
    y = section_title('RÉSERVATIONS — TOUS STATUTS', y, BRANDD, '📋')
    kR = CW/4 - 3*mm
    resa_kpis = [
        ('Total résa',  str(len(resas)), BRANDD),
        ('Retirées',    str(collected_n), GREEN),
        ('En attente',  str(len([r for r in resas if r.get('status')=='pending'])), AMBER),
        ('Annulées',    str(len([r for r in resas if r.get('status')=='cancelled'])), RED),
    ]
    for i,(lbl,val,col) in enumerate(resa_kpis):
        kpi_card(lbl, val, ML+i*(kR+3*mm), y, kR, 14*mm, col)
    y -= 18*mm
    cols_r = [22*mm, 32*mm, 20*mm, 40*mm, 22*mm, 20*mm, 20*mm]
    y = table_row(['Code','Bénéficiaire','Type','Articles','Total','Statut','Date'], y, cols_r, header=True)
    for i,r in enumerate(sorted(resas, key=lambda r: r.get('date',''), reverse=True)):
        items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
        mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
        typ = 'Bénévole' if r.get('isBenev') else 'Spectateur'
        y = table_row([r.get('code','—'), (r.get('benevoleNom') or r.get('specNom') or '—')[:15],
                       typ, items, euro(mt), STATUS_L.get(r.get('status',''),'—'), r.get('date','—')],
                      y, cols_r, alt=i%2==1)
        if y < 12*mm:
            c.showPage(); header_footer(8); y = START_Y
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 9 — BÉNÉVOLES
    # ════════════════════════════════════════════════════════════════
    header_footer(9)
    y = START_Y
    y = section_title('BÉNÉVOLES & CONSOMMATIONS PRISES EN CHARGE', y, PURPLE, '🙋')
    nb_benev_actifs = len(set(r.get('benevoleId') for r in benev_r if r.get('benevoleId')))
    kpi_card('Bénévoles actifs', str(nb_benev_actifs), ML, y, CW/4-3*mm, 14*mm, PURPLE)
    kpi_card('Résa retirées', str(len(benev_r)), ML+(CW/4-3*mm)+4*mm, y, CW/4-3*mm, 14*mm, BRANDD)
    kpi_card('Coût total pris en charge', euro(cout_benev), ML+2*(CW/4-3*mm)+8*mm, y, CW/2-5*mm, 14*mm, RED)
    y -= 18*mm
    cols_b = [30*mm, 30*mm, 25*mm, 25*mm, 40*mm, 22*mm]
    y = table_row(['Bénévole','Code résa','Type','Total','Articles','Date'], y, cols_b, header=True, color=PURPLE)
    for i,r in enumerate(sorted(benev_r, key=lambda r: r.get('date',''), reverse=True)):
        items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
        mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
        y = table_row([(r.get('benevoleNom','—'))[:14], r.get('code','—'), 'Résa bénévole',
                       euro(mt), items, r.get('date','—')], y, cols_b, alt=i%2==1)
        if y < 12*mm:
            c.showPage(); header_footer(9); y = START_Y
    c.showPage()

    # ════════════════════════════════════════════════════════════════
    # PAGE 10 — JOURNAL D'AUDIT
    # ════════════════════════════════════════════════════════════════
    header_footer(10)
    y = START_Y
    y = section_title("JOURNAL D'AUDIT COMPLET", y, RED, '📋')
    cols_a = [22*mm, 18*mm, 28*mm, 22*mm, 50*mm, 30*mm]
    y = table_row(['Date','Heure','Action','Type user','Libellé','Staff'], y, cols_a, header=True, color=RED)
    for i,l in enumerate(sorted(audit_lst, key=lambda l: l.get('timestamp',''), reverse=True)):
        ts = l.get('timestamp','')
        try:
            d = datetime.fromisoformat(ts)
            ds = d.strftime('%d/%m/%Y'); hs = d.strftime('%H:%M')
        except:
            ds = l.get('date','—'); hs = l.get('heure','—')
        y = table_row([ds, hs, (l.get('action','—'))[:14], l.get('userType','—')[:10],
                       (l.get('label','—'))[:28], (l.get('staff','—'))[:14]], y, cols_a, alt=i%2==1)
        if y < 12*mm:
            c.showPage(); header_footer(10); y = START_Y
    c.save()

    buf.seek(0)
    return buf.read()


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            data = parse_body(self)
        except Exception as e:
            self.send_response(400); self.end_headers()
            self.wfile.write(f'Invalid JSON: {e}'.encode()); return
        try:
            pdf_bytes = generate_pdf(data)
            dt  = datetime.now().strftime('%d_%m_%Y')
            nom = (data.get('event',{}).get('nom','rapport') or 'rapport').replace(' ','-')[:40]
            fn  = f"{data.get('event',{}).get('nom','Événement')} - Rapport de clôture - {dt}.pdf"
            self.send_response(200)
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Disposition', f'attachment; filename="{fn}"')
            self.send_header('Content-Length', str(len(pdf_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            self.send_response(500); self.end_headers()
            self.wfile.write(f'ERREUR: {e}\n{traceback.format_exc()}'.encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, *a): pass
