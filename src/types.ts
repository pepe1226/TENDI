export type MainViewMode = 'login' | 'company_select' | 'pos' | 'admin';

export type AdminTab = 
  | 'administracion'
  | 'inventario'
  | 'ventas' 
  | 'compras' 
  | 'tesoreria' 
  | 'contabilidad' 
  | 'analitica' 
  | 'operaciones'
  | 'rrhh'
  | 'matriz_permisos'
  | 'aprobaciones'
  | 'kardex_stock'
  | 'cartera'
  | 'pagos'
  | 'produccion'
  | 'nomina'
  | 'activos'
  | 'tablero'
  | 'movil' 
  | 'soporte';

export interface Company {
  id: string;
  name: string;
  ruc: string;
  address: string;
  establishment: string;
  emissionPoint: string;
  environment: 'PRUEBAS' | 'PRODUCCION';
  tradeName: string;
  dbName?: string; // Operative DB e.g. 7791163287_db0000000003
  systemDb?: string;
  empresaId?: string; // Global cloud identifier
  baseOrigen?: string; // Origin operational DB name for cloud consolidation
  active?: boolean;
}

export interface SystemDatabaseContext {
  systemDbName: 'tendi_system';
  activeEmpresaId: string;
  activeBaseOrigen: string; // e.g. 7791163287_db0000000003
  managedEntities: string[]; // usuarios, empresas, licencias, permisos, módulos, reportes, logs
}

export interface MultiEmpresaRecord {
  empresaId: string;
  baseOrigen: string;
}

export interface SystemUser {
  id: string;
  username: string;
  fullName: string;
  role: 'ADMINISTRADOR' | 'FACTURADOR' | 'CAJERO' | 'SUPERVISOR' | 'SUPER USUARIO' | 'BODEGA' | 'CONTADOR' | 'SIN CONFIGURAR';
  pin: string; // 4-digit PIN for quick POS access
  active: boolean;
  password?: string;
  passwordHash?: string;
  passwordSalt?: string;
  cedula?: string;
  idType?: string;
  email?: string;
  companyIds?: string[];
  permissions?: Record<string, boolean>;
  assignedBranches?: string[];
  assignedCashRegisters?: string[];
  assignedWarehouses?: string[];
  assignedCostCenters?: string[];
  assignedPaymentMethods?: string[];
  assignedInventoryMovements?: string[];
  primaryCashRegisterId?: string;
  primaryWarehouseId?: string;
  primaryCostCenterId?: string;
  primaryPaymentMethodId?: string;
}

export interface Supplier {
  id: string;
  ruc: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

export interface PurchaseRecord {
  id: string;
  date: string;
  supplierRuc: string;
  supplierName: string;
  invoiceNumber: string;
  subtotal: number;
  iva: number;
  total: number;
  status: 'REGISTRADA' | 'ANULADA';
  itemsCount: number;
}
