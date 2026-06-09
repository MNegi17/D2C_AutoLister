import re
import os
import difflib
import pandas as pd
from openpyxl import load_workbook
from sqlalchemy.orm import Session
from datetime import datetime
from database import ColumnMapping, BrandRule, CategorySpecTemplate, UserCorrection, ProcessingHistory

# --- UTILITIES & PARSERS ---

def slugify(text: str) -> str:
    """
    Slugify product titles to create clean, unique Shopify Handles,
    preserving casing and other characters exactly as in historical listings.
    """
    if not text:
        return ""
    # Strip leading/trailing whitespaces
    s = str(text).strip()
    # Replace spaces and slashes with hyphens
    s = re.sub(r'[\s/]+', '-', s)
    # Replace multiple hyphens with a single hyphen
    s = re.sub(r'-+', '-', s)
    return s.strip('-')

def read_excel_fast(path: str, sheet_name: str, max_rows: int = None) -> pd.DataFrame:
    """
    Fast streaming Excel reader using openpyxl read_only mode.
    Correctly handles column de-duplication and strips whitespace.
    """
    wb = load_workbook(path, read_only=True, data_only=True)
    if sheet_name not in wb.sheetnames:
        raise ValueError(f"Sheet '{sheet_name}' not found in Excel file.")
    
    sheet = wb[sheet_name]
    data = []
    rows = sheet.iter_rows(values_only=True)
    
    try:
        headers = next(rows)
    except StopIteration:
        return pd.DataFrame()
        
    headers = [str(h).strip() if h is not None else f"Col{idx}" for idx, h in enumerate(headers)]
    
    # De-duplicate headers
    unique_headers = []
    seen = {}
    for h in headers:
        if h in seen:
            seen[h] += 1
            unique_headers.append(f"{h}_{seen[h]}")
        else:
            seen[h] = 0
            unique_headers.append(h)
            
    for i, r in enumerate(rows):
        if max_rows and i >= max_rows:
            break
        r_list = list(r) if r is not None else []
        # Pad or slice to match headers length
        if len(r_list) < len(unique_headers):
            r_list += [None] * (len(unique_headers) - len(r_list))
        elif len(r_list) > len(unique_headers):
            r_list = r_list[:len(unique_headers)]
            
        r_list = [str(x).strip() if x is not None else "" for x in r_list]
        data.append(r_list)
        
    df = pd.DataFrame(data, columns=unique_headers)
    return df.reset_index(drop=True)

def read_csv_fast(path: str) -> pd.DataFrame:
    """
    Reads a CSV file with robust encoding fallbacks (utf-8, cp1252, etc.).
    """
    for enc in ['utf-8', 'utf-8-sig', 'cp1252', 'latin-1']:
        try:
            df = pd.read_csv(path, encoding=enc, dtype=str, keep_default_na=False)
            return df.reset_index(drop=True)
        except Exception:
            continue
    raise ValueError(f"Could not read CSV file '{os.path.basename(path)}' with any supported encoding.")

# --- SEMANTIC AUTO-MAPPING ENGINE ---

SEMANTIC_THESAURUS = {
    "Title": ["d2c title", "amazon title", "myntra title", "nykaa title", "pdp name", "title", "product name", "item description"],
    "Body (HTML)": ["description", "body", "bullet points", "marketing content", "product description"],
    "Variant SKU": ["item code", "sku", "barcode", "variant sku", "variant barcode", "sno"],
    "Variant Barcode": ["item name", "style", "style code", "item color", "color", "shade name"],
    "Option1 Value": ["size", "option1 value", "euro", "length in cm", "age group"],
    "Variant Compare At Price": ["mrp", "compare price", "list price", "compare at price", "variant compare at price"],
    "Variant Price": ["price", "selling price", "variant price", "d2c price"],
    "Upper Material": ["upper", "material", "fabric", "upper material"],
    "Sole Material": ["sole", "sole material"]
}

def auto_map_columns(source_columns: list, source_sheet_type: str, db: Session) -> dict:
    """
    Auto-maps column headers in uploaded files using user-corrections and fuzzy semantic ratios.
    Returns dictionary: { shopify_target_header: source_header }
    """
    mappings = {}
    
    # 1. Fetch user-approved corrections from SQLite
    corrections = db.query(UserCorrection).filter(UserCorrection.source_sheet == source_sheet_type).all()
    correction_dict = {c.user_column: c.source_column for c in corrections}
    
    # 2. Fetch default mappings
    default_maps = db.query(ColumnMapping).filter(ColumnMapping.source_sheet == source_sheet_type).all()
    default_dict = {m.shopify_column: m.source_column for m in default_maps}
    
    for shopify_col, synonyms in SEMANTIC_THESAURUS.items():
        # A. Use user correction if exists
        if shopify_col in correction_dict and correction_dict[shopify_col] in source_columns:
            mappings[shopify_col] = correction_dict[shopify_col]
            continue
            
        # B. Use default mapped seed column if exists
        if shopify_col in default_dict and default_dict[shopify_col] in source_columns:
            mappings[shopify_col] = default_dict[shopify_col]
            continue
            
        # C. Fuzzy match using ratio scoring
        best_match = None
        best_score = 0.0
        
        for col in source_columns:
            col_lower = col.lower()
            # Exact match
            if col_lower == shopify_col.lower():
                best_match = col
                best_score = 1.0
                break
                
            # Synonym exact match
            if col_lower in synonyms:
                best_match = col
                best_score = 0.95
                break
                
            # Fuzzy match synonyms
            for syn in synonyms:
                score = difflib.SequenceMatcher(None, col_lower, syn).ratio()
                if score > best_score:
                    best_score = score
                    best_match = col
                    
        # Apply fuzzy match if above threshold (e.g. 70% match)
        if best_match and best_score >= 0.70:
            mappings[shopify_col] = best_match
            
    return mappings

