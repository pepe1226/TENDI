import React, { useState } from 'react';
import { 
  Building2, 
  Package, 
  Truck, 
  Wallet, 
  LayoutDashboard, 
  Settings, 
  ChevronDown, 
  UserCheck, 
  Monitor,
  Receipt,
  CreditCard,
  DollarSign,
  Factory,
  Users,
  BookOpen,
  MessageSquare,
  FileText,
  FileCheck,
  FilePlus,
  Printer,
  Folder,
  Coins,
  FileDown,
  PackageCheck,
  AlertCircle,
  X,
  Tag,
  FolderTree,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  ClipboardList,
  ShoppingBag,
  PlusCircle,
  ShieldCheck,
  Landmark,
  Lock,
  ArrowDown,
  BarChart3,
  FileSpreadsheet,
  Calendar,
  Send,
  Boxes,
  Clock,
  Edit3,
  Scale,
  TrendingUp,
  PieChart,
  Award,
  Store,
  Key,
  Cpu,
  Eye,
  Smartphone,
  HelpCircle,
  Briefcase,
  MapPin
} from 'lucide-react';
import { AdminTab, Company } from '../types';
import { PRIMARY_ADMIN_MODULES } from '../adminNavigation';

interface RibbonGroupItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  iconColor?: string;
  isDropdown?: boolean;
  subItems?: { id: string; label: string; icon: React.ReactNode }[];
}

interface RibbonGroup {
  name: string;
  items: RibbonGroupItem[];
}

