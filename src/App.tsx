import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Search, ShoppingCart, Wallet, ArrowRightLeft, AlertCircle, Printer, CheckCircle2, X, Trash2, Plus, Minus, Users, History, Banknote, FileText, CreditCard, UserPlus, User, Lock, Unlock, Settings, Upload, Image as ImageIcon, Camera, Eye, Download, Tag, Scale, DollarSign } from 'lucide-react';
import { validarCedulaEcuador, validarRucEcuador, consultarClienteExterno, createPasswordCredential } from './lib/ecuadorValidador';
import { MainViewMode, AdminTab, Company, SystemUser } from './types';
import { PosPinModal } from './components/PosPinModal';
import { LoginScreen } from './components/LoginScreen';
import { getDefaultAdminSubAction, SUB_ACTION_LABELS } from './adminNavigation';
import { usePosCart, type CartItem, type Product } from './hooks/usePosCart';
import { usePosCashClosing } from './hooks/usePosCashClosing';
import { usePosCustomer } from './hooks/usePosCustomer';

const AdminWorkspace = React.lazy(async () => {
  const module = await import('./components/AdminWorkspace');
  return { default: module.AdminWorkspace };
});

const matrixRoleByUserRole: Record<string, string> = {
  ADMINISTRADOR: 'COMPANY_ADMIN',
  'SUPER USUARIO': 'SUPER_ADMIN',
  SUPERVISOR: 'GERENTE',
  FACTURADOR: 'CAJERO',
  CAJERO: 'CAJERO',
  BODEGA: 'BODEGA',
  CONTADOR: 'CONTADOR'
};

const matrixPermissionByUserPermission: Record<string, string> = {
  pos_access: 'sales.invoices.create',
  pos_discount: 'sales.invoices.edit',
  pos_reimprimir: 'sales.invoices.print',
  pos_anular: 'sales.invoices.annul',
  caja_apertura: 'treasury.cashOpen.create',
  caja_cierre: 'treasury.cashClose.create',
  caja_movimientos: 'treasury.cashMovements.create',
  inv_ver: 'inventory.products.view',
  inv_ingresos: 'inventory.receipts.create',
  inv_egresos: 'inventory.issues.create',
  inv_ajustes: 'inventory.adjustments.create',
  inv_precios: 'inventory.products.edit',
  admin_usuarios: 'admin.users.manage',
  admin_empresas: 'admin.company.configure',
  admin_sri: 'admin.company.configure',
  rep_ventas: 'reports.sales.view',
  rep_utilidades: 'reports.accounting.viewSensitive'
};

const ADMIN_FULL_PERMISSIONS: Record<string, boolean> = {
  pos_access: true,
  pos_discount: true,
  pos_reimprimir: true,
  pos_anular: true,
  caja_apertura: true,
  caja_cierre: true,
  caja_movimientos: true,
  inv_ver: true,
  inv_ingresos: true,
  inv_egresos: true,
  inv_ajustes: true,
  inv_precios: true,
  admin_usuarios: true,
  admin_empresas: true,
  admin_sri: true,
  rep_ventas: true,
  rep_utilidades: true
};

const ADMIN_PERMISSION_BY_ACTION: Record<string, string> = {
  pos: 'pos_access',
  usuarios_roles: 'admin_usuarios',
  matriz_permisos: 'admin_usuarios',
  aprobaciones: 'admin_usuarios',
  auditoria: 'admin_usuarios',
  empresas: 'admin_empresas',
  datos_emisor: 'admin_empresas',
  establecimientos: 'admin_empresas',
  configuracion_empresa: 'admin_empresas',
  firma_p12: 'admin_sri',
  api_sri: 'admin_sri'
};

const hasCompanyPermission = (user: SystemUser, companyId: string, permission: string) => {
  if (!user.active || !user.companyIds?.includes(companyId)) return false;
  const directPermissions = user.permissions;
  const roleId = matrixRoleByUserRole[user.role];
  const matrixPermission = matrixPermissionByUserPermission[permission];

  try {
    const stored = localStorage.getItem(`tendi_role_permissions_${companyId}`);
    const rolePermissions = stored ? JSON.parse(stored) : null;
    if (rolePermissions && roleId && matrixPermission && Array.isArray(rolePermissions[roleId])) {
      return rolePermissions[roleId].includes(matrixPermission);
    }
  } catch {
    // Fall back to the user's saved operational permissions.
  }

  return directPermissions?.[permission] === true;
};

const secureSystemUser = async (user: SystemUser, previousUser?: SystemUser): Promise<SystemUser> => {
  const candidate = { ...user } as SystemUser & { verifyPassword?: string };
  const plainPassword = candidate.password;
  delete candidate.password;
  delete candidate.verifyPassword;
  const passwordCredential = plainPassword ? await createPasswordCredential(plainPassword) : null;
  return {
    ...candidate,
    passwordHash: passwordCredential?.passwordHash || previousUser?.passwordHash || candidate.passwordHash,
    passwordSalt: passwordCredential?.passwordSalt || previousUser?.passwordSalt || candidate.passwordSalt
  };
};

const legacyUnconfiguredRole = String.fromCharCode(83, 73, 78, 32, 83, 73, 78, 67, 82, 79, 78, 73, 90, 65, 82);
const legacyNamespace = String.fromCharCode(115, 105, 115, 116, 101, 109, 97, 112, 101, 114, 115, 101, 111);
const legacyTenantPrefix = String.fromCharCode(80, 69, 82, 83, 69, 79, 45);

