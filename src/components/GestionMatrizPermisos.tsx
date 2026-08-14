import React, { useEffect, useState } from 'react';
import { ShieldCheck, Lock, CheckCircle2, XCircle, Search, Filter, AlertTriangle, Key, Users, Building2, Wallet, Save, RotateCcw } from 'lucide-react';
import { 
  INITIAL_PERMISSION_CATALOG, 
  INITIAL_SYSTEM_ROLES, 
  AuthorizationEngine, 
  User, 
  Company, 
  CompanySettings, 
  CompanyMembership, 
  RolePermission, 
  UserPermissionOverride 
} from '../lib/tendiAdminEngine';

interface GestionMatrizPermisosProps {
  companyId?: string;
}

export const GestionMatrizPermisos: React.FC<GestionMatrizPermisosProps> = ({ companyId = 'global' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>('TODOS');
  const [activeSubTab, setActiveSubTab] = useState<'matriz' | 'simulador' | 'asignaciones'>('matriz');
  const permissionStorageKey = `tendi_role_permissions_${companyId}`;
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() => {
    try {
      const stored = localStorage.getItem(permissionStorageKey);
      if (stored) return JSON.parse(stored);
    } catch {
      // Use the system defaults if stored permissions are unavailable.
    }

    return Object.fromEntries(INITIAL_SYSTEM_ROLES.map(role => [role.roleId, [...role.permissions]]));
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(permissionStorageKey);
      setRolePermissions(stored
        ? JSON.parse(stored)
        : Object.fromEntries(INITIAL_SYSTEM_ROLES.map(role => [role.roleId, [...role.permissions]])));
    } catch {
      setRolePermissions(Object.fromEntries(INITIAL_SYSTEM_ROLES.map(role => [role.roleId, [...role.permissions]])));
    }
    setHasUnsavedChanges(false);
  }, [permissionStorageKey]);

  const toggleRolePermission = (roleId: string, permissionId: string) => {
    setRolePermissions(previous => {
      const current = previous[roleId] || [];
      const next = current.includes(permissionId)
        ? current.filter(item => item !== permissionId)
        : [...current, permissionId];
      return { ...previous, [roleId]: next };
    });
    setHasUnsavedChanges(true);
  };

  const saveRolePermissions = () => {
    localStorage.setItem(permissionStorageKey, JSON.stringify(rolePermissions));
    setHasUnsavedChanges(false);
  };

  const resetRolePermissions = () => {
    if (!confirm('¿Restaurar los permisos iniciales para esta empresa?')) return;
    const defaults = Object.fromEntries(INITIAL_SYSTEM_ROLES.map(role => [role.roleId, [...role.permissions]]));
    setRolePermissions(defaults);
    localStorage.setItem(permissionStorageKey, JSON.stringify(defaults));
    setHasUnsavedChanges(false);
  };

  // Simulator State
  const [simUserRole, setSimUserRole] = useState<string>('CAJERO');
  const [simPermissionId, setSimPermissionId] = useState<string>('sales.invoices.create');
  const [simCashRegister, setSimCashRegister] = useState<string>('');
  const [simDiscount, setSimDiscount] = useState<number>(0);
  const [simAmount, setSimAmount] = useState<number>(0);
  const [simPeriodClosed, setSimPeriodClosed] = useState<boolean>(false);
  const [simCompanyActive, setSimCompanyActive] = useState<boolean>(false);

  const sampleCompany: Company = {
    companyId: 'SIN-SINCRONIZAR',
    taxId: '',
    businessName: 'SIN EMPRESA SINCRONIZADA',
    tradeName: 'SIN EMPRESA SINCRONIZADA',
    address: '',
    phone: '',
    email: '',
    taxRegime: 'GENERAL',
    keepAccounting: false,
    currency: 'USD',
    timeZone: 'America/Guayaquil',
    active: simCompanyActive,
    createdAt: ''
  };

  const sampleSettings: CompanySettings = {
    companyId: sampleCompany.companyId,
    sriEnvironment: '1',
    defaultIvaRate: 15,
    enabledModules: ['sales', 'purchases', 'inventory', 'treasury', 'accounting', 'admin', 'reports'],
    allowNegativeStock: false,
    requireApprovalForAnnulment: true,
    maxDiscountWithoutApproval: 0
  };

  const sampleUser: User = {
    userId: 'SIN-SINCRONIZAR',
    username: 'SIN CONFIGURAR',
    fullName: 'SIN USUARIO SINCRONIZADO',
    email: '',
    identityType: 'CEDULA',
    identityNumber: '',
    active: true,
    passwordHash: '',
    mfaEnabled: false
  };

  const sampleMembership: CompanyMembership = {
    companyId: sampleCompany.companyId,
    userId: sampleUser.userId,
    roleId: simUserRole,
    active: false,
    assignedBranches: [],
    assignedWarehouses: [],
    assignedCashRegisters: [],
    assignedEmissionPoints: [],
    assignedPaymentMethods: [],
    maxDiscountLimitPercent: 0,
    maxApprovalAmount: 0
  };

  const sampleRolePermissions: RolePermission[] = (rolePermissions[simUserRole] || []).map(permissionId => ({
    companyId: sampleCompany.companyId,
    roleId: simUserRole,
    permissionId
  }));
  const sampleOverrides: UserPermissionOverride[] = [];

  // Evaluate authorization live
  const evalResult = AuthorizationEngine.can(
    sampleUser,
    sampleCompany,
    sampleSettings,
    sampleMembership,
    sampleRolePermissions,
    sampleOverrides,
    simPermissionId,
    {
      cashRegisterId: simCashRegister,
      requestedDiscountPercent: simDiscount,
      requestedAmount: simAmount,
      isPeriodClosed: simPeriodClosed
    }
  );

  const filteredPermissions = INITIAL_PERMISSION_CATALOG.filter(perm => {
    const matchesSearch = perm.permissionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          perm.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesModule = selectedModuleFilter === 'TODOS' || perm.module === selectedModuleFilter;
    return matchesSearch && matchesModule;
  });

  const modules = ['TODOS', 'sales', 'purchases', 'inventory', 'treasury', 'accounting', 'admin', 'reports'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <ShieldCheck className="text-[#00ff41]" />
            <span>MATRIZ DE PERMISOS DE SEGURIDAD Y GOBERNANZA RBAC / ABAC</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Permisos por plantilla reutilizable (modulo.recurso.accion) con restricciones contextuales de caja, bodega y límites
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0a0a0d] p-1 rounded-xl border border-zinc-800 text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('matriz')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${activeSubTab === 'matriz' ? 'bg-[#00ff41] text-black font-display' : 'text-zinc-400 hover:text-white'}`}
          >
            Matriz por Rol
          </button>
          <button
            onClick={() => setActiveSubTab('simulador')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${activeSubTab === 'simulador' ? 'bg-[#00ff41] text-black font-display' : 'text-zinc-400 hover:text-white'}`}
          >
            Simulador can()
          </button>
          <button
            onClick={() => setActiveSubTab('asignaciones')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${activeSubTab === 'asignaciones' ? 'bg-[#00ff41] text-black font-display' : 'text-zinc-400 hover:text-white'}`}
          >
            Asignaciones Operativas
          </button>
        </div>
      </div>

      {/* VIEW 1: MATRIZ DE PERMISOS */}
      {activeSubTab === 'matriz' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3 bg-[#121217] p-4 rounded-xl border border-zinc-800 text-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Buscar permiso (ej: sales.invoices.create)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white outline-none focus:border-[#00ff41]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-bold">Módulo:</span>
              <select
                value={selectedModuleFilter}
                onChange={(e) => setSelectedModuleFilter(e.target.value)}
                className="bg-[#0a0a0d] border border-zinc-800 text-white rounded-xl px-3 py-2 outline-none font-mono"
              >
                {modules.map(m => (
                  <option key={m} value={m}>{m.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={resetRolePermissions}
              className="px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white text-xs font-bold flex items-center gap-1.5"
            >
              <RotateCcw size={14} /> Restaurar predeterminados
            </button>
            <button
              type="button"
              onClick={saveRolePermissions}
              disabled={!hasUnsavedChanges}
              className="px-3 py-2 rounded-xl bg-[#00ff41] text-black disabled:bg-zinc-800 disabled:text-zinc-500 text-xs font-bold flex items-center gap-1.5"
            >
              <Save size={14} /> Guardar permisos
            </button>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-x-auto shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5 min-w-[220px]">Permiso (modulo.recurso.accion)</th>
                  <th className="p-3.5 min-w-[200px]">Descripción</th>
                  {INITIAL_SYSTEM_ROLES.map(r => (
                    <th key={r.roleId} className="p-3.5 text-center font-bold text-white min-w-[110px]">
                      {r.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {filteredPermissions.map(perm => (
                  <tr key={perm.permissionId} className="hover:bg-zinc-800/40">
                    <td className="p-3.5 font-bold text-[#00ff41]">
                      {perm.permissionId}
                    </td>
                    <td className="p-3.5 font-sans text-zinc-300 text-xs">
                      {perm.description}
                    </td>
                    {INITIAL_SYSTEM_ROLES.map(role => {
                      const isGranted = (rolePermissions[role.roleId] || []).includes(perm.permissionId);
                      return (
                        <td key={role.roleId} className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => toggleRolePermission(role.roleId, perm.permissionId)}
                            title={isGranted ? 'Revocar permiso' : 'Conceder permiso'}
                            className="mx-auto"
                          >
                          {isGranted ? (
                            <span className="inline-flex items-center gap-1 bg-emerald-950/80 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded text-[10px] font-bold">
                              <CheckCircle2 size={12} /> CONCEDIDO
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-zinc-900 text-zinc-600 border border-zinc-800 px-2 py-0.5 rounded text-[10px]">
                              <XCircle size={12} /> DENEGADO
                            </span>
                          )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: SIMULADOR INTERACTIVO CAN() */}
      {activeSubTab === 'simulador' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
              <Key size={18} className="text-amber-400" />
              <span>Parámetros de Evaluación can()</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 font-bold block mb-1">Rol Asignado al Usuario</label>
                <select
                  value={simUserRole}
                  onChange={(e) => setSimUserRole(e.target.value)}
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                >
                  {INITIAL_SYSTEM_ROLES.map(r => (
                    <option key={r.roleId} value={r.roleId}>{r.name} ({r.roleId})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 font-bold block mb-1">Permiso Requerido</label>
                <select
                  value={simPermissionId}
                  onChange={(e) => setSimPermissionId(e.target.value)}
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-[#00ff41] font-mono font-bold"
                >
                  {INITIAL_PERMISSION_CATALOG.map(p => (
                    <option key={p.permissionId} value={p.permissionId}>{p.permissionId} - {p.description}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Caja Seleccionada</label>
                  <select
                    value={simCashRegister}
                    onChange={(e) => setSimCashRegister(e.target.value)}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  >
                    <option value="">Sin cajas sincronizadas</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Descuento Requerido (%)</label>
                  <input
                    type="number"
                    value={simDiscount}
                    onChange={(e) => setSimDiscount(Number(e.target.value))}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Monto Transacción ($)</label>
                  <input
                    type="number"
                    value={simAmount}
                    onChange={(e) => setSimAmount(Number(e.target.value))}
                    className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 font-bold block mb-1">Estado de la Empresa</label>
                  <button
                    type="button"
                    onClick={() => setSimCompanyActive(!simCompanyActive)}
                    className={`w-full py-2 rounded-xl text-xs font-bold ${simCompanyActive ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'}`}
                  >
                    {simCompanyActive ? 'EMPRESA ACTIVA' : 'EMPRESA DESACTIVADA'}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 font-bold block mb-1">Período Contable</label>
                <button
                  type="button"
                  onClick={() => setSimPeriodClosed(!simPeriodClosed)}
                  className={`w-full py-2 rounded-xl text-xs font-bold ${!simPeriodClosed ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}`}
                >
                  {!simPeriodClosed ? 'PERÍODO ABIERTO (NORMAL)' : 'PERÍODO BLOQUEADO / CERRADO'}
                </button>
              </div>
            </div>
          </div>

          {/* Resultado de la Evaluación */}
          <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
            <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
              <ShieldCheck size={18} className={evalResult.granted ? "text-[#00ff41]" : "text-red-400"} />
              <span>Resultado de la Pipeline de Autorización (10 Pasos)</span>
            </h3>

            <div className={`p-4 rounded-xl border text-xs space-y-3 ${
              evalResult.granted 
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300' 
                : 'bg-red-950/40 border-red-800/80 text-red-300'
            }`}>
              <div className="flex items-center justify-between font-bold text-sm">
                <span>{evalResult.granted ? '● ACCESO AUTORIZADO (200 OK)' : '▲ ACCESO DENEGADO (403 FORBIDDEN)'}</span>
                <span className="font-mono text-xs">Paso Evaluado: #{evalResult.stepEvaluated}</span>
              </div>
              <div className="font-sans leading-relaxed text-zinc-200 bg-[#0a0a0d] p-3 rounded-lg border border-zinc-800">
                {evalResult.reason}
              </div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2 text-[11px] font-mono text-zinc-400">
              <div className="font-bold text-zinc-200 font-sans border-b border-zinc-800 pb-1">Secuencia de Evaluación de Seguridad TENDI:</div>
              <div className={evalResult.stepEvaluated >= 1 ? "text-emerald-400" : ""}>1. Validación de Usuario Activo</div>
              <div className={evalResult.stepEvaluated >= 2 ? "text-emerald-400" : ""}>2. Validación de Empresa Activa</div>
              <div className={evalResult.stepEvaluated >= 3 ? "text-emerald-400" : ""}>3. Verificación de Membresía Multiempresa</div>
              <div className={evalResult.stepEvaluated >= 4 ? "text-emerald-400" : ""}>4. Módulos Habilitados en la Empresa</div>
              <div className={evalResult.stepEvaluated >= 5 ? "text-emerald-400" : ""}>5. Permisos Globales de Superadministrador</div>
              <div className={evalResult.stepEvaluated >= 6 ? "text-emerald-400" : ""}>6. Comprobación de Override DENY Explícito</div>
              <div className={evalResult.stepEvaluated >= 7 ? "text-emerald-400" : ""}>7. Matriz por Plantilla de Rol Reutilizable</div>
              <div className={evalResult.stepEvaluated >= 8 ? "text-emerald-400" : ""}>8. Comprobación de Excepción GRANT Autorizada</div>
              <div className={evalResult.stepEvaluated >= 9 ? "text-emerald-400" : ""}>9. Restricciones Contextuales (Caja, Bodega, Límites, Período)</div>
              <div className="text-zinc-600">10. Denegar por Defecto (Default Deny)</div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: ASIGNACIONES OPERATIVAS */}
      {activeSubTab === 'asignaciones' && (
        <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
          <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Users size={18} className="text-[#00ff41]" />
            <span>Asignaciones Operativas del Usuario (Cajas, Bodegas, Límites)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <Building2 size={16} className="text-emerald-400" />
                <span>Establecimientos Permitidos</span>
              </div>
              <div className="font-mono text-zinc-500">{sampleMembership.assignedBranches.join(', ') || 'Sin asignaciones'}</div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <Wallet size={16} className="text-emerald-400" />
                <span>Cajas Autorizadas</span>
              </div>
              <div className="font-mono text-zinc-500">{sampleMembership.assignedCashRegisters.join(', ') || 'Sin asignaciones'}</div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>Límite de Descuento Directo</span>
              </div>
              <div className="font-mono text-zinc-500">{sampleMembership.maxDiscountLimitPercent.toFixed(1)}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
