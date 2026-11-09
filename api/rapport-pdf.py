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
    app_version = data.get('appVersion', 'v1.0.0')  # version reçue du client
    txs        = data.get('transactions', [])
    specs      = data.get('spectateurs', [])
    resas      = data.get('reservations', [])
    menu_lst   = data.get('menu', [])
    audit_lst  = data.get('audit', [])
    staff_lst  = data.get('staff', [])
    cachets_lst = data.get('cachets', [])
    expos_lst   = data.get('expositions', [])
    finances_lst = data.get('finances', [])
    now        = now_str()

    # ─── Configuration des sections (Lot 2 — filtres par section) ───
    # Format Lot 2 : {sectionKey: {enabled: bool, ...filtres}}.
    # Rétrocompat Lot 1 : {sectionKey: bool} accepté aussi.
    # Si la clé `sections` est absente ou None : toutes les sections sont
    # incluses sans filtre (comportement rétrocompatible avec les anciens clients).
    # La couverture (page 1) est TOUJOURS incluse — non configurable.
    sections_cfg = data.get('sections') or {}
    # Lot Custom B — Pages personnalisées insérées entre les sections fixes.
    # Format : [{ id, titre, sousTitre, position, tables: [...] }]
    # position : 'cover' (après couverture), 'recap', 'graphics', ... (après cette
    #            section), ou 'end' (à la fin du rapport).
    custom_pages = data.get('customPages') or []
    def get_section(key):
        """Renvoie la config d'une section sous forme de dict.
        - {} si la section n'est pas dans la config (= tout activé)
        - {'enabled': bool} si format Lot 1 (booléen)
        - {'enabled': bool, ...filtres} si format Lot 2 (objet)
        """
        if not sections_cfg:
            return {'enabled': True}
        v = sections_cfg.get(key)
        if v is None:
            return {'enabled': True}
        if isinstance(v, bool):
            return {'enabled': v}
        if isinstance(v, dict):
            return v
        return {'enabled': True}
    def section_on(key):
        return get_section(key).get('enabled', True)

    # ─── Helpers pour appliquer les filtres (Lot 2) ───
    def parse_date(s):
        """Parse 'YYYY-MM-DD' ou ISO timestamp, retourne datetime ou None."""
        if not s: return None
        try:
            # Format YYYY-MM-DD
            if len(s) == 10:
                return datetime.strptime(s, '%Y-%m-%d')
            # ISO complet
            return datetime.fromisoformat(s.replace('Z', '+00:00'))
        except: return None
    def filter_by_period(items, sec, ts_field='timestamp'):
        """Filtre une liste d'items par période [periodFrom, periodTo].
        Items doivent avoir un champ ts_field au format ISO ou 'YYYY-MM-DD'.
        Si periodFrom/To vide, ne filtre rien sur ce côté."""
        df = parse_date(sec.get('periodFrom'))
        dt = parse_date(sec.get('periodTo'))
        if not df and not dt: return items
        result = []
        for it in items:
            d = parse_date(it.get(ts_field) or it.get('date'))
            if not d: continue  # pas de date = exclu si filtre actif
            if df and d < df: continue
            if dt:
                # On inclut toute la journée du periodTo (jusqu'à 23:59:59)
                dt_end = dt.replace(hour=23, minute=59, second=59)
                if d > dt_end: continue
            result.append(it)
        return result
    def eur_to_cent(s):
        """Convertit un montant en € (string) en centimes (int)."""
        if s in (None, '', False): return None
        try: return int(round(float(str(s).replace(',', '.')) * 100))
        except: return None

    # ─── Helper Lot 3 : champs activés pour une section ────────────────
    # fields peut être :
    #   - None ou absent : toutes les colonnes activées (rétro-compat)
    #   - []              : aucune colonne (section quasi vide)
    #   - liste explicite : colonnes activées
    def field_on(section_key, field_key):
        sec = get_section(section_key)
        fields = sec.get('fields')
        if fields is None: return True  # rétro-compat = tout activé
        return field_key in fields

    # Helper Lot 3 : filtre une liste (headers, cols_w, values) selon les champs activés.
    # Prend une liste de tuples (field_key, header_label, col_width) et la liste des valeurs
    # de la ligne dans le MÊME ordre. Retourne (filtered_headers, filtered_widths, filtered_values).
    # Redimensionne proportionnellement les largeurs pour utiliser tout l'espace disponible.
    def apply_fields(section_key, columns_spec, values):
        """
        columns_spec : [(field_key, header_label, col_width), ...]
        values       : [val0, val1, ...] dans le même ordre que columns_spec
        Retourne (headers, widths, values) filtrés + redimensionnés.
        """
        sec = get_section(section_key)
        fields = sec.get('fields')
        if fields is None:
            # Pas de filtre : retourne tout tel quel
            headers = [c[1] for c in columns_spec]
            widths  = [c[2] for c in columns_spec]
            return headers, widths, values
        # Filtre selon les fields activés
        kept = [(c, v) for c, v in zip(columns_spec, values) if c[0] in fields]
        if not kept:
            return [], [], []
        headers = [c[1] for c, _ in kept]
        # Redimensionnement : on garde la somme totale et on répartit
        # proportionnellement les largeurs gardées.
        total_orig = sum(c[2] for c in columns_spec)
        total_kept = sum(c[2] for c, _ in kept)
        if total_kept <= 0:
            widths = [total_orig / len(kept)] * len(kept)
        else:
            ratio = total_orig / total_kept
            widths = [c[2] * ratio for c, _ in kept]
        values_kept = [v for _, v in kept]
        return headers, widths, values_kept

    # ─── Helper Lot Custom A : ligne de total ────────────────────────────
    # Construit les valeurs d'une ligne de total à partir des sommes accumulées,
    # en respectant le filtrage des champs (apply_fields) et la config totalRow.
    #
    # Args:
    #   section_key : str, clé de la section (ex: 'articles')
    #   cols_spec   : [(field_key, header_label, col_width), ...] (spec complète)
    #   sums        : dict { field_key: valeur_à_afficher (déjà formatée) }
    #                 ex: { 'qty': '47', 'ca': '705,00 €' }
    #   widths      : largeurs de colonnes (issues de apply_fields)
    #
    # Retourne (label, total_values) où :
    #   - label = label de la ligne de total (depuis config)
    #   - total_values = liste des valeurs (label en première position non-sommée,
    #                    valeurs sommées dans les colonnes choisies, '' ailleurs)
    # Si la ligne n'est pas activée, retourne (None, None).
    def build_total_row(section_key, cols_spec, sums):
        sec = get_section(section_key)
        tr = sec.get('totalRow') or {}
        if not tr.get('enabled'): return None, None
        # On respecte le filtrage des fields : applique le même filtre pour
        # déterminer quelles colonnes existent encore dans la table.
        fields = sec.get('fields')
        kept_cols = cols_spec if fields is None else [c for c in cols_spec if c[0] in fields]
        if not kept_cols: return None, None
        label_str = tr.get('label') or 'Total'
        sum_cols = set(tr.get('columns') or [])
        # Construction des valeurs : le label occupe les premières colonnes
        # non-sommées (généralement la colonne nom/rang) ; les autres affichent
        # soit la somme, soit vide.
        values = []
        label_placed = False
        for col_key, _, _ in kept_cols:
            if col_key in sum_cols:
                values.append(sums.get(col_key, ''))
                label_placed = True  # une fois qu'on a passé une colonne sommée, on ne place plus le label
            elif not label_placed:
                values.append(label_str if not values else '')  # label dans la 1re colonne non-sommée
            else:
                values.append('')
        # Edge case : aucune colonne sommée → le label seul sur la première colonne
        if not any(values):
            values[0] = label_str
        return label_str, values

    TX_LABELS = {
        'credit':'Crédit','debit':'Encaissement','retrait':'Retrait résa',
        'benev-retrait':'Retrait bénévole','reservation':'Réservation',
        'annulation':'Annulation','benev-reservation':'Résa bénévole',
        'benev-annulation':'Annul. bénévole',
    }
    # Labels courts et DISTINCTS pour les étiquettes de graphiques (barres/camembert),
    # où l'espace est limité. Évite que "Retrait résa" et "Retrait bénévole"
    # deviennent tous deux "Retrait" après troncature.
    TX_LABELS_SHORT = {
        'credit':'Crédit','debit':'Encaiss.','retrait':'Ret.résa',
        'benev-retrait':'Ret.bénév','reservation':'Résa',
        'annulation':'Annul.','benev-reservation':'Résa bén','benev-annulation':'Ann.bén',
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

    # ── Compte de résultat consolidé (cachets + expositions) ──────────
    # Tous les montants en centimes, comme le reste du rapport.
    # RECETTES exposition : acomptes + soldes réellement encaissés.
    expo_acomptes = sum((e.get('acompte') or {}).get('montant', 0) for e in expos_lst)
    expo_soldes   = sum((e.get('solde') or {}).get('montant', 0) for e in expos_lst)
    expo_encaisse = expo_acomptes + expo_soldes
    # Créances : montant total facturé - déjà encaissé (uniquement si positif)
    expo_total_facture = sum(e.get('montantTotal', 0) for e in expos_lst)
    expo_creances = max(0, expo_total_facture - expo_encaisse)

    # DÉPENSES cachets : tous modes de paiement. On distingue payé / planifié.
    # statut: 'planifie' | 'paye' | 'annule'. On ignore les annulés.
    # ⚠ Les montants de cachets sont stockés en EUROS (cf. Cachets.jsx),
    # contrairement au reste de l'app qui est en centimes. On convertit ×100.
    cachets_actifs = [c for c in cachets_lst if c.get('statut') != 'annule']
    cachets_payes  = sum(round(abs(c.get('montant', 0)) * 100) for c in cachets_actifs if c.get('statut') == 'paye')
    cachets_planif = sum(round(abs(c.get('montant', 0)) * 100) for c in cachets_actifs if c.get('statut') != 'paye')
    cachets_total  = cachets_payes + cachets_planif

    # ── Finances d'organisation (Lot Finances 1) ─────────────────────
    # Montants en CENTIMES (cohérent avec l'app). On distingue payé/prévu et
    # dépense/recette. Les dépenses/recettes payées entrent dans le résultat
    # réalisé ; les prévues dans le prévisionnel.
    fin_rec_paye   = sum(f.get('montant', 0) for f in finances_lst
                         if f.get('sens') == 'recette' and f.get('statut') == 'paye')
    fin_rec_prevu  = sum(f.get('montant', 0) for f in finances_lst
                         if f.get('sens') == 'recette' and f.get('statut') != 'paye')
    fin_dep_paye   = sum(f.get('montant', 0) for f in finances_lst
                         if f.get('sens') == 'depense' and f.get('statut') == 'paye')
    fin_dep_prevu  = sum(f.get('montant', 0) for f in finances_lst
                         if f.get('sens') == 'depense' and f.get('statut') != 'paye')

    # Résultats
    recettes_encaissees = total_ventes + expo_encaisse + fin_rec_paye
    depenses_payees     = cachets_payes + cout_benev + fin_dep_paye
    resultat_realise    = recettes_encaissees - depenses_payees
    # Prévisionnel : créances + recettes prévues, − cachets restants − dépenses prévues
    resultat_previsionnel = (resultat_realise + expo_creances + fin_rec_prevu
                             - cachets_planif - fin_dep_prevu)

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
        c.drawString(ML, 3*mm, f'YllaCash {app_version}  ·  Développée par Maison Ylla')
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

    def table_row(row_data, y, col_widths, alt=False, header=False, color=None, is_total=False, total_kind='grand'):
        row_h = 7*mm
        if header:
            bg = color if color else BRAND
        elif is_total:
            # total_kind : 'day' = sous-total jour (vert clair), 'grand' = total global (vert foncé)
            if total_kind == 'day':
                bg = HexColor('#DCEDE7')
            else:
                bg = HexColor('#0F6E56')
        else:
            bg = color or (BG if alt else WHITE)
        # y = coordonnée BASSE, ligne dessinée AU-DESSUS
        c.setFillColor(bg); c.rect(ML, y, CW, row_h, fill=1, stroke=0)
        c.setFillColor(BORDER); c.setLineWidth(0.2)
        c.line(ML, y, ML+CW, y)
        c.line(ML, y+row_h, ML+CW, y+row_h)
        # Ligne de séparation plus épaisse au-dessus de la ligne de total
        if is_total:
            c.setLineWidth(0.5)
            c.line(ML, y+row_h, ML+CW, y+row_h)
        x = ML
        for text, w in zip(row_data, col_widths):
            if header:
                c.setFillColor(WHITE)
                c.setFont('Helvetica-Bold', 7)
            elif is_total:
                # Texte foncé sur fond clair (jour), blanc sur fond foncé (global)
                c.setFillColor(HexColor('#04342C') if total_kind == 'day' else WHITE)
                c.setFont('Helvetica-Bold', 7)
            else:
                c.setFillColor(BLACK)
                c.setFont('Helvetica', 7)
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
        # Cercle à 80% du Drawing carré : grand et bien visible. Les étiquettes
        # latérales tiennent dans les 10% de marge de chaque côté.
        pie_diam = size * 0.80
        pie.x = (size - pie_diam) / 2
        pie.y = (size - pie_diam) / 2
        pie.width = pie_diam; pie.height = pie_diam
        pie.data = data_vals
        pie.labels = [str(l)[:9] for l in labels]
        pie.sideLabels = True
        pie.sideLabelsOffset = 0.04
        default_colors = [BRAND, AMBER, GREEN, PURPLE, RED, HexColor('#06b6d4'), HexColor('#f97316')]
        cols = colors or default_colors
        for i in range(len(data_vals)):
            pie.slices[i].fillColor = cols[i % len(cols)]
            pie.slices[i].strokeColor = WHITE
            pie.slices[i].strokeWidth = 0.5
        pie.slices.labelRadius = 1.1
        pie.slices.fontSize = 6
        d.add(pie)
        renderPDF.draw(d, c, x, y)

    START_Y = H_pt - 39*mm  # 20mm sous header (11mm) + 8mm titre = 31mm depuis haut

    # ════════════════════════════════════════════════════════════════
    # Lot Custom B — Rendu des pages personnalisées
    # ════════════════════════════════════════════════════════════════
    # Chaque page custom contient : titre, sousTitre, position, tables[].
    # Pour B1, chaque page a 1 tableau. La fonction render_custom_pages_at
    # rend toutes les pages custom dont la position == anchor, et retourne
    # le nouveau page_num.
    #
    # Spécifications d'un tableau custom :
    #   { source: 'articles'|'spectateurs'|'benevoles'|'reservations'|'transactions',
    #     titre: str, filters: {...mêmes clés que les sections}, fields: [...],
    #     totalRow: {...} }
    #
    # Les colonnes par source (clé, label, largeur) :
    CUSTOM_COLS = {
        'articles': [
            ('rank','#',10*mm),('nom','Article',50*mm),('qty','Unités',25*mm),
            ('ca','CA généré',25*mm),('pct','% du CA',35*mm),('stock','Stock',25*mm),
        ],
        'spectateurs': [
            ('id','ID QR',40*mm),('nom','Nom',40*mm),('solde','Solde restant',30*mm),
            ('nb_tx','Nb tx',25*mm),('recharge','Total rechargé',30*mm),('depense','Total dépensé',30*mm),
        ],
        'benevoles': [
            ('nom','Bénévole',30*mm),('code','Code résa',30*mm),('type','Type',25*mm),
            ('total','Total',25*mm),('items','Articles',40*mm),('date','Date',22*mm),
        ],
        'reservations': [
            ('code','Code',22*mm),('who','Bénéficiaire',32*mm),('type','Type',20*mm),
            ('items','Articles',40*mm),('total','Total',22*mm),('status','Statut',20*mm),('date','Date',20*mm),
        ],
        'transactions': [
            ('date','Date',22*mm),('heure','Heure',16*mm),('type','Type',28*mm),
            ('who','Bénéficiaire',30*mm),('label','Libellé',40*mm),('montant','Montant',24*mm),('staff','Staff',20*mm),
        ],
    }
    SOURCE_TITLES = {
        'articles': 'ARTICLES', 'spectateurs': 'SPECTATEURS', 'benevoles': 'BÉNÉVOLES',
        'reservations': 'RÉSERVATIONS', 'transactions': 'TRANSACTIONS',
    }

    def _custom_apply_fields(tbl, cols_spec, values):
        """Comme apply_fields mais opère sur la config d'un tableau custom (pas une section)."""
        fields = tbl.get('fields')
        if fields is None:
            return [c[1] for c in cols_spec], [c[2] for c in cols_spec], values
        kept = [(c, v) for c, v in zip(cols_spec, values) if c[0] in fields]
        if not kept: return [], [], []
        headers = [c[1] for c, _ in kept]
        total_orig = sum(c[2] for c in cols_spec)
        total_kept = sum(c[2] for c, _ in kept)
        ratio = total_orig / total_kept if total_kept > 0 else 1
        widths = [c[2] * ratio for c, _ in kept]
        return headers, widths, [v for _, v in kept]

    def _custom_build_data(tbl):
        """Construit (rows, sums_dict) pour un tableau custom selon sa source + filtres.
        rows = liste de listes de valeurs (ordre = CUSTOM_COLS[source]).
        sums_dict = { col_key: valeur_formatée } pour la ligne de total.
        """
        source = tbl.get('source')
        # On réutilise les filtres standard via un faux "sec" = la config du tableau
        sec = tbl  # tbl a periodFrom, periodTo, articleSelection, etc. comme une section
        if source == 'articles':
            _txs = filter_by_period(txs, sec)
            _t_ventes = sum(t.get('montant',0) for t in _txs if t.get('type') in ('debit','retrait','benev-retrait'))
            art_sel = sec.get('articleSelection')
            sel_names = None
            if art_sel is not None and isinstance(art_sel, list):
                sel_names = set()
                for sid in art_sel:
                    m = next((mi for mi in menu_lst if mi.get('id')==sid or mi.get('nom')==sid), None)
                    sel_names.add(m.get('nom','') if m else sid)
            cat_sel = sec.get('categorieSelection')
            if cat_sel is not None and isinstance(cat_sel, list):
                cat_sel_set = set(cat_sel)
                allowed = set(m.get('nom','') for m in menu_lst if m.get('cat') in cat_sel_set)
                # Si "Autres" est sélectionné, inclure aussi les articles vendus
                # mais absents du menu (articles supprimés du menu en cours d'événement).
                if 'Autres' in cat_sel_set:
                    noms_menu = {m.get('nom', '') for m in menu_lst}
                    for t in _txs:
                        for it in t.get('items', []):
                            nm = it.get('nom', '')
                            if nm and nm not in noms_menu:
                                allowed.add(nm)
                sel_names = (sel_names & allowed) if sel_names is not None else allowed
            amap = {}
            for t in _txs:
                for i in t.get('items',[]):
                    k = i.get('nom','')
                    if sel_names is not None and k not in sel_names: continue
                    if k not in amap: amap[k] = {'nom':k,'qty':0,'ca':0}
                    amap[k]['qty'] += i.get('qty',1)
                    amap[k]['ca'] += i.get('total',(i.get('prixUnit',0)*i.get('qty',1)))
            top_n = int(sec.get('topN') or 20)
            _top = sorted(amap.values(), key=lambda a:a['ca'], reverse=True)[:top_n]
            rows = []
            for idx,a in enumerate(_top):
                mi = next((m for m in menu_lst if m.get('nom')==a['nom']), {})
                pct = f"{a['ca']/_t_ventes*100:.1f}%" if _t_ventes else '—'
                rows.append([f"#{idx+1}", a['nom'][:18], str(a['qty']), euro(a['ca']), pct, str(mi.get('stock','—'))])
            sums = {'qty':str(sum(a['qty'] for a in _top)), 'ca':euro(sum(a['ca'] for a in _top)),
                    'pct':'', 'stock':''}
            return rows, sums
        elif source == 'spectateurs':
            _specs = specs[:]
            sel = sec.get('spectateurSelection')
            if sel is not None and isinstance(sel, list):
                ss = set(sel); _specs = [s for s in _specs if s.get('id') in ss]
            _specs = sorted(_specs, key=lambda s:s.get('solde',0) or 0, reverse=True)
            rows = []
            tot_solde=tot_nb=tot_rech=tot_dep=0
            for s in _specs:
                mytx = [t for t in txs if t.get('specId')==s.get('id')]
                cr = sum(t.get('montant',0) for t in mytx if t.get('type')=='credit')
                dp = sum(t.get('montant',0) for t in mytx if t.get('type') in ('debit','retrait'))
                rows.append([s.get('id','—')[:18], s.get('nom','—')[:18], euro(s.get('solde',0)),
                             str(len(mytx)), euro(cr), euro(dp)])
                tot_solde += s.get('solde',0) or 0; tot_nb += len(mytx); tot_rech += cr; tot_dep += dp
            sums = {'solde':euro(tot_solde),'nb_tx':str(tot_nb),'recharge':euro(tot_rech),'depense':euro(tot_dep)}
            return rows, sums
        elif source == 'benevoles':
            _br = filter_by_period(benev_r, sec, 'timestamp')
            sel = sec.get('benevoleSelection')
            if sel is not None and isinstance(sel, list):
                ss = set(sel); _br = [r for r in _br if r.get('benevoleId') in ss]
            rows = []; tot=0
            for r in sorted(_br, key=lambda r:r.get('date',''), reverse=True):
                items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
                mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
                rows.append([(r.get('benevoleNom','—'))[:14], r.get('code','—'),'Résa bénévole',euro(mt),items,r.get('date','—')])
                tot += mt
            return rows, {'total':euro(tot)}
        elif source == 'reservations':
            _r = resas[:]
            statuses = sec.get('resaStatuses') or []
            if statuses: _r = [x for x in _r if x.get('status') in statuses]
            tf = sec.get('resaType') or 'all'
            if tf=='spec': _r = [x for x in _r if not x.get('isBenev')]
            elif tf=='benev': _r = [x for x in _r if x.get('isBenev')]
            rows = []; tot=0
            for r in sorted(_r, key=lambda r:r.get('date',''), reverse=True):
                items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
                mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
                typ = 'Bénévole' if r.get('isBenev') else 'Spectateur'
                rows.append([r.get('code','—'),(r.get('benevoleNom') or r.get('specNom') or '—')[:15],
                             typ,items,euro(mt),STATUS_L.get(r.get('status',''),'—'),r.get('date','—')])
                tot += mt
            return rows, {'total':euro(tot)}
        elif source == 'transactions':
            _txs = filter_by_period(txs, sec)
            types = sec.get('txTypes') or []
            if types: _txs = [t for t in _txs if t.get('type') in types]
            minc = eur_to_cent(sec.get('minEur')); maxc = eur_to_cent(sec.get('maxEur'))
            if minc is not None: _txs = [t for t in _txs if (t.get('montant') or 0)>=minc]
            if maxc is not None: _txs = [t for t in _txs if (t.get('montant') or 0)<=maxc]
            rows = []; tot=0
            for t in sorted(_txs, key=lambda t:t.get('timestamp',''), reverse=True):
                who = (t.get('benevoleNom') or t.get('specNom') or '—')[:15]
                rows.append([t.get('date','—'),t.get('heure','—'),
                             TX_LABELS.get(t.get('type',''),t.get('type','—'))[:14],
                             who,(t.get('label','—'))[:20],euro(t.get('montant',0)),(t.get('staff','—'))[:12]])
                tot += t.get('montant',0)
            return rows, {'montant':euro(tot)}
        return [], {}

    def _render_croise(tbl, y, page_num):
        """Rend un tableau croisé : lignes = transactions, colonnes = articles choisis.
        Options : croiseDetail (lignes par tx), croiseShowUnits (€+unités),
        croiseSubtotalsByDay (sous-totaux par jour). Retourne (y, page_num)."""
        arts = tbl.get('croiseArticles') or []
        show_units = tbl.get('croiseShowUnits') is not False
        detail = tbl.get('croiseDetail') is not False
        by_day = tbl.get('croiseSubtotalsByDay') is not False

        # Titre du tableau (on descend suffisamment pour ne pas être recouvert
        # par le rectangle d'en-tête, qui est dessiné de y vers le haut).
        if tbl.get('titre'):
            c.setFont('Helvetica-Bold', 10); c.setFillColor(BLACK)
            c.drawString(ML, y, tbl.get('titre')[:60]); y -= 9*mm
        if not arts:
            c.setFont('Helvetica-Oblique', 9); c.setFillColor(MUTED)
            c.drawString(ML, y, 'Aucun article sélectionné pour ce tableau croisé.')
            return y - 6*mm, page_num

        # Largeurs de colonnes : Date | Type | (article €, [unités])... | Total
        avail = W_pt - 2*ML
        date_w = 24*mm
        type_w = 22*mm
        total_w = 22*mm
        per_art = (avail - date_w - type_w - total_w) / max(len(arts), 1)
        # Sous-colonnes par article
        sub_n = 2 if show_units else 1

        # Helpers part d'un article dans une tx
        def part(tx, art):
            mt = 0; q = 0
            for i in tx.get('items', []):
                if i.get('nom','') == art:
                    qq = i.get('qty', 1)
                    mm_ = i.get('total', i.get('prixUnit', i.get('prix',0))*qq)
                    mt += mm_; q += qq
            return mt, q

        KIND_LABELS = {'debit':'Vente','retrait':'Résa spect.','benev-retrait':'Conso bénév.','reservation':'Réservation'}

        # Construire les lignes (tx contenant au moins un des articles)
        vente_types = ('debit','retrait','benev-retrait')
        rows = []
        for t in txs:
            if t.get('type') not in vente_types: continue
            cells = {}; rowtot = 0; has = False
            for a in arts:
                mt, q = part(t, a)
                if mt or q:
                    cells[a] = (mt, q); rowtot += mt; has = True
            if has:
                d = parse_date(t.get('timestamp') or t.get('date'))
                rows.append({'dt': d, 'ts': t.get('timestamp') or t.get('date') or '',
                             'type': t.get('type'), 'cells': cells, 'total': rowtot})
        rows.sort(key=lambda r: r['ts'], reverse=True)

        # En-tête : on construit les libellés
        headers = ['Date', 'Type']
        widths = [date_w, type_w]
        for a in arts:
            if show_units:
                headers.append(a[:14] + ' €'); widths.append(per_art*0.6)
                headers.append('U'); widths.append(per_art*0.4)
            else:
                headers.append(a[:16]); widths.append(per_art)
        headers.append('Total'); widths.append(total_w)

        def day_key(r):
            return r['dt'].strftime('%Y-%m-%d') if r['dt'] else '—'
        def day_label(r):
            return r['dt'].strftime('%d/%m') if r['dt'] else '—'

        # Totaux globaux
        g_art = {a: [0,0] for a in arts}  # [montant, unités]
        g_tx = {a: 0 for a in arts}
        g_total = 0; g_nbtx = 0

        def render_header(y):
            return table_row(headers, y, widths, header=True, color=BRANDD)

        def row_cells(r):
            vals = [day_label(r), KIND_LABELS.get(r['type'], r['type'])]
            for a in arts:
                mt, q = r['cells'].get(a, (0,0))
                vals.append(euro(mt) if mt else '—')
                if show_units: vals.append(str(q) if q else '—')
            vals.append(euro(r['total']))
            return vals

        def subtotal_rows(label, art_money, art_units, art_tx, tot_money, nbtx):
            """Retourne les lignes de sous-total (CA, Transactions, Unités)."""
            out = []
            # CA
            ca = [label, '']
            for a in arts:
                ca.append(euro(art_money.get(a,0)))
                if show_units: ca.append('')
            ca.append(euro(tot_money))
            out.append(ca)
            # Transactions
            tx = ['Transactions', '']
            for a in arts:
                tx.append(str(art_tx.get(a,0)))
                if show_units: tx.append('')
            tx.append(str(nbtx))
            out.append(tx)
            # Unités (si affichées)
            if show_units:
                un = ['Unités', '']
                tot_u = 0
                for a in arts:
                    un.append('')
                    un.append(str(art_units.get(a,0)))
                    tot_u += art_units.get(a,0)
                un.append(str(tot_u))
                out.append(un)
            return out

        y = render_header(y)

        if not rows:
            er = ['—']*len(headers)
            if len(headers) >= 2: er[1] = 'Aucune vente'
            y = table_row(er, y, widths)
            return y - 4*mm, page_num

        # Grouper par jour
        from itertools import groupby
        # rows triés desc ; pour groupby il faut consécutif -> déjà groupés par jour car triés par ts
        cur_day = None
        d_money = {}; d_units = {}; d_tx = {}; d_total = 0; d_nbtx = 0

        def flush_day(y, page_num):
            if cur_day is None or not by_day:
                return y, page_num
            for sr in subtotal_rows(f'Sous-total {cur_day}', d_money, d_units, d_tx, d_total, d_nbtx):
                y = table_row(sr, y, widths, is_total=True, total_kind='day')
                if y < 14*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y; y = render_header(y)
            return y, page_num

        for r in rows:
            dk = day_label(r)
            if by_day and dk != cur_day:
                # flush le jour précédent
                if cur_day is not None:
                    y, page_num = flush_day(y, page_num)
                cur_day = dk
                d_money = {a:0 for a in arts}; d_units = {a:0 for a in arts}; d_tx = {a:0 for a in arts}
                d_total = 0; d_nbtx = 0
                # bandeau jour
                c.setFont('Helvetica-Bold', 8); c.setFillColor(BRANDD)
                c.drawString(ML, y, f'— {dk} —'); y -= 5*mm
            # accumulations
            for a in arts:
                mt, q = r['cells'].get(a, (0,0))
                if mt or q:
                    d_money[a] = d_money.get(a,0)+mt; d_units[a] = d_units.get(a,0)+q; d_tx[a] = d_tx.get(a,0)+1
                    g_art[a][0] += mt; g_art[a][1] += q; g_tx[a] += 1
            d_total += r['total']; d_nbtx += 1
            g_total += r['total']; g_nbtx += 1
            # ligne détail
            if detail:
                y = table_row(row_cells(r), y, widths)
                if y < 14*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y; y = render_header(y)
        # flush dernier jour
        if by_day:
            y, page_num = flush_day(y, page_num)

        # Totaux globaux
        g_money = {a: g_art[a][0] for a in arts}
        g_units = {a: g_art[a][1] for a in arts}
        for sr in subtotal_rows('TOTAL', g_money, g_units, g_tx, g_total, g_nbtx):
            y = table_row(sr, y, widths, is_total=True)
        return y - 4*mm, page_num

    def render_custom_pages_at(anchor, page_num):
        """Rend toutes les pages custom positionnées sur `anchor`. Retourne page_num."""
        for page in custom_pages:
            if page.get('position') != anchor: continue
            tables = page.get('tables') or []
            header_footer(page_num)
            y = START_Y
            # Titre de la page
            ptitre = page.get('titre') or 'Page personnalisée'
            y = section_title(ptitre.upper()[:60], y, BRANDD, '📄')
            # Sous-titre
            if page.get('sousTitre'):
                c.setFont('Helvetica-Oblique', 9); c.setFillColor(MUTED)
                c.drawString(ML, y, page.get('sousTitre')[:90])
                y -= 8*mm
            # Tableaux (B1 : 1 seul, mais on boucle pour B2)
            for tbl in tables:
                source = tbl.get('source')
                # Tableau croisé : rendu dédié (articles en colonnes)
                if source == 'croise':
                    y, page_num = _render_croise(tbl, y, page_num)
                    y -= 6*mm
                    continue
                if source not in CUSTOM_COLS: continue
                cols_spec = CUSTOM_COLS[source]
                # Titre du tableau
                if tbl.get('titre'):
                    c.setFont('Helvetica-Bold', 10); c.setFillColor(BLACK)
                    c.drawString(ML, y, tbl.get('titre')[:60]); y -= 6*mm
                rows, sums = _custom_build_data(tbl)
                headers, widths, _ = _custom_apply_fields(tbl, cols_spec, [None]*len(cols_spec))
                if not headers: continue
                # Ligne de total
                tr = tbl.get('totalRow') or {}
                tr_pos = tr.get('position','bottom') if tr.get('enabled') else None
                total_values = None
                if tr.get('enabled'):
                    sum_cols = set(tr.get('columns') or [])
                    fields = tbl.get('fields')
                    kept = cols_spec if fields is None else [cc for cc in cols_spec if cc[0] in fields]
                    tvals = []; placed=False
                    for ck,_,_ in kept:
                        if ck in sum_cols: tvals.append(sums.get(ck,'')); placed=True
                        elif not placed: tvals.append((tr.get('label') or 'Total') if not tvals else '')
                        else: tvals.append('')
                    if not any(tvals): tvals[0] = tr.get('label') or 'Total'
                    total_values = tvals
                y = table_row(headers, y, widths, header=True, color=BRANDD)
                if total_values and tr_pos=='top':
                    y = table_row(total_values, y, widths, is_total=True)
                if not rows:
                    er = ['—']*len(headers)
                    if len(headers)>=2: er[1]='Aucune donnée'
                    y = table_row(er, y, widths, alt=False)
                for ri,rv in enumerate(rows):
                    _,_,fv = _custom_apply_fields(tbl, cols_spec, rv)
                    y = table_row(fv, y, widths, alt=ri%2==1)
                    if y < 14*mm:
                        c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
                if total_values and tr_pos=='bottom':
                    y = table_row(total_values, y, widths, is_total=True)
                y -= 6*mm  # espace entre tableaux
            c.showPage()
            page_num += 1
        return page_num


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
    c.drawString(ML, H_pt*0.42, f'YllaCash {app_version}  ·  Développée par Maison Ylla')
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
        ('Résultat réalisé', euro(resultat_realise), GREEN if resultat_realise>=0 else RED),
        ('Coût bénévoles',euro(cout_benev), RED),
    ]
    for i,(lbl,val,col) in enumerate(kpis_cov2):
        kpi_card(lbl, val, ML+i*(kW_cov+3*mm), y_r2, kW_cov, kH_cov, col)
    # Footer couverture
    c.setFillColor(BG); c.rect(0, 0, W_pt, 9*mm, fill=1, stroke=0)
    c.setFillColor(MUTED); c.setFont('Helvetica', 5.5)
    c.drawString(ML, 3*mm, f'YllaCash {app_version}  ·  Développée par Maison Ylla')
    c.drawCentredString(W_pt/2, 3*mm, 'Document confidentiel — Réservé aux administrateurs')
    c.setFont('Helvetica-Oblique', 5)
    c.drawRightString(W_pt-MR, 3*mm, 'Toute la gestion financière de votre événement en un seul endroit')
    header_footer(1)
    c.showPage()

    # ─── Compteur de page dynamique (Lot 1 toggle sections) ───
    # Démarre à 2 après la couverture. S'incrémente à chaque page rendue
    # pour que les numéros de page restent séquentiels même si certaines
    # sections sont désactivées.
    page_num = 2
    # Lot Custom B — pages custom positionnées juste après la couverture
    page_num = render_custom_pages_at('cover', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — COMPTE DE RÉSULTAT CONSOLIDÉ (section_on('resultat'))
    # ════════════════════════════════════════════════════════════════
    if section_on('resultat'):
        header_footer(page_num)
        y = START_Y
        y = section_title('COMPTE DE RÉSULTAT CONSOLIDÉ', y, BRAND, '🧾')
        c.setFont('Helvetica-Oblique', 9); c.setFillColor(MUTED)
        c.drawString(ML, y, 'Bilan financier : cashless + production (cachets & expositions)')
        y -= 9*mm

        # Helper : ligne du compte de résultat (label gauche, montant droite)
        def cr_line(label, montant_cent, color=BLACK, indent=0, muted=False, prefix=''):
            row_h = 6.5*mm
            c.setFillColor(BORDER); c.setLineWidth(0.2)
            c.line(ML, y - 1*mm, ML+CW, y - 1*mm)
            c.setFont('Helvetica-Oblique' if muted else 'Helvetica', 9 if not muted else 8)
            c.setFillColor(MUTED if muted else BLACK)
            c.drawString(ML + indent, y + 1.5*mm, label)
            val_str = prefix + euro(abs(montant_cent))
            c.setFont('Helvetica-Bold' if not muted else 'Helvetica-Oblique', 9 if not muted else 8)
            c.setFillColor(color)
            c.drawRightString(ML + CW - 2*mm, y + 1.5*mm, val_str)
            return y - row_h

        # Helper : bandeau de section (recettes/dépenses/info)
        def cr_band(label, bg_color, txt_color):
            nonlocal_y = y
            c.setFillColor(bg_color); c.rect(ML, nonlocal_y - 1*mm, CW, 6*mm, fill=1, stroke=0)
            c.setFillColor(txt_color); c.setFont('Helvetica-Bold', 8)
            c.drawString(ML + 2*mm, nonlocal_y + 1*mm, label.upper())
            return nonlocal_y - 8*mm

        # Helper : ligne de total (gras, fond gris)
        def cr_total(label, montant_cent, color=BLACK):
            row_h = 8*mm
            c.setFillColor(HexColor('#E8E8E2')); c.rect(ML, y - 1.5*mm, CW, 7*mm, fill=1, stroke=0)
            c.setFont('Helvetica-Bold', 10); c.setFillColor(BLACK)
            c.drawString(ML + 2*mm, y + 1.5*mm, label)
            c.setFillColor(color)
            c.drawRightString(ML + CW - 2*mm, y + 1.5*mm, euro(abs(montant_cent)))
            return y - row_h

        # ─ RECETTES ─
        y = cr_band('Recettes encaissées', HexColor('#E1F5EE'), GREEN)
        y = cr_line('Ventes cashless (stand + borne)', total_ventes, GREEN, prefix='+ ')
        y = cr_line("Frais d'exposition encaissés", expo_encaisse, GREEN, prefix='+ ')
        if expo_acomptes or expo_soldes:
            y = cr_line('dont acomptes reçus', expo_acomptes, MUTED, indent=8*mm, muted=True)
            y = cr_line('dont soldes reçus', expo_soldes, MUTED, indent=8*mm, muted=True)
        if fin_rec_paye:
            y = cr_line('Subventions, sponsors & autres recettes', fin_rec_paye, GREEN, prefix='+ ')
        y = cr_total('Total recettes', recettes_encaissees, GREEN)
        y -= 4*mm

        # ─ DÉPENSES ─
        y = cr_band('Dépenses payées', HexColor('#FCEBEB'), RED)
        y = cr_line('Cachets artistiques payés', cachets_payes, RED, prefix='− ')
        y = cr_line('Coût consommations bénévoles', cout_benev, RED, prefix='− ')
        if fin_dep_paye:
            y = cr_line("Dépenses d'organisation", fin_dep_paye, RED, prefix='− ')
        y = cr_total('Total dépenses', depenses_payees, RED)
        y -= 4*mm

        # ─ RÉSULTAT RÉALISÉ ─
        res_color = GREEN if resultat_realise >= 0 else RED
        c.setFillColor(HexColor('#E1F5EE') if resultat_realise >= 0 else HexColor('#FCEBEB'))
        c.rect(ML, y - 2*mm, CW, 9*mm, fill=1, stroke=0)
        c.setFont('Helvetica-Bold', 12); c.setFillColor(BLACK)
        c.drawString(ML + 3*mm, y + 1.5*mm, 'RÉSULTAT RÉALISÉ')
        c.setFillColor(res_color)
        c.drawRightString(ML + CW - 3*mm, y + 1.5*mm, ('+ ' if resultat_realise >= 0 else '− ') + euro(abs(resultat_realise)))
        y -= 14*mm

        # ─ PRÉVISIONNEL ─
        y = cr_band('Prévisionnel — engagements restants', BG, MUTED)
        y = cr_line('Créances exposants à recevoir', expo_creances, MUTED, prefix='+ ', muted=True)
        if fin_rec_prevu:
            y = cr_line('Recettes prévues (subv./sponsors à venir)', fin_rec_prevu, MUTED, prefix='+ ', muted=True)
        y = cr_line('Cachets restant à payer (planifiés)', cachets_planif, MUTED, prefix='− ', muted=True)
        if fin_dep_prevu:
            y = cr_line("Dépenses d'organisation prévues", fin_dep_prevu, MUTED, prefix='− ', muted=True)
        y = cr_total('Résultat prévisionnel (si tout est soldé)',
                     resultat_previsionnel, GREEN if resultat_previsionnel >= 0 else RED)
        y -= 4*mm

        # ─ POUR INFORMATION (hors résultat) ─
        y = cr_band('Pour information (hors résultat)', BG, MUTED)
        y = cr_line('Total rechargé sur cartes', total_credits, MUTED, muted=True)
        y = cr_line('Soldes cashless non consommés', total_soldes, MUTED, muted=True)
        y = cr_line('Coût total cachets (payé + prévu)', cachets_total, MUTED, muted=True)

        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('resultat', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — FINANCES D'ORGANISATION (section_on('finances'))
    # ════════════════════════════════════════════════════════════════
    # Détail ligne par ligne des dépenses/recettes d'organisation.
    if section_on('finances') and finances_lst:
        MODE_L = {'especes':'Espèces','virement':'Virement','cheque':'Chèque','cb':'CB','autre':'Autre'}
        header_footer(page_num)
        y = START_Y
        y = section_title("DÉPENSES & RECETTES D'ORGANISATION", y, BRANDD, '💼')

        # On sépare recettes et dépenses, triées par date décroissante.
        recettes = sorted([f for f in finances_lst if f.get('sens') == 'recette'],
                          key=lambda f: f.get('date',''), reverse=True)
        depenses = sorted([f for f in finances_lst if f.get('sens') != 'recette'],
                          key=lambda f: f.get('date',''), reverse=True)
        cols_w = [26*mm, 38*mm, 56*mm, 24*mm, 18*mm, 20*mm]
        headers = ['Date', 'Catégorie', 'Libellé', 'Mode', 'Statut', 'Montant']

        def render_fin_block(title, rows, accent):
            nonlocal y, page_num
            if not rows: return
            # Marge avant le titre du bloc (pour décoller du bandeau de section).
            y -= 4*mm
            # Le titre est dessiné AU-DESSUS de y (baseline), on lui réserve
            # une hauteur de ligne pleine avant de descendre.
            c.setFont('Helvetica-Bold', 11); c.setFillColor(accent)
            c.drawString(ML, y, title)
            y -= 7*mm
            y = table_row(headers, y, cols_w, header=True, color=accent)
            tot = 0
            for i, f in enumerate(rows):
                montant = f.get('montant', 0); tot += montant
                has_doc = bool(f.get('documents'))
                libelle = (f.get('libelle','') or f.get('categorie','—'))[:28]
                if has_doc:
                    libelle = libelle[:26] + ' *'
                row = [
                    f.get('date','—'),
                    (f.get('categorie','—'))[:18],
                    libelle,
                    MODE_L.get(f.get('modePaiement',''), '—'),
                    'Payé' if f.get('statut') == 'paye' else 'Prévu',
                    euro(montant),
                ]
                y = table_row(row, y, cols_w, alt=i % 2 == 1)
                if y < 20*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
            # Ligne de total
            total_row = ['', 'TOTAL', '', '', '', euro(tot)]
            y = table_row(total_row, y, cols_w, is_total=True)
            y -= 8*mm

        render_fin_block('Recettes', recettes, GREEN)
        render_fin_block('Dépenses', depenses, RED)

        # Légende du marqueur de justificatif
        if any(f.get('documents') for f in finances_lst):
            c.setFont('Helvetica-Oblique', 7); c.setFillColor(MUTED)
            c.drawString(ML, y, "* Un justificatif (facture/reçu) est joint à ce mouvement dans l'application.")

        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('finances', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — RÉCAPITULATIF FINANCIER (section_on('recap'))
    # ════════════════════════════════════════════════════════════════
    if section_on('recap'):
        sec = get_section('recap')
        # Filtre période : si défini, on recalcule les KPI sur les transactions
        # dans la période. Sinon on utilise les KPI globaux pré-calculés.
        _txs = filter_by_period(txs, sec)
        _t_credits = sum(t.get('montant',0) for t in _txs if t.get('type')=='credit')
        _t_ventes  = sum(t.get('montant',0) for t in _txs if t.get('type') in ('debit','retrait','benev-retrait'))
        _resas_in_period = filter_by_period(resas, sec, 'timestamp')
        _benev_r_p = [r for r in _resas_in_period if r.get('isBenev') and r.get('status')=='collected']
        _cout_benev = sum(sum((i.get('prix',0)*i.get('qty',1)) for i in r.get('items',[])) for r in _benev_r_p)
        _ca_nette = _t_ventes - _cout_benev
        _ecart = _t_credits - _t_ventes - total_soldes  # solde restant = état actuel, pas filtrable

        # Recalcule tx_by_type pour la période
        _tx_by_type = []
        for typ in TX_TYPES:
            txk = [t for t in _txs if t.get('type')==typ]
            if txk:
                _tx_by_type.append({'type':typ,'label':TX_LABELS.get(typ,typ),
                                    'nb':len(txk),'vol':sum(t.get('montant',0) for t in txk)})

        header_footer(page_num)
        y = START_Y
        # KPIs filtrables (Lot 3)
        all_kpis = [
            ('kpi_ventes',  'CA Total ventes', euro(_t_ventes), BRAND),
            ('kpi_credits', 'Total rechargé',  euro(_t_credits), GREEN),
            ('kpi_soldes',  'Soldes restants', euro(total_soldes), AMBER),
            ('kpi_ecart',   'Écart comptable', euro(_ecart), GREEN if _ecart==0 else RED),
            ('kpi_benev',   'Coût bénévoles',  euro(_cout_benev), RED),
            ('kpi_ca_net',  'CA Net événement',euro(_ca_nette), GREEN if _ca_nette>=0 else RED),
        ]
        kpis2 = [(lbl, val, col) for k, lbl, val, col in all_kpis if field_on('recap', k)]
        kW2 = CW/3 - 2*mm
        # KPIs dessinés EN PREMIER (derrière le titre) — uniquement ceux activés
        for i,(lbl,val,col) in enumerate(kpis2):
            kpi_card(lbl, val, ML+(i%3)*(kW2+3*mm), y-30*mm-(i//3)*22*mm, kW2, 18*mm, col)
        # Titre PAR-DESSUS (visible devant les KPIs)
        title_txt = 'RÉCAPITULATIF FINANCIER & BILAN COMPTABLE'
        if sec.get('periodFrom') or sec.get('periodTo'):
            title_txt += f"  ({sec.get('periodFrom','')} → {sec.get('periodTo','')})"
        section_title(title_txt, y, BRAND, '💰')
        # Ajuste l'espace réservé aux KPIs selon le nombre affiché (par tranche de 3 → 1 ligne de 22mm)
        nb_rows_kpi = (len(kpis2) + 2) // 3 if kpis2 else 0
        y -= 30*mm + nb_rows_kpi * 22*mm
        # Table de répartition par type — affichée seulement si activée
        if field_on('recap', 'tab_repartition'):
            y = section_title('RÉPARTITION PAR TYPE DE TRANSACTION', y, BRANDD, '📊')
            cols_w = [50*mm, 30*mm, 50*mm, 40*mm]
            y = table_row(['Type','Nb transactions','Montant total','Moyenne'], y, cols_w, header=True)
            for i,t in enumerate(_tx_by_type):
                nb = t['nb']; vol = t['vol']; avg = vol/nb if nb else 0
                y = table_row([t['label'], str(nb), euro(vol), euro(avg)], y, cols_w, alt=i%2==1)
                if y < 20*mm: break
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('recap', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — GRAPHIQUES (section_on('graphics'))
    # ════════════════════════════════════════════════════════════════
    if section_on('graphics'):
        sec = get_section('graphics')
        _txs = filter_by_period(txs, sec)
        _t_ventes = sum(t.get('montant',0) for t in _txs if t.get('type') in ('debit','retrait','benev-retrait'))
        _tx_by_type = []
        for typ in TX_TYPES:
            txk = [t for t in _txs if t.get('type')==typ]
            if txk:
                _tx_by_type.append({'type':typ,'label':TX_LABELS.get(typ,typ),
                                    'nb':len(txk),'vol':sum(t.get('montant',0) for t in txk)})
        _resas_in_period = filter_by_period(resas, sec, 'timestamp')
        _resas_spec = [r for r in _resas_in_period if not r.get('isBenev')]
        _collected_n = len([r for r in _resas_spec if r.get('status')=='collected'])
        _taux = round(_collected_n/len(_resas_spec)*100) if _resas_spec else 0

        header_footer(page_num)
        y = START_Y
        title_txt = 'ANALYSE GRAPHIQUE DES TRANSACTIONS'
        if sec.get('periodFrom') or sec.get('periodTo'):
            title_txt += f"  ({sec.get('periodFrom','')} → {sec.get('periodTo','')})"
        y = section_title(title_txt, y, BRAND, '📈')
        # Graphiques filtrables (Lot 3)
        show_bar = field_on('graphics', 'bar_chart')
        show_pie = field_on('graphics', 'pie_chart')
        if _tx_by_type and (show_bar or show_pie):
            vals = [t['vol'] for t in _tx_by_type]
            lbls = [TX_LABELS_SHORT.get(t['type'], t['label'][:8]) for t in _tx_by_type]
            # Hauteur généreuse pour remplir l'espace entre le titre et la section
            # suivante. Les graphiques sont ancrés juste sous le titre (y), leur
            # coin bas-gauche est donc à (y - hauteur).
            chart_h = 80*mm
            if show_bar and show_pie:
                bar_chart_inline(vals, lbls, ML, y-chart_h, CW*0.48, chart_h, BRAND)
                pie_data = [t['nb'] for t in _tx_by_type]
                pie_col_x = ML + CW*0.50
                pie_col_w = CW*0.50
                pie_sz = min(chart_h, pie_col_w)
                pie_cx = pie_col_x + pie_col_w/2
                pie_chart_inline(pie_data, lbls, pie_cx - pie_sz/2, y-chart_h + (chart_h - pie_sz)/2, pie_sz)
            elif show_bar:
                bar_chart_inline(vals, lbls, ML, y-chart_h, CW, chart_h, BRAND)
            elif show_pie:
                pie_data = [t['nb'] for t in _tx_by_type]
                pie_sz = chart_h
                pie_chart_inline(pie_data, lbls, ML + CW/2 - pie_sz/2, y-chart_h, pie_sz)
            y -= (chart_h + 8*mm)
        # KPIs perfo filtrables (Lot 3)
        _nb_debits = len([t for t in _txs if t.get('type')=='debit'])
        all_perf = [
            ('kpi_taux',      'Taux retrait réservations', f'{_taux}%'),
            ('kpi_ticket',    'Ticket moyen',              euro(_t_ventes//_nb_debits if _nb_debits else 0)),
            ('kpi_solde_moy', 'Solde moyen par spectateur',euro(total_soldes//nb_spec if nb_spec else 0)),
            ('kpi_nb_spec',   'Nb spectateurs avec solde', f'{len(spec_solde)} / {nb_spec}'),
        ]
        perf = [(lbl, val) for k, lbl, val in all_perf if field_on('graphics', k)]
        if perf:
            y = section_title('INDICATEURS DE PERFORMANCE', y, BRANDD, '🎯')
            kW3 = CW/2 - 2*mm
            for i,(lbl,val) in enumerate(perf):
                kpi_card(lbl, val, ML+(i%2)*(kW3+4*mm), y-30*mm-(i//2)*22*mm, kW3, 18*mm)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('graphics', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — TOP ARTICLES (section_on('articles'))
    # ════════════════════════════════════════════════════════════════
    if section_on('articles'):
        sec = get_section('articles')
        top_n = int(sec.get('topN') or 20)
        _txs = filter_by_period(txs, sec)
        _t_ventes = sum(t.get('montant',0) for t in _txs if t.get('type') in ('debit','retrait','benev-retrait'))

        # Lot Custom A — Sélection précise des articles à inclure.
        # articleSelection peut être :
        #   - None ou absent : pas de filtre (tous les articles)
        #   - []              : aucun article (table vide)
        #   - [ids…]          : liste explicite d'IDs (correspond aux menu items)
        # Les IDs viennent du menu mais on agrège par nom (le menu peut évoluer
        # mais les transactions gardent le nom de l'article au moment de l'achat).
        # On résout donc IDs → noms via la liste menu_lst.
        art_sel = sec.get('articleSelection')
        selected_names = None  # None = pas de filtre
        if art_sel is not None and isinstance(art_sel, list):
            # Résout chaque ID en nom via le menu
            name_set = set()
            for sel_id in art_sel:
                # Cherche le menu item correspondant (par id ou par nom-fallback)
                m = next((mi for mi in menu_lst if mi.get('id') == sel_id or mi.get('nom') == sel_id), None)
                if m:
                    name_set.add(m.get('nom', ''))
                else:
                    # ID inconnu : on essaie quand même comme un nom direct
                    name_set.add(sel_id)
            selected_names = name_set

        # Lot Custom A2 — Sélection précise par catégorie.
        # categorieSelection : liste de noms de catégorie (cf. menu[i].cat)
        # Note importante : les articles vendus mais supprimés du menu n'ont
        # plus d'entrée dans menu_lst. Ils tombent donc dans la catégorie
        # "Autres" (cf. name_to_cat plus bas). Pour qu'ils restent visibles
        # par défaut, on inclut "Autres" dans les noms autorisés.
        cat_sel = sec.get('categorieSelection')
        selected_categories = None
        if cat_sel is not None and isinstance(cat_sel, list):
            selected_categories = set(cat_sel)
            # On filtre les articles dont la catégorie n'est pas dans la sélection.
            # Construction d'un set de noms d'articles correspondant à ces catégories.
            allowed_names_by_cat = set()
            for m in menu_lst:
                if m.get('cat') in selected_categories:
                    allowed_names_by_cat.add(m.get('nom', ''))
            # Si "Autres" est dans la sélection, on inclut aussi tous les noms
            # vendus mais absents du menu (articles supprimés).
            if 'Autres' in selected_categories:
                noms_menu = {m.get('nom', '') for m in menu_lst}
                for t in _txs:
                    for it in t.get('items', []):
                        nm = it.get('nom', '')
                        if nm and nm not in noms_menu:
                            allowed_names_by_cat.add(nm)
            # Intersection avec selected_names si déjà filtré par article
            if selected_names is not None:
                selected_names = selected_names & allowed_names_by_cat
            else:
                selected_names = allowed_names_by_cat

        # Mapping nom_article -> catégorie (pour les sous-totaux par cat)
        # Articles dont le nom n'a pas de cat dans menu_lst → catégorie "Autres"
        name_to_cat = {}
        for m in menu_lst:
            name_to_cat[m.get('nom', '')] = m.get('cat') or 'Autres'

        # Recalcule top_articles sur la période + filtres
        _art_map = {}
        for t in _txs:
            for i in t.get('items',[]):
                k = i.get('nom','')
                # Filtre par sélection précise si configurée
                if selected_names is not None and k not in selected_names:
                    continue
                if k not in _art_map: _art_map[k] = {'nom':k,'qty':0,'ca':0,'cat':name_to_cat.get(k, 'Autres')}
                _art_map[k]['qty'] += i.get('qty',1)
                _art_map[k]['ca']  += i.get('total',(i.get('prixUnit',0)*i.get('qty',1)))
        _top = sorted(_art_map.values(), key=lambda a: a['ca'], reverse=True)[:top_n]

        header_footer(page_num)
        y = START_Y
        title_txt = 'TOP ARTICLES VENDUS & PERFORMANCES DU MENU'
        filters_summary = []
        if sec.get('periodFrom') or sec.get('periodTo'):
            filters_summary.append(f"{sec.get('periodFrom','')} → {sec.get('periodTo','')}")
        if selected_names is not None:
            filters_summary.append(f"{len(_top)} article(s)")
        if selected_categories is not None:
            filters_summary.append(f"{len(selected_categories)} catégorie(s)")
        if filters_summary:
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, AMBER, '🍽️')
        # Graphiques conditionnels (Lot 3)
        if _top and field_on('articles', 'charts'):
            art_vals = [a['ca'] for a in _top[:8]]
            art_lbls = [a['nom'][:8] for a in _top[:8]]
            bar_chart_inline(art_vals, art_lbls, ML, y-55*mm, CW*0.55, 55*mm, AMBER)
            qty_vals = [a['qty'] for a in _top[:8]]
            bar_chart_inline(qty_vals, art_lbls, ML+CW*0.57, y-55*mm, CW*0.43, 55*mm, GREEN)
            y -= 60*mm
        # Table avec colonnes filtrables (Lot 3) — spec ordonnée par défaut
        cols_spec = [
            ('rank',  '#',          10*mm),
            ('nom',   'Article',    50*mm),
            ('qty',   'Unités',     25*mm),
            ('ca',    'CA généré',  25*mm),
            ('pct',   '% du CA',    35*mm),
            ('stock', 'Stock',      25*mm),
        ]
        headers, widths, _ = apply_fields('articles', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_enabled = tr_cfg.get('enabled')
            tr_position = tr_cfg.get('position', 'bottom') if tr_enabled else None
            tr_group_by = tr_cfg.get('groupBy') if tr_enabled else None
            tr_subtotal_label = tr_cfg.get('subtotalLabel') or 'Sous-total'

            # Pré-calcule les sommes globales pour la ligne de total (Lot Custom A)
            total_qty = sum(a['qty'] for a in _top)
            total_ca  = sum(a['ca'] for a in _top)
            sums_dict = {
                'qty':   str(total_qty),
                'ca':    euro(total_ca),
                'pct':   f"{total_ca/_t_ventes*100:.1f}%" if _t_ventes else '—',
                'stock': '',  # Stock n'a pas de sens à sommer mais on l'expose si demandé
            }
            _, total_values = build_total_row('articles', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True, color=AMBER)
            # Ligne de total en haut si position='top'
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)

            # Lot Custom A2 — Sous-totaux par catégorie
            # Si groupBy='categorie' : on trie par catégorie + on insère une
            # ligne de sous-total à chaque changement de groupe. Le tri "par CA
            # desc" est appliqué à l'intérieur de chaque groupe.
            if tr_group_by == 'categorie':
                # Re-trie : groupé par catégorie alphabétique, puis CA desc dans chaque groupe
                _top_grouped = sorted(_top, key=lambda a: (a.get('cat') or 'Autres', -a['ca']))
                current_cat = None
                cat_qty = 0
                cat_ca = 0
                global_idx = 0

                def flush_cat_subtotal(cat_name, q, ca, y_pos):
                    """Insère une ligne de sous-total pour la catégorie courante."""
                    sub_sums = {
                        'qty': str(q),
                        'ca':  euro(ca),
                        'pct': f"{ca/_t_ventes*100:.1f}%" if _t_ventes else '—',
                        'stock': '',
                    }
                    sub_label = f"{tr_subtotal_label} {cat_name}"
                    # On utilise build_total_row mais avec un label override
                    sub_sec_override = dict(sec)
                    sub_sec_override['totalRow'] = dict(tr_cfg)
                    sub_sec_override['totalRow']['label'] = sub_label
                    # Petite duplication mineure de build_total_row : on remplace
                    # juste le label, le reste est identique.
                    sum_cols = set(tr_cfg.get('columns') or [])
                    fields = sec.get('fields')
                    kept_cols = cols_spec if fields is None else [cc for cc in cols_spec if cc[0] in fields]
                    sub_values = []
                    label_placed = False
                    for col_key, _, _ in kept_cols:
                        if col_key in sum_cols:
                            sub_values.append(sub_sums.get(col_key, ''))
                            label_placed = True
                        elif not label_placed:
                            sub_values.append(sub_label if not sub_values else '')
                        else:
                            sub_values.append('')
                    if not any(sub_values):
                        sub_values[0] = sub_label
                    return table_row(sub_values, y_pos, widths, is_total=True)

                for a in _top_grouped:
                    cat = a.get('cat') or 'Autres'
                    # Changement de catégorie : flush le sous-total précédent
                    if current_cat is not None and cat != current_cat:
                        y = flush_cat_subtotal(current_cat, cat_qty, cat_ca, y)
                        cat_qty = 0; cat_ca = 0
                    current_cat = cat
                    global_idx += 1
                    mi = next((m for m in menu_lst if m.get('nom')==a['nom']), {})
                    pct = f"{a['ca']/_t_ventes*100:.1f}%" if _t_ventes else '—'
                    row_values = [f"#{global_idx}", a['nom'][:18], str(a['qty']), euro(a['ca']), pct, str(mi.get('stock','—'))]
                    _, _, filtered_vals = apply_fields('articles', cols_spec, row_values)
                    y = table_row(filtered_vals, y, widths, alt=global_idx%2==0)
                    cat_qty += a['qty']
                    cat_ca += a['ca']
                    if y < 20*mm: break
                # Flush du dernier groupe
                if current_cat is not None:
                    y = flush_cat_subtotal(current_cat, cat_qty, cat_ca, y)
            else:
                # Pas de groupement : rendu classique
                for i,a in enumerate(_top):
                    mi = next((m for m in menu_lst if m.get('nom')==a['nom']), {})
                    pct = f"{a['ca']/_t_ventes*100:.1f}%" if _t_ventes else '—'
                    row_values = [f"#{i+1}", a['nom'][:18], str(a['qty']), euro(a['ca']), pct, str(mi.get('stock','—'))]
                    _, _, filtered_vals = apply_fields('articles', cols_spec, row_values)
                    y = table_row(filtered_vals, y, widths, alt=i%2==1)
                    if y < 20*mm: break
            # Ligne de total en bas si position='bottom' (par défaut)
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('articles', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — STATS STAFF (section_on('stats'))
    # ════════════════════════════════════════════════════════════════
    if section_on('stats'):
        sec = get_section('stats')
        _txs = filter_by_period(txs, sec)
        excluded_emails = set(sec.get('staffExclude') or [])

        # Lot Custom A3 — Sélection précise de staff (par email).
        # Si staffSelection est non-null, il prend priorité sur staffExclude.
        # null/absent : pas de filtre, on respecte staffExclude.
        # []          : aucun staff (table vide).
        # [emails]    : seulement ces emails (staffExclude ignoré).
        staff_sel = sec.get('staffSelection')
        if staff_sel is not None and isinstance(staff_sel, list):
            selected_emails = set(staff_sel)
            # En mode sélection : on neutralise l'exclusion (qui devient sans effet)
            excluded_emails = set()
        else:
            selected_emails = None  # pas de filtre selection

        # Recalcule staff_stats sur la période, en appliquant les filtres
        _staff_map = {}
        for t in _txs:
            k = t.get('staff') or '—'
            if selected_emails is not None:
                if k not in selected_emails: continue
            elif k in excluded_emails:
                continue
            if k not in _staff_map: _staff_map[k] = {'email':k,'nb':0,'vol':0}
            _staff_map[k]['nb']  += 1
            _staff_map[k]['vol'] += t.get('montant',0)
        _staff_stats = sorted(_staff_map.values(), key=lambda s: s['nb'], reverse=True)[:8]

        header_footer(page_num)
        y = START_Y
        title_txt = 'STATISTIQUES PAR STAND / STAFF'
        if sec.get('periodFrom') or sec.get('periodTo'):
            title_txt += f"  ({sec.get('periodFrom','')} → {sec.get('periodTo','')})"
        if selected_emails is not None:
            title_txt += f"  ({len(selected_emails)} sélectionné{'s' if len(selected_emails)>1 else ''})"
        elif excluded_emails:
            title_txt += f"  ({len(excluded_emails)} exclu{'s' if len(excluded_emails)>1 else ''})"
        y = section_title(title_txt, y, PURPLE, '👤')
        # Graphiques conditionnels (Lot 3)
        if _staff_stats and field_on('stats', 'charts'):
            s_vals = [s['nb'] for s in _staff_stats]
            s_lbls = [s['email'][:8] for s in _staff_stats]
            bar_chart_inline(s_vals, s_lbls, ML, y-50*mm, CW*0.55, 50*mm, PURPLE)
            pie_sz = 58*mm
            pie_col_x = ML + CW*0.57
            pie_col_w = CW*0.43
            pie_chart_inline([s['vol'] for s in _staff_stats], s_lbls,
                             pie_col_x + (pie_col_w - pie_sz)/2, y-54*mm, pie_sz)
            y -= 60*mm
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('email',   'Staff (email)', 50*mm),
            ('nb',      'Nb tx',         25*mm),
            ('volume',  'Volume',        40*mm),
            ('credits', 'Crédits',       30*mm),
            ('debits',  'Débits',        30*mm),
        ]
        headers, widths, _ = apply_fields('stats', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_position = tr_cfg.get('position', 'bottom') if tr_cfg.get('enabled') else None
            # Pré-calcule les sommes (Lot Custom A)
            total_nb = sum(s.get('nb', 0) for s in _staff_stats)
            total_vol = sum(s.get('vol', 0) for s in _staff_stats)
            total_cred = sum(1 for t in _txs if t.get('type')=='credit' and any(s['email']==t.get('staff') for s in _staff_stats))
            total_deb  = sum(1 for t in _txs if t.get('type')=='debit'  and any(s['email']==t.get('staff') for s in _staff_stats))
            sums_dict = { 'nb': str(total_nb), 'volume': euro(total_vol), 'credits': str(total_cred), 'debits': str(total_deb) }
            _, total_values = build_total_row('stats', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True, color=PURPLE)
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)
            for i,s in enumerate(_staff_stats):
                cred = sum(1 for t in _txs if t.get('staff')==s['email'] and t.get('type')=='credit')
                deb  = sum(1 for t in _txs if t.get('staff')==s['email'] and t.get('type')=='debit')
                row_values = [s['email'][:20], str(s['nb']), euro(s['vol']), str(cred), str(deb)]
                _, _, fvals = apply_fields('stats', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 20*mm: break
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('stats', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — TRANSACTIONS (section_on('transactions'))
    # ════════════════════════════════════════════════════════════════
    if section_on('transactions'):
        sec = get_section('transactions')
        _txs = filter_by_period(txs, sec)
        # Filtre types : si liste vide, garde tout
        types_filter = sec.get('txTypes') or []
        if types_filter:
            _txs = [t for t in _txs if t.get('type') in types_filter]
        # Filtre montant
        min_c = eur_to_cent(sec.get('minEur'))
        max_c = eur_to_cent(sec.get('maxEur'))
        if min_c is not None:
            _txs = [t for t in _txs if (t.get('montant') or 0) >= min_c]
        if max_c is not None:
            _txs = [t for t in _txs if (t.get('montant') or 0) <= max_c]

        header_footer(page_num)
        y = START_Y
        title_txt = 'TOUTES LES TRANSACTIONS — TRAÇABILITÉ COMPLÈTE'
        filters_summary = []
        if sec.get('periodFrom') or sec.get('periodTo'):
            filters_summary.append(f"{sec.get('periodFrom','')} → {sec.get('periodTo','')}")
        if types_filter:
            filters_summary.append(f"{len(types_filter)} type(s)")
        if min_c is not None or max_c is not None:
            filters_summary.append('montant filtré')
        if filters_summary:
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, BRAND, '💳')
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('date',    'Date',         22*mm),
            ('heure',   'Heure',        16*mm),
            ('type',    'Type',         28*mm),
            ('who',     'Bénéficiaire', 30*mm),
            ('label',   'Libellé',      40*mm),
            ('montant', 'Montant',      24*mm),
            ('staff',   'Staff',        20*mm),
        ]
        headers, widths, _ = apply_fields('transactions', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_position = tr_cfg.get('position', 'bottom') if tr_cfg.get('enabled') else None
            sorted_txs = sorted(_txs, key=lambda t: t.get('timestamp',''), reverse=True)
            # Somme du montant total (seule colonne sommable de cette section)
            total_montant = sum(t.get('montant', 0) for t in sorted_txs)
            sums_dict = { 'montant': euro(total_montant) }
            _, total_values = build_total_row('transactions', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True)
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)
            if not sorted_txs:
                # Ligne "vide" — on remplit avec le même nombre de colonnes que headers
                empty_row = ['—'] * len(headers)
                if len(headers) >= 3:
                    empty_row[2] = 'Aucune transaction'
                y = table_row(empty_row, y, widths, alt=False)
            for i,t in enumerate(sorted_txs):
                who = (t.get('benevoleNom') or t.get('specNom') or '—')[:15]
                mt_str = euro(t.get('montant',0))
                row_values = [t.get('date','—'), t.get('heure','—'),
                              TX_LABELS.get(t.get('type',''),t.get('type','—'))[:14],
                              who, (t.get('label','—'))[:20], mt_str, (t.get('staff','—'))[:12]]
                _, _, fvals = apply_fields('transactions', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 12*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('transactions', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — SPECTATEURS (section_on('spectateurs'))
    # ════════════════════════════════════════════════════════════════
    if section_on('spectateurs'):
        sec = get_section('spectateurs')
        min_s = eur_to_cent(sec.get('soldeMinEur'))
        max_s = eur_to_cent(sec.get('soldeMaxEur'))
        _specs = specs[:]
        if min_s is not None:
            _specs = [s for s in _specs if (s.get('solde',0) or 0) >= min_s]
        if max_s is not None:
            _specs = [s for s in _specs if (s.get('solde',0) or 0) <= max_s]
        # Lot Custom A2 — Sélection précise de spectateurs (par id FY-XXXX)
        spec_sel = sec.get('spectateurSelection')
        if spec_sel is not None and isinstance(spec_sel, list):
            sel_set = set(spec_sel)
            _specs = [s for s in _specs if s.get('id') in sel_set]
        # Tri selon sortBy
        sort_by = sec.get('sortBy') or 'solde'
        if sort_by == 'nom':
            _specs = sorted(_specs, key=lambda s: (s.get('nom') or '').lower())
        elif sort_by == 'tx':
            _specs = sorted(_specs,
                key=lambda s: len([t for t in txs if t.get('specId')==s.get('id')]),
                reverse=True)
        else:  # solde par défaut
            _specs = sorted(_specs, key=lambda s: s.get('solde',0) or 0, reverse=True)

        header_footer(page_num)
        y = START_Y
        title_txt = 'SPECTATEURS & SOLDES NON CONSOMMÉS'
        filters_summary = []
        if min_s is not None or max_s is not None:
            filters_summary.append('solde filtré')
        if sort_by != 'solde':
            filters_summary.append(f'tri: {sort_by}')
        if spec_sel is not None:
            filters_summary.append(f'{len(_specs)} sélectionné(s)')
        if filters_summary:
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, GREEN, '👥')
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('id',       'ID QR',          40*mm),
            ('nom',      'Nom',            40*mm),
            ('solde',    'Solde restant',  30*mm),
            ('nb_tx',    'Nb tx',          25*mm),
            ('recharge', 'Total rechargé', 30*mm),
            ('depense',  'Total dépensé',  30*mm),
        ]
        headers, widths, _ = apply_fields('spectateurs', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_position = tr_cfg.get('position', 'bottom') if tr_cfg.get('enabled') else None
            # Pré-calcule les sommes (Lot Custom A)
            total_solde = sum((s.get('solde', 0) or 0) for s in _specs)
            total_nb_tx = sum(len([t for t in txs if t.get('specId')==s.get('id')]) for s in _specs)
            total_recharge = sum(sum(t.get('montant',0) for t in txs if t.get('specId')==s.get('id') and t.get('type')=='credit') for s in _specs)
            total_depense = sum(sum(t.get('montant',0) for t in txs if t.get('specId')==s.get('id') and t.get('type') in ('debit','retrait')) for s in _specs)
            sums_dict = {
                'solde': euro(total_solde), 'nb_tx': str(total_nb_tx),
                'recharge': euro(total_recharge), 'depense': euro(total_depense),
            }
            _, total_values = build_total_row('spectateurs', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True, color=GREEN)
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)
            if not _specs:
                empty_row = ['—'] * len(headers)
                if len(headers) >= 2: empty_row[1] = 'Aucun spectateur'
                y = table_row(empty_row, y, widths, alt=False)
            for i,s in enumerate(_specs):
                my_tx = [t for t in txs if t.get('specId')==s.get('id')]
                cr  = sum(t.get('montant',0) for t in my_tx if t.get('type')=='credit')
                dep = sum(t.get('montant',0) for t in my_tx if t.get('type') in ('debit','retrait'))
                row_values = [s.get('id','—')[:18], s.get('nom','—')[:18], euro(s.get('solde',0)),
                              str(len(my_tx)), euro(cr), euro(dep)]
                _, _, fvals = apply_fields('spectateurs', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 12*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('spectateurs', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — RÉSERVATIONS (section_on('reservations'))
    # ════════════════════════════════════════════════════════════════
    if section_on('reservations'):
        sec = get_section('reservations')
        statuses_filter = sec.get('resaStatuses') or []
        type_filter = sec.get('resaType') or 'all'
        _resas = resas[:]
        if statuses_filter:
            _resas = [r for r in _resas if r.get('status') in statuses_filter]
        if type_filter == 'spec':
            _resas = [r for r in _resas if not r.get('isBenev')]
        elif type_filter == 'benev':
            _resas = [r for r in _resas if r.get('isBenev')]

        header_footer(page_num)
        y = START_Y
        title_txt = 'RÉSERVATIONS — TOUS STATUTS'
        filters_summary = []
        if statuses_filter:
            filters_summary.append(f"{len(statuses_filter)} statut(s)")
        if type_filter != 'all':
            filters_summary.append(type_filter)
        if filters_summary:
            title_txt = title_txt.replace('TOUS STATUTS', 'FILTRÉES')
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, BRANDD, '📋')
        # Recalcule les KPIs sur les résas filtrées
        _spec_resas = [r for r in _resas if not r.get('isBenev')]
        _collected_n = len([r for r in _spec_resas if r.get('status')=='collected'])
        # KPIs en haut (Lot 3 : conditionnel)
        if field_on('reservations', 'kpis'):
            kR = CW/4 - 3*mm
            resa_kpis = [
                ('Total résa',  str(len(_resas)), BRANDD),
                ('Retirées',    str(_collected_n), GREEN),
                ('En attente',  str(len([r for r in _resas if r.get('status')=='pending'])), AMBER),
                ('Annulées',    str(len([r for r in _resas if r.get('status')=='cancelled'])), RED),
            ]
            for i,(lbl,val,col) in enumerate(resa_kpis):
                kpi_card(lbl, val, ML+i*(kR+3*mm), y, kR, 14*mm, col)
            y -= 18*mm
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('code',   'Code',         22*mm),
            ('who',    'Bénéficiaire', 32*mm),
            ('type',   'Type',         20*mm),
            ('items',  'Articles',     40*mm),
            ('total',  'Total',        22*mm),
            ('status', 'Statut',       20*mm),
            ('date',   'Date',         20*mm),
        ]
        headers, widths, _ = apply_fields('reservations', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_position = tr_cfg.get('position', 'bottom') if tr_cfg.get('enabled') else None
            # Pré-calcule la somme du total des résas
            total_total = sum((r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))) for r in _resas)
            sums_dict = { 'total': euro(total_total) }
            _, total_values = build_total_row('reservations', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True)
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)
            if not _resas:
                empty_row = ['—'] * len(headers)
                if len(headers) >= 2: empty_row[1] = 'Aucune réservation'
                y = table_row(empty_row, y, widths, alt=False)
            for i,r in enumerate(sorted(_resas, key=lambda r: r.get('date',''), reverse=True)):
                items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
                mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
                typ = 'Bénévole' if r.get('isBenev') else 'Spectateur'
                row_values = [r.get('code','—'),
                              (r.get('benevoleNom') or r.get('specNom') or '—')[:15],
                              typ, items, euro(mt),
                              STATUS_L.get(r.get('status',''),'—'),
                              r.get('date','—')]
                _, _, fvals = apply_fields('reservations', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 12*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('reservations', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — BÉNÉVOLES (section_on('benevoles'))
    # ════════════════════════════════════════════════════════════════
    if section_on('benevoles'):
        sec = get_section('benevoles')
        _benev_r = filter_by_period(benev_r, sec, 'timestamp')

        # Lot Custom A2 — Sélection précise de bénévoles (par benevoleId)
        benev_sel = sec.get('benevoleSelection')
        if benev_sel is not None and isinstance(benev_sel, list):
            sel_set = set(benev_sel)
            _benev_r = [r for r in _benev_r if r.get('benevoleId') in sel_set]

        header_footer(page_num)
        y = START_Y
        title_txt = 'BÉNÉVOLES & CONSOMMATIONS PRISES EN CHARGE'
        filters_summary = []
        if sec.get('periodFrom') or sec.get('periodTo'):
            filters_summary.append(f"{sec.get('periodFrom','')} → {sec.get('periodTo','')}")
        if benev_sel is not None:
            filters_summary.append(f"{len(set(r.get('benevoleId') for r in _benev_r if r.get('benevoleId')))} bénévole(s) sélectionné(s)")
        if filters_summary:
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, PURPLE, '🙋')
        nb_benev_actifs = len(set(r.get('benevoleId') for r in _benev_r if r.get('benevoleId')))
        _cout_benev = sum(sum((i.get('prix',0)*i.get('qty',1)) for i in r.get('items',[])) for r in _benev_r)
        # KPIs conditionnels (Lot 3)
        if field_on('benevoles', 'kpis'):
            kpi_card('Bénévoles actifs', str(nb_benev_actifs), ML, y, CW/4-3*mm, 14*mm, PURPLE)
            kpi_card('Résa retirées', str(len(_benev_r)), ML+(CW/4-3*mm)+4*mm, y, CW/4-3*mm, 14*mm, BRANDD)
            kpi_card('Coût total pris en charge', euro(_cout_benev), ML+2*(CW/4-3*mm)+8*mm, y, CW/2-5*mm, 14*mm, RED)
            y -= 18*mm
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('nom',   'Bénévole',  30*mm),
            ('code',  'Code résa', 30*mm),
            ('type',  'Type',      25*mm),
            ('total', 'Total',     25*mm),
            ('items', 'Articles',  40*mm),
            ('date',  'Date',      22*mm),
        ]
        headers, widths, _ = apply_fields('benevoles', cols_spec, [None]*len(cols_spec))
        if headers:
            tr_cfg = sec.get('totalRow') or {}
            tr_position = tr_cfg.get('position', 'bottom') if tr_cfg.get('enabled') else None
            total_total = sum((r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))) for r in _benev_r)
            sums_dict = { 'total': euro(total_total) }
            _, total_values = build_total_row('benevoles', cols_spec, sums_dict)

            y = table_row(headers, y, widths, header=True, color=PURPLE)
            if total_values and tr_position == 'top':
                y = table_row(total_values, y, widths, is_total=True)
            if not _benev_r:
                empty_row = ['—'] * len(headers)
                if len(headers) >= 2: empty_row[1] = 'Aucune résa bénévole'
                y = table_row(empty_row, y, widths, alt=False)
            for i,r in enumerate(sorted(_benev_r, key=lambda r: r.get('date',''), reverse=True)):
                items = ', '.join(f"{it.get('nom','')} x{it.get('qty',1)}" for it in r.get('items',[]))[:25]
                mt = r.get('total',0) or sum((it.get('prix',0)*it.get('qty',1)) for it in r.get('items',[]))
                row_values = [(r.get('benevoleNom','—'))[:14], r.get('code','—'),
                              'Résa bénévole', euro(mt), items, r.get('date','—')]
                _, _, fvals = apply_fields('benevoles', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 12*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
            if total_values and tr_position == 'bottom':
                y = table_row(total_values, y, widths, is_total=True)
        c.showPage()
        page_num += 1
    page_num = render_custom_pages_at('benevoles', page_num)

    # ════════════════════════════════════════════════════════════════
    # PAGE — JOURNAL D'AUDIT (section_on('audit'))
    # ════════════════════════════════════════════════════════════════
    if section_on('audit'):
        sec = get_section('audit')
        _audit = filter_by_period(audit_lst, sec, 'timestamp')
        actions_filter = sec.get('auditActions') or []
        user_types_filter = sec.get('auditUserTypes') or []
        if actions_filter:
            _audit = [l for l in _audit if l.get('action') in actions_filter]
        if user_types_filter:
            _audit = [l for l in _audit if l.get('userType') in user_types_filter]

        header_footer(page_num)
        y = START_Y
        title_txt = "JOURNAL D'AUDIT COMPLET"
        filters_summary = []
        if sec.get('periodFrom') or sec.get('periodTo'):
            filters_summary.append(f"{sec.get('periodFrom','')} → {sec.get('periodTo','')}")
        if actions_filter:
            filters_summary.append(f"{len(actions_filter)} action(s)")
        if user_types_filter:
            filters_summary.append(f"{len(user_types_filter)} type(s) user")
        if filters_summary:
            title_txt += f"  ({', '.join(filters_summary)})"
        y = section_title(title_txt, y, RED, '📋')
        # Table avec colonnes filtrables (Lot 3)
        cols_spec = [
            ('date',     'Date',      22*mm),
            ('heure',    'Heure',     18*mm),
            ('action',   'Action',    28*mm),
            ('userType', 'Type user', 22*mm),
            ('label',    'Libellé',   50*mm),
            ('staff',    'Staff',     30*mm),
        ]
        headers, widths, _ = apply_fields('audit', cols_spec, [None]*len(cols_spec))
        if headers:
            y = table_row(headers, y, widths, header=True, color=RED)
            if not _audit:
                empty_row = ['—'] * len(headers)
                if len(headers) >= 3: empty_row[2] = 'Aucun log'
                y = table_row(empty_row, y, widths, alt=False)
            for i,l in enumerate(sorted(_audit, key=lambda l: l.get('timestamp',''), reverse=True)):
                ts = l.get('timestamp','')
                try:
                    d = datetime.fromisoformat(ts)
                    ds = d.strftime('%d/%m/%Y'); hs = d.strftime('%H:%M')
                except:
                    ds = l.get('date','—'); hs = l.get('heure','—')
                row_values = [ds, hs, (l.get('action','—'))[:14],
                              l.get('userType','—')[:10],
                              (l.get('label','—'))[:28],
                              (l.get('staff','—'))[:14]]
                _, _, fvals = apply_fields('audit', cols_spec, row_values)
                y = table_row(fvals, y, widths, alt=i%2==1)
                if y < 12*mm:
                    c.showPage(); page_num += 1; header_footer(page_num); y = START_Y
        c.showPage()
        page_num += 1
    # Lot Custom B — pages custom positionnées à la fin du rapport
    page_num = render_custom_pages_at('end', page_num)
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
