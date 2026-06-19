import os
import pandas as pd
from sqlalchemy.orm import Session
from datetime import datetime
from core import slugify, generate_tags, generate_myntra_specs, determine_brand

# Standard Shopify default column values
DEFAULT_SHOPIFY_VALUES = {
    "Published": "TRUE",
    "Variant Inventory Tracker": "shopify",
    "Variant Inventory Qty": "0",
    "Variant Inventory Policy": "deny",
    "Variant Fulfillment Service": "manual",
    "Variant Requires Shipping": "TRUE",
    "Variant Taxable": "TRUE",
    "Gift Card": "FALSE",
    "Variant Weight Unit": "kg",
    "Variant Grams": "200",
    "Status": "active"
}

def get_google_category(division: str, category: str) -> str:
    """
    Returns standard Google Shopping product category path based on Division.
    """
    div = str(division).upper().strip()
    cat = str(category).upper().strip()
    if div == "FOOTWEAR":
        return "Apparel & Accessories > Shoes"
    elif div == "APPAREL":
        return "Apparel & Accessories > Clothing"
    elif "TOY" in cat:
        return "Toys & Games > Toys"
    else:
        return "Apparel & Accessories > Clothing Accessories"

def get_default_discount_price(compare_price_str: str, division: str) -> str:
    """
    Applies default pricing rules:
    Footwear: 30% discount (price = compare * 0.7)
    Apparel/Accessories: 50% discount (price = compare * 0.5)
    If comparison is invalid, price equals MRP.
    """
    if not compare_price_str:
        return ""
    try:
        mrp = float(compare_price_str)
        div = str(division).upper().strip()
        if div == "FOOTWEAR":
            val = round(mrp * 0.7)
        elif div == "APPAREL":
            # Check if custom coordination set or higher value
            if mrp > 2000:
                val = round(mrp * 0.48) # roughly 52% discount like historical coord sets
            else:
                val = round(mrp * 0.5)
        else: # Accessories
            val = mrp # default no discount
        
        # Round to end with 9 (e.g. 699, 499) for retail psychological pricing
        val_str = str(val)
        if len(val_str) > 1:
            val = (val // 10) * 10 + 9
        return str(int(val))
    except Exception:
        return compare_price_str

def generate_shopify_csv(
    df_master: pd.DataFrame,
    master_mappings: dict,
    df_content: pd.DataFrame,
    content_mappings: dict,
    df_template: pd.DataFrame,
    db: Session,
    price_overrides: dict = None,  # { SKU_Link: Variant Price } from user review
    allowed_style_links: set = None
) -> pd.DataFrame:
    """
    Main AutoLister engine that takes the files, applies learning rules, groups variants,
    populates Shopify headers, and outputs the final populated dataframe.
    """
    # 1. Resolve source columns
    m_sku_col = master_mappings["Variant SKU"] # ITEM CODE
    m_size_col = master_mappings["Option1 Value"] # SIZE
    m_mrp_col = master_mappings["Variant Compare At Price"] # MRP
    m_link_col = master_mappings.get("Variant SKU Link", "Item Color") # e.g., 'Item Color'
    m_barcode_col = master_mappings.get("Variant Barcode", "ITEM NAME") # ITEM NAME
    
    # Material info in Mastersheet
    m_upper_col = master_mappings.get("Upper Material", "UPPER")
    m_sole_col = master_mappings.get("Sole Material", "SOLE")
    m_fabric_col = master_mappings.get("Fabric Material", "FABRIC")
    
    c_style_col = content_mappings.get("Variant Barcode", "Item Name") # Item Name
    c_link_col = content_mappings.get("Variant SKU Link", "SKU") # SKU (Style + Color)
    c_title_col = content_mappings["Title"] # D2C Title
    c_desc_col = content_mappings["Body (HTML)"] # Description
    
    # 2. Identify all groups in Mastersheet by m_link_col (Style + Color)
    groups = df_master.groupby(m_link_col)
    
    # Pre-index Content Sheet records into O(1) dictionary hash-maps for instant lookup
    content_link_dict = {}
    content_style_dict = {}
    for idx, row in df_content.iterrows():
        l_val = str(row.get(c_link_col, "")).strip()
        s_val = str(row.get(c_style_col, "")).strip()
        if l_val:
            content_link_dict[l_val] = row
        if s_val:
            content_style_dict[s_val] = row
            
    shopify_rows = []
    template_cols = list(df_template.columns)
    
    # Set default values for override dictionary
    price_overrides = price_overrides or {}
    
    for link_val, df_group in groups:
        if not link_val:
            continue
            
        # Filter by allowed style links if provided
        if allowed_style_links and str(link_val).strip() not in allowed_style_links:
            continue

            
        # A. Find corresponding Content Sheet copy (O(1) lookup)
        content_row = content_link_dict.get(link_val)
        
        # Fallback 1: search by base style code in Mastersheet first row
        first_master_row = df_group.iloc[0]
        style_code = str(first_master_row.get(m_barcode_col, "")).strip()
        
        if content_row is None and style_code:
            content_row = content_style_dict.get(style_code)
            
        if content_row is None:
            # Skip or generate with basic details if no copy content found
            continue
        
        # B. Extract content fields
        d2c_title = str(content_row.get(c_title_col, "")).strip()
        description = str(content_row.get(c_desc_col, "")).strip()
        division = str(content_row.get("DIVISION", first_master_row.get("DIVISION", "Apparel"))).strip()
        category = str(content_row.get("CATEGORY", first_master_row.get("CATEGORY", "T-Shirt"))).strip()
        
        # Apply specific category mapping overrides (website-level category matches)
        cat_lower = category.lower()
        if "toy" in cat_lower:
            category = "Soft Toys"
        elif "sandal" in cat_lower:
            category = "Sandals"
        elif "jeans" in cat_lower:
            category = "Denim"
        elif "booties" in cat_lower:
            category = "Baby Booties"
            
        gender = str(content_row.get("GENDER", first_master_row.get("GENDER", "Girls"))).strip()
        shade = str(content_row.get("SHADE NAME", first_master_row.get("COLOR", ""))).strip()
        
        handle = slugify(d2c_title)
        brand = determine_brand(division, db)
        tags = generate_tags(division, category, gender)
        google_cat = get_google_category(division, category)
        
        # Extract materials for specs
        upper_mat = str(first_master_row.get(m_upper_col, "")).strip()
        sole_mat = str(first_master_row.get(m_sole_col, "")).strip()
        fabric_mat = str(first_master_row.get(m_fabric_col, "")).strip()
        
        specs_info = generate_myntra_specs(division, category, gender, upper_mat, sole_mat, fabric_mat, shade, db)
        
        # Determine Shopify option1 name
        opt1_name = "Size In Uk"
        div_upper = division.upper()
        if "APPAREL" in div_upper:
            opt1_name = "Size In Years"
        elif "ACCESSORIES" in div_upper:
            # Check accessories export sizes (e.g. Size in CM or standard)
            opt1_name = "Size In CM" if "toy" in category.lower() else "Size"
            
        # C. Loop over variants in the Mastersheet group
        for var_idx, master_row in enumerate(df_group.to_dict(orient="records")):
            row_dict = {col: "" for col in template_cols}
            
            # Map standard Variant fields
            var_sku = str(master_row.get(m_sku_col, "")).strip()
            # If SKU is empty or null, use item code
            if not var_sku:
                continue
                
            size_val = str(master_row.get(m_size_col, "")).strip()
            compare_price = str(master_row.get(m_mrp_col, "")).strip()
            
            # Calculate selling price with overrides fallback
            if link_val in price_overrides:
                selling_price = price_overrides[link_val]
            else:
                selling_price = get_default_discount_price(compare_price, division)
                
            # Populate standard variant fields
            row_dict["Handle"] = handle
            row_dict["Option1 Name"] = opt1_name
            row_dict["Option1 Value"] = size_val
            row_dict["Variant SKU"] = var_sku
            row_dict["Variant Barcode"] = str(master_row.get(m_barcode_col, "")).strip()
            row_dict["Variant Price"] = selling_price
            row_dict["Variant Compare At Price"] = compare_price
            
            # Apply defaults for all variants
            for k, v in DEFAULT_SHOPIFY_VALUES.items():
                if k in row_dict:
                    row_dict[k] = v
                    
            # Set age group based on gender rules
            gen_lower = gender.lower()
            if "infant" in gen_lower:
                age_group_val = "Infant"
            elif "girl" in gen_lower or "female" in gen_lower:
                age_group_val = "Girls"
            elif "boy" in gen_lower or "male" in gen_lower:
                age_group_val = "Boys"
            elif "unisex" in gen_lower:
                age_group_val = "Unisex"
            else:
                age_group_val = "Girls"

            # Set metafields for all rows
            if "infant" in gen_lower:
                gender_meta = "Infants"
            elif "girl" in gen_lower or "female" in gen_lower:
                gender_meta = "Girls"
            elif "boy" in gen_lower or "male" in gen_lower:
                gender_meta = "Boys"
            else:
                gender_meta = "Unisex"
            row_dict["Gender (product.metafields.custom.gender)"] = gender_meta
            row_dict["Manufacture Date (product.metafields.custom.manufacture_date)"] = str(datetime.now().year)
            row_dict["Myntra Specs Info (product.metafields.custom.myntra_specs_info)"] = specs_info
            row_dict["new launch (product.metafields.custom.new_launch)"] = "NEW LAUNCH"
            row_dict["Google Shopping / Google Product Category"] = google_cat
            row_dict["Google Shopping / Gender"] = category.title()
            row_dict["Google Shopping / Age Group"] = age_group_val
            
            # D. Populate Product Main Fields (ONLY in the FIRST row of the product)
            if var_idx == 0:
                row_dict["Title"] = d2c_title
                row_dict["Body (HTML)"] = description
                row_dict["Vendor"] = brand
                row_dict["Product Category"] = google_cat
                row_dict["Type"] = category.title()
                row_dict["Tags"] = tags
                row_dict["SEO Title"] = d2c_title
                row_dict["SEO Description"] = description[:320] + "..." if len(description) > 320 else description
                
            shopify_rows.append(row_dict)
            
    # Create final DataFrame matching blank template columns exactly
    df_output = pd.DataFrame(shopify_rows, columns=template_cols)
    return df_output