# --- FIELD GENERATORS (BRAND, TAGS, MYNTRA SPECS) ---

def determine_brand(division: str, db: Session) -> str:
    """
    Determines Brand based on Division logic:
    Footwear -> Toothless
    Apparel/Accessories -> Purple United Kids
    """
    div_upper = str(division).upper().strip()
    rule = db.query(BrandRule).filter(BrandRule.division == div_upper).first()
    if rule:
        return rule.brand_name
        
    # Standard Fallback
    if "FOOTWEAR" in div_upper or "SHOE" in div_upper:
        return "Toothless"
    return "Purple United Kids"

def generate_tags(division: str, category: str, gender: str) -> str:
    """
    Generates standard Division, Category, Gender, All Products, NEW LAUNCH tags list.
    If gender includes 'infant', 'Infant' is used in place of gender.
    """
    div = str(division).title().strip()
    cat = str(category).title().strip()
    gen = str(gender).title().strip()
    
    # Determine the gender/infant tag
    gen_lower = gen.lower()
    if "infant" in gen_lower:
        gen_tag = "Infant"
    elif "girl" in gen_lower or "female" in gen_lower:
        gen_tag = "Girls"
    elif "boy" in gen_lower or "male" in gen_lower:
        gen_tag = "Boys"
    elif "unisex" in gen_lower:
        gen_tag = "Girls, Boys"
    else:
        gen_tag = gen if gen else "Girls"
        
    tags = [div, cat, gen_tag, "All Products", "NEW LAUNCH"]
    return ", ".join(tags)

def generate_myntra_specs(division: str, category: str, gender: str, upper_mat: str, sole_mat: str, fabric_mat: str, db: Session) -> str:
    """
    Generates formatted custom Myntra Specs Info metafield string.
    Uses database-configured templates for category dependency.
    """
    div_upper = str(division).upper().strip()
    
    # 1. Fetch template from database
    tmpl = db.query(CategorySpecTemplate).filter(CategorySpecTemplate.division == div_upper).first()
    template_str = tmpl.template_format if tmpl else ""
    
    # Normalizations
    prod_name = str(category).title().strip()
    gender_norm = str(gender).title().strip()
    
    # Build standard Commodity gender tag
    commodity_gender = gender_norm
    if "Kids " in commodity_gender:
        commodity_gender = commodity_gender.replace("Kids ", "")
        
    if "Boys" in commodity_gender:
        commodity_gender = "Boys"
    elif "Girls" in commodity_gender:
        commodity_gender = "Girls"
        
    # Standard formats if template not found or fallback
    if div_upper == "FOOTWEAR":
        # Upper Material, Sole, Items, Commodity
        u = upper_mat or "SYNTHETIC"
        s = sole_mat or "TPR"
        
        g_lower = gender_norm.lower()
        if "girl" in g_lower or "female" in g_lower:
            c_gender = "Girls"
        elif "boy" in g_lower or "male" in g_lower:
            c_gender = "Boys"
        else:
            c_gender = "Unisex"
            
        # E.g. Boys Infant Booties
        sub_div = "Infant" if "booties" in prod_name.lower() else ""
        commodity = f"{c_gender} {sub_div} {prod_name}".replace("  ", " ").strip()
        
        if not template_str:
            template_str = "Upper Material: {upper}\nSole: {sole}\nItems Included in Packaging: 1 Pair {prod_name}\nCommodity: {commodity}"
            
        return template_str.format(upper=u, sole=s, prod_name=prod_name, commodity=commodity)
        
    elif div_upper == "APPAREL":
        # Upper Material (Fabric), Items, Commodity
        f_mat = fabric_mat or upper_mat or "Cotton"
        
        g_lower = gender_norm.lower()
        if "girl" in g_lower or "female" in g_lower:
            c_gender = "Girl"
        elif "boy" in g_lower or "male" in g_lower:
            c_gender = "Boy"
        else:
            c_gender = "Unisex"
            
        # Decide if "1 Pair" or "1" piece
        pack_term = "1 Pair" if "set" in prod_name.lower() or "suit" in prod_name.lower() or "trouser" in prod_name.lower() else "1"
        commodity = f"{c_gender}'s {prod_name}"
        
        if not template_str:
            template_str = "Fabric: {fabric}\nItems Included in Packaging: {pack_term} {prod_name}\nCommodity: {commodity}"
            
        return template_str.format(fabric=f_mat, pack_term=pack_term, prod_name=prod_name, commodity=commodity)
        
    else:  # ACCESSORIES
        if not template_str:
            template_str = "Items Included in Packaging: 1 {prod_name}\nCommodity : {prod_name}"
            
        return template_str.format(prod_name=prod_name)

