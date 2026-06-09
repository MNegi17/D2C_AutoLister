import os
import pandas as pd
from sqlalchemy.orm import Session
from database import init_db, SessionLocal
from core import auto_map_columns, read_excel_fast, read_csv_fast

# Paths
mastersheet_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\ITEM DIRECTORY - MAIN_8June.xlsx"
content_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\Content Sheet.xlsx"
template_path = r"c:\Users\Manann\Desktop\D2C_AutoLister\Sample\products_export_template.csv"

init_db()
db = SessionLocal()

# Load
df_master = read_excel_fast(mastersheet_path, "Report", max_rows=45000)
df_content = read_excel_fast(content_path, "MarketplaceD2C", max_rows=1000)

df_master_filtered = df_master[df_master['ITEM NAME'] == 'TBBTBA003027'].copy()
df_content_filtered = df_content[df_content['Item Name'] == 'TBBTBA003027'].copy()

print("=== DIAGNOSIS ===")
print("df_master_filtered shape:", df_master_filtered.shape)
print("df_content_filtered shape:", df_content_filtered.shape)

master_cols = list(df_master.columns)
content_cols = list(df_content.columns)

master_mappings = auto_map_columns(master_cols, "mastersheet", db)
content_mappings = auto_map_columns(content_cols, "contentsheet", db)

m_link_col = master_mappings.get("Variant SKU Link", "Item Color")
c_link_col = content_mappings.get("Variant SKU Link", "SKU")
c_style_col = content_mappings["Variant Barcode"] # Item Name

print("m_link_col:", m_link_col)
print("c_link_col:", c_link_col)

print("\nMastersheet 'Item Color' values:")
for idx, row in df_master_filtered.iterrows():
    print(f"  Row {idx} | ITEM NAME: '{row['ITEM NAME']}' | Item Color: '{row.get(m_link_col, '')}'")

print("\nContent Sheet 'SKU' and 'Item Name' values:")
for idx, row in df_content_filtered.iterrows():
    print(f"  Row {idx} | Item Name: '{row.get(c_style_col, '')}' | SKU: '{row.get(c_link_col, '')}'")

# Recreate dictionaries and print check
content_link_dict = {}
content_style_dict = {}
for idx, row in df_content_filtered.iterrows():
    l_val = str(row.get(c_link_col, "")).strip()
    s_val = str(row.get(c_style_col, "")).strip()
    content_link_dict[l_val] = row
    content_style_dict[s_val] = row
    print(f"  Adding Content Key link: '{l_val}' style: '{s_val}'")

for link_val in df_master_filtered[m_link_col].unique():
    match = content_link_dict.get(link_val)
    print(f"  Checking link '{link_val}': match found? {match is not None}")
