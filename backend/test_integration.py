import os
import pandas as pd
from sqlalchemy.orm import Session
from database import init_db, SessionLocal, ColumnMapping
from core import auto_map_columns, validate_listings
from generator import generate_shopify_csv

def run_integration_test():
    print("=== STARTING INTEGRATION TEST ===")
    
    # 1. Initialize DB
    init_db()
    db = SessionLocal()
    
    # 2. Paths
    mastersheet_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\ITEM DIRECTORY - MAIN_8June.xlsx"
    content_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\Content Sheet.xlsx"
    template_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\products_export_template.csv"
    output_dir = r"c:\Users\Manann\Desktop\D2C_AutoLister\outputs"
    os.makedirs(output_dir, exist_ok=True)
    
    print("\n[Step 1] Loading sample sheets (streaming optimized)...")
    from core import read_excel_fast, read_csv_fast
    
    # Use max_rows for speed in testing but enough to match actual groups
    df_master = read_excel_fast(mastersheet_path, "Report", max_rows=45000)
    df_content = read_excel_fast(content_path, "MarketplaceD2C", max_rows=1000)
    
    # Target only the representative booties style TBBTBA003027
    df_master = df_master[df_master['ITEM NAME'] == 'TBBTBA003027'].copy()
    df_content = df_content[df_content['Item Name'] == 'TBBTBA003027'].copy()
    
    df_template = read_csv_fast(template_path)
    
    print(f"  Mastersheet loaded: {len(df_master)} rows")
    print(f"  Content Sheet loaded: {len(df_content)} rows")
    print(f"  Shopify Template loaded: {len(df_template.columns)} columns")
    
    print("\n[Step 2] Executing Semantic Column Mappings...")
    master_cols = list(df_master.columns)
    content_cols = list(df_content.columns)
    
    master_mappings = auto_map_columns(master_cols, "mastersheet", db)
    content_mappings = auto_map_columns(content_cols, "contentsheet", db)
    
    print("  Mastersheet Mapped Columns:")
    for k, v in master_mappings.items():
        print(f"    - {k} -> {v}")
        
    print("  Content Sheet Mapped Columns:")
    for k, v in content_mappings.items():
        print(f"    - {k} -> {v}")
        
    # Check that required columns were mapped
    assert "Variant SKU" in master_mappings, "Variant SKU not mapped!"
    assert "Title" in content_mappings, "Title not mapped!"
    
    print("\n[Step 3] Running Listing Pre-Validation...")
    warnings = validate_listings(df_master, master_mappings, df_content, content_mappings)
    errors = [w for w in warnings if w["type"] == "ERROR"]
    warning_list = [w for w in warnings if w["type"] == "WARNING"]
    
    print(f"  Validation complete: {len(errors)} Errors, {len(warning_list)} Warnings.")
    
    # Test should run clean of critical blocker errors
    assert len(errors) == 0, f"Blocking Errors found in validation: {errors}"
    
    print("\n[Step 4] Compiling and Populating Shopify CSV Output...")
    df_output = generate_shopify_csv(
        df_master=df_master,
        master_mappings=master_mappings,
        df_content=df_content,
        content_mappings=content_mappings,
        df_template=df_template,
        db=db
    )
    
    print(f"  Populated Shopify Sheet: {len(df_output)} rows.")
    assert len(df_output) > 0, "No rows generated in output Shopify CSV!"
    
    # Verify that the generated columns match the template exactly
    assert list(df_output.columns) == list(df_template.columns), "Output columns structure does not match the blank template!"
    print("  [OK] Column alignment matches the blank template column-for-column.")
    
    # Verify Brand Assignment Rules
    unique_vendors = [v for v in df_output['Vendor'].dropna().unique() if v != ""]
    print("  [OK] Assigned Brand Names:", unique_vendors)
    for v in unique_vendors:
        assert v.lower() in ["toothless", "purple united kids"], f"Invalid brand name assigned: {v}"
        
    # Verify complex Tags logic
    first_product_row = df_output[df_output['Tags'].notnull() & (df_output['Tags'] != "")].iloc[0]
    tags_generated = first_product_row['Tags']
    print(f"  [OK] Sample generated tags: '{tags_generated}'")
    assert "All Apparel" in tags_generated or "All Footwear" in tags_generated or "Apparel" in tags_generated or "Footwear" in tags_generated, "Tags do not contain standard Apparel/Footwear categories!"
    
    # Verify Myntra Specs Info
    specs_generated = first_product_row['Myntra Specs Info (product.metafields.custom.myntra_specs_info)']
    print("  [OK] Sample Myntra Specs Info metafield preview:")
    print("---------------------------------------")
    print(specs_generated)
    print("---------------------------------------")
    assert "Upper Material" in specs_generated, "Specs Info missing Upper Material!"
    
    # Save test file
    test_out_path = os.path.join(output_dir, "shopify_integration_test_output.csv")
    df_output.to_csv(test_out_path, index=False, encoding="utf-8-sig")
    print(f"\n[Step 5] Integration output saved successfully to {test_out_path}")
    
    print("\n[Step 6] Running targeted business logic tests for new rules...")
    from core import resolve_category, generate_tags, generate_myntra_specs
    
    # 1. Test POLO T-SHIRT conversion
    assert resolve_category("POLO T-SHIRT") == "T-Shirt", "POLO T-SHIRT did not convert to T-Shirt!"
    assert resolve_category("POLO T SHIRT") == "T-Shirt", "POLO T SHIRT did not convert to T-Shirt!"
    print("  [OK] POLO T-SHIRT strictly converts to T-Shirt")
    
    # 2. Test DENIM subcategory mapping
    assert resolve_category("DENIM", "JEANS") == "Jeans", "DENIM + JEANS failed!"
    assert resolve_category("DENIM", "SHIRT F/S") == "Shirt", "DENIM + SHIRT F/S failed!"
    assert resolve_category("DENIM", "SHIRT H/S") == "Shirt", "DENIM + SHIRT H/S failed!"
    assert resolve_category("DENIM", "DUNGAREE SET F/S") == "Dungaree", "DENIM + DUNGAREE SET F/S failed!"
    assert resolve_category("DENIM", "DUNGAREE SET") == "Dungaree", "DENIM + DUNGAREE SET failed!"
    assert resolve_category("DENIM", "DUNGAREE") == "Dungaree", "DENIM + DUNGAREE failed!"
    assert resolve_category("DENIM", "CO-ORD SET") == "Clothing Set", "DENIM + CO-ORD SET failed!"
    assert resolve_category("DENIM", "BERMUDA") == "Bermuda", "DENIM + BERMUDA failed!"
    assert resolve_category("DENIM", "JUMPSUIT") == "Jumpsuit", "DENIM + JUMPSUIT failed!"
    assert resolve_category("DENIM", "DRESS") == "Dress", "DENIM + DRESS failed!"
    assert resolve_category("DENIM", "JACKET") == "Jacket", "DENIM + JACKET failed!"
    assert resolve_category("DENIM", "SHORTS") == "Shorts", "DENIM + SHORTS failed!"
    assert resolve_category("DENIM", "SKIRT") == "Skirt", "DENIM + SKIRT failed!"
    assert resolve_category("DENIM", "TOP") == "Top", "DENIM + TOP failed!"
    assert resolve_category("DENIM", "DENIM") == "Denim", "DENIM + DENIM failed!"
    print("  [OK] DENIM subcategories correctly resolved (Shirts, Dungarees, Sets, etc.)")
    
    # 3. Test Tags Generation for Unisex & Infant Sub Division
    tag_unisex_infant = generate_tags("Apparel", "Dungaree", "KIDS-UNISEX", "INFANT")
    assert "Infants" in tag_unisex_infant and "Girls, Boys" not in tag_unisex_infant, f"Unisex + Infant tags incorrect: {tag_unisex_infant}"
    
    tag_unisex_older = generate_tags("Apparel", "Dungaree", "UNISEX", "TODDLER")
    assert "Unisex" in tag_unisex_older and "Infants" not in tag_unisex_older, f"Unisex + Toddler tags incorrect: {tag_unisex_older}"
    
    tag_girls = generate_tags("Apparel", "Top", "KIDS GIRLS", "OLDER")
    assert "Girls" in tag_girls, f"Girls tags incorrect: {tag_girls}"
    
    tag_boys = generate_tags("Apparel", "Shirt", "KIDS BOYS", "OLDER")
    assert "Boys" in tag_boys, f"Boys tags incorrect: {tag_boys}"
    print("  [OK] Tags generated with Unisex + Sub Division rules (Infants vs Unisex)")
    
    # 4. Test Myntra Specs Commodity for Unisex vs Gendered
    specs_unisex = generate_myntra_specs("APPAREL", "Dungaree", "KIDS-UNISEX", "", "", "Cotton", "TEST-LINK", db, "INFANT")
    assert "Commodity: Unisex Dungaree" in specs_unisex, f"Unisex Commodity formatting failed: {specs_unisex}"
    assert "Unisex's" not in specs_unisex, "Unisex's should not appear in specs!"
    
    specs_girl = generate_myntra_specs("APPAREL", "Top", "KIDS GIRLS", "", "", "Cotton", "TEST-LINK", db, "OLDER")
    assert "Commodity: Girl's Top" in specs_girl, f"Girl Commodity formatting failed: {specs_girl}"
    
    specs_boy = generate_myntra_specs("APPAREL", "T-Shirt", "KIDS BOYS", "", "", "Cotton", "TEST-LINK", db, "TODDLER")
    assert "Commodity: Boy's T-Shirt" in specs_boy, f"Boy Commodity formatting failed: {specs_boy}"
    print("  [OK] Myntra Specs Commodity formatted cleanly ('Unisex Dungaree' without 's)")
    
    print("\n=== ALL INTEGRATION & BUSINESS LOGIC TESTS PASSED (100% VERIFIED) ===")
    db.close()

if __name__ == "__main__":
    run_integration_test()