# --- CORE VALIDATION LAYER ---

def validate_listings(df_master: pd.DataFrame, master_mappings: dict, df_content: pd.DataFrame, content_mappings: dict) -> list:
    """
    Validates data frames against ecommerce listing requirements.
    Returns a list of warning dicts: { "type": "ERROR"|"WARNING", "message": "...", "sku": "..." }
    """
    warnings = []
    
    # 1. Validate Mastersheet Mappings
    req_master = ["Variant SKU", "Option1 Value", "Variant Compare At Price"]
    for col in req_master:
        if col not in master_mappings:
            warnings.append({"type": "ERROR", "message": f"Mastersheet is missing a column mapped to Shopify '{col}'", "sku": ""})
            
    # 2. Validate Content Mappings
    req_content = ["Title", "Body (HTML)", "Variant Barcode"]
    for col in req_content:
        if col not in content_mappings:
            warnings.append({"type": "ERROR", "message": f"Content Sheet is missing a column mapped to Shopify '{col}'", "sku": ""})
            
    if any(w["type"] == "ERROR" for w in warnings):
        return warnings # Stop validation if core columns missing
        
    # 3. Check for specific records validation
    # Extract headers
    m_sku_col = master_mappings["Variant SKU"]
    m_size_col = master_mappings["Option1 Value"]
    m_price_col = master_mappings["Variant Compare At Price"]
    m_link_col = master_mappings.get("Variant SKU Link", "Item Color")
    
    c_style_col = content_mappings["Variant Barcode"]
    c_link_col = content_mappings.get("Variant SKU Link", "SKU")
    c_title_col = content_mappings["Title"]
    
    # Track unique items
    seen_skus = set()
    seen_handles = set()
    
    # A. Check Mastersheet items
    for idx, row in df_master.iterrows():
        sku = str(row.get(m_sku_col, "")).strip()
        size = str(row.get(m_size_col, "")).strip()
        price = str(row.get(m_price_col, "")).strip()
        link_val = str(row.get(m_link_col, "")).strip()
        
        # Skip trailing empty rows
        if not sku and not size and not link_val and not price:
            continue
            
        if not sku:
            warnings.append({"type": "ERROR", "message": f"Row {idx+2} in Mastersheet is missing the SKU / ITEM CODE", "sku": ""})
            continue
            
        if sku in seen_skus:
            warnings.append({"type": "WARNING", "message": f"Duplicate Variant SKU/Barcode '{sku}' found in Mastersheet", "sku": sku})
        seen_skus.add(sku)
        
        if not size:
            warnings.append({"type": "WARNING", "message": f"SKU '{sku}' is missing a Size value", "sku": sku})
            
        if not price or price == "0":
            warnings.append({"type": "WARNING", "message": f"SKU '{sku}' has a zero or missing MRP price", "sku": sku})
            
        # Check if Mastersheet item color groups actually match any content rows
        if link_val:
            content_match = df_content[df_content[c_link_col] == link_val]
            if len(content_match) == 0:
                # Try style code lookup
                style_match = df_content[df_content[c_style_col] == str(row.get("ITEM NAME", ""))]
                if len(style_match) == 0:
                    warnings.append({
                        "type": "WARNING", 
                        "message": f"SKU '{sku}' (color: {link_val}) has no matching record in Content Sheet.", 
                        "sku": sku
                    })

    for idx, row in df_content.iterrows():
        style_code = str(row.get(c_style_col, "")).strip()
        title = str(row.get(c_title_col, "")).strip()
        link_val = str(row.get(c_link_col, "")).strip()
        
        # Skip trailing empty rows
        if not style_code and not title and not link_val:
            continue
            
        if not style_code:
            warnings.append({"type": "WARNING", "message": f"Row {idx+2} in Content Sheet is missing Style/Item Name", "sku": ""})
            
        if not title:
            warnings.append({"type": "ERROR", "message": f"Style '{style_code}' in Content Sheet is missing D2C Title", "sku": style_code})
            
        handle = slugify(title)
        if handle in seen_handles:
            warnings.append({"type": "WARNING", "message": f"Duplicate Handle generated for Title: '{title}'", "sku": style_code})
        seen_handles.add(handle)
        
    return warnings