export interface NavbarProps {
  companies: Company[];
  activeCompany: Company;
  onSelectCompany: (company: Company) => void;
  activeTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  onOpenPos: () => void;
  currentUser: string;
  activeSubAction?: string;
  onSelectSubAction?: (actionId: string) => void;
  openSubTabs?: { id: string; label: string }[];
  onCloseSubTab?: (id: string) => void;
  onLogout?: () => void;
  canAccessAction?: (actionId: string) => boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  companies,
  activeCompany,
  onSelectCompany,
  activeTab,
  onSelectTab,
  onOpenPos,
  currentUser,
  activeSubAction = 'listado_ventas',
  onSelectSubAction,
  openSubTabs = [
    { id: 'tablero_ventas', label: 'Tablero de Control Ventas' },
    { id: 'avisos', label: 'Avisos Importantes' }
  ],
  onCloseSubTab,
  onLogout,
  canAccessAction = (_actionId: string) => true
}) => {
  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [expandedDropdownId, setExpandedDropdownId] = useState<string | null>(null);

  // Main Tabs definitions matching exact official TENDI core modules
  const tabs: { id: AdminTab; label: string }[] = [
    ...PRIMARY_ADMIN_MODULES.map(({ id, label }) => ({ id, label })),
    { id: 'movil', label: 'POS Móvil' },
    { id: 'soporte', label: 'Soporte TENDI' },
  ];

  // Ribbon Toolbar groups per activeTab
  const getRibbonGroups = (tab: AdminTab): RibbonGroup[] => {
    switch (tab) {
      case 'ventas':
        return [
          {
            name: 'Ventas',
            items: [
              { id: 'clientes', label: 'Clientes', icon: <Users size={22} />, iconColor: 'text-amber-400' },
              { id: 'entregas', label: 'Entregas por Facturar', icon: <PackageCheck size={22} />, iconColor: 'text-orange-400' },
            ]
          },
          {
            name: 'Cotizaciones',
            items: [
              { id: 'proformas', label: 'Proformas', icon: <FileCheck size={22} />, iconColor: 'text-emerald-400' },
              { id: 'pedidos', label: 'Pedidos', icon: <FilePlus size={22} />, iconColor: 'text-blue-400' },
              { id: 'whatsapp', label: 'Marketing WhatsApp', icon: <MessageSquare size={22} />, iconColor: 'text-green-500' },
            ]
          },
          {
            name: 'Configuraciones',
            items: [
              { 
                id: 'config_ventas', 
                label: 'Configuraciones', 
                icon: <Settings size={22} />, 
                iconColor: 'text-amber-300',
                isDropdown: true,
                subItems: [
                  { id: 'agentes', label: 'Agentes de Ventas', icon: <Users size={18} /> },
                  { id: 'secuencias', label: 'Secuencias Documentos', icon: <Folder size={18} /> },
                  { id: 'tarjetas', label: 'Tarjetas Clientes', icon: <CreditCard size={18} /> },
                  { id: 'comisiones', label: 'Liquidación Comisiones', icon: <Coins size={18} /> },
                  { id: 'impresion_lotes', label: 'Impresión Facturas Lotes', icon: <Printer size={18} /> },
                  { id: 'docs_electronicos', label: 'Documentos Electrónicos', icon: <FileDown size={18} /> },
                ]
              },
            ]
          },
          {
            name: 'Reportes',
            items: [
              { id: 'listado_ventas', label: 'Listado Ventas', icon: <Printer size={22} />, iconColor: 'text-indigo-400' },
            ]
          }
        ];

      case 'inventario':
        return [
          {
            name: 'Mantenimiento',
            items: [
              { id: 'productos', label: 'Productos & Servicios', icon: <Package size={22} />, iconColor: 'text-emerald-400' },
              { id: 'categorias', label: 'Categorías', icon: <FolderTree size={22} />, iconColor: 'text-blue-400' },
              { id: 'lineas', label: 'Líneas', icon: <Layers size={22} />, iconColor: 'text-purple-400' },
              { id: 'tarifas', label: 'Tarifas / Precios', icon: <Tag size={22} />, iconColor: 'text-amber-400' },
            ]
          },
          {
            name: 'Movimientos',
            items: [
              { id: 'entradas', label: 'Entradas Inventario', icon: <ArrowDownRight size={22} />, iconColor: 'text-emerald-500' },
              { id: 'salidas', label: 'Salidas y Ajustes', icon: <ArrowUpRight size={22} />, iconColor: 'text-red-400' },
              { id: 'kardex', label: 'Kardex de Productos', icon: <BookOpen size={22} />, iconColor: 'text-cyan-400' },
            ]
          },
          {
            name: 'Reportes',
            items: [
              { id: 'stock_minimo', label: 'Stock Mínimo', icon: <AlertTriangle size={22} />, iconColor: 'text-amber-500' },
              { id: 'ajuste_fisico', label: 'Ajuste Físico', icon: <ClipboardList size={22} />, iconColor: 'text-zinc-300' },
            ]
          }
        ];

      case 'compras':
        return [
          {
            name: 'Operaciones',
            items: [
              { id: 'proveedores', label: 'Proveedores', icon: <Users size={22} />, iconColor: 'text-cyan-400' },
              { id: 'ordenes_compra', label: 'Ordenes de Compra', icon: <ShoppingBag size={22} />, iconColor: 'text-purple-400' },
              { id: 'nueva_compra', label: 'Nueva Compra', icon: <PlusCircle size={22} />, iconColor: 'text-emerald-400' },
            ]
          },
          {
            name: 'Comprobantes SRI',
            items: [
              { id: 'facturas_compra', label: 'Facturas Proveedor', icon: <FileText size={22} />, iconColor: 'text-blue-400' },
              { id: 'liquidaciones', label: 'Liquidación Compra (03)', icon: <ShieldCheck size={22} />, iconColor: 'text-amber-400' },
              { id: 'retenciones', label: 'Comprobantes Retención', icon: <Landmark size={22} />, iconColor: 'text-emerald-400' },
            ]
          },
          {
            name: 'Reportes',
            items: [
              { id: 'listado_compras', label: 'Listado Compras', icon: <Printer size={22} />, iconColor: 'text-indigo-400' },
            ]
          }
        ];

      case 'tesoreria':
        return [
          {
            name: 'Cajas',
            items: [
              { id: 'gestion_cajas', label: 'Gestión de Cajas', icon: <Wallet size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'transacciones_caja', label: 'Transacciones', icon: <DollarSign size={22} />, iconColor: 'text-amber-400' },
              { id: 'cierre_caja', label: 'Arqueo & Cierre', icon: <Lock size={22} />, iconColor: 'text-red-400' },
            ]
          },
          {
            name: 'Bancos',
            items: [
              { id: 'bancos', label: 'Bancos & Cuentas', icon: <Building2 size={22} />, iconColor: 'text-blue-400' },
              { id: 'depositos', label: 'Depósitos', icon: <ArrowDown size={22} />, iconColor: 'text-emerald-400' },
              { id: 'vouchers', label: 'Liquidación Vouchers', icon: <CreditCard size={22} />, iconColor: 'text-purple-400' },
            ]
          },
          {
            name: 'Reportes',
            items: [
              { id: 'resumen_tesoreria', label: 'Resumen Cajas', icon: <BarChart3 size={22} />, iconColor: 'text-cyan-400' },
            ]
          }
        ];

      case 'cartera':
        return [
          {
            name: 'Cobranzas',
            items: [
              { id: 'cuentas_cobrar', label: 'Cuentas por Cobrar', icon: <CreditCard size={22} />, iconColor: 'text-amber-400' },
              { id: 'registrar_cobro', label: 'Registrar Cobro', icon: <DollarSign size={22} />, iconColor: 'text-emerald-400' },
              { id: 'anticipos_clientes', label: 'Anticipos Clientes', icon: <Coins size={22} />, iconColor: 'text-blue-400' },
            ]
          },
          {
            name: 'Análisis',
            items: [
              { id: 'estado_cuenta', label: 'Estado de Cuenta', icon: <FileSpreadsheet size={22} />, iconColor: 'text-indigo-400' },
              { id: 'vencimientos', label: 'Vencimientos', icon: <Calendar size={22} />, iconColor: 'text-red-400' },
            ]
          }
        ];

      case 'pagos':
        return [
          {
            name: 'Pagos',
            items: [
              { id: 'cuentas_pagar', label: 'Cuentas por Pagar', icon: <DollarSign size={22} />, iconColor: 'text-red-400' },
              { id: 'pago_proveedores', label: 'Pago a Proveedores', icon: <Send size={22} />, iconColor: 'text-emerald-400' },
              { id: 'egresos_caja', label: 'Egresos de Caja', icon: <ArrowUpRight size={22} />, iconColor: 'text-amber-400' },
            ]
          }
        ];

      case 'produccion':
        return [
          {
            name: 'Procesos',
            items: [
              { id: 'ordenes_prod', label: 'Ordenes Producción', icon: <Factory size={22} />, iconColor: 'text-amber-400' },
              { id: 'recetas', label: 'Recetas & Fórmulas', icon: <FileText size={22} />, iconColor: 'text-blue-400' },
              { id: 'materia_prima', label: 'Materia Prima', icon: <Boxes size={22} />, iconColor: 'text-purple-400' },
            ]
          }
        ];

      case 'nomina':
        return [
          {
            name: 'Personal',
            items: [
              { id: 'empleados', label: 'Empleados', icon: <Users size={22} />, iconColor: 'text-cyan-400' },
              { id: 'roles_pago', label: 'Roles de Pago', icon: <FileSpreadsheet size={22} />, iconColor: 'text-emerald-400' },
              { id: 'asistencia', label: 'Asistencia & Horarios', icon: <Clock size={22} />, iconColor: 'text-amber-400' },
            ]
          }
        ];

      case 'contabilidad':
        return [
          {
            name: 'Libros Contables',
            items: [
              { id: 'plan_cuentas', label: 'Plan de Cuentas', icon: <BookOpen size={22} />, iconColor: 'text-blue-400' },
              { id: 'asientos', label: 'Asientos Contables', icon: <Edit3 size={22} />, iconColor: 'text-emerald-400' },
              { id: 'libro_diario', label: 'Libro Diario', icon: <FileSpreadsheet size={22} />, iconColor: 'text-indigo-400' },
            ]
          },
          {
            name: 'Estados Financieros',
            items: [
              { id: 'balance_general', label: 'Balance General', icon: <Scale size={22} />, iconColor: 'text-amber-400' },
              { id: 'pyg', label: 'Pérdidas y Ganancias', icon: <TrendingUp size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'ats_sri', label: 'Anexo ATS SRI', icon: <FileCheck size={22} />, iconColor: 'text-cyan-400' },
            ]
          }
        ];

      case 'analitica':
        return [
          {
            name: 'Paneles BI Ejecutivos',
            items: [
              { id: 'ventas_totales', label: 'Dashboard Ejecutivo', icon: <PieChart size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'margenes_reales', label: 'Margen Real Utilidad', icon: <TrendingUp size={22} />, iconColor: 'text-emerald-400' },
              { id: 'rotacion_inventario', label: 'Rotación Inventario', icon: <Layers size={22} />, iconColor: 'text-cyan-400' },
              { id: 'liquidez_caja', label: 'Liquidez y Flujo', icon: <DollarSign size={22} />, iconColor: 'text-amber-400' },
              { id: 'antiguedad_cartera', label: 'Antigüedad Cartera', icon: <Clock size={22} />, iconColor: 'text-purple-400' },
              { id: 'comparativo_multiempresa', label: 'Comparativo Empresas', icon: <Building2 size={22} />, iconColor: 'text-blue-400' },
            ]
          }
        ];

      case 'operaciones':
        return [
          {
            name: 'Logística & Despacho',
            items: [
              { id: 'guias_remision', label: 'Guías de Remisión', icon: <Truck size={22} />, iconColor: 'text-amber-400' },
              { id: 'rutas_entrega', label: 'Rutas de Entrega', icon: <MapPin size={22} />, iconColor: 'text-blue-400' },
              { id: 'garantias', label: 'Control Garantías', icon: <ShieldCheck size={22} />, iconColor: 'text-emerald-400' },
            ]
          },
          {
            name: 'Producción & BOM',
            items: [
              { id: 'recetas', label: 'Recetas / BOM', icon: <FileText size={22} />, iconColor: 'text-purple-400' },
              { id: 'ordenes_prod', label: 'Órdenes Producción', icon: <Factory size={22} />, iconColor: 'text-cyan-400' },
            ]
          }
        ];

      case 'rrhh':
        return [
          {
            name: 'Talento Humano',
            items: [
              { id: 'empleados', label: 'Expediente Empleados', icon: <Users size={22} />, iconColor: 'text-cyan-400' },
              { id: 'asistencia', label: 'Control Asistencias', icon: <Clock size={22} />, iconColor: 'text-amber-400' },
              { id: 'anticipos', label: 'Anticipos Sueldos', icon: <DollarSign size={22} />, iconColor: 'text-emerald-400' },
            ]
          },
          {
            name: 'Nómina & Fiscal',
            items: [
              { id: 'roles_pago', label: 'Roles de Pago', icon: <FileSpreadsheet size={22} />, iconColor: 'text-purple-400' },
              { id: 'anexo_rdep', label: 'Anexo RDEP (SRI)', icon: <FileCheck size={22} />, iconColor: 'text-[#00ff41]' },
            ]
          }
        ];

      case 'tablero':
        return [
          {
            name: 'Indicadores Ventas',
            items: [
              { id: 'ventas_facturador', label: 'Ventas Facturador', icon: <BarChart3 size={22} />, iconColor: 'text-red-400' },
              { id: 'ventas_vendedor', label: 'Ventas Vendedor', icon: <Users size={22} />, iconColor: 'text-blue-400' },
              { id: 'ventas_totales', label: 'Ventas Totales', icon: <PieChart size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'top_clientes', label: 'Top 10 Clientes', icon: <Award size={22} />, iconColor: 'text-amber-400' },
            ]
          }
        ];

      case 'activos':
        return [
          {
            name: 'Activos Fijos',
            items: [
              { id: 'listado_activos', label: 'Bienes y Equipos', icon: <Building2 size={22} />, iconColor: 'text-amber-400' },
              { id: 'depreciacion', label: 'Depreciación', icon: <TrendingUp size={22} />, iconColor: 'text-emerald-400' },
            ]
          }
        ];

      case 'movil':
        return [
          {
            name: 'POS Móvil',
            items: [
              { id: 'pos_movil', label: 'Terminales Móviles', icon: <Smartphone size={22} />, iconColor: 'text-cyan-400' },
              { id: 'sincronizacion_movil', label: 'Sincronización', icon: <Cpu size={22} />, iconColor: 'text-emerald-400' },
            ]
          }
        ];

      case 'soporte':
        return [
          {
            name: 'Asistencia y Licencia',
            items: [
              { id: 'soporte_tecnico', label: 'Soporte Técnico', icon: <HelpCircle size={22} />, iconColor: 'text-amber-400' },
              { id: 'licencia_sistema', label: 'Información Licencia', icon: <Award size={22} />, iconColor: 'text-[#00ff41]' },
            ]
          }
        ];

      case 'matriz_permisos':
        return [
          {
            name: 'Gobernanza RBAC',
            items: [
              { id: 'matriz_permisos', label: 'Matriz de Permisos', icon: <ShieldCheck size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'usuarios_roles', label: 'Usuarios y Roles', icon: <Users size={22} />, iconColor: 'text-purple-400' },
            ]
          }
        ];

      case 'aprobaciones':
        return [
          {
            name: 'Control y Auditoría',
            items: [
              { id: 'aprobaciones', label: 'Bandeja Aprobaciones', icon: <Clock size={22} />, iconColor: 'text-amber-400' },
              { id: 'auditoria', label: 'Bitácora de Auditoría', icon: <Eye size={22} />, iconColor: 'text-cyan-400' },
            ]
          }
        ];

      case 'kardex_stock':
        return [
          {
            name: 'Inventario Auditable',
            items: [
              { id: 'kardex', label: 'Kárdex de Movimientos', icon: <BookOpen size={22} />, iconColor: 'text-emerald-400' },
              { id: 'stock_minimo', label: 'Alertas de Stock', icon: <AlertTriangle size={22} />, iconColor: 'text-amber-400' },
              { id: 'ajuste_fisico', label: 'Ajustes de Inventario', icon: <ClipboardList size={22} />, iconColor: 'text-blue-400' },
            ]
          }
        ];

      case 'administracion':
      default:
        return [
          {
            name: 'Empresa',
            items: [
              { id: 'empresas', label: 'Gestión Empresas', icon: <Building2 size={22} />, iconColor: 'text-amber-400' },
              { id: 'datos_emisor', label: 'Datos Emisor', icon: <Store size={22} />, iconColor: 'text-blue-400' },
              { id: 'establecimientos', label: 'Establecimientos', icon: <Store size={22} />, iconColor: 'text-emerald-400' },
              { id: 'firma_p12', label: 'Firma Electrónica', icon: <Key size={22} />, iconColor: 'text-amber-300' },
              { id: 'api_sri', label: 'API Facturación', icon: <Cpu size={22} />, iconColor: 'text-cyan-400' },
            ]
          },
          {
            name: 'Seguridad & Gobernanza',
            items: [
              { id: 'usuarios_roles', label: 'Usuarios y Roles', icon: <Users size={22} />, iconColor: 'text-purple-400' },
              { id: 'matriz_permisos', label: 'Matriz Permisos', icon: <ShieldCheck size={22} />, iconColor: 'text-[#00ff41]' },
              { id: 'aprobaciones', label: 'Aprobaciones', icon: <Clock size={22} />, iconColor: 'text-amber-400' },
              { id: 'auditoria', label: 'Auditoría', icon: <Eye size={22} />, iconColor: 'text-zinc-300' },
            ]
          }
        ];
    }
  };

  const currentGroups = getRibbonGroups(activeTab)
    .map(group => ({
      ...group,
      items: group.items
        .filter(item => canAccessAction(item.id))
        .map(item => ({
          ...item,
          subItems: item.subItems?.filter(subItem => canAccessAction(subItem.id))
        }))
    }))
    .filter(group => group.items.length > 0);

  const handleActionClick = (id: string) => {
    if (!canAccessAction(id)) return;
    if (onSelectSubAction) {
      onSelectSubAction(id);
    }
    setExpandedDropdownId(null);
  };

  return (
    <header className="bg-[#121217] border-b border-zinc-800 text-white select-none z-30 shrink-0 font-sans shadow-xl">
      {/* 1. Top Status & Company Bar */}
      <div className="px-4 py-1.5 bg-[#0a0a0d] border-b border-zinc-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[#00ff41] font-display font-black text-lg tracking-[0.2em] uppercase">
              TENDI
            </span>
            <span className="bg-zinc-800/80 text-zinc-300 font-mono font-bold text-[9px] px-2 py-0.5 rounded border border-zinc-700">
              ECUADOR ERP
            </span>
          </div>

          <div className="h-4 w-[1px] bg-zinc-800" />

          {/* Company Selector Dropdown with Operational DB Context */}
          <div className="relative">
            <button
              onClick={() => setIsCompanyDropdownOpen(!isCompanyDropdownOpen)}
              className="flex items-center gap-2 bg-[#181820] hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 px-3 py-1 rounded-md text-xs font-semibold transition-all shadow-sm"
            >
              <Building2 size={13} className="text-[#00ff41]" />
              <div className="flex flex-col items-start leading-none">
                <span className="font-bold text-white">{activeCompany.tradeName || activeCompany.name}</span>
                <span className="text-[9px] font-mono text-amber-400 mt-0.5">
                  DB: {activeCompany.dbName || 'SIN ORIGEN'}
                </span>
              </div>
              <ChevronDown size={12} className="text-zinc-400 ml-1" />
            </button>

            {isCompanyDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-80 bg-[#14141a] border border-zinc-700 rounded-xl shadow-2xl z-50 py-1 font-sans">
                <div className="px-3 py-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-800 flex justify-between items-center">
                  <span>Seleccionar Empresa (Multi-BD)</span>
                  <span className="text-emerald-400 font-mono text-[9px]">Sys: tendi_system</span>
                </div>
                {companies.filter(comp => comp.active !== false).map((comp) => (
                  <button
                    key={comp.id}
                    onClick={() => {
                      onSelectCompany(comp);
                      setIsCompanyDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex flex-col hover:bg-zinc-800/80 transition-colors border-b border-zinc-800/50 ${
                      comp.id === activeCompany.id ? 'bg-[#00ff41]/10 text-[#00ff41] border-l-4 border-[#00ff41]' : 'text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{comp.tradeName || comp.name}</span>
                      <span className="text-[9px] font-mono bg-zinc-900 px-1.5 py-0.5 rounded text-amber-300 border border-zinc-700">
                        {comp.dbName || 'SIN ORIGEN'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 mt-1">
                      RUC: {comp.ruc} • {comp.environment}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User Info & Quick POS Action */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/80 px-2.5 py-0.5 rounded-md">
            <UserCheck size={13} className="text-amber-400" />
            <span className="text-zinc-300 font-medium text-xs">
              Usuario: <strong className="text-white font-semibold">{currentUser}</strong>
            </span>
          </div>

          <div className={`flex items-center gap-1.5 text-[10px] font-mono border px-2.5 py-0.5 rounded-md ${activeCompany.environment === 'PRODUCCION' ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800/60' : 'bg-amber-950/50 text-amber-400 border-amber-800/60'}`}>
            <span className={`w-2 h-2 rounded-full ${activeCompany.environment === 'PRODUCCION' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span>SRI {activeCompany.environment}</span>
          </div>

          {/* POS Launcher Button */}
          <button
            onClick={onOpenPos}
            disabled={!canAccessAction('pos')}
            className="flex items-center gap-2 bg-[#00ff41] hover:bg-[#00e038] disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none text-black font-display font-black text-xs px-3 py-1 rounded-md shadow-[0_0_15px_rgba(0,255,65,0.25)] transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
            title="Ir al Punto de Venta (POS)"
          >
            <Monitor size={14} />
            <span>POS</span>
          </button>

          {onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-display font-bold text-xs px-2.5 py-1 rounded-md border border-zinc-700 transition-all active:scale-95 cursor-pointer"
              title="Cambiar de Empresa o Cerrar Sesión"
            >
              <Building2 size={13} />
              <span>Cambiar Empresa</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Top Main Tab Navigation Bar (Exact Desktop Style from Screenshot) */}
      <nav className="flex items-center px-2 bg-[#181820] border-b border-zinc-800/90 overflow-x-auto custom-scrollbar text-xs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                onSelectTab(tab.id);
                setExpandedDropdownId(null);
              }}
              className={`px-3.5 py-2 font-medium transition-all relative border-t-2 border-b-0 whitespace-nowrap text-xs ${
                isActive
                  ? 'bg-amber-600/90 text-white font-bold border-amber-400 shadow-md'
                  : 'text-zinc-300 hover:bg-zinc-800/60 hover:text-white border-transparent'
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 3. RIBBON TOOLBAR (Horizontal Grouped Toolbar) */}
      <div className="bg-[#20202a] border-b border-zinc-800 px-3 py-2 flex items-stretch gap-2 overflow-x-auto custom-scrollbar relative min-h-[82px]">
        {currentGroups.map((group, gIdx) => (
          <div key={gIdx} className="flex flex-col justify-between border-r border-zinc-700/60 pr-3.5 mr-1 shrink-0">
            {/* Action Buttons in Group */}
            <div className="flex items-center gap-2">
              {group.items.map((item) => (
                <div key={item.id} className="relative">
                  <button
                    onClick={() => {
                      if (item.isDropdown) {
                        setExpandedDropdownId(expandedDropdownId === item.id ? null : item.id);
                      } else {
                        handleActionClick(item.id);
                      }
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all min-w-[70px] hover:bg-zinc-700/50 group ${
                      activeSubAction === item.id ? 'bg-zinc-700/80 ring-1 ring-amber-400/80' : ''
                    }`}
                    title={item.label}
                  >
                    <div className={`mb-1 transition-transform group-hover:scale-110 ${item.iconColor || 'text-zinc-200'}`}>
                      {item.icon}
                    </div>
                    <span className="text-[10px] font-medium text-zinc-200 text-center leading-tight max-w-[85px] line-clamp-2">
                      {item.label}
                    </span>
                    {item.isDropdown && (
                      <ChevronDown size={11} className="text-zinc-400 mt-0.5" />
                    )}
                  </button>

                  {/* Dropdown Menu (e.g. for "Configuraciones" in Ventas as shown in screenshot) */}
                  {item.isDropdown && expandedDropdownId === item.id && item.subItems && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-[#16161d] border border-zinc-700 rounded-xl shadow-2xl p-2 min-w-[320px] grid grid-cols-2 gap-1.5 animate-in fade-in zoom-in-95">
                      <div className="col-span-2 px-2 py-1 text-[10px] font-bold text-amber-400 uppercase tracking-wider border-b border-zinc-800 mb-1 flex items-center justify-between">
                        <span>Configuraciones de {tabLabels[activeTab]}</span>
                        <button onClick={() => setExpandedDropdownId(null)} className="text-zinc-500 hover:text-white">
                          <X size={12} />
                        </button>
                      </div>
                      {item.subItems.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => handleActionClick(sub.id)}
                          className="flex items-center gap-2 p-2 hover:bg-zinc-800 rounded-lg text-left text-xs text-zinc-200 transition-colors border border-transparent hover:border-zinc-700"
                        >
                          <span className="text-amber-400 shrink-0">{sub.icon}</span>
                          <span className="text-[11px] font-medium leading-tight">{sub.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Group Label at Bottom */}
            <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest text-center mt-1 border-t border-zinc-700/40 pt-0.5">
              {group.name}
            </div>
          </div>
        ))}
      </div>

      {/* 4. OPEN SUB-TABS BAR (Exact Sub-tabs strip from Screenshot, e.g., Tablero de Control Ventas x | Avisos Importantes x) */}
      <div className="bg-[#121217] px-3 py-1 flex items-center gap-1.5 overflow-x-auto custom-scrollbar border-b border-zinc-800 text-xs">
        <span className="text-zinc-600 font-mono text-[10px] mr-1 shrink-0">▸▸</span>
        {openSubTabs.map((subTab) => {
          const isActive = activeSubAction === subTab.id;
          return (
            <div
              key={subTab.id}
              onClick={() => handleActionClick(subTab.id)}
              className={`flex items-center gap-2 px-3 py-1 rounded-t-md text-[11px] font-medium cursor-pointer transition-all border-t border-x shrink-0 ${
                isActive
                  ? 'bg-[#0a0a0d] text-white border-zinc-700 font-semibold shadow-sm'
                  : 'bg-zinc-900/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              <span>{subTab.label}</span>
              {onCloseSubTab && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseSubTab(subTab.id);
                  }}
                  className="text-zinc-500 hover:text-red-400 rounded p-0.5 hover:bg-zinc-800 transition-colors"
                  title="Cerrar pestaña"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
};

const tabLabels: Record<AdminTab, string> = {
  administracion: 'Administración',
  inventario: 'Catálogo e Inventario',
  ventas: 'Comercial',
  compras: 'Abastecimiento',
  tesoreria: 'Tesorería',
  contabilidad: 'Contabilidad y Fiscal',
  analitica: 'Analítica y Control',
  operaciones: 'Operaciones',
  rrhh: 'Recursos Humanos',
  matriz_permisos: 'Matriz Permisos',
  aprobaciones: 'Aprobaciones Audit',
  kardex_stock: 'Kárdex Stock',
  cartera: 'Cartera',
  pagos: 'Pagos',
  produccion: 'Producción',
  nomina: 'Nómina',
  activos: 'Activos Fijos',
  tablero: 'Tablero de Control',
  movil: 'POS Móvil',
  soporte: 'Soporte'
};
