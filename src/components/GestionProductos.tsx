import React, { useMemo, useRef, useState } from 'react';
import { 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  X, 
  Printer, 
  FileSpreadsheet, 
  Package, 
  Image as ImageIcon, 
  Layers, 
  ShoppingBag, 
  FileText, 
  Settings, 
  Barcode, 
  ListFilter,
  Upload,
  Check,
  AlertCircle
} from 'lucide-react';

interface ProductItem {
  id: number | string;
  code: string;
  barcode: string;
  altCode?: string;
  barcodeAliases?: string[];
  sriAuxCode?: string;
  name: string;
  shortName?: string;
  line: string;
  category: string;
  subCategory?: string;
  subGroup?: string;
  ivaRate: string; // '15%', '0%', 'EXENTO', 'NO_OBJETO'
  stock: number;
  currentCost: number;
  purchaseCost: number;
  standardCost: number;
  grossWeight: number;
  netWeight: number;
  price: number;
  image?: string;
  // Checkbox flags
  active: boolean;
  controlPrices: boolean;
  controlNegatives: boolean;
  composite: boolean;
  serialNumbers: boolean;
  fuel: boolean;
  vehicles: boolean;
  controlLots: boolean;
  rawMaterial: boolean;
  registerVariants: boolean;
  sellByWeight: boolean;
  controlRestock: boolean;
  // Measures
  saleUnit: string;
  purchaseUnit: string;
  superiorUnit: string;
  superiorUnitFactor: number;
  interiorUnit: string;
  // Price Tiers
  priceTiers: {
    name: string;
    price: number;
    priceWithIva: number;
    marginPct: number;
    profitPct: number;
    profitAmount: number;
    discountPct: number;
    netPrice: number;
    scale: number;
  }[];
}

interface GestionProductosProps {
  products: ProductItem[];
  categories: any[];
  onSaveProduct?: (product: any) => void | Promise<void>;
  onDeleteProduct?: (id: number | string) => void;
}

