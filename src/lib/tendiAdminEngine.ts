/**
 * TENDI ERP - Módulo de Administración Multiempresa y Motor de Gobernanza
 * Arquitectura de Aislamiento Lógico (companyId), RBAC/ABAC Granular,
 * Auditoría Inmutable, Aprobaciones y Motor de Autorización can().
 */

// --------------------------------------------------------------------------
// 1. MODELO DE DATOS Y RELACIONES (Multi-Tenant Data Schema)
// --------------------------------------------------------------------------

export interface Company {
  companyId: string;
  taxId: string; // RUC 13 dígitos Ecuador
  businessName: string; // Razón Social
  tradeName: string; // Nombre Comercial
  address: string;
  phone: string;
  email: string;
  taxRegime: 'RIMPE_EMPRENDEDOR' | 'RIMPE_NEGOCIO_POPULAR' | 'GENERAL' | 'CONTRIBUYENTE_ESPECIAL';
  specialTaxpayerNo?: string;
  keepAccounting: boolean;
  currency: 'USD';
  timeZone: 'America/Guayaquil';
  active: boolean;
  createdAt: string;
}

export interface CompanySettings {
  companyId: string; // FK
  electronicSignaturePath?: string;
  electronicSignatureExpiry?: string;
  sriEnvironment: '1' | '2'; // 1=Pruebas, 2=Producción
  defaultIvaRate: number; // Ej. 15
  logoUrl?: string;
  enabledModules: string[]; // ['sales', 'purchases', 'inventory', 'treasury', 'accounting', 'sri']
  allowNegativeStock: boolean;
  requireApprovalForAnnulment: boolean;
  maxDiscountWithoutApproval: number; // Porcentaje máximo
}

export interface Establishment {
  companyId: string;
  establishmentCode: string; // 001, 002...
  name: string;
  address: string;
  active: boolean;
}

export interface EmissionPoint {
  companyId: string;
  establishmentCode: string;
  emissionPointCode: string; // 001, 002...
  name: string;
  active: boolean;
}

export interface Warehouse {
  companyId: string;
  warehouseId: string;
  code: string;
  name: string;
  establishmentCode: string;
  active: boolean;
}

export interface CashRegister {
  companyId: string;
  cashRegisterId: string;
  code: string;
  name: string;
  establishmentCode: string;
  emissionPointCode: string;
  active: boolean;
}

export interface PaymentMethod {
  companyId: string;
  paymentMethodCode: string; // SRI 01, 19, 20...
  name: string;
  sriCode: string;
  active: boolean;
}

export interface User {
  userId: string;
  username: string;
  email: string;
  fullName: string;
  phone?: string;
  identityType: 'CEDULA' | 'RUC' | 'PASAPORTE';
  identityNumber: string;
  active: boolean;
  passwordHash: string;
  mfaEnabled: boolean;
  lastAccessAt?: string;
  isSuperAdmin?: boolean;
}

export interface CompanyMembership {
  companyId: string;
  userId: string;
  roleId: string;
  active: boolean;
  assignedBranches: string[];
  assignedWarehouses: string[];
  assignedCashRegisters: string[];
  assignedEmissionPoints: string[];
  assignedPaymentMethods: string[];
  maxDiscountLimitPercent: number;
  maxApprovalAmount: number;
}

export interface Role {
  companyId: string; // 'GLOBAL' para roles del sistema o ID de empresa
  roleId: string;
  name: string;
  description: string;
  isSystemRole: boolean;
}

export interface Permission {
  permissionId: string; // Formato modulo.recurso.accion
  module: string;
  resource: string;
  action: 'view' | 'create' | 'edit' | 'delete' | 'annul' | 'approve' | 'reopen' | 'print' | 'export' | 'configure';
  description: string;
}

export interface RolePermission {
  companyId: string;
  roleId: string;
  permissionId: string; // modulo.recurso.accion
}

export interface UserPermissionOverride {
  companyId: string;
  userId: string;
  permissionId: string;
  type: 'GRANT' | 'DENY'; // Grant u Override Deny explícito
}

export interface AuditLog {
  auditId: string;
  companyId: string;
  userId: string;
  userFullName: string;
  timestamp: string;
  action: string;
  module: string;
  entity: string;
  entityId: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  reason?: string;
  ipAddress: string;
  deviceInfo: string;
  sessionId: string;
  result: 'SUCCESS' | 'DENIED' | 'FAILURE';
  traceabilityId: string;
}