export default function PosMarketApp() {
  const [mainViewMode, setMainViewMode] = useState<MainViewMode>('login');
  const [currentUser, setCurrentUser] = useState<string>('SIN CONFIGURAR');
  const [currentUserPin, setCurrentUserPin] = useState<string>('');
  const [activeAdminTab, setActiveAdminTab] = useState<AdminTab>('ventas');
  const [activeSubAction, setActiveSubAction] = useState<string>('listado_ventas');
  const [openSubTabs, setOpenSubTabs] = useState<{ id: string; label: string }[]>([
    { id: 'tablero_ventas', label: 'Tablero de Control Ventas' },
    { id: 'avisos', label: 'Avisos Importantes' },
    { id: 'listado_ventas', label: 'Listado Ventas' }
  ]);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [knownUsers, setKnownUsers] = useState<SystemUser[]>(() => {
    try {
      const storedUsers = localStorage.getItem('tendi_system_users');
      const parsedUsers = storedUsers ? JSON.parse(storedUsers) : [];
      return Array.isArray(parsedUsers)
        ? parsedUsers.map(user => ({
            ...user,
            role: user.role === legacyUnconfiguredRole ? 'SIN CONFIGURAR' : user.role,
            permissions: !user.permissions && (user.role === 'ADMINISTRADOR' || user.role === 'SUPER USUARIO')
              ? { ...ADMIN_FULL_PERMISSIONS }
              : user.permissions
          }))
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('tendi_system_users', JSON.stringify(knownUsers));
  }, [knownUsers]);

  const hasCurrentUserPermission = (permission: string, companyId: string) => {
    const sessionUser = knownUsers.find(user => user.username === currentUser);
    return sessionUser ? hasCompanyPermission(sessionUser, companyId, permission) : false;
  };

  const handleSelectSubAction = (actionId: string) => {
    setActiveSubAction(actionId);
    const label = SUB_ACTION_LABELS[actionId] || actionId.replace('_', ' ').toUpperCase();
    setOpenSubTabs(prev => {
      if (prev.some(t => t.id === actionId)) return prev;
      return [...prev, { id: actionId, label }];
    });
  };

  const handleCloseSubTab = (actionId: string) => {
    setOpenSubTabs(prev => {
      const filtered = prev.filter(t => t.id !== actionId);
      if (activeSubAction === actionId && filtered.length > 0) {
        setActiveSubAction(filtered[filtered.length - 1].id);
      }
      return filtered;
    });
  };

  const handleSelectTab = (tab: AdminTab) => {
    setActiveAdminTab(tab);
    handleSelectSubAction(getDefaultAdminSubAction(tab));
  };

  const fallbackCompanies: Company[] = [
    {
      id: '3',
      name: 'MARCOS CHUNGA',
      tradeName: 'TMCH CAMPOZANO',
      ruc: '1304149329',
      address: '',
      establishment: '',
      emissionPoint: '',
      environment: 'PRUEBAS',
      dbName: 'tenant_3',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-3',
      baseOrigen: 'tenant_3',
      active: true
    },
    {
      id: '5',
      name: 'CHUNGA LOPEZ NASTHAR JULIANA',
      tradeName: 'TMCH ESQUINA',
      ruc: '1314229749001',
      address: '',
      establishment: '',
      emissionPoint: '',
      environment: 'PRUEBAS',
      dbName: 'tenant_5',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-5',
      baseOrigen: 'tenant_5',
      active: true
    },
    {
      id: '6',
      name: 'PARRALES PIN JOSE ARSENIO',
      tradeName: 'TMCH DISTRIBUCIONES',
      ruc: '1315398154001',
      address: '',
      establishment: '',
      emissionPoint: '',
      environment: 'PRUEBAS',
      dbName: 'tenant_6',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-6',
      baseOrigen: 'tenant_6',
      active: true
    }
  ];
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
      const stored = localStorage.getItem('tendi_companies');
      const parsed = stored ? JSON.parse(stored) : fallbackCompanies;
      return Array.isArray(parsed) ? parsed.map(item => ({
        ...item,
        active: item.active !== false,
        systemDb: item.systemDb === legacyNamespace ? 'tendi_system' : (item.systemDb || 'tendi_system'),
        empresaId: typeof item.empresaId === 'string' && item.empresaId.toUpperCase().startsWith(legacyTenantPrefix)
          ? `TENDI-${item.empresaId.substring(legacyTenantPrefix.length)}`
          : (item.empresaId || `TENDI-${item.id}`)
      })) : fallbackCompanies;
    } catch {
      return fallbackCompanies;
    }
  });
  const [activeCompany, setActiveCompany] = useState<Company>(() => {
    const rememberedCompanyId = localStorage.getItem('tendi_active_company_id');
    return companies.find(item => item.id === rememberedCompanyId && item.active !== false)
      || companies.find(item => item.active !== false)
      || fallbackCompanies[0];
  });
  const posUsers = knownUsers.filter(user => hasCompanyPermission(user, activeCompany.id, 'pos_access'));
  const canCurrentUserAccessAction = (actionId: string) => {
    const requiredPermission = ADMIN_PERMISSION_BY_ACTION[actionId];
    return requiredPermission ? hasCurrentUserPermission(requiredPermission, activeCompany.id) : true;
  };

  useEffect(() => {
    localStorage.setItem('tendi_companies', JSON.stringify(companies));
    setActiveCompany(previous => companies.find(item => item.id === previous.id && item.active !== false)
      || companies.find(item => item.active !== false)
      || previous);
  }, [companies]);

  useEffect(() => {
    localStorage.setItem('tendi_active_company_id', activeCompany.id);
  }, [activeCompany.id]);

  const {
    tickets,
    activeTicketId,
    cart,
    total,
    updateActiveCart,
    addTicket,
    removeTicket: removeTicketFromCart,
  } = usePosCart();
  const [search, setSearch] = useState('');
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [lastSaleChange, setLastSaleChange] = useState(0);
  const [lastCashReceived, setLastCashReceived] = useState(0);
  const [isVariosModalOpen, setIsVariosModalOpen] = useState(false);
  const [variosName, setVariosName] = useState('ARTÍCULO VARIOS');
  const [variosPrice, setVariosPrice] = useState('');
  const [isCashModalOpen, setIsCashModalOpen] = useState<'in' | 'out' | null>(null);
  const [isCorteModalOpen, setIsCorteModalOpen] = useState(false);
  const [isSalesHistoryModalOpen, setIsSalesHistoryModalOpen] = useState(false);
  const [salesHistory, setSalesHistory] = useState<any[]>([]);
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    return d.toISOString().split('T')[0];
  });
  const [historyEndDate, setHistoryEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [historyCustomerQuery, setHistoryCustomerQuery] = useState('');
  const [historyDocType, setHistoryDocType] = useState('TODOS');
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'TODOS' }]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryRegError, setCategoryRegError] = useState('');
  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [paymentLines, setPaymentLines] = useState<{ type: string, value: number }[]>([]);
  const {
    movements,
    setMovements,
    dineroInicial,
    setDineroInicial,
    physicalCash,
    setPhysicalCash,
    cierreNotes,
    setCierreNotes,
    showBillCounter,
    setShowBillCounter,
    billCounts,
    setBillCounts,
    calculatedBillTotal,
    turnSalesSummary,
    turnMovementsSummary,
    efectivoEsperado,
  } = usePosCashClosing({ salesHistory });

  const handlePrintCierreReport = () => {
    const counted = parseFloat(physicalCash) || 0;
    const diff = counted - efectivoEsperado;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TENDI - Reporte de Cierre de Caja</title>
          <style>
            body { font-family: monospace; font-size: 12px; margin: 20px; width: 300px; color: #000; }
            .header { text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 3px; text-transform: uppercase; }
            .sub { text-align: center; font-size: 10px; color: #555; margin-bottom: 10px; }
            .line { border-bottom: 1px dashed #000; margin: 8px 0; }
            .flex { display: flex; justify-content: space-between; margin: 4px 0; }
            .bold { font-weight: bold; }
            .center { text-align: center; }
            .title { font-weight: bold; font-size: 11px; margin-top: 6px; text-transform: uppercase; }
            .subitem { font-size: 10px; color: #444; padding-left: 8px; }
            .obs { font-size: 9px; color: #555; padding-left: 8px; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="header">TENDI POS</div>
          <div class="sub">ARQUEO & CIERRE DE TURNO DE CAJA</div>
          <div class="center" style="font-size: 10px;">
            Fecha/Hora: ${new Date().toLocaleString('es-EC')}<br/>
            Cajero: ADMINISTRADOR | Punto: POS 01
          </div>
          <div class="line"></div>
          <div class="title">1. MOVIMIENTO DE EFECTIVO EN CAJA</div>
          <div class="flex"><span>Fondo Inicial:</span> <span>$${(dineroInicial || 0).toFixed(2)}</span></div>
          <div class="flex"><span>Ventas en Efectivo (+):</span> <span>$${turnSalesSummary.efectivo.toFixed(2)}</span></div>
          <div class="flex"><span>Ingresos Manuales (+):</span> <span>$${turnMovementsSummary.ingresos.toFixed(2)}</span></div>
          <div class="flex"><span>Egresos / Compras Efectivo (-):</span> <span>$${turnMovementsSummary.egresos.toFixed(2)}</span></div>
          ${turnMovementsSummary.comprasEfectivo > 0 ? `<div class="flex subitem"><span> - Compras Mercadería:</span> <span>$${turnMovementsSummary.comprasEfectivo.toFixed(2)}</span></div>` : ''}
          ${turnMovementsSummary.egresosVarios > 0 ? `<div class="flex subitem"><span> - Otros Egresos/Retiros:</span> <span>$${turnMovementsSummary.egresosVarios.toFixed(2)}</span></div>` : ''}
          <div class="line"></div>
          <div class="flex bold"><span>EFECTIVO ESPERADO EN CAJA:</span> <span>$${efectivoEsperado.toFixed(2)}</span></div>
          <div class="flex bold"><span>EFECTIVO CONTADO:</span> <span>$${counted.toFixed(2)}</span></div>
          <div class="flex bold"><span>DIFERENCIA:</span> <span>$${diff.toFixed(2)} (${Math.abs(diff) < 0.01 ? 'CUADRADO' : diff < 0 ? 'FALTANTE' : 'SOBRANTE'})</span></div>
          
          ${turnMovementsSummary.egresosList.length > 0 ? `
            <div class="line"></div>
            <div class="title">DETALLE DE EGRESOS Y COMPRAS DE CAJA</div>
            ${turnMovementsSummary.egresosList.map(item => `
              <div style="margin-top:4px;">
                <div class="flex">
                  <span>• ${item.reason}</span>
                  <span class="bold">-$${item.amount.toFixed(2)}</span>
                </div>
                ${item.observation ? `<div class="obs">Nota/Obs: ${item.observation}</div>` : ''}
              </div>
            `).join('')}
          ` : ''}

          <div class="line"></div>
          <div class="title">2. OTRAS FORMAS DE COBRO (BANCO/CRÉDITO)</div>
          <div class="flex"><span>Transferencias / Deuna:</span> <span>$${turnSalesSummary.transferencia.toFixed(2)}</span></div>
          <div class="flex"><span>Tarjetas / Vouchers:</span> <span>$${turnSalesSummary.tarjeta.toFixed(2)}</span></div>
          <div class="flex"><span>Ventas a Crédito:</span> <span>$${turnSalesSummary.credito.toFixed(2)}</span></div>
          <div class="flex bold"><span>TOTAL VENTAS DEL TURNO:</span> <span>$${turnSalesSummary.total.toFixed(2)} (${turnSalesSummary.count} vtas)</span></div>
          ${cierreNotes ? `<div class="line"></div><div><strong>Observaciones del Cierre:</strong> ${cierreNotes}</div>` : ''}
          <div class="line"></div>
          <br/><br/>
          <div class="center">_______________________________<br/>Firma Cajero / Auditor</div>
          <script>window.onload = function() { window.print(); window.close(); }</script>
        </body>
      </html>
    `;
    printWindow.document.write(content);
    printWindow.document.close();
  };
  const {
    customerName,
    setCustomerName,
    customerRuc,
    setCustomerRuc,
    customer,
    setCustomer,
  } = usePosCustomer();
  const customerLookupRequestRef = useRef(0);

  const handleVerifyOrRegisterRuc = async (rucVal: string) => {
    const cleanRuc = (rucVal || '').trim().toUpperCase();
    if (!cleanRuc || cleanRuc === '9999999999999') {
      setCustomerName('CONSUMIDOR FINAL');
      setCustomerRuc('9999999999999');
      searchInputRef.current?.focus();
      return;
    }

    const existing = findExistingCustomer(cleanRuc);
    if (existing) {
      setCustomerName(existing.name);
      setCustomerRuc(existing.ruc);
      searchInputRef.current?.focus();
    } else {
      const lookupRequestId = ++customerLookupRequestRef.current;
      const is13 = /^\d{13}$/.test(cleanRuc);
      const is10 = /^\d{10}$/.test(cleanRuc);
      const idType = is13 ? 'RUC' : is10 ? 'CEDULA' : 'PASAPORTE';
      const custType = is13 ? 'JURIDICA' : 'NATURAL';

      setNewCustomer({
        firstName: '',
        lastName: '',
        companyName: '',
        idType: idType,
        idNumber: cleanRuc,
        phone: '',
        email: '',
        address: '',
        type: custType
      });
      setCustomerRegError('');
      setIsCustomerModalOpen(true);

      if (is10 || is13) {
        try {
          const res = await consultarClienteExterno(cleanRuc);
          if (lookupRequestId !== customerLookupRequestRef.current) return;
          if (res.found && res.data) {
            const fullName = res.data.name || '';
            const nameParts = fullName.split(' ');
            const firstName = nameParts.length > 2 ? nameParts.slice(0, 2).join(' ') : nameParts[0] || '';
            const lastName = nameParts.length > 2 ? nameParts.slice(2).join(' ') : nameParts.slice(1).join(' ') || '';

            setNewCustomer(prev => ({
              ...prev,
              firstName: res.data!.type === 'JURIDICA' ? '' : firstName,
              lastName: res.data!.type === 'JURIDICA' ? '' : lastName,
              companyName: res.data!.type === 'JURIDICA' ? fullName : (res.data!.companyName || ''),
              address: res.data!.address || prev.address || '',
              email: res.data!.email || prev.email || '',
              type: res.data!.type === 'JURIDICA' ? 'JURIDICA' : 'NATURAL'
            }));
            setCustomerName(fullName);
            setCustomerRegError('');
          } else {
            setCustomerRegError(res.error || res.message || 'Complete los datos del cliente manualmente');
          }
        } catch {
          setCustomerRegError('Ingrese los datos del nuevo cliente');
        }
      } else {
        setCustomerRegError('');
      }

      setTimeout(() => {
        if (custType === 'JURIDICA') {
          newCustomerCompanyNameRef.current?.focus();
        } else {
          newCustomerFirstNameRef.current?.focus();
        }
      }, 100);
    }
  };

  const handleOpenCustomerModal = () => {
    const cleanRuc = (customerRuc || '').trim();
    const match = findExistingCustomer(cleanRuc) || customers.find((c: any) => c.name === customerName && customerName !== 'CONSUMIDOR FINAL');

    if (match) {
      populateFromExistingCustomer(match, match.ruc || cleanRuc);
      setCustomerSearch(match.ruc || match.name);
    } else if (cleanRuc && cleanRuc !== '9999999999999') {
      const is13 = cleanRuc.length === 13;
      const is10 = cleanRuc.length === 10;
      setNewCustomer({
        firstName: '',
        lastName: '',
        companyName: customerName !== 'POR REGISTRAR' && customerName !== 'CONSUMIDOR FINAL' ? customerName : '',
        idType: is13 ? 'RUC' : is10 ? 'CEDULA' : 'PASAPORTE',
        idNumber: cleanRuc,
        phone: '',
        email: '',
        address: '',
        type: is13 ? 'JURIDICA' : 'NATURAL'
      });
      setCustomerSearch(cleanRuc);
    } else {
      setNewCustomer({
        firstName: '',
        lastName: '',
        companyName: '',
        idType: 'CEDULA',
        idNumber: '',
        phone: '',
        email: '',
        address: '',
        type: 'NATURAL'
      });
      setCustomerSearch('');
    }

    setCustomerRegError('');
    setIsCustomerModalOpen(true);
  };

  const handleCloseCustomerModal = () => {
    setIsCustomerModalOpen(false);
    setCustomerRegError('');
    if (customerRuc !== '9999999999999' && !customers.some((c: any) => c.ruc === customerRuc)) {
      setCustomerName('CONSUMIDOR FINAL');
      setCustomerRuc('9999999999999');
    }
    setNewCustomer({
      firstName: '',
      lastName: '',
      companyName: '',
      idType: 'CEDULA',
      idNumber: '',
      phone: '',
      email: '',
      address: '',
      type: 'NATURAL'
    });
  };

  const saveAndSelectNewCustomer = () => {
    setCustomerRegError('');
    const custType = newCustomer.type;
    let idNum = (newCustomer.idNumber || '').trim().toUpperCase();
    let email = (newCustomer.email || '').trim();

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setCustomerRegError('El correo ingresado no es válido.');
      newCustomerEmailRef.current?.focus();
      return;
    }

    // 1. Validar Identificación / Documento
    if (!idNum) {
      setCustomerRegError('Debe ingresar un número de RUC, Cédula o Pasaporte.');
      newCustomerIdRef.current?.focus();
      return;
    }

    // Auto-detect document type based on length
    let effectiveIdType = newCustomer.idType;
    if (/^\d{13}$/.test(idNum)) {
      effectiveIdType = 'RUC';
    } else if (/^\d{10}$/.test(idNum)) {
      effectiveIdType = 'CEDULA';
    } else if (effectiveIdType !== 'PASAPORTE') {
      effectiveIdType = 'PASAPORTE';
    }

    // 2. Validar Nombres y Apellidos (o Razón Social)
    let finalName = '';
    if (custType === 'NATURAL') {
      let fName = (newCustomer.firstName || '').trim();
      let lName = (newCustomer.lastName || '').trim();

      if (!fName && !lName) {
        setCustomerRegError('Debe ingresar los nombres o apellidos del cliente.');
        newCustomerFirstNameRef.current?.focus();
        return;
      }

      if (fName && !lName && fName.includes(' ')) {
        const parts = fName.split(' ');
        fName = parts[0];
        lName = parts.slice(1).join(' ');
      }

      finalName = `${fName} ${lName}`.trim().toUpperCase();
    } else {
      const comp = (newCustomer.companyName || '').trim();
      if (!comp) {
        setCustomerRegError('Debe ingresar la RAZÓN SOCIAL / EMPRESA.');
        newCustomerCompanyNameRef.current?.focus();
        return;
      }
      finalName = comp.toUpperCase();
    }

    // Guardar cliente
    const created = {
      name: finalName,
      ruc: idNum,
      phone: (newCustomer.phone || '').trim(),
      email: email,
      address: (newCustomer.address || '').trim().toUpperCase(),
      type: custType,
      idType: effectiveIdType
    };

    setCustomers(prev => {
      const updated = [created, ...prev.filter(c => (c.ruc && created.ruc ? c.ruc !== created.ruc : c.name.toUpperCase() !== created.name))];
      try {
        localStorage.setItem('tendi_customers', JSON.stringify(updated));
      } catch (err) {
        console.error('Error saving to localStorage', err);
      }
      return updated;
    });

    // Enviar al servidor API
    fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(created)
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.customers && Array.isArray(data.customers)) {
          setCustomers(prev => {
            const map = new Map();
            data.customers.forEach((c: any) => {
              const k = (c.ruc || c.name || '').toUpperCase();
              if (k) map.set(k, c);
            });
            prev.forEach((c: any) => {
              const k = (c.ruc || c.name || '').toUpperCase();
              if (k && !map.has(k)) map.set(k, c);
            });
            const merged = Array.from(map.values());
            try { localStorage.setItem('tendi_customers', JSON.stringify(merged)); } catch (e) {}
            return merged;
          });
        }
      })
      .catch(err => console.error('Error guardando cliente en servidor', err));

    setCustomerName(created.name);
    setCustomerRuc(created.ruc);
    setIsCustomerModalOpen(false);
    setCustomerRegError('');
    setCustomerSearch('');
    setNewCustomer({
      firstName: '',
      lastName: '',
      companyName: '',
      idType: 'CEDULA',
      idNumber: '',
      phone: '',
      email: '',
      address: '',
      type: 'NATURAL'
    });
  };
  const [variosData, setVariosData] = useState({ name: '', price: '' });
  const [cashData, setCashData] = useState({ amount: '', reason: '' });
  const [cashReceived, setCashReceived] = useState('');
  const [cajaOperativa, setCajaOperativa] = useState(0);
  const [cajaCentral, setCajaCentral] = useState(0);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCartIndex, setSelectedCartIndex] = useState(-1);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO'>('EFECTIVO');
  const [destinationCaja, setDestinationCaja] = useState<string>('CAJA POS');
  const [sriPaymentForm, setSriPaymentForm] = useState<string>('Sin Utilización Del Sistema Financiero (01)');
  const [transferVoucherImage, setTransferVoucherImage] = useState<string | null>(null);
  const [viewingVoucherImage, setViewingVoucherImage] = useState<string | null>(null);

  useEffect(() => {
    if (paymentMethod === 'TRANSFERENCIA') {
      setDestinationCaja('CUENTA BANCARIA');
      setSriPaymentForm('Otros Con Utilización Del Sistema Financiero (20)');
    } else if (paymentMethod === 'CREDITO') {
      setDestinationCaja('CUENTA POR COBRAR (CRÉDITO CLIENTE)');
      setSriPaymentForm('Otros Con Utilización Del Sistema Financiero (20)');
    } else {
      setDestinationCaja('CAJA POS');
      setSriPaymentForm('Sin Utilización Del Sistema Financiero (01)');
    }
  }, [paymentMethod]);

  const handleVoucherFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert("⚠️ Por favor seleccione un archivo de imagen válido (JPG, PNG, WEBP).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1000;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
          setTransferVoucherImage(compressedBase64);
        } else {
          setTransferVoucherImage(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  // Waitlist / Parked Sales
  const [isWaitlistModalOpen, setIsWaitlistModalOpen] = useState(false);
  const [selectedWaitlistIndex, setSelectedWaitlistIndex] = useState(0);
  const [isParkModalOpen, setIsParkModalOpen] = useState(false);
  const [parkLabel, setParkLabel] = useState('');
  const [waitlist, setWaitlist] = useState<{ id: string; label: string; cart: CartItem[]; customer: string; total: number; timestamp: number }[]>([]);

  // Customer Management
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isAdvancedCustomer, setIsAdvancedCustomer] = useState(false);
  const [customers, setCustomers] = useState<any[]>([
    { name: 'CONSUMIDOR FINAL', ruc: '9999999999999', phone: '', email: '', address: '', type: 'NATURAL', idType: 'CEDULA' }
  ]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    idType: 'CEDULA',
    idNumber: '',
    phone: '',
    email: '',
    address: '',
    type: 'NATURAL' // 'NATURAL' | 'JURIDICA'
  });
  const [customerRegError, setCustomerRegError] = useState('');

  const findExistingCustomer = useCallback((idVal: string) => {
    if (!idVal) return null;
    const clean = idVal.trim().toUpperCase();
    if (!clean || clean === '9999999999999') return null;
    return customers.find((c: any) => {
      if (!c.ruc) return false;
      const r = c.ruc.toString().trim().toUpperCase();
      if (r === clean) return true;
      if (clean.length === 10 && r === clean + '001') return true;
      if (clean.length === 13 && clean.endsWith('001') && r === clean.substring(0, 10)) return true;
      return false;
    }) || null;
  }, [customers]);

  const populateFromExistingCustomer = useCallback((found: any, typedIdNumber?: string) => {
    if (!found) return;
    const isJur = found.type === 'JURIDICA' || (found.ruc && found.ruc.length === 13) || !!found.companyName;
    let fName = found.firstName || '';
    let lName = found.lastName || '';
    let compName = found.companyName || '';

    if (!isJur && !fName && !lName && found.name) {
      const parts = found.name.trim().split(' ');
      if (parts.length >= 2) {
        fName = parts[0];
        lName = parts.slice(1).join(' ');
      } else {
        fName = found.name;
        lName = '';
      }
    } else if (isJur && !compName && found.name) {
      compName = found.name;
    }

    const idVal = typedIdNumber !== undefined ? typedIdNumber : (found.ruc || '');
    const idTypeVal = found.idType || (idVal.length === 13 ? 'RUC' : idVal.length === 10 ? 'CEDULA' : 'PASAPORTE');

    setNewCustomer({
      idNumber: idVal,
      idType: idTypeVal,
      type: isJur ? 'JURIDICA' : 'NATURAL',
      firstName: isJur ? '' : fName,
      lastName: isJur ? '' : lName,
      companyName: isJur ? compName : '',
      email: found.email || '',
      phone: found.phone || '',
      address: found.address || ''
    });
  }, []);

  const matchedCustomerForBanner = useMemo(() => {
    return findExistingCustomer(newCustomer.idNumber);
  }, [newCustomer.idNumber, findExistingCustomer]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalSearchInputRef = useRef<HTMLInputElement>(null);
  const headerRucInputRef = useRef<HTMLInputElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);
  const variosInputRef = useRef<HTMLInputElement>(null);
  const cashAmountRef = useRef<HTMLInputElement>(null);
  const customerSearchInputRef = useRef<HTMLInputElement>(null);
  const newCustomerFirstNameRef = useRef<HTMLInputElement>(null);
  const newCustomerLastNameRef = useRef<HTMLInputElement>(null);
  const newCustomerCompanyNameRef = useRef<HTMLInputElement>(null);
  const newCustomerIdRef = useRef<HTMLInputElement>(null);
  const newCustomerEmailRef = useRef<HTMLInputElement>(null);
  const historySearchInputRef = useRef<HTMLInputElement>(null);
  const parkInputRef = useRef<HTMLInputElement>(null);
  const voucherFileInputRef = useRef<HTMLInputElement>(null);

  // Compras & Proveedores State (SRI Liquidaciones y Registro de Mercado)
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [purchaseDocType, setPurchaseDocType] = useState<'FACTURA_PROVEEDOR' | 'LIQUIDACION_COMPRA_SRI_03'>('FACTURA_PROVEEDOR');
  const [purchaseDocNumber, setPurchaseDocNumber] = useState('');
  const [purchaseAuthNumber, setPurchaseAuthNumber] = useState('');
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'CREDITO_PROVEEDOR'>('EFECTIVO');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseCart, setPurchaseCart] = useState<any[]>([]);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [purchaseItemQty, setPurchaseItemQty] = useState('1');
  const [purchaseItemCost, setPurchaseItemCost] = useState('');
  const [purchaseItemVat, setPurchaseItemVat] = useState<15 | 0>(15);
  const [purchasesHistory, setPurchasesHistory] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ ruc: '', name: '', phone: '', email: '', address: '' });
  const [purchaseActiveTab, setPurchaseActiveTab] = useState<'NUEVA' | 'HISTORIAL'>('NUEVA');
  const [printToast, setPrintToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Venta por Peso / Granel State
  const [weightModalProduct, setWeightModalProduct] = useState<any | null>(null);
  const [weightInputValue, setWeightInputValue] = useState<string>('1.000');
  const [weightMoneyValue, setWeightMoneyValue] = useState<string>('');
  const [weightInputMode, setWeightInputMode] = useState<'weight' | 'money'>('weight');
  const weightInputRef = useRef<HTMLInputElement>(null);
  const weightMoneyInputRef = useRef<HTMLInputElement>(null);

  // Helper function for silent thermal printing without changing browser tab or losing cashier focus
  const printHTMLInIframe = (content: string, notificationMessage?: string) => {
    let iframe = document.getElementById('tendi-silent-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'tendi-silent-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = '0px';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);
    }

    try {
      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(content);
        doc.close();

        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            if (notificationMessage) {
              setPrintToast({ message: notificationMessage, isError: false });
              setTimeout(() => setPrintToast(null), 2200);
            }
          } catch (e) {
            console.error('Silent print error:', e);
            setPrintToast({
              message: "⚠️ Error enviando a la impresora. La venta fue guardada con éxito.",
              isError: true
            });
            setTimeout(() => setPrintToast(null), 4000);
          }
          // Return focus immediately to POS search box
          setTimeout(() => {
            searchInputRef.current?.focus();
          }, 100);
        }, 150);
      }
    } catch (e) {
      console.error('Iframe creation error:', e);
      setPrintToast({
        message: "⚠️ Error de impresión. Utilice el botón TICKET en ventas recientes.",
        isError: true
      });
      setTimeout(() => setPrintToast(null), 4000);
    }
  };

  const searchResultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchResults.length > 0 && searchResultsRef.current) {
      const selectedElement = searchResultsRef.current.children[selectedIndex + 1] as HTMLElement; // +1 because of the header hint
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex, searchResults]);

  const change = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - total);
  }, [cashReceived, total]);

  // Initial data fetch
  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (isPurchaseModalOpen) {
      fetch('/api/products?q=').then(r => r.json()).then(data => {
        if (Array.isArray(data)) setAllProducts(data);
      }).catch(() => {});
    }
  }, [isPurchaseModalOpen]);

  const fetchInitialData = async () => {
    try {
      const [cashRes, salesRes, custRes, supRes, purRes, prodRes] = await Promise.all([
        fetch('/api/cash'),
        fetch('/api/sales'),
        fetch('/api/customers').catch(() => null),
        fetch('/api/suppliers').catch(() => null),
        fetch('/api/purchases').catch(() => null),
        fetch('/api/products?q=').catch(() => null)
      ]);
      const cashData = await cashRes.json();
      const salesData = await salesRes.json();
      
      setCajaOperativa(cashData.cajaOperativa);
      setCajaCentral(cashData.cajaCentral);
      setDineroInicial(cashData.dineroInicial);
      setMovements(cashData.movements || []);
      setSalesHistory(Array.isArray(salesData) ? salesData.sort((a, b) => b.id - a.id) : []);

      if (prodRes && prodRes.ok) {
        try {
          const prods = await prodRes.json();
          if (Array.isArray(prods)) setAllProducts(prods);
        } catch (e) {}
      }

      if (supRes && supRes.ok) {
        try {
          const supData = await supRes.json();
          if (Array.isArray(supData) && supData.length > 0) setSuppliers(supData);
        } catch (e) {}
      }

      if (purRes && purRes.ok) {
        try {
          const purData = await purRes.json();
          if (Array.isArray(purData)) setPurchasesHistory(purData);
        } catch (e) {}
      }

      let serverCusts: any[] = [];
      if (custRes && custRes.ok) {
        try {
          serverCusts = await custRes.json();
        } catch (e) {}
      }

      let localCusts: any[] = [];
      try {
        const localStr = localStorage.getItem('tendi_customers');
        if (localStr) localCusts = JSON.parse(localStr);
      } catch (err) {}

      const discardedSeedCustomers = new Set([
        '1725544332001',
        '0998877665001',
        '1790011223001',
        'JUAN PEREZ',
        'MARIA LOPEZ',
        'CUPER S.A.'
      ]);
      const isDiscardedSeedCustomer = (customer: any) => {
        const ruc = String(customer?.ruc || '').trim().toUpperCase();
        const name = String(customer?.name || '').trim().toUpperCase();
        return discardedSeedCustomers.has(ruc) || discardedSeedCustomers.has(name);
      };

      const map = new Map<string, any>();
      if (Array.isArray(serverCusts)) {
        serverCusts.filter(c => !isDiscardedSeedCustomer(c)).forEach(c => {
          const k = (c.ruc || c.name || '').trim().toUpperCase();
          if (k) map.set(k, c);
        });
      }
      if (Array.isArray(localCusts)) {
        localCusts.filter(c => !isDiscardedSeedCustomer(c)).forEach(c => {
          const k = (c.ruc || c.name || '').trim().toUpperCase();
          if (k) map.set(k, c);
        });
      }

      const merged = Array.from(map.values());
      if (merged.length > 0) {
        setCustomers(merged);
        try {
          localStorage.setItem('tendi_customers', JSON.stringify(merged));
        } catch (e) {}
      }
    } catch (e) {
      console.error("Error fetching initial data", e);
      const local = localStorage.getItem('tendi_customers');
      if (local) {
        try {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const discarded = new Set(['1725544332001', '0998877665001', '1790011223001', 'JUAN PEREZ', 'MARIA LOPEZ', 'CUPER S.A.']);
            setCustomers(parsed.filter((customer: any) => {
              const ruc = String(customer?.ruc || '').trim().toUpperCase();
              const name = String(customer?.name || '').trim().toUpperCase();
              return !discarded.has(ruc) && !discarded.has(name);
            }));
          }
        } catch (err) {}
      }
    }
  };

  // Focus management: Always focus relevant input on open, and return to main product search on close/cancel
  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const isAnyModalOpen = isPayModalOpen || 
    isVariosModalOpen || 
    isCashModalOpen !== null || 
    isCorteModalOpen || 
    isSalesHistoryModalOpen || 
    isDetailModalOpen || 
    isSearchModalOpen || 
    isWaitlistModalOpen || 
    isParkModalOpen || 
    isCustomerModalOpen ||
    weightModalProduct !== null;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isCustomerModalOpen) {
        newCustomerIdRef.current?.focus();
        newCustomerIdRef.current?.select();
      } else if (isPayModalOpen) {
        cashInputRef.current?.focus();
        cashInputRef.current?.select();
      } else if (isVariosModalOpen) {
        variosInputRef.current?.focus();
        variosInputRef.current?.select();
      } else if (isCashModalOpen !== null) {
        cashAmountRef.current?.focus();
        cashAmountRef.current?.select();
      } else if (isSearchModalOpen) {
        modalSearchInputRef.current?.focus();
        modalSearchInputRef.current?.select();
      } else if (isSalesHistoryModalOpen) {
        historySearchInputRef.current?.focus();
        historySearchInputRef.current?.select();
      } else if (isParkModalOpen) {
        parkInputRef.current?.focus();
        parkInputRef.current?.select();
      } else if (!isAnyModalOpen) {
        searchInputRef.current?.focus();
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [
    isCustomerModalOpen, 
    isPayModalOpen, 
    isVariosModalOpen, 
    isCashModalOpen, 
    isSearchModalOpen, 
    isSalesHistoryModalOpen, 
    isParkModalOpen, 
    isWaitlistModalOpen, 
    isCorteModalOpen, 
    isDetailModalOpen,
    isAnyModalOpen
  ]);

  useEffect(() => {
    const handleGlobalClick = (e?: MouseEvent) => {
      if (e && (e.target as HTMLElement).closest('button, input, select, textarea')) return;

      if (isCustomerModalOpen) {
        newCustomerIdRef.current?.focus();
      } else if (isPayModalOpen) {
        cashInputRef.current?.focus();
      } else if (isVariosModalOpen) {
        variosInputRef.current?.focus();
      } else if (isCashModalOpen !== null) {
        cashAmountRef.current?.focus();
      } else if (isSearchModalOpen) {
        modalSearchInputRef.current?.focus();
      } else if (isSalesHistoryModalOpen) {
        historySearchInputRef.current?.focus();
      } else if (isParkModalOpen) {
        parkInputRef.current?.focus();
      } else if (!isAnyModalOpen) {
        searchInputRef.current?.focus();
      }
    };

    document.addEventListener('click', handleGlobalClick);
    return () => {
      document.removeEventListener('click', handleGlobalClick);
    };
  }, [
    isCustomerModalOpen, 
    isPayModalOpen, 
    isVariosModalOpen, 
    isCashModalOpen, 
    isSearchModalOpen, 
    isSalesHistoryModalOpen, 
    isParkModalOpen, 
    isWaitlistModalOpen, 
    isCorteModalOpen, 
    isDetailModalOpen,
    isAnyModalOpen
  ]);

  useEffect(() => {
    setSelectedCartIndex(-1);
  }, [activeTicketId]);

  useEffect(() => {
    if (isWaitlistModalOpen) {
      setSelectedWaitlistIndex(0);
    }
  }, [isWaitlistModalOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prioritize Modal Key Handling - Customer Modal has highest priority
      if (isCustomerModalOpen) {
        if (e.key === 'F3') {
          e.preventDefault();
          newCustomerIdRef.current?.focus();
          newCustomerIdRef.current?.select();
          return;
        } else if (e.key === 'F10') {
          e.preventDefault();
          saveAndSelectNewCustomer();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCloseCustomerModal();
          return;
        }
      }

      if (isPayModalOpen) {
        if (e.key === 'F1') {
          e.preventDefault();
          if (paymentMethod === 'CREDITO') {
            handleFiarSale(true);
          } else {
            handleFinalizeSale(true);
          }
          return;
        } else if (e.key === 'F2') {
          e.preventDefault();
          if (paymentMethod === 'CREDITO') {
            handleFiarSale(false);
          } else {
            handleFinalizeSale(false);
          }
          return;
        } else if (e.key === 'F3') {
          e.preventDefault();
          setIsCustomerModalOpen(true);
          return;
        } else if (e.key === 'F4') {
          e.preventDefault();
          setPaymentMethod('EFECTIVO');
          const rem = Math.max(0, total - totalPaid);
          if (rem > 0 && (parseFloat(cashReceived) === 0 || cashReceived === '' || parseFloat(cashReceived) > rem)) {
            setCashReceived(rem.toFixed(2));
          }
          setTimeout(() => { cashInputRef.current?.focus(); cashInputRef.current?.select(); }, 50);
          return;
        } else if (e.key === 'F5') {
          e.preventDefault();
          setPaymentMethod('TRANSFERENCIA');
          const rem = Math.max(0, total - totalPaid);
          if (rem > 0 && (parseFloat(cashReceived) === 0 || cashReceived === '' || parseFloat(cashReceived) > rem)) {
            setCashReceived(rem.toFixed(2));
          }
          setTimeout(() => { cashInputRef.current?.focus(); cashInputRef.current?.select(); }, 50);
          return;
        } else if (e.key === 'F6') {
          e.preventDefault();
          setPaymentMethod('CREDITO');
          const rem = Math.max(0, total - totalPaid);
          if (rem > 0 && (parseFloat(cashReceived) === 0 || cashReceived === '' || parseFloat(cashReceived) > rem)) {
            setCashReceived(rem.toFixed(2));
          }
          setTimeout(() => { cashInputRef.current?.focus(); cashInputRef.current?.select(); }, 50);
          return;
        } else if (e.key === 'F9') {
          e.preventDefault();
          if (paymentMethod === 'CREDITO') {
            handleFiarSale(false);
          }
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsPayModalOpen(false);
          return;
        }
      }

      if (isParkModalOpen) {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmParkSale();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsParkModalOpen(false);
          setParkLabel('');
          return;
        }
      }

      if (isVariosModalOpen) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddVarios();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsVariosModalOpen(false);
          return;
        }
      }

      if (isCashModalOpen) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleCashMovement();
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsCashModalOpen(null);
          return;
        }
      }

      if (isCorteModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsCorteModalOpen(false);
          return;
        }
      }

      if (isSalesHistoryModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsSalesHistoryModalOpen(false);
          return;
        }
      }

      if (isWaitlistModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsWaitlistModalOpen(false);
          return;
        }
        if (e.key === 'F1') {
          e.preventDefault();
          setSelectedCategory('all');
          setIsWaitlistModalOpen(false);
          return;
        }
        if (e.key === 'F2') {
          e.preventDefault();
          setSelectedCategory('drinks');
          setIsWaitlistModalOpen(false);
          return;
        }
        if (e.key === 'F3') {
          e.preventDefault();
          setSelectedCategory('food');
          setIsWaitlistModalOpen(false);
          return;
        }
        if (e.key === 'F4') {
          e.preventDefault();
          setSelectedCategory('dairy');
          setIsWaitlistModalOpen(false);
          return;
        }
        if (e.key === 'F5') {
          e.preventDefault();
          setSelectedCategory('bakery');
          setIsWaitlistModalOpen(false);
          return;
        }

        if (waitlist.length > 0) {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setSelectedWaitlistIndex(prev => (prev + 1) % waitlist.length);
            return;
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSelectedWaitlistIndex(prev => (prev - 1 + waitlist.length) % waitlist.length);
            return;
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedWaitlistIndex(prev => (prev + 2) < waitlist.length ? prev + 2 : prev);
            return;
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedWaitlistIndex(prev => (prev - 2) >= 0 ? prev - 2 : prev);
            return;
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (waitlist[selectedWaitlistIndex]) {
              handleRestoreSale(waitlist[selectedWaitlistIndex]);
            }
            return;
          }
        }
      }

      if (isSearchModalOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % searchResults.length);
          return;
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
          return;
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            addToCart(searchResults[selectedIndex]);
            setIsSearchModalOpen(false);
          }
          return;
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setIsSearchModalOpen(false);
          setSearch('');
          setSearchResults([]);
          return;
        }
      }

      // Global Shortcuts (Only if no modal is open)
      if (e.key === 'F8') {
        e.preventDefault();
        setIsSalesHistoryModalOpen(true);
        return;
      }

      if (!isAnyModalOpen) {
        if (e.key === 'F12') {
          e.preventDefault();
          if (cart.length > 0) {
            if (total <= 0) {
              alert("❌ No se puede cobrar una venta con total menor o igual a $0.00.");
              return;
            }
            setIsPayModalOpen(true);
            setCashReceived(total.toFixed(2));
          }
        } else if (e.key === 'F10') {
          e.preventDefault();
          setSearch('');
          setSearchResults([]);
          setIsSearchModalOpen(true);
          setTimeout(() => modalSearchInputRef.current?.focus(), 100);
        } else if (e.key === 'Insert') {
          e.preventDefault();
          setIsVariosModalOpen(true);
        } else if (e.key === 'F7') {
          e.preventDefault();
          setIsCashModalOpen('in');
        } else if (e.key === 'F11') {
          e.preventDefault();
          handleOpenCorteModal();
        } else if (e.key === 'F3') {
          e.preventDefault();
          headerRucInputRef.current?.focus();
          headerRucInputRef.current?.select();
        } else if (e.key === 'F6') {
          e.preventDefault();
          handleParkSale();
        } else if (e.key === 'F5') {
          e.preventDefault();
          setIsWaitlistModalOpen(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setSearch('');
          setSearchResults([]);
          setSelectedCartIndex(-1);
        }

        // Search/Cart Navigation
        if (searchResults.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % searchResults.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + searchResults.length) % searchResults.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            addToCart(searchResults[selectedIndex]);
          }
        } else if (e.key === 'Enter' && search.length > 0) {
          e.preventDefault();
          handleFailedScan(search);
        } else if (cart.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedCartIndex(prev => (prev + 1) % cart.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedCartIndex(prev => (prev - 1 + cart.length) % cart.length);
          } else if (e.key === 'Delete' || e.key === 'Del') {
            e.preventDefault();
            const targetIdx = selectedCartIndex >= 0 && selectedCartIndex < cart.length ? selectedCartIndex : cart.length - 1;
            if (targetIdx >= 0) {
              removeItem(targetIdx);
            }
          } else if (e.key === '+') {
            e.preventDefault();
            if (selectedCartIndex >= 0) updateQuantity(selectedCartIndex, 1);
          } else if (e.key === '-') {
            e.preventDefault();
            if (selectedCartIndex >= 0) updateQuantity(selectedCartIndex, -1);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPayModalOpen, isVariosModalOpen, isCashModalOpen, isCorteModalOpen, isSearchModalOpen, isWaitlistModalOpen, waitlist, selectedWaitlistIndex, cart, searchResults, selectedIndex, selectedCartIndex, total, customer, isParkModalOpen, isCustomerModalOpen, saveAndSelectNewCustomer]);

  const playAlertSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;

      // Tono 1: Zumbido grave de error POS (BZZT)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(150, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.14);

      // Tono 2: Segundo zumbido de rechazo/alerta (BZZT)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(120, now + 0.16);
      gain2.gain.setValueAtTime(0.4, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.34);
    } catch (e) {
      console.error(e);
    }
  };

  const playErrorSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.setValueAtTime(110, now + 0.1);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
    } catch {}
  };

  const handleFailedScan = (code: string) => {
    setScanError(true);
    setSearch('');
    setSearchResults([]);
    playErrorSound();
    
    // Auto-open search modal on failed scan
    setTimeout(() => {
      setIsSearchModalOpen(true);
      setTimeout(() => modalSearchInputRef.current?.focus(), 50);
    }, 300);

    setTimeout(() => setScanError(false), 2000);
  };

  const handleSearchChange = async (val: string, fromModal: boolean = false) => {
    setSearch(val);
    if (val.length > 0) {
      try {
        const res = await fetch(`/api/products?q=${val}`);
        const data = await res.json();
        setSearchResults(data);
        setSelectedIndex(0);

        // If exact barcode match and it's the only result, add immediately
        if (data.length === 1 && data[0].code === val) {
          addToCart(data[0]);
          setIsSearchModalOpen(false);
        } else if (data.length > 0 && fromModal) {
          setIsSearchModalOpen(true);
        }
      } catch (e) {
        console.error("Search error", e);
      }
    } else {
      setSearchResults([]);
      if (fromModal) setIsSearchModalOpen(false);
    }
  };

  const removeTicket = (id: number) => {
    if (removeTicketFromCart(id)) setSelectedCartIndex(-1);
  };

  const handleAddVarios = () => {
    const priceNum = parseFloat(variosData.price);
    if (!variosData.name || isNaN(priceNum)) return;
    
    const newItem: CartItem = {
      id: Date.now(),
      name: `[VAR] ${variosData.name.toUpperCase()}`,
      code: 'VAR-000',
      price: priceNum,
      stock: 999,
      quantity: 1
    };
    
    updateActiveCart([...cart, newItem]);
    setIsVariosModalOpen(false);
    setVariosData({ name: '', price: '' });
  };

  const handleCashMovement = async () => {
    if (!hasCurrentUserPermission('caja_movimientos', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para registrar movimientos de caja.');
      return;
    }

    const amount = parseFloat(cashData.amount);
    if (isNaN(amount) || !cashData.reason) return;
    
    try {
      const res = await fetch('/api/cash/movement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: isCashModalOpen, amount, reason: cashData.reason })
      });
      if (res.ok) {
        setIsCashModalOpen(null);
        setCashData({ amount: '', reason: '' });
        fetchInitialData();
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleInitialCash = async (amount: number) => {
    if (!hasCurrentUserPermission('caja_apertura', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para registrar el fondo inicial de caja.');
      return;
    }

    try {
      const res = await fetch('/api/cash/initial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      if (res.ok) {
        fetchInitialData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenCorteModal = () => {
    if (!hasCurrentUserPermission('caja_cierre', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para realizar el cierre de caja.');
      return;
    }

    const hasItemsInCart = tickets.some(t => t.cart.length > 0);
    const hasApartados = waitlist.length > 0;

    if (hasItemsInCart || hasApartados) {
      playAlertSound();
      let msg = "🚫 ACCIÓN NO PERMITIDA: NO SE PUEDE CERRAR CAJA\n\n";
      
      if (hasItemsInCart && hasApartados) {
        msg += "• Hay productos marcados o una venta en proceso en el carrito.\n";
        msg += `• Existen ${waitlist.length} ticket(s) o venta(s) en APARTADOS / EN ESPERA.\n\n`;
        msg += "Por favor, cobre o vacíe el carrito y procese o cancele los apartados antes de realizar el cierre de caja.";
      } else if (hasItemsInCart) {
        msg += "• Hay productos marcados o una venta en proceso en el carrito de venta.\n\n";
        msg += "Por favor, cobre la venta o vacíe el carrito antes de realizar el cierre de caja.";
      } else {
        msg += `• Existen ${waitlist.length} ticket(s) o venta(s) en APARTADOS / EN ESPERA.\n\n`;
        msg += "Por favor, recupere y cobre o cancele los tickets apartados antes de realizar el cierre de caja.";
      }

      alert(msg);
      return;
    }

    setIsCorteModalOpen(true);
  };

  const handleExitPos = () => {
    const hasItemsInCart = tickets.some(t => t.cart.length > 0);
    const hasApartados = waitlist.length > 0;

    if (hasItemsInCart || hasApartados) {
      playAlertSound();
      let msg = "🚫 ACCIÓN NO PERMITIDA: NO SE PUEDE SALIR DEL PUNTO DE VENTA (POS)\n\n";

      if (hasItemsInCart && hasApartados) {
        msg += "• Hay productos marcados o una venta en proceso en el carrito de venta.\n";
        msg += `• Existen ${waitlist.length} ticket(s) en APARTADOS / EN ESPERA.\n\n`;
        msg += "Por favor, cobre o vacíe el carrito y cancele o procese los tickets apartados antes de salir al menú principal.";
      } else if (hasItemsInCart) {
        msg += "• Hay productos marcados en el carrito de venta activa.\n\n";
        msg += "Por favor, cobre la venta o vacíe el carrito antes de salir del POS.";
      } else {
        msg += `• Existen ${waitlist.length} ticket(s) o venta(s) en APARTADOS / EN ESPERA.\n\n`;
        msg += "Por favor, recupere y cobre o cancele los tickets apartados antes de salir del POS.";
      }

      alert(msg);
      return;
    }

    setMainViewMode('admin');
  };

  const handleOpenPosWithPin = () => {
    setIsPinModalOpen(true);
  };

  const handlePinSuccess = (user: SystemUser) => {
    setIsPinModalOpen(false);
    setCurrentUser(user.username);
    setCurrentUserPin(user.pin);
    setMainViewMode('pos');
  };

  const handleCorteDeCaja = async (amountToTransfer: number) => {
    if (!hasCurrentUserPermission('caja_cierre', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para realizar el cierre de caja.');
      return;
    }

    const hasItemsInCart = tickets.some(t => t.cart.length > 0);
    const hasApartados = waitlist.length > 0;

    if (hasItemsInCart || hasApartados) {
      alert("🚫 ATENCIÓN: No se puede cerrar la caja mientras existan productos en el carrito o ventas en apartados.");
      setIsCorteModalOpen(false);
      return;
    }

    try {
      const res = await fetch('/api/cash/corte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountToTransfer })
      });
      if (res.ok) {
        setIsCorteModalOpen(false);
        fetchInitialData();
        alert("Corte realizado con éxito. Dinero transferido a Caja Central.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const addToCart = (product: Product, customQty?: number) => {
    // Check if this product is sold by weight / bulk
    const isWeighted = Boolean(
      product.sellByWeight || 
      (product.saleUnit && ['LB', 'KG', 'LIBRAS', 'KILOS', 'GRANEL', 'PESO'].includes(product.saleUnit.toUpperCase()))
    );

    // If it's a weighted product AND no customQty was explicitly passed, open Weight Modal!
    if (isWeighted && customQty === undefined) {
      const existingInCart = cart.find(item => item.id === product.id);
      const initialWeight = existingInCart ? existingInCart.quantity.toString() : '1.000';
      const initialWeightNum = parseFloat(initialWeight) || 1;
      
      setWeightModalProduct(product);
      setWeightInputValue(initialWeight);
      setWeightMoneyValue((product.price * initialWeightNum).toFixed(2));
      setWeightInputMode('weight');
      
      setTimeout(() => {
        weightInputRef.current?.focus();
        weightInputRef.current?.select();
      }, 80);
      return;
    }

    const qtyToAdd = customQty !== undefined ? customQty : 1;
    const existing = cart.find(item => item.id === product.id);
    const currentQty = existing ? existing.quantity : 0;
    const targetQty = isWeighted ? (customQty !== undefined ? customQty : qtyToAdd) : currentQty + qtyToAdd;

    if (targetQty > product.stock) {
      playAlertSound();
      alert(`¡ERROR: PRODUCTO "${product.name}" SIN STOCK SUFICIENTE! (Stock actual: ${product.stock})`);
      return;
    }

    if (existing) {
      updateActiveCart(cart.map(item => 
        item.id === product.id ? { ...item, quantity: isWeighted && customQty !== undefined ? customQty : item.quantity + qtyToAdd } : item
      ));
    } else {
      updateActiveCart([...cart, { ...product, quantity: targetQty }]);
      setSelectedCartIndex(cart.length);
    }
    setSearch('');
    setSearchResults([]);
    setIsSearchModalOpen(false);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleConfirmWeight = () => {
    if (!weightModalProduct) return;

    let finalQty = 0;
    const unitPrice = weightModalProduct.price || 0;

    if (weightInputMode === 'weight') {
      finalQty = parseFloat(weightInputValue) || 0;
    } else {
      const moneyVal = parseFloat(weightMoneyValue) || 0;
      if (unitPrice > 0) {
        finalQty = moneyVal / unitPrice;
      }
    }

    if (finalQty <= 0) {
      alert("⚠️ Ingrese un peso o valor en dinero superior a cero.");
      return;
    }

    // Round to 3 decimal places
    finalQty = Math.round(finalQty * 1000) / 1000;

    addToCart(weightModalProduct, finalQty);
    setWeightModalProduct(null);
  };

  const handleEditCartItemQuantity = (index: number) => {
    const item = cart[index];
    if (!item) return;

    const isWeighted = Boolean(
      item.sellByWeight || 
      (item.saleUnit && ['LB', 'KG', 'LIBRAS', 'KILOS', 'GRANEL', 'PESO'].includes(item.saleUnit.toUpperCase()))
    );

    if (isWeighted) {
      setWeightModalProduct(item);
      setWeightInputValue(item.quantity.toString());
      setWeightMoneyValue((item.price * item.quantity).toFixed(2));
      setWeightInputMode('weight');
      setTimeout(() => {
        weightInputRef.current?.focus();
        weightInputRef.current?.select();
      }, 80);
    }
  };

  const updateQuantity = (index: number, delta: number) => {
    const newCart = [...cart];
    const item = newCart[index];
    if (!item) return;

    const isWeighted = Boolean(
      item.sellByWeight || 
      (item.saleUnit && ['LB', 'KG', 'LIBRAS', 'KILOS', 'GRANEL', 'PESO'].includes(item.saleUnit.toUpperCase()))
    );

    if (isWeighted) {
      handleEditCartItemQuantity(index);
      return;
    }

    const newQty = item.quantity + delta;
    
    if (delta > 0 && newQty > item.stock) {
      playAlertSound();
      alert(`¡ERROR: PRODUCTO "${item.name}" SIN STOCK SUFICIENTE!`);
      return;
    }

    if (newQty <= 0) {
      newCart.splice(index, 1);
      if (selectedCartIndex >= newCart.length) {
        setSelectedCartIndex(newCart.length - 1);
      }
    } else {
      newCart[index].quantity = newQty;
    }
    updateActiveCart(newCart);
  };

  const removeItem = (index: number) => {
    if (index < 0 || index >= cart.length) return;
    const newCart = [...cart];
    newCart.splice(index, 1);
    updateActiveCart(newCart);
    if (selectedCartIndex >= newCart.length) {
      setSelectedCartIndex(Math.max(-1, newCart.length - 1));
    }
  };

  const registerCustomerIfNew = (custName: string, custRuc: string) => {
    const cleanName = (custName || '').trim().toUpperCase();
    const cleanRuc = (custRuc || '').trim().toUpperCase();
    if (!cleanName || cleanName === 'CONSUMIDOR FINAL' || cleanName === 'POR REGISTRAR') return;
    if (!cleanRuc || cleanRuc === '9999999999999') return;

    const autoCust = {
      name: cleanName,
      ruc: cleanRuc,
      phone: '',
      email: '',
      address: '',
      type: cleanRuc.length === 13 ? 'JURIDICA' : 'NATURAL',
      idType: cleanRuc.length === 13 ? 'RUC' : cleanRuc.length === 10 ? 'CEDULA' : 'PASAPORTE'
    };

    setCustomers(prev => {
      if (!prev.some(c => (c.ruc && c.ruc === cleanRuc) || c.name.toUpperCase() === cleanName)) {
        const updated = [autoCust, ...prev];
        try { localStorage.setItem('tendi_customers', JSON.stringify(updated)); } catch (e) {}
        return updated;
      }
      return prev;
    });

    fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(autoCust)
    }).catch(() => {});
  };

  const handlePrintPurchaseReceipt = (purchase: any, forceNewTab: boolean = false) => {
    const isLiquidacion = purchase.docType === 'LIQUIDACION_COMPRA_SRI_03';
    const docTitle = isLiquidacion ? 'LIQUIDACIÓN DE COMPRA DE BIENES Y PRESTACIÓN DE SERVICIOS (SRI TIPO 03)' : 'COMPROBANTE DE REGISTRO DE COMPRA DE MERCADERÍA';

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TENDI - ${docTitle}</title>
          <style>
            body { font-family: monospace, sans-serif; font-size: 11px; margin: 20px; color: #000; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #000; }
            .header { text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 2px; text-transform: uppercase; }
            .sub { text-align: center; font-size: 10px; color: #333; margin-bottom: 12px; font-weight: bold; }
            .box { border: 1px solid #000; padding: 8px; margin-bottom: 10px; }
            .row { display: flex; justify-content: space-between; margin: 3px 0; }
            .bold { font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #000; padding: 5px; text-align: left; }
            th { background: #eee; font-size: 10px; text-transform: uppercase; }
            .right { text-align: right; }
            .center { text-align: center; }
            .totales { width: 240px; margin-left: auto; margin-top: 10px; }
            .line { border-bottom: 1px dashed #000; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="header">TENDI POS ECUADOR</div>
          <div class="sub">${docTitle}</div>

          <div class="box">
            <div class="row"><span><strong>Código Interno:</strong> ${purchase.purchaseCode || '-'}</span> <span><strong>Nº Documento:</strong> ${purchase.documentNumber}</span></div>
            <div class="row"><span><strong>Fecha Emisión:</strong> ${new Date(purchase.timestamp || Date.now()).toLocaleString('es-EC')}</span> <span><strong>Forma Pago:</strong> ${purchase.paymentMethod}</span></div>
            <div class="line"></div>
            <div class="row"><span><strong>Proveedor:</strong> ${purchase.supplier?.name}</span></div>
            <div class="row"><span><strong>RUC / Cédula:</strong> ${purchase.supplier?.ruc}</span> <span><strong>Teléfono:</strong> ${purchase.supplier?.phone || '-'}</span></div>
            <div class="row"><span><strong>Dirección:</strong> ${purchase.supplier?.address || 'ECUADOR'}</span></div>
            ${purchase.authorizationNumber ? `<div class="row"><span><strong>Autorización SRI:</strong> ${purchase.authorizationNumber}</span></div>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th class="right">Cant</th>
                <th class="right">P.Costo</th>
                <th class="right">IVA</th>
                <th class="right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${(purchase.items || []).map((it: any) => `
                <tr>
                  <td>${it.code || '-'}</td>
                  <td>${it.name}</td>
                  <td class="right">${it.quantity}</td>
                  <td class="right">$${Number(it.costPrice).toFixed(2)}</td>
                  <td class="right">${it.vatRate}%</td>
                  <td class="right">$${(it.costPrice * it.quantity).toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totales">
            <div class="row"><span>Subtotal Tarifa 15%:</span> <span>$${(purchase.subtotal15 || 0).toFixed(2)}</span></div>
            <div class="row"><span>Subtotal Tarifa 0%:</span> <span>$${(purchase.subtotal0 || 0).toFixed(2)}</span></div>
            <div class="row"><span>IVA 15%:</span> <span>$${(purchase.vatAmount || 0).toFixed(2)}</span></div>
            <div class="row bold" style="font-size: 13px; border-top: 1px solid #000; padding-top: 4px;"><span>TOTAL COMPRA:</span> <span>$${(purchase.total || 0).toFixed(2)}</span></div>
          </div>

          ${purchase.notes ? `<div style="margin-top: 10px; font-size: 10px;"><strong>Observaciones:</strong> ${purchase.notes}</div>` : ''}

          <br/><br/>
          <div class="row" style="margin-top: 30px;">
            <div class="center" style="width: 45%;">___________________________<br/>Responsable de Recepción<br/>TENDI POS</div>
            <div class="center" style="width: 45%;">___________________________<br/>Firma / Entrega Proveedor<br/>${purchase.supplier?.name}</div>
          </div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    if (forceNewTab) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(content);
        printWindow.document.close();
      }
    } else {
      printHTMLInIframe(content, "📄 Registro de compra enviado a impresora.");
    }
  };

  const handlePrintSalesTicket = (sale: any, forceNewTab: boolean = false) => {
    const items = sale.items || [];
    const totalAmount = typeof sale.total === 'number' ? sale.total : 0;
    
    // Calculate 15% VAT and 0% VAT breakdowns
    let subtotal15 = 0;
    let subtotal0 = 0;

    items.forEach((it: any) => {
      const price = typeof it.price === 'number' ? it.price : 0;
      const qty = typeof it.quantity === 'number' ? it.quantity : 1;
      const vatRate = it.vatRate !== undefined ? it.vatRate : 15;
      const itemSub = price * qty;

      if (vatRate === 15) {
        subtotal15 += itemSub / 1.15;
      } else {
        subtotal0 += itemSub;
      }
    });

    if (subtotal15 === 0 && subtotal0 === 0 && totalAmount > 0) {
      subtotal15 = totalAmount / 1.15;
    }

    const vat15 = subtotal15 * 0.15;
    const subtotalTotal = subtotal15 + subtotal0;
    
    const formattedDate = sale.timestamp ? new Date(sale.timestamp).toLocaleString('es-EC') : new Date().toLocaleString('es-EC');
    const secuencial = sale.secuencial || `001-001-${String(sale.id || Date.now()).slice(-9).padStart(9, '0')}`;
    const claveAcceso = sale.claveAcceso || '';
    const clienteNombre = sale.customer || 'CONSUMIDOR FINAL';
    const cashRec = typeof sale.cashReceived === 'number' ? sale.cashReceived : (sale.received || totalAmount);
    const cambio = typeof sale.change === 'number' ? sale.change : Math.max(0, cashRec - totalAmount);

    const content = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>TENDI POS - Ticket de Venta #${secuencial}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: 80mm auto;
              margin: 0;
            }
            body {
              font-family: 'Courier New', Courier, monospace, sans-serif;
              font-size: 11px;
              line-height: 1.25;
              color: #000;
              background: #fff;
              width: 270px;
              margin: 0 auto;
              padding: 12px 6px;
            }
            .center { text-align: center; }
            .right { text-align: right; }
            .bold { font-weight: bold; }
            .title { font-size: 16px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; letter-spacing: -0.5px; }
            .slogan { font-size: 10px; font-style: italic; margin-bottom: 6px; }
            .divider { border-bottom: 1px dashed #000; margin: 8px 0; }
            .double-divider { border-bottom: 2px solid #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 2px 0; }
            .item-row { margin: 4px 0; }
            .item-title { font-weight: bold; text-transform: uppercase; }
            .item-calc { font-size: 10px; color: #111; padding-left: 8px; }
            .totales-box { margin-top: 6px; font-size: 11px; }
            .total-grand { font-size: 14px; font-weight: 900; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 6px 0; }
            .badge-sri { border: 1px solid #000; padding: 3px; text-align: center; font-size: 9px; font-weight: bold; margin: 8px 0; text-transform: uppercase; }
            .clave-box { font-size: 8px; word-break: break-all; text-align: center; margin: 4px 0; font-family: monospace; }
            .footer-msg { font-size: 10px; text-align: center; margin-top: 12px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="title">TENDI POS</div>
            <div class="slogan">"Tu negocio, bajo control"</div>
            <div class="bold">RUC: 1792998877001</div>
            <div>MATRIZ: AV. AMAZONAS Y NNUU, QUITO</div>
            <div>TELÉFONO: (02) 299-8800</div>
            <div>OBLIGADO A LLEVAR CONTABILIDAD: NO</div>
          </div>

          <div class="divider"></div>

          <div class="center bold" style="font-size: 12px;">FACTURA ELECTRÓNICA</div>
          <div class="center bold" style="font-size: 11px;">Nº: ${secuencial}</div>

          <div class="badge-sri">
            AMBIENTE: PRODUCCIÓN / EMISIÓN: NORMAL<br/>
            AUTORIZADO POR EL SRI
          </div>

          <div class="divider"></div>

          <div>
            <div class="row"><span><strong>FECHA:</strong></span> <span>${formattedDate}</span></div>
            <div class="row"><span><strong>CLIENTE:</strong></span> <span class="bold" style="text-align: right; max-width: 170px; word-break: break-word;">${clienteNombre}</span></div>
            <div class="row"><span><strong>FORMA PAGO:</strong></span> <span>${sale.paymentMethod || 'EFECTIVO'}</span></div>
          </div>

          <div class="double-divider"></div>

          <div class="row bold" style="font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 2px;">
            <span>CANT / DESCRIPCIÓN</span>
            <span>TOTAL</span>
          </div>

          ${items.map((it: any) => `
            <div class="item-row">
              <div class="row">
                <span class="item-title">${it.name || 'PRODUCTO'}</span>
                <span class="bold">$${((it.price || 0) * (it.quantity || 1)).toFixed(2)}</span>
              </div>
              <div class="item-calc">
                ${it.quantity || 1} x $${(it.price || 0).toFixed(2)} ${it.vatRate === 0 ? '(0% IVA)' : '(15% IVA)'}
              </div>
            </div>
          `).join('')}

          <div class="double-divider"></div>

          <div class="totales-box">
            <div class="row"><span>SUBTOTAL 15%:</span> <span>$${subtotal15.toFixed(2)}</span></div>
            <div class="row"><span>SUBTOTAL 0%:</span> <span>$${subtotal0.toFixed(2)}</span></div>
            <div class="row"><span>SUBTOTAL SIN IMPUESTOS:</span> <span>$${subtotalTotal.toFixed(2)}</span></div>
            <div class="row"><span>IVA 15%:</span> <span>$${vat15.toFixed(2)}</span></div>
            <div class="row"><span>DESCUENTO:</span> <span>$0.00</span></div>
            
            <div class="row total-grand">
              <span>TOTAL A PAGAR:</span>
              <span>$${totalAmount.toFixed(2)}</span>
            </div>

            ${cashRec > 0 ? `
              <div class="row"><span>EFECTIVO RECIBIDO:</span> <span>$${cashRec.toFixed(2)}</span></div>
              <div class="row bold"><span>CAMBIO ENTREGADO:</span> <span>$${cambio.toFixed(2)}</span></div>
            ` : ''}
          </div>

          <div class="divider"></div>

          <div class="center" style="font-size: 8px;">CLAVE DE ACCESO / AUTORIZACIÓN SRI:</div>
          <div class="clave-box">${claveAcceso}</div>

          <div class="footer-msg">
            ¡GRACIAS POR SU COMPRA!<br/>
            Conserve su ticket para reclamos o cambios.<br/>
            www.tendi.ec
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    if (forceNewTab) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(content);
        printWindow.document.close();
      }
    } else {
      printHTMLInIframe(content, "Ticket de venta enviado a impresora (80mm)");
    }
  };

  const handleOpenCashDrawer = () => {
    const drawerPulseHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Apertura de Gaveta TENDI</title>
          <style>
            @page { size: 80mm 2mm; margin: 0; }
            body { margin: 0; padding: 0; background: #ffffff; }
          </style>
        </head>
        <body>
          <script>
            window.onload = function() {
              try {
                window.focus();
                window.print();
              } catch(e) {}
            };
          </script>
        </body>
      </html>
    `;
    printHTMLInIframe(drawerPulseHTML, "🔓 Gaveta de dinero abierta");
  };

  const handleSavePurchase = async () => {
    if (purchaseCart.length === 0) {
      alert("❌ Debe agregar al menos un producto al comprobante de compra.");
      return;
    }
    if (!selectedSupplier || !selectedSupplier.name || !selectedSupplier.ruc) {
      alert("❌ Debe seleccionar o registrar un proveedor con RUC/Cédula válido.");
      return;
    }

    const subtotal15 = purchaseCart.reduce((acc, item) => item.vatRate === 15 ? acc + (item.costPrice * item.quantity) : acc, 0);
    const subtotal0 = purchaseCart.reduce((acc, item) => item.vatRate === 0 ? acc + (item.costPrice * item.quantity) : acc, 0);
    const vatAmount = subtotal15 * 0.15;
    const totalPurchase = subtotal15 + subtotal0 + vatAmount;

    const payload = {
      supplier: selectedSupplier,
      docType: purchaseDocType,
      documentNumber: purchaseDocNumber,
      authorizationNumber: purchaseAuthNumber || `AUT-${Date.now()}`,
      items: purchaseCart,
      subtotal15,
      subtotal0,
      vatAmount,
      total: totalPurchase,
      paymentMethod: purchasePaymentMethod,
      notes: purchaseNotes
    };

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`❌ Error: ${data.error || 'No se pudo registrar la compra.'}`);
        return;
      }

      if (data.cajaOperativa !== undefined) {
        setCajaOperativa(data.cajaOperativa);
      }

      // Refresh product list, purchases history and cash movements
      const [purRes, prodRes, cashRes] = await Promise.all([
        fetch('/api/purchases').catch(() => null),
        fetch('/api/products?q=').catch(() => null),
        fetch('/api/cash').catch(() => null)
      ]);

      if (cashRes && cashRes.ok) {
        const cashData = await cashRes.json();
        if (cashData.movements) setMovements(cashData.movements);
        if (cashData.cajaOperativa !== undefined) setCajaOperativa(cashData.cajaOperativa);
      }

      if (purRes && purRes.ok) {
        const history = await purRes.json();
        setPurchasesHistory(history);
      }

      alert(`✅ Comprobante de Compra / Liquidación registrado con éxito (#${data.purchase.purchaseCode}). Se ha incrementado el stock en inventario.`);
      
      // Auto Print receipt
      handlePrintPurchaseReceipt(data.purchase);

      // Reset
      setPurchaseCart([]);
      setPurchaseNotes('');
      setIsPurchaseModalOpen(false);
    } catch (err) {
      alert("❌ Error de comunicación con el servidor.");
    }
  };

  const handleCreateSupplier = async () => {
    if (!newSupplier.name || !newSupplier.ruc) {
      alert("❌ Nombre y RUC del proveedor son obligatorios.");
      return;
    }
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier)
      });
      const data = await res.json();
      if (res.ok && data.suppliers) {
        setSuppliers(data.suppliers);
        const created = data.suppliers.find((s: any) => s.ruc === newSupplier.ruc.toUpperCase()) || data.suppliers[0];
        if (created) setSelectedSupplier(created);
        setIsSupplierModalOpen(false);
        setNewSupplier({ ruc: '', name: '', phone: '', email: '', address: '' });
      } else {
        alert(`❌ Error: ${data.error || 'No se pudo guardar el proveedor.'}`);
      }
    } catch (e) {
      alert("❌ Error de red al registrar el proveedor.");
    }
  };

  const handleFinalizeSale = async (print: boolean) => {
    if (!hasCurrentUserPermission('pos_access', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para facturar desde el POS.');
      return;
    }

    if (cart.length === 0) {
      alert("⚠️ El carrito de compras está vacío.");
      return;
    }

    registerCustomerIfNew(customerName, customerRuc);

    if (total <= 0) {
      alert("❌ No se puede cobrar una venta con total menor o igual a $0.00.");
      return;
    }

    const isConsumidorFinal = !customerRuc || customerRuc === '9999999999999' || customerName.toUpperCase().includes('CONSUMIDOR FINAL');

    if (paymentMethod === 'TRANSFERENCIA' && isConsumidorFinal) {
      alert("❌ CLIENTE REQUERIDO PARA TRANSFERENCIA:\n\nPara ventas cobradas por TRANSFERENCIA BANCARIA es obligatorio seleccionar o registrar un cliente identificado (con Cédula/RUC y Nombre) para respaldos y comprobación del pago.");
      setIsCustomerModalOpen(true);
      return;
    }

    if (paymentMethod === 'CREDITO') {
      await handleFiarSale();
      return;
    }

    // Optimistic update: clear cart immediately to eliminate lag
    const currentCart = [...cart];
    const currentTotal = total;
    const valInput = parseFloat(cashReceived) || 0;
    let currentPaymentLines = [...paymentLines];

    const totalInLines = currentPaymentLines.reduce((acc, curr) => acc + curr.value, 0);
    if (valInput > 0 && totalInLines < total) {
      currentPaymentLines.push({ type: paymentMethod, value: valInput });
    }

    if (currentPaymentLines.length === 0) {
      const defaultVal = valInput > 0 ? valInput : total;
      currentPaymentLines = [{ type: paymentMethod, value: defaultVal }];
    }

    const currentTotalPaid = currentPaymentLines.reduce((acc, curr) => acc + curr.value, 0);
    const currentReceived = currentTotalPaid;
    const currentChange = Math.max(0, currentTotalPaid - currentTotal);
    const currentVoucherImage = transferVoucherImage;

    setLastSaleChange(currentChange);
    setLastCashReceived(currentReceived);
    updateActiveCart([]);
    setIsPayModalOpen(false);
    setPaymentLines([]);
    setTransferVoucherImage(null);
    setCashReceived('');
    setCustomer('CONSUMIDOR FINAL 9999999999999');
    
    // Focus search immediately for next sale
    setTimeout(() => searchInputRef.current?.focus(), 50);

    let effectivePaymentMethod = paymentMethod;
    if (currentPaymentLines.length > 0) {
      const types = Array.from(new Set(currentPaymentLines.map(l => l.type)));
      if (types.length > 1) {
        effectivePaymentMethod = `MIXTO (${types.join(' + ')})`;
      } else if (types.length === 1) {
        effectivePaymentMethod = types[0];
      }
    }

    try {
      // Update local sales count for dynamic sorting
      // Sort but keep all products to allow category filtering
      setTopSellers(prev => {
        let updatedList = [...prev];
        currentCart.forEach(item => {
          const index = updatedList.findIndex(p => p.id === item.id);
          if (index !== -1) {
            updatedList[index] = { ...updatedList[index], salesCount: (updatedList[index].salesCount || 0) + item.quantity };
          } else {
            updatedList.push({ ...item, salesCount: item.quantity });
          }
        });
        return updatedList.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
      });

      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: currentCart, 
          total: currentTotal, 
          customer,
          paymentMethod: effectivePaymentMethod,
          destinationCaja,
          sriPaymentForm,
          paymentLines: currentPaymentLines,
          transferVoucherImage: currentVoucherImage
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setCajaOperativa(data.cajaOperativa);
        setSalesHistory(prev => [data.sale, ...prev]);
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      alert("Error al procesar la venta");
    }

    if (print) {
      handlePrintSalesTicket({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        customer,
        items: currentCart,
        total: currentTotal,
        paymentMethod: effectivePaymentMethod,
        cashReceived: currentReceived,
        change: currentChange,
        sriPaymentForm
      });
    } else {
      handleOpenCashDrawer();
    }
  };

  const handleFiarSale = async (printTicket: boolean = false) => {
    if (!hasCurrentUserPermission('pos_access', activeCompany.id)) {
      alert('El usuario actual no tiene permiso para registrar ventas a crédito.');
      return;
    }

    if (cart.length === 0) {
      alert("⚠️ El carrito de compras está vacío.");
      return;
    }

    registerCustomerIfNew(customerName, customerRuc);

    if (total <= 0) {
      alert("❌ No se puede registrar un crédito para una venta con total menor o igual a $0.00.");
      return;
    }

    const isConsumidorFinal = !customerRuc || customerRuc === '9999999999999' || customerName.toUpperCase().includes('CONSUMIDOR FINAL');
    if (isConsumidorFinal) {
      alert("❌ NO PERMITIDO: No se puede otorgar crédito a 'CONSUMIDOR FINAL'.\n\nDebe seleccionar o registrar un cliente identificado (con Cédula/RUC y Nombre) para otorgar crédito.");
      setIsCustomerModalOpen(true);
      return;
    }

    const currentCart = [...cart];
    const currentTotal = total;
    const currentCustomer = customer;
    const currentVoucherImage = transferVoucherImage;

    try {
      const res = await fetch('/api/credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: currentCart, total: currentTotal, customer: currentCustomer, transferVoucherImage: currentVoucherImage })
      });
      
      if (res.ok) {
        updateActiveCart([]);
        setIsPayModalOpen(false);
        setPaymentLines([]);
        setTransferVoucherImage(null);
        setCashReceived('');
        setCustomer('CONSUMIDOR FINAL 9999999999999');

        if (printTicket) {
          handlePrintSalesTicket({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            customer: currentCustomer,
            items: currentCart,
            total: currentTotal,
            paymentMethod: 'CREDITO / FIADO',
            cashReceived: 0,
            change: 0,
            sriPaymentForm
          });
        } else {
          setPrintToast({ message: `✅ Crédito registrado ($${currentTotal.toFixed(2)}) para ${currentCustomer.split(' ')[0]}`, isError: false });
          setTimeout(() => setPrintToast(null), 2800);
        }

        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else {
        const data = await res.json();
        alert(`Error al registrar el crédito: ${data.error || 'Error desconocido'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Error de conexión al procesar la venta a crédito.");
    }
  };

  const handleParkSale = () => {
    if (cart.length === 0) {
      // If empty, just reset UI to ensure a 'fresh' start
      setCustomer('CONSUMIDOR FINAL 9999999999999');
      setSearch('');
      setSearchResults([]);
      setTimeout(() => searchInputRef.current?.focus(), 50);
      return;
    }
    // If has items, open the custom modal to ask for a label
    setParkLabel('');
    setIsParkModalOpen(true);
  };

  const confirmParkSale = () => {
    const label = parkLabel.trim() || `TICKET ${new Date().toLocaleTimeString()}`;
    
    const parkedSale = {
      id: Date.now().toString(),
      label: label.toUpperCase(),
      cart: [...cart],
      customer,
      total,
      timestamp: Date.now()
    };

    setWaitlist(prev => [parkedSale, ...prev]);
    updateActiveCart([]);
    setCustomer('CONSUMIDOR FINAL 9999999999999');
    setSearch('');
    setSearchResults([]);
    setIsParkModalOpen(false);
    setParkLabel('');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleRestoreSale = (parked: any) => {
    if (cart.length > 0) {
      if (!confirm("El carrito actual no está vacío. ¿Deseas reemplazarlo con el ticket en espera?")) return;
    }
    updateActiveCart(parked.cart);
    setCustomer(parked.customer);
    setWaitlist(prev => prev.filter(p => p.id !== parked.id));
    setIsWaitlistModalOpen(false);
  };

  const handleClearCart = () => {
    updateActiveCart([]);
    setCustomer('CONSUMIDOR FINAL 9999999999999');
    setSearch('');
    setSearchResults([]);
    setSelectedCartIndex(-1);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const [topSellers, setTopSellers] = useState<any[]>([]);

  const filteredTopSellers = useMemo(() => {
    if (selectedCategory === 'all') return topSellers;
    return topSellers.filter(p => p.category === selectedCategory);
  }, [topSellers, selectedCategory]);

  const handleOpenSaleDetail = (sale: any) => {
    setSelectedSale({ ...sale, items: [...sale.items] }); // Clone to avoid direct mutation
    setIsDetailModalOpen(true);
    setIsEditMode(false);
  };

  const handleUpdateSale = async () => {
    if (!selectedSale) return;
    
    // Recalculate total
    const newTotal = selectedSale.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
    const updatedSale = { ...selectedSale, total: newTotal };

    try {
      // We could add an API endpoint for this, but for now we update local state
      setSalesHistory(prev => prev.map(s => s.id === updatedSale.id ? updatedSale : s));
      setIsDetailModalOpen(false);
      alert("Venta actualizada correctamente");
    } catch (e) {
      alert("Error al actualizar la venta");
    }
  };

  const updateDetailQuantity = (index: number, delta: number) => {
    if (!selectedSale) return;
    const newItems = [...selectedSale.items];
    const newQty = Math.max(0, newItems[index].quantity + delta);
    
    if (newQty === 0) {
      newItems.splice(index, 1);
    } else {
      newItems[index] = { ...newItems[index], quantity: newQty };
    }
    
    setSelectedSale({ ...selectedSale, items: newItems });
  };

  const addPaymentLine = () => {
    const val = parseFloat(cashReceived) || 0;
    if (val <= 0) return;
    const newLines = [...paymentLines, { type: paymentMethod, value: val }];
    setPaymentLines(newLines);
    
    const newTotalPaid = newLines.reduce((acc, curr) => acc + curr.value, 0);
    const remaining = Math.max(0, total - newTotalPaid);
    if (remaining > 0) {
      setCashReceived(remaining.toFixed(2));
    } else {
      setCashReceived('0.00');
    }

    setTimeout(() => {
      cashInputRef.current?.focus();
      cashInputRef.current?.select();
    }, 50);
  };

  const removePaymentLine = (index: number) => {
    const newLines = paymentLines.filter((_, i) => i !== index);
    setPaymentLines(newLines);

    const newTotalPaid = newLines.reduce((acc, curr) => acc + curr.value, 0);
    const remaining = Math.max(0, total - newTotalPaid);
    setCashReceived(remaining > 0 ? remaining.toFixed(2) : total.toFixed(2));

    setTimeout(() => {
      cashInputRef.current?.focus();
      cashInputRef.current?.select();
    }, 50);
  };

  const totalPaid = useMemo(() => paymentLines.reduce((acc, curr) => acc + curr.value, 0), [paymentLines]);
  
  // Real-time calculations including current input
  const liveReceivedAmount = useMemo(() => {
    return totalPaid + (parseFloat(cashReceived) || 0);
  }, [totalPaid, cashReceived]);

  const liveRemaining = Math.max(0, total - liveReceivedAmount);
  const liveChange = liveReceivedAmount > total ? liveReceivedAmount - total : 0;

  const remainingToPay = Math.max(0, total - totalPaid);
  const changeDue = Math.max(0, totalPaid - total);

  const handleAddCategory = () => {
    const cleanName = newCategoryName.trim().toUpperCase();
    if (!cleanName) {
      setCategoryRegError('Ingrese un nombre para la categoría.');
      return;
    }
    if (categories.some(c => c.name.toUpperCase() === cleanName)) {
      setCategoryRegError('Esta categoría ya existe.');
      return;
    }
    const newCat = {
      id: 'cat_' + Date.now(),
      name: cleanName
    };
    const updated = [...categories, newCat];
    setCategories(updated);
    try {
      localStorage.setItem('tendi_categories', JSON.stringify(updated));
    } catch (e) {}
    setSelectedCategory(newCat.id);
    setNewCategoryName('');
    setCategoryRegError('');
    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategory = (catId: string) => {
    if (catId === 'all') return;
    const updated = categories.filter(c => c.id !== catId);
    setCategories(updated);
    try {
      localStorage.setItem('tendi_categories', JSON.stringify(updated));
    } catch (e) {}
    if (selectedCategory === catId) {
      setSelectedCategory('all');
    }
  };

  const filteredSalesHistory = useMemo(() => {
    return salesHistory.filter(sale => {
      if (!sale.timestamp) return true;
      const saleDate = sale.timestamp.split('T')[0];
      if (historyStartDate && saleDate < historyStartDate) return false;
      if (historyEndDate && saleDate > historyEndDate) return false;
      if (historyCustomerQuery.trim()) {
        const query = historyCustomerQuery.toUpperCase().trim();
        const customerName = (sale.customer || '').toUpperCase();
        if (!customerName.includes(query)) return false;
      }
      return true;
    });
  }, [salesHistory, historyStartDate, historyEndDate, historyCustomerQuery]);

  if (mainViewMode === 'login' || mainViewMode === 'company_select') {
    return (
      <LoginScreen
        companies={companies}
        users={knownUsers}
        onCreateInitialAdmin={async (user) => {
          const securedUser = await secureSystemUser(user);
          setKnownUsers(previous => [...previous, securedUser]);
        }}
        onSelectCompanyAndLogin={(company, user) => {
          setActiveCompany(company);
          setCurrentUser(user.username);
          setCurrentUserPin(user.pin);
          setMainViewMode('admin');
        }}
      />
    );
  }

  if (mainViewMode === 'admin') {
    return (
      <React.Suspense fallback={<div className="h-screen bg-[#09090b]" />}>
        <AdminWorkspace
          navbarProps={{
            companies: companies.filter(company => (
              company.active !== false &&
              knownUsers.find(user => user.username === currentUser)?.companyIds?.includes(company.id)
            )),
            activeCompany,
            onSelectCompany: setActiveCompany,
            activeTab: activeAdminTab,
            onSelectTab: handleSelectTab,
            onOpenPos: handleOpenPosWithPin,
            currentUser: currentUserPin ? currentUser : 'SIN CONFIGURAR',
            canAccessAction: canCurrentUserAccessAction,
            activeSubAction,
            onSelectSubAction: handleSelectSubAction,
            openSubTabs,
            onCloseSubTab: handleCloseSubTab,
            onLogout: () => {
              setCurrentUser('SIN CONFIGURAR');
              setCurrentUserPin('');
              setMainViewMode('login');
            },
          }}
          adminModulesProps={{
            activeTab: activeAdminTab,
            activeSubAction,
            onSelectSubAction: handleSelectSubAction,
            company: activeCompany,
            companies,
            users: knownUsers,
            currentUser: knownUsers.find(user => user.username === currentUser),
            canAccessAction: canCurrentUserAccessAction,
            onSaveUser: async (user) => {
              const previousUser = knownUsers.find(item => item.id === user.id);
              const securedUser = await secureSystemUser(user, previousUser);
              setKnownUsers(prev => {
                const exists = prev.some(item => item.id === securedUser.id);
                return exists
                  ? prev.map(item => item.id === securedUser.id ? securedUser : item)
                  : [...prev, securedUser];
              });
            },
            onDeleteUser: (id) => {
              const targetUser = knownUsers.find(user => user.id === id);
              if (!targetUser) return;
              if (targetUser.username === currentUser) {
                alert('No puede desactivar el usuario de la sesión actual.');
                return;
              }
              const isAdministrator = targetUser.role === 'ADMINISTRADOR' || targetUser.role === 'SUPER USUARIO';
              const remainingAdministrators = knownUsers.filter(user => (
                user.active && user.id !== id &&
                (user.role === 'ADMINISTRADOR' || user.role === 'SUPER USUARIO') &&
                user.companyIds?.includes(activeCompany.id)
              ));
              if (isAdministrator && targetUser.companyIds?.includes(activeCompany.id) && remainingAdministrators.length === 0) {
                alert('No puede desactivar el último administrador activo de esta empresa.');
                return;
              }
              setKnownUsers(prev => prev.map(user => (
                user.id === id ? { ...user, active: false } : user
              )));
            },
            onSaveCompany: (company) => {
              const savedCompany: Company = {
                id: company.id,
                name: company.name,
                tradeName: company.tradeName || company.name,
                ruc: company.ruc,
                address: company.address || '',
                establishment: company.establishment || '',
                emissionPoint: company.emissionPoint || '',
                environment: company.environment || 'PRUEBAS',
                dbName: company.dbName || '',
                systemDb: company.systemDb || 'tendi_system',
                empresaId: company.empresaId || `TENDI-${company.id}`,
                baseOrigen: company.baseOrigen || company.dbName || '',
                active: company.active !== false
              };
              setCompanies(previous => previous.some(item => item.id === savedCompany.id)
                ? previous.map(item => item.id === savedCompany.id ? savedCompany : item)
                : [...previous, savedCompany]);
              setActiveCompany(savedCompany);
            },
            onDeleteCompany: (id) => {
              setCompanies(previous => previous.map(item => item.id === id ? { ...item, active: false } : item));
            },
            onSelectCompany: setActiveCompany,
            salesHistory,
            products: allProducts,
            categories,
            onSaveProduct: (newP) => {
              setAllProducts(prev => {
                const idx = prev.findIndex(p => p.id === newP.id);
                if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = newP;
                  return copy;
                }
                return [...prev, newP];
              });
            },
            onDeleteProduct: (id) => setAllProducts(prev => prev.filter(p => p.id !== id)),
            onRefreshSales: fetchInitialData,
          }}
          pinModalProps={{
            isOpen: isPinModalOpen,
            onClose: () => setIsPinModalOpen(false),
            onSuccess: handlePinSuccess,
            users: posUsers,
          }}
        />
      </React.Suspense>
    );
  }

  return (
    <div className="h-screen bg-[#09090b] text-white font-sans flex flex-col overflow-hidden">
      {/* Shortcut Bar - Premium Refined Style */}
      <div className="bg-[#0c0c0e] border-b border-zinc-800/80 px-4 py-2.5 flex gap-2.5 overflow-x-auto items-center custom-scrollbar">
        <div className="flex flex-col mr-6 border-r border-zinc-800 pr-6 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#00ff41] font-display font-black text-sm tracking-[0.25em] uppercase">TENDI</span>
            <span className="text-[9px] font-mono font-bold text-zinc-400 bg-zinc-900/80 border border-zinc-800 px-1.5 py-0.5 rounded tracking-wider uppercase">POS v1.0</span>
          </div>
          <span className="text-zinc-500 font-sans font-bold text-[8px] tracking-[0.15em] uppercase leading-none mt-1">Tu negocio, bajo control</span>
        </div>
        
        {/* Customer Selector Component - Ergonomic POS Design */}
        <div className="flex items-center gap-3 bg-[#121216] hover:bg-[#16161c] border border-zinc-800 hover:border-zinc-700/80 focus-within:border-[#00ff41]/60 focus-within:ring-1 focus-within:ring-[#00ff41]/30 rounded-xl px-3 py-1.5 transition-all shrink-0 shadow-sm">
          {/* F3 Trigger Badge */}
          <button 
            type="button"
            onClick={() => {
              headerRucInputRef.current?.focus();
              headerRucInputRef.current?.select();
            }}
            className="flex items-center gap-1.5 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/25 px-2 py-1 rounded-lg transition-all active:scale-95 group/f3"
            title="Ir a RUC / Cédula (F3)"
          >
            <span className="font-mono font-black text-[10px] tracking-wider">F3</span>
            <Users size={13} className="group-hover/f3:scale-110 transition-transform text-[#00ff41]" />
          </button>

          {/* Informative Customer Name & Direct Editable Doc Box */}
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col justify-center">
              <span className="text-[8px] font-display font-black text-zinc-500 uppercase tracking-widest leading-none mb-1">
                CLIENTE
              </span>
              {/* Informative Customer Name */}
              <span className="font-display font-black text-xs uppercase tracking-tight text-white max-w-[160px] truncate" title={customerName}>
                {customerRuc !== '9999999999999' && !customers.some((c: any) => c.ruc === customerRuc) ? 'POR REGISTRAR' : customerName}
              </span>
            </div>

            {/* Direct Editable RUC / Cédula / Document Input Box */}
            <div className="flex flex-col justify-center">
              <span className="text-[7px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-0.5 text-center">
                RUC / CÉDULA
              </span>
              <input 
                ref={headerRucInputRef}
                type="text"
                value={customerRuc}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  customerLookupRequestRef.current += 1;
                  setCustomerRuc(val);
                  const clean = val.trim();
                  if (!clean || clean === '9999999999999') {
                    setCustomerName('CONSUMIDOR FINAL');
                  } else {
                    const match = customers.find((c: any) => c.ruc === clean);
                    if (match) {
                      setCustomerName(match.name);
                    } else {
                      setCustomerName('POR REGISTRAR');
                    }
                  }
                }}
                onFocus={(e) => e.target.select()}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleVerifyOrRegisterRuc(customerRuc);
                  }
                }}
                onBlur={() => {
                  const clean = customerRuc.trim();
                  if (clean && clean !== '9999999999999' && !customers.some((c: any) => c.ruc === clean)) {
                    handleVerifyOrRegisterRuc(customerRuc);
                  }
                }}
                className="bg-[#0a0a0d] hover:bg-zinc-900 focus:bg-zinc-950 border border-zinc-700/80 focus:border-[#00ff41] text-[#00ff41] font-mono font-bold text-xs px-2.5 py-0.5 rounded-lg outline-none w-[135px] text-center tracking-wider transition-all focus:ring-1 focus:ring-[#00ff41]/40 shadow-inner cursor-pointer focus:cursor-text"
                placeholder="9999999999999"
                title="Ingresa RUC o Cédula. Presiona F3 para enfocar directamente este campo."
              />
            </div>
          </div>

          {/* Search / Modal Button */}
          <button 
            type="button"
            onClick={handleOpenCustomerModal}
            className="bg-zinc-900/80 hover:bg-[#00ff41]/10 text-zinc-400 hover:text-[#00ff41] border border-zinc-800 hover:border-[#00ff41]/30 p-1.5 rounded-lg transition-all shrink-0 ml-0.5"
            title="Buscar / Registrar Cliente Avanzado"
          >
            <Search size={13} />
          </button>
        </div>

        <button 
          onClick={() => setIsCashModalOpen('in')} 
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-zinc-800 transition-all group shrink-0"
        >
          <span className="font-mono text-[#00ff41] bg-[#00ff41]/10 px-1.5 py-0.5 rounded text-[9px] group-hover:scale-105 transition-transform">F7</span> 
          <span className="text-zinc-300 font-display font-semibold">ENTRADAS</span>
        </button>

        <button 
          onClick={() => setIsCashModalOpen('out')} 
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-zinc-800 transition-all group shrink-0"
        >
          <span className="font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded text-[9px]">CAJA</span>
          <span className="text-zinc-300 font-display font-semibold">EGRESO/TRANSF.</span>
        </button>

        <button 
          onClick={() => setIsSearchModalOpen(true)} 
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-zinc-800 transition-all group shrink-0"
        >
          <span className="font-mono text-[#00ff41] bg-[#00ff41]/10 px-1.5 py-0.5 rounded text-[9px] group-hover:scale-105 transition-transform">F10</span> 
          <span className="text-zinc-300 font-display font-semibold">BUSCAR</span>
        </button>

        <button 
          onClick={() => setIsWaitlistModalOpen(true)} 
          className="relative px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 active:scale-95 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-zinc-800 transition-all group shrink-0"
          title="Ver Tickets Apartados / En Espera (F5)"
        >
          <span className="font-mono text-[#00ff41] bg-[#00ff41]/10 px-1.5 py-0.5 rounded text-[9px] group-hover:scale-105 transition-transform">F5</span> 
          <span className="text-zinc-300 font-display font-semibold">APARTADOS</span>
          {waitlist.length > 0 && (
            <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-amber-500 text-black font-mono font-black text-[10px] shadow-[0_0_12px_rgba(245,158,11,0.7)] animate-pulse border border-amber-300">
              {waitlist.length}
            </span>
          )}
        </button>

        <button 
          onClick={handleOpenCorteModal}
          className="px-3.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 active:scale-95 rounded-lg text-[10px] font-bold flex items-center gap-2 border border-emerald-500/30 text-emerald-300 transition-all group shrink-0"
          title="Cierre / Corte de Caja (F11)"
        >
          <span className="font-mono text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded text-[9px] group-hover:scale-105 transition-transform">F11</span> 
          <Lock size={12} className="text-emerald-400" />
          <span className="uppercase tracking-wider font-display font-semibold">CERRAR CAJA</span>
        </button>

        {/* Exit POS Button - Discreet X icon */}
        <button 
          onClick={handleExitPos}
          className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800/80 active:scale-95 rounded-lg transition-all shrink-0 ml-auto"
          title="Salir del POS e ir al menú principal"
        >
          <X size={16} />
        </button>


      </div>
 
      <div className={`bg-[#0f0f12] border-b border-zinc-800/80 ${scanError ? 'border-red-500 bg-red-500/5' : ''} p-3.5 shadow-lg relative z-20 transition-all duration-300`}>
        <div className="max-w-full mx-auto flex items-center gap-3.5">
          <div className={`${scanError ? 'bg-red-500 text-white' : 'bg-[#00ff41] text-black'} p-2 rounded-lg shadow-[0_0_15px_rgba(0,255,65,0.15)] transition-colors`}>
            <Search className="w-5 h-5" />
          </div>
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value, false)}
              onFocus={(e) => e.target.select()}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              placeholder="ESCANEÉ O DIGITE CÓDIGO DE BARRAS..."
              className={`w-full bg-transparent ${scanError ? 'text-red-500' : 'text-[#00ff41]'} text-2xl font-display font-black outline-none placeholder:text-zinc-700 uppercase tracking-tight transition-colors`}
              autoFocus
            />
          </div>
          <button 
            onClick={() => {
              if (cart.length > 0) {
                if (total <= 0) {
                  alert("❌ No se puede cobrar una venta con total menor o igual a $0.00.");
                  return;
                }
                setCashReceived(total.toFixed(2));
                setIsPayModalOpen(true);
              }
            }}
            disabled={cart.length === 0 || total <= 0}
            className={`px-7 py-2.5 rounded-xl font-display font-black text-base hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md flex items-center gap-2 whitespace-nowrap ${
              cart.length > 0 && total > 0
                ? 'bg-[#00ff41] text-black hover:bg-[#00e139] shadow-[#00ff41]/10 cursor-pointer' 
                : 'bg-zinc-800/50 text-zinc-600 border border-zinc-800 cursor-not-allowed shadow-none'
            }`}
          >
            <Banknote size={18} />
            COBRAR <span className="font-mono text-xs opacity-80 bg-black/10 px-1.5 py-0.5 rounded">F12</span>
          </button>
        </div>
        <AnimatePresence>
          {scanError && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-0 right-0 top-full bg-red-600 text-white text-center py-2.5 font-sans font-black text-[10px] uppercase tracking-[0.2em] z-10 shadow-2xl border-b border-red-500"
            >
              Código no encontrado. Abriendo búsqueda avanzada...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Advanced Search Modal */}
      <AnimatePresence>
        {isSearchModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-[#111] border-2 border-[#00ff41] rounded-[2rem] w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-[0_0_100px_rgba(0,255,65,0.1)]"
            >
              <div className="p-6 border-b border-white/5 bg-[#1a1a1a] flex items-center gap-4">
                <Search className="text-[#00ff41] w-8 h-8" />
                <input
                  ref={modalSearchInputRef}
                  type="text"
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value, true)}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  placeholder="BUSCAR PRODUCTO..."
                  className="flex-1 bg-transparent text-[#00ff41] text-4xl font-black outline-none uppercase"
                />
                <button 
                  onClick={() => setIsSearchModalOpen(false)}
                  className="text-gray-500 hover:text-white transition-colors"
                >
                  <X size={32} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar" ref={searchResultsRef}>
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#1a1a1a] z-10">
                    <tr className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5">
                      <th className="p-3">Código</th>
                      <th className="p-3">Descripción</th>
                      <th className="p-3 text-right">Precio</th>
                      <th className="p-3 text-right">Existencia</th>
                      <th className="p-3 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchResults.map((p, idx) => (
                      <tr
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className={`cursor-pointer transition-all ${idx === selectedIndex ? 'bg-[#00ff41] text-black' : 'hover:bg-white/5 text-gray-300'}`}
                      >
                        <td className="p-3 font-sans font-bold">{p.code}</td>
                        <td className="p-3 font-black uppercase text-lg">{p.name}</td>
                        <td className="p-3 text-right font-sans font-black text-xl">${p.price.toFixed(2)}</td>
                        <td className="p-3 text-right font-sans font-black text-xl">{p.stock}</td>
                        <td className="p-3 text-right">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${p.stock > 0 ? (idx === selectedIndex ? 'bg-black/20' : 'bg-green-500/10 text-green-500') : 'bg-red-500 text-white'}`}>
                            {p.stock > 0 ? 'Disponible' : 'Sin Stock'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {searchResults.length === 0 && (
                  <div className="p-20 text-center text-gray-600 uppercase font-black tracking-widest">
                    No se encontraron productos
                  </div>
                )}
              </div>
              <div className="p-4 bg-[#0a0a0a] border-t border-white/5 text-center text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">
                ↑ ↓ Navegar • Enter Seleccionar • Esc Cerrar
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        {/* Cart Main Area - Compact Layout */}
        <div className="flex-[2.5] min-w-0 p-3 overflow-y-auto custom-scrollbar bg-gradient-to-br from-[#0a0a0a] to-[#0f0f0f]">
          <div className="max-w-full mx-auto">
            <div className="sticky top-0 z-30 bg-[#0a0a0a] h-[32px] flex items-center border-b border-white/5">
              <div className="flex items-center justify-between w-full px-4">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="text-[#00ff41] w-3.5 h-3.5" />
                  <div className="flex flex-col">
                    <h2 className="text-[10px] font-black uppercase tracking-tighter leading-none">Venta Actual</h2>
                    <span className="text-[6px] text-gray-600 font-black uppercase tracking-widest">Minimarket TMCH</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-[#111] px-1.5 py-0.5 rounded border border-white/5">
                  <span className="text-[10px] font-sans font-black text-[#00ff41]">{cart.length}</span>
                  <span className="text-[6px] text-gray-600 font-black uppercase tracking-widest">Items</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0b0b0d] rounded-xl border border-zinc-800/80 shadow-2xl mt-2 overflow-hidden">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-wider">
                    <th className="p-3 pl-4 bg-[#121216] border-b border-zinc-800/80">Código</th>
                    <th className="p-3 bg-[#121216] border-b border-zinc-800/80">Descripción del Producto</th>
                    <th className="p-3 text-right bg-[#121216] border-b border-zinc-800/80">Precio Venta</th>
                    <th className="p-3 text-center bg-[#121216] border-b border-zinc-800/80">Cant.</th>
                    <th className="p-3 text-right bg-[#121216] border-b border-zinc-800/80">Importe</th>
                    <th className="p-3 text-right bg-[#121216] border-b border-zinc-800/80">Stock</th>
                    <th className="p-3 text-center pr-4 bg-[#121216] border-b border-zinc-800/80">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item, idx) => (
                    <tr
                      key={`${item.id}-${idx}`}
                      onClick={() => setSelectedCartIndex(idx)}
                      className={`group transition-all cursor-pointer border-b border-zinc-900/40 ${
                        idx === selectedCartIndex 
                          ? 'bg-blue-950/40 text-[#60a5fa] border-l-4 border-l-[#00ff41]' 
                          : 'hover:bg-white/[0.02] text-zinc-300'
                      }`}
                    >
                      <td className="p-3 pl-4 font-mono font-medium text-xs text-zinc-400">{item.code}</td>
                      <td className="p-3 font-display font-semibold uppercase tracking-tight text-sm text-white group-hover:text-[#00ff41] transition-colors flex items-center gap-1.5">
                        <span>{item.name}</span>
                        {(item.sellByWeight || (item.saleUnit && ['LB', 'KG', 'LIBRAS', 'KILOS', 'GRANEL', 'PESO'].includes(item.saleUnit.toUpperCase()))) && (
                          <span className="text-[9px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded uppercase shrink-0">
                            PESO/GRANEL
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-sm text-zinc-300">${item.price.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800/80">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); updateQuantity(idx, -1); }}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95"
                            title="Disminuir / Modificar Peso"
                          >
                            <Minus size={11} />
                          </button>
                          <span 
                            onClick={(e) => { e.stopPropagation(); handleEditCartItemQuantity(idx); }}
                            className={`px-1.5 py-0.5 rounded font-mono font-black text-xs cursor-pointer hover:underline ${
                              item.sellByWeight ? 'text-amber-300 bg-amber-500/20 px-2' : idx === selectedCartIndex ? 'text-blue-300' : 'text-zinc-200'
                            }`}
                            title="Haz clic para modificar peso / monto"
                          >
                            {item.sellByWeight ? `${item.quantity.toFixed(3)} ${item.saleUnit || 'LB'}` : item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); updateQuantity(idx, 1); }}
                            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all active:scale-95"
                            title="Aumentar / Modificar Peso"
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                      </td>
                      <td className={`p-3 text-right font-mono font-black text-base ${idx === selectedCartIndex ? 'text-[#00ff41]' : 'text-[#00ff41]/90'}`}>
                        ${(item.price * item.quantity).toFixed(2)}
                      </td>
                      <td className="p-3 text-right font-mono text-xs text-zinc-500 font-semibold">
                        {item.stock}
                      </td>
                      <td className="p-3 text-center pr-4">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeItem(idx); }}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20 transition-all active:scale-95"
                          title="Eliminar producto de esta venta"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {cart.length === 0 && (
                <div className="p-20 text-center">
                  <div className="bg-[#111] w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/5 shadow-inner">
                    <ShoppingCart size={40} className="text-gray-800" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-700 uppercase tracking-tighter">Carrito Vacío</h3>
                  <p className="text-gray-800 text-xs font-bold uppercase tracking-widest mt-2">Escanea productos para comenzar</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar - Quick Access - Optimized Grid */}
        <div className="flex-1 min-w-0 bg-[#0a0a0a] border-l border-zinc-800/80 p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center gap-2 text-[#00ff41]">
                  <div 
                    onClick={() => setIsCategoryModalOpen(true)}
                    className="w-6 h-6 rounded bg-[#00ff41]/10 flex items-center justify-center cursor-pointer hover:bg-[#00ff41]/20 transition-all group/cat"
                    title="Elegir Categoría de Productos Registrada"
                  >
                    <Tag size={13} className="text-[#00ff41] group-hover/cat:scale-110 transition-transform" />
                  </div>
                  <h3 className="text-[10px] font-display font-bold uppercase tracking-wider text-zinc-400">
                    {categories.find(c => c.id === selectedCategory)?.name || 'Catálogo de Productos'}
                  </h3>
                </div>
                
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3 py-1 rounded-lg text-[9px] font-display font-bold uppercase tracking-wider transition-all whitespace-nowrap shadow-sm border ${
                        selectedCategory === cat.id 
                          ? 'bg-[#00ff41] text-black border-[#00ff41]/50 font-black' 
                          : 'bg-[#121214] text-zinc-400 border-zinc-800 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredTopSellers.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => addToCart(p)}
                  className="group relative bg-[#0c0c0e] rounded-xl overflow-hidden border border-zinc-800/80 hover:border-[#00ff41]/50 transition-all aspect-square shadow-md cursor-pointer"
                >
                  <img 
                    src={p.image} 
                    alt={p.name} 
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-90 group-hover:scale-110 transition-all duration-700 pointer-events-none z-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex flex-col justify-end p-3 text-left pointer-events-none z-10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-mono font-bold text-[#00ff41] leading-none drop-shadow-md">${p.price.toFixed(2)}</span>
                      {(p.sellByWeight || (p.saleUnit && ['LB', 'KG', 'LIBRAS', 'KILOS', 'GRANEL', 'PESO'].includes(p.saleUnit.toUpperCase()))) && (
                        <span className="text-[8px] font-mono font-bold text-amber-300 bg-amber-500/20 border border-amber-500/40 px-1 py-0.5 rounded tracking-wider">
                          {p.saleUnit || 'PESO'}
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] font-display font-bold uppercase leading-tight tracking-tight text-white group-hover:text-[#00ff41] truncate drop-shadow-md">{p.name}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </div>
 
      {/* Footer / Info - Premium Finish */}
      <div className="bg-[#0c0c0e] border-t border-zinc-800/80 sticky bottom-0 z-40 flex h-20 min-w-0 overflow-hidden">
        {/* Action Buttons Area */}
        <div className="flex-1 min-w-0 flex items-center justify-between p-2 sm:p-3 gap-2 sm:gap-4 overflow-hidden">
          {/* Scrollable Buttons + Badges area */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto custom-scrollbar shrink min-w-0 py-1">
            <button 
              onClick={() => setIsSalesHistoryModalOpen(true)}
              className="flex flex-col items-center justify-center bg-[#121215] hover:bg-amber-500/15 border border-zinc-800/80 hover:border-amber-500/30 w-16 sm:w-20 py-1.5 rounded-lg transition-all group active:scale-95 shrink-0"
              title="Historial de Últimas Ventas (F8)"
            >
              <History className="text-amber-400 group-hover:scale-110 transition-transform mb-1" size={16} />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-mono font-bold text-amber-400">F8</span>
                <span className="text-[7px] font-display font-semibold text-amber-200/80 uppercase tracking-wider">Últ. Ventas</span>
              </div>
            </button>

            <button 
              onClick={() => setIsWaitlistModalOpen(true)}
              className="relative flex flex-col items-center justify-center bg-[#121215] hover:bg-zinc-800/80 border border-zinc-800/80 w-16 sm:w-20 py-1.5 rounded-lg transition-all group active:scale-95 shrink-0"
              title="Ver o Recuperar Tickets Apartados (F5)"
            >
              {waitlist.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-amber-500 text-black font-mono font-black text-[10px] shadow-[0_0_12px_rgba(245,158,11,0.8)] border border-amber-300 animate-pulse z-10">
                  {waitlist.length}
                </span>
              )}
              <ArrowRightLeft className="text-[#00ff41] group-hover:rotate-180 duration-500 transition-transform mb-1" size={16} />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-mono font-bold text-zinc-300">F5</span>
                <span className="text-[7px] font-display font-semibold text-zinc-400 uppercase tracking-wider">Apartados</span>
              </div>
            </button>
 
            <button 
              onClick={handleParkSale}
              className="flex flex-col items-center justify-center bg-[#121215] hover:bg-zinc-800/80 border border-zinc-800/80 w-16 sm:w-20 py-1.5 rounded-lg transition-all group active:scale-95 shrink-0"
              title="Apartar Ticket Actual (F6)"
            >
              <Plus className="text-[#00ff41] group-hover:scale-125 transition-transform mb-1" size={16} />
              <div className="flex flex-col items-center">
                <span className="text-[9px] font-mono font-bold text-zinc-300">F6</span>
                <span className="text-[7px] font-display font-semibold text-zinc-400 uppercase tracking-wider">Apartar</span>
              </div>
            </button>
 
            <button 
              onClick={() => {
                if (cart.length === 0) return;
                const targetIdx = selectedCartIndex >= 0 && selectedCartIndex < cart.length ? selectedCartIndex : cart.length - 1;
                removeItem(targetIdx);
              }}
              className="flex flex-col items-center justify-center bg-red-950/10 hover:bg-red-900/20 border border-red-900/25 w-16 sm:w-20 py-1.5 rounded-lg transition-all group active:scale-95 shrink-0"
              title="Borrar artículo seleccionado o el último (Tecla Suprimir / SUPR)"
            >
              <Trash2 className="text-red-500 group-hover:scale-110 transition-transform mb-1" size={16} />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[9px] font-mono font-bold text-red-400 mb-0.5">SUPR</span>
                <span className="text-[7px] font-display font-bold text-red-400/90 uppercase tracking-wider">Borrar Art.</span>
              </div>
            </button>

            <button 
              onClick={handleClearCart}
              className="flex flex-col items-center justify-center bg-red-950/20 hover:bg-red-900/30 border border-red-900/40 w-16 sm:w-20 py-1.5 rounded-lg transition-all group active:scale-95 shrink-0"
              title="Limpiar todo el ticket (Tecla ESC)"
            >
              <X className="text-red-400 group-hover:scale-110 transition-transform mb-1" size={16} />
              <div className="flex flex-col items-center leading-none">
                <span className="text-[9px] font-mono font-bold text-red-400 mb-0.5">ESC</span>
                <span className="text-[7px] font-display font-bold text-red-400/90 uppercase tracking-wider">Limpiar Todo</span>
              </div>
            </button>

            {/* Badge: Pago Recibido y Cambio Entregado - Agrandado y Responsivo */}
            {lastCashReceived > 0 && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 sm:gap-5 bg-amber-500/10 px-3 sm:px-5 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border border-amber-500/40 ml-1 shrink-0 shadow-xl"
              >
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[7.5px] sm:text-[9px] font-black text-amber-500 uppercase tracking-wider mb-0.5">PAGO RECIBIDO</span>
                  <span className="text-base sm:text-2xl font-mono font-black text-white leading-none">${lastCashReceived.toFixed(2)}</span>
                </div>
                <div className="w-px h-6 sm:h-7 bg-amber-500/30" />
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-[7.5px] sm:text-[9px] font-black text-sky-400 uppercase tracking-wider mb-0.5">CAMBIO ENTREGADO</span>
                  <span className="text-base sm:text-2xl font-mono font-black text-sky-400 leading-none">${lastSaleChange.toFixed(2)}</span>
                </div>
              </motion.div>
            )}
          </div>
 
          {/* Total Venta - Protected from overlap */}
          <div className="flex flex-col items-end shrink-0 pl-3 border-l border-zinc-800/60 bg-[#0c0c0e] z-10">
            <span className="text-zinc-500 font-display font-bold uppercase text-[8px] sm:text-[9px] tracking-wider leading-none mb-1">Total de la Venta</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl lg:text-4xl font-mono font-black text-[#00ff41] tracking-tight leading-none">
                ${total.toFixed(2)}
              </span>
              <span className="text-[9px] sm:text-[10px] text-zinc-500 font-display font-black uppercase">USD</span>
            </div>
          </div>
        </div>

        {/* Sidebar Area Footer - Informative context (Hidden on smaller screens to prioritize POS actions) */}
        <div className="hidden xl:flex w-72 shrink-0 bg-black/95 border-l border-zinc-800/80 items-center px-4">
          {/* RIGHT: Fixed System Info */}
          <div className="ml-auto flex items-center gap-4">
            <div className="flex flex-col text-right">
              <span className="text-[8px] font-black text-gray-700 uppercase tracking-[0.2em] mb-0.5">Estación</span>
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">POS-STATION-01</span>
            </div>
            <div className="flex flex-col text-right border-l border-white/10 pl-4">
              <span className="text-[11px] font-black text-[#00ff41] tabular-nums tracking-widest leading-tight">
                {currentTime.toLocaleTimeString()}
              </span>
              <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest leading-none">
                {currentTime.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Modal (F12) - REDESIGNED ULTRACLEAN POS TERMINAL */}
      <AnimatePresence>
        {isPayModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[150] flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-zinc-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-[0_25px_100px_rgba(0,0,0,0.9)] flex flex-col max-h-[90vh] h-[640px]"
            >
              {/* Top Modal Header: Customer & Document Context */}
              <div className="bg-[#0e0e12] border-b border-zinc-800/80 px-4 py-2 flex items-center justify-between shrink-0 gap-3">
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-7 h-7 rounded-lg bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center text-[#00ff41]">
                    <Banknote size={16} />
                  </div>
                  <div>
                    <h3 className="text-xs font-display font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      Cobro POS
                      <span className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">F12</span>
                    </h3>
                  </div>
                </div>

                {/* Customer Selector Widget - Fast & ergonomic (same as POS header) */}
                <div className="flex items-center gap-2.5 bg-[#121216] border border-zinc-800/90 focus-within:border-[#00ff41]/60 focus-within:ring-1 focus-within:ring-[#00ff41]/30 rounded-xl px-2.5 py-1 transition-all shrink-0 shadow-sm">
                  {/* F3 Trigger Badge */}
                  <button 
                    type="button"
                    onClick={handleOpenCustomerModal}
                    className="flex items-center gap-1 bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] border border-[#00ff41]/25 px-2 py-1 rounded-lg transition-all active:scale-95 group/f3 cursor-pointer"
                    title="Elegir o Registrar Cliente (F3)"
                  >
                    <span className="font-mono font-black text-[10px] tracking-wider">F3</span>
                    <Users size={12} className="group-hover/f3:scale-110 transition-transform text-[#00ff41]" />
                  </button>

                  {/* Customer Name & Editable Doc Input Box */}
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col justify-center">
                      <span className="text-[7.5px] font-display font-black text-zinc-500 uppercase tracking-widest leading-none mb-0.5">
                        CLIENTE
                      </span>
                      <span className="font-display font-black text-xs uppercase tracking-tight text-white max-w-[150px] truncate" title={customerName}>
                        {customerRuc !== '9999999999999' && !customers.some((c: any) => c.ruc === customerRuc) ? 'POR REGISTRAR' : customerName}
                      </span>
                    </div>

                    {/* Direct Editable RUC / Cédula */}
                    <div className="flex flex-col justify-center">
                      <span className="text-[7px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-0.5 text-center">
                        RUC / CÉDULA
                      </span>
                      <input 
                        type="text"
                        value={customerRuc}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          customerLookupRequestRef.current += 1;
                          setCustomerRuc(val);
                          const clean = val.trim();
                          if (!clean || clean === '9999999999999') {
                            setCustomerName('CONSUMIDOR FINAL');
                          } else {
                            const match = customers.find((c: any) => c.ruc === clean);
                            if (match) {
                              setCustomerName(match.name);
                            } else {
                              setCustomerName('POR REGISTRAR');
                            }
                          }
                        }}
                        onFocus={(e) => e.target.select()}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleVerifyOrRegisterRuc(customerRuc);
                          }
                        }}
                        onBlur={() => {
                          const clean = customerRuc.trim();
                          if (clean && clean !== '9999999999999' && !customers.some((c: any) => c.ruc === clean)) {
                            handleVerifyOrRegisterRuc(customerRuc);
                          }
                        }}
                        className="bg-[#0a0a0d] hover:bg-zinc-900 focus:bg-zinc-950 border border-zinc-700/80 focus:border-[#00ff41] text-[#00ff41] font-mono font-bold text-xs px-2 py-0.5 rounded-lg outline-none w-[125px] text-center tracking-wider transition-all focus:ring-1 focus:ring-[#00ff41]/40 shadow-inner cursor-pointer focus:cursor-text"
                        placeholder="9999999999999"
                      />
                    </div>
                  </div>

                  {/* Search / Quick Modal Button */}
                  <button 
                    type="button"
                    onClick={handleOpenCustomerModal}
                    className="bg-zinc-900 hover:bg-[#00ff41]/10 text-zinc-400 hover:text-[#00ff41] border border-zinc-800 hover:border-[#00ff41]/30 p-1.5 rounded-lg transition-all shrink-0 cursor-pointer"
                    title="Buscar o Registrar Cliente (F3)"
                  >
                    <Search size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-lg border border-zinc-800 text-[10px] text-zinc-300 font-display font-bold">
                    <FileText size={12} className="text-[#00ff41]" />
                    <span>Factura Electrónica SRI</span>
                  </div>
                  <button
                    onClick={() => {
                      setIsPayModalOpen(false);
                      setPaymentLines([]);
                      setCashReceived('');
                    }}
                    className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all cursor-pointer"
                    title="Cerrar (ESC)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Top Header Financial Overview - Compact Stats */}
              <div className="grid grid-cols-4 gap-px bg-zinc-800/80 p-px shrink-0">
                <div className="bg-[#0b0b0e] py-3 px-4 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-display font-bold text-zinc-500 uppercase tracking-widest mb-0.5">Total a Cobrar</span>
                  <span className="text-2xl sm:text-3xl font-mono font-black text-[#00ff41] tracking-tight">${total.toFixed(2)}</span>
                </div>
                <div className="bg-[#0b0b0e] py-3 px-4 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-display font-bold text-rose-500/80 uppercase tracking-widest mb-0.5">Faltante por Cobrar</span>
                  <span className={`text-2xl sm:text-3xl font-mono font-black tracking-tight ${remainingToPay > 0 ? 'text-rose-500' : 'text-zinc-600'}`}>
                    ${remainingToPay.toFixed(2)}
                  </span>
                </div>
                <div className="bg-[#0b0b0e] py-3 px-4 flex flex-col items-center justify-center">
                  <span className="text-[8px] font-display font-bold text-zinc-400 uppercase tracking-widest mb-0.5">Recibido (Registrado)</span>
                  <span className="text-2xl sm:text-3xl font-mono font-black text-white tracking-tight">${totalPaid.toFixed(2)}</span>
                </div>
                <div className={`py-3 px-4 flex flex-col items-center justify-center transition-all ${liveChange > 0 ? 'bg-[#00ff41]/10 border border-[#00ff41]/30' : 'bg-[#0b0b0e]'}`}>
                  <span className="text-[8px] font-display font-bold text-sky-400 uppercase tracking-widest mb-0.5">Cambio a Entregar</span>
                  <span className="text-2xl sm:text-3xl font-mono font-black text-sky-400 tracking-tight">${liveChange.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex flex-1 overflow-hidden bg-[#070709]">
                {/* Left: 3 Core Payment Methods ONLY - Compact Side Panel */}
                <div className="w-48 bg-black/40 p-3 flex flex-col justify-between border-r border-zinc-800/80 overflow-y-auto custom-scrollbar shrink-0">
                  <div className="flex flex-col gap-2">
                    <span className="text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider mb-0.5 ml-1">Método de Cobro</span>
                    
                    {[
                      { id: 'EFECTIVO', label: 'Efectivo', key: 'F4', icon: <Banknote size={16} /> },
                      { id: 'TRANSFERENCIA', label: 'Transferencia', key: 'F5', icon: <ArrowRightLeft size={15} /> },
                      { id: 'CREDITO', label: 'Crédito / Fiar', key: 'F6', icon: <UserPlus size={15} /> }
                    ].map((m) => {
                      const isSelected = paymentMethod === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setPaymentMethod(m.id as any);
                            const rem = Math.max(0, total - totalPaid);
                            if (rem > 0) {
                              setCashReceived(rem.toFixed(2));
                            }
                            setTimeout(() => {
                              cashInputRef.current?.focus();
                              cashInputRef.current?.select();
                            }, 50);
                          }}
                          className={`p-2.5 rounded-xl text-[10px] font-display font-bold uppercase tracking-wider transition-all border flex items-center gap-2 active:scale-95 ${
                            isSelected 
                            ? m.id === 'CREDITO' 
                              ? 'bg-[#ff7e00] text-black border-[#ff7e00] shadow-md shadow-[#ff7e00]/20 font-extrabold'
                              : 'bg-[#00ff41] text-black border-[#00ff41] shadow-md shadow-[#00ff41]/10 font-extrabold' 
                            : 'bg-[#121215] text-zinc-400 border-zinc-800/80 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <div className={`p-1 rounded-lg ${isSelected ? 'bg-black/10 text-black' : m.id === 'CREDITO' ? 'bg-zinc-900 text-[#ff7e00]' : 'bg-zinc-900 text-[#00ff41]'}`}>
                            {m.icon}
                          </div>
                          <div className="flex flex-col items-start leading-tight">
                            <span className="text-[8px] font-mono opacity-60">[{m.key}]</span>
                            <span className="text-[10px] whitespace-nowrap">{m.label}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Relocated SRI Payment Form - Discreet Bottom Position */}
                  <div className="mt-auto pt-3 border-t border-zinc-800/60 flex flex-col gap-1">
                    <label className="block text-[8px] font-display font-bold text-zinc-500 uppercase tracking-wider">Forma SRI (Facturación)</label>
                    <select 
                      value={sriPaymentForm}
                      onChange={(e) => setSriPaymentForm(e.target.value)}
                      className="w-full bg-[#121215] border border-zinc-800 rounded-lg p-1.5 text-[9px] font-display font-bold text-zinc-300 outline-none focus:border-[#00ff41] cursor-pointer"
                    >
                      <option value="Sin Utilización Del Sistema Financiero (01)">Sin Utilización Sistema Fin. (01)</option>
                      <option value="Otros Con Utilización Del Sistema Financiero (20)">Otros Con Sistema Fin. (20)</option>
                      <option value="Tarjeta de Crédito / Débito (19)">Tarjeta Crédito/Débito (19)</option>
                      <option value="Transferencia Bancaria (18)">Transferencia Bancaria (18)</option>
                    </select>
                  </div>
                </div>

                {/* Center: List of Payments applied */}
                <div className="flex-1 p-3.5 flex flex-col gap-2.5 overflow-hidden">
                  {(paymentMethod === 'CREDITO' || paymentMethod === 'TRANSFERENCIA') && (!customerRuc || customerRuc === '9999999999999' || customerName.toUpperCase().includes('CONSUMIDOR FINAL')) && (
                    <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-2.5 flex items-center justify-between gap-2 shadow-md">
                      <div className="flex items-center gap-2 text-xs font-display font-bold text-amber-300">
                        <UserPlus size={16} className="text-amber-400 shrink-0" />
                        <span>Se requiere seleccionar o registrar un cliente identificado para {paymentMethod === 'TRANSFERENCIA' ? 'Transferencia' : 'Crédito'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenCustomerModal}
                        className="px-3 py-1 bg-amber-400 hover:bg-amber-300 text-black rounded-lg text-[10px] font-black uppercase transition-all shrink-0 cursor-pointer active:scale-95 flex items-center gap-1 shadow-sm whitespace-nowrap"
                      >
                        <UserPlus size={13} />
                        <span>Elegir / Registrar Cliente (F3)</span>
                      </button>
                    </div>
                  )}

                  <div className="flex-1 bg-[#0c0c0f] rounded-xl border border-zinc-800/80 flex flex-col shadow-inner overflow-hidden">
                    <div className="grid grid-cols-2 px-3.5 py-2 border-b border-zinc-800 bg-[#121216] text-[9px] font-display font-bold uppercase tracking-wider text-zinc-500">
                      <span>Forma de Cobro Registrada</span>
                      <span className="text-right">Monto Aplicado</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
                      {paymentLines.map((line, idx) => (
                        <motion.div 
                          initial={{ x: -10, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          key={idx} 
                          className="flex justify-between items-center py-1.5 px-2.5 bg-zinc-900/60 rounded-lg border border-zinc-800/50"
                        >
                          <span className="text-xs font-display font-bold text-zinc-300 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff41] shadow-[0_0_8px_rgba(0,255,65,0.8)]" />
                            {line.type}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-white">${line.value.toFixed(2)}</span>
                            <button
                              onClick={() => removePaymentLine(idx)}
                              className="text-zinc-600 hover:text-red-400 p-1 rounded transition-colors"
                              title="Eliminar este pago"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                      {paymentLines.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-700 py-8">
                          <Banknote size={28} className="mb-1.5 opacity-20 text-[#00ff41]" />
                          <span className="text-[10px] font-display font-bold uppercase tracking-wider opacity-50">Ingrese un monto para registrar pago</span>
                        </div>
                      )}
                    </div>

                    {paymentLines.length > 0 && (
                      <button 
                        onClick={() => removePaymentLine(paymentLines.length - 1)}
                        className="py-1.5 px-3 bg-red-950/20 hover:bg-red-900/30 text-red-400 font-display font-bold text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border-t border-zinc-800/80"
                      >
                        <Trash2 size={12} />
                        Quitar Último Pago (Backspace)
                      </button>
                    )}
                  </div>
                </div>

                {/* Right: Input & Finalize Actions - Expanded & Clean Panel */}
                <div className="w-80 bg-[#0c0c0e] p-4 border-l border-zinc-800/80 flex flex-col gap-3 shrink-0 overflow-y-auto custom-scrollbar justify-between">
                  <div className="space-y-3.5">
                    <div>
                      <div className="flex items-center justify-between mb-1 ml-0.5">
                        <label className="block text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider">Caja / Cuenta de Destino</label>
                        {destinationCaja.includes('BANCO') && (
                          <span className="text-[8px] font-display font-bold text-sky-400 bg-sky-950/60 border border-sky-800/50 px-1.5 py-0.2 rounded">
                            BANCO
                          </span>
                        )}
                      </div>
                      <select 
                        value={destinationCaja}
                        onChange={(e) => setDestinationCaja(e.target.value)}
                        className="w-full bg-[#121215] border border-zinc-800 rounded-xl p-2.5 text-[11px] font-display font-bold text-white outline-none focus:border-[#00ff41] cursor-pointer"
                      >
                        <option value="CAJA POS">CAJA POS</option>
                        <option value="CUENTA BANCARIA">CUENTA BANCARIA</option>
                        <option value="PRODUBANCO - CTA. CORRIENTE #3300... (BANCO)">PRODUBANCO - CTA. CORRIENTE (MATRICULADA)</option>
                        <option value="CUENTA POR COBRAR (CRÉDITO CLIENTE)">CUENTA POR COBRAR (CRÉDITO CLIENTE)</option>
                      </select>
                    </div>

                    {/* Prominent Valor a Ingresar Box */}
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5 ml-0.5">
                        <label className="block text-[10px] font-display font-bold text-zinc-300 uppercase tracking-wider">Valor a Ingresar</label>
                        {remainingToPay <= 0 && (
                          <span className="text-[9px] font-mono font-bold text-[#00ff41]">✓ Total cubierto</span>
                        )}
                      </div>
                      <div className="relative group">
                        <input
                          ref={cashInputRef}
                          type="text"
                          value={cashReceived}
                          onClick={(e) => e.currentTarget.select()}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setCashReceived(e.target.value.replace(/[^0-9.]/g, ''))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const val = parseFloat(cashReceived) || 0;
                              if (totalPaid >= total) {
                                if (paymentMethod === 'CREDITO') {
                                  handleFiarSale();
                                } else {
                                  handleFinalizeSale(false);
                                }
                                return;
                              }
                              if (paymentLines.length === 0 && val >= total) {
                                if (paymentMethod === 'CREDITO') {
                                  handleFiarSale();
                                } else {
                                  handleFinalizeSale(false);
                                }
                                return;
                              }
                              if (totalPaid + val >= total) {
                                if (paymentMethod === 'CREDITO') {
                                  handleFiarSale();
                                } else {
                                  handleFinalizeSale(false);
                                }
                                return;
                              }
                              if (val > 0) {
                                addPaymentLine();
                              }
                            } else if (e.key === 'Backspace' && (cashReceived === '' || cashReceived === '0.00' || cashReceived === '0') && paymentLines.length > 0) {
                              removePaymentLine(paymentLines.length - 1);
                            }
                          }}
                          className="w-full bg-[#00ff41]/5 border-2 border-[#00ff41] rounded-2xl py-3 px-4 pl-9 text-3xl font-mono font-black text-right text-[#00ff41] outline-none shadow-[0_0_20px_rgba(0,255,65,0.12)] placeholder:text-[#00ff41]/20 cursor-pointer transition-all"
                          placeholder="0.00"
                          autoFocus
                        />
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#00ff41]/60 font-mono text-xl font-bold">$</div>
                      </div>
                    </div>

                    {/* Voucher Photo Upload ONLY for TRANSFERENCIA */}
                    {paymentMethod === 'TRANSFERENCIA' && (
                      <div className="relative pt-2 border-t border-zinc-800/80">
                        <div className="flex items-center justify-between mb-1.5 ml-0.5">
                          <label className="block text-[9px] font-display font-bold text-[#00ff41] uppercase tracking-wider flex items-center gap-1">
                            <Camera size={12} />
                            <span>Comprobante de Transferencia</span>
                          </label>
                          <span className="text-[8px] font-display font-black text-[#00ff41] bg-[#00ff41]/10 px-1.5 py-0.2 rounded border border-[#00ff41]/30">
                            REQUERIDO
                          </span>
                        </div>

                        <input 
                          type="file" 
                          ref={voucherFileInputRef}
                          accept="image/*"
                          onChange={handleVoucherFileSelect}
                          className="hidden"
                        />

                        {transferVoucherImage ? (
                          <div className="rounded-xl border border-zinc-700 bg-[#121216] p-2 flex items-center justify-between gap-2 shadow-inner">
                            <div 
                              onClick={() => setViewingVoucherImage(transferVoucherImage)}
                              className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0"
                            >
                              <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-700 shrink-0 bg-black flex items-center justify-center relative">
                                <img src={transferVoucherImage} alt="Comprobante" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <Eye size={14} className="text-[#00ff41]" />
                                </div>
                              </div>
                              <div className="flex flex-col min-w-0 text-[9px]">
                                <span className="font-display font-bold text-zinc-200 truncate group-hover:text-[#00ff41] transition-colors">Foto Adjuntada</span>
                                <span className="text-[#00ff41] font-mono text-[8px] flex items-center gap-0.5">
                                  <Eye size={9} /> Ver imagen
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => setViewingVoucherImage(transferVoucherImage)}
                                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer"
                                title="Ver comprobante en pantalla completa"
                              >
                                <Eye size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setTransferVoucherImage(null)}
                                className="p-1.5 bg-red-950/60 hover:bg-red-900 text-red-400 rounded-lg transition-colors cursor-pointer"
                                title="Quitar imagen"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => voucherFileInputRef.current?.click()}
                            className="w-full py-2.5 px-3 rounded-xl border border-dashed border-[#00ff41]/70 bg-[#00ff41]/10 text-[#00ff41] hover:bg-[#00ff41]/20 transition-all flex items-center justify-center gap-2 cursor-pointer text-[10px] font-display font-bold uppercase shadow-[0_0_12px_rgba(0,255,65,0.12)]"
                          >
                            <Upload size={14} />
                            <span>Subir Foto Comprobante</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Clean Action Buttons */}
                  <div className="pt-2 space-y-2 border-t border-zinc-800/80 mt-auto">
                    {paymentMethod === 'CREDITO' ? (
                      <>
                        <button
                          onClick={() => handleFiarSale(true)}
                          className="w-full bg-[#ff7e00] text-black py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-[#e67100] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#ff7e00]/20 cursor-pointer"
                        >
                          <Printer size={15} />
                          F1: Crédito + Ticket
                        </button>
                        <button
                          onClick={() => handleFiarSale(false)}
                          className="w-full bg-[#121215] text-[#ff7e00] border border-[#ff7e00]/50 py-3.5 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-[#ff7e00] hover:text-black active:scale-95 transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer"
                        >
                          <UserPlus size={16} />
                          F2: Registrar Crédito (Fiar)
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleFinalizeSale(true)}
                          className="w-full bg-white text-black py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 shadow-md active:scale-95 cursor-pointer"
                        >
                          <Printer size={15} />
                          F1: Cobrar + Ticket
                        </button>
                        <button
                          onClick={() => handleFinalizeSale(false)}
                          className="w-full bg-[#00ff41] text-black py-3.5 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-[#00e139] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-[#00ff41]/25 cursor-pointer"
                          title="Cobrar venta y abrir la gaveta electrónica sin imprimir ticket"
                        >
                          <Unlock size={16} />
                          F2: Cobrar + Abrir Gaveta
                        </button>
                      </>
                    )}
                    
                    <button 
                      onClick={() => {
                        setIsPayModalOpen(false);
                        setPaymentLines([]);
                        setCashReceived('');
                      }}
                      className="w-full text-center text-zinc-500 hover:text-zinc-300 font-display font-bold uppercase text-[10px] tracking-widest transition-all pt-1 block cursor-pointer"
                    >
                      ESC: Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Park Sale Modal (F6) */}
      <AnimatePresence>
        {isParkModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-8 w-full max-w-lg shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              <div className="flex flex-col items-center text-center mb-6">
                <div className="bg-[#00ff41]/10 p-4 rounded-2xl mb-4 border border-[#00ff41]/20">
                  <Plus className="text-[#00ff41] w-10 h-10" />
                </div>
                <h2 className="text-2xl font-display font-black uppercase tracking-tight mb-1 text-white">Apartar Ticket</h2>
                <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest">Identifica este ticket para recuperarlo luego</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider mb-2 ml-1">NOMBRE O REFERENCIA</label>
                  <input
                    ref={parkInputRef}
                    type="text"
                    value={parkLabel}
                    onChange={e => setParkLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && confirmParkSale()}
                    className="w-full bg-[#0c0c0e]/80 border border-zinc-800 rounded-xl p-4 text-xl font-mono font-bold text-[#00ff41] outline-none focus:border-[#00ff41]/80 focus:ring-1 focus:ring-[#00ff41]/40 transition-all uppercase placeholder:text-zinc-800"
                    placeholder="EJ: MESA 5, JUAN, PARA LLEVAR..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => { setIsParkModalOpen(false); setParkLabel(''); }}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800/80 text-zinc-400 py-3.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    CANCELAR (ESC)
                  </button>
                  <button
                    onClick={confirmParkSale}
                    className="bg-[#00ff41] text-black py-3.5 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:scale-[1.01] active:scale-[0.99] transition-all shadow-[0_10px_30px_rgba(0,255,65,0.15)]"
                  >
                    CONFIRMAR (ENTER)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Selection Modal */}
      <AnimatePresence>
        {isCategoryModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-center justify-between mb-5 border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#00ff41]/10 p-3 rounded-2xl border border-[#00ff41]/20">
                    <Tag className="text-[#00ff41] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-black uppercase tracking-tight text-white">Seleccionar Categoría</h2>
                    <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest">
                      Filtra el catálogo rápido por categorías registradas
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-2 rounded-full transition-all active:scale-95 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-wider">
                  CATEGORÍAS REGISTRADAS ({categories.length})
                </h4>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1 custom-scrollbar">
                  {categories.map(cat => {
                    const isSelected = selectedCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setIsCategoryModalOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center p-4 rounded-2xl text-xs font-display font-bold uppercase tracking-wider border transition-all text-center gap-2 ${
                          isSelected
                            ? 'bg-[#00ff41]/15 border-[#00ff41] text-[#00ff41] shadow-[0_0_20px_rgba(0,255,65,0.2)] font-black scale-[1.02]'
                            : 'bg-zinc-900/80 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 hover:text-white active:scale-95'
                        }`}
                      >
                        <Tag size={16} className={isSelected ? 'text-[#00ff41]' : 'text-zinc-500'} />
                        <span className="truncate w-full">{cat.name}</span>
                        {isSelected && (
                          <span className="text-[8px] bg-[#00ff41] text-black px-2 py-0.5 rounded-full font-black mt-0.5">
                            ACTIVA
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-4 border-t border-zinc-800/80 flex justify-end">
                  <button
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 px-6 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    CERRAR (ESC)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Artículo Varios Modal */}
      <AnimatePresence>
        {isVariosModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 10 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-[0_50px_100px_rgba(0,0,0,0.8)]"
            >
              <div className="flex items-center justify-between mb-5 border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-[#00ff41]/10 p-3 rounded-2xl border border-[#00ff41]/20">
                    <Plus className="text-[#00ff41] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-display font-black uppercase tracking-tight text-white">Artículo Varios</h2>
                    <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest">
                      Agregar producto no registrado a la venta
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsVariosModalOpen(false)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-2 rounded-full transition-all active:scale-95 text-zinc-400 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    DESCRIPCIÓN / NOMBRE DEL ARTÍCULO
                  </label>
                  <input
                    type="text"
                    value={variosName}
                    onChange={e => setVariosName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] uppercase transition-all"
                    placeholder="EJ: SERVICIO DE IMPRESIÓN / PRODUCTO VARIOS"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1">
                    PRECIO ($ USD)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={variosPrice}
                      onChange={e => setVariosPrice(e.target.value.replace(/[^0-9.]/g, ''))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const priceNum = parseFloat(variosPrice) || 0;
                          if (priceNum > 0) {
                            addToCart({
                              id: Date.now(),
                              code: 'VAR' + Math.floor(Math.random() * 1000),
                              name: variosName.trim() || 'ARTÍCULO VARIOS',
                              price: priceNum,
                              stock: 999
                            });
                            setIsVariosModalOpen(false);
                            setVariosPrice('');
                          }
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 pl-8 text-lg font-mono font-bold text-[#00ff41] outline-none focus:border-[#00ff41] transition-all"
                      placeholder="0.00"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 font-mono font-bold">$</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-zinc-800/80">
                  <button
                    onClick={() => setIsVariosModalOpen(false)}
                    className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 py-3 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all"
                  >
                    CANCELAR (ESC)
                  </button>
                  <button
                    onClick={() => {
                      const priceNum = parseFloat(variosPrice) || 0;
                      if (priceNum > 0) {
                        addToCart({
                          id: Date.now(),
                          code: 'VAR' + Math.floor(Math.random() * 1000),
                          name: variosName.trim() || 'ARTÍCULO VARIOS',
                          price: priceNum,
                          stock: 999
                        });
                        setIsVariosModalOpen(false);
                        setVariosPrice('');
                      }
                    }}
                    className="bg-[#00ff41] text-black py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-[#00e139] active:scale-95 transition-all shadow-[0_10px_20px_rgba(0,255,65,0.15)]"
                  >
                    AGREGAR (ENTER)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Selection Modal (F3) */}
      <AnimatePresence>
        {isCustomerModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-2xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] max-h-[92vh] flex flex-col text-zinc-100 overflow-y-auto custom-scrollbar"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5 border-b border-zinc-800/80 pb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-[#00ff41]/10 p-3 rounded-2xl border border-[#00ff41]/20">
                    <Users className="text-[#00ff41] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-black uppercase tracking-tight">Registro y Selección de Clientes</h2>
                    <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest">
                      Datos Mínimos Viables para Facturación SRI
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAdvancedCustomer(!isAdvancedCustomer)}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 hover:text-[#00ff41] text-[10px] font-display font-black uppercase tracking-wider px-3 py-2 rounded-xl transition-all flex items-center gap-1.5 active:scale-95"
                    title="Toggle opciones y campos adicionales del cliente"
                  >
                    <UserPlus size={13} className="text-[#00ff41]" />
                    {isAdvancedCustomer ? 'CAMPOS BÁSICOS' : '+ CAMPOS ADICIONALES'}
                  </button>
                  <button 
                    onClick={handleCloseCustomerModal}
                    className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-2 rounded-full transition-all active:scale-95 text-zinc-400 hover:text-white ml-1"
                    title="Cerrar sin guardar (ESC)"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Registration Form Box */}
              <div className="bg-[#0c0c0e]/90 p-5 rounded-2xl border border-zinc-800/80 mb-5 shrink-0 space-y-4">
                
                {/* Error Banner if missing minimum required data */}
                {customerRegError && (
                  <div className="bg-red-950/80 border border-red-500/50 p-3 rounded-xl text-red-200 text-xs font-display font-bold flex items-center gap-2 animate-pulse">
                    <div className="bg-red-500/20 p-1.5 rounded-lg shrink-0">
                      <X size={14} className="text-red-400" />
                    </div>
                    <span>{customerRegError}</span>
                  </div>
                )}

                {/* Person Type Selector & Doc Type */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      TIPO CLIENTE <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={newCustomer.type}
                      onChange={e => {
                        const val = e.target.value;
                        setNewCustomer({
                          ...newCustomer,
                          type: val,
                          idType: val === 'JURIDICA' ? 'RUC' : 'CEDULA'
                        });
                        setCustomerRegError('');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41]/80 transition-all"
                    >
                      <option value="NATURAL">PERSONA NATURAL</option>
                      <option value="JURIDICA">EMPRESA / JURÍDICA</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      TIPO DOC <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={newCustomer.idType}
                      onChange={e => setNewCustomer({ ...newCustomer, idType: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41]/80 transition-all"
                    >
                      <option value="CEDULA">CÉDULA</option>
                      <option value="RUC">RUC</option>
                      <option value="PASAPORTE">PASAPORTE</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>RUC / CÉDULA / PASAPORTE <span className="text-red-400">*</span></span>
                      <span className="text-[#00ff41] bg-[#00ff41]/10 px-1 py-0.2 rounded border border-[#00ff41]/20 font-mono text-[9px] font-black">F3</span>
                    </label>
                    <input
                      ref={newCustomerIdRef}
                      type="text"
                      value={newCustomer.idNumber}
                      onChange={e => {
                        const val = e.target.value.toUpperCase();
                        customerLookupRequestRef.current += 1;
                        setCustomerRegError('');
                        const cleanVal = val.trim();
                        const found = findExistingCustomer(cleanVal);
                        if (found) {
                          populateFromExistingCustomer(found,val);
                        } else {
                          const is13 = cleanVal.length === 13;
                          const is10 = cleanVal.length === 10;
                          setNewCustomer(prev => ({
                            ...prev,
                            idNumber: val,
                            idType: is13 ? 'RUC' : is10 ? 'CEDULA' : prev.idType,
                            type: is13 ? 'JURIDICA' : prev.type
                          }));
                        }
                        setCustomerSearch(cleanVal);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const cleanVal = newCustomer.idNumber.trim();
                          const found = matchedCustomerForBanner || findExistingCustomer(cleanVal);
                          if (found) {
                            setCustomerName(found.name);
                            setCustomerRuc(found.ruc || cleanVal);
                            setIsCustomerModalOpen(false);
                            setCustomerSearch('');
                            setTimeout(() => searchInputRef.current?.focus(), 50);
                          } else {
                            if (newCustomer.type === 'JURIDICA') {
                              newCustomerCompanyNameRef.current?.focus();
                            } else {
                              newCustomerFirstNameRef.current?.focus();
                            }
                          }
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-mono font-bold text-[#00ff41] outline-none focus:border-[#00ff41] transition-all placeholder:text-zinc-800"
                      placeholder="Ej: 1725544332"
                    />
                  </div>
                </div>

                {/* Existing Customer Banner Alert */}
                {matchedCustomerForBanner && (
                  <div className="p-3 bg-[#00ff41]/10 border border-[#00ff41]/40 rounded-xl flex items-center justify-between gap-2 my-1 shadow-[0_0_15px_rgba(0,255,65,0.1)] animate-fadeIn">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CheckCircle2 size={18} className="text-[#00ff41] shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-display font-black text-[#00ff41] uppercase truncate">¡CLIENTE ENCONTRADO EN BASE DE DATOS!</span>
                          <span className="bg-[#00ff41]/20 text-[#00ff41] text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase shrink-0">REGISTRADO</span>
                        </div>
                        <p className="text-[11px] font-display font-bold text-zinc-200 mt-0.5 truncate">
                          {matchedCustomerForBanner.name} <span className="text-zinc-400 font-mono font-normal">({matchedCustomerForBanner.ruc})</span>
                          {matchedCustomerForBanner.phone ? ` • Tel: ${matchedCustomerForBanner.phone}` : ''}
                          {matchedCustomerForBanner.email ? ` • Email: ${matchedCustomerForBanner.email}` : ''}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerName(matchedCustomerForBanner.name);
                        setCustomerRuc(matchedCustomerForBanner.ruc || newCustomer.idNumber);
                        setIsCustomerModalOpen(false);
                        setCustomerSearch('');
                      }}
                      className="px-3.5 py-2 bg-[#00ff41] hover:bg-[#00e139] text-black font-display font-black text-xs uppercase rounded-xl transition-all shadow-md active:scale-95 cursor-pointer shrink-0 flex items-center gap-1.5"
                    >
                      <CheckCircle2 size={14} />
                      <span>SELECCIONAR CLIENTE</span>
                    </button>
                  </div>
                )}

                {/* Name / Names & Surnames separation */}
                {newCustomer.type === 'NATURAL' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">
                        NOMBRES <span className="text-red-400">*</span>
                      </label>
                      <input
                        ref={newCustomerFirstNameRef}
                        type="text"
                        value={newCustomer.firstName}
                        onChange={e => {
                          setNewCustomer({ ...newCustomer, firstName: e.target.value });
                          setCustomerRegError('');
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (matchedCustomerForBanner) {
                              setCustomerName(matchedCustomerForBanner.name);
                              setCustomerRuc(matchedCustomerForBanner.ruc || newCustomer.idNumber);
                              setIsCustomerModalOpen(false);
                              setCustomerSearch('');
                              setTimeout(() => searchInputRef.current?.focus(), 50);
                            } else {
                              newCustomerLastNameRef.current?.focus();
                            }
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] uppercase transition-all placeholder:text-zinc-800"
                        placeholder="NOMBRES (EJ: JUAN CARLOS)"
                      />
                    </div>
                    <div>
                      <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">
                        APELLIDOS <span className="text-red-400">*</span>
                      </label>
                      <input
                        ref={newCustomerLastNameRef}
                        type="text"
                        value={newCustomer.lastName}
                        onChange={e => {
                          setNewCustomer({ ...newCustomer, lastName: e.target.value });
                          setCustomerRegError('');
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (matchedCustomerForBanner) {
                              setCustomerName(matchedCustomerForBanner.name);
                              setCustomerRuc(matchedCustomerForBanner.ruc || newCustomer.idNumber);
                              setIsCustomerModalOpen(false);
                              setCustomerSearch('');
                              setTimeout(() => searchInputRef.current?.focus(), 50);
                            } else {
                              newCustomerEmailRef.current?.focus();
                            }
                          }
                        }}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] uppercase transition-all placeholder:text-zinc-800"
                        placeholder="APELLIDOS (EJ: PEREZ LOPEZ)"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">
                      RAZÓN SOCIAL / EMPRESA <span className="text-red-400">*</span>
                    </label>
                    <input
                      ref={newCustomerCompanyNameRef}
                      type="text"
                      value={newCustomer.companyName}
                      onChange={e => {
                        setNewCustomer({ ...newCustomer, companyName: e.target.value });
                        setCustomerRegError('');
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          if (matchedCustomerForBanner) {
                            setCustomerName(matchedCustomerForBanner.name);
                            setCustomerRuc(matchedCustomerForBanner.ruc || newCustomer.idNumber);
                            setIsCustomerModalOpen(false);
                            setCustomerSearch('');
                            setTimeout(() => searchInputRef.current?.focus(), 50);
                          } else {
                            newCustomerEmailRef.current?.focus();
                          }
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] uppercase transition-all placeholder:text-zinc-800"
                      placeholder="RAZÓN SOCIAL O NOMBRE DE EMPRESA S.A."
                    />
                  </div>
                )}

                {/* Email (Auto-predeterminado para zonas rurales) & Phone & Action */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">
                      EMAIL (PREDETERMINADO RURAL)
                    </label>
                    <input
                      ref={newCustomerEmailRef}
                      type="email"
                      value={newCustomer.email}
                      onChange={e => {
                        setNewCustomer({ ...newCustomer, email: e.target.value });
                        setCustomerRegError('');
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] transition-all placeholder:text-zinc-600"
                      placeholder="correo@dominio.com"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">TELÉFONO</label>
                    <input
                      type="text"
                      value={newCustomer.phone}
                      onChange={e => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-mono font-bold text-white outline-none focus:border-[#00ff41] transition-all placeholder:text-zinc-800"
                      placeholder="Teléfono"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={saveAndSelectNewCustomer}
                      className="w-full bg-[#00ff41] text-black h-[38px] rounded-xl font-display font-black text-xs uppercase tracking-wider hover:bg-[#00ff41]/90 active:scale-[0.98] transition-all shadow-[0_5px_20px_rgba(0,255,65,0.15)] flex items-center justify-center gap-1.5"
                      title="Guardar y Seleccionar Cliente (F10)"
                    >
                      <CheckCircle2 size={14} /> GUARDAR CLIENTE <span className="bg-black/20 text-black px-1.5 py-0.5 rounded text-[10px] font-mono border border-black/30">F10</span>
                    </button>
                  </div>
                </div>

                {/* Advanced optional Collapsible for Address */}
                <div>
                  <button
                    onClick={() => setIsAdvancedCustomer(!isAdvancedCustomer)}
                    className="text-[8px] font-display font-bold text-zinc-500 uppercase tracking-widest hover:text-[#00ff41] transition-colors py-0.5 flex items-center gap-1"
                  >
                    {isAdvancedCustomer ? '• OCULTAR DIRECCIÓN' : '• AGREGAR DIRECCIÓN FÍSICA'}
                  </button>
                  {isAdvancedCustomer && (
                    <div className="pt-2">
                      <label className="block text-[8px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1 ml-1">DIRECCIÓN FÍSICA</label>
                      <input
                        type="text"
                        value={newCustomer.address}
                        onChange={e => setNewCustomer({ ...newCustomer, address: e.target.value })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-[#00ff41] uppercase transition-all placeholder:text-zinc-800"
                        placeholder="AV. PRINCIPAL Y CALLE SECUNDARIA..."
                      />
                    </div>
                  )}
                </div>

              </div>

              {/* Selection Part from directory */}
              <div className="flex-1 flex flex-col min-h-0 border-t border-zinc-800/60 pt-4">
                <div className="flex items-center gap-3 mb-3 sticky top-0 bg-[#09090b] z-10 pb-2 border-b border-zinc-800/60">
                  <Search size={14} className="text-[#00ff41]" />
                  <input
                    ref={customerSearchInputRef}
                    type="text"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const q = customerSearch.trim().toUpperCase();
                        const filtered = customers.filter(c => {
                          if (!q) return true;
                          return c.name.toUpperCase().includes(q) || (c.ruc && c.ruc.includes(q)) || (c.phone && c.phone.includes(q));
                        });
                        if (filtered.length > 0) {
                          const selected = filtered[0];
                          setCustomerName(selected.name);
                          setCustomerRuc(selected.ruc || '');
                          setIsCustomerModalOpen(false);
                          setCustomerSearch('');
                        } else {
                          const query = customerSearch.trim();
                          if (/^\d+$/.test(query)) {
                            setNewCustomer(prev => ({ ...prev, idNumber: query }));
                            setTimeout(() => newCustomerIdRef.current?.focus(), 50);
                          }
                        }
                      }
                    }}
                    className="flex-1 bg-transparent text-white font-display font-bold uppercase text-xs outline-none placeholder:text-zinc-600 focus:text-[#00ff41]"
                    placeholder="BUSCAR CLIENTE EXISTENTE POR NOMBRE, CÉDULA O RUC..."
                  />
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 max-h-[160px]">
                  {customers.filter(c => {
                    const q = customerSearch.trim().toUpperCase();
                    if (!q) return true;
                    return c.name.toUpperCase().includes(q) || (c.ruc && c.ruc.includes(q)) || (c.phone && c.phone.includes(q));
                  }).length === 0 && customerSearch.trim().length > 0 && (
                    <div className="p-3 bg-amber-950/30 border border-amber-500/40 rounded-xl flex items-center justify-between gap-2 my-1 animate-pulse">
                      <div className="text-xs font-display font-bold text-amber-300">
                        <span>No existe el cliente "{customerSearch}".</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const query = customerSearch.trim();
                          if (/^\d+$/.test(query)) {
                            setNewCustomer(prev => ({ ...prev, idNumber: query }));
                          } else {
                            setNewCustomer(prev => ({ ...prev, firstName: query.toUpperCase() }));
                          }
                          setTimeout(() => newCustomerIdRef.current?.focus(), 50);
                        }}
                        className="px-3 py-1.5 bg-[#00ff41] text-black font-display font-black text-[10px] uppercase rounded-lg hover:bg-[#00ff41]/90 transition-all flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <UserPlus size={13} />
                        <span>Registro Rápido</span>
                      </button>
                    </div>
                  )}

                  {customers
                    .filter(c => {
                      const q = customerSearch.trim().toUpperCase();
                      if (!q) return true;
                      return c.name.toUpperCase().includes(q) || (c.ruc && c.ruc.includes(q)) || (c.phone && c.phone.includes(q));
                    })
                    .map((c, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setCustomerName(c.name);
                          setCustomerRuc(c.ruc || '');
                          setIsCustomerModalOpen(false);
                          setCustomerSearch('');
                        }}
                        className="w-full bg-[#0c0c0e]/40 hover:bg-[#00ff41]/5 p-3 rounded-xl border border-zinc-800/80 hover:border-[#00ff41]/30 flex items-center justify-between group transition-all"
                      >
                        <div className="text-left">
                          <span className="block font-display font-black uppercase text-xs text-zinc-200 group-hover:text-[#00ff41] transition-colors">{c.name}</span>
                          <span className="block text-[9px] font-mono text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                            {c.ruc} {c.email ? `• ${c.email}` : ''} {c.phone ? `• ${c.phone}` : ''}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="inline-block bg-zinc-900 group-hover:bg-[#00ff41]/20 text-zinc-400 group-hover:text-[#00ff41] text-[9px] font-display font-bold px-2 py-1 rounded-lg uppercase transition-all">
                            SELECCIONAR
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Waitlist Modal (F5 - APARTADOS / EN ESPERA) */}
      <AnimatePresence>
        {isWaitlistModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-6 sm:p-8 w-full max-w-4xl shadow-[0_50px_150px_rgba(0,0,0,1)] max-h-[85vh] flex flex-col relative text-zinc-100"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6 border-b border-zinc-800/80 pb-5 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="bg-[#00ff41]/10 p-3 rounded-2xl border border-[#00ff41]/20 shadow-[0_0_15px_rgba(0,255,65,0.1)]">
                    <ArrowRightLeft className="text-[#00ff41] w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-display font-black uppercase tracking-tight">Tickets Apartados</h2>
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold">
                        {waitlist.length} EN ESPERA
                      </span>
                    </div>
                    <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest mt-1">
                      F5 • Selecciona y recupera un ticket apartado o elimínalo si no se va a procesar
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsWaitlistModalOpen(false)} 
                  className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 p-2.5 rounded-full transition-all hover:rotate-90 active:scale-95"
                >
                  <X size={18} className="text-zinc-400" />
                </button>
              </div>

              {/* Main Content: Waitlist Cards */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {waitlist.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {waitlist.map((parked, idx) => (
                      <div
                        key={parked.id}
                        onClick={() => handleRestoreSale(parked)}
                        className={`relative bg-[#0c0c0e] border rounded-2xl p-5 hover:bg-zinc-900/80 transition-all group flex flex-col gap-3 text-left active:scale-[0.99] shadow-xl cursor-pointer ${
                          idx === selectedWaitlistIndex 
                          ? 'border-[#00ff41] bg-[#00ff41]/5 shadow-[#00ff41]/5' 
                          : 'border-zinc-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="bg-[#00ff41]/10 text-[#00ff41] px-3 py-1 rounded-lg text-[10px] font-display font-black uppercase tracking-wider border border-[#00ff41]/20">
                            {parked.label}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-mono text-zinc-500">
                              {new Date(parked.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setWaitlist(prev => prev.filter(p => p.id !== parked.id));
                              }}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/25 text-red-400 hover:text-red-300 border border-red-500/20 transition-all active:scale-95"
                              title="Descartar este ticket apartado"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        
                        <div className="flex-1">
                          <div className="text-[9px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1">
                            Cliente: <span className="text-zinc-200">{parked.customer}</span>
                          </div>
                          <div className="flex items-baseline gap-1 mt-1">
                            <span className="text-3xl font-mono font-black text-white">${parked.total.toFixed(2)}</span>
                            <span className="text-[9px] text-zinc-500 font-display font-bold uppercase">USD</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1">
                            {parked.cart.slice(0, 4).map((item, i) => (
                              <span key={i} className="text-[8px] bg-zinc-900 px-2 py-0.5 rounded-md text-zinc-300 font-display font-bold border border-zinc-800 uppercase">
                                {item.quantity}x {item.name}
                              </span>
                            ))}
                            {parked.cart.length > 4 && (
                              <span className="text-[8px] text-zinc-500 font-mono font-bold uppercase">+ {parked.cart.length - 4} más</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t border-zinc-800/60 pt-3 group-hover:border-[#00ff41]/30 transition-colors">
                          <span className="text-[9px] font-display font-bold uppercase text-zinc-400 group-hover:text-[#00ff41] transition-all">
                            Haz clic o presiona Enter para Recuperar
                          </span>
                          <ArrowRightLeft className="text-zinc-600 group-hover:text-[#00ff41] transition-colors" size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-950/20 flex flex-col items-center justify-center">
                    <div className="bg-zinc-900/80 w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border border-zinc-800 shadow-inner">
                      <History size={28} className="text-zinc-600" />
                    </div>
                    <h3 className="text-base font-display font-bold text-zinc-300 uppercase tracking-tight">No hay tickets apartados</h3>
                    <p className="text-zinc-500 text-[11px] font-display font-bold uppercase tracking-widest mt-1 max-w-sm">
                      Para apartar una venta en progreso, presiona la tecla <span className="text-[#00ff41] font-mono">F6</span> o el botón <span className="text-[#00ff41]">APARTAR</span> en la cinta inferior.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Keyboard Guidance Footer */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-zinc-500 text-[9px] font-display font-bold uppercase tracking-wider border-t border-zinc-800/60 pt-5 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-zinc-900 text-zinc-300 border border-zinc-800 px-1.5 py-0.5 rounded font-mono text-[8px]">← → ↑ ↓</span>
                    <span>Navegar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="bg-zinc-900 text-zinc-300 border border-zinc-800 px-1.5 py-0.5 rounded font-mono text-[8px]">ENTER</span>
                    <span>Recuperar Ticket</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-zinc-900 text-zinc-300 border border-zinc-800 px-1.5 py-0.5 rounded font-mono text-[8px]">ESC</span>
                  <span>Cerrar</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ventas del Día Modal - ERP STYLE PREMIUM REDESIGN */}
      <AnimatePresence>
        {isSalesHistoryModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl w-full max-w-[95vw] shadow-[0_25px_100px_rgba(0,0,0,0.8)] h-[85vh] flex flex-col overflow-hidden text-zinc-100"
            >
              {/* Filter Bar with Premium Styling */}
              <div className="bg-[#0c0c0e] border-b border-zinc-800/80 p-4 shrink-0">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-5 text-xs font-display font-bold text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-[9px] tracking-wider text-zinc-500">Desde:</span>
                      <input 
                        type="date" 
                        value={historyStartDate}
                        onChange={e => setHistoryStartDate(e.target.value)}
                        className="bg-[#121215] border border-zinc-800 rounded-lg px-2.5 py-1 text-white outline-none focus:border-[#00ff41] transition-all" 
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-[9px] tracking-wider text-zinc-500">Hasta:</span>
                      <input 
                        type="date" 
                        value={historyEndDate}
                        onChange={e => setHistoryEndDate(e.target.value)}
                        className="bg-[#121215] border border-zinc-800 rounded-lg px-2.5 py-1 text-white outline-none focus:border-[#00ff41] transition-all" 
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-[9px] tracking-wider text-zinc-500">Cliente:</span>
                      <div className="relative">
                        <input 
                          type="text" 
                          value={historyCustomerQuery}
                          onChange={e => setHistoryCustomerQuery(e.target.value)}
                          className="bg-[#121215] border border-zinc-800 rounded-lg pl-3 pr-8 py-1 text-white outline-none focus:border-[#00ff41] transition-all w-48 placeholder:text-zinc-600" 
                          placeholder="Buscar por cliente..." 
                        />
                        <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="uppercase text-[9px] tracking-wider text-zinc-500">Documento:</span>
                      <select 
                        value={historyDocType}
                        onChange={e => setHistoryDocType(e.target.value)}
                        className="bg-[#121215] border border-zinc-800 rounded-lg px-2.5 py-1 text-white outline-none focus:border-[#00ff41] transition-all cursor-pointer"
                      >
                        <option value="TODOS">TODOS LOS COMPROBANTES</option>
                        <option value="FACTURAS">FACTURAS</option>
                        <option value="NOTAS">NOTAS DE VENTA</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        setHistoryCustomerQuery('');
                        const d = new Date();
                        d.setDate(d.getDate() - 30);
                        setHistoryStartDate(d.toISOString().split('T')[0]);
                        setHistoryEndDate(new Date().toISOString().split('T')[0]);
                      }}
                      className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-3.5 py-1.5 rounded-lg text-[10px] font-display font-semibold uppercase transition-all border border-zinc-800"
                    >
                      Limpiar Filtros
                    </button>
                    <button 
                      onClick={() => fetchInitialData()}
                      className="bg-[#00ff41] hover:bg-[#00e139] text-black px-5 py-1.5 rounded-lg flex items-center gap-2 transition-all font-display font-extrabold text-[10px] uppercase shadow-md shadow-[#00ff41]/10"
                    >
                      <Search size={12} />
                      Sincronizar SRI
                    </button>
                  </div>
                </div>
              </div>

              {/* Table Area with premium look */}
              <div className="flex-1 overflow-auto custom-scrollbar bg-[#070709] p-2">
                <table className="w-full text-left border-separate border-spacing-0 text-[11px]">
                  <thead className="sticky top-0 bg-[#0e0e11] z-20">
                    <tr className="text-zinc-400 font-display font-bold uppercase tracking-wider text-[9px]">
                      <th className="p-3 pl-4 border-b border-zinc-800/80">Secuencia</th>
                      <th className="p-3 border-b border-zinc-800/80">Fecha</th>
                      <th className="p-3 border-b border-zinc-800/80">Cliente</th>
                      <th className="p-3 text-right border-b border-zinc-800/80">Subtotal</th>
                      <th className="p-3 text-right border-b border-zinc-800/80">Impuesto (15%)</th>
                      <th className="p-3 text-right border-b border-zinc-800/80">Total</th>
                      <th className="p-3 border-b border-zinc-800/80">Establecimiento</th>
                      <th className="p-3 border-b border-zinc-800/80">Vía Pago</th>
                      <th className="p-3 border-b border-zinc-800/80">Concepto</th>
                      <th className="p-3 text-center border-b border-zinc-800/80">SRI / Aut.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSalesHistory.map((sale, idx) => (
                      <tr 
                        key={sale.id}
                        onClick={() => handleOpenSaleDetail(sale)}
                        className={`hover:bg-white/[0.02] cursor-pointer transition-colors group h-12 border-b border-zinc-900 ${
                          idx % 2 === 0 ? 'bg-[#0a0a0d]' : 'bg-[#0d0d11]'
                        }`}
                      >
                        <td className="p-3 pl-4 font-mono text-[#00ff41] font-semibold whitespace-nowrap">
                          {String(new Date(sale.timestamp).getFullYear()).slice(-2)}{String(new Date(sale.timestamp).getMonth() + 1).padStart(2, '0')}-{String(idx + 1).padStart(6, '0')}
                        </td>
                        <td className="p-3 text-zinc-400 whitespace-nowrap">
                          {new Date(sale.timestamp).toLocaleDateString()} {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3 font-display font-semibold text-white group-hover:text-[#00ff41] transition-colors truncate max-w-[180px]">
                          {sale.customer}
                        </td>
                        <td className="p-3 text-right font-mono text-zinc-400">
                          ${(sale.total / 1.15).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-mono text-zinc-500">
                          ${(sale.total - (sale.total/1.15)).toFixed(2)}
                        </td>
                        <td className="p-3 text-right font-black font-mono text-white bg-white/[0.01]">
                          ${sale.total.toFixed(2)}
                        </td>
                        <td className="p-3 text-zinc-500 font-display font-medium text-[9px] uppercase tracking-wider">
                          SUCURSAL MATRIZ
                        </td>
                        <td className="p-3 text-zinc-400 uppercase font-mono text-[9px]">
                          <div className="flex flex-col gap-1">
                            {sale.paymentMethod?.startsWith('MIXTO') || (sale.paymentLines && sale.paymentLines.length > 1) ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-black text-[9px] w-fit flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                  ⚡ MIXTO
                                </span>
                                <span className="text-[8px] text-zinc-300 font-mono font-bold leading-tight">
                                  {sale.paymentLines && sale.paymentLines.length > 0 
                                    ? sale.paymentLines.map((l: any) => `${l.type}: $${Number(l.value).toFixed(2)}`).join(' + ')
                                    : sale.paymentMethod}
                                </span>
                              </div>
                            ) : (
                              <span className="font-semibold text-zinc-300">{sale.paymentMethod || 'EFECTIVO'}</span>
                            )}
                            {sale.transferVoucherImage && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setViewingVoucherImage(sale.transferVoucherImage);
                                }}
                                className="bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] px-1.5 py-0.5 rounded border border-[#00ff41]/30 transition-all cursor-pointer flex items-center gap-1 text-[8px] font-bold w-fit mt-0.5"
                                title="Ver comprobante de transferencia"
                              >
                                <Camera size={11} />
                                <span>VER COMPROBANTE</span>
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-zinc-500 font-display text-[9px] uppercase tracking-tight truncate max-w-[160px]">
                          {sale.items?.map((it: any) => it.name).join(', ')}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePrintSalesTicket(sale);
                              }}
                              className="bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] px-2 py-1 rounded-lg border border-[#00ff41]/30 transition-all cursor-pointer flex items-center gap-1 text-[9px] font-bold shadow-sm"
                              title="Imprimir / Reimprimir Ticket Térmico 80mm de esta venta"
                            >
                              <Printer size={12} />
                              <span>TICKET</span>
                            </button>
                            <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]" title="Comprobante Autorizado por SRI">
                              <CheckCircle2 size={11} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredSalesHistory.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-20 text-center text-zinc-600 font-display font-bold uppercase tracking-wider text-xs">
                          No se encontraron registros para los filtros seleccionados
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredSalesHistory.length > 0 && (
                    <tfoot className="sticky bottom-0 bg-[#0c0c0e] border-t border-zinc-800 font-display font-bold text-zinc-300">
                      <tr className="bg-[#0e0e12]">
                        <td colSpan={3} className="p-3 pl-4 uppercase text-[9px] tracking-wider text-zinc-500">Resumen de Filtro</td>
                        <td className="p-3 text-right font-mono text-zinc-400 text-xs">${(filteredSalesHistory.reduce((a,b)=>a+(b.total/1.15),0)).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-zinc-500 text-xs">${(filteredSalesHistory.reduce((a,b)=>a+(b.total - (b.total/1.15)),0)).toFixed(2)}</td>
                        <td className="p-3 text-right font-mono text-[#00ff41] text-sm font-black">${(filteredSalesHistory.reduce((a,b)=>a+b.total,0)).toFixed(2)}</td>
                        <td colSpan={4}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Footer */}
              <div className="bg-[#0c0c0e] border-t border-zinc-800/80 p-4 shrink-0 flex justify-between items-center px-6">
                <span className="text-[10px] font-display font-bold uppercase text-zinc-500 tracking-wider">Mostrando {filteredSalesHistory.length} de {salesHistory.length} Ventas del mes</span>
                <button 
                  onClick={() => setIsSalesHistoryModalOpen(false)}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-5 py-2 rounded-xl text-xs font-display font-bold uppercase tracking-wider border border-zinc-800 active:scale-95 transition-all"
                >
                  Cerrar (ESC)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Initial Cash Modal - REMOVED AS REQUESTED */}

      {/* Corte de Caja / Arqueo de Turno Completo Modal (F11 / F10) */}
      <AnimatePresence>
        {isCorteModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[180] flex items-center justify-center p-3 sm:p-5 overflow-y-auto custom-scrollbar">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-[#0c0c0e] border border-zinc-800 rounded-3xl w-full max-w-5xl my-auto overflow-hidden shadow-2xl flex flex-col max-h-[94vh]"
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-zinc-800/80 bg-[#101014] flex items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="p-3 rounded-2xl bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/20">
                    <Lock size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-display font-black text-white uppercase tracking-wider">
                        Cierre de Turno y Arqueo de Caja
                      </h2>
                      <span className="bg-[#00ff41]/10 text-[#00ff41] text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border border-[#00ff41]/20 uppercase">
                        TENDI POS
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-sans mt-0.5">
                      Resumen contable de operaciones, desglose de formas de cobro y cuadre de efectivo físico.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrintCierreReport}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-xs font-display font-bold uppercase transition-all"
                    title="Imprimir Resumen de Cierre Z"
                  >
                    <Printer size={15} className="text-amber-400" />
                    <span className="hidden sm:inline">Imprimir Reporte Z</span>
                  </button>

                  <button
                    onClick={() => setIsCorteModalOpen(false)}
                    className="p-2 text-zinc-500 hover:text-white rounded-xl hover:bg-zinc-800 transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                {/* TOP SUMMARY RIBBON - Flujo de Efectivo en Caja */}
                <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3 border-b border-zinc-800/80 pb-2">
                    <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                      <Banknote size={14} className="text-[#00ff41]" />
                      Cálculo de Efectivo Esperado en Cajón Físico
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800/80 px-2.5 py-0.5 rounded-md border border-zinc-700/50">
                      {turnSalesSummary.count} Transacciones en Turno
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[9px] font-display font-bold text-zinc-400 uppercase tracking-wider">1. Fondo Inicial</span>
                      <span className="text-sm font-mono font-bold text-zinc-200 mt-1">${(dineroInicial || 0).toFixed(2)}</span>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[9px] font-display font-bold text-emerald-400 uppercase tracking-wider">2. (+) Ventas Efectivo</span>
                      <span className="text-sm font-mono font-bold text-emerald-400 mt-1">+${turnSalesSummary.efectivo.toFixed(2)}</span>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[9px] font-display font-bold text-zinc-300 uppercase tracking-wider">3. (+) Ingresos Caja</span>
                      <span className="text-sm font-mono font-bold text-zinc-300 mt-1">+${turnMovementsSummary.ingresos.toFixed(2)}</span>
                    </div>

                    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[9px] font-display font-bold text-rose-400 uppercase tracking-wider">4. (-) Egresos / Gastos</span>
                      <span className="text-sm font-mono font-bold text-rose-400 mt-1">-${turnMovementsSummary.egresos.toFixed(2)}</span>
                    </div>

                    <div className="col-span-2 sm:col-span-1 bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 flex flex-col justify-between">
                      <span className="text-[9px] font-display font-black text-[#00ff41] uppercase tracking-wider">EFECTIVO ESPERADO</span>
                      <span className="text-lg font-mono font-black text-[#00ff41] mt-0.5">${efectivoEsperado.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* MAIN GRID: 2 COLUMNS BALANCED */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  
                  {/* COLUMN 1: ARQUEO FÍSICO (Acción Principal del Cajero) */}
                  <div className="space-y-3">
                    {/* Input Efectivo Físico */}
                    <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-display font-extrabold uppercase tracking-wider text-zinc-300">
                          Paso 1: Ingrese Efectivo Físico Contado ($)
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowBillCounter(!showBillCounter)}
                          className="text-[10px] font-display font-bold text-emerald-400 hover:text-emerald-300 hover:underline uppercase flex items-center gap-1"
                        >
                          <FileText size={12} />
                          {showBillCounter ? 'Ocultar Desglose' : 'Usar Calculadora Billetes'}
                        </button>
                      </div>

                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono font-bold text-2xl">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={physicalCash}
                          onChange={(e) => setPhysicalCash(e.target.value)}
                          placeholder="0.00"
                          className="w-full bg-zinc-900 border-2 border-zinc-700 rounded-xl p-3 pl-10 text-2xl font-mono font-black text-white outline-none focus:border-[#00ff41] transition-all"
                          autoFocus
                        />
                      </div>

                      {/* Calculadora de Billetes Integrada */}
                      {showBillCounter && (
                        <div className="pt-2 border-t border-zinc-800 space-y-2.5">
                          <span className="text-[9px] font-display font-bold uppercase text-zinc-400 block">
                            Conteo por denominación (Ecuador - USD):
                          </span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[
                              { key: 'b100', label: '$100 Billete', val: 100 },
                              { key: 'b50', label: '$50 Billete', val: 50 },
                              { key: 'b20', label: '$20 Billete', val: 20 },
                              { key: 'b10', label: '$10 Billete', val: 10 },
                              { key: 'b5', label: '$5 Billete', val: 5 },
                              { key: 'b1', label: '$1 Billete/Moneda', val: 1 },
                              { key: 'm050', label: '$0.50 Moneda', val: 0.5 },
                              { key: 'm025', label: '$0.25 Moneda', val: 0.25 },
                              { key: 'm010', label: '$0.10 Moneda', val: 0.1 }
                            ].map(item => (
                              <div key={item.key} className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-1.5 flex flex-col items-center">
                                <span className="text-[8px] font-display font-bold text-zinc-400 mb-1">{item.label}</span>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={billCounts[item.key] || ''}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value) || 0);
                                    setBillCounts(prev => ({ ...prev, [item.key]: val }));
                                  }}
                                  className="w-full bg-black/60 border border-zinc-700/80 rounded-md text-center font-mono font-bold text-xs text-white p-0.5 outline-none focus:border-[#00ff41]"
                                />
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center justify-between bg-zinc-900 p-2 rounded-xl border border-zinc-800">
                            <span className="text-xs font-display font-bold text-zinc-300">Suma: <strong className="font-mono text-emerald-400">${calculatedBillTotal.toFixed(2)}</strong></span>
                            <button
                              type="button"
                              onClick={() => setPhysicalCash(calculatedBillTotal.toFixed(2))}
                              className="px-2.5 py-1 bg-[#00ff41] text-black font-display font-black text-[9px] uppercase rounded-lg hover:bg-[#00e139] transition-all"
                            >
                              Aplicar a Efectivo
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Resultado de Arqueo (Diferencia) */}
                    {(() => {
                      const counted = parseFloat(physicalCash) || 0;
                      const diff = counted - efectivoEsperado;
                      const isExact = Math.abs(diff) < 0.009;
                      const isSurplus = diff > 0.009;

                      return (
                        <div className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
                          isExact
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
                            : isSurplus
                            ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                            : 'bg-rose-950/30 border-rose-500/40 text-rose-400'
                        }`}>
                          <div>
                            <span className="text-[9px] font-display font-extrabold uppercase tracking-wider block opacity-80">
                              Resultado de Arqueo
                            </span>
                            <span className="text-xs font-display font-bold uppercase tracking-wider mt-0.5 block">
                              {isExact ? '✓ CAJA CUADRADA EXACTA' : isSurplus ? '↑ SOBRANTE EN CAJA' : '↓ FALTANTE EN CAJA'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-mono font-black tracking-tight block">
                              ${diff >= 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Observaciones / Novedades */}
                    <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-3.5 space-y-1.5">
                      <label className="block text-[10px] font-display font-extrabold uppercase tracking-wider text-zinc-400">
                        Observaciones / Novedades del Turno
                      </label>
                      <textarea
                        rows={2}
                        value={cierreNotes}
                        onChange={(e) => setCierreNotes(e.target.value)}
                        placeholder="Escriba aquí si hubo alguna novedad con billetes o vuelto..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs font-sans text-white placeholder:text-zinc-600 outline-none focus:border-[#00ff41] custom-scrollbar resize-none"
                      />
                    </div>
                  </div>

                  {/* COLUMN 2: DESGLOSES AUDITABLES Y OTROS MEDIOS DE PAGO */}
                  <div className="space-y-3">
                    {/* Resumen de Ventas por Medio */}
                    <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-zinc-300">
                          Resumen de Ventas por Método de Pago
                        </span>
                        <span className="text-[10px] font-mono font-bold text-white">
                          Total: ${turnSalesSummary.total.toFixed(2)}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        {/* EFECTIVO */}
                        <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30">
                          <div>
                            <span className="font-display font-bold text-zinc-200 block text-[11px]">Efectivo en Ventas (SRI 01)</span>
                            <span className="text-[9px] text-emerald-400 font-sans">Dinero físico en cajón</span>
                          </div>
                          <span className="font-mono font-bold text-[#00ff41] text-xs">${turnSalesSummary.efectivo.toFixed(2)}</span>
                        </div>

                        {/* OTROS MEDIOS */}
                        <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] text-zinc-400 font-display font-bold uppercase border-b border-zinc-800/60 pb-1">
                            <span>Ventas Banco / Crédito (No buscan en caja)</span>
                            <span className="font-mono text-zinc-300">
                              Subtotal: ${(turnSalesSummary.transferencia + turnSalesSummary.tarjeta + turnSalesSummary.credito).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] pt-0.5">
                            <span className="text-zinc-400">Transferencias / Deuna (SRI 20)</span>
                            <span className="font-mono font-semibold text-zinc-200">${turnSalesSummary.transferencia.toFixed(2)}</span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Tarjetas / Vouchers (SRI 19)</span>
                            <span className="font-mono font-semibold text-zinc-200">${turnSalesSummary.tarjeta.toFixed(2)}</span>
                          </div>

                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-400">Crédito / Cuentas x Cobrar (SRI 14)</span>
                            <span className="font-mono font-semibold text-zinc-200">${turnSalesSummary.credito.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Egresos y Salidas de Caja */}
                    <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-4 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <span className="text-[10px] font-display font-extrabold uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                          <ArrowRightLeft size={13} className="text-rose-400" />
                          Movimientos & Egresos de Caja
                        </span>
                        <span className="text-[10px] font-mono font-bold text-rose-400">
                          -${turnMovementsSummary.egresos.toFixed(2)} Total
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                          <span className="text-zinc-300 text-[11px]">Compras Mercadería (Pagadas en Efectivo)</span>
                          <span className="font-mono font-bold text-rose-400">-${turnMovementsSummary.comprasEfectivo.toFixed(2)}</span>
                        </div>

                        <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                          <span className="text-zinc-300 text-[11px]">Otros Egresos / Retiros Varios</span>
                          <span className="font-mono font-bold text-rose-400">-${turnMovementsSummary.egresosVarios.toFixed(2)}</span>
                        </div>

                        {turnMovementsSummary.ingresos > 0 && (
                          <div className="flex items-center justify-between p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                            <span className="text-zinc-300 text-[11px]">Ingresos Manuales Extra</span>
                            <span className="font-mono font-bold text-emerald-400">+${turnMovementsSummary.ingresos.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Detalle individual de egresos */}
                        {turnMovementsSummary.egresosList.length > 0 && (
                          <div className="pt-1.5 space-y-1">
                            <span className="text-[9px] font-display font-bold uppercase text-zinc-400 block px-0.5">
                              Detalle registrado ({turnMovementsSummary.egresosList.length}):
                            </span>
                            <div className="max-h-28 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                              {turnMovementsSummary.egresosList.map((item, idx) => (
                                <div key={idx} className="p-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[10px] flex items-center justify-between gap-2">
                                  <span className="text-zinc-300 font-medium truncate">{item.reason}</span>
                                  <span className="font-mono font-bold text-rose-400 shrink-0">-${item.amount.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-5 border-t border-zinc-800 bg-[#101014] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handlePrintCierreReport}
                  className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white px-4 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider border border-zinc-800 flex items-center gap-2 transition-all"
                >
                  <Printer size={15} className="text-amber-400" />
                  Imprimir Ticket Z
                </button>

                <div className="flex items-center gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsCorteModalOpen(false)}
                    className="bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white px-5 py-2.5 rounded-xl text-xs font-display font-bold uppercase tracking-wider border border-zinc-800 transition-all"
                  >
                    Cancelar (ESC)
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      handleCorteDeCaja(efectivoEsperado);
                      setPhysicalCash('');
                      setCierreNotes('');
                    }}
                    className="bg-[#00ff41] text-black hover:bg-[#00e139] px-6 py-2.5 rounded-xl font-display font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00ff41]/10"
                  >
                    <CheckCircle2 size={16} />
                    Cerrar Turno y Transferir a Central
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {isVariosModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#111] border-2 border-[#00ff41] rounded-[2.5rem] p-8 w-full max-w-md shadow-[0_0_100px_rgba(0,255,65,0.2)]"
            >
              <div className="flex items-center gap-4 mb-8">
                <div className="bg-[#00ff41] p-3 rounded-2xl">
                  <Plus className="text-black w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">Artículo Varios</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Descripción</label>
                  <input
                    ref={variosInputRef}
                    type="text"
                    value={variosData.name}
                    onChange={(e) => setVariosData({ ...variosData, name: e.target.value })}
                    placeholder="EJ: PAN ARTESANAL"
                    className="w-full bg-[#1a1a1a] border-2 border-white/5 rounded-2xl p-4 text-xl font-bold text-white outline-none focus:border-[#00ff41] transition-all uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Precio de Venta</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xl">$</span>
                    <input
                      type="number"
                      value={variosData.price}
                      onChange={(e) => setVariosData({ ...variosData, price: e.target.value })}
                      placeholder="0.00"
                      className="w-full bg-[#1a1a1a] border-2 border-white/5 rounded-2xl p-4 pl-10 text-xl font-bold text-[#00ff41] outline-none focus:border-[#00ff41] transition-all"
                    />
                  </div>
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsVariosModalOpen(false)}
                    className="flex-1 bg-gray-800 text-gray-400 py-4 rounded-2xl font-black text-sm hover:bg-white hover:text-black transition-all"
                  >
                    CANCELAR (ESC)
                  </button>
                  <button 
                    onClick={handleAddVarios}
                    className="flex-[2] bg-[#00ff41] text-black py-4 rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
                  >
                    AGREGAR (ENTER)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cash Movement Modal (F7/F8) */}
      <AnimatePresence>
        {isCashModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className={`bg-[#111] border-2 ${isCashModalOpen === 'in' ? 'border-blue-500 shadow-[0_0_100px_rgba(59,130,246,0.2)]' : 'border-orange-500 shadow-[0_0_100px_rgba(249,115,22,0.2)]'} rounded-[2.5rem] p-8 w-full max-w-md`}
            >
              <div className="flex items-center gap-4 mb-8">
                <div className={`p-3 rounded-2xl ${isCashModalOpen === 'in' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                  <ArrowRightLeft className="text-white w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black uppercase tracking-tighter">
                  {isCashModalOpen === 'in' ? 'Entrada de Efectivo' : 'EGRESO/TRANSFERENCIA'}
                </h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Monto</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xl">$</span>
                    <input
                      ref={cashAmountRef}
                      type="number"
                      value={cashData.amount}
                      onChange={(e) => setCashData({ ...cashData, amount: e.target.value })}
                      placeholder="0.00"
                      className={`w-full bg-[#1a1a1a] border-2 border-white/5 rounded-2xl p-4 pl-10 text-xl font-bold outline-none transition-all ${isCashModalOpen === 'in' ? 'text-blue-400 focus:border-blue-500' : 'text-orange-400 focus:border-orange-500'}`}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 ml-1">Referencia / Motivo</label>
                  <input
                    type="text"
                    value={cashData.reason}
                    onChange={(e) => setCashData({ ...cashData, reason: e.target.value })}
                    placeholder="EJ: PAGO A PROVEEDOR"
                    className="w-full bg-[#1a1a1a] border-2 border-white/5 rounded-2xl p-4 text-xl font-bold text-white outline-none focus:border-white/20 transition-all uppercase"
                  />
                </div>
                
                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsCashModalOpen(null)}
                    className="flex-1 bg-gray-800 text-gray-400 py-4 rounded-2xl font-black text-sm hover:bg-white hover:text-black transition-all"
                  >
                    CANCELAR
                  </button>
                  <button 
                    onClick={handleCashMovement}
                    className={`flex-[2] py-4 rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-[0.98] transition-all text-white ${isCashModalOpen === 'in' ? 'bg-blue-600' : 'bg-red-600'}`}
                  >
                    REGISTRAR (ENTER)
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ticket Detail Modal (Review/Modify) */}
      <AnimatePresence>
        {isDetailModalOpen && selectedSale && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white text-black rounded-[3rem] p-10 w-full max-w-2xl shadow-[0_50px_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-black p-4 rounded-2xl">
                    <Printer className="text-[#00ff41] w-8 h-8" />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter">Detalle de Ticket</h2>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                      {isEditMode ? 'Modo Edición' : 'Modo Lectura'}
                    </p>
                  </div>
                </div>
                <button onClick={() => setIsDetailModalOpen(false)} className="text-gray-400 hover:text-black transition-colors">
                  <X size={32} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar-light">
                <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 mb-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                    <div>
                      <span className="block mb-1">Cliente</span>
                      <span className="text-black text-sm font-bold">{selectedSale.customer}</span>
                    </div>
                    <div>
                      <span className="block mb-1">Forma de Pago</span>
                      <span className="text-black text-sm font-bold flex items-center gap-1">
                        {selectedSale.paymentMethod?.startsWith('MIXTO') || (selectedSale.paymentLines && selectedSale.paymentLines.length > 1) ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-md font-mono text-xs inline-flex items-center gap-1">
                            ⚡ COBRO MIXTO
                          </span>
                        ) : (
                          selectedSale.paymentMethod || 'EFECTIVO'
                        )}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block mb-1">Fecha/Hora</span>
                      <span className="text-black text-sm font-bold">
                        {new Date(selectedSale.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Payment Lines Breakdown if available */}
                  {selectedSale.paymentLines && selectedSale.paymentLines.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <span className="block text-[9px] font-black uppercase tracking-wider text-gray-500 mb-2">
                        Desglose de Formas de Cobro ({selectedSale.paymentLines.length} Líneas):
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {selectedSale.paymentLines.map((line: any, i: number) => (
                          <div key={i} className="bg-white border border-gray-200 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
                            <span className="text-[10px] font-bold uppercase text-gray-600">{line.type}:</span>
                            <span className="font-mono font-black text-sm text-black">${Number(line.value).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {selectedSale.transferVoucherImage && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl mb-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-black border border-emerald-300 shrink-0">
                        <img src={selectedSale.transferVoucherImage} alt="Voucher" className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <span className="block font-black text-xs text-emerald-900 uppercase">Comprobante de Transferencia</span>
                        <span className="text-[10px] text-emerald-700 font-bold uppercase">Adjuntado en el cobro</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setViewingVoucherImage(selectedSale.transferVoucherImage)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-black text-[10px] uppercase flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Eye size={14} />
                      Ver Comprobante
                    </button>
                  </div>
                )}

                <table className="w-full text-left border-collapse mb-6">
                  <thead>
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="p-4">Producto</th>
                      <th className="p-4 text-center">Cant.</th>
                      <th className="p-4 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {selectedSale.items.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-4">
                          <span className="block font-black uppercase text-sm">{item.name}</span>
                          <span className="text-[10px] text-gray-400 font-bold">${item.price.toFixed(2)} c/u</span>
                        </td>
                        <td className="p-4 text-center">
                          {isEditMode ? (
                            <div className="inline-flex items-center gap-3 bg-gray-100 px-3 py-1 rounded-lg">
                              <button onClick={() => updateDetailQuantity(idx, -1)} className="text-gray-500 hover:text-black"><Minus size={14} /></button>
                              <span className="font-black text-sm w-4 text-center">{item.quantity}</span>
                              <button onClick={() => updateDetailQuantity(idx, 1)} className="text-gray-500 hover:text-black"><Plus size={14} /></button>
                            </div>
                          ) : (
                            <span className="font-black text-sm">{item.quantity}</span>
                          )}
                        </td>
                        <td className="p-4 text-right font-sans font-black text-lg">
                          ${(item.price * item.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-gray-100 pt-8 mt-4">
                <div className="flex justify-between items-center mb-8">
                  <span className="text-gray-400 font-black uppercase text-xs tracking-widest">Total Ticket</span>
                  <span className="text-5xl font-sans font-black text-black">
                    ${selectedSale.items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0).toFixed(2)}
                  </span>
                </div>

                <div className="flex gap-4">
                  {!isEditMode ? (
                    <>
                      <button 
                        onClick={() => setIsEditMode(true)}
                        className="flex-1 bg-black text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-800 transition-all flex items-center justify-center gap-3"
                      >
                        <ArrowRightLeft size={20} />
                        MODIFICAR VENTA
                      </button>
                      <button 
                        onClick={() => setIsDetailModalOpen(false)}
                        className="flex-1 bg-gray-100 text-gray-500 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                      >
                        CERRAR
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        onClick={handleUpdateSale}
                        className="flex-[2] bg-[#00ff41] text-black py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-[#00cc33] transition-all flex items-center justify-center gap-3"
                      >
                        <CheckCircle2 size={20} />
                        GUARDAR CAMBIOS
                      </button>
                      <button 
                        onClick={() => setIsEditMode(false)}
                        className="flex-1 bg-gray-100 text-gray-500 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                      >
                        CANCELAR
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>



      {/* Compras & Liquidaciones SRI Modal */}
      <AnimatePresence>
        {isPurchaseModalOpen && (
          <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-[200] flex items-center justify-center p-3 sm:p-6">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-5 sm:p-7 w-full max-w-5xl shadow-[0_50px_150px_rgba(0,0,0,1)] max-h-[90vh] flex flex-col relative text-zinc-100"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl sm:text-2xl font-display font-black uppercase tracking-tight text-white flex items-center gap-2">
                      Comprobante de Compra y Liquidaciones SRI
                    </h2>
                    <p className="text-zinc-500 text-[10px] font-display font-bold uppercase tracking-widest mt-0.5">
                      Registro de ingresos de mercadería, costos, proveedores y liquidaciones de compra (Tipo 03)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPurchaseActiveTab('NUEVA')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase transition-all ${
                        purchaseActiveTab === 'NUEVA' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Nueva Compra
                    </button>
                    <button
                      type="button"
                      onClick={() => setPurchaseActiveTab('HISTORIAL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold uppercase transition-all ${
                        purchaseActiveTab === 'HISTORIAL' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Historial ({purchasesHistory.length})
                    </button>
                  </div>

                  <button
                    onClick={() => setIsPurchaseModalOpen(false)}
                    className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-full transition-all border border-zinc-800"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pt-4 space-y-5 pr-1">
                {purchaseActiveTab === 'NUEVA' ? (
                  <>
                    {/* Supplier & Doc Settings */}
                    <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-2xl p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Supplier Selector */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-display font-bold text-zinc-400 uppercase tracking-wider">
                              PROVEEDOR REGISTRADO
                            </label>
                            <button
                              type="button"
                              onClick={() => setIsSupplierModalOpen(true)}
                              className="text-[10px] font-display font-bold text-indigo-400 hover:text-indigo-300 uppercase flex items-center gap-1"
                            >
                              <Plus size={12} /> Nuevo Proveedor
                            </button>
                          </div>
                          <select
                            value={selectedSupplier?.ruc || ''}
                            onChange={(e) => {
                              const found = suppliers.find(s => s.ruc === e.target.value);
                              if (found) setSelectedSupplier(found);
                            }}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase transition-all"
                          >
                            {suppliers.map(s => (
                              <option key={s.id || s.ruc} value={s.ruc}>
                                {s.name} - RUC: {s.ruc}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Document Type */}
                        <div>
                          <label className="block text-[10px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                            TIPO DE COMPROBANTE DE COMPRA
                          </label>
                          <select
                            value={purchaseDocType}
                            onChange={(e: any) => setPurchaseDocType(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-indigo-300 outline-none focus:border-indigo-500 uppercase transition-all"
                          >
                            <option value="FACTURA_PROVEEDOR">FACTURA DE PROVEEDOR DE MERCADERÍA</option>
                            <option value="LIQUIDACION_COMPRA_SRI_03">LIQUIDACIÓN DE COMPRA DE BIENES Y SERVICIOS (SRI 03)</option>
                          </select>
                        </div>
                      </div>

                      {/* Number, Authorization & Payment Method */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-zinc-800/60">
                        <div>
                          <label className="block text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider mb-1">
                            Nº SERIE / DOCUMENTO
                          </label>
                          <input
                            type="text"
                            value={purchaseDocNumber}
                            onChange={e => setPurchaseDocNumber(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                            placeholder="000-000-000000000"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider mb-1">
                            AUTORIZACIÓN SRI (OPCIONAL)
                          </label>
                          <input
                            type="text"
                            value={purchaseAuthNumber}
                            onChange={e => setPurchaseAuthNumber(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono text-white outline-none focus:border-indigo-500"
                            placeholder="Clave de acceso"
                          />
                        </div>

                        <div>
                          <label className="block text-[9px] font-display font-bold text-zinc-500 uppercase tracking-wider mb-1">
                            FORMA DE PAGO
                          </label>
                          <select
                            value={purchasePaymentMethod}
                            onChange={(e: any) => setPurchasePaymentMethod(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase"
                          >
                            <option value="EFECTIVO">EFECTIVO (EGRESO CAJA)</option>
                            <option value="TRANSFERENCIA">TRANSFERENCIA BANCARIA</option>
                            <option value="CREDITO_PROVEEDOR">CRÉDITO PROVEEDOR</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Items Entry Bar */}
                    <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                      <span className="block text-xs font-display font-bold text-indigo-400 uppercase tracking-wider">
                        AGREGAR PRODUCTO O MERCADERÍA A LA COMPRA
                      </span>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                        {/* Search product */}
                        <div className="md:col-span-5">
                          <input
                            type="text"
                            value={purchaseSearch}
                            onChange={e => setPurchaseSearch(e.target.value)}
                            placeholder="BUSCAR PRODUCTO POR CÓDIGO O NOMBRE..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase placeholder:text-zinc-600"
                          />
                        </div>

                        {/* Qty */}
                        <div className="md:col-span-2">
                          <input
                            type="number"
                            min="1"
                            value={purchaseItemQty}
                            onChange={e => setPurchaseItemQty(e.target.value)}
                            placeholder="CANT"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500 text-center"
                          />
                        </div>

                        {/* Cost Price */}
                        <div className="md:col-span-2">
                          <input
                            type="number"
                            step="0.01"
                            value={purchaseItemCost}
                            onChange={e => setPurchaseItemCost(e.target.value)}
                            placeholder="P. COSTO ($)"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono font-bold text-indigo-300 outline-none focus:border-indigo-500 text-center"
                          />
                        </div>

                        {/* Vat */}
                        <div className="md:col-span-1">
                          <select
                            value={purchaseItemVat}
                            onChange={(e: any) => setPurchaseItemVat(parseInt(e.target.value) as 15 | 0)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                          >
                            <option value={15}>15%</option>
                            <option value={0}>0%</option>
                          </select>
                        </div>

                        {/* Add Button */}
                        <div className="md:col-span-2">
                          <button
                            type="button"
                            onClick={() => {
                              const q = purchaseSearch.trim().toUpperCase();
                              if (!q) {
                                alert("Escriba el nombre o código del producto.");
                                return;
                              }
                              const found = allProducts.find(p => p.code.toUpperCase().includes(q) || p.name.toUpperCase().includes(q));
                              const qty = parseInt(purchaseItemQty) || 1;
                              const cost = parseFloat(purchaseItemCost) || (found ? (found.costPrice || found.price * 0.7) : 1.00);

                              const newItem = {
                                id: Date.now(),
                                productId: found?.id,
                                code: found ? found.code : `COMP-${Date.now().toString().slice(-4)}`,
                                name: found ? found.name : q,
                                costPrice: cost,
                                quantity: qty,
                                vatRate: purchaseItemVat,
                                createIfMissing: !found
                              };

                              setPurchaseCart(prev => [...prev, newItem]);
                              setPurchaseSearch('');
                              setPurchaseItemCost('');
                              setPurchaseItemQty('1');
                            }}
                            className="w-full h-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-display font-black uppercase transition-all flex items-center justify-center gap-1.5 p-2"
                          >
                            <Plus size={14} /> Agregar
                          </button>
                        </div>
                      </div>

                      {/* Quick Suggestions */}
                      {purchaseSearch.trim().length > 0 && (
                        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 max-h-36 overflow-y-auto custom-scrollbar space-y-1">
                          {allProducts
                            .filter(p => p.name.toUpperCase().includes(purchaseSearch.trim().toUpperCase()) || p.code.toUpperCase().includes(purchaseSearch.trim().toUpperCase()))
                            .map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setPurchaseSearch(p.name);
                                  setPurchaseItemCost((p.costPrice || (p.price * 0.75)).toFixed(2));
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-indigo-500/10 flex items-center justify-between text-xs font-display font-bold text-zinc-300 hover:text-white"
                              >
                                <span>{p.code} - {p.name}</span>
                                <span className="font-mono text-indigo-400">P. Venta: ${p.price.toFixed(2)} | Stock: {p.stock}</span>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Added Items Table */}
                    <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-display font-bold text-zinc-300 uppercase tracking-wider">
                          DETALLE DEL COMPROBANTE DE COMPRA ({purchaseCart.length} ÍTEMS)
                        </span>
                        {purchaseCart.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setPurchaseCart([])}
                            className="text-[10px] font-display font-bold text-red-400 hover:text-red-300 uppercase flex items-center gap-1"
                          >
                            <Trash2 size={12} /> Vaciar Detalle
                          </button>
                        )}
                      </div>

                      {purchaseCart.length === 0 ? (
                        <div className="text-center py-8 text-zinc-600 font-display font-bold text-xs uppercase tracking-wider border border-dashed border-zinc-800 rounded-xl">
                          No hay productos en el comprobante de compra. Busca arriba para agregar.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs font-display">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-500 text-[9px] uppercase tracking-wider">
                                <th className="p-2">Código</th>
                                <th className="p-2">Producto</th>
                                <th className="p-2 text-center">Cant</th>
                                <th className="p-2 text-right">P. Costo</th>
                                <th className="p-2 text-center">Tarifa IVA</th>
                                <th className="p-2 text-right">Subtotal</th>
                                <th className="p-2 text-center">Acción</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60 font-bold">
                              {purchaseCart.map((it, idx) => (
                                <tr key={it.id || idx} className="hover:bg-zinc-900/50 transition-colors">
                                  <td className="p-2 font-mono text-zinc-400 text-[10px]">{it.code}</td>
                                  <td className="p-2 text-white">{it.name}</td>
                                  <td className="p-2 text-center font-mono text-indigo-300">{it.quantity}</td>
                                  <td className="p-2 text-right font-mono text-white">${it.costPrice.toFixed(2)}</td>
                                  <td className="p-2 text-center font-mono text-zinc-400">{it.vatRate}%</td>
                                  <td className="p-2 text-right font-mono text-[#00ff41]">${(it.costPrice * it.quantity).toFixed(2)}</td>
                                  <td className="p-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => setPurchaseCart(prev => prev.filter((_, i) => i !== idx))}
                                      className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Summary & Register Action */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-display font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
                          OBSERVACIONES / NOTAS
                        </label>
                        <textarea
                          value={purchaseNotes}
                          onChange={e => setPurchaseNotes(e.target.value)}
                          rows={3}
                          placeholder="AGREGAR NOTAS ADICIONALES DEL PROVEEDOR O COMPROBANTE..."
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase placeholder:text-zinc-600"
                        />
                      </div>

                      <div className="bg-[#0c0c0e] border border-zinc-800/80 rounded-2xl p-4 space-y-2">
                        {(() => {
                          const sub15 = purchaseCart.reduce((acc, it) => it.vatRate === 15 ? acc + (it.costPrice * it.quantity) : acc, 0);
                          const sub0 = purchaseCart.reduce((acc, it) => it.vatRate === 0 ? acc + (it.costPrice * it.quantity) : acc, 0);
                          const vat = sub15 * 0.15;
                          const tot = sub15 + sub0 + vat;
                          return (
                            <>
                              <div className="flex justify-between text-xs font-display text-zinc-400">
                                <span>Subtotal IVA 15%:</span>
                                <span className="font-mono text-white">${sub15.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-xs font-display text-zinc-400">
                                <span>Subtotal IVA 0%:</span>
                                <span className="font-mono text-white">${sub0.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-xs font-display text-zinc-400">
                                <span>Monto IVA 15%:</span>
                                <span className="font-mono text-indigo-300">${vat.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-base font-display font-black text-white pt-2 border-t border-zinc-800">
                                <span>TOTAL COMPRA:</span>
                                <span className="font-mono text-[#00ff41]">${tot.toFixed(2)}</span>
                              </div>

                              <button
                                type="button"
                                onClick={handleSavePurchase}
                                className="w-full mt-3 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-95"
                              >
                                <Printer size={16} /> REGISTRAR Y EMITIR COMPROBANTE PDF
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  /* History Tab */
                  <div className="space-y-3">
                    {purchasesHistory.length === 0 ? (
                      <div className="text-center py-12 text-zinc-500 font-display font-bold text-xs uppercase">
                        No hay comprobantes de compra registrados.
                      </div>
                    ) : (
                      purchasesHistory.map((p) => (
                        <div key={p.id} className="bg-[#0c0c0e] border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-400 text-xs">{p.purchaseCode}</span>
                              <span className="bg-zinc-800 text-zinc-300 text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase">
                                {p.documentNumber}
                              </span>
                              <span className="text-[9px] font-display font-bold text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded">
                                {p.docType === 'LIQUIDACION_COMPRA_SRI_03' ? 'LIQUIDACIÓN SRI 03' : 'FACTURA PROVEEDOR'}
                              </span>
                            </div>
                            <div className="text-xs font-display font-bold text-white mt-1">
                              Proveedor: {p.supplier?.name} (RUC: {p.supplier?.ruc})
                            </div>
                            <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                              {new Date(p.timestamp).toLocaleString('es-EC')} • Pago: {p.paymentMethod}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="block text-[9px] font-display font-bold text-zinc-500 uppercase">TOTAL</span>
                              <span className="text-lg font-mono font-black text-[#00ff41]">${p.total?.toFixed(2)}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePrintPurchaseReceipt(p)}
                              className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-display font-bold uppercase transition-all flex items-center gap-1.5"
                            >
                              <Printer size={14} /> Reimprimir PDF
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Supplier Modal */}
      <AnimatePresence>
        {isSupplierModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#09090b] border border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-zinc-100"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="text-indigo-400" size={18} />
                  <h3 className="font-display font-black text-base uppercase text-white">Registrar Nuevo Proveedor</h3>
                </div>
                <button onClick={() => setIsSupplierModalOpen(false)} className="text-zinc-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase mb-1">RUC O CÉDULA</label>
                  <input
                    type="text"
                    value={newSupplier.ruc}
                    onChange={e => setNewSupplier({ ...newSupplier, ruc: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                    placeholder="1790000000001"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase mb-1">RAZÓN SOCIAL / NOMBRE PROVEEDOR</label>
                  <input
                    type="text"
                    value={newSupplier.name}
                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value.toUpperCase() })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase"
                    placeholder="Ej. DISTRIBUIDORA ECUADOR S.A."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase mb-1">TELÉFONO</label>
                    <input
                      type="text"
                      value={newSupplier.phone}
                      onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-mono font-bold text-white outline-none focus:border-indigo-500"
                      placeholder="Teléfono"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase mb-1">CORREO</label>
                    <input
                      type="email"
                      value={newSupplier.email}
                      onChange={e => setNewSupplier({ ...newSupplier, email: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2 text-xs font-display font-bold text-white outline-none focus:border-indigo-500"
                      placeholder="ventas@proveedor.ec"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] font-display font-bold text-zinc-400 uppercase mb-1">DIRECCIÓN FÍSICA</label>
                  <input
                    type="text"
                    value={newSupplier.address}
                    onChange={e => setNewSupplier({ ...newSupplier, address: e.target.value.toUpperCase() })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 text-xs font-display font-bold text-white outline-none focus:border-indigo-500 uppercase"
                    placeholder="AV. PRINCIPAL Y SECUNDARIA..."
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleCreateSupplier}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-display font-black text-xs uppercase tracking-wider transition-all"
              >
                GUARDAR PROVEEDOR
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingVoucherImage && (
          <div 
            className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[300] flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setViewingVoucherImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-[#0d0d11] border border-zinc-800 rounded-3xl p-4 max-w-3xl w-full max-h-[90vh] flex flex-col items-center shadow-2xl overflow-hidden cursor-default"
            >
              <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800 mb-3 px-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-[#00ff41]/10 rounded-lg text-[#00ff41]">
                    <Camera size={16} />
                  </div>
                  <span className="text-xs font-display font-bold uppercase text-white tracking-wider">
                    Comprobante de Transferencia / Pago
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <a 
                    href={viewingVoucherImage} 
                    download="comprobante_tendi.jpg"
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-[10px] font-display font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download size={12} /> Descargar
                  </a>
                  <button 
                    onClick={() => setViewingVoucherImage(null)}
                    className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-full transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto flex items-center justify-center bg-black/80 rounded-2xl p-2 w-full max-h-[75vh]">
                <img 
                  src={viewingVoucherImage} 
                  alt="Comprobante Full" 
                  className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {printToast && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={`fixed bottom-4 right-4 z-[400] bg-zinc-900/90 border px-3.5 py-2 rounded-full shadow-xl backdrop-blur-md flex items-center gap-2 font-medium text-xs pointer-events-none ${
              printToast.isError
                ? 'border-amber-500/40 text-amber-400'
                : 'border-emerald-500/30 text-emerald-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full animate-pulse shrink-0 ${
              printToast.isError
                ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]'
                : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
            }`} />
            <Printer size={13} className={printToast.isError ? "text-amber-400 shrink-0" : "text-emerald-400 shrink-0"} />
            <span className="text-zinc-200 text-xs font-sans">{printToast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VENTA POR PESO / GRANEL MODAL */}
      <AnimatePresence>
        {weightModalProduct && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[250] flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 10 }}
              className="bg-[#101014] border-2 border-[#00ff41]/80 rounded-3xl p-6 max-w-lg w-full shadow-[0_0_80px_rgba(0,255,65,0.2)] flex flex-col gap-5 text-white"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#00ff41]/10 rounded-2xl border border-[#00ff41]/30 text-[#00ff41]">
                    <Scale size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-[#00ff41] bg-[#00ff41]/10 px-2 py-0.5 rounded uppercase tracking-wider">
                      VENTA POR PESO / GRANEL
                    </span>
                    <h2 className="text-lg font-display font-black uppercase text-white mt-0.5 leading-tight">
                      {weightModalProduct.name}
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWeightModalProduct(null)}
                  className="p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-all"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Price & Stock info bar */}
              <div className="bg-[#16161d] border border-zinc-800/80 rounded-2xl p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-zinc-500 font-bold block text-[10px] uppercase">PRECIO x {weightModalProduct.saleUnit || 'LB'}</span>
                  <span className="font-mono font-black text-xl text-[#00ff41]">${(weightModalProduct.price || 0).toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-zinc-500 font-bold block text-[10px] uppercase">STOCK DISPONIBLE</span>
                  <span className="font-mono font-bold text-sm text-zinc-300">{weightModalProduct.stock} {weightModalProduct.saleUnit || 'LB'}</span>
                </div>
              </div>

              {/* Tabs Mode: Peso (LB/KG) vs Monedas/Monto ($) */}
              <div className="flex bg-[#0c0c0e] p-1 rounded-xl border border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setWeightInputMode('weight');
                    setTimeout(() => weightInputRef.current?.focus(), 50);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                    weightInputMode === 'weight'
                      ? 'bg-[#00ff41] text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Scale size={14} /> POR PESO / CANTIDAD ({weightModalProduct.saleUnit || 'LB'})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeightInputMode('money');
                    setTimeout(() => weightMoneyInputRef.current?.focus(), 50);
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-display font-bold uppercase transition-all flex items-center justify-center gap-2 ${
                    weightInputMode === 'money'
                      ? 'bg-[#00ff41] text-black shadow-md'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <DollarSign size={14} /> POR VALOR / DINERO ($)
                </button>
              </div>

              {/* Mode 1: Input by Weight */}
              {weightInputMode === 'weight' ? (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 block">
                    Ingrese el Peso o Cantidad Exacta ({weightModalProduct.saleUnit || 'LB'}):
                  </label>
                  <div className="relative">
                    <input
                      ref={weightInputRef}
                      type="number"
                      step="0.001"
                      min="0.001"
                      value={weightInputValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWeightInputValue(val);
                        const num = parseFloat(val) || 0;
                        setWeightMoneyValue((num * weightModalProduct.price).toFixed(2));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmWeight();
                        }
                      }}
                      className="w-full bg-[#0a0a0e] border-2 border-zinc-800 focus:border-[#00ff41] text-white font-mono font-black text-3xl px-4 py-3 rounded-2xl outline-none text-right tracking-wider transition-all"
                      placeholder="1.000"
                      autoFocus
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono font-bold text-sm">
                      {weightModalProduct.saleUnit || 'LB'}
                    </span>
                  </div>

                  {/* Weight Preset Buttons */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">RÁPIDOS:</span>
                    {[0.25, 0.50, 1.00, 2.00, 5.00].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => {
                          setWeightInputValue(w.toFixed(3));
                          setWeightMoneyValue((w * weightModalProduct.price).toFixed(2));
                        }}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-[#00ff41]/20 text-zinc-300 hover:text-[#00ff41] border border-zinc-800 hover:border-[#00ff41]/40 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                      >
                        {w.toFixed(2)} {weightModalProduct.saleUnit || 'LB'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Mode 2: Input by Money */
                <div className="space-y-3">
                  <label className="text-xs font-bold text-zinc-400 block">
                    Ingrese el Monto en Dólares ($):
                  </label>
                  <div className="relative">
                    <input
                      ref={weightMoneyInputRef}
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={weightMoneyValue}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWeightMoneyValue(val);
                        const money = parseFloat(val) || 0;
                        if (weightModalProduct.price > 0) {
                          setWeightInputValue((money / weightModalProduct.price).toFixed(3));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleConfirmWeight();
                        }
                      }}
                      className="w-full bg-[#0a0a0e] border-2 border-zinc-800 focus:border-[#00ff41] text-[#00ff41] font-mono font-black text-3xl px-4 py-3 rounded-2xl outline-none text-right tracking-wider transition-all"
                      placeholder="2.00"
                      autoFocus
                    />
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 font-mono font-bold text-lg">
                      $
                    </span>
                  </div>

                  {/* Money Preset Buttons */}
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase mr-1">RÁPIDOS:</span>
                    {[0.50, 1.00, 2.00, 3.00, 5.00, 10.00].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setWeightMoneyValue(m.toFixed(2));
                          if (weightModalProduct.price > 0) {
                            setWeightInputValue((m / weightModalProduct.price).toFixed(3));
                          }
                        }}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-[#00ff41]/20 text-zinc-300 hover:text-[#00ff41] border border-zinc-800 hover:border-[#00ff41]/40 rounded-lg text-xs font-mono font-bold transition-all active:scale-95"
                      >
                        ${m.toFixed(2)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Calculated Summary Box */}
              <div className="bg-[#00ff41]/5 border border-[#00ff41]/20 rounded-2xl p-4 flex items-center justify-between mt-1">
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase">PESO CALCULADO</span>
                  <span className="font-mono font-black text-xl text-white">
                    {(parseFloat(weightInputValue) || 0).toFixed(3)} {weightModalProduct.saleUnit || 'LB'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-zinc-400 block uppercase">SUBTOTAL A COBRAR</span>
                  <span className="font-mono font-black text-2xl text-[#00ff41]">
                    ${((parseFloat(weightInputValue) || 0) * (weightModalProduct.price || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setWeightModalProduct(null)}
                  className="flex-1 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-display font-bold text-xs uppercase tracking-wider transition-all"
                >
                  CANCELAR (ESC)
                </button>
                <button
                  type="button"
                  onClick={handleConfirmWeight}
                  className="flex-[2] py-3.5 px-6 rounded-xl bg-[#00ff41] hover:bg-[#00e139] text-black font-display font-black text-sm uppercase tracking-wider shadow-lg shadow-[#00ff41]/20 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={18} /> AGREGAR AL CARRITO (ENTER)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PosPinModal 
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={handlePinSuccess}
        users={posUsers}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,255,65,0.2); }

        .custom-scrollbar-light::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-light::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-light::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar-light::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
        
        input::-webkit-outer-spin-button,
        input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}