export const GestionProductos: React.FC<GestionProductosProps> = ({
  products,
  categories,
  onSaveProduct,
  onDeleteProduct
}) => {
  // Selected product state
  const [selectedProductId, setSelectedProductId] = useState<number | string>(
    products.length > 0 ? products[0].id : ''
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<
    'datos' | 'almacenes' | 'imagenes' | 'ecommerce' | 'ficha' | 'parametros' | 'alternos' | 'listado'
  >('datos');

  // Search in listado tab
  const [searchTerm, setSearchTerm] = useState('');

  // Default initial item
  const initialProductState = (prod?: ProductItem): ProductItem => {
    if (prod) {
      return {
        ...prod,
        barcode: prod.barcode || prod.code || '',
        altCode: prod.altCode || '',
        barcodeAliases: Array.isArray(prod.barcodeAliases) ? prod.barcodeAliases : [],
        sriAuxCode: prod.sriAuxCode || '',
        shortName: prod.shortName || prod.name || '',
        line: prod.line || 'General',
        category: prod.category || 'General',
        subCategory: prod.subCategory || 'General',
        subGroup: prod.subGroup || 'General',
        ivaRate: prod.ivaRate || '0%',
        stock: prod.stock ?? 3.0,
        currentCost: prod.currentCost ?? 5.23,
        purchaseCost: prod.purchaseCost ?? 5.23,
        standardCost: prod.standardCost ?? 0.0,
        grossWeight: prod.grossWeight ?? 0.0,
        netWeight: prod.netWeight ?? 0.0,
        active: prod.active ?? true,
        controlPrices: prod.controlPrices ?? true,
        controlNegatives: prod.controlNegatives ?? true,
        composite: prod.composite ?? false,
        serialNumbers: prod.serialNumbers ?? false,
        fuel: prod.fuel ?? false,
        vehicles: prod.vehicles ?? false,
        controlLots: prod.controlLots ?? false,
        rawMaterial: prod.rawMaterial ?? false,
        registerVariants: prod.registerVariants ?? false,
        sellByWeight: prod.sellByWeight ?? false,
        controlRestock: prod.controlRestock ?? false,
        saleUnit: prod.saleUnit || 'Unidad',
        purchaseUnit: prod.purchaseUnit || 'Unidad',
        superiorUnit: prod.superiorUnit || 'Sin Definir',
        superiorUnitFactor: prod.superiorUnitFactor ?? 0.0,
        interiorUnit: prod.interiorUnit || 'Sin Definir',
        priceTiers: prod.priceTiers || [
          { name: 'PVP', price: prod.price || 5.5, priceWithIva: prod.price || 5.5, marginPct: 5.0, profitPct: 5.16, profitAmount: 0.27, discountPct: 0.0, netPrice: prod.price || 5.5, scale: 0 },
          { name: 'Precio 2', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
          { name: 'Precio 3', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
          { name: 'TMCHESQ', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
          { name: 'MAYORISTA', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
        ]
      };
    }
    return {
      id: Date.now(),
      code: '',
      barcode: '',
      altCode: '',
      barcodeAliases: [],
      sriAuxCode: '',
      name: 'NUEVO PRODUCTO',
      shortName: 'NUEVO PROD',
      line: 'General',
      category: 'General',
      subCategory: 'General',
      subGroup: 'General',
      ivaRate: '15%',
      stock: 10,
      currentCost: 1.0,
      purchaseCost: 1.0,
      standardCost: 0.0,
      grossWeight: 0.0,
      netWeight: 0.0,
      price: 1.5,
      active: true,
      controlPrices: true,
      controlNegatives: true,
      composite: false,
      serialNumbers: false,
      fuel: false,
      vehicles: false,
      controlLots: false,
      rawMaterial: false,
      registerVariants: false,
      sellByWeight: false,
      controlRestock: false,
      saleUnit: 'Unidad',
      purchaseUnit: 'Unidad',
      superiorUnit: 'Sin Definir',
      superiorUnitFactor: 0.0,
      interiorUnit: 'Sin Definir',
      priceTiers: [
        { name: 'PVP', price: 1.5, priceWithIva: 1.73, marginPct: 33.3, profitPct: 50.0, profitAmount: 0.5, discountPct: 0.0, netPrice: 1.5, scale: 0 },
        { name: 'Precio 2', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
        { name: 'Precio 3', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
        { name: 'TMCHESQ', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
        { name: 'MAYORISTA', price: 0.0, priceWithIva: 0.0, marginPct: 0.0, profitPct: 0.0, profitAmount: 0.0, discountPct: 0.0, netPrice: 0.0, scale: 0 },
      ]
    };
  };

  const currentProduct = products.find(p => String(p.id) === String(selectedProductId));
  const [formData, setFormData] = useState<ProductItem>(initialProductState(currentProduct));
  const [alternateCodeDraft, setAlternateCodeDraft] = useState('');

  const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const productCodes = (product: Partial<ProductItem>) => [
    product.code,
    product.barcode,
    product.altCode,
    ...(Array.isArray(product.barcodeAliases) ? product.barcodeAliases : [])
  ].map(normalizeCode).filter(Boolean);

  const currentProductCodes = useMemo(() => productCodes(formData), [formData]);
  const conflictingCode = useMemo(() => {
    const currentCodes = new Set(currentProductCodes);
    if (currentCodes.size === 0) return '';
    const conflict = products.find(product => (
      String(product.id) !== String(formData.id) &&
      productCodes(product).some(code => currentCodes.has(code))
    ));
    if (!conflict) return '';
    return currentProductCodes.find(code => productCodes(conflict).includes(code)) || '';
  }, [currentProductCodes, formData.id, products]);

  // Whenever selected product changes in view mode, sync form
  React.useEffect(() => {
    if (!isEditing && !isNewProduct && currentProduct) {
      setFormData(initialProductState(currentProduct));
    }
  }, [selectedProductId, products, isEditing, isNewProduct]);

  React.useEffect(() => {
    if (isNewProduct && isEditing) {
      setTimeout(() => {
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      }, 0);
    }
  }, [isNewProduct, isEditing]);

  // Handle New Button
  const handleNew = () => {
    setIsNewProduct(true);
    setIsEditing(true);
    setFormData(initialProductState());
    setAlternateCodeDraft('');
    setActiveTab('datos');
  };

  // Handle Edit Button
  const handleModify = () => {
    if (!currentProduct) return;
    setIsEditing(true);
    setIsNewProduct(false);
    setActiveTab('datos');
  };

  // Handle Cancel Button
  const handleCancel = () => {
    setIsEditing(false);
    setIsNewProduct(false);
    setAlternateCodeDraft('');
    if (currentProduct) {
      setFormData(initialProductState(currentProduct));
    }
  };

  // Handle Save Button
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      alert('Por favor ingrese la descripción/nombre del producto.');
      return;
    }

    if (!normalizeCode(formData.barcode)) {
      alert('Primero escanee o ingrese el codigo de barras del producto.');
      setActiveTab('datos');
      return;
    }

    if (conflictingCode) {
      alert(`El codigo ${conflictingCode} ya esta asignado a otro producto.`);
      return;
    }

    try {
      if (onSaveProduct) await onSaveProduct(formData);
    } catch (error: any) {
      alert(error?.message || 'No se pudo guardar el producto.');
      return;
    }

    setIsEditing(false);
    setIsNewProduct(false);
    alert(`Producto "${formData.name}" guardado exitosamente.`);
  };

  const handleAddAlternateCode = () => {
    const code = normalizeCode(alternateCodeDraft);
    if (!code) return;
    if (currentProductCodes.includes(code)) {
      alert('Ese codigo ya esta registrado en este producto.');
      return;
    }
    const conflict = products.find(product => (
      String(product.id) !== String(formData.id) && productCodes(product).includes(code)
    ));
    if (conflict) {
      alert(`El codigo ${code} ya esta asignado a ${conflict.name}.`);
      return;
    }
    setFormData(previous => ({
      ...previous,
      barcodeAliases: [...(previous.barcodeAliases || []), code]
    }));
    setAlternateCodeDraft('');
  };

  const handleRemoveAlternateCode = (code: string) => {
    setFormData(previous => ({
      ...previous,
      barcodeAliases: (previous.barcodeAliases || []).filter(item => item !== code)
    }));
  };

  // Handle Delete Button
  const handleDelete = () => {
    if (!currentProduct) return;
    if (confirm(`¿Está seguro de eliminar el producto "${currentProduct.name}"?`)) {
      if (onDeleteProduct) {
        onDeleteProduct(currentProduct.id);
      }
      setIsEditing(false);
      setIsNewProduct(false);
      if (products.length > 1) {
        const next = products.find(p => String(p.id) !== String(currentProduct.id));
        if (next) setSelectedProductId(next.id);
      }
    }
  };

  // Price tier update helper
  const handleTierChange = (index: number, field: string, value: number) => {
    const updatedTiers = [...formData.priceTiers];
    const tier = { ...updatedTiers[index] };
    
    if (field === 'price') {
      tier.price = value;
      // recalculate price with IVA
      const ivaMult = formData.ivaRate === '15%' ? 1.15 : 1.0;
      tier.priceWithIva = Number((value * ivaMult).toFixed(6));
      tier.profitAmount = Number((value - formData.purchaseCost).toFixed(2));
      tier.profitPct = formData.purchaseCost > 0 
        ? Number(((tier.profitAmount / formData.purchaseCost) * 100).toFixed(2)) 
        : 0;
      tier.netPrice = value;
      if (index === 0) {
        formData.price = value;
      }
    } else if (field === 'marginPct') {
      tier.marginPct = value;
    }

    updatedTiers[index] = tier;
    setFormData({ ...formData, priceTiers: updatedTiers });
  };

  const filteredProductsList = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (p.barcode && p.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* ---------------- 1. TOP ACTION RIBBON BAR ---------------- */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* BUSCAR */}
          <button
            onClick={() => setActiveTab('listado')}
            className="flex items-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-400 font-bold px-3 py-1.5 rounded-xl transition-all"
            title="Buscar en catálogo"
          >
            <Search size={14} />
            <span>Buscar</span>
          </button>

          {/* NUEVO */}
          <button
            onClick={handleNew}
            disabled={isEditing}
            className="flex items-center gap-1.5 bg-[#00ff41] hover:bg-[#00e038] disabled:opacity-50 text-black font-display font-black px-3.5 py-1.5 rounded-xl transition-all shadow-[0_0_10px_rgba(0,255,65,0.2)]"
          >
            <Plus size={14} />
            <span>Nuevo +</span>
          </button>

          {/* MODIFICAR */}
          <button
            onClick={handleModify}
            disabled={isEditing || !currentProduct}
            className="flex items-center gap-1.5 bg-blue-950/60 hover:bg-blue-900/60 disabled:opacity-40 border border-blue-800 text-blue-400 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <Edit3 size={14} />
            <span>Modificar ✏️</span>
          </button>

          {/* ELIMINAR */}
          <button
            onClick={handleDelete}
            disabled={isEditing || !currentProduct}
            className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900/60 disabled:opacity-40 border border-red-800 text-red-400 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <Trash2 size={14} />
            <span>Eliminar 🗑️</span>
          </button>

          <div className="h-5 w-px bg-zinc-800 mx-1" />

          {/* GUARDAR */}
          <button
            onClick={() => handleSave()}
            disabled={!isEditing}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-emerald-600 hover:text-white disabled:opacity-30 border border-zinc-700 text-zinc-300 font-bold px-3.5 py-1.5 rounded-xl transition-all"
          >
            <Save size={14} />
            <span>Guardar 💾</span>
          </button>

          {/* CANCELAR */}
          <button
            onClick={handleCancel}
            disabled={!isEditing}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 border border-zinc-700 text-zinc-300 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <X size={14} />
            <span>Cancelar ❌</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {/* IMPRIMIR */}
          <button
            onClick={() => window.print()}
            className="p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700"
            title="Imprimir ficha de producto"
          >
            <Printer size={15} />
          </button>

          {/* IMPORTAR EXCEL */}
          <button
            onClick={() => alert('Función para importar catálogo desde archivo Excel / CSV')}
            className="flex items-center gap-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800 px-3 py-1.5 rounded-xl font-bold"
          >
            <FileSpreadsheet size={14} />
            <span>Importar 📊</span>
          </button>

        </div>
      </div>

      {/* ---------------- 2. FORM TABS NAV BAR ---------------- */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('datos')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'datos'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Package size={14} />
          <span>Datos Básicos</span>
        </button>

        <button
          onClick={() => setActiveTab('almacenes')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'almacenes'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Layers size={14} />
          <span>Almacenes</span>
        </button>

        <button
          onClick={() => setActiveTab('imagenes')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'imagenes'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <ImageIcon size={14} />
          <span>Imágenes</span>
        </button>

        <button
          onClick={() => setActiveTab('ecommerce')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'ecommerce'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <ShoppingBag size={14} />
          <span>Ecommerce</span>
        </button>

        <button
          onClick={() => setActiveTab('ficha')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'ficha'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <FileText size={14} />
          <span>Ficha Técnica</span>
        </button>

        <button
          onClick={() => setActiveTab('parametros')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'parametros'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Settings size={14} />
          <span>Parámetros</span>
        </button>

        <button
          onClick={() => setActiveTab('alternos')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ${
            activeTab === 'alternos'
              ? 'bg-[#00ff41] text-black font-display shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
          }`}
        >
          <Barcode size={14} />
          <span>Cod. Alternos</span>
        </button>

        <button
          onClick={() => setActiveTab('listado')}
          className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 whitespace-nowrap transition-all ml-auto ${
            activeTab === 'listado'
              ? 'bg-amber-400 text-black font-display font-black shadow-[0_0_12px_rgba(251,191,36,0.25)]'
              : 'text-amber-400 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800'
          }`}
        >
          <ListFilter size={14} />
          <span>Listado Productos</span>
        </button>
      </div>

      {/* ---------------- 3. TAB CONTENT: DATOS BÁSICOS ---------------- */}
      {activeTab === 'datos' && (
        <div className="space-y-4">
          <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-6">
            {/* Top 3 Columns: Codes & Image | Description & Categories | Stock & Costs */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* COLUMN 1: IMAGE + CODES (3 cols) */}
              <div className="lg:col-span-3 space-y-3">
                {/* Product Photo Box */}
                <div className="border-2 border-dashed border-zinc-800 hover:border-[#00ff41]/50 bg-[#0a0a0d] rounded-2xl p-3 flex flex-col items-center justify-center min-h-[140px] text-center relative group transition-all">
                  {formData.image ? (
                    <img src={formData.image} alt={formData.name} className="h-28 w-28 object-contain rounded-xl" />
                  ) : (
                    <div className="space-y-2 text-zinc-500 flex flex-col items-center">
                      <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800">
                        <ImageIcon size={32} className="text-[#00ff41]/80" />
                      </div>
                      <span className="text-[11px] font-medium text-zinc-400">Imagen del producto</span>
                    </div>
                  )}
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        const url = prompt('Ingrese URL de la imagen del producto:');
                        if (url) setFormData({ ...formData, image: url });
                      }}
                      className="absolute bottom-2 right-2 p-1.5 bg-zinc-800 hover:bg-[#00ff41] hover:text-black text-zinc-300 rounded-lg text-[10px] font-bold transition-all"
                    >
                      <Upload size={12} />
                    </button>
                  )}
                </div>

                {/* Codes Form */}
                <div className="space-y-2">
                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Código:</label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-xs focus:border-[#00ff41] outline-none disabled:opacity-75"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Barras:</label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      ref={barcodeInputRef}
                      value={formData.barcode}
                      autoFocus={isNewProduct && isEditing}
                      placeholder={isNewProduct ? 'Escanee el codigo de barras primero' : ''}
                      onChange={(e) => {
                        const barcode = e.target.value.trim().toUpperCase();
                        setFormData(previous => ({
                          ...previous,
                          barcode,
                          code: isNewProduct && (!previous.code || previous.code === previous.barcode) ? barcode : previous.code
                        }));
                      }}
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-[#00ff41] font-mono font-bold text-xs focus:border-[#00ff41] outline-none disabled:opacity-75"
                    />
                    {conflictingCode && (
                      <p className="mt-1 text-[10px] font-bold text-red-400">Codigo repetido: {conflictingCode}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Alterno:</label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.altCode}
                      onChange={(e) => setFormData({ ...formData, altCode: e.target.value })}
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-zinc-300 font-mono text-xs focus:border-[#00ff41] outline-none disabled:opacity-75"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Cod. Aux. SRI:</label>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.sriAuxCode}
                      onChange={(e) => setFormData({ ...formData, sriAuxCode: e.target.value })}
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-amber-400 font-mono text-xs focus:border-[#00ff41] outline-none disabled:opacity-75"
                      placeholder="Código tributario SRI"
                    />
                  </div>
                </div>
              </div>

              {/* COLUMN 2: DESCRIPTION & CATEGORIES (6 cols) */}
              <div className="lg:col-span-6 space-y-2.5">
                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Descripción (Nombre comercial):</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3.5 py-2 text-white font-bold text-sm focus:border-[#00ff41] outline-none disabled:opacity-75 uppercase"
                    placeholder="E.g. MANTECA SUPER BALDE 3KG"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Descripción corta (Ticket):</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.shortName}
                    onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3.5 py-1.5 text-zinc-300 text-xs focus:border-[#00ff41] outline-none disabled:opacity-75 uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Líneas:</label>
                    <div className="flex gap-1">
                      <select
                        disabled={!isEditing}
                        value={formData.line}
                        onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                        className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                      >
                        <option value="General">General</option>
                        <option value="Abarrotes">Abarrotes</option>
                        <option value="Bebidas">Bebidas</option>
                        <option value="Lácteos">Lácteos</option>
                        <option value="Limpieza">Limpieza</option>
                      </select>
                      <button type="button" className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl">
                        <Search size={12} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Categorías:</label>
                    <div className="flex gap-1">
                      <select
                        disabled={!isEditing}
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                      >
                        <option value="General">General</option>
                        <option value="Aceites y Grasas">Aceites y Grasas</option>
                        <option value="Snacks">Snacks</option>
                        <option value="Bebidas Alcohólicas">Bebidas Alcohólicas</option>
                        <option value="Congelados">Congelados</option>
                      </select>
                      <button type="button" className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl">
                        <Search size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Sub Categoría:</label>
                    <div className="flex gap-1">
                      <select
                        disabled={!isEditing}
                        value={formData.subCategory}
                        onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                        className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                      >
                        <option value="General">General</option>
                        <option value="Aceites Vegetales">Aceites Vegetales</option>
                        <option value="Mantecas">Mantecas</option>
                      </select>
                      <button type="button" className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl">
                        <Search size={12} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-400 text-[11px] font-bold block mb-1">Sub Grupo:</label>
                    <div className="flex gap-1">
                      <select
                        disabled={!isEditing}
                        value={formData.subGroup}
                        onChange={(e) => setFormData({ ...formData, subGroup: e.target.value })}
                        className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                      >
                        <option value="General">General</option>
                        <option value="Uso Industrial">Uso Industrial</option>
                        <option value="Uso Hogar">Uso Hogar</option>
                      </select>
                      <button type="button" className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl">
                        <Search size={12} />
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">I.V.A. (Tarifa Tributaria ECU):</label>
                  <select
                    disabled={!isEditing}
                    value={formData.ivaRate}
                    onChange={(e) => setFormData({ ...formData, ivaRate: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-[#00ff41] font-mono font-bold text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                  >
                    <option value="15%">15% (Tarifa General)</option>
                    <option value="0%">0% (Tarifa Cero)</option>
                    <option value="EXENTO">Exento de IVA</option>
                    <option value="NO_OBJETO">No Objeto de IVA</option>
                  </select>
                </div>
              </div>

              {/* COLUMN 3: STOCK & COSTS (3 cols) - RESUMEN DE INVENTARIO INFORMATIVO */}
              <div className="lg:col-span-3 bg-[#0a0a0d] border border-zinc-800 rounded-2xl p-4 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2 mb-3">
                    <div>
                      <span className="text-zinc-400 text-[11px] font-bold block">Existencia Actual:</span>
                      <span className="text-[9px] text-zinc-500 font-sans">Kardex / Movimientos</span>
                    </div>
                    <span className="text-lg font-mono font-black text-[#00ff41]">
                      {formData.stock.toLocaleString('es-EC', { minimumFractionDigits: 3 })} u.
                    </span>
                  </div>

                  <div className="space-y-3 text-[11px]">
                    <div className="bg-[#121217] border border-zinc-800/80 rounded-xl p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-bold">Costo Actual:</span>
                        <span className="text-[9px] text-amber-500 font-medium">Informativo</span>
                      </div>
                      <div className="text-right text-sm font-mono font-bold text-white mt-1">
                        ${formData.currentCost.toFixed(4)}
                      </div>
                    </div>

                    <div className="bg-[#121217] border border-zinc-800/80 rounded-xl p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 font-bold">Costo Compra:</span>
                        <span className="text-[9px] text-amber-500 font-medium">Última Compra</span>
                      </div>
                      <div className="text-right text-sm font-mono font-bold text-white mt-1">
                        ${formData.purchaseCost.toFixed(4)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-2 text-[10px] text-emerald-400 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>Los costos y la existencia se calculan automáticamente con el módulo de Compras e Inventarios.</span>
                </div>
              </div>
            </div>

            {/* ---------------- CHECKBOXES ROW (FLAGS & CONTROL) ---------------- */}
            <div className="pt-3 border-t border-zinc-800">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span className="font-bold text-white">Activo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.controlPrices}
                    onChange={(e) => setFormData({ ...formData, controlPrices: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span className="font-bold text-zinc-200">Controlar Precios</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.controlNegatives}
                    onChange={(e) => setFormData({ ...formData, controlNegatives: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span className="font-bold text-zinc-200">Controlar Negativos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.composite}
                    onChange={(e) => setFormData({ ...formData, composite: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Compuesto</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.serialNumbers}
                    onChange={(e) => setFormData({ ...formData, serialNumbers: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Series</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.fuel}
                    onChange={(e) => setFormData({ ...formData, fuel: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Combustible</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.vehicles}
                    onChange={(e) => setFormData({ ...formData, vehicles: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Vehículos</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.controlLots}
                    onChange={(e) => setFormData({ ...formData, controlLots: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Control Lotes</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.rawMaterial}
                    onChange={(e) => setFormData({ ...formData, rawMaterial: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Materia Prima</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.registerVariants}
                    onChange={(e) => setFormData({ ...formData, registerVariants: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Registra Variantes</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.sellByWeight}
                    onChange={(e) => setFormData({ ...formData, sellByWeight: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Venta x Peso</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none text-zinc-400">
                  <input
                    type="checkbox"
                    disabled={!isEditing}
                    checked={formData.controlRestock}
                    onChange={(e) => setFormData({ ...formData, controlRestock: e.target.checked })}
                    className="rounded accent-[#00ff41] h-4 w-4"
                  />
                  <span>Controlar Reabastecer</span>
                </label>
              </div>
            </div>

            {/* ---------------- TARIFAS GRID & MEASUREMENTS ---------------- */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-3 border-t border-zinc-800">
              
              {/* TARIFAS TABLE (9 cols) */}
              <div className="lg:col-span-9 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white text-xs flex items-center gap-2">
                    <span className="text-[#00ff41]">━</span>
                    <span>Tarifas en: Unidad</span>
                  </div>
                  <div className="text-[10px] text-zinc-400">Escalas y márgenes comerciales configurables</div>
                </div>

                <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-[#0a0a0d]">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                      <tr>
                        <th className="p-2.5">Tarifa</th>
                        <th className="p-2.5 text-right">Precio</th>
                        <th className="p-2.5 text-right">Precio IVA</th>
                        <th className="p-2.5 text-right">Margen</th>
                        <th className="p-2.5 text-right">Utilidad %</th>
                        <th className="p-2.5 text-right">Utilidad $</th>
                        <th className="p-2.5 text-right">Descuento</th>
                        <th className="p-2.5 text-right">Precio Neto</th>
                        <th className="p-2.5 text-center">Escala</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-[11px]">
                      {formData.priceTiers.map((tier, idx) => (
                        <tr key={idx} className={idx === 0 ? 'bg-[#00ff41]/5 font-bold' : 'hover:bg-zinc-800/30'}>
                          <td className="p-2.5 font-sans font-bold text-white">{tier.name}</td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              step="0.000001"
                              disabled={!isEditing}
                              value={tier.price}
                              onChange={(e) => handleTierChange(idx, 'price', parseFloat(e.target.value) || 0)}
                              className="w-24 bg-[#121217] border border-zinc-800 rounded px-2 py-0.5 text-right font-bold text-[#00ff41] outline-none disabled:opacity-75 focus:border-[#00ff41]"
                            />
                          </td>
                          <td className="p-2.5 text-right text-zinc-200">
                            ${tier.priceWithIva.toFixed(6)}
                          </td>
                          <td className="p-2.5 text-right text-zinc-300">
                            {tier.marginPct.toFixed(2)}%
                          </td>
                          <td className="p-2.5 text-right text-zinc-300">
                            {tier.profitPct.toFixed(2)}%
                          </td>
                          <td className="p-2.5 text-right text-emerald-400 font-bold">
                            ${tier.profitAmount.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right text-zinc-400">
                            {tier.discountPct.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right text-zinc-200 font-bold">
                            ${tier.netPrice.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-center text-zinc-400">
                            {tier.scale}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* MEASUREMENTS (MEDIDAS) (3 cols) */}
              <div className="lg:col-span-3 bg-[#0a0a0d] border border-zinc-800 rounded-xl p-3.5 space-y-3">
                <div className="font-bold text-white text-xs border-b border-zinc-800 pb-1.5">
                  Unidades y Medidas
                </div>

                <div>
                  <label className="text-zinc-400 text-[10px] font-bold block mb-1">Medida de Venta:</label>
                  <select
                    disabled={!isEditing}
                    value={formData.saleUnit}
                    onChange={(e) => setFormData({ ...formData, saleUnit: e.target.value })}
                    className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-2.5 py-1 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Caja">Caja</option>
                    <option value="Paquete">Paquete</option>
                    <option value="Kilogramo">Kilogramo</option>
                    <option value="Litro">Litro</option>
                    <option value="Balde">Balde</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-[10px] font-bold block mb-1">Medida de Compra:</label>
                  <select
                    disabled={!isEditing}
                    value={formData.purchaseUnit}
                    onChange={(e) => setFormData({ ...formData, purchaseUnit: e.target.value })}
                    className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-2.5 py-1 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                  >
                    <option value="Unidad">Unidad</option>
                    <option value="Caja">Caja</option>
                    <option value="Fardo">Fardo</option>
                    <option value="Balde">Balde</option>
                    <option value="Quintal">Quintal</option>
                  </select>
                </div>

                <div>
                  <label className="text-zinc-400 text-[10px] font-bold block mb-1">Medida Superior:</label>
                  <div className="flex gap-1">
                    <select
                      disabled={!isEditing}
                      value={formData.superiorUnit}
                      onChange={(e) => setFormData({ ...formData, superiorUnit: e.target.value })}
                      className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                    >
                      <option value="Sin Definir">Sin Definir</option>
                      <option value="Caja x 12">Caja x 12</option>
                      <option value="Caja x 24">Caja x 24</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      disabled={!isEditing}
                      value={formData.superiorUnitFactor}
                      onChange={(e) => setFormData({ ...formData, superiorUnitFactor: parseFloat(e.target.value) || 0 })}
                      className="w-16 bg-[#121217] border border-zinc-800 rounded-lg px-2 py-1 text-emerald-400 font-mono text-xs text-right outline-none disabled:opacity-75"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 text-[10px] font-bold block mb-1">Medida Interior:</label>
                  <select
                    disabled={!isEditing}
                    value={formData.interiorUnit}
                    onChange={(e) => setFormData({ ...formData, interiorUnit: e.target.value })}
                    className="w-full bg-[#121217] border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                  >
                    <option value="Sin Definir">Sin Definir</option>
                    <option value="Gramo">Gramo</option>
                    <option value="Mililitro">Mililitro</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ---------------- 4. TAB CONTENT: LISTADO PRODUCTOS ---------------- */}
      {activeTab === 'listado' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-white font-display flex items-center gap-2">
                <ListFilter className="text-amber-400" size={20} />
                <span>CATÁLOGO DE PRODUCTOS REGISTRADOS</span>
              </h3>
              <p className="text-zinc-400 text-xs mt-0.5">Seleccione un producto para ver o editar sus parámetros técnicos</p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={15} />
              <input
                type="text"
                placeholder="Buscar por código, barras o nombre..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#00ff41] outline-none"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-zinc-800 rounded-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3">Código / Barras</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3">Línea / Categoría</th>
                  <th className="p-3 text-right">PVP</th>
                  <th className="p-3 text-center">IVA</th>
                  <th className="p-3 text-center">Stock</th>
                  <th className="p-3 text-center">Estado</th>
                  <th className="p-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {filteredProductsList.map((p) => {
                  const isSelected = String(p.id) === String(selectedProductId);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#00ff41]/10 border-l-4 border-l-[#00ff41]' : 'hover:bg-zinc-800/40'
                      }`}
                    >
                      <td className="p-3 font-mono">
                        <div className="font-bold text-white">{p.code}</div>
                        <div className="text-[10px] text-[#00ff41]">{p.barcode || p.code}</div>
                      </td>
                      <td className="p-3 font-bold text-white uppercase">{p.name}</td>
                      <td className="p-3 text-zinc-400">
                        {p.line || 'General'} / <span className="text-zinc-300">{p.category || 'General'}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-[#00ff41]">
                        ${(p.price || 0).toFixed(2)}
                      </td>
                      <td className="p-3 text-center font-mono text-zinc-400">
                        {p.ivaRate || '15%'}
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-white">
                        {p.stock ?? 0}
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          ACTIVO
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductId(p.id);
                            setActiveTab('datos');
                            handleModify();
                          }}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-[#00ff41] hover:text-black text-zinc-200 font-bold rounded-lg transition-all text-[11px]"
                        >
                          Cargar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- 5. OTHER FORM TABS (ALMACENES, IMÁGENES, ECOMMERCE, ETC.) ---------------- */}
      {activeTab === 'almacenes' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Layers className="text-[#00ff41]" size={18} />
            <span>Distribución de Stock por Almacén / Bodega</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="text-xs font-bold text-zinc-400">BODEGA PRINCIPAL (MATRIZ)</div>
              <div className="text-2xl font-mono font-black text-[#00ff41]">{(formData.stock * 0.7).toFixed(2)} u.</div>
              <div className="text-[10px] text-zinc-500">Ubicación: Estante A-12</div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="text-xs font-bold text-zinc-400">PUNTO DE VENTA (MOSTRADOR)</div>
              <div className="text-2xl font-mono font-black text-emerald-400">{(formData.stock * 0.3).toFixed(2)} u.</div>
              <div className="text-[10px] text-zinc-500">Ubicación: Exhibición Local</div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="text-xs font-bold text-zinc-400">BODEGA SECUNDARIA</div>
              <div className="text-2xl font-mono font-black text-zinc-500">0.00 u.</div>
              <div className="text-[10px] text-zinc-500">Sin existencias registradas</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'imagenes' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <ImageIcon className="text-[#00ff41]" size={18} />
            <span>Galería de Imágenes del Producto</span>
          </h3>

          <div className="p-8 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center space-y-3 bg-[#0a0a0d]">
            <Upload size={32} className="text-[#00ff41]" />
            <div className="text-xs font-bold text-white">Arrastre imágenes aquí o haga clic para examinar</div>
            <div className="text-[10px] text-zinc-500">Formatos soportados: PNG, JPG, WEBP (Máx 5MB)</div>
          </div>
        </div>
      )}

      {activeTab === 'ecommerce' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <ShoppingBag className="text-[#00ff41]" size={18} />
            <span>Publicación en Catálogo Digital Ecommerce</span>
          </h3>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="rounded accent-[#00ff41] h-4 w-4" />
              <span className="font-bold text-white">Publicar producto en tienda virtual / QR</span>
            </label>

            <div>
              <label className="text-zinc-400 text-xs font-bold block mb-1">Precio Web Promocional ($):</label>
              <input type="number" defaultValue={formData.price} className="bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono text-xs w-48" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ficha' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <FileText className="text-[#00ff41]" />
            <span>Ficha Técnica y Registro Sanitario (ARCSA)</span>
          </h3>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 font-bold block mb-1">Registro Sanitario NSO:</label>
              <input type="text" placeholder="NSO-00123-EC" className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono" />
            </div>

            <div>
              <label className="text-zinc-400 font-bold block mb-1">País de Origen:</label>
              <input type="text" defaultValue="Ecuador" className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'parametros' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Settings className="text-[#00ff41]" size={18} />
            <span>Parámetros de Reabastecimiento y Control</span>
          </h3>

          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <label className="text-zinc-400 font-bold block mb-1">Stock Mínimo:</label>
              <input type="number" defaultValue={5} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-amber-400 font-mono font-bold" />
            </div>

            <div>
              <label className="text-zinc-400 font-bold block mb-1">Punto de Reorden:</label>
              <input type="number" defaultValue={10} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono" />
            </div>

            <div>
              <label className="text-zinc-400 font-bold block mb-1">Stock Máximo:</label>
              <input type="number" defaultValue={50} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-emerald-400 font-mono font-bold" />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'alternos' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Barcode className="text-[#00ff41]" size={18} />
            <span>Códigos de Barras Alternos y Referencias de Proveedores</span>
          </h3>

          <div className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={alternateCodeDraft}
                onChange={event => setAlternateCodeDraft(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddAlternateCode();
                  }
                }}
                placeholder="Nuevo codigo de barras secundario..."
                className="bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono text-xs flex-1"
              />
              <button type="button" onClick={handleAddAlternateCode} className="px-3 py-1.5 bg-[#00ff41] text-black font-bold rounded-xl text-xs">Agregar</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(formData.barcodeAliases || []).map(code => (
                <span key={code} className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-200">
                  {code}
                  <button type="button" onClick={() => handleRemoveAlternateCode(code)} className="text-red-400 hover:text-red-300" aria-label={`Eliminar codigo alterno ${code}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