export interface ApprovalRequest {
  requestId: string;
  companyId: string;
  applicantUserId: string;
  applicantName: string;
  approverUserId?: string;
  approverName?: string;
  actionType: 'ANNUL_INVOICE' | 'REOPEN_CASH_CLOSE' | 'ADJUST_INVENTORY' | 'MODIFY_CLOSED_PERIOD' | 'CHANGE_SEQUENCE' | 'OVERRIDE_DISCOUNT';
  resourceId: string; // ID del documento
  details: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedAt?: string;
  rejectionReason?: string;
}

// --------------------------------------------------------------------------
// 2. CATÁLOGO INICIAL DE PERMISOS (Formato modulo.recurso.accion)
// --------------------------------------------------------------------------

export const INITIAL_PERMISSION_CATALOG: Permission[] = [
  // Ventas & POS
  { permissionId: 'sales.invoices.view', module: 'sales', resource: 'invoices', action: 'view', description: 'Consultar comprobantes y facturas de venta' },
  { permissionId: 'sales.invoices.create', module: 'sales', resource: 'invoices', action: 'create', description: 'Emitir nuevas facturas en punto de venta / facturación' },
  { permissionId: 'sales.invoices.edit', module: 'sales', resource: 'invoices', action: 'edit', description: 'Modificar borradores de factura' },
  { permissionId: 'sales.invoices.print', module: 'sales', resource: 'invoices', action: 'print', description: 'Reimprimir comprobantes de venta' },
  { permissionId: 'sales.invoices.annul', module: 'sales', resource: 'invoices', action: 'annul', description: 'Anular o emitir Nota de Crédito para facturas autorizadas' },
  { permissionId: 'sales.invoices.export', module: 'sales', resource: 'invoices', action: 'export', description: 'Exportar listado de facturas a Excel/PDF' },

  // Compras & Proveedores
  { permissionId: 'purchases.orders.view', module: 'purchases', resource: 'orders', action: 'view', description: 'Ver ordenes de compra e ingresos' },
  { permissionId: 'purchases.orders.create', module: 'purchases', resource: 'orders', action: 'create', description: 'Crear registros de compras y sustentación' },
  { permissionId: 'purchases.orders.approve', module: 'purchases', resource: 'orders', action: 'approve', description: 'Aprobar compras que superan el monto límite' },

  // Inventarios & Kardex
  { permissionId: 'inventory.products.view', module: 'inventory', resource: 'products', action: 'view', description: 'Consultar catálogo de productos y stock' },
  { permissionId: 'inventory.products.edit', module: 'inventory', resource: 'products', action: 'edit', description: 'Crear o modificar precios y productos' },
  { permissionId: 'inventory.receipts.create', module: 'inventory', resource: 'receipts', action: 'create', description: 'Registrar ingresos de inventario' },
  { permissionId: 'inventory.issues.create', module: 'inventory', resource: 'issues', action: 'create', description: 'Registrar egresos de inventario' },
  { permissionId: 'inventory.adjustments.create', module: 'inventory', resource: 'adjustments', action: 'create', description: 'Registrar ajustes de entrada y salida de bodega' },
  { permissionId: 'inventory.adjustments.approve', module: 'inventory', resource: 'adjustments', action: 'approve', description: 'Autorizar ajustes físicos de inventario' },

  // Tesorería & Caja
  { permissionId: 'treasury.cashOpen.create', module: 'treasury', resource: 'cashOpen', action: 'create', description: 'Aperturar turnos de caja con fondo inicial' },
  { permissionId: 'treasury.cashClose.create', module: 'treasury', resource: 'cashClose', action: 'create', description: 'Realizar arqueo y cierre de caja' },
  { permissionId: 'treasury.cashMovements.create', module: 'treasury', resource: 'cashMovements', action: 'create', description: 'Registrar ingresos y egresos de caja' },
  { permissionId: 'treasury.cashClose.reopen', module: 'treasury', resource: 'cashClose', action: 'reopen', description: 'Reabrir cierres de caja finalizados' },

  // Contabilidad & Períodos
  { permissionId: 'accounting.periods.view', module: 'accounting', resource: 'periods', action: 'view', description: 'Consultar estados financieros y períodos' },
  { permissionId: 'accounting.periods.close', module: 'accounting', resource: 'periods', action: 'configure', description: 'Cerrar o bloquear períodos contables' },

  // Administración & Seguridad
  { permissionId: 'admin.users.manage', module: 'admin', resource: 'users', action: 'configure', description: 'Crear, editar y desactivar usuarios' },
  { permissionId: 'admin.roles.manage', module: 'admin', resource: 'roles', action: 'configure', description: 'Gestionar roles y plantilla de matriz de permisos' },
  { permissionId: 'admin.company.configure', module: 'admin', resource: 'company', action: 'configure', description: 'Configurar datos tributarios, firma y secuenciales' },

  // Reportes (Mismo motor modulo.recurso.accion)
  { permissionId: 'reports.sales.view', module: 'reports', resource: 'sales', action: 'view', description: 'Ver reportes de ventas y margen comercial' },
  { permissionId: 'reports.sales.export', module: 'reports', resource: 'sales', action: 'export', description: 'Exportar reportes de ventas' },
  { permissionId: 'reports.accounting.viewSensitive', module: 'reports', resource: 'accounting', action: 'view', description: 'Consultar utilidades y datos contables sensibles' }
];

