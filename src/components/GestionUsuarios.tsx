import React, { useEffect, useRef, useState } from 'react';
import { consultarClienteExterno } from '../lib/ecuadorValidador';
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Filter,
  Key,
  Shield,
  Star,
  Building2,
  AlertTriangle,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Search,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { SystemUser } from '../types';

export interface ExtendedSystemUser extends SystemUser {
  idType?: 'CEDULA' | 'RUC' | 'PASAPORTE';
  cedula?: string;
  email?: string;
  phone?: string;
  password?: string;
  verifyPassword?: string;
  
  // Specific TENDI Operational Flags
  canModifyEmissionDate?: boolean;
  canModifySequences?: boolean;
  isAdminReports?: boolean;
  isSalesAgent?: boolean;
  canExportExcel?: boolean;

  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;

  permissions?: {
    // Facturacion / POS
    pos_access: boolean;
    pos_discount: boolean;
    pos_reimprimir: boolean;
    pos_anular: boolean;
    
    // Inventario
    inv_ver: boolean;
    inv_ingresos: boolean;
    inv_egresos: boolean;
    inv_ajustes: boolean;
    inv_precios: boolean;

    // Caja
    caja_apertura: boolean;
    caja_cierre: boolean;
    caja_movimientos: boolean;

    // Reportes
    rep_ventas: boolean;
    rep_utilidades: boolean;

    // Administracion
    admin_usuarios: boolean;
    admin_empresas: boolean;
    admin_sri: boolean;
  };
}

type UserPermissionSet = NonNullable<ExtendedSystemUser['permissions']>;

const emptyUserPermissions = (): UserPermissionSet => ({
  pos_access: false,
  pos_discount: false,
  pos_reimprimir: false,
  pos_anular: false,
  inv_ver: false,
  inv_ingresos: false,
  inv_egresos: false,
  inv_ajustes: false,
  inv_precios: false,
  caja_apertura: false,
  caja_cierre: false,
  caja_movimientos: false,
  rep_ventas: false,
  rep_utilidades: false,
  admin_usuarios: false,
  admin_empresas: false,
  admin_sri: false
});

const permissionsForRole = (role: ExtendedSystemUser['role'] | string): UserPermissionSet => {
  const permissions = emptyUserPermissions();
  const grant = (keys: (keyof UserPermissionSet)[]) => keys.forEach(key => { permissions[key] = true; });

  switch (role) {
    case 'ADMINISTRADOR':
    case 'SUPER USUARIO':
      grant(Object.keys(permissions) as (keyof UserPermissionSet)[]);
      break;
    case 'SUPERVISOR':
      grant([
        'pos_access', 'pos_discount', 'pos_reimprimir', 'pos_anular',
        'inv_ver', 'inv_ingresos', 'inv_egresos', 'inv_ajustes',
        'caja_apertura', 'caja_cierre', 'caja_movimientos',
        'rep_ventas', 'rep_utilidades'
      ]);
      break;
    case 'FACTURADOR':
    case 'CAJERO':
      grant(['pos_access', 'pos_reimprimir', 'caja_apertura', 'caja_cierre', 'caja_movimientos', 'rep_ventas', 'inv_ver']);
      break;
    default:
      grant(['inv_ver', 'inv_ingresos', 'inv_egresos', 'inv_ajustes', 'rep_ventas']);
      break;
  }

  return permissions;
};

interface SpecialPermissionItem {
  id: string;
  name: string;
  available: boolean;
  principal?: boolean;
}

const buildSpecialItems = (
  definitions: Array<{ id: string; name: string }>,
  assignedIds: string[] = [],
  primaryId?: string
): SpecialPermissionItem[] => definitions.map(item => ({
  ...item,
  available: assignedIds.includes(item.id),
  principal: primaryId === item.id
}));

interface GestionUsuariosProps {
  usersList?: ExtendedSystemUser[];
  companiesList?: Array<{ id: string; name: string; tradeName?: string; active?: boolean }>;
  onSaveUser?: (user: ExtendedSystemUser) => void;
  onDeleteUser?: (id: string) => void;
}

