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
    
    print("\n=== INTEGRATION TEST PASSED SUCCESSFULLY (100% CORRECT SCHEMA AND RULES) ===")
    db.close()

if __name__ == "__main__":
    run_integration_test()