// --------------------------------------------------------------------------
// 3. ROLES PREDEFINIDOS DE PLANTILLA
// --------------------------------------------------------------------------

export const INITIAL_SYSTEM_ROLES: { roleId: string; name: string; description: string; permissions: string[] }[] = [
  {
    roleId: 'SUPER_ADMIN',
    name: 'Superadministrador de Plataforma',
    description: 'Acceso total a la administración global del sistema TENDI ERP',
    permissions: INITIAL_PERMISSION_CATALOG.map(p => p.permissionId)
  },
  {
    roleId: 'COMPANY_ADMIN',
    name: 'Administrador de Empresa',
    description: 'Gestión total dentro de la empresa asignada',
    permissions: INITIAL_PERMISSION_CATALOG.map(p => p.permissionId)
  },
  {
    roleId: 'GERENTE',
    name: 'Gerente General',
    description: 'Supervisión comercial, reportes de margen, aprobaciones y cierres',
    permissions: [
      'sales.invoices.view', 'sales.invoices.export', 'sales.invoices.annul',
      'purchases.orders.view', 'purchases.orders.approve',
      'inventory.products.view', 'inventory.adjustments.approve',
      'treasury.cashClose.reopen', 'reports.sales.view', 'reports.sales.export', 'reports.accounting.viewSensitive'
    ]
  },
  {
    roleId: 'CAJERO',
    name: 'Cajero / Facturador',
    description: 'Operación diaria en Punto de Venta (POS), cobros y arqueo de caja',
    permissions: [
      'sales.invoices.view', 'sales.invoices.create', 'sales.invoices.print',
      'treasury.cashOpen.create', 'treasury.cashClose.create', 'treasury.cashMovements.create',
      'inventory.products.view'
    ]
  },
  {
    roleId: 'BODEGA',
    name: 'Encargado de Bodega',
    description: 'Control de stock, ingresos de compras y recepción física',
    permissions: [
      'inventory.products.view', 'inventory.products.edit', 'inventory.adjustments.create',
      'purchases.orders.view'
    ]
  },
  {
    roleId: 'CONTADOR',
    name: 'Contador / Auditor Tributario',
    description: 'Revisión contable, libros mayores, SRI y estados de cuenta',
    permissions: [
      'sales.invoices.view', 'sales.invoices.export',
      'purchases.orders.view', 'accounting.periods.view', 'accounting.periods.close',
      'reports.sales.view', 'reports.accounting.viewSensitive'
    ]
  }
];

// --------------------------------------------------------------------------
// 4. MOTOR DE AUTORIZACIÓN CENTRAL (Evaluation Pipeline)
// --------------------------------------------------------------------------

export interface AuthorizationContext {
  cashRegisterId?: string;
  warehouseId?: string;
  establishmentCode?: string;
  paymentMethodCode?: string;
  requestedAmount?: number;
  requestedDiscountPercent?: number;
  isPeriodClosed?: boolean;
}

export interface AuthorizationResult {
  granted: boolean;
  stepEvaluated: number;
  reason: string;
}

