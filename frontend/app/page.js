"use client";

import React, { useState, useEffect } from "react";

const API_BASE = typeof window !== "undefined"
  ? (localStorage.getItem("NEXT_PUBLIC_API_URL") || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080")
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
  const [viewMode, setViewMode] = useState("landing");
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

  // Settings & Connection States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [inputApiUrl, setInputApiUrl] = useState(API_BASE);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const loadAllData = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/learning-status`);
      if (!res.ok) throw new Error("Connection failed");
      const data = await res.json();
      setLearningStats(data);
      setConnectionError(false);
      
      // Load rest of configuration tables
      fetchHistory();
      fetchBrandRules();
      fetchSpecTemplates();
    } catch (e) {
      console.error("Backend connection failure:", e);
      setConnectionError(true);
    }
  };

  // Fetch SQLite configs and audit history logs on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const handleTestConnection = async () => {
    if (!inputApiUrl.trim()) {
      showToast("Please enter an API URL", "error");
      return;
    }
    setTestingConnection(true);
    try {
      let formattedUrl = inputApiUrl.trim();
      if (!/^https?:\/\//i.test(formattedUrl)) {
        formattedUrl = `https://${formattedUrl}`;
      }
      if (formattedUrl.endsWith("/")) {
        formattedUrl = formattedUrl.slice(0, -1);
      }
      const res = await fetch(`${formattedUrl}/api/learning-status`);
      if (res.ok) {
        showToast("Backend connection verified successfully!", "success");
      } else {
        showToast("Backend returned an error. Verify URL.", "error");
      }
    } catch (e) {
      showToast("Failed to connect. Backend offline or URL incorrect.", "error");
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveSettings = () => {
    let formattedUrl = inputApiUrl.trim();
    if (!formattedUrl) {
      showToast("Please enter an API URL", "error");
      return;
    }
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
    }
    if (formattedUrl.endsWith("/")) {
      formattedUrl = formattedUrl.slice(0, -1);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("NEXT_PUBLIC_API_URL", formattedUrl);
    }
    showToast("API URL saved! Reloading...", "success");
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

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
    setLoadingMsg("Preprocessing sheets in browser...");

    // Helper to dynamically load SheetJS from CDN
    const loadSheetJS = () => {
      return new Promise((resolve, reject) => {
        if (window.XLSX) {
          resolve(window.XLSX);
          return;
        }
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        script.onload = () => resolve(window.XLSX);
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    let processedContentSheet = contentsheet;
    try {
      if (contentsheet && contentsheet.name.endsWith(".xlsx")) {
        setLoadingMsg("Stripping heavy images from Content Sheet in browser...");
        const XLSX = await loadSheetJS();
        
        // Read file to ArrayBuffer
        const arrayBuffer = await contentsheet.arrayBuffer();
        
        // Parse with SheetJS
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        
        // Write back using SheetJS (which strips all media, drawings, and images!)
        const outputBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        
        // Create new Blob
        processedContentSheet = new Blob([outputBuffer], { type: contentsheet.type });
      }
    } catch (err) {
      console.error("Browser preprocessing failed, using original file:", err);
    }

    setLoadingMsg("Uploading listing sheets and parsing column structures...");

    const formData = new FormData();
    formData.append("mastersheet", mastersheet);
    formData.append("contentsheet", processedContentSheet, contentsheet.name);
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
      return "border-emerald-500/30 text-emerald-600 bg-emerald-500/5";
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

      {viewMode === "landing" ? (
        /* LANDING PAGE WRAPPER */
        <div className="flex-1 min-h-screen flex flex-col relative overflow-hidden bg-background text-foreground">
          {/* HERO GRID DECORATIVE ELEMENT */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(16,185,129,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

          {/* HERO SECTION */}
          <header className="w-full max-w-5xl mx-auto px-6 pt-24 pb-12 flex flex-col items-center text-center gap-7 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
              🚀 v1.0 Enterprise Listing Engine
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-slate-900 leading-tight font-sans">
              Your Shopify D2C Catalog,<br/>
              <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-600 bg-clip-text text-transparent">
                On Autopilot.
              </span>
            </h1>
            
            <p className="text-xs md:text-sm text-slate-500 max-w-2xl leading-relaxed font-sans">
              D2C AutoLister reads your Item Directories and Content Sheets, then automatically builds fully-mapped Shopify listing templates in seconds—automatically resolving pricing, tags, sizes, and brand allocations.
            </p>

            <div className="flex gap-4 mt-4">
              <button 
                onClick={() => setViewMode("dashboard")}
                className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider uppercase shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer"
              >
                Launch Listing Workspace →
              </button>
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="px-6 py-3.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 font-bold text-xs tracking-wider uppercase transition cursor-pointer"
              >
                Configure Connection
              </button>
            </div>
          </header>

          {/* METRICS PREVIEW BAR */}
          <section className="w-full max-w-4xl mx-auto px-6 py-6 relative z-10">
            <div className="grid grid-cols-5 bg-white/70 backdrop-blur-md rounded-2xl p-6 border border-emerald-500/10 shadow-sm text-center items-center">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Database Overrides</span>
                <strong className="text-xl md:text-2xl text-emerald-600 font-mono font-bold">{learningStats.userCorrectionsSaved}</strong>
              </div>
              <div className="w-[1px] bg-slate-200 h-10 mx-auto"></div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Learned Columns</span>
                <strong className="text-xl md:text-2xl text-emerald-600 font-mono font-bold">{learningStats.columnMappingsLearned}</strong>
              </div>
              <div className="w-[1px] bg-slate-200 h-10 mx-auto"></div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Rules</span>
                <strong className="text-xl md:text-2xl text-slate-800 font-mono font-bold">{learningStats.brandRulesConfigured + learningStats.specTemplatesConfigured}</strong>
              </div>
            </div>
          </section>

          {/* FEATURES GRID */}
          <section className="w-full max-w-5xl mx-auto px-6 py-12 flex-1 relative z-10">
            <div className="text-center mb-10">
              <h2 className="text-xs uppercase font-mono tracking-widest text-emerald-600 font-bold">Comprehensive Automation Suite</h2>
              <p className="text-xs text-slate-400 mt-1">Built to handle complex catalog mapping, formatting, and pricing automatically.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: "Intelligent Auto-Mapper", desc: "Matches custom supplier headers to Shopify target columns using persistent fuzzy dictionaries.", icon: "✨" },
                { title: "Brand Allocation Guardrails", desc: "Auto-assigns brand names (Toothless/Purple United Kids) based on item category division.", icon: "🛡️" },
                { title: "Retail Price Adjuster", desc: "Applies retail rounding to end with 9 and manages catalog discounts with override controls.", icon: "💰" },
                { title: "Myntra Specs Formatter", desc: "Generates Myntra-compatible specifications layout attributes automatically parsed as product metafields.", icon: "📊" },
                { title: "Integrity Conflict Scanner", desc: "Pre-validates listings flagging duplicate barcodes, empty sizes, or zero pricing values.", icon: "⚡" },
                { title: "Matrixify Populator Workspace", desc: "Adapts and maps raw Shopify CSV exports directly into Matrixify-compatible schemas.", icon: "📋" }
              ].map((feat, idx) => (
                <div key={idx} className="glass-panel rounded-2xl p-6 flex flex-col gap-3 glass-panel-hover">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg shadow-sm">
                    {feat.icon}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 mt-2">{feat.title}</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* FOOTER */}
          <footer className="w-full text-center py-8 border-t border-emerald-500/10 text-[10px] text-slate-400 font-mono z-10">
            <div>© 2026 Purple United Kids Catalog Automation Group • Live Environment</div>
            <div className="mt-1">Database Connected: {API_BASE}</div>
          </footer>
        </div>
      ) : (
        /* DASHBOARD SECTION WRAPPER */
        <>
          {/* FIXED LEFT SIDEBAR */}
          <aside className="w-80 bg-white/95 border-r border-emerald-500/10 flex flex-col p-6 sticky top-0 h-screen overflow-y-auto shadow-sm">
            {/* BACK TO LANDING BTN */}
            <button 
              onClick={() => setViewMode("landing")}
              className="mb-6 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-800 text-xs font-bold uppercase tracking-wider transition cursor-pointer self-start shadow-sm"
            >
              ← Back to Home
            </button>
            <div className="flex items-center gap-3.5 mb-8">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-base text-white shadow-md shadow-emerald-500/10">
                D2C
              </div>
              <div>
                <h1 className="font-extrabold text-sm tracking-wider text-slate-900 uppercase leading-none">
                  AutoLister
                </h1>
                <p className="text-[10px] text-emerald-600 font-mono tracking-wider font-bold uppercase mt-1">
                  v1.0 • Enterprise
                </p>
              </div>
            </div>

            {/* PERSISTENT SQL STATS MINI BOARD */}
            <div className="bg-slate-50 rounded-2xl p-5 border border-emerald-500/5 mb-8">
              <span className="text-xs uppercase font-extrabold tracking-wider text-slate-600">Database Memory</span>
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium">Overrides</span>
                  <strong className="text-emerald-600 font-extrabold font-mono text-base">{learningStats.userCorrectionsSaved}</strong>
                </div>
                <div className="h-[1px] bg-slate-100"></div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium">Learned Columns</span>
                  <strong className="text-emerald-600 font-extrabold font-mono text-base">{learningStats.columnMappingsLearned}</strong>
                </div>
                <div className="h-[1px] bg-slate-100"></div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium">Brand Rules</span>
                  <strong className="text-slate-800 font-extrabold font-mono text-base">{learningStats.brandRulesConfigured}</strong>
                </div>
              </div>
            </div>

            {/* SIDEBAR NAVIGATION TAB PANEL */}
            <nav className="flex flex-col gap-2.5 flex-1">
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
                  className={`flex items-center gap-4 px-5 py-3.5 rounded-xl text-sm font-bold tracking-wide border transition-all text-left ${
                    activeTab === tab.id
                      ? "bg-emerald-50 border-emerald-500/25 text-emerald-700 shadow-md shadow-emerald-500/5 font-extrabold"
                      : tab.disabled
                        ? "opacity-35 cursor-not-allowed border-transparent text-slate-400"
                        : "border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                  }`}
                >
                  <span className="text-lg leading-none">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* SYSTEM AUDIT INDICATOR FOOTER */}
            <div className="pt-6 border-t border-slate-200 flex flex-col gap-1 text-[11px] text-slate-500 font-mono">
              <div>SQLITE DB: autolister.db</div>
              <div>SESSION: {sessionId ? sessionId.slice(0, 8) + "..." : "Inactive"}</div>
            </div>
          </aside>

      {/* FLEX RIGHT CORE CONTENT WORKSPACE */}
      <main className="flex-1 min-h-screen p-8 overflow-y-auto relative flex flex-col">
        
        {/* TOP RIGHT PROFILE INITIALS BADGE WITH SETTINGS GEAR */}
        <div className="absolute top-6 right-8 flex items-center gap-3.5 z-10">
          <button 
            onClick={() => setShowSettingsModal(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            title="Configure Backend Connection"
          >
            ⚙️
          </button>
          <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-xs flex items-center justify-center shadow-sm" title="User Session: MN">
            MN
          </div>
        </div>

        {/* CONNECTION STATUS ALERT BANNER */}
        {connectionError && (
          <div className="mb-6 p-4 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm z-10">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <strong className="text-xs font-bold font-sans">Backend Connection Offline</strong>
                <p className="text-[11px] text-yellow-700 mt-0.5">
                  The dashboard is unable to reach the listing engine at <code className="bg-white/60 px-1 py-0.5 rounded font-mono font-bold text-[10px]">{API_BASE}</code>. Please configure your live Railway backend URL.
                </p>
              </div>
            </div>
            <button 
              onClick={() => setShowSettingsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white font-bold text-[10px] shadow-sm transition whitespace-nowrap cursor-pointer"
            >
              Configure Connection
            </button>
          </div>
        )}
        
        {/* LOADING OVERLAY SCENE */}
        {loading && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-5">
            <div className="w-12 h-12 rounded-full border-4 border-emerald-500/15 border-t-emerald-500 animate-spin"></div>
            <p className="text-emerald-800 font-bold font-mono tracking-wide text-xs uppercase">{loadingMsg}</p>
          </div>
        )}

        {/* WORKSPACE VIEW 1: UPLOAD & SQLite RULES CONFIGURATION */}
        {activeTab === "upload" && (
          <div className="flex-1 flex flex-col gap-8 w-full max-w-none">
            
            {/* Page Header */}
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Upload & SQLite Configuration Hub</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                Upload your listing sheets to run fuzzy column matchers and configure SQLite brand assignment rules or spec templates inline.
              </p>
            </div>

            {/* Core Panels Grid (File upload left, Database Rules edit right) */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* FILE UPLOAD PANEL */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3.5">Source Listing Files</h3>
                
                <form onSubmit={handleUploadSubmit} className="flex flex-col gap-5">
                  
                  {/* Mastersheet Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-emerald-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMastersheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">📂</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 leading-snug">
                          {mastersheet ? mastersheet.name : "Mastersheet (Item Directory)"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1">Accepts Excel (.xlsx) formats containing sizes and MRPs</span>
                      </div>
                    </div>
                    {mastersheet && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>

                  {/* Content Copy Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-emerald-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setContentsheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">📝</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 leading-snug">
                          {contentsheet ? contentsheet.name : "Content Copy Sheet"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1">Accepts Excel (.xlsx) MarketplaceD2C style descriptions</span>
                      </div>
                    </div>
                    {contentsheet && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>

                  {/* Shopify Blank Template Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-emerald-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => setTemplate(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">📋</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 leading-snug">
                          {template ? template.name : "Blank Shopify Template"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1">Accepts default template CSV containing matching column structures</span>
                      </div>
                    </div>
                    {template && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>

                  {/* Optional Learning CSV Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-teal-500/40 bg-slate-50/50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".csv"
                      onChange={(e) => setHistorical(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">✨</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-emerald-600 leading-snug">
                          {historical ? historical.name : "Optional: Historical Listing CSV"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1">Learn mapping relationships automatically from your past listings</span>
                      </div>
                    </div>
                    {historical && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>
                  
                  {/* Lookup Style Keys to List */}
                  <div className="flex flex-col gap-2 bg-slate-50 rounded-xl p-6 border border-slate-200">
                    <label className="text-sm font-extrabold text-emerald-600 font-mono uppercase tracking-widest">
                      Lookup Style Keys to List (Optional)
                    </label>
                    <span className="text-xs text-slate-500">
                      Paste specific product lookup keys (e.g. <code>PGTOPW001955-BROWN</code>) to filter what gets listed. Separate keys by commas, newlines, or spaces. If blank, everything will be listed.
                    </span>
                    <textarea
                      rows={4}
                      value={allowedItemColors}
                      onChange={(e) => setAllowedItemColors(e.target.value)}
                      placeholder="Paste keys here...&#10;e.g.&#10;PGTOPW001955-BROWN&#10;PBTSFW002142-ORANGE"
                      className="w-full bg-slate-50 border border-slate-300 text-slate-800 font-mono rounded-lg p-2.5 text-sm mt-1 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none font-semibold"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 mt-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-sm uppercase tracking-widest"
                  >
                    Analyze and Learn Mappings →
                  </button>
                </form>
              </div>

              {/* SQLite DB RULE EDITORS PANEL */}
              <div className="flex flex-col gap-6 w-full">
                
                {/* Brand rules editor */}
                 <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                    <span>SQLite Brand Rules Configurator</span>
                    <span className="text-xs font-mono text-slate-500">Table: brand_rules</span>
                  </h3>

                  <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-800 font-bold">
                          <th className="p-3">Division</th>
                          <th className="p-3">Assigned Brand Name</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandRules.map(rule => (
                          <tr key={rule.id} className="border-b border-slate-200 hover:bg-emerald-50/50 text-slate-800">
                            <td className="p-3 font-bold text-slate-500 font-mono text-xs uppercase">{rule.division}</td>
                            <td className="p-3">
                              {editingBrandId === rule.id ? (
                                <input 
                                  type="text" 
                                  value={editingBrandVal}
                                  onChange={(e) => setEditingBrandVal(e.target.value)}
                                  className="bg-slate-50 border border-slate-300 text-slate-850 font-bold rounded px-2.5 py-1 text-sm w-48 focus:border-emerald-500 outline-none"
                                />
                              ) : (
                                <span className="font-bold text-slate-900">{rule.brand_name}</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-bold">
                              {editingBrandId === rule.id ? (
                                <div className="flex gap-2 justify-end">
                                  <button 
                                    onClick={() => handleUpdateBrandRule(rule.division, editingBrandVal)}
                                    className="px-2.5 py-1.5 rounded-lg bg-teal-500/20 border border-teal-500/30 text-emerald-700 font-extrabold hover:bg-teal-500/30 text-xs cursor-pointer"
                                  >
                                    Save
                                  </button>
                                  <button 
                                    onClick={() => setEditingBrandId(null)}
                                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-500 hover:bg-slate-200 text-xs cursor-pointer"
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
                                  className="text-emerald-600 hover:text-emerald-700 font-extrabold text-xs cursor-pointer"
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

                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                    <span>Category Specification Formats</span>
                    <span className="text-xs font-mono text-slate-500">Table: spec_templates</span>
                  </h3>

                  <div className="flex flex-col gap-4">
                    {specTemplates.map(tmpl => (
                      <div key={tmpl.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-extrabold text-slate-500 uppercase tracking-wider font-mono text-xs">{tmpl.division} layout format</span>
                          {editingSpecId !== tmpl.id && (
                            <button 
                              onClick={() => {
                                setEditingSpecId(tmpl.id);
                                setEditingSpecVal(tmpl.template_format);
                              }}
                              className="text-emerald-600 hover:text-emerald-700 font-extrabold text-xs cursor-pointer"
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
                              className="bg-slate-50 border border-slate-300 text-slate-800 font-mono rounded p-2.5 text-sm w-full font-semibold focus:border-emerald-500 outline-none"
                            />
                            <div className="flex gap-2 justify-end">
                              <button 
                                onClick={() => handleUpdateSpecTemplate(tmpl.division, editingSpecVal)}
                                className="px-3.5 py-1.5 rounded-lg bg-teal-500/20 border border-teal-500/30 text-emerald-700 font-extrabold hover:bg-teal-500/30 text-xs cursor-pointer"
                              >
                                Save JSON
                              </button>
                              <button 
                                onClick={() => setEditingSpecId(null)}
                                className="px-3.5 py-1.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-500 hover:bg-slate-200 text-xs cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <pre className="font-mono text-xs font-semibold bg-white p-3 rounded-lg border border-slate-900 text-emerald-700 overflow-x-auto custom-scroll max-h-32">
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
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Intelligent Synonym Column Mapper</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  Adjust identified column synonyms. The system learns corrections and overrides future matching rules permanently inside SQLite.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setActiveTab("upload")}
                  className="px-5 py-2.5 text-sm rounded-xl font-bold border border-slate-300 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  ← Upload Hub
                </button>
                <button 
                  onClick={() => setActiveTab("pricing")}
                  className="px-6 py-3 text-sm rounded-xl font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  Verify Selling Prices →
                </button>
              </div>
            </div>

            {/* Widescreen Columns Panel Side-By-Side Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* Mastersheet Columns Panel */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                  <span>Mastersheet (Item Directory) column mapping</span>
                  <span className="text-xs font-mono text-slate-500 font-semibold">Source: mastersheet</span>
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
                          <span className="text-xs text-slate-500 uppercase font-mono font-bold">Shopify Target Column</span>
                          <strong className="text-sm font-extrabold text-slate-900 mt-1">{item.key}</strong>
                        </div>
                        <span className={`text-[10px] px-3 py-1 rounded border font-mono font-extrabold uppercase ${getScoreColor(item.key, masterMappings[item.key])}`}>
                          {getScoreLabel(item.key, masterMappings[item.key])}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500">Linked Excel Column:</span>
                        <select 
                          value={masterMappings[item.key] || ""} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setMasterMappings(prev => ({ ...prev, [item.key]: val }));
                            saveMappingCorrection("mastersheet", item.key, val);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2.5 text-sm font-bold cursor-pointer outline-none focus:border-emerald-500"
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
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3 flex justify-between items-center">
                  <span>Content Copy Sheet column mapping</span>
                  <span className="text-xs font-mono text-slate-500 font-semibold">Source: contentsheet</span>
                </h3>

                <div className="flex flex-col gap-4">
                  {[
                    { key: "Title", label: "D2C Product Title" },
                    { key: "Body (HTML)", label: "PDP Product Description (Body)" }
                  ].map(item => (
                    <div key={item.key} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-500 uppercase font-mono font-bold">Shopify Target Column</span>
                          <strong className="text-sm font-extrabold text-slate-900 mt-1">{item.key}</strong>
                        </div>
                        <span className={`text-[10px] px-3 py-1 rounded border font-mono font-extrabold uppercase ${getScoreColor(item.key, contentMappings[item.key])}`}>
                          {getScoreLabel(item.key, contentMappings[item.key])}
                        </span>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-500">Linked Excel Column:</span>
                        <select 
                          value={contentMappings[item.key] || ""} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setContentMappings(prev => ({ ...prev, [item.key]: val }));
                            saveMappingCorrection("contentsheet", item.key, val);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-lg p-2.5 text-sm font-bold cursor-pointer outline-none focus:border-emerald-500"
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
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Selling Price Adjuster</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  Adjust selling prices individually or bulk update specific product categories. High-fidelity .9 pricing is auto-calculated.
                </p>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setActiveTab("mapper")}
                  className="px-5 py-2.5 text-sm rounded-xl font-bold border border-slate-300 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  ← Mapping Review
                </button>
                <button 
                  onClick={() => setActiveTab("compile")}
                  className="px-6 py-3 text-sm rounded-xl font-extrabold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-500/10 cursor-pointer"
                >
                  Conflict Scanner →
                </button>
              </div>
            </div>

            {/* BULK DISCOUNT CONFIGURATION PANEL */}
            <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-5 bg-white/30">
              <div className="flex items-center gap-3">
                <div className="text-2xl">💰</div>
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-800">Bulk Category Discount Adjuster</span>
                  <span className="text-xs text-slate-505 mt-0.5">Configure default selling prices in a single click</span>
                </div>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500 font-mono uppercase">Target Division</span>
                  <select 
                    value={bulkDiscountDivision}
                    onChange={(e) => setBulkDiscountDivision(e.target.value)}
                    className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg p-2 font-bold outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="APPAREL">Apparel Only</option>
                    <option value="FOOTWEAR">Footwear Only</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-bold text-slate-500 font-mono uppercase">Discount Rate</span>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number"
                      min="0"
                      max="100"
                      value={bulkDiscountPct}
                      onChange={(e) => setBulkDiscountPct(e.target.value)}
                      className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg p-2 w-16 text-center font-bold outline-none focus:border-emerald-500"
                    />
                    <span className="text-sm text-slate-550 font-bold">% OFF</span>
                  </div>
                </div>

                <button 
                  onClick={handleBulkDiscountApply}
                  className="px-5 py-2.5 mt-4 text-sm font-extrabold rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/15 cursor-pointer transition"
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
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600">Identified Color-Style Groups</h3>
                  <span className="text-xs font-mono text-slate-500 font-semibold">{filteredProducts.length} entries shown</span>
                </div>

                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    placeholder="Search color link/SKU..."
                    value={searchPriceQuery}
                    onChange={(e) => setSearchPriceQuery(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 rounded-lg px-3.5 py-2.5 text-sm w-60 outline-none font-semibold focus:border-emerald-500"
                  />
                  <select 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold rounded-lg px-3.5 py-2.5 outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="APPAREL">Apparel</option>
                    <option value="FOOTWEAR">Footwear</option>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-800 font-bold tracking-wide">
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
                        <tr key={p.link} className="border-b border-slate-200 hover:bg-slate-50/10 transition text-slate-800">
                          <td className="p-4 font-mono font-extrabold text-emerald-600 text-sm">{p.link}</td>
                          <td className="p-4">
                            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-slate-700 font-bold">
                              {p.division}
                            </span>
                          </td>
                          <td className="p-4 font-bold text-slate-500">Rs. {p.mrp}</td>
                          <td className="p-4">
                            <span className={`text-xs font-bold font-mono px-2.5 py-1 rounded ${
                              discountPercentage > 0 
                                ? "bg-teal-500/10 text-emerald-600 border border-teal-500/10" 
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {discountPercentage > 0 ? `${discountPercentage}% OFF` : "No discount"}
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-slate-500 font-bold text-sm">Rs.</span>
                              <input 
                                type="number" 
                                value={sellingPrice}
                                onChange={(e) => handlePriceChange(p.link, e.target.value)}
                                className="bg-slate-50 border border-slate-300 text-slate-900 font-bold rounded-lg px-2.5 py-1.5 text-sm w-28 text-right focus:border-emerald-500 transition outline-none"
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
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Scanner & Shopify CSV Compiler</h2>
                <p className="text-sm text-slate-500 mt-1.5">
                  Scanner detects syntax warnings (duplicate barcode links, missing apparel size matrices) prior to building standard CSV exports.
                </p>
              </div>

              <button 
                onClick={() => setActiveTab("pricing")}
                className="px-5 py-2.5 text-sm rounded-xl font-bold border border-slate-300 text-slate-600 hover:text-slate-900 transition cursor-pointer shadow-sm"
              >
                ← Back to Pricing
              </button>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start w-full">
              
              {/* SCANNER REPORT LIST (LEFT) */}
              <div className="xl:col-span-2 glass-panel rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600">Scanner Logs Terminal</h3>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setValidationFilter("ALL")}
                      className={`px-3 py-1 rounded-lg text-[10px] font-extrabold font-mono transition cursor-pointer ${
                        validationFilter === "ALL" 
                          ? "bg-emerald-600 text-white" 
                          : "bg-slate-50 text-slate-550 hover:bg-slate-100"
                      }`}
                    >
                      ALL ({validationReport.length})
                    </button>
                    <button 
                      onClick={() => setValidationFilter("ERROR")}
                      className={`px-3 py-1 rounded-lg text-[10px] font-extrabold font-mono transition cursor-pointer ${
                        validationFilter === "ERROR" 
                          ? "bg-red-500/20 text-red-500 border border-red-500/10" 
                          : "bg-slate-50 text-slate-550 hover:bg-slate-100"
                      }`}
                    >
                      ERRORS ({validationReport.filter(w => w.type === "ERROR").length})
                    </button>
                    <button 
                      onClick={() => setValidationFilter("WARNING")}
                      className={`px-3 py-1 rounded-lg text-[10px] font-extrabold font-mono transition cursor-pointer ${
                        validationFilter === "WARNING" 
                          ? "bg-amber-500/20 text-amber-500 border border-amber-500/10" 
                          : "bg-slate-50 text-slate-550 hover:bg-slate-100"
                      }`}
                    >
                      WARNINGS ({validationReport.filter(w => w.type === "WARNING").length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-2 custom-scroll">
                  {validationReport.length === 0 ? (
                    <div className="border border-dashed border-emerald-500/20 bg-emerald-500/5 text-emerald-500 p-12 rounded-xl text-center text-sm font-bold">
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
                          <div className="text-xl leading-none mt-0.5">{w.type === "ERROR" ? "🛑" : "⚠️"}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-extrabold uppercase tracking-widest text-slate-500">{w.type} log</span>
                              {w.sku && (
                                <span className="font-mono text-[10px] bg-white px-3 py-1 rounded text-emerald-600 border border-emerald-500/5 font-bold">
                                  SKU: {w.sku}
                                </span>
                              )}
                            </div>
                            <p className="text-sm mt-2 leading-relaxed text-slate-800 font-bold">{w.message}</p>
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
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3.5 text-left">
                    CSV Compilation Manager
                  </h3>

                  <div className="text-left py-2 flex flex-col gap-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-semibold">Total Errors:</span>
                      <strong className="text-red-400 font-extrabold font-mono text-base">{validationReport.filter(w => w.type === "ERROR").length}</strong>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500 font-semibold">Total Warnings:</span>
                      <strong className="text-amber-400 font-extrabold font-mono text-base">{validationReport.filter(w => w.type === "WARNING").length}</strong>
                    </div>
                  </div>

                  {validationReport.some(w => w.type === "ERROR") ? (
                    <div className="p-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-400 text-sm font-bold text-left">
                      🛑 Cannot compile. Scan logs contain fatal errors. Please correct mappings or source details.
                    </div>
                  ) : (
                    <button 
                      onClick={triggerGenerateCSV}
                      className="w-full py-4 mt-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-sm uppercase tracking-widest"
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
                      <h4 className="text-base font-extrabold text-slate-900">Shopify CSV Built</h4>
                      <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto font-semibold">
                        Variant grouping joins and metafield compiles completed. Encoded in utf-8-sig format for Excel.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 p-4 rounded-xl">
                      <div className="text-center">
                        <div className="text-xl font-extrabold text-emerald-600 font-mono">{genResult.totalProducts}</div>
                        <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-650 mt-1.5">Products</div>
                      </div>
                      <div className="text-center border-l border-slate-200">
                        <div className="text-xl font-extrabold text-emerald-600 font-mono">{genResult.totalVariants}</div>
                        <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-650 mt-1.5">Variants</div>
                      </div>
                    </div>

                    <a 
                      href={`${API_BASE}${genResult.downloadUrl}`}
                      className="w-full py-4.5 rounded-xl font-extrabold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer text-center text-sm uppercase tracking-widest block"
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
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Historical Audit Explorer</h2>
              <p className="text-sm text-slate-500 mt-1.5">
                Browse database run history logs from local SQLite memory. Grab download links for all generated outputs.
              </p>
            </div>

            {/* Log table panel */}
            <div className="glass-panel rounded-2xl p-6">
              
              <div className="flex justify-between items-center mb-4 border-b border-slate-200 pb-3.5 flex-wrap gap-3">
                <span className="text-sm font-extrabold uppercase tracking-widest text-emerald-600">Compilation Run History Logs</span>
                <span className="text-xs font-mono text-slate-500 font-semibold">{historyLogs.length} runs recorded</span>
              </div>

              {historyLogs.length === 0 ? (
                <div className="text-center py-16 text-slate-500 border border-dashed border-slate-200 rounded-xl bg-slate-50/50 text-sm font-bold">
                  No past processing runs found. Upload files inside the hub to compile your first D2C Shopify list.
                </div>
              ) : (
                <div className="overflow-x-auto custom-scroll border border-slate-200 bg-slate-50 rounded-xl">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-100/90 text-slate-800 font-bold tracking-wide">
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
                        <tr key={log.id} className="border-b border-slate-200 hover:bg-slate-50/10 transition text-slate-800">
                          <td className="p-4 font-mono font-extrabold text-emerald-600 text-sm">#{log.id}</td>
                          <td className="p-4 font-bold text-slate-500 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="p-4 font-bold text-slate-800 max-w-xs truncate text-sm">{log.mastersheet_name}</td>
                          <td className="p-4 font-bold text-slate-800 max-w-xs truncate text-sm">{log.contentsheet_name}</td>
                          <td className="p-4 font-mono font-extrabold text-slate-900 text-sm">{log.total_products}</td>
                          <td className="p-4 font-mono font-extrabold text-emerald-600 text-sm">{log.total_variants}</td>
                          <td className="p-4 text-right">
                            <a 
                              href={`${API_BASE}/api/download/${log.output_csv_name}`}
                              className="px-3.5 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/25 hover:bg-emerald-600 hover:text-white font-extrabold text-xs transition uppercase tracking-wider cursor-pointer"
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
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 font-sans">Matrixify Populator</h2>
              <p className="text-sm text-slate-500 mt-1.5 font-sans">
                Upload your Matrixify spreadsheet and the corresponding Content Copy Sheet. The engine will automatically split multi-line bullet points and map descriptions.
              </p>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start w-full">
              
              {/* UPLOAD PANEL */}
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-6">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3.5 font-sans">Matrixify Workspace</h3>
                
                <form onSubmit={handleMatrixifySubmit} className="flex flex-col gap-5">
                  
                  {/* Matrixify Sheet Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-emerald-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMatrixifyFile(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">📊</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 leading-snug font-sans">
                          {matrixifyFile ? matrixifyFile.name : "Select Matrixify Excel File"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1 font-sans">Accepts Excel (.xlsx) file exported from Shopify</span>
                      </div>
                    </div>
                    {matrixifyFile && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>

                  {/* Content Copy Upload */}
                  <div className="border border-dashed border-slate-200 hover:border-emerald-500/40 bg-slate-50 rounded-xl p-5 flex items-center justify-between relative transition group">
                    <input 
                      type="file" 
                      accept=".xlsx"
                      onChange={(e) => setMatrixifyContentSheet(e.target.files[0])}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center text-emerald-600 font-bold text-lg">📝</div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800 leading-snug font-sans">
                          {matrixifyContentSheet ? matrixifyContentSheet.name : "Select Content Copy Sheet"}
                        </span>
                        <span className="text-xs text-slate-500 mt-1 font-sans">Accepts Excel (.xlsx) containing descriptions & bullet points</span>
                      </div>
                    </div>
                    {matrixifyContentSheet && <span className="text-sm text-emerald-500 font-extrabold font-mono">✓</span>}
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 mt-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/10 hover:scale-[1.01] active:scale-[0.99] transition cursor-pointer text-sm uppercase tracking-widest font-sans"
                  >
                    Populate Matrixify Sheet →
                  </button>
                </form>
              </div>

              {/* DOWNLOAD & INFO CARD */}
              <div className="flex flex-col gap-6 w-full">
                
                {/* Information Card */}
                <div className="glass-panel rounded-2xl p-6 flex flex-col gap-3">
                  <h3 className="text-sm font-extrabold uppercase tracking-widest text-emerald-600 border-b border-slate-200 pb-3.5 font-sans">
                    Mapping Rules Details
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed font-sans font-medium">
                    This utility maps product descriptions and splits multi-line bullet points from the Content Sheet to target metafields in the Matrixify spreadsheet:
                  </p>
                  <ul className="text-slate-500 text-sm list-disc pl-5 flex flex-col gap-2 font-sans font-semibold">
                    <li><strong>Column 1 (DM)</strong>: <code>custom.description</code> (Mapped from the description copy).</li>
                    <li><strong>Columns 2 to 6 (DN to DR)</strong>: <code>custom.product_info1</code> to <code>custom.product_info5</code> (Splits the multi-line Bullet Points column into 5 separate product info meta-fields).</li>
                  </ul>
                </div>

                {matrixifyResult && (
                  <div className="glass-panel rounded-2xl p-6 flex flex-col gap-5 text-center bg-slate-50/40 border-emerald-500/20 animate-fade-in">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xl flex items-center justify-center mx-auto animate-bounce">
                      ✓
                    </div>
                    <div>
                      <h4 className="text-base font-extrabold text-slate-900 font-sans">Matrixify Sheet Populated!</h4>
                      <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto font-sans font-semibold">
                        Descriptions mapped and bullet points separated successfully.
                      </p>
                    </div>

                    <a 
                      href={`${API_BASE}${matrixifyResult.downloadUrl}`}
                      className="w-full py-4.5 rounded-xl font-extrabold bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-lg shadow-teal-500/20 hover:scale-[1.02] active:scale-[0.98] transition cursor-pointer text-center text-sm uppercase tracking-widest block font-sans"
                    >
                      ⬇ Download Populated Matrixify File
                    </a>
                  </div>
                )}

              </div>

            </div>

          </div>
        )}


      </main>
        </>
      )}

      {/* CONNECTION SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800 font-sans flex items-center gap-2">
                ⚙️ Backend Connection Settings
              </h3>
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            
            <div className="flex flex-col gap-2.5">
              <label className="text-[10px] uppercase font-bold tracking-wider text-slate-500">FastAPI Backend API Base URL</label>
              <input 
                type="text" 
                value={inputApiUrl}
                onChange={(e) => setInputApiUrl(e.target.value)}
                placeholder="https://your-backend-xxxx.up.railway.app"
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-3 py-2 text-xs focus:border-emerald-500 outline-none font-sans"
              />
              <p className="text-[10px] text-slate-400 font-sans">
                Specify the public URL of your FastAPI backend service deployed on Railway. Example: <code className="bg-slate-100 px-1 py-0.5 rounded">https://d2c-autolister-backend.up.railway.app</code>
              </p>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-100 gap-3">
              <button 
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="px-3.5 py-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 font-bold text-xs transition cursor-pointer font-sans"
              >
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>
              
              <div className="flex gap-2.5 font-sans">
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveSettings}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs shadow-md shadow-emerald-500/10 transition cursor-pointer"
                >
                  Save & Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
