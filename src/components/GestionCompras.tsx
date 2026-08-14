import React, { useRef, useState } from 'react';
import { consultarClienteExterno } from '../lib/ecuadorValidador';
import {
  Search,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Printer,
  FileText,
  Building,
  Calendar,
  Layers,
  Package,
  CheckCircle,
  Clock,
  ArrowRight,
  ChevronDown,
  DollarSign,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  ListFilter,
  UserCheck,
  Sparkles
} from 'lucide-react';
import { Supplier } from '../types';

interface PurchaseItemLine {
  id: string | number;
  productId?: string | number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  discount: number;
  unitCost: number;
  netCost: number;
  ivaRate: string; // '15%', '0%', '5%', 'NO_OBJETO', 'EXENTO'
  ivaAmount: number;
  total: number;
  warehouse: string;
}

interface PurchaseRecordFull {
  id: string | number;
  supplierRuc: string;
  supplierName: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  ats: boolean;
  docType: string;
  issueDate: string;
  registerDate: string;
  concept: string;
  warehouse: string;
  items: PurchaseItemLine[];
  // Modifiers
  docModified?: string;
  docModifiedIssue?: string;
  docModifiedAuth?: string;
  // Audit
  createdUser: string;
  createdDate: string;
  modifiedUser?: string;
  modifiedDate?: string;
  // Totals
  subtotal: number;
  discountTotal: number;
  base0: number;
  base15: number;
  base5: number;
  baseNoObj: number;
  baseExento: number;
  totalIva: number;
  totalIce: number;
  total: number;
}

interface GestionComprasProps {
  products: any[];
  suppliers: Supplier[];
  purchasesList?: any[];
  onSavePurchase?: (purchase: PurchaseRecordFull) => void;
  onUpdateProductPrices?: (updatedProducts: any[]) => void;
  onSelectSupplierSubTab?: (tab: string) => void;
}