export class AuthorizationEngine {
  /**
   * Orden de evaluación estricto de 10 pasos:
   * 1. Usuario activo
   * 2. Empresa activa
   * 3. Membresía activa del usuario en la empresa
   * 4. Módulo habilitado en la empresa
   * 5. Bloqueos de seguridad globales
   * 6. Denegación individual explícita (DENY Override)
   * 7. Permiso concedido por Rol asignado
   * 8. Excepción individual autorizada (GRANT Override)
   * 9. Restricciones contextuales (Caja, Bodega, Descuento, Período)
   * 10. Denegar por defecto
   */
  public static can(
    user: User,
    company: Company,
    companySettings: CompanySettings,
    membership: CompanyMembership,
    rolePermissions: RolePermission[],
    userOverrides: UserPermissionOverride[],
    permissionId: string,
    context?: AuthorizationContext
  ): AuthorizationResult {
    // 1. Usuario activo
    if (!user.active) {
      return { granted: false, stepEvaluated: 1, reason: 'El usuario se encuentra inactivo en el sistema.' };
    }

    // 2. Empresa activa
    if (!company.active) {
      return { granted: false, stepEvaluated: 2, reason: 'La empresa se encuentra inactiva o deshabilitada.' };
    }

    // 3. Membresía activa del usuario en la empresa
    if (!membership || !membership.active || membership.companyId !== company.companyId || membership.userId !== user.userId) {
      return { granted: false, stepEvaluated: 3, reason: 'El usuario no posee una membresía activa en esta empresa.' };
    }

    // 4. Funcionalidad habilitada para la empresa (Feature Flags)
    const moduleName = permissionId.split('.')[0];
    if (companySettings.enabledModules && !companySettings.enabledModules.includes(moduleName)) {
      return { granted: false, stepEvaluated: 4, reason: `El módulo '${moduleName}' no está contratado u habilitado para esta empresa.` };
    }

    // 5. Bloqueos de seguridad (Superadmin bypass o auditoría especial)
    if (user.isSuperAdmin) {
      return { granted: true, stepEvaluated: 5, reason: 'Permiso concedido por rol Superadministrador de Plataforma.' };
    }

    // 6. Denegación individual explícita (DENY)
    const explicitDeny = userOverrides.find(o => o.companyId === company.companyId && o.userId === user.userId && o.permissionId === permissionId && o.type === 'DENY');
    if (explicitDeny) {
      return { granted: false, stepEvaluated: 6, reason: 'Denegación explícita configurada directamente para este usuario.' };
    }

    // 7. Permiso concedido por rol
    const roleGranted = rolePermissions.some(rp => rp.companyId === company.companyId && rp.roleId === membership.roleId && rp.permissionId === permissionId);

    // 8. Excepción individual autorizada (GRANT)
    const explicitGrant = userOverrides.find(o => o.companyId === company.companyId && o.userId === user.userId && o.permissionId === permissionId && o.type === 'GRANT');

    if (!roleGranted && !explicitGrant) {
      return { granted: false, stepEvaluated: 8, reason: `El usuario no tiene asignado el permiso '${permissionId}' por rol ni excepción.` };
    }

    // 9. Restricciones contextuales
    if (context) {
      // Período cerrado
      if (context.isPeriodClosed) {
        return { granted: false, stepEvaluated: 9, reason: 'Operación denegada: El período contable seleccionado está cerrado.' };
      }

      // Restricción de Caja
      if (context.cashRegisterId && membership.assignedCashRegisters.length > 0) {
        if (!membership.assignedCashRegisters.includes(context.cashRegisterId)) {
          return { granted: false, stepEvaluated: 9, reason: `El usuario no tiene acceso a la caja '${context.cashRegisterId}'.` };
        }
      }

      // Restricción de Bodega
      if (context.warehouseId && membership.assignedWarehouses.length > 0) {
        if (!membership.assignedWarehouses.includes(context.warehouseId)) {
          return { granted: false, stepEvaluated: 9, reason: `El usuario no tiene acceso a la bodega '${context.warehouseId}'.` };
        }
      }

      // Descuento máximo
      if (context.requestedDiscountPercent !== undefined && membership.maxDiscountLimitPercent !== undefined) {
        if (context.requestedDiscountPercent > membership.maxDiscountLimitPercent) {
          return { granted: false, stepEvaluated: 9, reason: `Descuento solicitado (${context.requestedDiscountPercent}%) supera el límite del usuario (${membership.maxDiscountLimitPercent}%).` };
        }
      }

      // Monto máximo de aprobación
      if (context.requestedAmount !== undefined && membership.maxApprovalAmount !== undefined) {
        if (membership.maxApprovalAmount > 0 && context.requestedAmount > membership.maxApprovalAmount) {
          return { granted: false, stepEvaluated: 9, reason: `Monto de transacción ($${context.requestedAmount}) supera la atribución del usuario ($${membership.maxApprovalAmount}).` };
        }
      }
    }

    // Concedido con éxito
    return {
      granted: true,
      stepEvaluated: 9,
      reason: 'Permiso autorizado exitosamente por matriz de seguridad.'
    };
  }
}