export const GestionUsuarios: React.FC<GestionUsuariosProps> = ({
  usersList,
  companiesList,
  onSaveUser,
  onDeleteUser
}) => {
  // Top level tab inside window: 'Mantenimiento' or 'Permisos'
  const [subTab, setSubTab] = useState<'Mantenimiento' | 'Permisos'>('Mantenimiento');
  const [activeFilter, setActiveFilter] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  const initialUsers: ExtendedSystemUser[] = usersList ?? [];
  const availableCompanies = companiesList?.length
    ? companiesList.filter(company => company.active !== false).map(company => ({
        id: company.id,
        name: company.tradeName || company.name
      }))
    : [
        { id: '3', name: 'TMCH CAMPOZANO' },
        { id: '5', name: 'TMCH ESQUINA' },
        { id: '6', name: 'TMCH DISTRIBUCIONES' }
      ];

  const users = usersList ?? [];
  const [selectedId, setSelectedId] = useState<string>(initialUsers[0]?.id || '');
  const [mode, setMode] = useState<'VIEW' | 'NEW' | 'EDIT'>('VIEW');

  // Company context used by the permissions matrix.
  const [selectedLinkCompany, setSelectedLinkCompany] = useState<string>(availableCompanies[0]?.id || '');

  // Permisos Sub-tab & Special Permissions Matrices state (matching screenshot)
  const [permisoSubTab, setPermisoSubTab] = useState<'Ventanas' | 'Reportes' | 'Especiales'>('Especiales');

  const [specBranch, setSpecBranch] = useState<SpecialPermissionItem[]>([]);

  const [specCajas, setSpecCajas] = useState<SpecialPermissionItem[]>([]);

  const [specInvMov, setSpecInvMov] = useState<SpecialPermissionItem[]>([]);

  const [specCostCenter, setSpecCostCenter] = useState<SpecialPermissionItem[]>([]);

  const [specWarehouses, setSpecWarehouses] = useState<SpecialPermissionItem[]>([]);

  const [specPaymentMethods, setSpecPaymentMethods] = useState<SpecialPermissionItem[]>([]);

  const [windowPermissions, setWindowPermissions] = useState([
    { id: '1', name: 'Punto de Venta (POS)', enabled: false },
    { id: '2', name: 'Gestión de Clientes', enabled: false },
    { id: '3', name: 'Catálogo de Productos', enabled: false },
    { id: '4', name: 'Inventarios y Kardex', enabled: false },
    { id: '5', name: 'Apertura / Cierre de Caja', enabled: false },
    { id: '6', name: 'Compras y Proveedores', enabled: false },
    { id: '7', name: 'Facturación Electrónica SRI', enabled: false },
    { id: '8', name: 'Administración de Usuarios y Roles', enabled: false },
    { id: '9', name: 'Configuración de Empresa y Establecimientos', enabled: false }
  ]);

  const [reportPermissions, setReportPermissions] = useState([
    { id: '1', name: 'Reporte de Ventas Diarias', enabled: false },
    { id: '2', name: 'Reporte de Ventas por Producto', enabled: false },
    { id: '3', name: 'Reporte de Utilidades y Margen', enabled: false },
    { id: '4', name: 'Kardex de Movimientos de Inventario', enabled: false },
    { id: '5', name: 'Resumen de Cierre de Caja', enabled: false },
    { id: '6', name: 'Comprobantes SRI Autorizados y Anulados', enabled: false },
    { id: '7', name: 'Reporte de Stock Mínimo y Reabastecimiento', enabled: false },
    { id: '8', name: 'Exportación a Excel / PDF', enabled: false }
  ]);

  const selectedUser = users.find(u => u.id === selectedId) || users[0];
  const [activePermissionSet, setActivePermissionSet] = useState<UserPermissionSet>(
    selectedUser?.permissions || permissionsForRole(selectedUser?.role || 'FACTURADOR')
  );
  const [formData, setFormData] = useState<Partial<ExtendedSystemUser>>({ ...selectedUser });
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [saveNotice, setSaveNotice] = useState('');
  const lookupRequestRef = useRef(0);
  const validationAlertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const permissions = selectedUser?.permissions || permissionsForRole(selectedUser?.role || 'FACTURADOR');
    setActivePermissionSet(permissions);
    setWindowPermissions(previous => previous.map(item => ({
      ...item,
      enabled: item.id === '1' ? permissions.pos_access
        : item.id === '4' ? permissions.inv_ver
        : item.id === '5' ? (permissions.caja_apertura || permissions.caja_cierre)
        : item.id === '6' ? permissions.inv_ingresos
        : item.id === '7' ? permissions.admin_sri
        : item.id === '8' ? permissions.admin_usuarios
        : item.id === '9' ? permissions.admin_empresas
        : false
    })));
    setReportPermissions(previous => previous.map(item => ({
      ...item,
      enabled: item.id === '1' || item.id === '2' ? permissions.rep_ventas
        : item.id === '3' || item.id === '8' ? permissions.rep_utilidades
        : false
    })));
    const branchDefinitions = availableCompanies.map(company => ({ id: company.id, name: company.name }));
    setSpecBranch(buildSpecialItems(branchDefinitions, selectedUser?.assignedBranches));
    setSpecCajas(buildSpecialItems([{ id: 'CAJA-PRINCIPAL', name: 'CAJA PRINCIPAL' }], selectedUser?.assignedCashRegisters, selectedUser?.primaryCashRegisterId));
    setSpecInvMov(buildSpecialItems([
      { id: 'INGRESO', name: 'INGRESO' },
      { id: 'EGRESO', name: 'EGRESO' },
      { id: 'AJUSTE', name: 'AJUSTE' }
    ], selectedUser?.assignedInventoryMovements));
    setSpecCostCenter(buildSpecialItems([{ id: 'GENERAL', name: 'CENTRO GENERAL' }], selectedUser?.assignedCostCenters, selectedUser?.primaryCostCenterId));
    setSpecWarehouses(buildSpecialItems([{ id: 'BODEGA-PRINCIPAL', name: 'BODEGA PRINCIPAL' }], selectedUser?.assignedWarehouses, selectedUser?.primaryWarehouseId));
    setSpecPaymentMethods(buildSpecialItems([
      { id: 'EFECTIVO', name: 'EFECTIVO' },
      { id: 'TARJETA', name: 'TARJETA' },
      { id: 'TRANSFERENCIA', name: 'TRANSFERENCIA' }
    ], selectedUser?.assignedPaymentMethods, selectedUser?.primaryPaymentMethodId));
  }, [selectedId, selectedUser?.id, companiesList]);

  const applyPermissionPreset = (role: string) => {
    const permissions = permissionsForRole(role);
    setActivePermissionSet(permissions);
    setWindowPermissions(previous => previous.map(item => ({
      ...item,
      enabled: item.id === '1' ? permissions.pos_access
        : item.id === '4' ? permissions.inv_ver
        : item.id === '5' ? (permissions.caja_apertura || permissions.caja_cierre)
        : item.id === '6' ? permissions.inv_ingresos
        : item.id === '7' ? permissions.admin_sri
        : item.id === '8' ? permissions.admin_usuarios
        : item.id === '9' ? permissions.admin_empresas
        : false
    })));
    setReportPermissions(previous => previous.map(item => ({
      ...item,
      enabled: item.id === '1' || item.id === '2' ? permissions.rep_ventas
        : item.id === '3' ? permissions.rep_utilidades
        : item.id === '8' ? permissions.rep_utilidades
        : false
    })));
    setFormData(previous => ({ ...previous, role: role === 'ADMIN' ? 'ADMINISTRADOR' : role as ExtendedSystemUser['role'], permissions }));
  };

  const handleLookupCedula = async (idNum: string) => {
    const clean = (idNum || '').trim().replace(/\D/g, '');
    if (clean.length !== 10 && clean.length !== 13) return;

    const requestId = ++lookupRequestRef.current;

    setIsSearchingCedula(true);
    setLookupNotice(null);

    try {
      const res = await consultarClienteExterno(clean);
      if (requestId !== lookupRequestRef.current) return;
      if (res.found && res.data) {
        const name = res.data.name || '';
        setFormData(prev => ({
          ...prev,
          fullName: name,
          username: prev.username || name.split(' ')[0] || '',
          email: res.data!.email || prev.email || '',
          idType: res.data!.idType || (clean.length === 13 ? 'RUC' : 'CEDULA')
        }));
        setLookupNotice(null);
      } else {
        setLookupNotice(res.error || res.message || 'No se encontró información. Ingrese el nombre manualmente.');
      }
    } catch {
      setLookupNotice('No se pudo completar la búsqueda. Ingrese los datos manualmente.');
    } finally {
      if (requestId === lookupRequestRef.current) setIsSearchingCedula(false);
    }
  };

  const handleSelectUser = (u: ExtendedSystemUser) => {
    setSelectedId(u.id);
    setFormData({ ...u });
    setMode('VIEW');
    setValidationErrors([]);
    setSaveNotice('');
  };

  const handleStartNew = () => {
    const newUser: Partial<ExtendedSystemUser> = {
      id: String(Date.now()),
      username: '',
      fullName: '',
      idType: 'CEDULA',
      cedula: '',
      email: '',
      role: 'FACTURADOR',
      pin: '',
      companyIds: [],
      active: true,
      password: '',
      verifyPassword: '',
      canModifyEmissionDate: false,
      canModifySequences: false,
      isAdminReports: false,
      isSalesAgent: false,
      canExportExcel: false,
      createdBy: '',
      createdAt: new Date().toLocaleString('es-EC'),
      updatedBy: '',
      updatedAt: new Date().toLocaleString('es-EC')
    };
    setFormData(newUser);
    const permissions = permissionsForRole('FACTURADOR');
    setActivePermissionSet(permissions);
    setWindowPermissions(previous => previous.map(item => ({ ...item, enabled: item.id === '1' || item.id === '4' || item.id === '5' })));
    setReportPermissions(previous => previous.map(item => ({ ...item, enabled: item.id === '1' || item.id === '2' })));
    setSpecBranch(buildSpecialItems(availableCompanies.map(company => ({ id: company.id, name: company.name }))));
    setSpecCajas(buildSpecialItems([{ id: 'CAJA-PRINCIPAL', name: 'CAJA PRINCIPAL' }]));
    setSpecInvMov(buildSpecialItems([{ id: 'INGRESO', name: 'INGRESO' }, { id: 'EGRESO', name: 'EGRESO' }, { id: 'AJUSTE', name: 'AJUSTE' }]));
    setSpecCostCenter(buildSpecialItems([{ id: 'GENERAL', name: 'CENTRO GENERAL' }]));
    setSpecWarehouses(buildSpecialItems([{ id: 'BODEGA-PRINCIPAL', name: 'BODEGA PRINCIPAL' }]));
    setSpecPaymentMethods(buildSpecialItems([{ id: 'EFECTIVO', name: 'EFECTIVO' }, { id: 'TARJETA', name: 'TARJETA' }, { id: 'TRANSFERENCIA', name: 'TRANSFERENCIA' }]));
    setMode('NEW');
    setValidationErrors([]);
    setSaveNotice('');
  };

  const handleStartEdit = () => {
    if (!selectedUser) return;
    setFormData({ ...selectedUser });
    setMode('EDIT');
    setValidationErrors([]);
    setSaveNotice('');
  };

  const handleSave = () => {
    const normalizedUsername = (formData.username || '').toUpperCase().trim();
    const normalizedPin = (formData.pin || '').trim();
    const assignedCompanyIds = formData.companyIds || [];
    const errors: string[] = [];

    if (!normalizedUsername) errors.push('Ingrese el código o nombre de usuario.');
    if (!formData.fullName?.trim()) errors.push('Ingrese los nombres y apellidos completos.');
    if (mode === 'NEW' && !formData.password) errors.push('Ingrese una contraseña para el usuario.');
    if (formData.password && formData.password.length < 8) {
      errors.push('La contraseña debe tener al menos 8 caracteres.');
    }
    if ((formData.password || '') !== (formData.verifyPassword || '')) {
      errors.push('La contraseña y su verificación no coinciden.');
    }
    if (!/^\d{4}$/.test(normalizedPin)) {
      errors.push('El PIN de facturación debe tener exactamente 4 dígitos.');
    }
    if (normalizedUsername && users.some(u => u.id !== formData.id && u.username.toUpperCase() === normalizedUsername)) {
      errors.push(`El usuario ${normalizedUsername} ya existe.`);
    }
    if (/^\d{4}$/.test(normalizedPin) && users.some(u => u.id !== formData.id && u.active && u.pin === normalizedPin)) {
      errors.push('Ese PIN de facturación ya está asignado a otro usuario activo.');
    }
    if (assignedCompanyIds.length === 0) {
      errors.push('Seleccione al menos una empresa para el usuario.');
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      requestAnimationFrame(() => validationAlertRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    const windowEnabled = (id: string) => windowPermissions.find(item => item.id === id)?.enabled === true;
    const reportEnabled = (id: string) => reportPermissions.find(item => item.id === id)?.enabled === true;
    const permissionsToSave: UserPermissionSet = {
      ...activePermissionSet,
      pos_access: windowEnabled('1'),
      inv_ver: windowEnabled('4'),
      caja_apertura: windowEnabled('5') && activePermissionSet.caja_apertura,
      caja_cierre: windowEnabled('5') && activePermissionSet.caja_cierre,
      inv_ingresos: windowEnabled('6'),
      admin_sri: windowEnabled('7'),
      admin_usuarios: windowEnabled('8'),
      admin_empresas: windowEnabled('9'),
      rep_ventas: reportEnabled('1') || reportEnabled('2'),
      rep_utilidades: reportEnabled('3') || reportEnabled('8')
    };

    const savedUser: ExtendedSystemUser = {
      id: formData.id || String(Date.now()),
      username: normalizedUsername,
      fullName: formData.fullName.toUpperCase().trim(),
      idType: formData.idType || 'CEDULA',
      cedula: formData.cedula || '',
      email: formData.email || '',
      role: formData.role || 'FACTURADOR',
      pin: normalizedPin,
      companyIds: assignedCompanyIds,
      active: formData.active !== false,
      password: formData.password || '',
      verifyPassword: formData.verifyPassword || '',
      canModifyEmissionDate: !!formData.canModifyEmissionDate,
      canModifySequences: !!formData.canModifySequences,
      isAdminReports: !!formData.isAdminReports,
      isSalesAgent: !!formData.isSalesAgent,
      canExportExcel: !!formData.canExportExcel,
      createdBy: formData.createdBy || '',
      createdAt: formData.createdAt || new Date().toLocaleString('es-EC'),
      updatedBy: '',
      updatedAt: new Date().toLocaleString('es-EC'),
      permissions: permissionsToSave,
      assignedBranches: specBranch.filter(item => item.available).map(item => item.id),
      assignedCashRegisters: specCajas.filter(item => item.available).map(item => item.id),
      assignedInventoryMovements: specInvMov.filter(item => item.available).map(item => item.id),
      assignedCostCenters: specCostCenter.filter(item => item.available).map(item => item.id),
      assignedWarehouses: specWarehouses.filter(item => item.available).map(item => item.id),
      assignedPaymentMethods: specPaymentMethods.filter(item => item.available).map(item => item.id),
      primaryCashRegisterId: specCajas.find(item => item.principal)?.id,
      primaryCostCenterId: specCostCenter.find(item => item.principal)?.id,
      primaryWarehouseId: specWarehouses.find(item => item.principal)?.id,
      primaryPaymentMethodId: specPaymentMethods.find(item => item.principal)?.id
    };

    onSaveUser?.(savedUser);
    setSelectedId(savedUser.id);
    setFormData({ ...savedUser });
    setMode('VIEW');
    setValidationErrors([]);
    setSaveNotice(`Usuario ${savedUser.username} guardado correctamente.`);
  };

  const handleDelete = () => {
    if (!selectedUser) return;
    if (confirm(`¿Desea desactivar al usuario ${selectedUser.username} (${selectedUser.fullName})?`)) {
      setMode('VIEW');
      onDeleteUser?.(selectedUser.id);
    }
  };

  const filteredUsers = users.filter(u => activeFilter === 'ACTIVE' ? u.active : !u.active);

  return (
    <div className="bg-[#181820] border border-zinc-700/80 rounded-lg overflow-hidden font-sans text-xs text-zinc-200 shadow-2xl max-w-6xl mx-auto">
      {/* 1. WINDOW TITLE TAB */}
      <div className="bg-[#121217] border-b border-zinc-700/80 px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-zinc-800 border border-zinc-600/80 px-3 py-1 rounded-t text-zinc-100 font-bold text-xs flex items-center gap-2 shadow-inner">
            <Users size={14} className="text-amber-400" />
            <span>Gestión de Usuarios</span>
            <span className="text-zinc-500 hover:text-white cursor-pointer ml-1 font-mono font-bold">×</span>
          </div>
        </div>
      </div>

      {/* 2. TOP RIBBON BAR WITH TABS & ACTIONS */}
      <div className="p-3 bg-[#202028] border-b border-zinc-700/80 flex flex-wrap items-center justify-between gap-3">
        {/* Active / Inactive Radio Group */}
        <div className="flex items-center gap-4 text-xs font-medium text-zinc-200">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="radio"
              name="user_status"
              checked={activeFilter === 'ACTIVE'}
              onChange={() => setActiveFilter('ACTIVE')}
              className="accent-amber-500"
            />
            <span>Usuarios Activos</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="radio"
              name="user_status"
              checked={activeFilter === 'INACTIVE'}
              onChange={() => setActiveFilter('INACTIVE')}
              className="accent-amber-500"
            />
            <span>Usuarios Inactivos</span>
          </label>
        </div>

        {/* Action Buttons (Exact visual styling as screenshot) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-bold text-[10px] uppercase ${
            mode === 'NEW'
              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
              : mode === 'EDIT'
                ? 'bg-blue-500/20 border-blue-400 text-blue-200'
                : 'bg-zinc-900 border-zinc-600 text-zinc-400'
          }`} aria-live="polite">
            {mode === 'NEW' ? <Plus size={12} /> : mode === 'EDIT' ? <Edit3 size={12} /> : <Shield size={12} />}
            <span>{mode === 'NEW' ? 'Nuevo usuario' : mode === 'EDIT' ? 'Modo edición' : 'Solo lectura'}</span>
          </div>

          <button
            onClick={handleStartNew}
            disabled={mode !== 'VIEW'}
            className={`flex items-center gap-1 text-white font-bold px-3 py-1 rounded border shadow transition-all text-xs ${
              mode === 'NEW'
                ? 'bg-amber-500 border-amber-200 ring-2 ring-amber-300/60'
                : 'bg-gradient-to-b from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 border-amber-400/50 active:scale-95 disabled:opacity-40'
            }`}
          >
            <span>{mode === 'NEW' ? 'Creando' : 'Nuevo'}</span>
            <Plus size={14} />
          </button>

          <button
            onClick={handleStartEdit}
            disabled={mode !== 'VIEW' || !selectedUser}
            className={`flex items-center gap-1 text-white font-bold px-3 py-1 rounded border shadow transition-all text-xs ${
              mode === 'EDIT'
                ? 'bg-blue-500 border-blue-200 ring-2 ring-blue-300/60'
                : 'bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 border-blue-400/50 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
            }`}
          >
            <span>{mode === 'EDIT' ? 'Editando' : 'Modificar'}</span>
            <Edit3 size={13} />
          </button>

          <button
            onClick={handleDelete}
            disabled={mode !== 'VIEW' || !selectedUser}
            className="flex items-center gap-1 bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-3 py-1 rounded border border-red-400/50 shadow transition-all cursor-pointer active:scale-95 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Eliminar</span>
            <Trash2 size={13} />
          </button>

          <button
            onClick={handleSave}
            disabled={mode === 'VIEW'}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800/60 text-white disabled:text-zinc-500 font-bold px-3 py-1 rounded border border-emerald-300/70 disabled:border-zinc-700 shadow-lg shadow-emerald-950/30 transition-all text-xs active:scale-95 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <span>Guardar</span>
            <Save size={13} />
          </button>

          <button
            onClick={() => {
              setMode('VIEW');
              if (selectedUser) setFormData({ ...selectedUser });
              setValidationErrors([]);
            }}
            disabled={mode === 'VIEW'}
            className="flex items-center gap-1 bg-zinc-700 disabled:bg-zinc-800/60 text-zinc-100 disabled:text-zinc-500 font-bold px-3 py-1 rounded border border-zinc-600/50 shadow transition-all text-xs disabled:cursor-not-allowed"
          >
            <span>Cancelar</span>
            <X size={13} />
          </button>

        </div>
      </div>

      {/* 3. SUB-TABS BAR (Mantenimiento / Permisos) */}
      <div className="bg-[#121217] px-3 pt-2 border-b border-zinc-700/80 flex items-center gap-2">
        <button
          onClick={() => setSubTab('Mantenimiento')}
          className={`px-4 py-1.5 rounded-t font-bold text-xs transition-colors border-t border-x ${
            subTab === 'Mantenimiento'
              ? 'bg-[#181820] text-amber-400 border-zinc-600 shadow-sm'
              : 'bg-zinc-900/60 text-zinc-400 border-transparent hover:text-zinc-200'
          }`}
        >
          Mantenimiento
        </button>

        <button
          onClick={() => setSubTab('Permisos')}
          className={`px-4 py-1.5 rounded-t font-bold text-xs transition-colors border-t border-x ${
            subTab === 'Permisos'
              ? 'bg-[#181820] text-amber-400 border-zinc-600 shadow-sm'
              : 'bg-zinc-900/60 text-zinc-400 border-transparent hover:text-zinc-200'
          }`}
        >
          Permisos
        </button>
      </div>

      {/* 4. MAIN SPLIT BODY */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[440px] bg-[#181820]">
        {/* LEFT COLUMN: TABLE OF USERS (4 COLS) */}
        <div className="md:col-span-4 border-r border-zinc-700/80 bg-[#121217] flex flex-col">
          <div className="overflow-x-auto flex-1 max-h-[460px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#202028] text-zinc-300 font-bold border-b border-zinc-700 sticky top-0 z-10">
                <tr>
                  <th className="p-2 border-r border-zinc-700 w-28">
                    <div className="flex items-center justify-between">
                      <span>Usuario</span>
                      <Filter size={12} className="text-zinc-400" />
                    </div>
                  </th>
                  <th className="p-2 border-r border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span>Nombre</span>
                      <Filter size={12} className="text-zinc-400" />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 font-sans">
                {filteredUsers.map((u) => {
                  const isSelected = u.id === selectedId;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className={`cursor-pointer select-none transition-colors ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 font-bold border-l-4 border-amber-500'
                          : 'hover:bg-zinc-800/60 text-zinc-200'
                      }`}
                    >
                      <td className="p-2 font-mono text-xs font-bold uppercase truncate max-w-[90px]">
                        {u.username}
                      </td>
                      <td className="p-2 text-xs font-semibold uppercase truncate max-w-[180px]">
                        {u.fullName}
                      </td>
                    </tr>
                  );
                })}

                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-4 text-center text-zinc-500 italic">
                      No hay usuarios registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: CONTENT DEPENDING ON SUB-TAB */}
        <div className={`md:col-span-8 p-4 bg-[#181820] font-sans overflow-y-auto max-h-[480px] transition-shadow ${
          mode === 'NEW'
            ? 'shadow-[inset_0_0_0_2px_rgba(245,158,11,0.75)]'
            : mode === 'EDIT'
              ? 'shadow-[inset_0_0_0_2px_rgba(59,130,246,0.75)]'
              : ''
        }`}>
          {subTab === 'Mantenimiento' ? (
            <div className="space-y-4">
              {saveNotice && (
                <div role="status" className="flex items-center gap-2 border border-emerald-600 bg-emerald-950/50 px-3 py-2 rounded text-emerald-200 font-bold">
                  <CheckSquare size={16} />
                  <span>{saveNotice}</span>
                </div>
              )}
              {validationErrors.length > 0 && (
                <div
                  ref={validationAlertRef}
                  role="alert"
                  aria-live="assertive"
                  className="flex items-start gap-3 border border-red-500 bg-red-950/70 px-3 py-2.5 rounded text-red-100 shadow-lg"
                >
                  <AlertTriangle size={18} className="text-red-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-xs">No se pudo guardar. Revise los datos obligatorios:</p>
                    <ul className="mt-1 space-y-0.5 text-[11px] list-disc list-inside">
                      {validationErrors.map(error => <li key={error}>{error}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* FORM FIELDS */}
              <div className="space-y-2.5 max-w-2xl">
                {/* ROW 1: TIPO IDENTIFICACION */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Tipo Identificación :
                  </label>
                  <div className="col-span-9">
                    <select
                      disabled={mode === 'VIEW'}
                      value={formData.idType || 'CEDULA'}
                      onChange={(e) => setFormData({ ...formData, idType: e.target.value as any })}
                      className="bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-80 w-36"
                    >
                      <option value="CEDULA">CEDULA</option>
                      <option value="RUC">RUC</option>
                      <option value="PASAPORTE">PASAPORTE</option>
                    </select>
                  </div>
                </div>

                {/* ROW 2: IDENTIFICACION */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Identificación :
                  </label>
                  <div className="col-span-9 flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      disabled={mode === 'VIEW'}
                      value={formData.cedula || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        lookupRequestRef.current += 1;
                        setFormData({ ...formData, cedula: val });
                      }}
                      onBlur={() => handleLookupCedula(formData.cedula || '')}
                      placeholder="Identificación (10 u 13 dígitos)"
                      className="bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono font-bold text-amber-400 outline-none focus:border-amber-500 disabled:opacity-80 w-44"
                    />
                    {mode !== 'VIEW' && (
                      <button
                        type="button"
                        onClick={() => handleLookupCedula(formData.cedula || '')}
                        disabled={isSearchingCedula || !formData.cedula || formData.cedula.length < 10}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded transition-all cursor-pointer disabled:opacity-40"
                      >
                        {isSearchingCedula ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        <span>Consultar datos</span>
                      </button>
                    )}
                    {lookupNotice && (
                      <span className="text-[10px] font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
                        {lookupNotice}
                      </span>
                    )}
                  </div>
                </div>

                {/* ROW 3: NOMBRES */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Nombres :
                  </label>
                  <div className="col-span-9">
                    <input
                      type="text"
                      disabled={mode === 'VIEW'}
                      value={formData.fullName || ''}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      placeholder="Nombres y apellidos"
                      className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-80 uppercase"
                    />
                  </div>
                </div>

                {/* ROW 4: USUARIO & CONTRASEÑA */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Usuario :
                  </label>
                  <div className="col-span-9 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <input
                        type="text"
                        disabled={mode === 'VIEW'}
                        value={formData.username || ''}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        placeholder="USUARIO"
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono font-bold text-amber-400 outline-none focus:border-amber-500 disabled:opacity-80 uppercase"
                      />
                    </div>

                    <label className="col-span-3 text-right text-zinc-300 font-medium flex items-center justify-end gap-1">
                      <span>Contraseña</span>
                      <Star size={10} className="fill-amber-400 text-amber-400" /> :
                    </label>

                    <div className="col-span-4 relative flex items-center">
                      <input
                        type="password"
                        disabled={mode === 'VIEW'}
                        value={formData.password || ''}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-80 pr-8"
                      />
                      <span className="absolute right-2 text-[10px] text-zinc-400 font-mono">0/20</span>
                    </div>
                  </div>
                </div>

                {/* ROW 5: CORREO & VERIFICAR */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Correo :
                  </label>
                  <div className="col-span-9 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <input
                        type="email"
                        disabled={mode === 'VIEW'}
                        value={formData.email || ''}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="correo@dominio.com"
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs text-zinc-200 outline-none focus:border-amber-500 disabled:opacity-80"
                      />
                    </div>

                    <label className="col-span-3 text-right text-zinc-300 font-medium">
                      Verificar :
                    </label>

                    <div className="col-span-4">
                      <input
                        type="password"
                        disabled={mode === 'VIEW'}
                        value={formData.verifyPassword || ''}
                        onChange={(e) => setFormData({ ...formData, verifyPassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-80"
                      />
                    </div>
                  </div>
                </div>

                {/* ROW 6: ROL & PIN DE FACTURACION */}
                <div className="grid grid-cols-12 items-center gap-2">
                  <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                    Rol :
                  </label>
                  <div className="col-span-9 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <select
                        disabled={mode === 'VIEW'}
                        value={formData.role || 'FACTURADOR'}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value as ExtendedSystemUser['role'] })}
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-80"
                      >
                        <option value="FACTURADOR">FACTURADOR</option>
                        <option value="CAJERO">CAJERO</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="BODEGA">BODEGA</option>
                        <option value="CONTADOR">CONTADOR</option>
                        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                        <option value="SUPER USUARIO">SUPER USUARIO</option>
                      </select>
                    </div>

                    <label className="col-span-3 text-right text-zinc-300 font-medium flex items-center justify-end gap-1">
                      <Key size={11} className="text-amber-400" />
                      <span>PIN POS</span> :
                    </label>

                    <div className="col-span-4">
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="new-password"
                        maxLength={4}
                        disabled={mode === 'VIEW'}
                        value={formData.pin || ''}
                        onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder="4 dígitos"
                        aria-label="PIN de facturación de 4 dígitos"
                        className="w-full bg-[#121217] border border-zinc-600 rounded px-2 py-1 text-xs font-mono tracking-widest text-amber-400 outline-none focus:border-amber-500 disabled:opacity-80"
                      />
                    </div>
                  </div>
                </div>

                {/* SIMPLIFIED ESSENTIAL CONTROLS */}
                <div className="flex items-center gap-6 pt-2 text-zinc-200 font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={mode === 'VIEW'}
                      checked={formData.active !== false}
                      onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                      className="accent-amber-500 rounded cursor-pointer"
                    />
                    <span>Estado (Usuario Activo)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={mode === 'VIEW'}
                      checked={!!formData.isAdminReports}
                      onChange={(e) => setFormData({ ...formData, isAdminReports: e.target.checked })}
                      className="accent-amber-500 rounded cursor-pointer"
                    />
                    <span>Administrador de Reportes</span>
                  </label>
                </div>
              </div>

              <div className="border-t border-zinc-700/80 my-3" />

              {/* EMPRESAS HABILITADAS */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-zinc-200 font-bold">
                  <Building2 size={15} className="text-amber-400" />
                  <span>Empresas habilitadas</span>
                  <Star size={9} className="fill-red-400 text-red-400" />
                </div>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 border rounded p-2.5 ${
                  validationErrors.some(error => error.includes('empresa'))
                    ? 'border-red-500 bg-red-950/20'
                    : 'border-zinc-700 bg-[#121217]'
                }`}>
                  {availableCompanies.map(company => {
                    const checked = (formData.companyIds || []).includes(company.id);
                    return (
                      <label
                        key={company.id}
                        className={`flex items-center gap-2 px-2.5 py-2 border rounded transition-colors ${
                          checked
                            ? 'border-amber-500/70 bg-amber-500/10 text-amber-200'
                            : 'border-zinc-700 text-zinc-300'
                        } ${mode === 'VIEW' ? 'cursor-default' : 'cursor-pointer hover:border-zinc-500'}`}
                      >
                        <input
                          type="checkbox"
                          disabled={mode === 'VIEW'}
                          checked={checked}
                          onChange={(event) => {
                            const currentIds = formData.companyIds || [];
                            const companyIds = event.target.checked
                              ? [...currentIds, company.id]
                              : currentIds.filter(id => id !== company.id);
                            setFormData({ ...formData, companyIds });
                            setValidationErrors([]);
                          }}
                          className="accent-amber-500"
                        />
                        <span className="font-bold">{company.name}</span>
                      </label>
                    );
                  })}
                </div>
                {mode === 'VIEW' && (formData.companyIds || []).length === 0 && (
                  <p className="text-red-300 text-[11px] font-bold">Este usuario no tiene empresas asignadas.</p>
                )}
              </div>
            </div>
          ) : (
            /* SUB-TAB PERMISOS (Full ERP permission matrix matching screenshot) */
            <div className="space-y-3 font-sans">
              {/* PERMISOS TOP CONTROLS */}
              <div className="flex flex-wrap items-center gap-4 bg-[#121217] p-2 rounded border border-zinc-700/80 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300 font-medium">Empresa :</span>
                  <select
                    value={selectedLinkCompany}
                    onChange={(e) => setSelectedLinkCompany(e.target.value)}
                    className="bg-[#181820] border border-zinc-600 rounded px-2 py-1 font-bold text-amber-300 outline-none w-44"
                  >
                    {availableCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-300 font-medium">Usuario :</span>
                  <select
                    value={selectedId}
                    onChange={(e) => {
                      const found = users.find(u => u.id === e.target.value);
                      if (found) handleSelectUser(found);
                    }}
                    className="bg-[#181820] border border-zinc-600 rounded px-2 py-1 font-bold text-white outline-none w-64 uppercase"
                  >
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username} - {u.fullName}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-zinc-400 font-medium">Roles Predeterminados:</span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        applyPermissionPreset(e.target.value);
                      }
                    }}
                    className="bg-[#181820] border border-zinc-600 rounded px-2 py-1 text-zinc-300 outline-none w-44"
                  >
                    <option value="">Seleccione Opción...</option>
                    <option value="ADMIN">ADMINISTRADOR TOTAL</option>
                    <option value="CAJERO">CAJERO / FACTURADOR</option>
                    <option value="SUPERVISOR">SUPERVISOR DE LOCAL</option>
                    <option value="BODEGA">OPERADOR BODEGA</option>
                    <option value="CONTADOR">CONTADOR ACCESO LECTURA</option>
                  </select>
                </div>
              </div>

              {/* PERMISOS SUB-TABS (Ventanas, Reportes, Especiales) */}
              <div className="flex items-center gap-2 border-b border-zinc-700/80 pt-1">
                <button
                  onClick={() => setPermisoSubTab('Ventanas')}
                  className={`px-3 py-1 text-xs font-bold rounded-t transition-colors border-t border-x ${
                    permisoSubTab === 'Ventanas'
                      ? 'bg-[#181820] text-amber-400 border-zinc-600'
                      : 'bg-zinc-900/60 text-zinc-400 border-transparent hover:text-zinc-200'
                  }`}
                >
                  Permiso a Ventanas
                </button>
                <button
                  onClick={() => setPermisoSubTab('Reportes')}
                  className={`px-3 py-1 text-xs font-bold rounded-t transition-colors border-t border-x ${
                    permisoSubTab === 'Reportes'
                      ? 'bg-[#181820] text-amber-400 border-zinc-600'
                      : 'bg-zinc-900/60 text-zinc-400 border-transparent hover:text-zinc-200'
                  }`}
                >
                  Permiso a Reportes
                </button>
                <button
                  onClick={() => setPermisoSubTab('Especiales')}
                  className={`px-3 py-1 text-xs font-bold rounded-t transition-colors border-t border-x ${
                    permisoSubTab === 'Especiales'
                      ? 'bg-[#181820] text-amber-400 border-zinc-600 shadow-sm'
                      : 'bg-zinc-900/60 text-zinc-400 border-transparent hover:text-zinc-200'
                  }`}
                >
                  Permisos Especiales
                </button>
              </div>

              {/* TAB 1: PERMISOS ESPECIALES (2 ROWS x 3 COLS MATCHING SCREENSHOT) */}
              {permisoSubTab === 'Especiales' && (
                <div className="space-y-3 pt-1">
                  {/* ROW 1: SUCURSAL, CAJAS, MOV. INVENTARIO */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* GRID 1: SUCURSAL */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Sucursal</span>
                          <span>Disponible</span>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1">
                          {specBranch.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-amber-300 font-bold' : 'text-zinc-400'}>{item.name}</span>
                              <input
                                type="checkbox"
                                checked={item.available}
                                onChange={() => setSpecBranch(specBranch.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                className="accent-amber-500 rounded cursor-pointer"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecBranch(specBranch.map(x => ({ ...x, available: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>

                    {/* GRID 2: CAJAS */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Cajas</span>
                          <div className="flex gap-4">
                            <span>Disponible</span>
                            <span>Principal</span>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1 max-h-36 overflow-y-auto">
                          {specCajas.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-amber-300 font-semibold' : 'text-zinc-400'}>{item.name}</span>
                              <div className="flex items-center gap-7 pr-1">
                                <input
                                  type="checkbox"
                                  checked={item.available}
                                  onChange={() => setSpecCajas(specCajas.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <input
                                  type="checkbox"
                                  checked={item.principal}
                                  onChange={() => setSpecCajas(specCajas.map(x => ({ ...x, principal: x.id === item.id ? !x.principal : false })))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecCajas(specCajas.map(x => ({ ...x, available: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>

                    {/* GRID 3: MOV. INVENTARIO */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Mov. Inventario</span>
                          <div className="flex gap-4">
                            <span>Disponible</span>
                            <span>Principal</span>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1 max-h-36 overflow-y-auto">
                          {specInvMov.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-zinc-200 font-semibold' : 'text-zinc-400'}>{item.name}</span>
                              <div className="flex items-center gap-7 pr-1">
                                <input
                                  type="checkbox"
                                  checked={item.available}
                                  onChange={() => setSpecInvMov(specInvMov.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <input
                                  type="checkbox"
                                  checked={item.principal}
                                  onChange={() => setSpecInvMov(specInvMov.map(x => x.id === item.id ? { ...x, principal: !x.principal } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecInvMov(specInvMov.map(x => ({ ...x, available: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ROW 2: CENTRO COSTO, ALMACENES, FORMA DE PAGO */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* GRID 4: CENTRO COSTO */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Centro Costo</span>
                          <div className="flex gap-4">
                            <span>Disponible</span>
                            <span>Principal</span>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1">
                          {specCostCenter.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-amber-300 font-bold' : 'text-zinc-400'}>{item.name}</span>
                              <div className="flex items-center gap-7 pr-1">
                                <input
                                  type="checkbox"
                                  checked={item.available}
                                  onChange={() => setSpecCostCenter(specCostCenter.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <input
                                  type="checkbox"
                                  checked={item.principal}
                                  onChange={() => setSpecCostCenter(specCostCenter.map(x => ({ ...x, principal: x.id === item.id ? !x.principal : false })))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecCostCenter(specCostCenter.map(x => ({ ...x, available: true, principal: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>

                    {/* GRID 5: ALMACENES (BODEGAS) */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Almacenes</span>
                          <div className="flex gap-4">
                            <span>Disponible</span>
                            <span>Principal</span>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1">
                          {specWarehouses.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-amber-300 font-semibold' : 'text-zinc-400'}>{item.name}</span>
                              <div className="flex items-center gap-7 pr-1">
                                <input
                                  type="checkbox"
                                  checked={item.available}
                                  onChange={() => setSpecWarehouses(specWarehouses.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <input
                                  type="checkbox"
                                  checked={item.principal}
                                  onChange={() => setSpecWarehouses(specWarehouses.map(x => ({ ...x, principal: x.id === item.id ? !x.principal : false })))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecWarehouses(specWarehouses.map(x => ({ ...x, available: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>

                    {/* GRID 6: FORMA DE PAGO */}
                    <div className="bg-[#121217] border border-zinc-700/80 rounded flex flex-col justify-between overflow-hidden">
                      <div>
                        <div className="bg-[#202028] px-2.5 py-1 text-xs font-bold text-amber-400 flex justify-between border-b border-zinc-700">
                          <span>Forma de Pago</span>
                          <div className="flex gap-4">
                            <span>Disponible</span>
                            <span>Principal</span>
                          </div>
                        </div>
                        <div className="divide-y divide-zinc-800 text-xs p-1 max-h-36 overflow-y-auto">
                          {specPaymentMethods.map(item => (
                            <div key={item.id} className="flex items-center justify-between px-2 py-1 hover:bg-zinc-800/60">
                              <span className={item.available ? 'text-amber-300 font-bold' : 'text-zinc-400'}>{item.name}</span>
                              <div className="flex items-center gap-7 pr-1">
                                <input
                                  type="checkbox"
                                  checked={item.available}
                                  onChange={() => setSpecPaymentMethods(specPaymentMethods.map(x => x.id === item.id ? { ...x, available: !x.available } : x))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <input
                                  type="checkbox"
                                  checked={item.principal}
                                  onChange={() => setSpecPaymentMethods(specPaymentMethods.map(x => ({ ...x, principal: x.id === item.id ? !x.principal : false })))}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-1.5 border-t border-zinc-800 bg-[#181820] text-center">
                        <button
                          onClick={() => setSpecPaymentMethods(specPaymentMethods.map(x => ({ ...x, available: true })))}
                          className="bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-bold px-3 py-0.5 rounded shadow"
                        >
                          Marcar Todos
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: PERMISO A VENTANAS */}
              {permisoSubTab === 'Ventanas' && (
                <div className="bg-[#121217] border border-zinc-700/80 p-3 rounded-lg space-y-3 text-xs">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="font-bold text-amber-400">Acceso a Módulos y Ventanas del Sistema ERP</span>
                    <button
                      onClick={() => setWindowPermissions(windowPermissions.map(w => ({ ...w, enabled: true })))}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white px-2.5 py-0.5 rounded text-[11px] font-bold"
                    >
                      Habilitar Todos
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {windowPermissions.map(w => (
                      <label key={w.id} className="flex items-center gap-2 p-2 bg-[#181820] border border-zinc-700/60 rounded cursor-pointer hover:border-amber-500/50">
                        <input
                          type="checkbox"
                          checked={w.enabled}
                          onChange={() => setWindowPermissions(windowPermissions.map(x => x.id === w.id ? { ...x, enabled: !x.enabled } : x))}
                          className="accent-amber-500 rounded"
                        />
                        <span className={w.enabled ? 'text-white font-bold' : 'text-zinc-400'}>{w.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 3: PERMISO A REPORTES */}
              {permisoSubTab === 'Reportes' && (
                <div className="bg-[#121217] border border-zinc-700/80 p-3 rounded-lg space-y-3 text-xs">
                  <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                    <span className="font-bold text-amber-400">Permiso a Generación e Impresión de Reportes</span>
                    <button
                      onClick={() => setReportPermissions(reportPermissions.map(r => ({ ...r, enabled: true })))}
                      className="bg-zinc-700 hover:bg-zinc-600 text-white px-2.5 py-0.5 rounded text-[11px] font-bold"
                    >
                      Habilitar Todos
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {reportPermissions.map(r => (
                      <label key={r.id} className="flex items-center gap-2 p-2 bg-[#181820] border border-zinc-700/60 rounded cursor-pointer hover:border-amber-500/50">
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={() => setReportPermissions(reportPermissions.map(x => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}
                          className="accent-amber-500 rounded"
                        />
                        <span className={r.enabled ? 'text-white font-bold' : 'text-zinc-400'}>{r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 5. FOOTER AUDIT STATUS BAR */}
      <div className="bg-[#121217] border-t border-zinc-700/80 px-4 py-2 flex flex-wrap items-center justify-start gap-x-8 gap-y-2 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span>Creación :</span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-white font-bold">
            {formData.createdBy || selectedUser?.createdBy || 'SIN CONFIGURAR'}
          </span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-zinc-300">
            {formData.createdAt || selectedUser?.createdAt || 'SIN CONFIGURAR'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>Modificación :</span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-white font-bold">
            {formData.updatedBy || selectedUser?.updatedBy || 'SIN CONFIGURAR'}
          </span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-zinc-300">
            {formData.updatedAt || selectedUser?.updatedAt || 'SIN CONFIGURAR'}
          </span>
        </div>
      </div>
    </div>
  );
};
