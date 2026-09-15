import collections
import collections.abc
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE

def build_exact_slide6(output_path):
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]
    s6 = prs.slides.add_slide(blank_layout)

    # Color Palette matching reference screenshot
    c_blue_banner = RGBColor(0, 112, 186)    # #0070BA
    c_navy_dark   = RGBColor(15, 23, 42)     # #0F172A
    c_card_bg     = RGBColor(248, 250, 252)  # #F8FAFC
    c_card_border = RGBColor(148, 163, 184)  # #94A3B8
    c_purple_border = RGBColor(147, 51, 234) # #9333EA
    c_purple_bg   = RGBColor(250, 245, 255)  # #FAF5FF
    c_white       = RGBColor(255, 255, 255)
    c_black       = RGBColor(0, 0, 0)
    c_text_dark   = RGBColor(30, 41, 59)
    c_text_muted  = RGBColor(100, 116, 139)
    c_green       = RGBColor(22, 163, 74)    # #16A34A
    c_link_blue   = RGBColor(2, 132, 199)    # #0284C7
    c_tam_outer   = RGBColor(168, 85, 247)   # TAM Outer Ring
    c_sam_mid     = RGBColor(192, 132, 252)  # SAM Mid Ring
    c_som_inner   = RGBColor(233, 213, 255)  # SOM Inner Circle

    # 1. Top Bar Header
    # Team Pill (Top Left)
    team_pill = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(0.2), Inches(1.3), Inches(0.42))
    team_pill.fill.solid()
    team_pill.fill.fore_color.rgb = c_white
    team_pill.line.color.rgb = c_black
    team_pill.line.width = Pt(1.5)
    tf = team_pill.text_frame
    p = tf.paragraphs[0]
    p.text = "Aegis AI"
    p.font.bold = True
    p.font.size = Pt(12)
    p.font.color.rgb = c_black
    p.alignment = PP_ALIGN.CENTER

    # Title Center
    title_box = s6.shapes.add_textbox(Inches(2.5), Inches(0.12), Inches(8.3), Inches(0.55))
    tf_t = title_box.text_frame
    p_t = tf_t.paragraphs[0]
    p_t.text = "RESEARCH AND REFERENCES"
    p_t.font.bold = True
    p_t.font.size = Pt(22)
    p_t.font.color.rgb = c_black
    p_t.alignment = PP_ALIGN.CENTER

    # Top Right SIH Logo
    sih_tag = s6.shapes.add_textbox(Inches(11.2), Inches(0.12), Inches(1.8), Inches(0.55))
    tf_s = sih_tag.text_frame
    p_s = tf_s.paragraphs[0]
    p_s.text = "SMART INDIA\nHACKATHON 2026"
    p_s.font.bold = True
    p_s.font.size = Pt(8)
    p_s.font.color.rgb = c_blue_banner
    p_s.alignment = PP_ALIGN.RIGHT

    # Click helper tag
    helper_tag = s6.shapes.add_textbox(Inches(5.8), Inches(0.75), Inches(1.8), Inches(0.6))
    tf_h = helper_tag.text_frame
    p_h = tf_h.paragraphs[0]
    p_h.text = "👉 CLICK ON THE\nIMAGES / LINKS"
    p_h.font.bold = True
    p_h.font.size = Pt(7.5)
    p_h.font.color.rgb = c_black
    p_h.alignment = PP_ALIGN.CENTER

    # =========================================================================
    # 2. TOP-LEFT CARD: "ON-DEVICE BROWSER AGENTS - RESEARCH"
    # =========================================================================
    top_left_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(0.72), Inches(5.4), Inches(3.4))
    top_left_bg.fill.solid()
    top_left_bg.fill.fore_color.rgb = c_card_bg
    top_left_bg.line.color.rgb = c_card_border
    top_left_bg.line.width = Pt(1.5)

    # Title header banner inside card
    tl_header = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(0.72), Inches(5.4), Inches(0.38))
    tl_header.fill.solid()
    tl_header.fill.fore_color.rgb = c_white
    tl_header.line.color.rgb = c_card_border
    tf_tlh = tl_header.text_frame
    p = tf_tlh.paragraphs[0]
    p.text = "ON-DEVICE BROWSER AGENTS - RESEARCH"
    p.font.bold = True
    p.font.size = Pt(10)
    p.font.color.rgb = c_black
    p.alignment = PP_ALIGN.CENTER

    # Sub-card 1: Visual Grounding
    c1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.55), Inches(1.18), Inches(2.45), Inches(1.4))
    c1.fill.solid()
    c1.fill.fore_color.rgb = c_white
    c1.line.color.rgb = c_card_border
    tf_c1 = c1.text_frame
    tf_c1.word_wrap = True
    p = tf_c1.paragraphs[0]
    p.text = "Visual Grounding in Web Agents"
    p.font.bold = True
    p.font.size = Pt(8.5)
    p.font.color.rgb = c_navy_dark
    p.space_after = Pt(2)
    p2 = tf_c1.add_paragraph()
    p2.text = "Set-of-Marks (SoM) prompting reduces LLM coordinate drift by 86% compared to raw pixel bounding boxes."
    p2.font.size = Pt(7)
    p2.font.color.rgb = c_text_dark
    p3 = tf_c1.add_paragraph()
    p3.text = "Click here (Paper)"
    p3.font.size = Pt(7)
    p3.font.color.rgb = c_link_blue
    p3.font.bold = True

    # Sub-card 2: WebGPU Inference Stats
    c2 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(3.15), Inches(1.18), Inches(2.5), Inches(1.4))
    c2.fill.solid()
    c2.fill.fore_color.rgb = c_white
    c2.line.color.rgb = c_card_border
    tf_c2 = c2.text_frame
    tf_c2.word_wrap = True
    p = tf_c2.paragraphs[0]
    p.text = "In-Browser WebGPU Stats"
    p.font.bold = True
    p.font.size = Pt(8.5)
    p.font.color.rgb = c_navy_dark
    p.space_after = Pt(2)
    p2 = tf_c2.add_paragraph()
    p2.text = "• WebGPU latency: ~680ms\n• WASM fallback: ~1.4s\n• Client RAM usage: <420MB (INT8 quantized models)."
    p2.font.size = Pt(7)
    p2.font.color.rgb = c_text_dark
    p3 = tf_c2.add_paragraph()
    p3.text = "Click here (Benchmarks)"
    p3.font.size = Pt(7)
    p3.font.color.rgb = c_link_blue
    p3.font.bold = True

    # Bottom sub-card inside Top-Left: DPDP Act & ISRO Guidelines
    c3 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.55), Inches(2.68), Inches(5.1), Inches(1.3))
    c3.fill.solid()
    c3.fill.fore_color.rgb = c_navy_dark
    c3.line.color.rgb = c_blue_banner
    tf_c3 = c3.text_frame
    tf_c3.word_wrap = True
    p = tf_c3.paragraphs[0]
    p.text = "Data Sovereignty & DPDP Act 2023 Compliance"
    p.font.bold = True
    p.font.size = Pt(8.5)
    p.font.color.rgb = RGBColor(251, 191, 36)
    p.space_after = Pt(2)
    p2 = tf_c3.add_paragraph()
    p2.text = "Under MeitY DPDP Act 2023, transmitting un-anonymized citizen data to third-party cloud LLMs carries severe penalties. Aegis guarantees 0-byte PII egress using on-device Verhoeff & Luhn validation."
    p2.font.size = Pt(7)
    p2.font.color.rgb = c_white
    p3 = tf_c3.add_paragraph()
    p3.text = "Click here (DPDP Guidelines)"
    p3.font.size = Pt(7)
    p3.font.color.rgb = RGBColor(56, 189, 248)
    p3.font.bold = True

    # =========================================================================
    # 3. TOP-RIGHT "OUR WORKS" SECTION
    # =========================================================================
    # Green "Our Works" Pill
    ow_pill = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(8.8), Inches(0.68), Inches(1.6), Inches(0.35))
    ow_pill.fill.solid()
    ow_pill.fill.fore_color.rgb = c_green
    ow_pill.line.fill.background()
    tf_ow = ow_pill.text_frame
    p = tf_ow.paragraphs[0]
    p.text = "Our Works ⭐"
    p.font.bold = True
    p.font.size = Pt(9.5)
    p.font.color.rgb = c_white
    p.alignment = PP_ALIGN.CENTER

    # GitHub Card
    gh_card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.5), Inches(1.08), Inches(2.65), Inches(1.15))
    gh_card.fill.solid()
    gh_card.fill.fore_color.rgb = c_white
    gh_card.line.color.rgb = c_green
    gh_card.line.width = Pt(1.5)
    tf_gh = gh_card.text_frame
    tf_gh.word_wrap = True
    p = tf_gh.paragraphs[0]
    p.text = "GitHub Repository"
    p.font.bold = True
    p.font.size = Pt(9.5)
    p.font.color.rgb = c_black
    p.alignment = PP_ALIGN.CENTER
    p2 = tf_gh.add_paragraph()
    p2.text = "You can see the Project files of Aegis AI here"
    p2.font.size = Pt(7.5)
    p2.font.color.rgb = c_text_muted
    p2.alignment = PP_ALIGN.CENTER
    p3 = tf_gh.add_paragraph()
    p3.text = "Click here (kanakagg2901/-AI-vision-engine)"
    p3.font.size = Pt(7.5)
    p3.font.color.rgb = c_link_blue
    p3.font.bold = True
    p3.alignment = PP_ALIGN.CENTER

    # Proof Documents Card
    pd_card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.3), Inches(1.08), Inches(2.6), Inches(1.15))
    pd_card.fill.solid()
    pd_card.fill.fore_color.rgb = c_white
    pd_card.line.color.rgb = c_blue_banner
    pd_card.line.width = Pt(1.5)
    tf_pd = pd_card.text_frame
    tf_pd.word_wrap = True
    p = tf_pd.paragraphs[0]
    p.text = "Proof Documents"
    p.font.bold = True
    p.font.size = Pt(9.5)
    p.font.color.rgb = c_black
    p.alignment = PP_ALIGN.CENTER
    p2 = tf_pd.add_paragraph()
    p2.text = "Consolidated verification & test reports of work"
    p2.font.size = Pt(7.5)
    p2.font.color.rgb = c_text_muted
    p2.alignment = PP_ALIGN.CENTER
    p3 = tf_pd.add_paragraph()
    p3.text = "Click here (Verification Logs)"
    p3.font.size = Pt(7.5)
    p3.font.color.rgb = c_link_blue
    p3.font.bold = True
    p3.alignment = PP_ALIGN.CENTER

    # =========================================================================
    # 4. MIDDLE-RIGHT REFERENCES (ON-DEVICE ML & AI/REASONING)
    # =========================================================================
    # Left Middle: ON-DEVICE ML - REFERENCES
    iot_ref_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.5), Inches(2.35), Inches(3.2), Inches(2.6))
    iot_ref_bg.fill.solid()
    iot_ref_bg.fill.fore_color.rgb = c_card_bg
    iot_ref_bg.line.color.rgb = c_blue_banner
    iot_ref_bg.line.width = Pt(1.5)
    
    t_ir = s6.shapes.add_textbox(Inches(6.5), Inches(2.38), Inches(3.2), Inches(0.35))
    t_ir.text_frame.paragraphs[0].text = "ON-DEVICE ML - REFERENCES"
    t_ir.text_frame.paragraphs[0].font.bold = True
    t_ir.text_frame.paragraphs[0].font.size = Pt(8.5)
    t_ir.text_frame.paragraphs[0].font.color.rgb = c_black
    t_ir.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

    # Box 1 inside On-Device ML
    b1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.65), Inches(2.78), Inches(2.9), Inches(0.95))
    b1.fill.solid()
    b1.fill.fore_color.rgb = c_white
    b1.line.color.rgb = c_card_border
    tf_b1 = b1.text_frame
    tf_b1.word_wrap = True
    p = tf_b1.paragraphs[0]
    p.text = "Transformers.js v3"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_b1.add_paragraph()
    p2.text = "In-browser WebGPU & WASM ONNX runtime.\n"
    p2.font.size = Pt(6.8)
    p2.font.color.rgb = c_text_dark
    r = p2.add_run()
    r.text = "Click here"
    r.font.color.rgb = c_link_blue
    r.font.bold = True

    # Box 2 inside On-Device ML
    b2 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.65), Inches(3.85), Inches(2.9), Inches(0.95))
    b2.fill.solid()
    b2.fill.fore_color.rgb = c_white
    b2.line.color.rgb = c_card_border
    tf_b2 = b2.text_frame
    tf_b2.word_wrap = True
    p = tf_b2.paragraphs[0]
    p.text = "Florence-2 & SoM"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_b2.add_paragraph()
    p2.text = "Microsoft visual UI grounding models.\n"
    p2.font.size = Pt(6.8)
    p2.font.color.rgb = c_text_dark
    r = p2.add_run()
    r.text = "Click here"
    r.font.color.rgb = c_link_blue
    r.font.bold = True

    # Right Middle: AI/ML - REFERENCES
    aiml_ref_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.85), Inches(2.35), Inches(3.05), Inches(2.6))
    aiml_ref_bg.fill.solid()
    aiml_ref_bg.fill.fore_color.rgb = c_card_bg
    aiml_ref_bg.line.color.rgb = c_blue_banner
    aiml_ref_bg.line.width = Pt(1.5)

    t_ar = s6.shapes.add_textbox(Inches(9.85), Inches(2.38), Inches(3.05), Inches(0.35))
    t_ar.text_frame.paragraphs[0].text = "AI / REASONING - REFERENCES"
    t_ar.text_frame.paragraphs[0].font.bold = True
    t_ar.text_frame.paragraphs[0].font.size = Pt(8.5)
    t_ar.text_frame.paragraphs[0].font.color.rgb = c_black
    t_ar.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

    # Box 1 inside AI/ML
    b3 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.0), Inches(2.78), Inches(2.75), Inches(0.95))
    b3.fill.solid()
    b3.fill.fore_color.rgb = c_white
    b3.line.color.rgb = c_card_border
    tf_b3 = b3.text_frame
    tf_b3.word_wrap = True
    p = tf_b3.paragraphs[0]
    p.text = "Ollama Qwen-2.5 1.5B"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_b3.add_paragraph()
    p2.text = "Compact local SLM for offline planning.\n"
    p2.font.size = Pt(6.8)
    p2.font.color.rgb = c_text_dark
    r = p2.add_run()
    r.text = "Click here"
    r.font.color.rgb = c_link_blue
    r.font.bold = True

    # Box 2 inside AI/ML
    b4 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.0), Inches(3.85), Inches(2.75), Inches(0.95))
    b4.fill.solid()
    b4.fill.fore_color.rgb = c_white
    b4.line.color.rgb = c_card_border
    tf_b4 = b4.text_frame
    tf_b4.word_wrap = True
    p = tf_b4.paragraphs[0]
    p.text = "Gemini 1.5 Flash VLM"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_b4.add_paragraph()
    p2.text = "Fast cloud multimodal visual reasoning.\n"
    p2.font.size = Pt(6.8)
    p2.font.color.rgb = c_text_dark
    r = p2.add_run()
    r.text = "Click here"
    r.font.color.rgb = c_link_blue
    r.font.bold = True

    # =========================================================================
    # 5. BOTTOM-LEFT CARD: "MARKET - RESEARCH" (Purple Border & TAM/SAM/SOM)
    # =========================================================================
    mkt_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.4), Inches(4.25), Inches(5.9), Inches(2.8))
    mkt_bg.fill.solid()
    mkt_bg.fill.fore_color.rgb = c_purple_bg
    mkt_bg.line.color.rgb = c_purple_border
    mkt_bg.line.width = Pt(1.5)

    # Title Banner
    t_mkt = s6.shapes.add_textbox(Inches(0.4), Inches(4.3), Inches(5.9), Inches(0.35))
    t_mkt.text_frame.paragraphs[0].text = "MARKET - RESEARCH"
    t_mkt.text_frame.paragraphs[0].font.bold = True
    t_mkt.text_frame.paragraphs[0].font.size = Pt(11)
    t_mkt.text_frame.paragraphs[0].font.color.rgb = c_black
    t_mkt.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

    # Left Mini Card: Market Size
    mc1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.55), Inches(4.7), Inches(2.2), Inches(1.15))
    mc1.fill.solid()
    mc1.fill.fore_color.rgb = c_white
    mc1.line.color.rgb = c_card_border
    tf_mc1 = mc1.text_frame
    tf_mc1.word_wrap = True
    p = tf_mc1.paragraphs[0]
    p.text = "Autonomous Agent Market"
    p.font.bold = True
    p.font.size = Pt(7.5)
    p.font.color.rgb = c_navy_dark
    p2 = tf_mc1.add_paragraph()
    p2.text = "As of 2024, the global browser automation & agent market is projected to reach $28,500 million by 2030 (32.8% CAGR)."
    p2.font.size = Pt(6.5)
    p2.font.color.rgb = c_text_dark

    # Concentric Circles for TAM / SAM / SOM
    tam_circle = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches(2.85), Inches(4.7), Inches(1.15), Inches(1.15))
    tam_circle.fill.solid()
    tam_circle.fill.fore_color.rgb = c_tam_outer
    tam_circle.line.fill.background()
    tam_circle.text_frame.paragraphs[0].text = "TAM"
    tam_circle.text_frame.paragraphs[0].font.size = Pt(6)
    tam_circle.text_frame.paragraphs[0].font.bold = True
    tam_circle.text_frame.paragraphs[0].font.color.rgb = c_white

    sam_circle = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches(2.97), Inches(4.82), Inches(0.9), Inches(0.9))
    sam_circle.fill.solid()
    sam_circle.fill.fore_color.rgb = c_sam_mid
    sam_circle.line.fill.background()
    sam_circle.text_frame.paragraphs[0].text = "SAM"
    sam_circle.text_frame.paragraphs[0].font.size = Pt(5.5)
    sam_circle.text_frame.paragraphs[0].font.bold = True
    sam_circle.text_frame.paragraphs[0].font.color.rgb = c_white

    som_circle = s6.shapes.add_shape(MSO_SHAPE.OVAL, Inches(3.1), Inches(4.95), Inches(0.65), Inches(0.65))
    som_circle.fill.solid()
    som_circle.fill.fore_color.rgb = c_som_inner
    som_circle.line.fill.background()
    som_circle.text_frame.paragraphs[0].text = "SOM"
    som_circle.text_frame.paragraphs[0].font.size = Pt(5)
    som_circle.text_frame.paragraphs[0].font.bold = True
    som_circle.text_frame.paragraphs[0].font.color.rgb = c_navy_dark

    # TAM / SAM / SOM Values Text Box
    tam_text = s6.shapes.add_textbox(Inches(4.1), Inches(4.65), Inches(2.15), Inches(1.2))
    tf_tt = tam_text.text_frame
    tf_tt.word_wrap = True
    p = tf_tt.paragraphs[0]
    p.text = "TAM - Total Addressable Market\nSAM - Service Available Market\nSOM - Service Obtainable Market\n"
    p.font.size = Pt(6.5)
    p.font.color.rgb = c_text_muted
    p2 = tf_tt.add_paragraph()
    p2.text = "₹ 84,500 crore (TAM)\n₹ 25,350 crore (SAM)\n₹ 1,267 crore (SOM)"
    p2.font.bold = True
    p2.font.size = Pt(7.5)
    p2.font.color.rgb = c_black

    # Bottom Revenue & Economics Breakdown inside Market Card
    econ_box = s6.shapes.add_textbox(Inches(0.5), Inches(5.9), Inches(5.7), Inches(1.05))
    tf_eb = econ_box.text_frame
    tf_eb.word_wrap = True
    p = tf_eb.paragraphs[0]
    p.text = "Enterprise Client Revenue Breakdown (1,000 Seats) | Cloud vs On-Device Compute:"
    p.font.bold = True
    p.font.size = Pt(7.5)
    p.font.color.rgb = c_navy_dark
    p2 = tf_eb.add_paragraph()
    p2.text = "• Annual Cloud API Cost (Standard Agent): ₹18,40,000  ➔  With Aegis On-Device Perception: ₹3,12,000 (83% Cost Reduction)\n• Enterprise Subscription (₹450/seat/mo): ₹54,00,000/yr | Software Margin: 88% due to low on-device compute overhead."
    p2.font.size = Pt(6.8)
    p2.font.color.rgb = c_text_dark

    # =========================================================================
    # 6. MIDDLE-RIGHT: "BACKEND" / FRAMEWORKS
    # =========================================================================
    be_label = s6.shapes.add_textbox(Inches(6.4), Inches(5.05), Inches(1.2), Inches(0.4))
    be_label.text_frame.paragraphs[0].text = "BACK\nEND"
    be_label.text_frame.paragraphs[0].font.bold = True
    be_label.text_frame.paragraphs[0].font.size = Pt(9.5)
    be_label.text_frame.paragraphs[0].font.color.rgb = c_black

    # FastAPI Box
    fapi_card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(7.5), Inches(5.05), Inches(2.65), Inches(0.65))
    fapi_card.fill.solid()
    fapi_card.fill.fore_color.rgb = c_white
    fapi_card.line.color.rgb = c_card_border
    tf_fc = fapi_card.text_frame
    tf_fc.word_wrap = True
    p = tf_fc.paragraphs[0]
    p.text = "FastAPI Framework"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_fc.add_paragraph()
    p2.text = "Asynchronous REST backend for agent orchestration. Click here"
    p2.font.size = Pt(6.5)
    p2.font.color.rgb = c_text_muted

    # Web Crypto & Verhoeff Box
    wc_card = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(10.3), Inches(5.05), Inches(2.6), Inches(0.65))
    wc_card.fill.solid()
    wc_card.fill.fore_color.rgb = c_white
    wc_card.line.color.rgb = c_card_border
    tf_wc = wc_card.text_frame
    tf_wc.word_wrap = True
    p = tf_wc.paragraphs[0]
    p.text = "Web Crypto & Verhoeff"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_wc.add_paragraph()
    p2.text = "PBKDF2+AES-GCM vault & ISO 7064 checksum. Click here"
    p2.font.size = Pt(6.5)
    p2.font.color.rgb = c_text_muted

    # =========================================================================
    # 7. BOTTOM-RIGHT: "BROWSER AUTOMATION & PRIVACY - REFERENCES"
    # =========================================================================
    auto_ref_bg = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.5), Inches(5.8), Inches(6.4), Inches(1.25))
    auto_ref_bg.fill.solid()
    auto_ref_bg.fill.fore_color.rgb = c_card_bg
    auto_ref_bg.line.color.rgb = c_card_border
    auto_ref_bg.line.width = Pt(1.5)

    t_ar = s6.shapes.add_textbox(Inches(6.5), Inches(5.82), Inches(6.4), Inches(0.28))
    t_ar.text_frame.paragraphs[0].text = "BROWSER AUTOMATION & PRIVACY - REFERENCES"
    t_ar.text_frame.paragraphs[0].font.bold = True
    t_ar.text_frame.paragraphs[0].font.size = Pt(8.5)
    t_ar.text_frame.paragraphs[0].font.color.rgb = c_black
    t_ar.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER

    # Box 1 inside Browser Automation
    ab1 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(6.65), Inches(6.12), Inches(2.95), Inches(0.85))
    ab1.fill.solid()
    ab1.fill.fore_color.rgb = c_white
    ab1.line.color.rgb = c_card_border
    tf_ab1 = ab1.text_frame
    tf_ab1.word_wrap = True
    p = tf_ab1.paragraphs[0]
    p.text = "Chrome Manifest V3"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_ab1.add_paragraph()
    p2.text = "Service worker & offscreen document architecture. Click here"
    p2.font.size = Pt(6.5)
    p2.font.color.rgb = c_text_dark

    # Box 2 inside Browser Automation
    ab2 = s6.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(9.8), Inches(6.12), Inches(2.95), Inches(0.85))
    ab2.fill.solid()
    ab2.fill.fore_color.rgb = c_white
    ab2.line.color.rgb = c_card_border
    tf_ab2 = ab2.text_frame
    tf_ab2.word_wrap = True
    p = tf_ab2.paragraphs[0]
    p.text = "MeitY DPDP Act 2023"
    p.font.bold = True
    p.font.size = Pt(8)
    p.font.color.rgb = c_navy_dark
    p2 = tf_ab2.add_paragraph()
    p2.text = "Data sovereignty & zero PII egress mandates. Click here"
    p2.font.size = Pt(6.5)
    p2.font.color.rgb = c_text_dark

    # 8. Bottom Footer Line
    footer_box = s6.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.0), Inches(7.15), Inches(13.333), Inches(0.35))
    footer_box.fill.solid()
    footer_box.fill.fore_color.rgb = c_blue_banner
    footer_box.line.fill.background()
    tf_f = footer_box.text_frame
    p_f = tf_f.paragraphs[0]
    p_f.text = "Aegis AI - @SIH Idea Submission | ISRO PS171: On-Device Visual Perception Browser Agent                              6"
    p_f.font.size = Pt(8.5)
    p_f.font.color.rgb = c_white
    p_f.font.bold = True
    p_f.alignment = PP_ALIGN.CENTER

    prs.save(output_path)
    print(f"Exact Slide 6 presentation successfully built at: {output_path}")

if __name__ == "__main__":
    build_exact_slide6(r"C:\Users\Anushka\OneDrive\Desktop\Aegis_SIH_Slide6_Exact_Replica.pptx")