// --------------------------------------------------------------------------
// 5. REGISTRO DE AUDITORÍA INMUTABLE (AuditLogger)
// --------------------------------------------------------------------------
const readAdminStorage = <T,>(key: string, fallback: T): T => {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) as T : fallback;
  } catch {
    return fallback;
  }
};

const writeAdminStorage = (key: string, value: unknown) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory state when browser storage is unavailable.
  }
};

export class AuditLogger {
  private static logs: AuditLog[] = readAdminStorage<AuditLog[]>('tendi_admin_audit_logs', []);

  public static log(entry: Omit<AuditLog, 'auditId' | 'timestamp' | 'traceabilityId'>): AuditLog {
    const fullLog: AuditLog = {
      ...entry,
      auditId: 'AUD-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      timestamp: new Date().toISOString(),
      traceabilityId: 'TRC-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
    };

    this.logs.unshift(fullLog);
    writeAdminStorage('tendi_admin_audit_logs', this.logs);
    return fullLog;
  }

  public static getLogs(companyId?: string): AuditLog[] {
    if (!companyId) return this.logs;
    return this.logs.filter(l => l.companyId === companyId);
  }
}

// --------------------------------------------------------------------------
// 6. GESTOR DE FLUJOS DE APROBACIÓN (ApprovalWorkflowManager)
// --------------------------------------------------------------------------
export class ApprovalWorkflowManager {
  private static requests: ApprovalRequest[] = readAdminStorage<ApprovalRequest[]>('tendi_admin_approval_requests', []);

  public static createRequest(req: Omit<ApprovalRequest, 'requestId' | 'status' | 'requestedAt'>): ApprovalRequest {
    const newReq: ApprovalRequest = {
      ...req,
      requestId: 'APR-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      status: 'PENDING',
      requestedAt: new Date().toISOString()
    };
    this.requests.unshift(newReq);
    writeAdminStorage('tendi_admin_approval_requests', this.requests);

    // Auditoría automática
    AuditLogger.log({
      companyId: req.companyId,
      userId: req.applicantUserId,
      userFullName: req.applicantName,
      action: 'CREATE_APPROVAL_REQUEST',
      module: 'admin',
      entity: 'approvalRequests',
      entityId: newReq.requestId,
      newValues: newReq,
      reason: req.details,
      ipAddress: '127.0.0.1',
      deviceInfo: 'TENDI Web Application',
      sessionId: 'SESS-CURRENT',
      result: 'SUCCESS'
    });

    return newReq;
  }

  public static resolveRequest(
    requestId: string,
    approverUserId: string,
    approverName: string,
    approve: boolean,
    rejectionReason?: string
  ): ApprovalRequest | null {
    const target = this.requests.find(r => r.requestId === requestId);
    if (!target) return null;

    target.approverUserId = approverUserId;
    target.approverName = approverName;
    target.status = approve ? 'APPROVED' : 'REJECTED';
    target.resolvedAt = new Date().toISOString();
    if (rejectionReason) target.rejectionReason = rejectionReason;
    writeAdminStorage('tendi_admin_approval_requests', this.requests);

    AuditLogger.log({
      companyId: target.companyId,
      userId: approverUserId,
      userFullName: approverName,
      action: approve ? 'APPROVE_REQUEST' : 'REJECT_REQUEST',
      module: 'admin',
      entity: 'approvalRequests',
      entityId: target.requestId,
      newValues: target,
      reason: rejectionReason || 'Aprobación concedida por autoridad',
      ipAddress: '127.0.0.1',
      deviceInfo: 'TENDI Web Application',
      sessionId: 'SESS-CURRENT',
      result: 'SUCCESS'
    });

    return target;
  }

  public static getRequests(companyId: string): ApprovalRequest[] {
    return this.requests.filter(r => r.companyId === companyId);
  }
}