export const GestionCompras: React.FC<GestionComprasProps> = ({
  products,
  suppliers,
  purchasesList = [],
  onSavePurchase,
  onUpdateProductPrices,
  onSelectSupplierSubTab
}) => {
  // Top Sub-Ribbon Tab: 'compras' | 'listado' | 'proveedores' | 'retencion' | 'ordenes' | 'gastos'
  const [subModule, setSubModule] = useState<'compras' | 'listado' | 'formas_pago' | 'resumen'>('compras');

  // Editing / Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | number>('1');

  // Product picker modal
  const [showProductPickerModal, setShowProductPickerModal] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  // Supplier picker modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);

  // Selected item line in grid
  const [activeGridRowIndex, setActiveGridRowIndex] = useState<number>(0);

  const initialPurchaseState = (existing?: PurchaseRecordFull): PurchaseRecordFull => {
    if (existing) return { ...existing };
    return {
      id: Date.now(),
      supplierRuc: '',
      supplierName: '',
      estab: '',
      ptoEmi: '',
      secuencial: '',
      ats: false,
      docType: '01 Factura',
      issueDate: new Date().toISOString().split('T')[0],
      registerDate: new Date().toISOString().split('T')[0],
      concept: '',
      warehouse: '',
      items: [],
      docModified: '',
      docModifiedIssue: '',
      docModifiedAuth: '',
      createdUser: '',
      createdDate: '',
      subtotal: 0,
      discountTotal: 0,
      base0: 0,
      base15: 0,
      base5: 0,
      baseNoObj: 0,
      baseExento: 0,
      totalIva: 0,
      totalIce: 0,
      total: 0
    };
  };

  const [formData, setFormData] = useState<PurchaseRecordFull>(initialPurchaseState());
  const [isSearchingSupplier, setIsSearchingSupplier] = useState(false);
  const [supplierNotice, setSupplierNotice] = useState<string | null>(null);
  const lookupRequestRef = useRef(0);

  const handleLookupSupplierRuc = async (idNum: string) => {
    const clean = (idNum || '').trim().replace(/\D/g, '');
    if (clean.length !== 10 && clean.length !== 13) return;

    const requestId = ++lookupRequestRef.current;

    setIsSearchingSupplier(true);
    setSupplierNotice(null);

    try {
      const res = await consultarClienteExterno(clean);
      if (requestId !== lookupRequestRef.current) return;
      if (res.found && res.data) {
        const suppName = res.data.name || '';
        setFormData(prev => ({
          ...prev,
          supplierRuc: clean,
          supplierName: res.data!.companyName || suppName
        }));
        setSupplierNotice(null);
      } else {
        setSupplierNotice(res.error || res.message || 'Complete la razón social manualmente.');
      }
    } catch {
      setSupplierNotice('No se pudo completar la búsqueda. Ingrese los datos manualmente.');
    } finally {
      if (requestId === lookupRequestRef.current) setIsSearchingSupplier(false);
    }
  };

  // Recalculate totals helper
  const calculateTotals = (items: PurchaseItemLine[]) => {
    let subtotal = 0;
    let discountTotal = 0;
    let base0 = 0;
    let base15 = 0;
    let base5 = 0;
    let baseNoObj = 0;
    let baseExento = 0;
    let totalIva = 0;

    items.forEach(item => {
      const lineSub = item.quantity * item.unitCost;
      const lineDscto = item.discount || 0;
      const lineNet = lineSub - lineDscto;
      
      subtotal += lineSub;
      discountTotal += lineDscto;

      if (item.ivaRate === '15%') {
        base15 += lineNet;
        totalIva += lineNet * 0.15;
      } else if (item.ivaRate === '5%') {
        base5 += lineNet;
        totalIva += lineNet * 0.05;
      } else if (item.ivaRate === 'NO_OBJETO') {
        baseNoObj += lineNet;
      } else if (item.ivaRate === 'EXENTO') {
        baseExento += lineNet;
      } else {
        // 0%
        base0 += lineNet;
      }
    });

    const total = base0 + base15 + base5 + baseNoObj + baseExento + totalIva;

    return {
      subtotal: Number(subtotal.toFixed(4)),
      discountTotal: Number(discountTotal.toFixed(4)),
      base0: Number(base0.toFixed(4)),
      base15: Number(base15.toFixed(4)),
      base5: Number(base5.toFixed(4)),
      baseNoObj: Number(baseNoObj.toFixed(4)),
      baseExento: Number(baseExento.toFixed(4)),
      totalIva: Number(totalIva.toFixed(4)),
      totalIce: 0.0,
      total: Number(total.toFixed(4))
    };
  };

  // Line update handler
  const handleItemLineChange = (index: number, field: string, value: any) => {
    const updatedItems = [...formData.items];
    const line = { ...updatedItems[index] };

    if (field === 'quantity') {
      line.quantity = parseFloat(value) || 0;
    } else if (field === 'unitCost') {
      line.unitCost = parseFloat(value) || 0;
    } else if (field === 'discount') {
      line.discount = parseFloat(value) || 0;
    } else if (field === 'ivaRate') {
      line.ivaRate = value;
    } else if (field === 'unit') {
      line.unit = value;
    } else if (field === 'warehouse') {
      line.warehouse = value;
    } else if (field === 'name') {
      line.name = value;
    }

    line.netCost = Number((line.unitCost - (line.discount / (line.quantity || 1))).toFixed(6));
    const netTotal = line.quantity * line.unitCost - line.discount;

    if (line.ivaRate === '15%') {
      line.ivaAmount = Number((netTotal * 0.15).toFixed(4));
    } else if (line.ivaRate === '5%') {
      line.ivaAmount = Number((netTotal * 0.05).toFixed(4));
    } else {
      line.ivaAmount = 0;
    }

    line.total = Number((netTotal + line.ivaAmount).toFixed(4));
    updatedItems[index] = line;

    const newTotals = calculateTotals(updatedItems);
    setFormData({
      ...formData,
      items: updatedItems,
      ...newTotals
    });
  };

  // Add line
  const handleAddLine = () => {
    const newLine: PurchaseItemLine = {
      id: Date.now(),
      code: '',
      name: 'NUEVO ITEM DE COMPRA',
      unit: 'Unidad',
      quantity: 1,
      discount: 0,
      unitCost: 1.0,
      netCost: 1.0,
      ivaRate: '0%',
      ivaAmount: 0,
      total: 1.0,
      warehouse: formData.warehouse || 'BODEGA_CAMPOZANO'
    };
    const updated = [...formData.items, newLine];
    const totals = calculateTotals(updated);
    setFormData({ ...formData, items: updated, ...totals });
    setActiveGridRowIndex(updated.length - 1);
  };

  // Remove line
  const handleRemoveLine = (index: number) => {
    if (formData.items.length <= 1) {
      alert('La compra debe mantener al menos 1 ítem en el detalle.');
      return;
    }
    const updated = formData.items.filter((_, i) => i !== index);
    const totals = calculateTotals(updated);
    setFormData({ ...formData, items: updated, ...totals });
    setActiveGridRowIndex(Math.max(0, index - 1));
  };

  // Select product for line
  const handleSelectProductForLine = (product: any) => {
    if (selectedLineIndex === null) return;
    const updated = [...formData.items];
    const line = { ...updated[selectedLineIndex] };

    line.productId = product.id;
    line.code = product.code || product.barcode || 'COD';
    line.name = product.name;
    line.unit = product.saleUnit || 'Unidad';
    line.unitCost = product.purchaseCost || product.currentCost || 1.0;
    line.netCost = line.unitCost;
    line.ivaRate = product.ivaRate || '0%';
    line.total = line.quantity * line.unitCost;

    updated[selectedLineIndex] = line;
    const totals = calculateTotals(updated);
    setFormData({ ...formData, items: updated, ...totals });

    setShowProductPickerModal(false);
    setSelectedLineIndex(null);
  };

  // Select supplier
  const handleSelectSupplier = (supplier: Supplier) => {
    setFormData({
      ...formData,
      supplierRuc: supplier.ruc,
      supplierName: supplier.name
    });
    setShowSupplierModal(false);
  };

  // New purchase handler
  const handleNewPurchase = () => {
    setIsEditing(true);
    setFormData(initialPurchaseState());
    setSubModule('compras');
  };

  // Modify purchase handler
  const handleModifyPurchase = () => {
    setIsEditing(true);
  };

  // Save purchase
  const handleSavePurchase = () => {
    if (!formData.supplierRuc || !formData.supplierName) {
      alert('Por favor seleccione un proveedor válido.');
      return;
    }
    if (formData.items.length === 0) {
      alert('Agregue al menos un producto al detalle de la compra.');
      return;
    }

    if (onSavePurchase) {
      onSavePurchase(formData);
    }

    setIsEditing(false);
    alert(`Factura/Comprobante de Compra ${formData.estab}-${formData.ptoEmi}-${formData.secuencial} guardado exitosamente.`);
  };

  // Sync / Update Sales Prices
  const handleUpdateSalesPrices = () => {
    alert('Precios de venta de los productos actualizados con base en los nuevos costos de compra registrados.');
  };

  const filteredProductsModal = products.filter(p =>
    p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
    (p.code && p.code.toLowerCase().includes(productSearchTerm.toLowerCase()))
  );

  const totalQuantitySum = formData.items.reduce((acc, i) => acc + (i.quantity || 0), 0);

  return (
    <div className="space-y-3 font-sans text-xs">
      
      {/* ---------------- 1. SUB-RIBBON TOP NAVIGATION BAR ---------------- */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-2 shadow-lg flex flex-wrap items-center gap-1.5 overflow-x-auto">
        <button
          type="button"
          onClick={() => alert('Módulo de Gastos Operativos TENDI')}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Gastos
        </button>

        <button
          type="button"
          onClick={() => alert('Análisis Estadístico de Compras')}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Análisis
        </button>

        <button
          type="button"
          onClick={() => alert('Órdenes de Compra a Proveedores')}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Órdenes
        </button>

        <button
          type="button"
          onClick={() => alert('Recepción e Ingreso Físico de Mercadería')}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Recepción
        </button>

        {/* ACTIVE MAIN SUBTAB: COMPRAS */}
        <button
          type="button"
          onClick={() => setSubModule('compras')}
          className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
            subModule === 'compras'
              ? 'bg-[#00ff41] text-black font-display font-black shadow-[0_0_12px_rgba(0,255,65,0.25)]'
              : 'text-zinc-300 hover:bg-zinc-800'
          }`}
        >
          <ShoppingBag size={14} />
          <span>Compras</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (onSelectSupplierSubTab) onSelectSupplierSubTab('retenciones');
          }}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Retención
        </button>

        <button
          type="button"
          onClick={() => {
            if (onSelectSupplierSubTab) onSelectSupplierSubTab('proveedores');
          }}
          className="px-3 py-1.5 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-all text-xs"
        >
          Proveedores
        </button>

        <button
          type="button"
          onClick={() => setSubModule('listado')}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
            subModule === 'listado'
              ? 'bg-amber-400 text-black font-black'
              : 'text-amber-400 hover:bg-amber-950/40'
          }`}
        >
          Listado Compras
        </button>
      </div>

      {/* ---------------- 2. ACTION TOOLBAR RIBBON (GESTIÓN DE COMPRAS) ---------------- */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-3 shadow-xl flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="text-[11px] font-bold text-zinc-400 mr-2 border-r border-zinc-800 pr-3">
            Mantenimiento | Adicionales | Contabilidad
          </div>

          {/* BUSCAR */}
          <button
            type="button"
            onClick={() => setSubModule('listado')}
            className="flex items-center gap-1.5 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800 text-emerald-400 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <Search size={14} />
            <span>Buscar 🔍</span>
          </button>

          {/* NUEVO */}
          <button
            type="button"
            onClick={handleNewPurchase}
            className="flex items-center gap-1.5 bg-[#00ff41] hover:bg-[#00e038] text-black font-display font-black px-3.5 py-1.5 rounded-xl transition-all shadow-[0_0_10px_rgba(0,255,65,0.2)]"
          >
            <Plus size={14} />
            <span>Nuevo ➕</span>
          </button>

          {/* MODIFICAR */}
          <button
            type="button"
            onClick={handleModifyPurchase}
            disabled={isEditing}
            className="flex items-center gap-1.5 bg-blue-950/60 hover:bg-blue-900/60 disabled:opacity-40 border border-blue-800 text-blue-400 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <Edit3 size={14} />
            <span>Modificar ✏️</span>
          </button>

          {/* ELIMINAR */}
          <button
            type="button"
            onClick={() => {
              if (confirm('¿Está seguro de eliminar esta factura de compra?')) {
                alert('Compra eliminada del sistema.');
              }
            }}
            disabled={isEditing}
            className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900/60 disabled:opacity-40 border border-red-800 text-red-400 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <Trash2 size={14} />
            <span>Eliminar 🗑️</span>
          </button>

          <div className="h-5 w-px bg-zinc-800 mx-1" />

          {/* GUARDAR */}
          <button
            type="button"
            onClick={handleSavePurchase}
            disabled={!isEditing}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-emerald-600 hover:text-white disabled:opacity-30 border border-zinc-700 text-zinc-300 font-bold px-3.5 py-1.5 rounded-xl transition-all"
          >
            <Save size={14} />
            <span>Guardar 💾</span>
          </button>

          {/* CANCELAR */}
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={!isEditing}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 border border-zinc-700 text-zinc-300 font-bold px-3 py-1.5 rounded-xl transition-all"
          >
            <X size={14} />
            <span>Cancelar ❌</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.print()}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl border border-zinc-700"
            title="Imprimir Comprobante de Compra"
          >
            <Printer size={15} />
          </button>

        </div>
      </div>

      {/* ---------------- 3. SECONDARY FORM TABS ---------------- */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-1.5 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setSubModule('compras')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
            subModule === 'compras'
              ? 'bg-[#00ff41] text-black font-display font-black shadow-[0_0_12px_rgba(0,255,65,0.2)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <FileText size={14} />
          <span>Compras</span>
        </button>

        <button
          type="button"
          onClick={() => setSubModule('formas_pago')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
            subModule === 'formas_pago'
              ? 'bg-[#00ff41] text-black font-display font-black shadow-[0_0_12px_rgba(0,255,65,0.2)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <DollarSign size={14} />
          <span>Formas de Pago</span>
        </button>

        <button
          type="button"
          onClick={() => setSubModule('resumen')}
          className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all ${
            subModule === 'resumen'
              ? 'bg-[#00ff41] text-black font-display font-black shadow-[0_0_12px_rgba(0,255,65,0.2)]'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <Layers size={14} />
          <span>Resumen de Compras</span>
        </button>
      </div>

      {/* ---------------- 4. MAIN FORM: COMPRAS TAB ---------------- */}
      {subModule === 'compras' && (
        <div className="space-y-3">
          {/* HEADER FORM FIELDS */}
          <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4 shadow-xl space-y-3">
            
            {/* ROW 1: PROVEEDOR & DOCUMENT TYPE */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              
              {/* PROVEEDOR SEARCH & NAME (7 cols) */}
              <div className="lg:col-span-7 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-400 text-[11px] font-bold flex items-center gap-1">
                    <span>Proveedor:</span>
                    <span className="text-[#00ff41] font-mono">*</span>
                  </label>
                  {isEditing && (
                    <button
                      type="button"
                      onClick={() => handleLookupSupplierRuc(formData.supplierRuc || '')}
                      disabled={isSearchingSupplier || !formData.supplierRuc || formData.supplierRuc.length < 10}
                      className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-all cursor-pointer disabled:opacity-40"
                    >
                      {isSearchingSupplier ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      <span>Consultar datos</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative w-44 shrink-0">
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.supplierRuc}
                      onChange={(e) => {
                        const val = e.target.value;
                        lookupRequestRef.current += 1;
                        setFormData({ ...formData, supplierRuc: val });
                      }}
                      onBlur={() => handleLookupSupplierRuc(formData.supplierRuc || '')}
                      placeholder="RUC / Cédula"
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-xs focus:border-[#00ff41] outline-none disabled:opacity-75 pr-7"
                    />
                    {isEditing && (
                      <button
                        type="button"
                        onClick={() => setShowSupplierModal(true)}
                        className="absolute right-1.5 top-1.5 text-zinc-400 hover:text-[#00ff41]"
                        title="Buscar Proveedor"
                      >
                        <Search size={14} />
                      </button>
                    )}
                  </div>

                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.supplierName}
                    onChange={(e) => setFormData({ ...formData, supplierName: e.target.value })}
                    placeholder="Razón Social Proveedor"
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3.5 py-1.5 text-white font-bold text-xs focus:border-[#00ff41] outline-none disabled:opacity-75 uppercase"
                  />
                </div>
                {supplierNotice && (
                  <p className="text-[10px] font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                    {supplierNotice}
                  </p>
                )}
              </div>

              {/* SECUENCIA & DOCUMENTO (5 cols) */}
              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Secuencia:</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      maxLength={3}
                      disabled={!isEditing}
                      value={formData.estab}
                      onChange={(e) => setFormData({ ...formData, estab: e.target.value })}
                      className="w-12 bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2 py-1.5 text-center font-mono font-bold text-white text-xs outline-none focus:border-[#00ff41]"
                    />
                    <span className="text-zinc-600 font-bold">-</span>
                    <input
                      type="text"
                      maxLength={3}
                      disabled={!isEditing}
                      value={formData.ptoEmi}
                      onChange={(e) => setFormData({ ...formData, ptoEmi: e.target.value })}
                      className="w-12 bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2 py-1.5 text-center font-mono font-bold text-white text-xs outline-none focus:border-[#00ff41]"
                    />
                    <span className="text-zinc-600 font-bold">-</span>
                    <input
                      type="text"
                      disabled={!isEditing}
                      value={formData.secuencial}
                      onChange={(e) => setFormData({ ...formData, secuencial: e.target.value })}
                      className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2 py-1.5 text-left font-mono font-bold text-[#00ff41] text-xs outline-none focus:border-[#00ff41]"
                    />
                    <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] text-zinc-300 ml-1">
                      <input
                        type="checkbox"
                        disabled={!isEditing}
                        checked={formData.ats}
                        onChange={(e) => setFormData({ ...formData, ats: e.target.checked })}
                        className="rounded accent-[#00ff41]"
                      />
                      <span>ATS</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Documento:</label>
                  <select
                    disabled={!isEditing}
                    value={formData.docType}
                    onChange={(e) => setFormData({ ...formData, docType: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2.5 py-1.5 text-white font-bold text-xs outline-none focus:border-[#00ff41] disabled:opacity-75"
                  >
                    <option value="01 Factura">01 Factura</option>
                    <option value="02 Nota De Venta">02 Nota De Venta</option>
                    <option value="03 Liquidación de Compra">03 Liquidación de Compra</option>
                    <option value="04 Nota de Crédito">04 Nota de Crédito</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ROW 2: DATES, CONCEPTO & WAREHOUSE */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              
              {/* EMISIÓN & REGISTRO (3 cols) */}
              <div className="md:col-span-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Emisión:</label>
                  <input
                    type="date"
                    disabled={!isEditing}
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2 py-1 text-white font-mono text-xs focus:border-[#00ff41] outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-400 text-[11px] font-bold block mb-1">Fecha Registro:</label>
                  <input
                    type="date"
                    disabled={!isEditing}
                    value={formData.registerDate}
                    onChange={(e) => setFormData({ ...formData, registerDate: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-2 py-1 text-white font-mono text-xs focus:border-[#00ff41] outline-none"
                  />
                </div>
              </div>

              {/* CONCEPTO (6 cols) */}
              <div className="md:col-span-6">
                <label className="text-zinc-400 text-[11px] font-bold block mb-1">Concepto:</label>
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.concept}
                  onChange={(e) => setFormData({ ...formData, concept: e.target.value })}
                  placeholder="Descripción de la compra..."
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-white text-xs focus:border-[#00ff41] outline-none uppercase"
                />
              </div>

              {/* ALMACÉN (3 cols) */}
              <div className="md:col-span-3">
                <label className="text-zinc-400 text-[11px] font-bold block mb-1">Almacén / Bodega:</label>
                <select
                  disabled={!isEditing}
                  value={formData.warehouse}
                  onChange={(e) => setFormData({ ...formData, warehouse: e.target.value })}
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-1.5 text-[#00ff41] font-mono font-bold text-xs outline-none focus:border-[#00ff41]"
                >
                  <option value="BODEGA_CAMPOZANO">BODEGA_CAMPOZANO</option>
                  <option value="BODEGA_PRINCIPAL">BODEGA_PRINCIPAL</option>
                  <option value="BODEGA_NORTE">BODEGA_NORTE</option>
                </select>
              </div>
            </div>
          </div>

          {/* QUICK BUTTONS OVER GRID */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 bg-[#121217] border border-zinc-800 rounded-2xl">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => alert('Abriendo Ficha Técnica del Producto seleccionado')}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 rounded-xl text-xs font-bold"
              >
                📝 Abrir Ficha de Productos
              </button>

              <button
                type="button"
                onClick={() => alert('Abriendo Kárdex del Producto')}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 rounded-xl text-xs font-bold"
              >
                📊 Abrir Kárdex
              </button>

              <button
                type="button"
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-xl text-xs font-bold"
              >
                ICE
              </button>

              <button
                type="button"
                onClick={() => alert('Cargando Compras Electrónicas desde archivo XML o RUC del SRI')}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-xl text-xs shadow-[0_0_10px_rgba(245,158,11,0.25)]"
              >
                ⚡ Compras Electrónicas
              </button>

              <span className="text-zinc-600 text-xs px-1">|</span>

              <button type="button" className="px-2.5 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-xs">
                Variantes
              </button>
              <button type="button" className="px-2.5 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-xs">
                Lotes
              </button>
              <button type="button" className="px-2.5 py-1 bg-zinc-800 text-zinc-400 rounded-lg text-xs">
                Series
              </button>
            </div>

            <div className="flex items-center gap-2">
              {isEditing && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="px-3 py-1.5 bg-[#00ff41] hover:bg-[#00e038] text-black font-black rounded-xl text-xs transition-all"
                >
                  ➕ Agregar Renglón
                </button>
              )}

              <button
                type="button"
                onClick={() => handleRemoveLine(activeGridRowIndex)}
                disabled={!isEditing}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-red-900/60 hover:text-red-300 text-zinc-300 rounded-xl text-xs font-bold disabled:opacity-40"
              >
                Quitar ✖
              </button>
            </div>
          </div>

          {/* MAIN GRID AND TOTALS SIDE BY SIDE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
            
            {/* ITEMS GRID (9 cols) */}
            <div className="lg:col-span-9 bg-[#121217] border border-zinc-800 rounded-2xl p-3 shadow-xl space-y-2">
              
              {/* GRID TABS */}
              <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
                <button
                  type="button"
                  className="px-3 py-1 bg-[#181820] text-[#00ff41] border border-[#00ff41]/40 rounded-lg font-bold text-xs"
                >
                  Detalle Documento
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-zinc-400 hover:text-white text-xs"
                >
                  Información Adicional
                </button>
              </div>

              {/* GRID TABLE */}
              <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-[#0a0a0d] min-h-[220px]">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px] border-b border-zinc-800 sticky top-0">
                    <tr>
                      <th className="p-2 w-28">Código 🔍</th>
                      <th className="p-2">Producto</th>
                      <th className="p-2 w-24">Medida 🔄</th>
                      <th className="p-2 text-right w-20">Cant</th>
                      <th className="p-2 text-right w-20">Dscto</th>
                      <th className="p-2 text-right w-24">Costo</th>
                      <th className="p-2 text-right w-24">C.Neto</th>
                      <th className="p-2 text-right w-16">IVA</th>
                      <th className="p-2 text-right w-28">Total</th>
                      <th className="p-2 w-36">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 text-[11px]">
                    {formData.items.map((item, idx) => (
                      <tr
                        key={item.id}
                        onClick={() => setActiveGridRowIndex(idx)}
                        className={`cursor-pointer transition-colors ${
                          activeGridRowIndex === idx ? 'bg-amber-500/10 border-l-2 border-amber-400 font-bold' : 'hover:bg-zinc-800/40'
                        }`}
                      >
                        {/* CÓDIGO WITH SEARCH BUTTON */}
                        <td className="p-1.5">
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              disabled={!isEditing}
                              value={item.code}
                              onChange={(e) => handleItemLineChange(idx, 'code', e.target.value)}
                              className="w-full bg-[#121217] border border-zinc-800 rounded px-1.5 py-1 text-amber-400 font-mono font-bold text-xs outline-none focus:border-[#00ff41]"
                            />
                            {isEditing && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLineIndex(idx);
                                  setShowProductPickerModal(true);
                                }}
                                className="p-1 bg-zinc-800 hover:bg-[#00ff41] hover:text-black text-zinc-300 rounded"
                                title="Seleccionar Producto del Catálogo"
                              >
                                <Search size={12} />
                              </button>
                            )}
                          </div>
                        </td>

                        {/* PRODUCTO NOMBRE */}
                        <td className="p-1.5 font-sans font-bold text-white">
                          <input
                            type="text"
                            disabled={!isEditing}
                            value={item.name}
                            onChange={(e) => handleItemLineChange(idx, 'name', e.target.value)}
                            className="w-full bg-[#121217] border border-zinc-800 rounded px-2 py-1 text-white text-xs outline-none uppercase focus:border-[#00ff41]"
                          />
                        </td>

                        {/* MEDIDA */}
                        <td className="p-1.5">
                          <select
                            disabled={!isEditing}
                            value={item.unit}
                            onChange={(e) => handleItemLineChange(idx, 'unit', e.target.value)}
                            className="w-full bg-[#121217] border border-zinc-800 rounded px-1 py-1 text-zinc-200 text-xs outline-none"
                          >
                            <option value="Unidad">Unidad</option>
                            <option value="Caja">Caja</option>
                            <option value="Saco">Saco</option>
                            <option value="Fardo">Fardo</option>
                            <option value="Kilogramo">Kilogramo</option>
                          </select>
                        </td>

                        {/* CANTIDAD */}
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            step="0.001"
                            disabled={!isEditing}
                            value={item.quantity}
                            onChange={(e) => handleItemLineChange(idx, 'quantity', e.target.value)}
                            className="w-16 bg-[#121217] border border-zinc-800 rounded px-1 py-1 text-right font-bold text-white outline-none focus:border-[#00ff41]"
                          />
                        </td>

                        {/* DESCUENTO */}
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            step="0.0001"
                            disabled={!isEditing}
                            value={item.discount}
                            onChange={(e) => handleItemLineChange(idx, 'discount', e.target.value)}
                            className="w-16 bg-[#121217] border border-zinc-800 rounded px-1 py-1 text-right text-zinc-300 outline-none focus:border-[#00ff41]"
                          />
                        </td>

                        {/* COSTO UNITARIO */}
                        <td className="p-1.5 text-right">
                          <input
                            type="number"
                            step="0.000001"
                            disabled={!isEditing}
                            value={item.unitCost}
                            onChange={(e) => handleItemLineChange(idx, 'unitCost', e.target.value)}
                            className="w-20 bg-[#121217] border border-zinc-800 rounded px-1 py-1 text-right font-bold text-[#00ff41] outline-none focus:border-[#00ff41]"
                          />
                        </td>

                        {/* COSTO NETO */}
                        <td className="p-1.5 text-right text-zinc-200 font-bold">
                          ${item.netCost.toFixed(6)}
                        </td>

                        {/* IVA */}
                        <td className="p-1.5 text-right">
                          <select
                            disabled={!isEditing}
                            value={item.ivaRate}
                            onChange={(e) => handleItemLineChange(idx, 'ivaRate', e.target.value)}
                            className="bg-[#121217] border border-zinc-800 rounded px-1 py-1 text-zinc-300 text-[10px] outline-none"
                          >
                            <option value="0%">0%</option>
                            <option value="15%">15%</option>
                            <option value="5%">5%</option>
                            <option value="NO_OBJETO">N/O</option>
                            <option value="EXENTO">Exento</option>
                          </select>
                        </td>

                        {/* TOTAL RENGLÓN */}
                        <td className="p-1.5 text-right text-amber-400 font-bold">
                          ${item.total.toFixed(4)}
                        </td>

                        {/* ALMACÉN */}
                        <td className="p-1.5 text-zinc-400 text-[10px]">
                          {item.warehouse}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* GRID FOOTER SUM ROW */}
              <div className="flex justify-between items-center bg-[#181820] border border-zinc-800 rounded-xl px-4 py-2 text-xs font-mono font-bold">
                <span className="text-zinc-400">Sum Total:</span>
                <span className="text-[#00ff41] text-sm">${formData.total.toFixed(4)}</span>
              </div>
            </div>

            {/* RIGHT SIDE TOTALS SUMMARY PANEL (3 cols) */}
            <div className="lg:col-span-3 bg-[#0a0a0d] border border-zinc-800 rounded-2xl p-3.5 space-y-1.5 font-mono text-[11px] shadow-xl">
              <div className="text-zinc-400 font-sans font-bold text-xs border-b border-zinc-800 pb-1.5 mb-2">
                Resumen de Totales ($)
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Subtotal:</span>
                <span className="text-white font-bold">{formData.subtotal.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Descuento:</span>
                <span className="text-zinc-300">{formData.discountTotal.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center border-t border-zinc-800/60 pt-1">
                <span className="text-zinc-400">Subtotal - Dscto:</span>
                <span className="text-white font-bold">{(formData.subtotal - formData.discountTotal).toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-300">
                <span>Base 0%:</span>
                <span>{formData.base0.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-300">
                <span>Base dif. 0%:</span>
                <span>{formData.base15.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-300">
                <span>Base 5%:</span>
                <span>{formData.base5.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span>Base No Obj. IVA:</span>
                <span>{formData.baseNoObj.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span>Base Exento IVA:</span>
                <span>{formData.baseExento.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center border-t border-zinc-800/60 pt-1 text-emerald-400">
                <span>Total IVA:</span>
                <span>{formData.totalIva.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span>Total IVA 5%:</span>
                <span>0,0000</span>
              </div>

              <div className="flex justify-between items-center text-zinc-400">
                <span>Total ICE:</span>
                <span>0,0000</span>
              </div>

              <div className="flex justify-between items-center border-t-2 border-zinc-700 pt-1.5 my-1 text-sm text-[#00ff41] font-black">
                <span className="font-sans">Total:</span>
                <span>${formData.total.toFixed(4)}</span>
              </div>

              <div className="flex justify-between items-center text-[10px] text-zinc-500">
                <span>IVA Presuntivo:</span>
                <span>0,0000</span>
              </div>

              <div className="flex justify-between items-center text-[10px] text-zinc-500">
                <span>Renta P / IRBP:</span>
                <span>0,0000</span>
              </div>
            </div>
          </div>

          {/* ---------------- 5. BOTTOM FOOTER PANEL ---------------- */}
          <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-3 shadow-xl space-y-2">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              
              {/* MODIFIED DOC FIELDS (6 cols) */}
              <div className="lg:col-span-6 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-500 text-[10px] block">Documento Modificado:</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.docModified || ''}
                    onChange={(e) => setFormData({ ...formData, docModified: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 text-[10px] block">Emisión:</label>
                  <input
                    type="date"
                    disabled={!isEditing}
                    value={formData.docModifiedIssue || ''}
                    onChange={(e) => setFormData({ ...formData, docModifiedIssue: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="text-zinc-500 text-[10px] block">Autorización Doc. Modif:</label>
                  <input
                    type="text"
                    disabled={!isEditing}
                    value={formData.docModifiedAuth || ''}
                    onChange={(e) => setFormData({ ...formData, docModifiedAuth: e.target.value })}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-lg px-2 py-1 text-white text-xs outline-none font-mono"
                  />
                </div>
              </div>

              {/* TOTAL ITEMS & CANTIDAD (3 cols) */}
              <div className="lg:col-span-3 flex items-center justify-around bg-[#0a0a0d] border border-zinc-800 rounded-xl p-2 font-mono">
                <div>
                  <div className="text-[10px] text-zinc-500">Total Ítems:</div>
                  <div className="text-xs font-bold text-white">{formData.items.length.toFixed(2)}</div>
                </div>
                <div className="h-6 w-px bg-zinc-800" />
                <div>
                  <div className="text-[10px] text-zinc-500">Total Cantidad:</div>
                  <div className="text-xs font-bold text-[#00ff41]">{totalQuantitySum.toFixed(2)}</div>
                </div>
              </div>

              {/* ACTUALIZAR PRECIOS DE VENTA BUTTON (3 cols) */}
              <div className="lg:col-span-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleUpdateSalesPrices}
                  className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                >
                  <RefreshCw size={14} />
                  <span>Actualizar Precios de Venta</span>
                </button>
              </div>
            </div>

            {/* AUDIT ROW */}
            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between text-[10px] text-zinc-500 font-mono">
              <div>
                Creación : <span className="text-zinc-300 font-bold">{formData.createdUser}</span> {formData.createdDate}
              </div>
              <div>
                Servidor: <span className="text-zinc-500">SIN SINCRONIZAR</span> | Usuario: <span className="text-zinc-500">SIN SINCRONIZAR</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- 6. LISTADO COMPRAS TAB ---------------- */}
      {subModule === 'listado' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-base text-white flex items-center gap-2">
              <ListFilter size={18} className="text-[#00ff41]" />
              <span>Listado de Facturas e Ingresos de Compra</span>
            </h3>

            <button
              type="button"
              onClick={handleNewPurchase}
              className="bg-[#00ff41] hover:bg-[#00e038] text-black font-black px-3.5 py-1.5 rounded-xl text-xs"
            >
              + Nueva Compra
            </button>
          </div>

          <div className="overflow-x-auto border border-zinc-800 rounded-xl">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                <tr>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Secuencia Comprobante</th>
                  <th className="p-3">Proveedor</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-right">IVA</th>
                  <th className="p-3 text-right">Total</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {purchasesList.length > 0 ? (
                  purchasesList.map((p, i) => (
                    <tr key={i} className="hover:bg-zinc-800/40">
                      <td className="p-3 text-zinc-400">{p.date || ''}</td>
                      <td className="p-3 font-bold text-white">{p.invoiceNumber || 'SIN NÚMERO'}</td>
                      <td className="p-3 font-sans font-bold text-zinc-200">{p.supplierName}</td>
                      <td className="p-3 text-right">${(p.subtotal || 0).toFixed(2)}</td>
                      <td className="p-3 text-right">${(p.iva || 0.0).toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-[#00ff41]">${(p.total || 0).toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSubModule('compras');
                            setIsEditing(false);
                          }}
                          className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold rounded-lg text-[10px]"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-zinc-500">Sin compras sincronizadas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* FORMAS DE PAGO TAB */}
      {subModule === 'formas_pago' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white">Formas de Pago de la Compra</h3>
          <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 font-bold">01 - SIN UTILIZACION DEL SISTEMA FINANCIERO (Efectivo)</span>
              <span className="text-[#00ff41] font-mono font-bold">${formData.total.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-zinc-500 text-xs">
              <span>Plazo / Tiempo: 0 días</span>
              <span>Total Liquidado</span>
            </div>
          </div>
        </div>
      )}

      {/* RESUMEN TAB */}
      {subModule === 'resumen' && (
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-sm text-white">Resumen Contable y Tributario</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0a0a0d] p-4 border border-zinc-800 rounded-xl space-y-1">
              <span className="text-zinc-400 text-xs font-bold block">Base Imponible Cero (0%)</span>
              <span className="text-xl font-mono font-bold text-white">${formData.base0.toFixed(2)}</span>
            </div>
            <div className="bg-[#0a0a0d] p-4 border border-zinc-800 rounded-xl space-y-1">
              <span className="text-zinc-400 text-xs font-bold block">Base Imponible Grabada (15%)</span>
              <span className="text-xl font-mono font-bold text-white">${formData.base15.toFixed(2)}</span>
            </div>
            <div className="bg-[#0a0a0d] p-4 border border-zinc-800 rounded-xl space-y-1">
              <span className="text-zinc-400 text-xs font-bold block">Monto IVA Generado</span>
              <span className="text-xl font-mono font-bold text-[#00ff41]">${formData.totalIva.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: PRODUCT PICKER ---------------- */}
      {showProductPickerModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121217] border border-zinc-800 rounded-2xl w-full max-w-2xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package size={18} className="text-[#00ff41]" />
                <span>Seleccionar Producto del Catálogo</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowProductPickerModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                autoFocus
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                placeholder="Buscar por código, nombre o categoría..."
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs outline-none focus:border-[#00ff41]"
              />
            </div>

            <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Código</th>
                    <th className="p-2.5">Nombre Producto</th>
                    <th className="p-2.5 text-right">Costo Compra</th>
                    <th className="p-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                  {filteredProductsModal.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-800/50">
                      <td className="p-2.5 font-bold text-amber-400">{p.code || 'COD'}</td>
                      <td className="p-2.5 font-sans font-bold text-white">{p.name}</td>
                      <td className="p-2.5 text-right font-bold text-[#00ff41]">
                        ${(p.purchaseCost || p.currentCost || p.price || 1.0).toFixed(2)}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSelectProductForLine(p)}
                          className="px-3 py-1 bg-[#00ff41] hover:bg-[#00e038] text-black font-bold rounded-lg text-[10px]"
                        >
                          Seleccionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- MODAL: SUPPLIER PICKER ---------------- */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121217] border border-zinc-800 rounded-2xl w-full max-w-xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck size={18} className="text-[#00ff41]" />
                <span>Seleccionar Proveedor</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSupplierModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto border border-zinc-800 rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">RUC / Cédula</th>
                    <th className="p-2.5">Razón Social</th>
                    <th className="p-2.5 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-200">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-800/50">
                      <td className="p-2.5 font-bold text-[#00ff41]">{s.ruc}</td>
                      <td className="p-2.5 font-sans font-bold text-white">{s.name}</td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleSelectSupplier(s)}
                          className="px-3 py-1 bg-[#00ff41] hover:bg-[#00e038] text-black font-bold rounded-lg text-[10px]"
                        >
                          Elegir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
