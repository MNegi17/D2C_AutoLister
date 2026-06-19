import os
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

# Setup Database path dynamically
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    DB_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_PATH = os.path.join(DB_DIR, "autolister.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Handle the postgres:// to postgresql:// scheme rewrite compatibility (e.g. on Render/Railway)
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ColumnMapping(Base):
    """
    Stores column mappings from source sheets (Mastersheet, Content Sheet)
    to the target Shopify upload template.
    """
    __tablename__ = "column_mappings"
    id = Column(Integer, primary_key=True, index=True)
    source_sheet = Column(String, nullable=False)  # 'mastersheet', 'contentsheet'
    source_column = Column(String, nullable=False)   # e.g., 'D2C Title'
    shopify_column = Column(String, nullable=False)  # e.g., 'Title'
    confidence = Column(Integer, default=100)        # matching confidence score 0-100

class BrandRule(Base):
    """
    Stores automatic brand assignments based on product category division.
    """
    __tablename__ = "brand_rules"
    id = Column(Integer, primary_key=True, index=True)
    division = Column(String, unique=True, nullable=False, index=True)  # 'Footwear', 'Apparel', 'Accessories'
    brand_name = Column(String, nullable=False)                          # 'Toothless', 'Purple United Kids'

class CategorySpecTemplate(Base):
    """
    Stores category-specific formatting layouts for complex fields like myntra_specs_info.
    """
    __tablename__ = "category_spec_templates"
    id = Column(Integer, primary_key=True, index=True)
    division = Column(String, unique=True, nullable=False, index=True)  # 'Footwear', 'Apparel', 'Accessories'
    template_format = Column(Text, nullable=False)                       # Layout formatting structure

class UserCorrection(Base):
    """
    Stores persistent overrides and mapping corrections saved by the user.
    If a user corrects a mapping once, it overrides default/semantic logic.
    """
    __tablename__ = "user_corrections"
    id = Column(Integer, primary_key=True, index=True)
    source_sheet = Column(String, nullable=False)   # 'mastersheet' or 'contentsheet'
    source_column = Column(String, nullable=False)  # original column header in file
    user_column = Column(String, nullable=False)    # corrected target Shopify column header
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ProcessingHistory(Base):
    """
    Keeps audit records of previously generated lists, counts, and files.
    """
    __tablename__ = "processing_history"
    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    mastersheet_name = Column(String, nullable=False)
    contentsheet_name = Column(String, nullable=False)
    output_csv_name = Column(String, nullable=False)
    total_products = Column(Integer, default=0)
    total_variants = Column(Integer, default=0)
    status = Column(String, default="Success")  # 'Success', 'Failed'
    warnings_count = Column(Integer, default=0)

def init_db():
    """
    Initialize SQLite tables and insert default business rules.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # 1. Insert default Brand Rules if empty
        if db.query(BrandRule).count() == 0:
            default_brands = [
                BrandRule(division="FOOTWEAR", brand_name="Toothless"),
                BrandRule(division="APPAREL", brand_name="Purple United Kids"),
                BrandRule(division="ACCESSORIES", brand_name="Purple United Kids")
            ]
            db.add_all(default_brands)
        
        # 2. Insert default Category Specs Templates if empty
        if db.query(CategorySpecTemplate).count() == 0:
            default_templates = [
                CategorySpecTemplate(
                    division="FOOTWEAR",
                    template_format=(
                        "Item Color: {Item Color}\n"
                        "Upper Material: {upper}\n"
                        "Sole: {sole}\n"
                        "Items Included in Packaging: 1 Pair {prod_name}\n"
                        "Commodity: {commodity}"
                    )
                ),
                CategorySpecTemplate(
                    division="APPAREL",
                    template_format=(
                        "Item Color: {Item Color}\n"
                        "Fabric: {fabric}\n"
                        "Items Included in Packaging: {pack_term} {prod_name}\n"
                        "Commodity: {commodity}"
                    )
                ),
                CategorySpecTemplate(
                    division="ACCESSORIES",
                    template_format=(
                        "Items Included in Packaging: 1 {prod_name}\n"
                        "Commodity : {prod_name}"
                    )
                )
            ]
            db.add_all(default_templates)
        else:
            # Upgrade existing records to prepend Item Color if missing
            for div in ["FOOTWEAR", "APPAREL"]:
                tmpl = db.query(CategorySpecTemplate).filter(CategorySpecTemplate.division == div).first()
                if tmpl and "Item Color" not in tmpl.template_format and "item_color" not in tmpl.template_format:
                    tmpl.template_format = "Item Color: {Item Color}\n" + tmpl.template_format
            
        # 3. Insert default column mapping dictionary if empty
        if db.query(ColumnMapping).count() == 0:
            default_mappings = [
                # Content Sheet mappings
                ColumnMapping(source_sheet="contentsheet", source_column="D2C Title", shopify_column="Title"),
                ColumnMapping(source_sheet="contentsheet", source_column="Description", shopify_column="Body (HTML)"),
                ColumnMapping(source_sheet="contentsheet", source_column="SKU", shopify_column="Variant SKU Link"),
                
                # Mastersheet mappings
                ColumnMapping(source_sheet="mastersheet", source_column="ITEM CODE", shopify_column="Variant SKU"),
                ColumnMapping(source_sheet="mastersheet", source_column="ITEM NAME", shopify_column="Variant Barcode"),
                ColumnMapping(source_sheet="mastersheet", source_column="Item Color", shopify_column="Variant SKU Link"),
                ColumnMapping(source_sheet="mastersheet", source_column="SIZE", shopify_column="Option1 Value"),
                ColumnMapping(source_sheet="mastersheet", source_column="MRP", shopify_column="Variant Compare At Price"),
                ColumnMapping(source_sheet="mastersheet", source_column="UPPER", shopify_column="Upper Material"),
                ColumnMapping(source_sheet="mastersheet", source_column="SOLE", shopify_column="Sole Material"),
                ColumnMapping(source_sheet="mastersheet", source_column="FABRIC", shopify_column="Fabric Material")
            ]
            db.add_all(default_mappings)
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

def get_db():
    """
    Dependency context provider for API session injection
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
