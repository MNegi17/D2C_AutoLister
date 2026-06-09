"use client";

import React, { useState, useEffect } from "react";

const API_BASE = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080")
  : "http://localhost:8080";

const SEMANTIC_THESAURUS = {
  "Title": ["d2c title", "amazon title", "myntra title", "nykaa title", "pdp name", "title", "product name", "item description"],
  "Body (HTML)": ["description", "body", "bullet points", "marketing content", "product description"],
  "Variant SKU": ["item code", "sku", "barcode", "variant sku", "variant barcode", "sno"],
  "Variant Barcode": ["item name", "style", "style code", "item color", "color", "shade name"],
  "Option1 Value": ["size", "option1 value", "euro", "length in cm", "age group"],
  "Variant Compare At Price": ["mrp", "compare price", "list price", "compare at price", "variant compare at price"],
  "Variant Price": ["price", "selling price", "variant price", "d2c price"],
  "Upper Material": ["upper", "material", "fabric", "upper material"],
  "Sole Material": ["sole", "sole material"]
};

export default function AutoListerDashboard() {
  // Navigation Tabs: 'upload', 'mapper', 'pricing', 'compile', 'logs'
  const [activeTab, setActiveTab] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  
  // Files State
  const [mastersheet, setMastersheet] = useState(null);
  const [contentsheet, setContentsheet] = useState(null);
  const [template, setTemplate] = useState(null);
  const [historical, setHistorical] = useState(null);

  // Analysis Response State
  const [sessionId, setSessionId] = useState("");
  const [filesPaths, setFilesPaths] = useState({});
  const [masterHeaders, setMasterHeaders] = useState([]);
  const [contentHeaders, setContentHeaders] = useState([]);
  const [shopifyHeaders, setShopifyHeaders] = useState([]);
  
  // Mappings State
  const [masterMappings, setMasterMappings] = useState({});
  const [contentMappings, setContentMappings] = useState({});
  
  // Previews & Prices State
  const [masterPreview, setMasterPreview] = useState([]);
  const [priceOverrides, setPriceOverrides] = useState({}); // { LinkSKU: price }
  const [uniqueProducts, setUniqueProducts] = useState([]); // List of base products for price override screen
  
  // Validation State
  const [validationReport, setValidationReport] = useState([]);
  const [validationFilter, setValidationFilter] = useState("ALL"); // 'ALL', 'ERROR', 'WARNING'
  
  // Generation Response
  const [genResult, setGenResult] = useState(null);

  // DB Rules & Stats
  const [brandRules, setBrandRules] = useState([]);
  const [specTemplates, setSpecTemplates] = useState([]);
  const [learningStats, setLearningStats] = useState({
    columnMappingsLearned: 0,
    userCorrectionsSaved: 0,
    brandRulesConfigured: 3,
    specTemplatesConfigured: 3,
    corrections: []
  });
  const [historyLogs, setHistoryLogs] = useState([]);

  // Editing state for rules
  const [editingBrandId, setEditingBrandId] = useState(null);
  const [editingBrandVal, setEditingBrandVal] = useState("");
  const [editingSpecId, setEditingSpecId] = useState(null);
  const [editingSpecVal, setEditingSpecVal] = useState("");

  // Pricing controls state
  const [searchPriceQuery, setSearchPriceQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [bulkDiscountPct, setBulkDiscountPct] = useState("30");
  const [bulkDiscountDivision, setBulkDiscountDivision] = useState("ALL");

  // Allowed item colors filter list
  const [allowedItemColors, setAllowedItemColors] = useState("");

  // Matrixify Workspace State
  const [matrixifyFile, setMatrixifyFile] = useState(null);
  const [matrixifyContentSheet, setMatrixifyContentSheet] = useState(null);
  const [matrixifyResult, setMatrixifyResult] = useState(null);

  // Notifications (toast alert)
  const [toast, setToast] = useState(null);

  // Fetch SQLite configs and audit history logs on mount
  useEffect(() => {
    fetchStats();
    fetchHistory();
    fetchBrandRules();
    fetchSpecTemplates();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/learning-status`);
      if (res.ok) {
        const data = await res.json();
        setLearningStats(data);
      }
    } catch (e) {
      console.error("Failed to fetch database learning stats:", e);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryLogs(data);
      }
    } catch (e) {
      console.error("Failed to fetch history logs:", e);
    }
  };

  const fetchBrandRules = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/brand-rules`);
      if (res.ok) {
        const data = await res.json();
        setBrandRules(data);
      }
    } catch (e) {
      console.error("Failed to fetch brand rules:", e);
    }
  };

  const fetchSpecTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/spec-templates`);
      if (res.ok) {
        const data = await res.json();
        setSpecTemplates(data);
      }
    } catch (e) {
      console.error("Failed to fetch spec templates:", e);
    }
  };

  const handleUpdateBrandRule = async (division, newBrand) => {
    if (!newBrand.trim()) {
      showToast("Brand name cannot be empty", "error");
      return;
    }
    try {
      const formData = new FormData();
      formData.append("division", division);
      formData.append("brand_name", newBrand);

      const res = await fetch(`${API_BASE}/api/brand-rules/update`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        showToast(`Brand assignment for ${division} updated to "${newBrand}"`);
        setEditingBrandId(null);
        fetchBrandRules();
        fetchStats();
      } else {
        showToast("Failed to update brand rule", "error");
      }
    } catch (e) {
      showToast("Error updating brand assignment rule", "error");
    }
  };

  const handleUpdateSpecTemplate = async (division, formatStr) => {
    try {
      JSON.parse(formatStr); // validate JSON before saving
    } catch (err) {
      showToast("Invalid JSON syntax inside template editor", "error");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("division", division);
      formData.append("format_str", formatStr);

      const res = await fetch(`${API_BASE}/api/spec-templates/update`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        showToast(`Spec template formatting updated for ${division}`);
        setEditingSpecId(null);
        fetchSpecTemplates();
        fetchStats();
      } else {
        showToast("Failed to save spec template updates", "error");
      }
    } catch (e) {
      showToast("Error updating spec templates in database", "error");
    }
  };

  // Step 1: Upload & Initial Semantic Learning
  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!mastersheet || !contentsheet || !template) {
      showToast("Please select all three mandatory sheets: Mastersheet, Content Sheet, and Shopify Template.", "error");
      return;
    }

    setLoading(true);
    setLoadingMsg("Uploading listing sheets and parsing column structures...");

    const formData = new FormData();
    formData.append("mastersheet", mastersheet);
    formData.append("contentsheet", contentsheet);
    formData.append("template", template);
    if (historical) {
      formData.append("historical", historical);
    }
    if (allowedItemColors.trim()) {
      formData.append("allowed_item_colors", allowedItemColors);
    }

    try {
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload analysis failed.");
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setFilesPaths(data.files);
      setMasterHeaders(data.masterHeaders);
      setContentHeaders(data.contentHeaders);
      setShopifyHeaders(data.shopifyHeaders);
      setMasterMappings(data.masterMappings);
      setContentMappings(data.contentMappings);
      setValidationReport(data.validationReport);
      setMasterPreview(data.masterPreview);
      
      // Group products dynamically by link column for Price Adjuster workspace
      const linkCol = data.masterMappings["Variant SKU Link"] || "Item Color";
      const skuCol = data.masterMappings["Variant SKU"] || "ITEM CODE";
      const mrpCol = data.masterMappings["Variant Compare At Price"] || "MRP";
      
      const seen = new Set();
      const baseProds = [];
      data.masterPreview.forEach(row => {
        const linkVal = row[linkCol];
        const skuVal = row[skuCol];
        const mrpVal = row[mrpCol];
        const division = row["DIVISION"] || "Apparel";
        const category = row["CATEGORY"] || "";
        
        if (linkVal && !seen.has(linkVal)) {
          seen.add(linkVal);
          
          let defaultPrice = mrpVal;
          try {
            const mrpNum = parseFloat(mrpVal);
            if (!isNaN(mrpNum)) {
              if (division.toUpperCase().includes("FOOTWEAR")) {
                defaultPrice = Math.round(mrpNum * 0.7);
              } else if (division.toUpperCase().includes("APPAREL")) {
                defaultPrice = Math.round(mrpNum * 0.5);
              }
              if (defaultPrice > 10) {
                defaultPrice = Math.floor(defaultPrice / 10) * 10 + 9;
              }
            }
          } catch(err) {}

          baseProds.push({
            link: linkVal,
            sku: skuVal,
            mrp: mrpVal,
            division: division,
            category: category,
            defaultPrice: defaultPrice
          });
        }
      });
      setUniqueProducts(baseProds);

      const initialPrices = {};
      baseProds.forEach(p => {
        initialPrices[p.link] = p.defaultPrice;
      });
      setPriceOverrides(initialPrices);

      showToast("Sheets parsed. Semantic synonym matches identified successfully.");
      setActiveTab("mapper"); // Navigate to mapper next
      fetchStats(); // updates database statistics
    } catch (err) {
      showToast(`Upload Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Mapping Correction Persistence
  const saveMappingCorrection = async (sheetType, shopifyCol, sourceCol) => {
    if (!sourceCol) return;
    try {
      const formData = new FormData();
      formData.append("source_sheet", sheetType);
      
      const mappingsObj = {};
      mappingsObj[shopifyCol] = sourceCol;
      formData.append("mappings", JSON.stringify(mappingsObj));

      const res = await fetch(`${API_BASE}/api/mapping/save`, {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        showToast(`Learned permanently: "${shopifyCol}" maps to "${sourceCol}"`);
        fetchStats();
      } else {
        showToast("Failed to save column override permanently", "error");
      }
    } catch (e) {
      console.error("Mapping save exception:", e);
    }
  };

  // Price overrides and selling price calculations
  const handlePriceChange = (linkVal, newPrice) => {
    setPriceOverrides(prev => ({
      ...prev,
      [linkVal]: newPrice
    }));
  };

  // Bulk discount adjuster
  const handleBulkDiscountApply = () => {
    const pct = parseFloat(bulkDiscountPct);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      showToast("Please enter a valid percentage rate (0-100)", "error");
      return;
    }

    const updatedOverrides = { ...priceOverrides };
    let count = 0;

    uniqueProducts.forEach(p => {
      const isTarget = bulkDiscountDivision === "ALL" || 
                       p.division.toUpperCase() === bulkDiscountDivision.toUpperCase();
      
      if (isTarget && p.mrp) {
        const mrpNum = parseFloat(p.mrp);
        if (!isNaN(mrpNum)) {
          let calculatedPrice = Math.round(mrpNum * (1 - pct / 100));
          if (calculatedPrice > 10) {
            calculatedPrice = Math.floor(calculatedPrice / 10) * 10 + 9;
          }
          updatedOverrides[p.link] = calculatedPrice;
          count++;
        }
      }
    });

    setPriceOverrides(updatedOverrides);
    showToast(`Bulk applied ${pct}% OFF discount to ${count} product groups.`);
  };

  // Step 4: Final Generation Trigger
  const triggerGenerateCSV = async () => {
    setLoading(true);
    setLoadingMsg("Generating Shopify listing CSV rows and compiling variants...");

    const formData = new FormData();
    formData.append("session_id", sessionId);
    formData.append("master_path", filesPaths.mastersheet);
    formData.append("content_path", filesPaths.contentsheet);
    formData.append("template_path", filesPaths.template);
    formData.append("master_mappings", JSON.stringify(masterMappings));
    formData.append("content_mappings", JSON.stringify(contentMappings));
    formData.append("price_overrides", JSON.stringify(priceOverrides));
    if (allowedItemColors.trim()) {
      formData.append("allowed_item_colors", allowedItemColors);
    }

    try {
      const res = await fetch(`${API_BASE}/api/generate`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "CSV Generation failed.");
      }

      const data = await res.json();
      setGenResult(data);
      showToast("Shopify CSV compiled successfully with correct BOM encoding.");
      fetchHistory();
    } catch (err) {
      showToast(`Generation Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleMatrixifySubmit = async (e) => {
    e.preventDefault();
    if (!matrixifyFile || !matrixifyContentSheet) {
      showToast("Please select both Matrixify File and Content Sheet.", "error");
      return;
    }

    setLoading(true);
    setLoadingMsg("Uploading and populating Matrixify spreadsheet...");
    setMatrixifyResult(null);

    const formData = new FormData();
    formData.append("matrixifyFile", matrixifyFile);
    formData.append("contentsheet", matrixifyContentSheet);

    try {
      const res = await fetch(`${API_BASE}/api/matrixify/populate`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Matrixify population failed.");
      }

      const data = await res.json();
      setMatrixifyResult(data);
      showToast("Matrixify file populated and compiled successfully.");
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Helper score color
  const getScoreColor = (shopifyCol, header) => {
    if (!header) return "border-red-500/30 text-red-400 bg-red-500/5";
    
    const hasCorrection = learningStats.corrections.some(c => 
      c.original === header && c.target === shopifyCol
    );
    if (hasCorrection) {
      return "border-indigo-500/30 text-emerald-600 bg-indigo-500/5";
    }

    const synonyms = SEMANTIC_THESAURUS[shopifyCol];
    if (synonyms) {
      const header_lower = header.toLowerCase();
      if (synonyms.slice(0, 3).includes(header_lower)) {
        return "border-emerald-500/30 text-emerald-400 bg-emerald-500/5";
      }
      return "border-amber-500/30 text-amber-400 bg-amber-500/5";
    }
    return "border-slate-200 text-slate-400 bg-slate-50";
  };

  // Helper score label
  const getScoreLabel = (shopifyCol, header) => {
    if (!header) return "NOT FOUND";
    const hasCorrection = learningStats.corrections.some(c => 
      c.original === header && c.target === shopifyCol
    );
    if (hasCorrection) return "SAVED DATABASE OVERRIDE";
    
    const synonyms = SEMANTIC_THESAURUS[shopifyCol];
    if (synonyms) {
      const header_lower = header.toLowerCase();
      if (synonyms.slice(0, 3).includes(header_lower)) {
        return "HIGH CONFIDENCE synonym MATCH";
      }
      return "MEDIUM CONFIDENCE fuzzy MATCH";
    }
    return "MANUAL MATCH";
  };

  // Filtered pricing products list
  const filteredProducts = uniqueProducts.filter(p => {
    const matchesSearch = p.link.toLowerCase().includes(searchPriceQuery.toLowerCase()) || 
                          p.sku.toLowerCase().includes(searchPriceQuery.toLowerCase()) ||
                          p.category.toLowerCase().includes(searchPriceQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "ALL" || 
                            p.division.toUpperCase() === categoryFilter.toUpperCase();

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans antialiased">
      
      {/* PERSISTENT FLOATING NOTIFICATION */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[100] px-6 py-4 rounded-xl border shadow-xl flex items-center gap-3 animate-toast ${
          toast.type === "error" 
            ? "bg-red-50 border-red-200 text-red-800" 
            : "bg-emerald-50 border-emerald-200 text-emerald-800"
        }`}>
          <span>{toast.type === "error" ? "🛑" : "✨"}</span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* FIXED LEFT SIDEBAR */}
      <aside className="w-80 bg-white/80 border-r border-emerald-500/20 flex flex-col p-6 sticky top-0 h-screen overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center font-bold text-base text-white shadow-lg shadow-emerald-500/20 pulse-glow">
            D2C
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700">
              D2C Shopify AutoLister
            </h1>
            <p className="text-[10px] text-emerald-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span>
              Intelligent Self-Learning Engine
            </p>
          </div>
        </div>

        {/* PERSISTENT SQL STATS MINI BOARD */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-indigo-500/5 mb-8">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Database Memory Metrics</span>
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Database Overrides</span>
              <strong className="text-emerald-600 font-bold font-mono">{learningStats.userCorrectionsSaved}</strong>
            </div>
            <div className="h-[1px] bg-slate-100"></div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Learned Columns</span>
              <strong className="text-emerald-600 font-bold font-mono">{learningStats.columnMappingsLearned}</strong>
            </div>
            <div className="h-[1px] bg-slate-100"></div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">SQLite Brand Rules</span>
              <strong className="text-slate-800 font-bold font-mono">{learningStats.brandRulesConfigured}</strong>
            </div>
          </div>
        </div>

        {/* SIDEBAR NAVIGATION TAB PANEL */}
        <nav className="flex flex-col gap-2 flex-1">
          {[
            { id: "upload", label: "Upload & Rules Hub", icon: "📂" },
            { id: "mapper", label: "Synonym Column Mapper", icon: "✨", disabled: !sessionId },
            { id: "pricing", label: "Selling Price Adjuster", icon: "💰", disabled: !sessionId },
            { id: "compile", label: "Scanner & CSV Compiler", icon: "⚡", disabled: !sessionId },
            { id: "logs", label: "Historical Audit Explorer", icon: "📜" },
            { id: "matrixify", label: "Matrixify Populator", icon: "📊" }
          ].map(tab => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl text-xs font-semibold tracking-wide border transition-all text-left ${
                activeTab === tab.id
                  ? "bg-emerald-50 border-emerald-500/25 text-emerald-700 shadow-md shadow-indigo-500/5 font-bold"
                  : tab.disabled
                    ? "opacity-35 cursor-not-allowed border-transparent text-slate-400"
                    : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <span className="text-sm leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* SYSTEM AUDIT INDICATOR FOOTER */}
        <div className="pt-6 border-t border-slate-200 flex flex-col gap-1 text-[10px] text-slate-500 font-mono">
          <div>SQLITE DB: autolister.db</div>
          <div>SESSION: {sessionId ? sessionId.slice(0, 8) + "..." : "Inactive"}</div>
        </div>
      </aside>

      {/* FLEX RIGHT CORE CONTENT WORKSPACE */}
      <main className="flex-1 min-h-screen p-8 overflow-y-auto relative flex flex-col">
        
        {/* LOADING OVERLAY SCENE */}
        {loading && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-5">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-500/15 border-t-indigo-500 animate-spin"></div>
            <p className="text-emerald-800 font-bold font-mono tracking-wide text-xs uppercase">{loadingMsg}</p>
          </div>
        )}

        {/* WORKSPACE VIEW 1: UPLOAD & SQLite RULES CONFIGURATION */}
        {activeTab === "upload" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Page Header */}
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Upload & SQLite Configuration Hub</h2>
              <p className="text-xs text-slate-400 mt-1">
                Upload your listing sheets to run fuzzy column matchers and configure SQLite brand assignment rules or spec templates inline.
              </p>
            </div>

            {/* Core Panels Grid (File upload left, Database Rules edit right) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* FILE UPLOAD PANEL */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3">Source Listing Files</h3>
                
                <form onSubmit={handleUploadSubmit} className="flex flex-col gap-5">
                  
                  {/* Mastersheet Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-indigo-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMastersheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">📂</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-snug">
                          {mastersheet ? mastersheet.name : "Mastersheet (Item Directory)"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Accepts Excel (.xlsx) formats containing sizes and MRPs</span>
                      </div>
                    </div>
                    {mastersheet && <span className="text-xs text-emerald-400 font-bold font-mono">✓</span>}
                  </div>

                  {/* Content Copy Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-indigo-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setContentsheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">📝</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-snug">
                          {contentsheet ? contentsheet.name : "Content Copy Sheet"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Accepts Excel (.xlsx) MarketplaceD2C style descriptions</span>
                      </div>
                    </div>
                    {contentsheet && <span className="text-xs text-emerald-400 font-bold font-mono">✓</span>}
                  </div>

                  {/* Shopify Blank Template Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-indigo-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => setTemplate(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">📋</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-snug">
                          {template ? template.name : "Blank Shopify Template"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Accepts default template CSV containing matching column structures</span>
                      </div>
                    </div>
                    {template && <span className="text-xs text-emerald-400 font-bold font-mono">✓</span>}
                  </div>

                  {/* Optional Learning CSV Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-teal-500/40 bg-slate-50/50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => setHistorical(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-teal-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">✨</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-emerald-600 leading-snug">
                          {historical ? historical.name : "Optional: Historical Listing CSV"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Learn mapping relationships automatically from your past listings</span>
                      </div>
                    </div>
                    {historical && <span className="text-xs text-emerald-600 font-bold font-mono">✓</span>}
                  </div>
                  
                  {/* Lookup Style Keys to List */}
                  <div className="flex flex-col gap-2 bg-slate-50 rounded-xl p-5 border border-slate-200">
                    <label className="text-xs font-bold text-emerald-600 font-mono uppercase tracking-wide">
                      Lookup Style Keys to List (Optional)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Paste specific product lookup keys (e.g. <code>PGTOPW001955-BROWN</code>) to filter what gets listed. Separate keys by commas, newlines, or spaces. If blank, everything will be listed.
                    </span>
                    <textarea
                      rows={4}
                      value={allowedItemColors}
                      onChange={(e) => setAllowedItemColors(e.target.value)}
                      placeholder="Paste keys here...&#10;e.g.&#10;PGTOPW001955-BROWN&#10;PBTSFW002142-ORANGE"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-800 font-mono rounded-lg p-2.5 text-xs mt-1 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 mt-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/10 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-xs uppercase tracking-wider"
                  >
                    Analyze and Learn Mappings →
                  </button>
                </form>
              </div>

              {/* SQLite DB RULE EDITORS PANEL */}
              <div className="flex flex-col gap-6 w-full">
                
                {/* Brand rules editor */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                    <span>SQLite Brand Rules Configurator</span>
                    <span className="text-[10px] font-mono text-slate-500">Table: brand_rules</span>
                  </h3>

                  <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-700 font-semibold">
                          <th className="p-3">Division</th>
                          <th className="p-3">Assigned Brand Name</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandRules.map(rule => (
                          <tr key={rule.id} className="border-b border-slate-900 hover:bg-emerald-50/50 text-slate-700">
                            <td className="p-3 font-bold text-slate-400 font-mono text-[10px] uppercase">{rule.division}</td>
                            <td className="p-3">
                              {editingBrandId === rule.id ? (
                                <input 
                                  type="text" 
                                  value={editingBrandVal}
                                  onChange={(e) => setEditingBrandVal(e.target.value)}
                                  className="bg-slate-50 border border-slate-300 text-slate-800 font-medium rounded p-1 text-xs w-48"
                                />
                              ) : (
                                <span className="font-semibold text-slate-800">{rule.brand_name}</span>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              {editingBrandId === rule.id ? (
                                <div className="flex gap-2 justify-end">
                                  <button 
                                    onClick={() => handleUpdateBrandRule(rule.division, editingBrandVal)}
                                    className="px-2 py-1 rounded bg-teal-500/20 border border-teal-500/30 text-emerald-700 font-bold hover:bg-teal-500/30 text-[10px]"
                                  >
                                    Save
                                  </button>
                                  <button 
                                    onClick={() => setEditingBrandId(null)}
                                    className="px-2 py-1 rounded bg-slate-100 border border-slate-300 text-slate-400 hover:bg-slate-200 text-[10px]"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => {
                                    setEditingBrandId(rule.id);
                                    setEditingBrandVal(rule.brand_name);
                                  }}
                                  className="text-emerald-600 hover:text-emerald-700 font-bold text-[10px]"
                                >
                                  Edit Rule
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Myntra Spec template configuration */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                    <span>Category Specification Formats</span>
                    <span className="text-[10px] font-mono text-slate-500">Table: spec_templates</span>
                  </h3>

                  <div className="flex flex-col gap-4">
                    {specTemplates.map(tmpl => (
                      <div key={tmpl.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide font-mono text-[10px]">{tmpl.division} layout format</span>
                          {editingSpecId !== tmpl.id && (
                            <button 
                              onClick={() => {
                                setEditingSpecId(tmpl.id);
                                setEditingSpecVal(tmpl.template_format);
                              }}
                              className="text-emerald-600 hover:text-emerald-700 font-bold text-[10px]"
                            >
                              Edit Template
                            </button>
                          )}
                        </div>

                        {editingSpecId === tmpl.id ? (
                          <div className="flex flex-col gap-2">
                            <textarea 
                              rows={5}
                              value={editingSpecVal}
                              onChange={(e) => setEditingSpecVal(e.target.value)}
                              className="bg-slate-50 border border-slate-300 text-slate-800 font-mono rounded p-2 text-xs w-full"
                            />
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => handleUpdateSpecTemplate(tmpl.division, editingSpecVal)}
                                className="px-3 py-1 rounded bg-teal-500/20 border border-teal-500/30 text-emerald-700 font-bold hover:bg-teal-500/30 text-[10px]"
                              >
                                Save JSON
                              </button>
                              <button 
                                onClick={() => setEditingSpecId(null)}
                                className="px-3 py-1 rounded bg-slate-100 border border-slate-300 text-slate-400 hover:bg-slate-200 text-[10px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <pre className="font-mono text-[10px] bg-white p-3 rounded-lg border border-slate-900 text-emerald-600 overflow-x-auto custom-scroll max-h-32">
                            {tmpl.template_format}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* WORKSPACE VIEW 2: COLUMN SYNONYM MATCHING OVERRIDES */}
        {activeTab === "mapper" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Intelligent Synonym Column Mapper</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust identified column synonyms. The system learns corrections and overrides future matching rules permanently inside SQLite.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setActiveTab("upload")}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-400 hover:text-slate-800 transition"
                >
                  ← Upload Hub
                </button>
                <button 
                  onClick={() => setActiveTab("pricing")}
                  className="px-5 py-2 text-xs rounded-lg font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Verify Selling Prices →
                </button>
              </div>
            </div>

            {/* Widescreen Columns Panel Side-By-Side Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* Mastersheet Columns Panel */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                  <span>Mastersheet (Item Directory) column mapping</span>
                  <span className="text-[10px] font-mono text-slate-500">Source: mastersheet</span>
                </h3>

                <div className="flex flex-col gap-4">
                  {[
                    { key: "Variant SKU", label: "SKU / Variant Item Code" },
                    { key: "Variant Barcode", label: "Style Code (Variant Barcode)" },
                    { key: "Option1 Value", label: "Size Key (Option1)" },
                    { key: "Variant Compare At Price", label: "MRP Compare At Price" },
                    { key: "Upper Material", label: "Upper Material (Footwear Specs)" },
                    { key: "Sole Material", label: "Sole Material (Footwear Specs)" }
                  ].map(item => (
                    <div key={item.key} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-mono">Shopify Target Column</span>
                          <strong className="text-xs font-bold text-slate-800 mt-0.5">{item.key}</strong>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-mono font-semibold uppercase ${getScoreColor(item.key, masterMappings[item.key])}`}>
                          {getScoreLabel(item.key, masterMappings[item.key])}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400">Linked Excel Column:</span>
                        <select 
                          value={masterMappings[item.key] || ""} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setMasterMappings(prev => ({ ...prev, [item.key]: val }));
                            saveMappingCorrection("mastersheet", item.key, val);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg p-2.5 text-xs font-medium cursor-pointer"
                        >
                          <option value="">-- Unmapped (Skip or defaults) --</option>
                          {masterHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Content Copy Columns Panel */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                  <span>Content Copy Sheet column mapping</span>
                  <span className="text-[10px] font-mono text-slate-500">Source: contentsheet</span>
                </h3>

                <div className="flex flex-col gap-4">
                  {[
                    { key: "Title", label: "D2C Product Title" },
                    { key: "Body (HTML)", label: "PDP Product Description (Body)" }
                  ].map(item => (
                    <div key={item.key} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-slate-500 uppercase font-mono">Shopify Target Column</span>
                          <strong className="text-xs font-bold text-slate-800 mt-0.5">{item.key}</strong>
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded border font-mono font-semibold uppercase ${getScoreColor(item.key, contentMappings[item.key])}`}>
                          {getScoreLabel(item.key, contentMappings[item.key])}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400">Linked Excel Column:</span>
                        <select 
                          value={contentMappings[item.key] || ""} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setContentMappings(prev => ({ ...prev, [item.key]: val }));
                            saveMappingCorrection("contentsheet", item.key, val);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg p-2.5 text-xs font-medium cursor-pointer"
                        >
                          <option value="">-- Unmapped (Skip or defaults) --</option>
                          {contentHeaders.map(h => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        )}

        {/* WORKSPACE VIEW 3: SELLING PRICE ADJUSTER TABLE */}
        {activeTab === "pricing" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Selling Price Adjuster</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust selling prices individually or bulk update specific product categories. High-fidelity .9 pricing is auto-calculated.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setActiveTab("mapper")}
                  className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-400 hover:text-slate-800 transition"
                >
                  ← Mapping Review
                </button>
                <button 
                  onClick={() => setActiveTab("compile")}
                  className="px-5 py-2 text-xs rounded-lg font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition"
                >
                  Conflict Scanner →
                </button>
              </div>
            </div>

            {/* BULK DISCOUNT CONFIGURATION PANEL */}
            <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-5 bg-white/30">
              <div className="flex items-center gap-3">
                <div className="text-lg">💰</div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-slate-800">Bulk Category Discount Adjuster</span>
                  <span className="text-[10px] text-slate-400">Configure default selling prices in a single click</span>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase">Target Division</span>
                  <select 
                    value={bulkDiscountDivision}
                    onChange={(e) => setBulkDiscountDivision(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2 font-medium"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="APPAREL">Apparel Only</option>
                    <option value="FOOTWEAR">Footwear Only</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[9px] text-slate-500 font-mono uppercase">Discount Rate</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={bulkDiscountPct}
                      onChange={(e) => setBulkDiscountPct(e.target.value)}
                      className="bg-slate-50 border border-slate-300 text-slate-800 text-xs rounded-lg p-2 w-16 text-center font-bold"
                    />
                    <span className="text-xs text-slate-400">% OFF</span>
                  </div>
                </div>

                <button 
                  onClick={handleBulkDiscountApply}
                  className="px-4 py-2 mt-4 text-xs font-bold rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/10 cursor-pointer transition"
                >
                  Apply Discount
                </button>
              </div>
            </div>

            {/* PRODUCT GROUPS DATA SHEET */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
              
              {/* Filters Search Bar */}
              <div className="flex justify-between items-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">Identified Color-Style Groups</h3>
                  <span className="text-[10px] font-mono text-slate-500">{filteredProducts.length} entries shown</span>
                </div>

                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    placeholder="Search color link/SKU..."
                    value={searchPriceQuery}
                    onChange={(e) => setSearchPriceQuery(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 placeholder-slate-400 rounded-lg px-3 py-2 text-xs w-60"
                  />
                  <select 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-3 py-2"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="APPAREL">Apparel</option>
                    <option value="FOOTWEAR">Footwear</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-700 font-semibold tracking-wide">
                      <th className="p-4">Color-Style SKU Link</th>
                      <th className="p-4">Division</th>
                      <th className="p-4">Base Compare-At Price (MRP)</th>
                      <th className="p-4">Selling Discount Rate</th>
                      <th className="p-4 w-48 text-right">D2C Final Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(p => {
                      const sellingPrice = priceOverrides[p.link] || "";
                      const discountPercentage = p.mrp && sellingPrice
                        ? Math.round((1 - (parseFloat(sellingPrice) / parseFloat(p.mrp))) * 100)
                        : 0;

                      return (
                        <tr key={p.link} className="border-b border-slate-900 hover:bg-slate-50/10 transition text-slate-700">
                          <td className="p-4 font-mono font-bold text-emerald-600">{p.link}</td>
                          <td className="p-4">
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-700 font-semibold">
                              {p.division}
                            </span>
                          </td>
                          <td className="p-4 font-medium text-slate-400">Rs. {p.mrp}</td>
                          <td className="p-4">
                            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                              discountPercentage > 0 
                                ? "bg-teal-500/10 text-emerald-600 border border-teal-500/10" 
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {discountPercentage > 0 ? `${discountPercentage}% OFF` : "No discount"}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-slate-500 font-semibold text-xs">Rs.</span>
                              <input 
                                type="number" 
                                value={sellingPrice}
                                onChange={(e) => handlePriceChange(p.link, e.target.value)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-1.5 text-xs w-28 text-right focus:border-indigo-500 transition"
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </div>

          </div>
        )}

        {/* WORKSPACE VIEW 4: CONFLICT SCANNER & COMPILER */}
        {activeTab === "compile" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Scanner & Shopify CSV Compiler</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Scanner detects syntax warnings (duplicate barcode links, missing apparel size matrices) prior to building standard CSV exports.
                </p>
              </div>

              <button 
                onClick={() => setActiveTab("pricing")}
                className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-400 hover:text-slate-800 transition"
              >
                ← Back to Pricing
              </button>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start w-full">
              
              {/* SCANNER REPORT LIST (LEFT) */}
              <div className="xl:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600">Scanner Logs Terminal</h3>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setValidationFilter("ALL")}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono transition ${
                        validationFilter === "ALL" 
                          ? "bg-indigo-600 text-white" 
                          : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      ALL ({validationReport.length})
                    </button>
                    <button 
                      onClick={() => setValidationFilter("ERROR")}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono transition ${
                        validationFilter === "ERROR" 
                          ? "bg-red-500/20 text-red-400 border border-red-500/10" 
                          : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      ERRORS ({validationReport.filter(w => w.type === "ERROR").length})
                    </button>
                    <button 
                      onClick={() => setValidationFilter("WARNING")}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono transition ${
                        validationFilter === "WARNING" 
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/10" 
                          : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                      }`}
                    >
                      WARNINGS ({validationReport.filter(w => w.type === "WARNING").length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-2 custom-scroll">
                  {validationReport.length === 0 ? (
                    <div className="border border-dashed border-emerald-500/20 bg-emerald-500/5 text-emerald-400 p-8 rounded-xl text-center text-xs font-semibold">
                      ✓ No entries recorded in the validation layer. Column schemas match Shopify's parameters.
                    </div>
                  ) : (
                    validationReport
                      .filter(w => {
                        if (validationFilter === "ERROR") return w.type === "ERROR";
                        if (validationFilter === "WARNING") return w.type === "WARNING";
                        return true;
                      })
                      .map((w, idx) => (
                        <div key={idx} className={`p-4 rounded-xl border flex items-start gap-3.5 transition hover:scale-[1.005] ${
                          w.type === "ERROR" 
                            ? "bg-red-500/5 border-red-500/15 text-red-300 shadow-md shadow-red-500/[0.02]"
                            : "bg-amber-500/5 border-amber-500/15 text-amber-300 shadow-md shadow-amber-500/[0.02]"
                        }`}>
                          <div className="text-lg leading-none mt-0.5">{w.type === "ERROR" ? "🛑" : "⚠️"}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-400">{w.type} log</span>
                              {w.sku && (
                                <span className="font-mono text-[8px] bg-white px-2 py-0.5 rounded text-emerald-600 border border-indigo-500/5">
                                  SKU: {w.sku}
                                </span>
                              )}
                            </div>
                            <p className="text-xs mt-1.5 leading-relaxed text-slate-700 font-medium">{w.message}</p>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* COMPILATION ACTION & DOWNLOAD CARD (RIGHT) */}
              <div className="flex flex-col gap-6 w-full">
                
                {/* Generation control panel */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4 text-center">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 text-left">
                    CSV Compilation Manager
                  </h3>

                  <div className="text-left py-2 flex flex-col gap-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Total Errors:</span>
                      <strong className="text-red-400 font-bold font-mono">{validationReport.filter(w => w.type === "ERROR").length}</strong>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Total Warnings:</span>
                      <strong className="text-amber-400 font-bold font-mono">{validationReport.filter(w => w.type === "WARNING").length}</strong>
                    </div>
                  </div>

                  {validationReport.some(w => w.type === "ERROR") ? (
                    <div className="p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-400 text-xs font-medium text-left">
                      🛑 Cannot compile. Scan logs contain fatal errors. Please correct mappings or source details.
                    </div>
                  ) : (
                    <button 
                      onClick={triggerGenerateCSV}
                      className="w-full py-4 mt-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/15 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-xs uppercase tracking-wider"
                    >
                      Compile & Export Shopify CSV →
                    </button>
                  )}
                </div>

                {/* Direct download center */}
                {genResult && (
                  <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5 text-center bg-slate-50/40 border-emerald-500/20">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xl flex items-center justify-center mx-auto animate-bounce">
                      ✓
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Shopify CSV Built</h4>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">
                        Variant grouping joins and metafield compiles completed. Encoded in utf-8-sig format for Excel.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                      <div className="text-center">
                        <div className="text-lg font-bold text-emerald-600 font-mono">{genResult.totalProducts}</div>
                        <div className="text-[8px] uppercase font-bold tracking-wider text-slate-500 mt-1">Products</div>
                      </div>
                      <div className="text-center border-l border-slate-200">
                        <div className="text-lg font-bold text-emerald-600 font-mono">{genResult.totalVariants}</div>
                        <div className="text-[8px] uppercase font-bold tracking-wider text-slate-500 mt-1">Variants</div>
                      </div>
                    </div>

                    <a 
                      href={`${API_BASE}${genResult.downloadUrl}`}
                      className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/15 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer text-center text-xs uppercase tracking-wider block"
                    >
                      ⬇ Download Shopify CSV
                    </a>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* WORKSPACE VIEW 5: HISTORICAL AUDIT EXPLORER */}
        {activeTab === "logs" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Historical Audit Explorer</h2>
              <p className="text-xs text-slate-400 mt-1">
                Browse database run history logs from local SQLite memory. Grab download links for all generated outputs.
              </p>
            </div>

            {/* Log table panel */}
            <div className="glass-panel rounded-2xl p-6">
              
              <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-3 flex-wrap gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Compilation Run History Logs</span>
                <span className="text-[10px] font-mono text-slate-500">{historyLogs.length} runs recorded</span>
              </div>

              {historyLogs.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-xs font-semibold">
                  No past processing runs found. Upload files inside the hub to compile your first D2C Shopify list.
                </div>
              ) : (
                <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-700 font-semibold tracking-wide">
                        <th className="p-4">Run ID</th>
                        <th className="p-4">Date & Time</th>
                        <th className="p-4">Mastersheet Name</th>
                        <th className="p-4">Content copy name</th>
                        <th className="p-4">Products Grouped</th>
                        <th className="p-4">Variants Created</th>
                        <th className="p-4 text-right">Shopify Output File</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyLogs.map(log => (
                        <tr key={log.id} className="border-b border-slate-900 hover:bg-slate-50/10 transition text-slate-700">
                          <td className="p-4 font-mono font-bold text-emerald-600">#{log.id}</td>
                          <td className="p-4 font-medium text-slate-400">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="p-4 font-semibold text-slate-700 max-w-xs truncate">{log.mastersheet_name}</td>
                          <td className="p-4 font-semibold text-slate-700 max-w-xs truncate">{log.contentsheet_name}</td>
                          <td className="p-4 font-mono font-bold text-slate-800">{log.total_products}</td>
                          <td className="p-4 font-mono font-bold text-emerald-600">{log.total_variants}</td>
                          <td className="p-4 text-right">
                            <a 
                              href={`${API_BASE}/api/download/${log.output_csv_name}`}
                              className="px-3 py-1.5 rounded bg-indigo-600/20 border border-emerald-500/25 hover:bg-indigo-600 text-emerald-700 hover:text-white font-bold text-[10px] transition uppercase tracking-wider"
                            >
                              ⬇ Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>

          </div>
        )}

        {/* WORKSPACE VIEW 6: MATRIXIFY POPULATOR */}
        {activeTab === "matrixify" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Header */}
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 font-sans">Matrixify Populator</h2>
              <p className="text-xs text-slate-400 mt-1 font-sans">
                Upload your Matrixify spreadsheet and the corresponding Content Copy Sheet. The engine will automatically split multi-line bullet points and map descriptions.
              </p>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* UPLOAD PANEL */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 font-sans">Matrixify Workspace</h3>
                
                <form onSubmit={handleMatrixifySubmit} className="flex flex-col gap-5">
                  
                  {/* Matrixify Sheet Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-indigo-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMatrixifyFile(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">📊</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-snug font-sans">
                          {matrixifyFile ? matrixifyFile.name : "Select Matrixify Excel File"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-sans">Accepts Excel (.xlsx) file exported from Shopify</span>
                      </div>
                    </div>
                    {matrixifyFile && <span className="text-xs text-emerald-400 font-bold font-mono">✓</span>}
                  </div>

                  {/* Content Copy Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-indigo-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMatrixifyContentSheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/5 flex items-center justify-center text-emerald-600 font-bold text-sm">📝</div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-800 leading-snug font-sans">
                          {matrixifyContentSheet ? matrixifyContentSheet.name : "Select Content Copy Sheet"}
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5 font-sans">Accepts Excel (.xlsx) containing descriptions & bullet points</span>
                      </div>
                    </div>
                    {matrixifyContentSheet && <span className="text-xs text-emerald-400 font-bold font-mono">✓</span>}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 mt-2 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/10 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-xs uppercase tracking-wider font-sans"
                  >
                    Populate Matrixify Sheet →
                  </button>
                </form>
              </div>

              {/* DOWNLOAD & INFO CARD */}
              <div className="flex flex-col gap-6 w-full">
                
                {/* Information Card */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 border-b border-slate-200 pb-3 font-sans">
                    Mapping Rules Details
                  </h3>
                  <p className="text-xs text-slate-700 leading-relaxed font-sans">
                    This utility maps product descriptions and splits multi-line bullet points from the Content Sheet to target metafields in the Matrixify spreadsheet:
                  </p>
                  <ul className="text-slate-400 text-xs list-disc pl-5 flex flex-col gap-2 font-sans">
                    <li><strong>Column 1 (DM)</strong>: <code>custom.description</code> (Mapped from the description copy).</li>
                    <li><strong>Columns 2 to 6 (DN to DR)</strong>: <code>custom.product_info1</code> to <code>custom.product_info5</code> (Splits the multi-line Bullet Points column into 5 separate product info meta-fields).</li>
                  </ul>
                </div>

                {matrixifyResult && (
                  <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5 text-center bg-slate-50/40 border-emerald-500/20">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xl flex items-center justify-center mx-auto animate-bounce">
                      ✓
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 font-sans">Matrixify Sheet Populated!</h4>
                      <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto font-sans">
                        Descriptions mapped and bullet points separated successfully.
                      </p>
                    </div>

                    <a 
                      href={`${API_BASE}${matrixifyResult.downloadUrl}`}
                      className="w-full py-3.5 rounded-xl font-bold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/15 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer text-center text-xs uppercase tracking-wider block font-sans"
                    >
                      ⬇ Download Populated Matrixify File
                    </a>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}

        {/* FOOTER */}
        <footer className="mt-auto pt-8 pb-4 text-center border-t border-emerald-500/20 text-xs text-slate-500 font-mono">
          Made by Manan. All Rights Reversed.
        </footer>
      </main>

    </div>
  );
}
