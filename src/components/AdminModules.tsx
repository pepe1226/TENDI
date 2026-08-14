import React, { useEffect, useState } from 'react';
import { 
  Receipt, 
  Package, 
  Truck, 
  Wallet, 
  LayoutDashboard, 
  Settings, 
  Search, 
  Plus, 
  FileText, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  DollarSign, 
  TrendingUp, 
  Users, 
  Key, 
  Building2, 
  ShieldCheck, 
  Edit3, 
  Trash2,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Printer,
  Eye,
  AlertTriangle,
  Smartphone,
  HelpCircle,
  Award,
  Cpu,
  Store,
  Layers,
  Save
} from 'lucide-react';
import { AdminTab, Company, Supplier, SystemUser, PurchaseRecord } from '../types';
import { GestionProductos } from './GestionProductos';
import { GestionCompras } from './GestionCompras';
import { GestionClientes } from './GestionClientes';
import { GestionEmpresas } from './GestionEmpresas';
import { GestionUsuarios } from './GestionUsuarios';
import { GestionMatrizPermisos } from './GestionMatrizPermisos';
import { GestionAprobacionesAudit } from './GestionAprobacionesAudit';
import { GestionInventario } from './GestionInventario';
import { GestionEstablecimientos } from '../../untitled';

interface AdminModulesProps {
  activeTab: AdminTab;
  activeSubAction?: string;
  onSelectSubAction?: (subId: string) => void;
  company: Company;
  companies: Company[];
  users: SystemUser[];
  currentUser?: SystemUser;
  inventorySession?: string;
  canAccessAction?: (actionId: string) => boolean;
  onSaveUser: (user: SystemUser) => void;
  onDeleteUser: (id: string) => void;
  onSaveCompany?: (company: any) => void;
  onDeleteCompany?: (id: string) => void;
  onSelectCompany?: (company: Company) => void;
  salesHistory: any[];
  products: any[];
  categories: any[];
  onSaveProduct?: (product: any) => void;
  onDeleteProduct?: (id: number) => void;
  onRefreshSales?: () => void;
}

