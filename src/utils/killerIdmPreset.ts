export const KILLER_IDM_PRESET = `// Fusion de deux indicateurs personnels — usage privé
// Indicateur 1 (Macro/Carte) : fmfm300
// Indicateur 2 (Micro/Sniper) : Inducement Engine Liquidity Targets
// Couche ajoutée : Filtre de confluence Macro -> Micro + Compteur de statistiques

//@version=6
indicator("Killer + IDM", overlay=true, max_lines_count=500, max_bars_back=5000, max_boxes_count=500, max_labels_count=500)

// ─── Garde-fou chart type (provient de IDM Pro) ───
if syminfo.type == "heikinashi" or syminfo.type == "renko" or syminfo.type == "linebreak" or syminfo.type == "kagi" or syminfo.type == "pointfigure"
    runtime.error("Graphique non-standard. Utilisez des chandeliers japonais classiques.")

// ============================================================================================
// ============================  PARTIE 1 — MACRO (ex-fmfm300)  =============================
// ============================================================================================

m_atrPeriod   = input.int(10, "ATR Period", minval=1, group="⚙️ M · Supertrend")
m_factor      = input.float(3.0, "Factor", minval=0.1, step=0.1, group="⚙️ M · Supertrend")
m_ema20Length = input.int(20, "EMA 20 Length", minval=1, group="⚙️ M · Supertrend")

m_maType            = input.string("EMA", "Type de moyenne", options=["EMA", "SMA"], group="⚙️ M · Braid Filter")
m_Period1           = input.int(3,  "Première période",  group="⚙️ M · Braid Filter")
m_Period2           = input.int(7,  "Deuxième période", group="⚙️ M · Braid Filter")
m_Period3           = input.int(14, "Troisième période", group="⚙️ M · Braid Filter")
m_PipsMinSepPercent = input.int(40, "Séparation minimale % (selon ATR)", group="⚙️ M · Braid Filter")
m_showCombinedLabel = input.bool(true, "Afficher le label de confluence Macro", group="⚙️ M · Braid Filter")

m_lookBack   = input.int(100, "Calculated Bars", group="⚙️ M · HeatMap")
m_displPf    = input.bool(true, "Profile", group="⚙️ M · HeatMap")
m_bins       = input.int(50, "Resolution", group="⚙️ M · HeatMap")
m_resolution = 100
color m_sellColor = input.color(color.blue, "Sell Liquidity", group="⚙️ M · HeatMap")
color m_buyColor  = input.color(color.lime, "Buy Liquidity",  group="⚙️ M · HeatMap")
bool  m_poc       = input.bool(true, "", inline="maxp", group="⚙️ M · HeatMap")
color m_maxColor  = input.color(color.orange, "Max Point Liquidity", inline="maxp", group="⚙️ M · HeatMap")

m_pvtLength = input.int(20, "Pivot Length", minval=1, group="⚙️ M · Pivot")

sdLength2  = input.int(14, "Longueur Offre/Demande", group="⚙️ M · Indicateur secondaire")
rsi2Upper  = input.int(55, "Seuil RSI supérieur", minval=1, maxval=100, group="⚙️ M · Indicateur secondaire")
rsi2Lower  = input.int(45, "Seuil RSI inférieur", minval=1, maxval=100, group="⚙️ M · Indicateur secondaire")
tblSize2   = input.string("Normal", "Taille du texte",
             options=["Tiny", "Small", "Normal", "Large"],
             group="⚙️ M · Indicateur secondaire")

getSize(s) =>
    s == "Tiny" ? size.tiny : s == "Small" ? size.small : s == "Normal" ? size.normal : size.large

tSize2 = getSize(tblSize2)

formatBigNum(val) =>
    if val >= 1000000000
        str.tostring(val / 1000000000, "#.##") + "B"
    else if val >= 1000000
        str.tostring(val / 1000000, "#.##") + "M"
    else if val >= 1000
        str.tostring(val / 1000, "#.##") + "K"
    else
        str.tostring(val, "#")

demandPressure2 = close > open ? (close - open) * volume : 0.0
supplyPressure2 = close < open ? (open - close) * volume : 0.0
avgDemand2      = ta.sma(demandPressure2, sdLength2)
avgSupply2      = ta.sma(supplyPressure2, sdLength2)
totalPressure2  = avgDemand2 + avgSupply2
demandPerc2     = totalPressure2 > 0 ? (avgDemand2 / totalPressure2) * 100 : 50.0
supplyPerc2     = totalPressure2 > 0 ? (avgSupply2 / totalPressure2) * 100 : 50.0
rsi2            = ta.rsi(close, 14)
flowText        = close > open ? "🟢" : close < open ? "🔴" : "⚪"

// ── Supertrend ──
[m_supertrend, m_direction] = ta.supertrend(m_factor, m_atrPeriod)
m_bull  = m_direction < 0
m_ema20 = ta.ema(close, m_ema20Length)

// ── Braid Filter ──
m_ma(type, src_ma, len) => type == "SMA" ? ta.sma(src_ma, len) : ta.ema(src_ma, len)
m_ma1 = m_ma(m_maType, close, m_Period1)
m_ma2 = m_ma(m_maType, open,  m_Period2)
m_ma3 = m_ma(m_maType, close, m_Period3)

m_dif    = math.max(math.max(m_ma1,m_ma2),m_ma3) - math.min(math.min(m_ma1,m_ma2),m_ma3)
m_filter = ta.atr(14) * m_PipsMinSepPercent / 100

m_BraidColor = m_ma1 > m_ma2 and m_dif > m_filter ? color.green :
               m_ma2 > m_ma1 and m_dif > m_filter ? color.red : color.gray

m_isCall     = m_BraidColor == color.green
m_isPut      = m_BraidColor == color.red
m_isSideways = not m_isCall and not m_isPut

// combinedText
m_combinedText  = m_bull and m_isCall ? "Haussier" : not m_bull and m_isPut ? "Baissier" : not m_bull and m_isSideways ? "Range baissier" : m_bull and m_isSideways ? "Range haussier" : "Attention"
m_combinedColor = m_bull and m_isCall ? color.new(color.green, 40) : not m_bull and m_isPut ? color.new(color.red, 40) : not m_bull and m_isSideways ? color.new(color.red, 60) : m_bull and m_isSideways ? color.new(color.green, 60) : color.new(color.yellow, 40)

// Booléens de confluence dérivés du Macro
m_macroBullish = m_bull and m_isCall
m_macroBearish = not m_bull and m_isPut

plot(m_ema20, "EMA 20", color=color.blue, linewidth=1)

// ── Label de confluence Macro ──
var label m_combinedLbl = na
if m_showCombinedLabel and barstate.islast
    label.delete(m_combinedLbl)
    m_combinedLbl := label.new(bar_index, low - (ta.atr(14) * 2), m_combinedText,
         style=label.style_label_up, color=m_combinedColor, textcolor=color.white, size=size.normal)

var label m_bullLabel = na
var label m_bearLabel = na

if m_bull and not m_bull[1]
    if not na(m_bearLabel)
        label.delete(m_bearLabel)
    m_bullLabel := label.new(bar_index, m_supertrend, "Positif",
                           style=label.style_label_up,
                           color=color.new(color.green, 80),
                           textcolor=color.green,
                           size=size.normal)

if not m_bull and m_bull[1]
    if not na(m_bullLabel)
        label.delete(m_bullLabel)
    m_bearLabel := label.new(bar_index, m_supertrend, "Négatif",
                           style=label.style_label_down,
                           color=color.new(color.red, 80),
                           textcolor=color.red,
                           size=size.normal)

m_noColor  = #00000000
m_pvtHigh = ta.pivothigh(m_pvtLength, m_pvtLength)
m_pvtLow  = ta.pivotlow(m_pvtLength, m_pvtLength)

var label m_lastHigh     = na
var label m_lastLow      = na
var label m_lastHighTemp = na
var label m_lastLowTemp  = na

m_pvtLengthTemp = 3
m_pvtHighTemp   = ta.pivothigh(m_pvtLengthTemp, m_pvtLengthTemp)
m_pvtLowTemp    = ta.pivotlow(m_pvtLengthTemp, m_pvtLengthTemp)

var float m_pvtHigh1Temp = 0.
var float m_pvtLow1Temp  = 0.

if not na(m_pvtHigh)
    label.delete(m_lastHigh)
    label.delete(m_lastHighTemp)
    m_lastHigh := label.new(bar_index[m_pvtLength], m_pvtHigh, "▼", xloc.bar_index, yloc.price, m_noColor, label.style_label_down, #e8bcbc, size.normal, text.align_center, "Pivot Haut · " + str.tostring(m_pvtHigh, format.mintick))

if not na(m_pvtLow)
    label.delete(m_lastLow)
    label.delete(m_lastLowTemp)
    m_lastLow := label.new(bar_index[m_pvtLength], m_pvtLow, "▲", xloc.bar_index, yloc.price, m_noColor, label.style_label_up, #b3c9f5, size.normal, text.align_center, "Pivot Bas · " + str.tostring(m_pvtLow, format.mintick))

if not na(m_pvtHighTemp)
    if m_pvtHighTemp > m_pvtHigh1Temp
        label.delete(m_lastHighTemp)
        m_lastHighTemp := label.new(bar_index[m_pvtLengthTemp], m_pvtHighTemp, "●\n▼", xloc.bar_index, yloc.price, m_noColor, label.style_label_down, #284aa9, size.normal, text.align_center, "Pivot Haut Temporaire · " + str.tostring(m_pvtHighTemp, format.mintick) + "\n⚠ Sujet à repaint")
    m_pvtHigh1Temp := m_pvtHighTemp

if high > m_pvtHigh1Temp
    label.delete(m_lastHighTemp)

if not na(m_pvtLowTemp)
    if m_pvtLowTemp < m_pvtLow1Temp
        label.delete(m_lastLowTemp)
        m_lastLowTemp := label.new(bar_index[m_pvtLengthTemp], m_pvtLowTemp, "▲\n●", xloc.bar_index, yloc.price, m_noColor, label.style_label_up, #284aa9, size.normal, text.align_center, "Pivot Bas Temporaire · " + str.tostring(m_pvtLowTemp, format.mintick) + "\n⚠ Sujet à repaint")
    m_pvtLow1Temp := m_pvtLowTemp

if low < m_pvtLow1Temp
    label.delete(m_lastLowTemp)

var m_boxes2      = array.new<box>()
var m_labels2     = array.new<label>()
var m_lines2      = array.new<line>()
var m_volume_bins = array.new<float>(m_bins, 0.)
m_h_l             = array.new<float>()

type m_pivotType
    float value
    int   index
    float volume_
    float vol
    bool  isLower

var m_pivots = array.new<m_pivotType>()

m_h2 = ta.highest(2)
m_l2 = ta.lowest(2)

m_volumeArr = array.new_float(m_lookBack)
m_vol2      = math.sum(volume, 10)

for i = 0 to m_lookBack-1
    m_volumeArr.set(i, m_vol2[i])

m_nVol   = m_vol2 / m_volumeArr.max() * 100
m_atr2   = ta.atr(5) / 50
m_offset = ta.highest(m_atr2 * m_nVol, m_lookBack)

for i = 0 to m_lookBack-1
    m_h_l.push(high[i]+m_offset[i])
    m_h_l.push(low[i]-m_offset[i])

if last_bar_index - bar_index < m_lookBack
    m_top    = m_h_l.max()
    m_bot    = m_h_l.min()
    m_step2  = (m_top-m_bot)/m_resolution
    m_level1 = high + m_atr2 * m_nVol
    m_level2 = low  - m_atr2 * m_nVol

    if m_h2 == high
        for i = 0 to m_resolution - 1
            m_lower = m_bot + m_step2 * i
            m_mid   = m_lower + m_step2/2
            if math.abs(m_level1 - m_mid) <= m_step2
                m_pivots.push(m_pivotType.new(m_mid, bar_index, m_nVol, m_vol2, false))

    if m_l2 == low
        for i = 0 to m_resolution - 1
            m_lower = m_bot + m_step2 * i
            m_mid   = m_lower + m_step2/2
            if math.abs(m_level2 - m_mid) <= m_step2
                m_pivots.push(m_pivotType.new(m_mid - m_atr2 * m_nVol, bar_index, m_nVol, m_vol2, true))

    if m_pivots.size() > 0
        for p in m_pivots
            y     = p.value
            isLow = p.isLower
            if isLow and low < y
                m_pivots.remove(m_pivots.indexof(p))
            if not isLow and high > y
                m_pivots.remove(m_pivots.indexof(p))

var float m_sMin = 100.0
var float m_sMax = 15000000000.0

var float m_pocVol      = 0.0
var float m_maxBuyVol2  = 0.0
var float m_maxSellVol2 = 0.0

if barstate.islast

    if m_lines2.size() > 0
        for ln in m_lines2
            ln.delete()

    for b in m_boxes2
        b.delete()
    m_boxes2.clear()

    for lbl in m_labels2
        lbl.delete()
    m_labels2.clear()

    m_step3 = (m_h_l.max() - m_h_l.min()) / m_bins

    for j = 0 to m_bins-1
        m_volume_bins.set(j, 0)

    if m_pivots.size() > 0
        for i = 0 to m_pivots.size() - 1
            m_lvl    = m_pivots.get(i)
            m_vol_   = m_lvl.vol
            m_line_y = m_lvl.value
            for j = 0 to m_bins-1
                m_lower = m_h_l.min() + m_step3 * j
                m_mid   = m_lower + m_step3/2
                m_upper = m_lower + m_step3
                if math.abs(m_line_y-m_mid) < m_step3
                    m_volume_bins.set(j, m_volume_bins.get(j) + m_vol_)

        m_maxBuyVol2  := 0.0
        m_maxSellVol2 := 0.0
        m_maxBuyIdx   = -1
        m_maxSellIdx  = -1

        for j = 0 to m_bins-1
            m_lower = m_h_l.min() + m_step3 * j
            m_mid = m_lower + m_step3/2
            m_voll = m_volume_bins.get(j)
            if close > m_mid
                if m_voll > m_maxBuyVol2
                    m_maxBuyVol2 := m_voll
                    m_maxBuyIdx := j
            else
                if m_voll > m_maxSellVol2
                    m_maxSellVol2 := m_voll
                    m_maxSellIdx := j

        m_pocVol := m_volume_bins.max()

        for j = 0 to m_bins-1
            m_lower    = m_h_l.min() + m_step3 * j
            m_upper    = m_lower + m_step3
            m_mid      = m_lower + m_step3/2
            m_voll     = m_volume_bins.get(j)
            m_valueVol = m_voll / m_volume_bins.max() * 50
            m_col      = close > m_mid ? m_buyColor : m_sellColor
            m_m_col    = color.from_gradient(m_voll, m_volume_bins.min(), m_volume_bins.max(), color.new(m_col, 80), color.new(m_col, 0))
            m_m_col1   = color.from_gradient(m_voll, m_volume_bins.min(), m_volume_bins.max(), color.new(m_col, 50), color.new(m_col, 0))

            m_isBuyBin    = close > m_mid
            m_isStrongest = (m_isBuyBin and j == m_maxBuyIdx) or (not m_isBuyBin and j == m_maxSellIdx)
            m_isMaxPoc    = m_voll == m_volume_bins.max() and m_poc

            if not (close < m_upper and close > m_lower)
                if m_displPf and (m_valueVol != 0)
                    m_boxes2.push(box.new(bar_index+20, m_upper, bar_index+20+int(m_valueVol), m_lower, bgcolor=m_voll == m_volume_bins.max() and m_poc ? m_maxColor : m_m_col, border_color=chart.bg_color, text=m_voll > m_volume_bins.avg() ? str.tostring(m_voll, format.volume) : "", text_halign=text.align_left))
                    m_boxes2.push(box.new(bar_index+20, m_upper, bar_index+5, m_lower, text=str.tostring(m_valueVol*2, format.percent), bgcolor=color(na), border_color=color(na), text_color=m_voll == m_volume_bins.max() ? m_maxColor : m_m_col1))

                var m_start = 0
                m_isLower = close > m_mid

                for i = 0 to m_lookBack - 1
                    if m_isLower
                        if low[i] < m_mid
                            m_start := bar_index - i
                            break
                        if i == m_lookBack - 1
                            m_start := bar_index - i
                            break
                    else
                        if high[i] > m_mid
                            m_start := bar_index - i
                            break
                        if i == m_lookBack - 1
                            m_start := bar_index - i
                            break

                m_lineColor = m_voll == m_volume_bins.max() and m_poc ? m_maxColor : color.from_gradient(m_valueVol, 0, 50, color(na), m_isLower ? color.new(m_buyColor, 30) : color.new(m_sellColor, 30))

                if m_isStrongest or m_isMaxPoc
                    m_lines2.push(line.new(m_start+3, m_mid, bar_index+5, m_mid, width=int(m_valueVol/5), color=m_lineColor))

    bgColorRSI2    = rsi2 > rsi2Upper ? color.new(color.green, 20) : rsi2 < rsi2Lower ? color.new(color.red, 20) : color.new(color.gray, 40)
    bgColorDemand2 = demandPerc2 > 60 ? color.new(color.green, 20) : demandPerc2 > 50 ? color.new(color.green, 60) : color.new(color.gray, 40)
    bgColorSupply2 = supplyPerc2 > 60 ? color.new(color.red,   20) : supplyPerc2 > 50 ? color.new(color.red,   60) : color.new(color.gray, 40)

    buyBgColor  = m_bull ? color.new(#23da3c, 40) : color.new(color.black, 20)
    sellBgColor = m_bull ? color.new(color.black, 20) : color.new(#ee1c1c, 40)

// ─── Data Table Settings ──────────────────────────────────────────────────────
var G4 = "Data Table"
dtbChk   = input.bool(true, "Activer le tableau de volume directionnel ?", group = G4)
dtbLoc   = input.string("top_left", "Position",
           ["top_right","middle_right","bottom_right","top_center","middle_center",
            "bottom_center","top_left","middle_left","bottom_left"], group = G4)
dtbBgClr = input.color(color.new(color.black, 40), "BG", group = G4)
lookback = input.int(20, "Nombre de bougies à calculer", minval = 1, maxval = 200, group = G4)

formatVolume(float vol) =>
    if na(vol) or vol == 0
        "0"
    else if vol >= 1000000000
        str.tostring(math.round(vol / 1000000000, 2)) + "B"
    else if vol >= 1000000
        str.tostring(math.round(vol / 1000000, 2)) + "M"
    else if vol >= 1000
        str.tostring(math.round(vol / 1000, 2)) + "K"
    else
        str.tostring(math.round(vol, 2))

calcBotCol(string tf, int lb) =>
    [botVol, colVol] = request.security(syminfo.tickerid, tf, [
         math.sum(close >= open ? volume : 0.0, lb),
         math.sum(close <  open ? volume : 0.0, lb)
         ], lookahead = barmerge.lookahead_off)
    [nz(botVol), nz(colVol)]

[bot1H, col1H] = calcBotCol("60",  lookback)
[bot15, col15] = calcBotCol("15",  lookback)
[bot5,  col5]  = calcBotCol("5",   lookback)

totalUp   = bot1H + bot15 + bot5
totalDown = col1H + col15 + col5
netResult = totalUp - totalDown

var table dtb = na

if barstate.islast and dtbChk
    if not na(dtb)
        dtb.delete()

    dtb := table.new(dtbLoc, 3, 4,
             bgcolor      = dtbBgClr,
             border_color = color.new(color.white, 75),
             border_width = 1,
             frame_color  = color.new(color.white, 65),
             frame_width  = 1)

    hBg  = color.new(color.black, 55)
    hClr = color.new(color.white, 5)

    dtb.cell(0, 0, "Élément", text_color = hClr, bgcolor = hBg, text_size = size.tiny)
    dtb.cell(1, 0, "Valeur", text_color = hClr, bgcolor = hBg, text_size = size.tiny)
    dtb.cell(2, 0, "Direction", text_color = hClr, bgcolor = hBg, text_size = size.tiny)

    upBg = color.new(#1B5E20, 65)
    dtb.cell(0, 1,  " Hausse ", text_color = color.new(#4CAF50, 0), bgcolor = color.new(color.gray, 75), text_size = size.tiny)
    dtb.cell(1, 1, formatVolume(totalUp), text_color = color.new(#00BFFF, 0), bgcolor = upBg, text_size = size.tiny)
    dtb.cell(2, 1, "↑", text_color = color.new(#4CAF50, 0), bgcolor = color.new(color.gray, 75), text_size = size.tiny)

    downBg = color.new(#B71C1C, 65)
    dtb.cell(0, 2,  " Baisse ", text_color = color.new(#F44336, 0), bgcolor = color.new(color.gray, 75), text_size = size.tiny)
    dtb.cell(1, 2, formatVolume(totalDown), text_color = color.new(#FF69B4, 0), bgcolor = downBg, text_size = size.tiny)
    dtb.cell(2, 2, "↓", text_color = color.new(#F44336, 0), bgcolor = color.new(color.gray, 75), text_size = size.tiny)

    resultBg = netResult >= 0 ? color.new(#1B5E20, 65) : color.new(#B71C1C, 65)
    resultArrow = netResult >= 0 ? "↑" : "↓"
    resultColor = netResult >= 0 ? color.new(#4CAF50, 0) : color.new(#F44336, 0)

    dtb.cell(0, 3,  " Net ", text_color = color.new(#d3c945, 0), bgcolor = color.new(color.gray, 75), text_size = size.tiny)
    dtb.cell(1, 3, formatVolume(math.abs(netResult)), text_color = resultColor, bgcolor = resultBg, text_size = size.tiny)
    dtb.cell(2, 3, resultArrow, text_color = resultColor, bgcolor = color.new(color.gray, 75), text_size = size.tiny)

// =====================
// TYPES — MACRO
// =====================
type Settings
    string      htf
    bool        mirror
    int         max
    int         lookback
    string      override1
    float       overridevalue1
    string      override2
    float       overridevalue2
    string      override3
    float       overridevalue3
    string      override4
    float       overridevalue4
    string      override5
    float       overridevalue5

type FibLevels
    bool        show
    int         padding
    bool        useLog
    bool        use_background
    int         fill_percent
    bool        show_level
    bool        show_price
    string      label_size
    bool        fib1
    float       fib1_level
    color       fib1_color
    string      fib1_style
    int         fib1_size
    bool        fib2
    float       fib2_level
    color       fib2_color
    string      fib2_style
    int         fib2_size
    bool        fib3
    float       fib3_level
    color       fib3_color
    string      fib3_style
    int         fib3_size
    bool        fib4
    float       fib4_level
    color       fib4_color
    string      fib4_style
    int         fib4_size
    bool        fib5
    float       fib5_level
    color       fib5_color
    string      fib5_style
    int         fib5_size
    bool        fib6
    float       fib6_level
    color       fib6_color
    string      fib6_style
    int         fib6_size
    bool        fib7
    float       fib7_level
    color       fib7_color
    string      fib7_style
    int         fib7_size
    bool        fib8
    float       fib8_level
    color       fib8_color
    string      fib8_style
    int         fib8_size
    bool        fib9
    float       fib9_level
    color       fib9_color
    string      fib9_style
    int         fib9_size

type fib
    float       level
    float       price
    color       color
    string      style
    int         size
    line        ln
    label       lbl
    linefill    fl

type Daily
    array<fib>  fibs
    float       price
    int         time
    int         time_last

type VolumeData
    float totalVol

type orderblock
    float      value
    int        barStart
    int        barEnd
    box        block
    label      lbl
    label      signalLbl
    bool       broken
    VolumeData volumeData

// =====================
// INPUTS — fmfmf16 (Macro)
// =====================
settings_panel  = 'Panneau de contrôle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
show_indicator  = input.bool(true, '👁 Afficher l\\\'indicateur complet', group = settings_panel)

settings_tf     = 'Panneau des unités de temps ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
selected_tf     = input.string('240', 'Unité de temps', options = ['60', '240', 'D'], group = settings_tf)

settings_targets = 'Objectifs (cibles) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
fib_line_style  = input.string('⎯⎯⎯', 'Style des lignes', options = ['⎯⎯⎯', '----', '····'], group = settings_targets)
fib_label_size  = input.string(size.small, 'Taille des prix', options = [size.tiny, size.small, size.normal, size.large], group = settings_targets)
show_prices_lbl = input.bool(true, 'Afficher les prix', group = settings_targets)

settings_tools  = 'Outils ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
showFVG         = input.bool(true,  'Afficher zones de liquidité',         group = settings_tools)
maxBoxes        = input.int(1, 'Nombre de zones de liquidité', minval=1, maxval=10, group = settings_tools)
showOB          = input.bool(true,  'Afficher zones d\\\'offre et de demande',   group = settings_tools)
int zigzagLen        = input.int(9, 'Longueur du zigzag', group = settings_tools)
int numberObShow     = input.int(1, 'Nombre de zones offre/demande', minval=1, maxval=10, group = settings_tools)
color bearishOrderblockColor = input.color(color.new(#f36767, 54), title='Couleur zone d\\\'offre', group = settings_tools)
color bullishOrderblockColor = input.color(color.new(#a8f373, 61), title='Couleur zone de demande', group = settings_tools)
showTrendLines  = input.bool(true,  'Afficher les lignes de tendance',         group = settings_tools)
show_daily_sr   = input.bool(true,  'Afficher support et résistance',      group = settings_tools)

settings_sr_lines = 'Lignes de support et résistance ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
sr_line_style_input = input.string('----', 'Style des lignes support/résistance', options = ['⎯⎯⎯', '----', '····'], group = settings_sr_lines)
sr_line_width_input = input.int(1, 'Épaisseur des lignes', minval=1, maxval=4, group = settings_sr_lines)
sr_label_size_input = input.string(size.tiny, 'Taille des étiquettes', options = [size.tiny, size.small, size.normal, size.large], group = settings_sr_lines)
sr_extend_right     = input.bool(false, 'Étendre les lignes à droite', group = settings_sr_lines)

settings_autofibo = 'Auto Fibonacci ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
FPeriod = input.int(85, title='Fibo Period', group=settings_autofibo)

// =====================
// INPUTS — Dynamic VWAP (Macro)
// =====================
group_sw = "VWAP Swing Points"
prd      = input.int(50, title='Swing Period', minval=2, group=group_sw)
baseAPT  = input.float(20, 'Adaptive Price Tracking', minval=1, step=1, group=group_sw)
useAdapt = input.bool(false, 'Adapt APT by ATR ratio', group=group_sw)
volBias  = input.float(10.0, 'Volatility Bias', minval=0.1, step=0.1, group=group_sw)

group_style = "VWAP Style"
highS   = input.color(color.lime, title="Swing High Color", group=group_style)
lowS    = input.color(color.red,  title="Swing Low Color",  group=group_style)
lineS   = input.color(color.lime, title="VWAP Bull Color",  group=group_style, inline="VWAP")
lineR   = input.color(color.red,  title="VWAP Bear Color",  group=group_style, inline="VWAP")
vwap_w  = input.int(2, minval=1, title="VWAP Width", group=group_style)

// =====================
// FIXED SETTINGS — fmfmf16 (Macro)
// =====================
var Settings  settings  = Settings.new()
var FibLevels fiblevels = FibLevels.new()

show_lines     = true
show_labels    = true
show_above     = true
show_below     = true
show_open_line = true

settings.htf            := selected_tf
settings.max            := 1
settings.lookback       := 5000
settings.mirror         := true
settings.override1      := ''
settings.overridevalue1 := 0.0
settings.override2      := ''
settings.overridevalue2 := 0.0
settings.override3      := ''
settings.overridevalue3 := 0.0
settings.override4      := ''
settings.overridevalue4 := 0.0
settings.override5      := ''
settings.overridevalue5 := 0.0

fiblevels.fib1          := true
fiblevels.fib1_level    := 0.0
fiblevels.fib1_color    := color.white
fiblevels.fib1_style    := fib_line_style
fiblevels.fib1_size     := 2
fiblevels.fib2          := true
fiblevels.fib2_level    := 0.25
fiblevels.fib2_color    := color.green
fiblevels.fib2_style    := fib_line_style
fiblevels.fib2_size     := 1
fiblevels.fib3          := true
fiblevels.fib3_level    := 0.5
fiblevels.fib3_color    := color.green
fiblevels.fib3_style    := fib_line_style
fiblevels.fib3_size     := 1
fiblevels.fib4          := true
fiblevels.fib4_level    := 0.75
fiblevels.fib4_color    := color.green
fiblevels.fib4_style    := fib_line_style
fiblevels.fib4_size     := 1
fiblevels.fib5          := true
fiblevels.fib5_level    := 1.0
fiblevels.fib5_color    := color.green
fiblevels.fib5_style    := fib_line_style
fiblevels.fib5_size     := 2
fiblevels.fib6          := true
fiblevels.fib6_level    := 1.25
fiblevels.fib6_color    := color.green
fiblevels.fib6_style    := fib_line_style
fiblevels.fib6_size     := 1
fiblevels.fib7          := true
fiblevels.fib7_level    := 1.5
fiblevels.fib7_color    := color.green
fiblevels.fib7_style    := fib_line_style
fiblevels.fib7_size     := 1
fiblevels.fib8          := false
fiblevels.fib8_level    := 1.75
fiblevels.fib8_color    := color.green
fiblevels.fib8_style    := fib_line_style
fiblevels.fib8_size     := 1
fiblevels.fib9          := false
fiblevels.fib9_level    := 2.0
fiblevels.fib9_color    := color.green
fiblevels.fib9_style    := fib_line_style
fiblevels.fib9_size     := 2
fiblevels.use_background := false
fiblevels.fill_percent   := 99
fiblevels.padding        := 1
fiblevels.label_size     := fib_label_size
fiblevels.show_level     := true
fiblevels.show_price     := show_prices_lbl

daily_resistance_color = color.new(#ff0000, 20)
daily_support_color    = color.new(#00ff00, 20)
daily_midline_color    = #ffeb3b

upTlColor       = color.new(color.teal, 15)
downTlColor     = color.new(color.red,  15)
trendLineLength = 10

contract  = true
closeOnly = true
fvgtra    = 80
colUp     = color.red
colDn     = color.green
liqWidth  = 0.3

atr = ta.atr(14)

// =====================
// FIB HELPERS (Macro)
// =====================
color color_transparent = #00000000
var array<Daily> daily  = array.new<Daily>()

lineStyle(string style) =>
    switch style
        '----' => line.style_dashed
        '····' => line.style_dotted
        =>        line.style_solid

srLineStyle(string style) =>
    switch style
        '----' => line.style_dashed
        '····' => line.style_dotted
        =>        line.style_solid

method swap(array<fib> this, int i, int j) =>
    temp = this.get(i)
    this.set(i, this.get(j))
    this.set(j, temp)

method sort(array<fib> this) =>
    sz = this.size()
    for i = 0 to sz - 2
        for j = 0 to sz - 2 - i
            if this.get(j).level > this.get(j + 1).level
                this.swap(j, j + 1)

getLineColor(float level) =>
    math.abs(level) == 0.25 ? color.new(color.blue, 0) : level > 0 ? color.new(color.green, 0) : level < 0 ? color.new(color.red, 0) : color.new(color.white, 0)

getTargetLabel(float level, float price, bool show_price) =>
    string txt = ''
    if level == 0
        txt := 'Open'
    else if level == 0.25
        txt := 'Entrée Call'
    else if level == -0.25
        txt := 'Entrée Put'
    else if level > 0
        txt := 'T' + str.tostring(math.round(math.abs(level) / 0.25))
    else
        txt := 'T' + str.tostring(math.round(math.abs(level) / 0.25) + 1)
    if show_price
        txt := txt + ' (' + str.format('{0,number,#,###.00}', price) + ')'
    txt

shouldShow(float level) =>
    if not show_indicator
        false
    else if level == 0
        show_open_line
    else if level > 0
        show_above
    else
        show_below

getFibLevel(float level, float _price, color _color, string _style, int _size) =>
    fib f   = fib.new()
    f.level := level
    f.color := getLineColor(level)
    f.price := _price
    f.style := _style
    f.size  := _size
    f.ln    := line.new(na, _price, na, _price, color=f.color, style=lineStyle(_style), xloc=xloc.bar_time, width=_size)
    f.lbl   := label.new(na, f.price, '', style=label.style_label_left, textcolor=f.color, color=color_transparent, size=fiblevels.label_size, xloc=xloc.bar_time)
    f

method calcFibs(Daily this, float price, float stdDev) =>
    if this.fibs.size() == 0
        if fiblevels.fib1
            this.fibs.unshift(getFibLevel(fiblevels.fib1_level, price+(stdDev*fiblevels.fib1_level), fiblevels.fib1_color, fiblevels.fib1_style, fiblevels.fib1_size))
            if settings.mirror and fiblevels.fib1_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib1_level, price-(stdDev*fiblevels.fib1_level), fiblevels.fib1_color, fiblevels.fib1_style, fiblevels.fib1_size))
        if fiblevels.fib2
            this.fibs.unshift(getFibLevel(fiblevels.fib2_level, price+(stdDev*fiblevels.fib2_level), fiblevels.fib2_color, fiblevels.fib2_style, fiblevels.fib2_size))
            if settings.mirror and fiblevels.fib2_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib2_level, price-(stdDev*fiblevels.fib2_level), fiblevels.fib2_color, fiblevels.fib2_style, fiblevels.fib2_size))
        if fiblevels.fib3
            this.fibs.unshift(getFibLevel(fiblevels.fib3_level, price+(stdDev*fiblevels.fib3_level), fiblevels.fib3_color, fiblevels.fib3_style, fiblevels.fib3_size))
            if settings.mirror and fiblevels.fib3_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib3_level, price-(stdDev*fiblevels.fib3_level), fiblevels.fib3_color, fiblevels.fib3_style, fiblevels.fib3_size))
        if fiblevels.fib4
            this.fibs.unshift(getFibLevel(fiblevels.fib4_level, price+(stdDev*fiblevels.fib4_level), fiblevels.fib4_color, fiblevels.fib4_style, fiblevels.fib4_size))
            if settings.mirror and fiblevels.fib4_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib4_level, price-(stdDev*fiblevels.fib4_level), fiblevels.fib4_color, fiblevels.fib4_style, fiblevels.fib4_size))
        if fiblevels.fib5
            this.fibs.unshift(getFibLevel(fiblevels.fib5_level, price+(stdDev*fiblevels.fib5_level), fiblevels.fib5_color, fiblevels.fib5_style, fiblevels.fib5_size))
            if settings.mirror and fiblevels.fib5_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib5_level, price-(stdDev*fiblevels.fib5_level), fiblevels.fib5_color, fiblevels.fib5_style, fiblevels.fib5_size))
        if fiblevels.fib6
            this.fibs.unshift(getFibLevel(fiblevels.fib6_level, price+(stdDev*fiblevels.fib6_level), fiblevels.fib6_color, fiblevels.fib6_style, fiblevels.fib6_size))
            if settings.mirror and fiblevels.fib6_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib6_level, price-(stdDev*fiblevels.fib6_level), fiblevels.fib6_color, fiblevels.fib6_style, fiblevels.fib6_size))
        if fiblevels.fib7
            this.fibs.unshift(getFibLevel(fiblevels.fib7_level, price+(stdDev*fiblevels.fib7_level), fiblevels.fib7_color, fiblevels.fib7_style, fiblevels.fib7_size))
            if settings.mirror and fiblevels.fib7_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib7_level, price-(stdDev*fiblevels.fib7_level), fiblevels.fib7_color, fiblevels.fib7_style, fiblevels.fib7_size))
        if fiblevels.fib8
            this.fibs.unshift(getFibLevel(fiblevels.fib8_level, price+(stdDev*fiblevels.fib8_level), fiblevels.fib8_color, fiblevels.fib8_style, fiblevels.fib8_size))
            if settings.mirror and fiblevels.fib8_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib8_level, price-(stdDev*fiblevels.fib8_level), fiblevels.fib8_color, fiblevels.fib8_style, fiblevels.fib8_size))
        if fiblevels.fib9
            this.fibs.unshift(getFibLevel(fiblevels.fib9_level, price+(stdDev*fiblevels.fib9_level), fiblevels.fib9_color, fiblevels.fib9_style, fiblevels.fib9_size))
            if settings.mirror and fiblevels.fib9_level != 0
                this.fibs.unshift(getFibLevel(-fiblevels.fib9_level, price-(stdDev*fiblevels.fib9_level), fiblevels.fib9_color, fiblevels.fib9_style, fiblevels.fib9_size))
    this.fibs.sort()
    this

method fibAlert(Daily this) =>
    for f in this.fibs
        if f.level < 0 and ta.crossunder(low, f.price)
            alert('Price crossed below StdDev ' + str.tostring(f.level) + ' [' + syminfo.ticker + ']')
            break
        if f.level > 1 and ta.crossover(high, f.level)
            alert('Price crossed above StdDev ' + str.tostring(f.level) + ' [' + syminfo.ticker + ']')
            break

method drawFibs(Daily this, int idx) =>
    if this.fibs.size() > 0
        for i = 0 to this.fibs.size() - 1
            fib f      = this.fibs.get(i)
            int padded = this.time_last + (fiblevels.padding * (time - time[1]))
            string txt = getTargetLabel(f.level, f.price, fiblevels.show_price)
            bool visible   = shouldShow(f.level)
            color lineClr  = visible and show_lines  ? f.color : color_transparent
            color labelClr = visible and show_labels ? f.color : color_transparent
            f.ln.set_color(lineClr)
            f.lbl.set_xy(padded, f.price)
            f.lbl.set_textcolor(labelClr)
            if idx == 0
                f.ln.set_xy1(this.time, f.price)
                f.ln.set_xy2(padded, f.price)
                f.lbl.set_text(visible and show_labels ? txt : '')
                if fiblevels.use_background and i > 0
                    fib pf = this.fibs.get(i - 1)
                    f.fl := linefill.new(pf.ln, f.ln, color.new(f.color, fiblevels.fill_percent))
            else
                f.ln.set_x1(this.time)
                f.ln.set_x2(this.time_last + (time - time[1]))
                f.lbl.set_x(this.time_last)
    this

getDailyStDev() =>
    float stdev = 0
    switch str.lower(syminfo.ticker)
        str.lower(settings.override1) => settings.overridevalue1
        str.lower(settings.override2) => settings.overridevalue2
        str.lower(settings.override3) => settings.overridevalue3
        str.lower(settings.override4) => settings.overridevalue4
        str.lower(settings.override5) => settings.overridevalue5
        =>
            lookback = math.min(settings.lookback, bar_index)
            lookback := lookback <= 0 ? 1 : lookback
            diff = (close - open) / open
            ta.stdev(diff, lookback)

method delete(array<fib> this) =>
    for f in this
        f.ln.delete()
        f.lbl.delete()
        f.fl.delete()

method add(array<Daily> this, float price, int _time, float stdDev) =>
    Daily d     = Daily.new()
    d.price     := price
    d.time      := _time
    d.time_last := _time
    d.fibs      := array.new<fib>()
    d.calcFibs(price, stdDev)
    this.unshift(d)
    if this.size() > settings.max
        Daily temp = this.pop()
        temp.fibs.delete()

method update(array<Daily> this, int _time) =>
    if this.size() > 0
        Daily f = this.first()
        f.time_last := _time

// =====================
// FIB EXECUTION (Macro)
// =====================
var float fib_factor = 0
var float day_open   = 0
var int   day_time   = 0

if true
    fib_factor := request.security(syminfo.ticker, settings.htf, getDailyStDev(), lookahead = barmerge.lookahead_on)
    bool newDay = bool(ta.change(time(settings.htf, "america/New_York")))
    if bool(newDay)
        if not bool(newDay[1])
            daily.add(open, time, (fib_factor * open))
            day_open := open
            day_time := time
    daily.update(time)
    if barstate.islast
        for [i, d] in daily
            d.drawFibs(i)
        daily.first().fibAlert()

// =====================
// DAILY SUPPORT/RESISTANCE (Macro)
// =====================
selected_high = request.security(syminfo.tickerid, selected_tf, high[1], lookahead = barmerge.lookahead_on)
selected_low  = request.security(syminfo.tickerid, selected_tf, low[1],  lookahead = barmerge.lookahead_on)
selected_mid  = (selected_high + selected_low) / 2

tf_name = selected_tf == "60"  ? "heure"    :
          selected_tf == "240" ? "4 heures" : "jour"

var line  daily_resistanceLine  = na
var line  daily_supportLine     = na
var line  daily_midLine         = na
var label daily_resistanceLabel = na
var label daily_supportLabel    = na
var label daily_midLabel        = na

if barstate.islast
    line.delete(daily_resistanceLine)
    line.delete(daily_supportLine)
    line.delete(daily_midLine)
    label.delete(daily_resistanceLabel)
    label.delete(daily_supportLabel)
    label.delete(daily_midLabel)
    if show_daily_sr and not na(selected_high) and not na(selected_low)
        int lx   = bar_index - 40
        int rx   = bar_index + 5
        ext_mode = sr_extend_right ? extend.right : extend.none
        sr_style = srLineStyle(sr_line_style_input)
        daily_resistanceLine  := line.new(lx, selected_high, rx, selected_high, color=daily_resistance_color, width=sr_line_width_input, style=sr_style, extend=ext_mode)
        daily_supportLine     := line.new(lx, selected_low,  rx, selected_low,  color=daily_support_color,    width=sr_line_width_input, style=sr_style, extend=ext_mode)
        daily_midLine         := line.new(lx, selected_mid,  rx, selected_mid,  color=daily_midline_color,    width=sr_line_width_input, style=sr_style, extend=ext_mode)
        daily_resistanceLabel := label.new(rx, selected_high, "↑ Résistance " + tf_name + "  " + str.tostring(selected_high, format.mintick), style=label.style_label_left, color=#00000000, textcolor=daily_resistance_color, size=sr_label_size_input)
        daily_supportLabel    := label.new(rx, selected_low,  "↓ Support "    + tf_name + "  " + str.tostring(selected_low,  format.mintick), style=label.style_label_left, color=#00000000, textcolor=daily_support_color,    size=sr_label_size_input)
        daily_midLabel        := label.new(rx, selected_mid,  "◈ Pivot central "  + tf_name + "  " + str.tostring(selected_mid,  format.mintick), style=label.style_label_left, color=#00000000, textcolor=daily_midline_color,    size=sr_label_size_input)

// =====================
// FVG (Macro)
// =====================
var array<box>   fvgDnAll = array.new<box>()
var array<box>   fvgUpAll = array.new<box>()
var array<box>   liqDnBox = array.new<box>()
var array<box>   liqUpBox = array.new<box>()
var array<label> liqDnLab = array.new<label>()
var array<label> liqUpLab = array.new<label>()
var array<bool>  liqDnHit = array.new<bool>()
var array<bool>  liqUpHit = array.new<bool>()
var array<bool>  liqDnVis = array.new<bool>()
var array<bool>  liqUpVis = array.new<bool>()

fvg(direction) =>
    var fvgMat      = matrix.new<float>(5)
    var fvgDrawings = array.new<box>()
    fvgDrawings.clear()
    fvgMat.add_col(0, array.from(math.sign(close - open), close, high, low, float(time)))
    if fvgMat.columns() > 3
        fvgMat.remove_col(fvgMat.columns() - 1)
    if fvgMat.row(0).sum() == direction
        getDir = math.sign(direction)
        [y, y1] = switch getDir
            -1 => [fvgMat.get(3, 2), fvgMat.get(2, 0)]
            =>    [fvgMat.get(3, 0), fvgMat.get(2, 2)]
        col = color.new(color.black, 100)
        fvgDrawings.push(box.new(int(fvgMat.get(4, 1)), y, last_bar_time, y1, xloc=xloc.bar_time, border_color=col, bgcolor=col))
    fvgDrawings

if showFVG
    newDn = fvg(-3)
    newUp = fvg(3)
    if newDn.size() > 0
        for b in newDn
            top    = b.get_top()
            bot    = b.get_bottom()
            rgt    = b.get_right()
            lft    = b.get_left()
            midY   = (top + bot) / 2
            totalW = rgt - lft
            liqL   = rgt - int(totalW * liqWidth)
            b.set_bgcolor(color.new(colDn, fvgtra))
            b.set_border_color(color.new(colDn, fvgtra))
            fvgDnAll.push(b)
            liqDnBox.push(box.new(liqL, top, rgt, bot, xloc=xloc.bar_time, border_color=color.new(color.white, 50), bgcolor=color.new(colDn, 50)))
            liqDnLab.push(label.new(liqL, midY, text="Liquidité", xloc=xloc.bar_time, color=#00000000, textcolor=color.white, style=label.style_label_right, size=size.small))
            liqDnHit.push(false)
            liqDnVis.push(true)
    if newUp.size() > 0
        for b in newUp
            top    = b.get_top()
            bot    = b.get_bottom()
            rgt    = b.get_right()
            lft    = b.get_left()
            midY   = (top + bot) / 2
            totalW = rgt - lft
            liqL   = rgt - int(totalW * liqWidth)
            b.set_bgcolor(color.new(colUp, fvgtra))
            b.set_border_color(color.new(colUp, fvgtra))
            fvgUpAll.push(b)
            liqUpBox.push(box.new(liqL, top, rgt, bot, xloc=xloc.bar_time, border_color=color.new(color.white, 50), bgcolor=color.new(colUp, 50)))
            liqUpLab.push(label.new(liqL, midY, text="Liquidité", xloc=xloc.bar_time, color=#00000000, textcolor=color.white, style=label.style_label_right, size=size.small))
            liqUpHit.push(false)
            liqUpVis.push(true)
    if fvgDnAll.size() > 0
        for i = fvgDnAll.size() - 1 to 0
            b = fvgDnAll.get(i)
            if high >= b.get_top()
                b.delete()
                fvgDnAll.remove(i)
                liqDnBox.get(i).delete()
                liqDnBox.remove(i)
                liqDnLab.get(i).delete()
                liqDnLab.remove(i)
                liqDnHit.remove(i)
                liqDnVis.remove(i)
            else if contract and high > b.get_bottom()
                b.set_bottom(high)
    if fvgUpAll.size() > 0
        for i = fvgUpAll.size() - 1 to 0
            b = fvgUpAll.get(i)
            if low <= b.get_bottom()
                b.delete()
                fvgUpAll.remove(i)
                liqUpBox.get(i).delete()
                liqUpBox.remove(i)
                liqUpLab.get(i).delete()
                liqUpLab.remove(i)
                liqUpHit.remove(i)
                liqUpVis.remove(i)
            else if contract and low < b.get_top()
                b.set_top(low)
    if fvgDnAll.size() > 0
        for i = 0 to fvgDnAll.size() - 1
            b      = fvgDnAll.get(i)
            lb     = liqDnBox.get(i)
            ll     = liqDnLab.get(i)
            top    = b.get_top()
            bot    = b.get_bottom()
            rgt    = b.get_right()
            lft    = b.get_left()
            totalW = rgt - lft
            liqL   = rgt - int(totalW * liqWidth)
            midY   = (top + bot) / 2
            lb.set_lefttop(liqL, top)
            lb.set_rightbottom(rgt, bot)
            ll.set_xy(liqL, midY)
            if not liqDnHit.get(i)
                if close >= bot and close <= top
                    liqDnHit.set(i, true)
                    ll.set_text("✓ Liquidité prélevée")
                    ll.set_textcolor(color.yellow)
    if fvgUpAll.size() > 0
        for i = 0 to fvgUpAll.size() - 1
            b      = fvgUpAll.get(i)
            lb     = liqUpBox.get(i)
            ll     = liqUpLab.get(i)
            top    = b.get_top()
            bot    = b.get_bottom()
            rgt    = b.get_right()
            lft    = b.get_left()
            totalW = rgt - lft
            liqL   = rgt - int(totalW * liqWidth)
            midY   = (top + bot) / 2
            lb.set_lefttop(liqL, top)
            lb.set_rightbottom(rgt, bot)
            ll.set_xy(liqL, midY)
            if not liqUpHit.get(i)
                if close >= bot and close <= top
                    liqUpHit.set(i, true)
                    ll.set_text("✓ Liquidité prélevée")
                    ll.set_textcolor(color.yellow)
    if closeOnly and barstate.islast
        if fvgDnAll.size() > 0
            for i = 0 to fvgDnAll.size() - 1
                fvgDnAll.get(i).set_bgcolor(color.new(color.black, 100))
                fvgDnAll.get(i).set_border_color(color.new(color.black, 100))
                liqDnBox.get(i).set_bgcolor(color.new(color.black, 100))
                liqDnBox.get(i).set_border_color(color.new(color.black, 100))
                liqDnLab.get(i).set_textcolor(color.new(color.white, 100))
                liqDnVis.set(i, false)
        if fvgUpAll.size() > 0
            for i = 0 to fvgUpAll.size() - 1
                fvgUpAll.get(i).set_bgcolor(color.new(color.black, 100))
                fvgUpAll.get(i).set_border_color(color.new(color.black, 100))
                liqUpBox.get(i).set_bgcolor(color.new(color.black, 100))
                liqUpBox.get(i).set_border_color(color.new(color.black, 100))
                liqUpLab.get(i).set_textcolor(color.new(color.white, 100))
                liqUpVis.set(i, false)
        if fvgDnAll.size() > 0
            distsDn = array.new_float()
            for i = 0 to fvgDnAll.size() - 1
                distsDn.push(math.abs(close - fvgDnAll.get(i).get_bottom()))
            for n = 0 to math.min(maxBoxes - 1, fvgDnAll.size() - 1)
                idx = array.indexof(distsDn, array.min(distsDn))
                fvgDnAll.get(idx).set_bgcolor(color.new(colDn, fvgtra))
                fvgDnAll.get(idx).set_border_color(color.new(colDn, fvgtra))
                liqDnBox.get(idx).set_bgcolor(color.new(colDn, 50))
                liqDnBox.get(idx).set_border_color(color.new(color.white, 50))
                if liqDnHit.get(idx)
                    liqDnLab.get(idx).set_textcolor(color.yellow)
                else
                    liqDnLab.get(idx).set_textcolor(color.white)
                liqDnVis.set(idx, true)
                array.set(distsDn, idx, 1e10)
        if fvgUpAll.size() > 0
            distsUp = array.new_float()
            for i = 0 to fvgUpAll.size() - 1
                distsUp.push(math.abs(close - fvgUpAll.get(i).get_top()))
            for n = 0 to math.min(maxBoxes - 1, fvgUpAll.size() - 1)
                idx = array.indexof(distsUp, array.min(distsUp))
                fvgUpAll.get(idx).set_bgcolor(color.new(colUp, fvgtra))
                fvgUpAll.get(idx).set_border_color(color.new(colUp, fvgtra))
                liqUpBox.get(idx).set_bgcolor(color.new(colUp, 50))
                liqUpBox.get(idx).set_border_color(color.new(color.white, 50))
                if liqUpHit.get(idx)
                    liqUpLab.get(idx).set_textcolor(color.yellow)
                else
                    liqUpLab.get(idx).set_textcolor(color.white)
                liqUpVis.set(idx, true)
                array.set(distsUp, idx, 1e10)

if not showFVG and barstate.islast
    if fvgDnAll.size() > 0
        for i = 0 to fvgDnAll.size() - 1
            fvgDnAll.get(i).set_bgcolor(color.new(color.black, 100))
            fvgDnAll.get(i).set_border_color(color.new(color.black, 100))
            liqDnBox.get(i).set_bgcolor(color.new(color.black, 100))
            liqDnBox.get(i).set_border_color(color.new(color.black, 100))
            liqDnLab.get(i).set_textcolor(color.new(color.white, 100))
    if fvgUpAll.size() > 0
        for i = 0 to fvgUpAll.size() - 1
            fvgUpAll.get(i).set_bgcolor(color.new(color.black, 100))
            fvgUpAll.get(i).set_border_color(color.new(color.black, 100))
            liqUpBox.get(i).set_bgcolor(color.new(color.black, 100))
            liqUpBox.get(i).set_border_color(color.new(color.black, 100))
            liqUpLab.get(i).set_textcolor(color.new(color.white, 100))

// =====================
// ORDER BLOCKS (Macro)
// =====================
var array<orderblock> bullishOrderblock = array.new<orderblock>()
var array<orderblock> bearishOrderblock = array.new<orderblock>()
var array<int>   highValIndex = array.new<int>()
var array<int>   lowValIndex  = array.new<int>()
var array<float> highVal      = array.new_float()
var array<float> lowVal       = array.new_float()

var bool   drawUp    = false
var bool   drawDown  = false
var string lastState = na
var bool   to_up     = false
var bool   to_down   = false
var int    trend     = 1

var bool m_priceInBullOB = false
var bool m_priceInBearOB = false

to_up   := high[zigzagLen] >= ta.highest(high, zigzagLen)
to_down := low[zigzagLen]  <= ta.lowest(low,  zigzagLen)
trend   := trend == 1 and to_down ? -1 : trend == -1 and to_up ? 1 : trend

if ta.change(trend) != 0 and trend == 1
    array.push(highValIndex, time[zigzagLen])
    array.push(highVal, high[zigzagLen])
    if array.size(lowVal) > 1
        drawUp := false

if ta.change(trend) != 0 and trend == -1
    array.push(lowValIndex, time[zigzagLen])
    array.push(lowVal, low[zigzagLen])
    if array.size(highVal) > 1
        drawDown := false

if array.size(lowVal) > 1 and drawDown == false
    if close < array.get(lowVal, array.size(lowVal) - 1)
        drawDown  := true
        lastState := 'down'
        orderblock newOB = orderblock.new()
        float max = 0
        int bar   = na
        for i = (time - array.get(lowValIndex, array.size(lowValIndex)-1) - (time-time[1])) / (time-time[1]) to 0 by 1
            if high[i] > max
                max := high[i]
                bar := time[i]
        newOB.barStart   := bar
        newOB.barEnd     := time
        newOB.broken     := false
        newOB.value      := max
        newOB.volumeData := VolumeData.new(volume)
        newOB.block := box.new(
             left         = newOB.barStart,
             top          = newOB.value,
             right        = newOB.barEnd,
             bottom       = newOB.value - atr,
             xloc         = xloc.bar_time,
             bgcolor      = showOB ? bearishOrderblockColor : color.new(color.black, 100),
             border_width = 2,
             border_color = showOB ? color.new(#cd1212, 0) : color.new(color.black, 100))
        newOB.lbl := label.new(
             x         = newOB.barEnd,
             y         = newOB.value - (atr / 2),
             text      = "",
             xloc      = xloc.bar_time,
             style     = label.style_label_right,
             textcolor = color.white,
             color     = color.new(color.red, 100),
             size      = size.small)
        newOB.signalLbl := label.new(
             x         = newOB.barEnd,
             y         = newOB.value - (atr / 2),
             text      = "",
             xloc      = xloc.bar_time,
             style     = label.style_label_right,
             textcolor = color.white,
             color     = color.new(color.red, 100),
             size      = size.small)
        array.push(bearishOrderblock, newOB)
        if array.size(bearishOrderblock) > 20
            oldOb = array.shift(bearishOrderblock)
            if not na(oldOb.block)
                oldOb.block.delete()
            if not na(oldOb.lbl)
                oldOb.lbl.delete()
            if not na(oldOb.signalLbl)
                oldOb.signalLbl.delete()

if array.size(highVal) > 1 and drawUp == false
    if close > array.get(highVal, array.size(highVal) - 1)
        drawUp    := true
        lastState := 'up'
        orderblock newOB = orderblock.new()
        float min = 999999999
        int bar   = na
        for i = (time - array.get(highValIndex, array.size(highValIndex)-1) - (time-time[1])) / (time-time[1]) to 0 by 1
            if low[i] < min
                min := low[i]
                bar := time[i]
        newOB.barStart   := bar
        newOB.barEnd     := time
        newOB.broken     := false
        newOB.value      := min
        newOB.volumeData := VolumeData.new(volume)
        newOB.block := box.new(
             left         = newOB.barStart,
             top          = newOB.value + atr,
             right        = newOB.barEnd,
             bottom       = newOB.value,
             xloc         = xloc.bar_time,
             bgcolor      = showOB ? bullishOrderblockColor : color.new(color.black, 100),
             border_width = 2,
             border_color = showOB ? color.new(#52ae10, 0) : color.new(color.black, 100))
        newOB.lbl := label.new(
             x         = newOB.barEnd,
             y         = newOB.value + (atr / 2),
             text      = "",
             xloc      = xloc.bar_time,
             style     = label.style_label_right,
             textcolor = color.white,
             color     = color.new(color.green, 100),
             size      = size.small)
        newOB.signalLbl := label.new(
             x         = newOB.barEnd,
             y         = newOB.value + (atr / 2),
             text      = "",
             xloc      = xloc.bar_time,
             style     = label.style_label_right,
             textcolor = color.white,
             color     = color.new(color.green, 100),
             size      = size.small)
        array.push(bullishOrderblock, newOB)
        if array.size(bullishOrderblock) > 20
            oldOb = array.shift(bullishOrderblock)
            if not na(oldOb.block)
                oldOb.block.delete()
            if not na(oldOb.lbl)
                oldOb.lbl.delete()
            if not na(oldOb.signalLbl)
                oldOb.signalLbl.delete()

var int activeBullishCount = 0
var int activeBearishCount = 0

if array.size(bullishOrderblock) > 0
    orderblock testOB = na
    int counter = 0
    activeBullishCount := 0
    m_priceInBullOB := false
    for i = array.size(bullishOrderblock) - 1 to 0 by 1
        testOB := array.get(bullishOrderblock, i)
        if counter < numberObShow
            testOB.block.set_right(time)
            if close < testOB.value
                testOB.block.delete()
                testOB.lbl.delete()
                testOB.signalLbl.delete()
                array.remove(bullishOrderblock, i)
            else
                activeBullishCount += 1
                bool nearBull = close <= testOB.value + atr and close >= testOB.value
                if nearBull
                    m_priceInBullOB := true
                if showOB
                    testOB.block.set_bgcolor(bullishOrderblockColor)
                    testOB.block.set_border_color(color.new(#52ae10, 0))
                    testOB.lbl.set_text("Zone de demande")
                    testOB.lbl.set_x(time)
                    testOB.lbl.set_y(testOB.value + (atr / 2))
                    testOB.lbl.set_style(label.style_label_right)
                    testOB.lbl.set_textcolor(color.white)
                    if nearBull
                        testOB.signalLbl.set_text("▲")
                        testOB.signalLbl.set_x(time)
                        testOB.signalLbl.set_y(testOB.value - (atr * 1.5))
                        testOB.signalLbl.set_style(label.style_label_up)
                        testOB.signalLbl.set_color(color.new(color.green, 0))
                        testOB.signalLbl.set_textcolor(color.white)
                        testOB.signalLbl.set_size(size.normal)
                    else
                        testOB.signalLbl.set_text("")
                else
                    testOB.block.set_bgcolor(color.new(color.black, 100))
                    testOB.block.set_border_color(color.new(color.black, 100))
                    testOB.lbl.set_text("")
                    testOB.signalLbl.set_text("")
            counter += 1
        else
            testOB.block.set_right(testOB.barStart)
            testOB.lbl.set_text("")
            testOB.signalLbl.set_text("")

if array.size(bearishOrderblock) > 0
    orderblock testOB = na
    int counter = 0
    activeBearishCount := 0
    m_priceInBearOB := false
    for i = array.size(bearishOrderblock) - 1 to 0 by 1
        testOB := array.get(bearishOrderblock, i)
        if counter < numberObShow
            testOB.block.set_right(time)
            if close > testOB.value
                testOB.block.delete()
                testOB.lbl.delete()
                testOB.signalLbl.delete()
                array.remove(bearishOrderblock, i)
            else
                activeBearishCount += 1
                bool nearBear = close >= testOB.value - atr and close <= testOB.value
                if nearBear
                    m_priceInBearOB := true
                if showOB
                    testOB.block.set_bgcolor(bearishOrderblockColor)
                    testOB.block.set_border_color(color.new(#cd1212, 0))
                    testOB.lbl.set_text("Zone d\\\'offre")
                    testOB.lbl.set_x(time)
                    testOB.lbl.set_y(testOB.value - (atr / 2))
                    testOB.lbl.set_style(label.style_label_right)
                    testOB.lbl.set_textcolor(color.white)
                    if nearBear
                        testOB.signalLbl.set_text("▼")
                        testOB.signalLbl.set_x(time)
                        testOB.signalLbl.set_y(testOB.value + (atr * 1.5))
                        testOB.signalLbl.set_style(label.style_label_down)
                        testOB.signalLbl.set_color(color.new(color.red, 0))
                        testOB.signalLbl.set_textcolor(color.white)
                        testOB.signalLbl.set_size(size.normal)
                    else
                        testOB.signalLbl.set_text("")
                else
                    testOB.block.set_bgcolor(color.new(color.black, 100))
                    testOB.block.set_border_color(color.new(color.black, 100))
                    testOB.lbl.set_text("")
                    testOB.signalLbl.set_text("")
            counter += 1
        else
            testOB.block.set_right(testOB.barStart)
            testOB.lbl.set_text("")
            testOB.signalLbl.set_text("")

// =====================
// TREND LINES (Macro)
// =====================
extendTrendline(lineId, startIndex, startValue, endIndex, endValue) =>
    slope = (endValue - startValue) / (endIndex - startIndex)
    line.set_x2(lineId, bar_index)
    line.set_y2(lineId, startValue + slope * (bar_index - startIndex))

getSlope(startIndex, startValue, endIndex, endValue) =>
    (endValue - startValue) / (endIndex - startIndex)

var line newBearishTrendline = na
var line newBullishTrendline = na

if showTrendLines
    phTrend = ta.pivothigh(high, trendLineLength, trendLineLength)
    plTrend = ta.pivotlow(low,  trendLineLength, trendLineLength)
    bullishStart    = ta.valuewhen(not na(plTrend), bar_index[trendLineLength], 1)
    bullishEnd      = ta.valuewhen(not na(plTrend), bar_index[trendLineLength], 0)
    bearishStart    = ta.valuewhen(not na(phTrend), bar_index[trendLineLength], 1)
    bearishEnd      = ta.valuewhen(not na(phTrend), bar_index[trendLineLength], 0)
    bullishStartVal = ta.valuewhen(not na(plTrend), low[trendLineLength],  1)
    bullishEndVal   = ta.valuewhen(not na(plTrend), low[trendLineLength],  0)
    bearishStartVal = ta.valuewhen(not na(phTrend), high[trendLineLength], 1)
    bearishEndVal   = ta.valuewhen(not na(phTrend), high[trendLineLength], 0)
    line.delete(newBearishTrendline)
    line.delete(newBullishTrendline)
    slopeBearish = getSlope(bearishStart, bearishStartVal, bearishEnd, bearishEndVal)
    slopeBullish = getSlope(bullishStart, bullishStartVal, bullishEnd, bullishEndVal)
    if slopeBearish < 0
        newBearishTrendline := line.new(x1=bearishStart, y1=bearishStartVal, x2=bar_index, y2=bearishEndVal, xloc=xloc.bar_index, color=downTlColor, width=2)
    if slopeBullish > 0
        newBullishTrendline := line.new(x1=bullishStart, y1=bullishStartVal, x2=bar_index, y2=bullishEndVal, xloc=xloc.bar_index, color=upTlColor, width=2)
    if not na(newBearishTrendline)
        extendTrendline(newBearishTrendline, bearishStart, bearishStartVal, bearishEnd, bearishEndVal)
    if not na(newBullishTrendline)
        extendTrendline(newBullishTrendline, bullishStart, bullishStartVal, bullishEnd, bullishEndVal)

// =====================
// ALERTS — Macro
// =====================
alertcondition(
     condition = array.size(bullishOrderblock) > 0 and
     close <= array.get(bullishOrderblock, array.size(bullishOrderblock) - 1).value + atr and
     close >= array.get(bullishOrderblock, array.size(bullishOrderblock) - 1).value,
     title   = "🟢 Signal de demande - hausse probable",
     message = "Le prix a atteint la zone de demande - hausse attendue ▲")

alertcondition(
     condition = array.size(bearishOrderblock) > 0 and
     close >= array.get(bearishOrderblock, array.size(bearishOrderblock) - 1).value - atr and
     close <= array.get(bearishOrderblock, array.size(bearishOrderblock) - 1).value,
     title   = "🔴 Signal d\\\'offre - baisse probable",
     message = "Le prix a atteint la zone d\\\'offre - baisse attendue ▼")

// =====================
// DYNAMIC VWAP
// =====================
var float ph = na
var float pl = na
var int phL  = bar_index
var int plL  = bar_index
var float prev_v = na

ph  := ta.highestbars(high, prd) == 0 ? high : ph
pl  := ta.lowestbars(low,  prd) == 0 ? low  : pl
phL := ta.highestbars(high, prd) == 0 ? bar_index : phL
plL := ta.lowestbars(low,  prd) == 0 ? bar_index : plL

dir_vwap = phL > plL ? 1 : -1
atr_v    = ta.atr(10)
atr_avg  = ta.rma(atr_v, 50)
ratio_v  = atr_avg > 0 ? atr_v / atr_avg : 1.0
apt_raw  = useAdapt ? baseAPT / math.pow(ratio_v, volBias) : baseAPT
apt_clamped = math.round(math.max(5.0, math.min(300.0, apt_raw)))

alphaFromAPT(apt) =>
    1.0 - math.exp(-math.log(2.0) / math.max(1.0, apt))

type dataPoints
    array<chart.point> points
    polyline poly = na

var dataPoints vwap_obj = na
if na(vwap_obj)
    vwap_obj := dataPoints.new(array.new<chart.point>())

var float p_acc   = hlc3 * volume
var float vol_acc = volume

var float m_lastVwapValue = na

if dir_vwap != dir_vwap[1]
    x_v = dir_vwap > 0 ? plL : phL
    y_v = dir_vwap > 0 ? pl  : ph
    label.new(x_v, y_v, text = dir_vwap > 0 ? "" : "",
         style    = dir_vwap > 0 ? label.style_label_up : label.style_label_down,
         color    = color.new(dir_vwap > 0 ? highS : lowS, 20),
         textcolor = color.white,
         size     = size.tiny)
    prev_v := dir_vwap > 0 ? ph[1] : pl[1]
    bars_b  = bar_index - x_v
    p_acc   := y_v * volume[bars_b]
    vol_acc := volume[bars_b]
    if not na(vwap_obj.poly)
        vwap_obj.poly.delete()
    vwap_obj.points.clear()
    for i = bars_b to 0
        alpha    = alphaFromAPT(apt_clamped[i])
        p_acc   := (1 - alpha) * p_acc   + alpha * (hlc3[i] * volume[i])
        vol_acc := (1 - alpha) * vol_acc + alpha * volume[i]
        vwap_obj.points.push(chart.point.from_index(bar_index - i, vol_acc > 0 ? p_acc / vol_acc : na))
    vwap_obj.poly := polyline.new(vwap_obj.points, false, false, line_color = dir_vwap > 0 ? lineS : lineR, line_width = vwap_w)
    if vwap_obj.points.size() > 0
        m_lastVwapValue := vwap_obj.points.last().price
else
    alpha    = alphaFromAPT(apt_clamped)
    p_acc   := (1 - alpha) * p_acc   + alpha * (hlc3 * volume)
    vol_acc := (1 - alpha) * vol_acc + alpha * volume
    if not na(vwap_obj.poly)
        vwap_obj.poly.delete()
    vwap_obj.points.push(chart.point.from_index(bar_index, vol_acc > 0 ? p_acc / vol_acc : na))
    vwap_obj.poly := polyline.new(vwap_obj.points, false, false, line_color = dir_vwap > 0 ? lineS : lineR, line_width = vwap_w)
    if vwap_obj.points.size() > 0
        m_lastVwapValue := vwap_obj.points.last().price

m_priceAboveVwap = not na(m_lastVwapValue) and close > m_lastVwapValue
m_priceBelowVwap = not na(m_lastVwapValue) and close < m_lastVwapValue


// ============================================================================================
// =========================  PARTIE 2 — MICRO (ex-Inducement Engine)  ======================
// ============================================================================================

string GRP_CORE  = "IDM Core"
string GRP_ENTRY = "Entry & Risk"
string GRP_FLT   = "Smart Filters"
string GRP_VIS   = "I · Vis"
string GRP_ALERT = "I · Alerts"
string GRP_DASH  = "I · Dash"
string GRP_CONF  = "🔗 Confluence Macro -> Micro"

int   swing_len      = input.int(5,     "Swing Length",          minval=2,              group=GRP_CORE)
int   atr_len        = input.int(14,     "ATR Length",            minval=1,              group=GRP_CORE)
int   ind_max        = input.int(50,     "Max IDM Memory",        minval=10, maxval=200, group=GRP_CORE)

bool  use_atr_sl     = input.bool(true,  "ATR-Adaptive SL",                              group=GRP_ENTRY)
float atr_sl_mult    = input.float(1.0,  "ATR SL Mult",           minval=0.1, step=0.1,  group=GRP_ENTRY)
float rr_ratio       = input.float(1.0,  "TP1 R:R",               minval=0.5, step=0.1,  group=GRP_ENTRY)
float rr_tp2         = input.float(2.0,  "TP2 Void Ext 1",        minval=1.0, step=0.5,  group=GRP_ENTRY)
float rr_tp3         = input.float(3.0,  "TP3 Void Ext 2",        minval=1.5, step=0.5,  group=GRP_ENTRY)
bool  show_tp_line   = input.bool(true,  "Show Target Lines",                             group=GRP_ENTRY)
bool  show_sl_line   = input.bool(true,  "Show SL Line",                                  group=GRP_ENTRY)
bool  show_entry_line= input.bool(true,  "Show Entry Line",                               group=GRP_ENTRY)

bool   use_time_filter = input.bool(false,     "Session Time Filter",                   group=GRP_FLT)
string sess_time       = input.session("0800-1700", "Trading Session",                  group=GRP_FLT)
bool   use_htf_filter  = input.bool(false,     "HTF Trend Alignment",                   group=GRP_FLT)
string htf_res         = input.timeframe("60", "HTF Timeframe",                         group=GRP_FLT)
int    htf_ema_len     = input.int(20,         "HTF EMA Length",                        minval=1, group=GRP_FLT)
bool   use_fvg_filter  = input.bool(false,     "FVG / Imbalance Confluence",            group=GRP_FLT)
bool   use_rej_filter  = input.bool(false,     "Rejection Quality (Pinbar)",            group=GRP_FLT)
bool   use_vol_filter  = input.bool(false,     "Volatility Chop Filter",                group=GRP_FLT)
int    vol_len         = input.int(20,         "Volatility SMA Length",                 minval=1, group=GRP_FLT)

bool   use_macro_trend_filter = input.bool(true,  "Exiger alignement Supertrend+Braid",        group=GRP_CONF)
bool   use_macro_ob_filter    = input.bool(true,  "Exiger prix dans Order Block (bon côté)",   group=GRP_CONF)
bool   use_macro_vwap_filter  = input.bool(true,  "Exiger alignement VWAP dynamique",          group=GRP_CONF)
bool   show_stats_table       = input.bool(true,  "Afficher le tableau de statistiques",       group=GRP_CONF)

bool  show_idm_label = input.bool(true,  "Show IDM Label",                                group=GRP_VIS)
bool  show_pending   = input.bool(true,  "Show Pending IDM",                              group=GRP_VIS)
color col_bull       = input.color(color.rgb(30, 215, 96),                "Bull Color",         group=GRP_VIS)
color col_bear       = input.color(color.rgb(255, 92, 51),                "Bear Color",         group=GRP_VIS)
color col_ind_up     = input.color(color.rgb(30, 215, 96),                "IDM ↑ Color (Bull)", group=GRP_VIS)
color col_ind_down   = input.color(color.rgb(255, 92, 51),                "IDM ↓ Color (Bear)", group=GRP_VIS)
color col_entry_bull = input.color(color.new(color.rgb(30, 215, 96), 82), "Bull Entry Fill",    group=GRP_VIS)
color col_entry_bear = input.color(color.new(color.rgb(255, 92, 51), 82), "Bear Entry Fill",    group=GRP_VIS)
color col_tp         = input.color(color.new(color.rgb(0, 200, 255), 55), "TP Line Color",      group=GRP_VIS)
color col_sl         = input.color(color.new(color.rgb(220, 40, 80),  55), "SL Line Color",     group=GRP_VIS)
color col_text       = input.color(color.rgb(230, 235, 255),               "Text Color",        group=GRP_VIS)

string cfg_action_long        = input.string("long",       "Long Action",    group=GRP_ALERT, tooltip="")
string cfg_action_short       = input.string("short",      "Short Action",   group=GRP_ALERT, tooltip="")
string cfg_action_close_long  = input.string("closelong",  "Close Long",     group=GRP_ALERT, tooltip="")
string cfg_action_close_short = input.string("closeshort", "Close Short",    group=GRP_ALERT, tooltip="")

color  dash_bg_color  = input.color(color.rgb(10,10,18,5),    "BG",   group=GRP_DASH)
color  dash_txt_color = input.color(color.rgb(220,220,235,0), "Text", group=GRP_DASH)

type InducementPoint
    int   index
    float price
    float candle_sl
    bool  is_bull
    bool  broken

type SwingPoint
    int   index
    float price
    bool  is_active

type MarketStructure
    int   trend
    float last_high
    float last_low

type SignalState
    string action
    float  entry
    float  sl
    float  tp
    float  tp2
    float  tp3
    bool   trigger

f_pivotHigh(series float src, simple int len) =>
    float candidate = src[len]
    bool  isValid   = true
    for i = 1 to len * 2
        if i != len and src[i] >= candidate
            isValid := false
    isValid ? candidate : na

f_pivotLow(series float src, simple int len) =>
    float candidate = src[len]
    bool  isValid   = true
    for i = 1 to len * 2
        if i != len and src[i] <= candidate
            isValid := false
    isValid ? candidate : na

method gen_payload(SignalState this) =>
    string inner = str.format(
         '"ticker":"{0}","action":"{1}","entry":{2},"tp1":{3},"tp2":{4},"tp3":{5},"sl":{6},"tf":"{7}","macro_confluence":true',
         syminfo.prefix + ':' + syminfo.ticker, this.action,
         str.tostring(this.entry, format.mintick),
         str.tostring(this.tp,    format.mintick),
         str.tostring(this.tp2,   format.mintick),
         str.tostring(this.tp3,   format.mintick),
         str.tostring(this.sl,    format.mintick),
         timeframe.period)
    "{" + inner + "}"

var SwingPoint             last_ph       = SwingPoint.new(0, 0.0, false)
var SwingPoint             last_pl       = SwingPoint.new(0, 0.0, false)
var MarketStructure        ms            = MarketStructure.new(0, 0.0, 0.0)
var SignalState            sig           = SignalState.new("", 0.0, 0.0, 0.0, 0.0, 0.0, false)
var array<InducementPoint> ind_list      = array.new<InducementPoint>()
var int   ind_bull_count  = 0
var int   ind_bear_count  = 0
var int   last_bull_bar   = -1
var int   last_bear_bar   = -1
var label pend_bull_lbl   = na
var label pend_bear_lbl   = na
var line  pend_bull_ln    = na
var line  pend_bear_ln    = na
var label idm_broken_lbl  = na
var label tp_lbl          = na
var label tp2_lbl         = na
var label tp3_lbl         = na
var label sl_lbl          = na
var label entry_lbl       = na
var line  tp_ln           = na
var line  tp2_ln          = na
var line  tp3_ln          = na
var line  sl_ln           = na
var line  entry_ln        = na
var box   box_sl          = na
var box   box_entry       = na
var box   box_tp1         = na
var box   box_tp2         = na
var box   box_tp3         = na
var table dash = table.new(position.top_right, 2, 11,
     border_width=1, border_color=color.rgb(50,50,70,20),
     frame_width=1,  frame_color=color.rgb(60,60,90,10))
string clean_ticker = syminfo.prefix + ':' + syminfo.ticker

var int stat_raw_long      = 0
var int stat_raw_short     = 0
var int stat_valid_long    = 0
var int stat_valid_short   = 0
var int stat_reject_long   = 0
var int stat_reject_short  = 0

type TrackedTrade
    bool   is_long
    float  entry
    float  sl
    float  tp1
    float  tp2
    float  tp3
    int    best_tp
    bool   resolved_loss

var array<TrackedTrade> tracked_trades = array.new<TrackedTrade>()

var int perf_loss = 0
var int perf_tp1  = 0
var int perf_tp2  = 0
var int perf_tp3  = 0

bool  is_sess = not na(time(timeframe.period, sess_time))
bool  f_time  = use_time_filter ? is_sess : true

float htf_ema = request.security(syminfo.tickerid, htf_res, ta.ema(close, htf_ema_len)[1], lookahead=barmerge.lookahead_on)
bool  f_htf_l = use_htf_filter ? close[1] > htf_ema : true
bool  f_htf_s = use_htf_filter ? close[1] < htf_ema : true

float atr_val = ta.atr(atr_len)
float atr_sma = ta.sma(atr_val, vol_len)
bool  f_vol   = use_vol_filter ? atr_val > atr_sma : true

bool  f_rej_l = use_rej_filter ? close[1] > low[1]  + (high[1] - low[1]) * 0.5 : true
bool  f_rej_s = use_rej_filter ? close[1] < high[1] - (high[1] - low[1]) * 0.5 : true

bool  fvg_bull = low[1] > high[3]
bool  fvg_bear = high[1] < low[3]
bool  f_fvg_l  = use_fvg_filter ? ta.highest(fvg_bull ? 1 : 0, 3) > 0 : true
bool  f_fvg_s  = use_fvg_filter ? ta.highest(fvg_bear ? 1 : 0, 3) > 0 : true

float i_ph = f_pivotHigh(high, swing_len)
float i_pl = f_pivotLow(low,  swing_len)

if not na(i_ph)
    last_ph.index     := bar_index[swing_len]
    last_ph.price     := i_ph
    last_ph.is_active := true
    if i_ph > ms.last_high
        ms.last_high := i_ph
if not na(i_pl)
    last_pl.index     := bar_index[swing_len]
    last_pl.price     := i_pl
    last_pl.is_active := true
    if i_pl < ms.last_low or ms.last_low == 0.0
        ms.last_low := i_pl

if ms.trend == 0 and ms.last_high != 0.0 and ms.last_low != 0.0
    ms.trend := 1

if ms.trend != 0 and not na(i_ph)
    if i_ph < ms.last_high and i_ph > ms.last_low
        array.push(ind_list, InducementPoint.new(bar_index[swing_len], i_ph, high[swing_len], true, false))
        label.delete(pend_bull_lbl)
        line.delete(pend_bull_ln)
        if show_pending
            pend_bull_lbl := label.new(bar_index[swing_len], i_ph, "IDM", color=color.new(col_bull, 72), textcolor=col_bull, style=label.style_label_down, size=size.small)
            pend_bull_ln  := line.new(bar_index[swing_len], i_ph, bar_index + 1, i_ph, color=color.new(col_bull, 50), style=line.style_dotted, width=1)
if ms.trend != 0 and not na(i_pl)
    if i_pl > ms.last_low and i_pl < ms.last_high
        array.push(ind_list, InducementPoint.new(bar_index[swing_len], i_pl, low[swing_len], false, false))
        label.delete(pend_bear_lbl)
        line.delete(pend_bear_ln)
        if show_pending
            pend_bear_lbl := label.new(bar_index[swing_len], i_pl, "IDM", color=color.new(col_bear, 72), textcolor=col_bear, style=label.style_label_up, size=size.small)
            pend_bear_ln  := line.new(bar_index[swing_len], i_pl, bar_index + 1, i_pl, color=color.new(col_bear, 50), style=line.style_dotted, width=1)

if array.size(ind_list) > ind_max
    array.shift(ind_list)
if not na(pend_bull_ln)
    line.set_x2(pend_bull_ln, bar_index + 1)
if not na(pend_bear_ln)
    line.set_x2(pend_bear_ln, bar_index + 1)

bool  ind_bull_broken = false
bool  ind_bear_broken = false
int   ind_broken_idx  = 0
float ind_bull_sl     = 0.0
float ind_bear_sl     = 0.0
int _ind_sz = array.size(ind_list)
if _ind_sz > 0
    for i = 0 to _ind_sz - 1
        InducementPoint ip = array.get(ind_list, i)
        if not ip.broken
            if ip.is_bull and low[1] < ip.price
                ip.broken       := true
                ind_bull_broken := true
                ind_broken_idx  := ip.index
                ind_bull_sl     := ip.candle_sl
                ind_bull_count  := ind_bull_count + 1
                last_bull_bar   := bar_index
                array.set(ind_list, i, ip)
                label.delete(pend_bull_lbl)
                line.delete(pend_bull_ln)
                pend_bull_lbl := na
                pend_bull_ln  := na
                if show_idm_label
                    label.delete(idm_broken_lbl)
                    idm_broken_lbl := label.new(ip.index, ip.price, "IDM ↓", color=color.new(col_ind_down, 100), textcolor=col_ind_down, style=label.style_label_down, size=size.normal)
            else if not ip.is_bull and high[1] > ip.price
                ip.broken       := true
                ind_bear_broken := true
                ind_broken_idx  := ip.index
                ind_bear_sl     := ip.candle_sl
                ind_bear_count  := ind_bear_count + 1
                last_bear_bar   := bar_index
                array.set(ind_list, i, ip)
                label.delete(pend_bear_lbl)
                line.delete(pend_bear_ln)
                pend_bear_lbl := na
                pend_bear_ln  := na
                if show_idm_label
                    label.delete(idm_broken_lbl)
                    idm_broken_lbl := label.new(ip.index, ip.price, "IDM ↑", color=color.new(col_ind_up, 100), textcolor=col_ind_up, style=label.style_label_up, size=size.normal)

bool m_confluence_long_trend = use_macro_trend_filter ? m_macroBullish : true
bool m_confluence_long_ob    = use_macro_ob_filter    ? m_priceInBullOB : true
bool m_confluence_long_vwap  = use_macro_vwap_filter  ? m_priceAboveVwap : true
bool m_confluence_long_ok    = m_confluence_long_trend and m_confluence_long_ob and m_confluence_long_vwap

bool m_confluence_short_trend = use_macro_trend_filter ? m_macroBearish : true
bool m_confluence_short_ob    = use_macro_ob_filter    ? m_priceInBearOB : true
bool m_confluence_short_vwap  = use_macro_vwap_filter  ? m_priceBelowVwap : true
bool m_confluence_short_ok    = m_confluence_short_trend and m_confluence_short_ob and m_confluence_short_vwap

if ind_bear_broken
    stat_raw_long += 1
    if m_confluence_long_ok
        stat_valid_long += 1
    else
        stat_reject_long += 1

if ind_bull_broken
    stat_raw_short += 1
    if m_confluence_short_ok
        stat_valid_short += 1
    else
        stat_reject_short += 1

bool  short_signal = ind_bull_broken and f_time and f_htf_s and f_vol and f_rej_s and f_fvg_s and m_confluence_short_ok
bool  long_signal  = ind_bear_broken and f_time and f_htf_l and f_vol and f_rej_l and f_fvg_l and m_confluence_long_ok
float entry_price  = close[1]

float raw_sl_short = use_atr_sl ? ind_bull_sl + (atr_val * atr_sl_mult) : ind_bull_sl
float raw_sl_long  = use_atr_sl ? ind_bear_sl - (atr_val * atr_sl_mult) : ind_bear_sl
float sl_short     = math.max(raw_sl_short, entry_price + syminfo.mintick)
float sl_long      = math.min(raw_sl_long, entry_price - syminfo.mintick)

float risk_short   = sl_short - entry_price
float risk_long    = entry_price - sl_long
float tp_short     = entry_price - (risk_short * rr_ratio)
float tp_long      = entry_price + (risk_long * rr_ratio)
float tp2_short    = tp_short - (risk_short * (rr_tp2 - rr_ratio))
float tp3_short    = tp_short - (risk_short * (rr_tp3 - rr_ratio))
float tp2_long     = tp_long + (risk_long * (rr_tp2 - rr_ratio))
float tp3_long     = tp_long + (risk_long * (rr_tp3 - rr_ratio))
int   lbl_offset   = 40
sig.trigger := false

if short_signal and risk_short > 0
    line.delete(tp_ln)
    line.delete(tp2_ln)
    line.delete(tp3_ln)
    line.delete(sl_ln)
    line.delete(entry_ln)
    label.delete(tp_lbl)
    label.delete(tp2_lbl)
    label.delete(tp3_lbl)
    label.delete(sl_lbl)
    label.delete(entry_lbl)
    box.delete(box_sl)
    box.delete(box_entry)
    box.delete(box_tp1)
    box.delete(box_tp2)
    box.delete(box_tp3)
    int draw_left = math.max(ind_broken_idx, bar_index - 499)
    box_sl    := box.new(draw_left, sl_short,    bar_index + lbl_offset, entry_price, bgcolor=color.new(col_sl,  68), border_color=color.new(color.black, 100))
    box_entry := box.new(draw_left, entry_price, bar_index + lbl_offset, entry_price, bgcolor=color.new(color.black, 100), border_color=color.new(color.black, 100))
    box_tp1   := box.new(draw_left, tp_short,    bar_index + lbl_offset, entry_price, bgcolor=color.new(col_tp,  68), border_color=color.new(color.black, 100))
    box_tp2   := box.new(draw_left, tp2_short,   bar_index + lbl_offset, tp_short,    bgcolor=color.new(col_tp,  82), border_color=color.new(color.black, 100))
    box_tp3   := box.new(draw_left, tp3_short,   bar_index + lbl_offset, tp2_short,   bgcolor=color.new(col_tp,  93), border_color=color.new(color.black, 100))
    if show_entry_line
        entry_ln  := line.new(draw_left, entry_price, bar_index + lbl_offset, entry_price, color=col_bear, style=line.style_solid, width=1)
        entry_lbl := label.new(bar_index + lbl_offset, entry_price, "Entry " + str.tostring(entry_price, format.mintick), color=color.new(col_bear, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
    if show_tp_line
        tp_ln   := line.new(draw_left, tp_short,  bar_index + lbl_offset, tp_short,  color=col_tp, style=line.style_dashed, width=1)
        tp_lbl  := label.new(bar_index + lbl_offset, tp_short,  "TP1 " + str.tostring(tp_short,  format.mintick), color=color.new(col_tp, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
        tp2_ln  := line.new(draw_left, tp2_short, bar_index + lbl_offset, tp2_short, color=color.new(col_tp, 38), style=line.style_dotted, width=1)
        tp2_lbl := label.new(bar_index + lbl_offset, tp2_short, "TP2 " + str.tostring(tp2_short, format.mintick), color=color.new(col_tp, 83), textcolor=color.new(col_text, 10), style=label.style_label_left, size=size.small)
        tp3_ln  := line.new(draw_left, tp3_short, bar_index + lbl_offset, tp3_short, color=color.new(col_tp, 58), style=line.style_dotted, width=1)
        tp3_lbl := label.new(bar_index + lbl_offset, tp3_short, "TP3 " + str.tostring(tp3_short, format.mintick), color=color.new(col_tp, 88), textcolor=color.new(col_text, 20), style=label.style_label_left, size=size.small)
    if show_sl_line
        sl_ln  := line.new(draw_left, sl_short, bar_index + lbl_offset, sl_short, color=col_sl, style=line.style_dashed, width=1)
        sl_lbl := label.new(bar_index + lbl_offset, sl_short, "SL " + str.tostring(sl_short, format.mintick), color=color.new(col_sl, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
    ms.trend     := -1
    ms.last_high := last_ph.price
    sig.action   := cfg_action_short
    sig.entry    := entry_price
    sig.sl       := sl_short
    sig.tp       := tp_short
    sig.tp2      := tp2_short
    sig.tp3      := tp3_short
    sig.trigger  := true
    array.push(tracked_trades, TrackedTrade.new(false, entry_price, sl_short, tp_short, tp2_short, tp3_short, 0, false))

if long_signal and risk_long > 0
    line.delete(tp_ln)
    line.delete(tp2_ln)
    line.delete(tp3_ln)
    line.delete(sl_ln)
    line.delete(entry_ln)
    label.delete(tp_lbl)
    label.delete(tp2_lbl)
    label.delete(tp3_lbl)
    label.delete(sl_lbl)
    label.delete(entry_lbl)
    box.delete(box_sl)
    box.delete(box_entry)
    box.delete(box_tp1)
    box.delete(box_tp2)
    box.delete(box_tp3)
    int draw_left2 = math.max(ind_broken_idx, bar_index - 499)
    box_sl    := box.new(draw_left2, entry_price, bar_index + lbl_offset, sl_long,     bgcolor=color.new(col_sl,  68), border_color=color.new(color.black, 100))
    box_entry := box.new(draw_left2, entry_price, bar_index + lbl_offset, entry_price, bgcolor=color.new(color.black, 100), border_color=color.new(color.black, 100))
    box_tp1   := box.new(draw_left2, entry_price, bar_index + lbl_offset, tp_long,     bgcolor=color.new(col_tp,  58), border_color=color.new(color.black, 100))
    box_tp2   := box.new(draw_left2, tp_long,     bar_index + lbl_offset, tp2_long,    bgcolor=color.new(col_tp,  70), border_color=color.new(color.black, 100))
    box_tp3   := box.new(draw_left2, tp2_long,    bar_index + lbl_offset, tp3_long,    bgcolor=color.new(col_tp,  80), border_color=color.new(color.black, 100))
    if show_entry_line
        entry_ln  := line.new(draw_left2, entry_price, bar_index + lbl_offset, entry_price, color=col_bull, style=line.style_solid, width=1)
        entry_lbl := label.new(bar_index + lbl_offset, entry_price, "Entry " + str.tostring(entry_price, format.mintick), color=color.new(col_bull, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
    if show_tp_line
        tp_ln   := line.new(draw_left2, tp_long,  bar_index + lbl_offset, tp_long,  color=col_tp, style=line.style_dashed, width=1)
        tp_lbl  := label.new(bar_index + lbl_offset, tp_long,  "TP1 " + str.tostring(tp_long,  format.mintick), color=color.new(col_tp, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
        tp2_ln  := line.new(draw_left2, tp2_long, bar_index + lbl_offset, tp2_long, color=color.new(col_tp, 38), style=line.style_dotted, width=1)
        tp2_lbl := label.new(bar_index + lbl_offset, tp2_long, "TP2 " + str.tostring(tp2_long, format.mintick), color=color.new(col_tp, 83), textcolor=color.new(col_text, 10), style=label.style_label_left, size=size.small)
        tp3_ln  := line.new(draw_left2, tp3_long, bar_index + lbl_offset, tp3_long, color=color.new(col_tp, 58), style=line.style_dotted, width=1)
        tp3_lbl := label.new(bar_index + lbl_offset, tp3_long, "TP3 " + str.tostring(tp3_long, format.mintick), color=color.new(col_tp, 88), textcolor=color.new(col_text, 20), style=label.style_label_left, size=size.small)
    if show_sl_line
        sl_ln  := line.new(draw_left2, sl_long, bar_index + lbl_offset, sl_long, color=col_sl, style=line.style_dashed, width=1)
        sl_lbl := label.new(bar_index + lbl_offset, sl_long, "SL " + str.tostring(sl_long, format.mintick), color=color.new(col_sl, 78), textcolor=col_text, style=label.style_label_left, size=size.small)
    ms.trend     := 1
    ms.last_low  := last_pl.price
    sig.action   := cfg_action_long
    sig.entry    := entry_price
    sig.sl       := sl_long
    sig.tp       := tp_long
    sig.tp2      := tp2_long
    sig.tp3      := tp3_long
    sig.trigger  := true
    array.push(tracked_trades, TrackedTrade.new(true, entry_price, sl_long, tp_long, tp2_long, tp3_long, 0, false))

if array.size(tracked_trades) > 0
    for i = array.size(tracked_trades) - 1 to 0 by 1
        TrackedTrade t = array.get(tracked_trades, i)
        if not t.resolved_loss
            if t.is_long
                if t.best_tp == 0 and low <= t.sl
                    t.resolved_loss := true
                    perf_loss := perf_loss + 1
                    array.remove(tracked_trades, i)
                else
                    if t.best_tp < 3 and high >= t.tp3
                        t.best_tp := 3
                        perf_tp3 := perf_tp3 + 1
                        array.remove(tracked_trades, i)
                    else if t.best_tp < 2 and high >= t.tp2
                        t.best_tp := 2
                        perf_tp2 := perf_tp2 + 1
                    else if t.best_tp < 1 and high >= t.tp1
                        t.best_tp := 1
                        perf_tp1 := perf_tp1 + 1
            else
                if t.best_tp == 0 and high >= t.sl
                    t.resolved_loss := true
                    perf_loss := perf_loss + 1
                    array.remove(tracked_trades, i)
                else
                    if t.best_tp < 3 and low <= t.tp3
                        t.best_tp := 3
                        perf_tp3 := perf_tp3 + 1
                        array.remove(tracked_trades, i)
                    else if t.best_tp < 2 and low <= t.tp2
                        t.best_tp := 2
                        perf_tp2 := perf_tp2 + 1
                    else if t.best_tp < 1 and low <= t.tp1
                        t.best_tp := 1
                        perf_tp1 := perf_tp1 + 1

if barstate.islast and show_stats_table
    table.set_bgcolor(dash, 0, 0, 1, 10, dash_bg_color)
    table.cell(dash, 0, 0, "MÉTRIQUE CONFLUENCE", text_color=dash_txt_color, text_size=size.small)
    table.cell(dash, 1, 0, "VALEUR", text_color=dash_txt_color, text_size=size.small)
    
    table.cell(dash, 0, 1, "IDM Longs Brut", text_color=dash_txt_color, text_size=size.small)
    table.cell(dash, 1, 1, str.tostring(stat_raw_long), text_color=dash_txt_color, text_size=size.small)
    
    table.cell(dash, 0, 2, "IDM Longs Validés", text_color=color.green, text_size=size.small)
    table.cell(dash, 1, 2, str.tostring(stat_valid_long), text_color=color.green, text_size=size.small)
    
    table.cell(dash, 0, 3, "IDM Shorts Brut", text_color=dash_txt_color, text_size=size.small)
    table.cell(dash, 1, 3, str.tostring(stat_raw_short), text_color=dash_txt_color, text_size=size.small)
    
    table.cell(dash, 0, 4, "IDM Shorts Validés", text_color=color.red, text_size=size.small)
    table.cell(dash, 1, 4, str.tostring(stat_valid_short), text_color=color.red, text_size=size.small)

    table.cell(dash, 0, 5, "Trades SL Touché", text_color=color.red, text_size=size.small)
    table.cell(dash, 1, 5, str.tostring(perf_loss), text_color=color.red, text_size=size.small)

    table.cell(dash, 0, 6, "Trades TP1 Max", text_color=color.yellow, text_size=size.small)
    table.cell(dash, 1, 6, str.tostring(perf_tp1), text_color=color.yellow, text_size=size.small)

    table.cell(dash, 0, 7, "Trades TP2 Max", text_color=color.lime, text_size=size.small)
    table.cell(dash, 1, 7, str.tostring(perf_tp2), text_color=color.lime, text_size=size.small)

    table.cell(dash, 0, 8, "Trades TP3 Max", text_color=color.green, text_size=size.small)
    table.cell(dash, 1, 8, str.tostring(perf_tp3), text_color=color.green, text_size=size.small)

// Add strategy entry calls so our terminal compiler handles backtesting!
buy_cond = long_signal
sell_cond = short_signal
if (buy_cond)
    strategy.entry("Long", strategy.long)
if (sell_cond)
    strategy.entry("Short", strategy.short)
`;