export const AdminModules: React.FC<AdminModulesProps> = ({
  activeTab,
  activeSubAction,
  onSelectSubAction,
  company,
  companies,
  users,
  currentUser,
  inventorySession = '',
  canAccessAction = (_actionId: string) => true,
  onSaveUser,
  onDeleteUser,
  onSaveCompany,
  onDeleteCompany,
  onSelectCompany,
  salesHistory,
  products,
  categories,
  onSaveProduct,
  onDeleteProduct,
  onRefreshSales
}) => {
  // Search & Filter state for Ventas
  const [salesSearch, setSalesSearch] = useState('');
  const [salesStatusFilter, setSalesStatusFilter] = useState('TODOS');

  // Product management modal
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  // Form states for new/edit product
  const [prodCode, setProdCode] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodPrice, setProdPrice] = useState('');
  const [prodCost, setProdCost] = useState('');
  const [prodStock, setProdStock] = useState('');

  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Purchases state
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);

  // Clients state
  const [clientsList, setClientsList] = useState<any[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [newClientRuc, setNewClientRuc] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');

  // Proformas state
  const [proformasHistory, setProformasHistory] = useState<any[]>([]);

  // Pedidos state
  const [pedidosList, setPedidosList] = useState<any[]>([]);

  // Agentes state
  const [agentsList, setAgentsList] = useState<any[]>([]);

  // SRI Sequences state
  const [sriSequences, setSriSequences] = useState<any[]>([]);

  // Categories & Lines
  const [categoriesList, setCategoriesList] = useState<any[]>([]);

  // Kardex Log Movements
  const [kardexLogs, setKardexLogs] = useState<any[]>([]);

  // Retentions SRI
  const [retentionsList, setRetentionsList] = useState<any[]>([]);

  // Accounts Receivable (Cartera)
  const [receivables, setReceivables] = useState<any[]>([]);

  // Accounts Payable (Pagos Proveedores)
  const [payables, setPayables] = useState<any[]>([]);

  // Employees & Payroll
  const [employeesList, setEmployeesList] = useState<any[]>([]);

  // Chart of Accounts (Plan de Cuentas NIIF)
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);

  // System Audit Logs
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Company-scoped administration settings
  const [establishments, setEstablishments] = useState<any[]>([]);
  const [sriConfig, setSriConfig] = useState({ provider: 'TENDI_NATIVE', timeout: 30, environment: company.environment, enabled: false });
  const [sriNotice, setSriNotice] = useState<string>('');
  const [signatureFile, setSignatureFile] = useState<{ name: string; size: number; lastModified: number } | null>(null);
  const [signaturePassword, setSignaturePassword] = useState('');
  const [signatureNotice, setSignatureNotice] = useState<string>('');

  useEffect(() => {
    const defaults = [
      { id: `${company.id}-001`, code: '001', name: 'Matriz', address: company.address || '', active: true, points: [{ code: '001', name: 'Caja Principal', active: true }] },
      { id: `${company.id}-002`, code: '002', name: 'Sucursal', address: '', active: true, points: [{ code: '001', name: 'Mostrador Principal', active: true }] }
    ];
    try {
      const savedEstablishments = localStorage.getItem(`tendi_establishments_${company.id}`);
      const savedSri = localStorage.getItem(`tendi_sri_config_${company.id}`);
      const savedSignature = localStorage.getItem(`tendi_signature_${company.id}`);
      setEstablishments(savedEstablishments ? JSON.parse(savedEstablishments) : defaults);
      setSriConfig(savedSri ? { ...sriConfig, ...JSON.parse(savedSri), environment: company.environment } : { provider: 'TENDI_NATIVE', timeout: 30, environment: company.environment, enabled: false });
      setSignatureFile(savedSignature ? JSON.parse(savedSignature) : null);
    } catch {
      setEstablishments(defaults);
      setSriConfig({ provider: 'TENDI_NATIVE', timeout: 30, environment: company.environment, enabled: false });
      setSignatureFile(null);
    }
    setSignaturePassword('');
    setSignatureNotice('');
    setSriNotice('');
  }, [company.id, company.environment]);

  const persistEstablishments = (next: any[]) => {
    setEstablishments(next);
    localStorage.setItem(`tendi_establishments_${company.id}`, JSON.stringify(next));
  };

  const handleNewEmissionPoint = () => {
    if (establishments.length === 0) return;
    const establishment = establishments[0];
    const code = window.prompt('Código del nuevo punto de emisión (3 dígitos):', String(establishment.points.length + 1).padStart(3, '0'))?.trim();
    if (!code) return;
    const name = window.prompt('Nombre del punto de emisión:', 'Nuevo punto')?.trim();
    if (!name) return;
    if (establishment.points.some((point: any) => point.code === code)) {
      alert('Ese punto de emisión ya existe en el establecimiento seleccionado.');
      return;
    }
    persistEstablishments(establishments.map(item => item.id === establishment.id
      ? { ...item, points: [...item.points, { code, name, active: true }] }
      : item));
  };

  const handleSignatureFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.p12') && !lowerName.endsWith('.pfx')) {
      setSignatureNotice('Seleccione un archivo .P12 o .PFX.');
      return;
    }
    setSignatureFile({ name: file.name, size: file.size, lastModified: file.lastModified });
    setSignatureNotice('Archivo seleccionado. Guarde la configuración para registrar sus metadatos.');
  };

  const saveSignatureConfig = () => {
    if (!signatureFile) {
      setSignatureNotice('Debe seleccionar el archivo de firma.');
      return;
    }
    if (!signaturePassword) {
      setSignatureNotice('Debe ingresar la contraseña de la firma.');
      return;
    }
    localStorage.setItem(`tendi_signature_${company.id}`, JSON.stringify(signatureFile));
    setSignaturePassword('');
    setSignatureNotice('Metadatos guardados. La contraseña no se almacena en el navegador.');
  };

  const saveSriConfig = () => {
    const normalized = { ...sriConfig, timeout: Math.max(5, Number(sriConfig.timeout) || 30), environment: company.environment };
    setSriConfig(normalized);
    localStorage.setItem(`tendi_sri_config_${company.id}`, JSON.stringify(normalized));
    setSriNotice('Configuración SRI guardada para la empresa activa.');
  };

  const openNewProductModal = () => {
    setEditingProduct(null);
    setProdCode('PROD-' + Math.floor(1000 + Math.random() * 9000));
    setProdName('');
    setProdPrice('');
    setProdCost('');
    setProdStock('10');
    setIsProductModalOpen(true);
  };

  const openEditProductModal = (prod: any) => {
    setEditingProduct(prod);
    setProdCode(prod.code || '');
    setProdName(prod.name || '');
    setProdPrice(prod.price ? String(prod.price) : '');
    setProdCost(prod.cost ? String(prod.cost) : String((prod.price * 0.7).toFixed(2)));
    setProdStock(prod.stock !== undefined ? String(prod.stock) : '10');
    setIsProductModalOpen(true);
  };

  const handleSaveProductSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName || !prodPrice) return;

    const newProd = {
      id: editingProduct ? editingProduct.id : Date.now(),
      code: prodCode || 'PROD-' + Date.now(),
      name: prodName,
      price: parseFloat(prodPrice) || 0,
      cost: parseFloat(prodCost) || 0,
      stock: parseInt(prodStock, 10) || 0
    };

    if (onSaveProduct) {
      onSaveProduct(newProd);
    }
    setIsProductModalOpen(false);
  };

  // Filter sales history
  const filteredSales = salesHistory.filter(s => {
    const query = salesSearch.toLowerCase();
    const matchCustomer = (s.customer || '').toLowerCase().includes(query) || (s.ruc || '').includes(query) || (s.invoiceNumber || '').includes(query);
    const matchStatus = salesStatusFilter === 'TODOS' || (s.sriStatus || 'AUTORIZADO') === salesStatusFilter;
    return matchCustomer && matchStatus;
  });

  if (activeTab === 'administracion' && activeSubAction && !canAccessAction(activeSubAction)) {
    return (
      <main className="flex-1 overflow-auto bg-[#09090b] p-6">
        <div className="max-w-xl mx-auto mt-12 border border-red-900 bg-red-950/20 rounded-lg p-6 text-center">
          <Lock size={30} className="text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">Acceso no autorizado</h2>
          <p className="text-xs text-zinc-400 mt-2">Su usuario no tiene permiso para abrir esta función en la empresa activa.</p>
        </div>
      </main>
    );
  }

  return (
    <div className="flex-1 bg-[#0a0a0d] text-white p-6 overflow-y-auto custom-scrollbar">
      {/* ---------------- MATRIZ PERMISOS TAB ---------------- */}
      {activeTab === 'matriz_permisos' && (
        <div className="space-y-6">
            <GestionMatrizPermisos key="admin-matrix-main" companyId={company.id} companyName={company.tradeName || company.name} companyActive={company.active !== false} currentUser={currentUser} />
        </div>
      )}

      {/* ---------------- APROBACIONES AUDIT TAB ---------------- */}
      {activeTab === 'aprobaciones' && (
        <div className="space-y-6">
          <GestionAprobacionesAudit key="admin-approval-main" companyId={company.id} currentUser={currentUser} />
        </div>
      )}

      {/* ---------------- KARDEX STOCK TAB ---------------- */}
      {activeTab === 'kardex_stock' && (
        <div className="space-y-6">
          <GestionInventario key="inventory-kardex-main" companyId={company.id} sessionToken={inventorySession} activeSubAction={activeSubAction || 'kardex'} />
        </div>
      )}

      {/* ----------------1. VENTAS Y FACTURACIÓN ---------------- */}
      {activeTab === 'ventas' && (
        <div className="space-y-6">
          {activeSubAction === 'clientes' ? (
            <GestionClientes key="sales-customers-main"
              clientsList={clientsList as any}
              onSaveCustomer={(newCust) => {
                const exists = clientsList.find(c => c.id === newCust.id);
                if (exists) {
                  setClientsList(clientsList.map(c => c.id === newCust.id ? newCust : c));
                } else {
                  setClientsList([newCust, ...clientsList]);
                }
              }}
              onDeleteCustomer={(id) => {
                setClientsList(clientsList.filter(c => c.id !== id));
              }}
            />
          ) : activeSubAction === 'proformas' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <div>
                  <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                    <FileText className="text-[#00ff41]" />
                    <span>PROFORMAS Y COTIZACIONES</span>
                  </h2>
                  <p className="text-zinc-400 text-xs mt-1">
                    Emisión de proformas comerciales con cotización de productos y validez temporal
                  </p>
                </div>

                <button
                  onClick={() => alert("Registrar nueva proforma")}
                  className="flex items-center gap-2 bg-[#00ff41] hover:bg-[#00e038] text-black font-display font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                >
                  <Plus size={16} />
                  <span>NUEVA PROFORMA</span>
                </button>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">N° Proforma</th>
                      <th className="p-3.5">Fecha</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5 text-center">Validez</th>
                      <th className="p-3.5 text-right">Total</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {proformasHistory.map(p => (
                      <tr key={p.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-mono font-bold text-[#00ff41]">{p.number}</td>
                        <td className="p-3.5 font-mono text-zinc-400">{p.date}</td>
                        <td className="p-3.5 font-bold text-white">{p.customer}</td>
                        <td className="p-3.5 text-center font-mono text-zinc-300">{p.validDays} días</td>
                        <td className="p-3.5 text-right font-mono font-bold text-white">${p.total.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.status === 'VIGENTE' ? 'bg-amber-950/60 text-amber-400 border border-amber-800' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button 
                            onClick={() => alert(`Proforma ${p.number} convertida a Factura en POS`)}
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] font-bold"
                          >
                            Convertir a Factura
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSubAction === 'pedidos' ? (
            <div className="space-y-6">
              <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                  <Package className="text-[#00ff41]" />
                  <span>PEDIDOS DE CLIENTES</span>
                </h2>
                <p className="text-zinc-400 text-xs mt-1">
                  Órdenes de pedido generadas por agentes de venta pendientes de despacho
                </p>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">N° Pedido</th>
                      <th className="p-3.5">Fecha</th>
                      <th className="p-3.5">Cliente</th>
                      <th className="p-3.5">Vendedor</th>
                      <th className="p-3.5 text-right">Total</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {pedidosList.map(p => (
                      <tr key={p.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-mono font-bold text-[#00ff41]">{p.number}</td>
                        <td className="p-3.5 font-mono text-zinc-400">{p.date}</td>
                        <td className="p-3.5 font-bold text-white">{p.customer}</td>
                        <td className="p-3.5 text-zinc-300">{p.seller}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-white">${p.total.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className="bg-amber-950/60 text-amber-400 border border-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button 
                            onClick={() => alert(`Despachar Pedido ${p.number}`)}
                            className="px-2.5 py-1 bg-[#00ff41] hover:bg-[#00e038] text-black font-bold rounded-lg text-[10px]"
                          >
                            Despachar y Facturar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSubAction === 'secuencias' ? (
            <div className="space-y-6">
              <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                  <Settings className="text-[#00ff41]" />
                  <span>SECUENCIAS Y PUNTOS DE EMISIÓN SRI</span>
                </h2>
                <p className="text-zinc-400 text-xs mt-1">
                  Configuración de numeración de comprobantes para Establecimiento 001 y Punto 002
                </p>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">Tipo de Comprobante</th>
                      <th className="p-3.5 text-center">Establecimiento</th>
                      <th className="p-3.5 text-center">Punto Emisión</th>
                      <th className="p-3.5 text-center">Próximo Secuencial</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {sriSequences.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-bold text-white">{s.docType}</td>
                        <td className="p-3.5 text-center font-mono text-zinc-400">{s.establishment}</td>
                        <td className="p-3.5 text-center font-mono text-zinc-400">{s.emissionPoint}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-[#00ff41]">{s.currentSeq}</td>
                        <td className="p-3.5 text-center">
                          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            ACTIVO
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button 
                            onClick={() => alert(`Editar secuencia ${s.docType}`)}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg"
                          >
                            <Edit3 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSubAction === 'whatsapp' ? (
            <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
              <h2 className="text-xl font-display font-black text-white">INTEGRACIÓN WHATSAPP</h2>
              <p className="text-zinc-400 text-xs mt-3">Sin proveedor, número emisor ni credenciales configuradas.</p>
            </div>
          ) : (
            <>
              {/* Default Listado Ventas View */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <div>
                  <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                    <Receipt className="text-[#00ff41]" />
                    <span>VENTAS Y COMPROBANTES ELECTRÓNICOS</span>
                  </h2>
                  <p className="text-zinc-400 text-xs mt-1">
                    Consulta de Facturas emitidas, estado de autorización SRI, generación de RIDE en PDF y XMLs
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={onRefreshSales}
                    className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border border-zinc-700"
                  >
                    <RefreshCw size={14} />
                    <span>Actualizar</span>
                  </button>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-3 text-zinc-500" size={16} />
                  <input 
                    type="text" 
                    value={salesSearch}
                    onChange={(e) => setSalesSearch(e.target.value)}
                    placeholder="Buscar por N° Factura, RUC o Cliente..." 
                    className="w-full bg-[#121217] border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00ff41]"
                  />
                </div>

                <select
                  value={salesStatusFilter}
                  onChange={(e) => setSalesStatusFilter(e.target.value)}
                  className="bg-[#121217] border border-zinc-800 text-zinc-300 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-[#00ff41]"
                >
                  <option value="TODOS">Todos los Estados SRI</option>
                  <option value="AUTORIZADO">AUTORIZADO</option>
                  <option value="PENDIENTE">PENDIENTE DE ENVÍO</option>
                  <option value="RECHAZADO">RECHAZADO</option>
                </select>
              </div>

              {/* Table of Invoices */}
              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-zinc-300">
                    <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                      <tr>
                        <th className="p-3.5">N° Comprobante</th>
                        <th className="p-3.5">Fecha / Hora</th>
                        <th className="p-3.5">Cliente / RUC</th>
                        <th className="p-3.5 text-right">Total</th>
                        <th className="p-3.5 text-center">Estado SRI</th>
                        <th className="p-3.5 text-center">Clave de Acceso</th>
                        <th className="p-3.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-sans">
                      {filteredSales.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-zinc-500">
                            No se encontraron comprobantes de venta registrados.
                          </td>
                        </tr>
                      ) : (
                        filteredSales.map((sale, i) => (
                          <tr key={sale.id || i} className="hover:bg-zinc-800/40 transition-colors">
                            <td className="p-3.5 font-mono font-bold text-[#00ff41]">
                              {sale.invoiceNumber || 'SIN NÚMERO'}
                            </td>
                            <td className="p-3.5 text-zinc-400 font-mono text-[11px]">
                              {sale.timestamp ? new Date(sale.timestamp).toLocaleString('es-EC') : 'Reciente'}
                            </td>
                            <td className="p-3.5 font-medium">
                              <div className="text-white font-bold">{sale.customer || 'CONSUMIDOR FINAL'}</div>
                              <div className="text-zinc-500 font-mono text-[10px]">{sale.ruc || '9999999999999'}</div>
                            </td>
                            <td className="p-3.5 text-right font-mono font-bold text-white text-sm">
                              ${(sale.total || 0).toFixed(2)}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className="inline-flex items-center gap-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 px-2.5 py-1 rounded-full text-[10px] font-bold">
                                <CheckCircle2 size={12} />
                                <span>AUTORIZADO</span>
                              </span>
                            </td>
                            <td className="p-3.5 text-center font-mono text-[10px] text-zinc-500 max-w-[140px] truncate" title={sale.accessKey || ''}>
                              {sale.accessKey || 'SIN CLAVE'}
                            </td>
                            <td className="p-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => alert(`RIDE Generado para la Factura ${sale.invoiceNumber || '001-002'}`)}
                                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[10px] font-mono flex items-center gap-1 border border-zinc-700"
                                  title="Descargar RIDE PDF"
                                >
                                  <FileText size={13} className="text-red-400" />
                                  <span>RIDE</span>
                                </button>
                                <button 
                                  onClick={() => alert(`XML Autorizado recuperado del SRI`)}
                                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[10px] font-mono flex items-center gap-1 border border-zinc-700"
                                  title="Descargar XML"
                                >
                                  <Download size={13} className="text-emerald-400" />
                                  <span>XML</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ----------------2. INVENTARIO ---------------- */}
      {activeTab === 'inventario' && (
        <div className="space-y-6">
          {activeSubAction === 'categorias' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <div>
                  <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                    <Package className="text-[#00ff41]" />
                    <span>CATEGORÍAS DE PRODUCTO</span>
                  </h2>
                  <p className="text-zinc-400 text-xs mt-1">
                    Agrupación comercial y familias de productos para reportes e inventario
                  </p>
                </div>

                <button
                  onClick={() => {
                    const name = prompt("Nombre de la nueva categoría:");
                    if (name) {
                      setCategoriesList([...categoriesList, { id: String(Date.now()), code: 'CAT-0' + (categoriesList.length + 1), name: name.toUpperCase(), itemsCount: 0, status: 'ACTIVO' }]);
                    }
                  }}
                  className="flex items-center gap-2 bg-[#00ff41] hover:bg-[#00e038] text-black font-display font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                >
                  <Plus size={16} />
                  <span>NUEVA CATEGORÍA</span>
                </button>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">Código</th>
                      <th className="p-3.5">Categoría</th>
                      <th className="p-3.5 text-center">Productos Asociados</th>
                      <th className="p-3.5 text-center">Estado</th>
                      <th className="p-3.5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {categoriesList.map(cat => (
                      <tr key={cat.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-mono font-bold text-[#00ff41]">{cat.code}</td>
                        <td className="p-3.5 font-bold text-white">{cat.name}</td>
                        <td className="p-3.5 text-center font-mono font-bold text-white">{cat.itemsCount} ítems</td>
                        <td className="p-3.5 text-center">
                          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            {cat.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button 
                            onClick={() => alert(`Editar categoría ${cat.name}`)}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg"
                          >
                            <Edit3 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : ['entradas', 'salidas', 'kardex', 'ajuste_fisico', 'stock_minimo'].includes(activeSubAction || '') ? (
            <GestionInventario key="inventory-operational-main" companyId={company.id} sessionToken={inventorySession} activeSubAction={activeSubAction} />
          ) : (
            <GestionProductos key="inventory-products-main"
              products={products} 
              categories={categoriesList} 
              onSaveProduct={onSaveProduct} 
              onDeleteProduct={onDeleteProduct} 
            />
          )}
        </div>
      )}

      {/* ----------------3. COMPRAS Y PROVEEDORES ---------------- */}
      {activeTab === 'compras' && (
        <div className="space-y-6">
          {activeSubAction === 'proveedores' ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <div>
                  <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                    <Truck className="text-[#00ff41]" />
                    <span>GESTIÓN DE PROVEEDORES</span>
                  </h2>
                  <p className="text-zinc-400 text-xs mt-1">
                    Directorio de casas comerciales, mayoristas y datos de facturación
                  </p>
                </div>

                <button
                  onClick={() => {
                    const ruc = prompt("RUC del Proveedor:");
                    const name = prompt("Razón Social:");
                    if (ruc && name) {
                      setSuppliers([...suppliers, { id: String(Date.now()), ruc, name: name.toUpperCase(), email: '', phone: '', address: '' }]);
                    }
                  }}
                  className="flex items-center gap-2 bg-[#00ff41] hover:bg-[#00e038] text-black font-display font-black px-4 py-2.5 rounded-xl text-xs transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]"
                >
                  <Plus size={16} />
                  <span>NUEVO PROVEEDOR</span>
                </button>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">RUC / Identificación</th>
                      <th className="p-3.5">Razón Social</th>
                      <th className="p-3.5">Teléfono</th>
                      <th className="p-3.5">Correo Electrónico</th>
                      <th className="p-3.5">Dirección</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {suppliers.map(s => (
                      <tr key={s.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-mono font-bold text-[#00ff41]">{s.ruc}</td>
                        <td className="p-3.5 font-bold text-white">{s.name}</td>
                        <td className="p-3.5 font-mono text-zinc-300">{s.phone}</td>
                        <td className="p-3.5 text-zinc-300">{s.email}</td>
                        <td className="p-3.5 text-zinc-400">{s.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : activeSubAction === 'retenciones' ? (
            <div className="space-y-6">
              <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
                <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                  <FileText className="text-[#00ff41]" />
                  <span>COMPROBANTES DE RETENCIÓN ELECTRÓNICA (SRI - 07)</span>
                </h2>
                <p className="text-zinc-400 text-xs mt-1">
                  Retenciones en la fuente de IVA e Impuesto a la Renta emitidas a proveedores
                </p>
              </div>

              <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                    <tr>
                      <th className="p-3.5">N° Comprobante</th>
                      <th className="p-3.5">Fecha</th>
                      <th className="p-3.5">Proveedor</th>
                      <th className="p-3.5 text-right">Ret. IVA</th>
                      <th className="p-3.5 text-right">Ret. Renta</th>
                      <th className="p-3.5 text-right">Total Retenido</th>
                      <th className="p-3.5 text-center">Estado SRI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {retentionsList.map(r => (
                      <tr key={r.id} className="hover:bg-zinc-800/40">
                        <td className="p-3.5 font-mono font-bold text-[#00ff41]">{r.number}</td>
                        <td className="p-3.5 font-mono text-zinc-400">{r.date}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-white">{r.supplier}</div>
                          <div className="text-[10px] font-mono text-zinc-500">{r.ruc}</div>
                        </td>
                        <td className="p-3.5 text-right font-mono text-zinc-300">${r.retIva.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono text-zinc-300">${r.retRenta.toFixed(2)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-[#00ff41]">${r.total.toFixed(2)}</td>
                        <td className="p-3.5 text-center">
                          <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                            {r.sriStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <GestionCompras key="purchases-main"
              products={products}
              suppliers={suppliers}
              purchasesList={purchases}
              onSavePurchase={(newPurchase) => {
                const record: PurchaseRecord = {
                  id: String(newPurchase.id),
                  supplierName: newPurchase.supplierName,
                  supplierRuc: newPurchase.supplierRuc,
                  invoiceNumber: `${newPurchase.estab}-${newPurchase.ptoEmi}-${newPurchase.secuencial}`,
                  date: newPurchase.issueDate,
                  total: newPurchase.total,
                  subtotal: newPurchase.subtotal,
                  iva: newPurchase.totalIva,
                  status: 'REGISTRADA',
                  itemsCount: newPurchase.items.length
                };
                setPurchases([record, ...purchases]);

                // Update product stock and purchase cost for bought items
                if (onSaveProduct) {
                  newPurchase.items.forEach(item => {
                    const existingProduct = products.find(p => p.id === item.productId || p.code === item.code);
                    if (existingProduct) {
                      onSaveProduct({
                        ...existingProduct,
                        purchaseCost: item.unitCost,
                        currentCost: item.unitCost,
                        stock: (existingProduct.stock || 0) + item.quantity
                      });
                    }
                  });
                }
              }}
              onSelectSupplierSubTab={(sub) => {
                if (onSelectSubAction) onSelectSubAction(sub);
              }}
            />
          )}
        </div>
      )}

      {/* ----------------4. TESORERÍA Y CAJA ---------------- */}
      {activeTab === 'tesoreria' && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <Wallet className="text-[#00ff41]" />
            <span>TESORERÍA, CAJA Y BANCOS</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">Sin saldos ni cuentas bancarias sincronizadas.</p>
        </div>
      )}

      {/* ----------------5. CARTERA (CUENTAS POR COBRAR) ---------------- */}
      {activeTab === 'cartera' && (
        <div className="space-y-6">
          <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
            <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
              <DollarSign className="text-[#00ff41]" />
              <span>CARTERA DE CLIENTES - CUENTAS POR COBRAR</span>
            </h2>
            <p className="text-zinc-400 text-xs mt-1">Control de ventas a crédito, saldos pendientes y vencimiento de facturas</p>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Cliente</th>
                  <th className="p-3.5">Factura Ref.</th>
                  <th className="p-3.5 font-mono">Emisión</th>
                  <th className="p-3.5 font-mono">Vencimiento</th>
                  <th className="p-3.5 text-right">Monto Total</th>
                  <th className="p-3.5 text-right">Abonado</th>
                  <th className="p-3.5 text-right">Saldo Pendiente</th>
                  <th className="p-3.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {receivables.map(c => (
                  <tr key={c.id} className="hover:bg-zinc-800/40">
                    <td className="p-3.5 font-bold text-white">{c.customer}</td>
                    <td className="p-3.5 font-mono text-[#00ff41]">{c.invoice}</td>
                    <td className="p-3.5 font-mono text-zinc-400">{c.issueDate}</td>
                    <td className="p-3.5 font-mono text-zinc-400">{c.dueDate}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-white">${c.amount.toFixed(2)}</td>
                    <td className="p-3.5 text-right font-mono text-emerald-400">${c.paid.toFixed(2)}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-amber-400">${c.balance.toFixed(2)}</td>
                    <td className="p-3.5 text-center">
                      <span className="bg-amber-950/60 text-amber-400 border border-amber-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------6. PAGOS (PROVEEDORES) ---------------- */}
      {activeTab === 'pagos' && (
        <div className="space-y-6">
          <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
            <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
              <Truck className="text-[#00ff41]" />
              <span>CUENTAS POR PAGAR - PROVEEDORES</span>
            </h2>
            <p className="text-zinc-400 text-xs mt-1">Obligaciones comerciales con proveedores y programación de pagos</p>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Proveedor</th>
                  <th className="p-3.5">N° Factura</th>
                  <th className="p-3.5 font-mono">Emisión</th>
                  <th className="p-3.5 font-mono">Vencimiento</th>
                  <th className="p-3.5 text-right">Monto Total</th>
                  <th className="p-3.5 text-right">Pagado</th>
                  <th className="p-3.5 text-right">Saldo</th>
                  <th className="p-3.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {payables.map(p => (
                  <tr key={p.id} className="hover:bg-zinc-800/40">
                    <td className="p-3.5 font-bold text-white">{p.supplier}</td>
                    <td className="p-3.5 font-mono text-white">{p.invoice}</td>
                    <td className="p-3.5 font-mono text-zinc-400">{p.issueDate}</td>
                    <td className="p-3.5 font-mono text-zinc-400">{p.dueDate}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-white">${p.amount.toFixed(2)}</td>
                    <td className="p-3.5 text-right font-mono text-emerald-400">${p.paid.toFixed(2)}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-red-400">${p.balance.toFixed(2)}</td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        p.status === 'PAGADO' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' : 'bg-red-950/60 text-red-400 border border-red-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------7. PRODUCCIÓN Y ENSAMBLE ---------------- */}
      {(activeTab === 'operaciones' || activeTab === 'produccion') && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <Package className="text-[#00ff41]" />
            <span>GESTIÓN DE PRODUCCIÓN Y FÓRMULAS</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">Sin órdenes de producción sincronizadas.</p>
        </div>
      )}

      {/* ----------------8. NÓMINA Y RECURSOS HUMANOS ---------------- */}
      {(activeTab === 'rrhh' || activeTab === 'nomina') && (
        <div className="space-y-6">
          <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800">
            <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
              <Users className="text-[#00ff41]" />
              <span>NÓMINA DE EMPLEADOS Y ROLES DE PAGO ECU</span>
            </h2>
            <p className="text-zinc-400 text-xs mt-1">Registro de personal, aportes IESS (9.45% personal / 11.15% patronal) y neto a recibir</p>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Cédula</th>
                  <th className="p-3.5">Empleado</th>
                  <th className="p-3.5">Cargo</th>
                  <th className="p-3.5 text-right">Sueldo Unificado</th>
                  <th className="p-3.5 text-right">Aporte IESS (9.45%)</th>
                  <th className="p-3.5 text-right">Neto a Recibir</th>
                  <th className="p-3.5 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {employeesList.map(e => {
                  const iess = e.salary * 0.0945;
                  const net = e.salary - iess;
                  return (
                    <tr key={e.id} className="hover:bg-zinc-800/40">
                      <td className="p-3.5 font-mono text-zinc-400">{e.cedula}</td>
                      <td className="p-3.5 font-bold text-white">{e.name}</td>
                      <td className="p-3.5 text-zinc-300">{e.position}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-white">${e.salary.toFixed(2)}</td>
                      <td className="p-3.5 text-right font-mono text-red-400">-${iess.toFixed(2)}</td>
                      <td className="p-3.5 text-right font-mono font-bold text-[#00ff41]">${net.toFixed(2)}</td>
                      <td className="p-3.5 text-center">
                        <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------9. CONTABILIDAD NIIF & SRI ---------------- */}
      {activeTab === 'contabilidad' && (
        <div className="space-y-6">
          <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
                <FileText className="text-[#00ff41]" />
                <span>PLAN DE CUENTAS NIIF Y ANEXO ATS SRI</span>
              </h2>
              <p className="text-zinc-400 text-xs mt-1">Estructura contable, asientos automáticos y generación de archivo XML ATS para el SRI</p>
            </div>

            <button
              onClick={() => alert("Generando Anexo Transaccional Simplificado (ATS) en XML para el SRI...")}
              className="px-4 py-2 bg-[#00ff41] hover:bg-[#00e038] text-black font-bold text-xs rounded-xl flex items-center gap-2 font-display"
            >
              <Download size={14} />
              <span>GENERAR ATS XML SRI</span>
            </button>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">Código Cuenta</th>
                  <th className="p-3.5">Nombre de la Cuenta Contable</th>
                  <th className="p-3.5">Tipo</th>
                  <th className="p-3.5 text-right">Saldo Actual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {chartOfAccounts.map((acc, i) => (
                  <tr key={i} className="hover:bg-zinc-800/40">
                    <td className="p-3.5 font-mono font-bold text-[#00ff41]">{acc.code}</td>
                    <td className="p-3.5 font-bold text-white">{acc.name}</td>
                    <td className="p-3.5 font-mono text-zinc-400 text-[10px]">{acc.type}</td>
                    <td className="p-3.5 text-right font-mono font-bold text-white">${acc.balance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------10. TABLERO DE CONTROL ---------------- */}
      {(activeTab === 'analitica' || activeTab === 'tablero') && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <LayoutDashboard className="text-[#00ff41]" />
            <span>TABLERO DE CONTROL COMERCIAL</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">Sin indicadores sincronizados.</p>
        </div>
      )}

      {/* ----------------11. ADMINISTRACIÓN Y AUDITORÍA ---------------- */}
      {activeTab === 'administracion' && (
        <div className="space-y-6">
          {activeSubAction === 'usuarios_roles' ? (
            <GestionUsuarios key="admin-users-main"
              usersList={users as any}
              companiesList={companies}
              onSaveUser={onSaveUser}
              onDeleteUser={onDeleteUser}
            />
          ) : activeSubAction === 'firma_p12' ? (
            <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4 max-w-3xl mx-auto">
              <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                <ShieldCheck size={18} className="text-[#00ff41]" />
                <span>Certificado de Firma Electrónica (.P12 / .PFX)</span>
              </h3>
              <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-3 text-xs">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Archivo de Firma (.p12)</label>
                  <input type="file" accept=".p12,.pfx" onChange={handleSignatureFile} className="block w-full text-zinc-400 text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700 cursor-pointer" />
                  {signatureFile && <div className="mt-2 text-[11px] text-emerald-400 font-mono">Archivo: {signatureFile.name} ({Math.ceil(signatureFile.size / 1024)} KB)</div>}
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Contraseña de la Firma</label>
                  <input type="password" value="••••••••••••" readOnly className="w-full bg-[#121217] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono" />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Contraseña para validar la firma</label>
                  <input type="password" value={signaturePassword} onChange={(event) => setSignaturePassword(event.target.value)} placeholder="Ingrese la contraseña" className="w-full bg-[#121217] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono" />
                </div>
                <div className="hidden">
                  <CheckCircle2 size={16} />
                  <span>Estado pendiente de validación criptográfica en el servidor.</span>
                </div>
                {signatureNotice && <div className="text-xs text-cyan-300">{signatureNotice}</div>}
                <button type="button" onClick={saveSignatureConfig} className="bg-[#00ff41] text-black font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"><Save size={14} /> Guardar configuración</button>
              </div>
            </div>
          ) : activeSubAction === 'establecimientos' ? (
            <GestionEstablecimientos company={company} />
          ) : activeSubAction === '__legacy_establecimientos' ? (
            <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4 max-w-4xl mx-auto">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                  <Store size={18} className="text-emerald-400" />
                  <span>Establecimientos y Puntos de Emisión SRI</span>
                </h3>
                <button onClick={handleNewEmissionPoint} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 shadow">
                  <Plus size={14} />
                  <span>Nuevo Punto</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">Establecimiento Matriz 001</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30">ACTIVO</span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">Punto Emisión: <strong className="text-amber-400">001</strong> - Caja Principal</div>
                  <div className="text-xs text-zinc-400 font-mono">Punto Emisión: <strong className="text-amber-400">002</strong> - Facturación Móvil</div>
                  <div className="text-[11px] text-zinc-500">Dirección: Paján, Manabí • Calle 10 de Agosto</div>
                </div>

                <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-white">Sucursal Paján Centro 002</span>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/30">ACTIVO</span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono">Punto Emisión: <strong className="text-amber-400">001</strong> - Mostrador Principal</div>
                  <div className="text-[11px] text-zinc-500">Dirección: Av. 9 de Octubre y Rocafuerte</div>
                </div>
              </div>
              <div className="bg-[#0a0a0d] border border-emerald-500/20 p-4 rounded-xl space-y-2">
                <div className="text-xs font-bold text-emerald-400">Configuración guardada para {company.tradeName || company.name}</div>
                {establishments.map(establishment => (
                  <div key={establishment.id} className="flex flex-wrap items-center gap-2 text-xs text-zinc-300 border-b border-zinc-800 pb-2 last:border-0">
                    <strong className="text-white">{establishment.code} - {establishment.name}</strong>
                    <span className="text-zinc-500">{establishment.address || 'Sin dirección registrada'}</span>
                    <span className="text-amber-300 font-mono">Puntos: {establishment.points.map((point: any) => `${point.code} ${point.name}`).join(' | ')}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : activeSubAction === 'api_sri' ? (
            <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4 max-w-3xl mx-auto">
              <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
                <Cpu size={18} className="text-cyan-400" />
                <span>Configuración de API de Facturación Electrónica SRI</span>
              </h3>

              <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-3 text-xs">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Proveedor de Servicio / Adaptador API</label>
                    <select value={sriConfig.provider} onChange={(event) => setSriConfig(previous => ({ ...previous, provider: event.target.value }))} className="w-full bg-[#121217] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono font-bold">
                    <option value="TENDI_NATIVE">API NATIVA TENDI (Servidor SRI Directo)</option>
                    <option value="COMPATIBLE_BRIDGE">ADAPTADOR COMPATIBLE</option>
                    <option value="CUSTOM_HTTP">ADAPTADOR HTTP PERSONALIZADO</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-zinc-400 font-bold block mb-1">Ambiente Activo</label>
                    <input type="text" readOnly value={company.environment} className="w-full bg-[#121217] border border-zinc-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold" />
                  </div>
                  <div>
                    <label className="text-zinc-400 font-bold block mb-1">Timeout de Respuesta (seg)</label>
                    <input type="number" value={sriConfig.timeout} onChange={(event) => setSriConfig(previous => ({ ...previous, timeout: Number(event.target.value) }))} className="w-full bg-[#121217] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono" />
                  </div>
                </div>

                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 rounded-xl font-mono text-[11px] space-y-1">
                  <div className="font-bold text-cyan-400">Endpoint Recepción SRI:</div>
                  <div className="text-zinc-300 truncate">https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl</div>
                  <div className="font-bold text-cyan-400 pt-1">Endpoint Autorización SRI:</div>
                  <div className="text-zinc-300 truncate">https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl</div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={sriConfig.enabled} onChange={(event) => setSriConfig(previous => ({ ...previous, enabled: event.target.checked }))} className="accent-cyan-400" /> Usar configuración SRI para esta empresa</label>
                  <button type="button" onClick={saveSriConfig} className="bg-cyan-500 text-black font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"><Save size={14} /> Guardar</button>
                </div>
                {sriNotice && <div className="text-xs text-cyan-300">{sriNotice}</div>}
              </div>
            </div>
          ) : activeSubAction === 'matriz_permisos' ? (
            <GestionMatrizPermisos key="admin-matrix-settings" companyId={company.id} companyName={company.tradeName || company.name} companyActive={company.active !== false} currentUser={currentUser} />
          ) : activeSubAction === 'aprobaciones' || activeSubAction === 'auditoria' ? (
            <GestionAprobacionesAudit key="admin-approval-settings" companyId={company.id} currentUser={currentUser} />
          ) : activeSubAction === 'datos_emisor' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* SRI Data */}
              <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Building2 size={18} className="text-[#00ff41]" />
                  <span>Datos del Emisor (SRI)</span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-zinc-400 font-bold block mb-1">Razón Social</label>
                    <input type="text" readOnly value={company.name} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 font-bold" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">RUC Emisor</label>
                      <input type="text" readOnly value={company.ruc} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-[#00ff41] font-mono font-bold" />
                    </div>
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Ambiente SRI</label>
                      <input type="text" readOnly value={company.environment} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Establecimiento</label>
                      <input type="text" readOnly value={company.establishment} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 font-mono" />
                    </div>
                    <div>
                      <label className="text-zinc-400 font-bold block mb-1">Punto de Emisión</label>
                      <input type="text" readOnly value={company.emissionPoint} className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-zinc-300 font-mono" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Users & PIN setup */}
              <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
                  <Users size={18} className="text-amber-400" />
                  <span>Facturadores y Claves PIN</span>
                </h3>

                <div className="space-y-3">
                  {users.map(u => (
                    <div key={u.id} className="bg-[#0a0a0d] border border-zinc-800 p-3 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>{u.username}</span>
                          <span className="bg-zinc-800 text-zinc-400 text-[9px] px-1.5 py-0.5 rounded font-mono">{u.role}</span>
                        </div>
                        <div className="text-zinc-500">{u.fullName}</div>
                      </div>

                      <div className="flex items-center gap-2 font-mono bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800 text-amber-400">
                        <Key size={12} />
                        <span>{u.pin ? 'PIN configurado' : 'PIN pendiente'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* DEFAULT OR activeSubAction === 'empresas' */
            <GestionEmpresas
              key="admin-companies-main"
              companiesList={companies as any}
              selectedCompanyId={company.id}
              onSelectCompany={(selected) => {
                const nextCompany = companies.find(item => item.id === selected.id);
                if (nextCompany?.active !== false) onSelectCompany?.(nextCompany);
              }}
              onSaveCompany={onSaveCompany}
              onDeleteCompany={onDeleteCompany}
            />
          )}
        </div>
      )}

      {/* ----------------12. ACTIVOS FIJOS ---------------- */}
      {activeTab === 'activos' && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <Building2 className="text-[#00ff41]" />
            <span>GESTIÓN DE ACTIVOS FIJOS</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">Sin activos sincronizados.</p>
        </div>
      )}

      {/* ----------------13. APLICACIÓN MÓVIL ---------------- */}
      {activeTab === 'movil' && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <Smartphone className="text-[#00ff41]" />
            <span>TERMINALES MÓVILES</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">No hay dispositivos vinculados.</p>
        </div>
      )}

      {/* ----------------14. SOPORTE TÉCNICO Y LICENCIA ---------------- */}
      {activeTab === 'soporte' && (
        <div className="bg-[#121217] border border-zinc-800 p-6 rounded-2xl">
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <HelpCircle className="text-[#00ff41]" />
            <span>SOPORTE TÉCNICO Y LICENCIA</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-3">Sin licencia ni canales de soporte configurados.</p>
        </div>
      )}

      {/* Product Form Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form onSubmit={handleSaveProductSubmit} className="bg-[#121217] border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-white font-display">
              {editingProduct ? 'Editar Producto' : 'Registrar Nuevo Producto'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 font-bold block mb-1">Código Interno / Código de Barras</label>
                <input 
                  type="text" 
                  value={prodCode}
                  onChange={(e) => setProdCode(e.target.value)}
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono focus:border-[#00ff41] outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-zinc-400 font-bold block mb-1">Nombre del Producto</label>
                <input 
                  type="text" 
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-bold focus:border-[#00ff41] outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Precio Venta (PVP)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-[#00ff41] font-mono font-bold focus:border-[#00ff41] outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Stock Inicial</label>
                  <input 
                    type="number" 
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono focus:border-[#00ff41] outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#00ff41] hover:bg-[#00e038] text-black rounded-xl text-xs font-bold font-display"
              >
                Guardar Producto
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
