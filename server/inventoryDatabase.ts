import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';
import { promises as fs } from 'node:fs';

export type InventoryDocumentStatus = 'BORRADOR' | 'CONTABILIZADO' | 'REVERSADO';
export type InventoryDocumentType = 'ENTRADA' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE' | 'CONTEO' | 'REVERSA';
export type InventoryPermission =
  | 'inventory.products.view'
  | 'inventory.products.edit'
  | 'inventory.warehouses.view'
  | 'inventory.warehouses.manage'
  | 'inventory.receipts.create'
  | 'inventory.issues.create'
  | 'inventory.transfers.create'
  | 'inventory.adjustments.create'
  | 'inventory.counts.create'
  | 'inventory.documents.post'
  | 'inventory.documents.reverse'
  | 'inventory.replenishment.view'
  | 'inventory.replenishment.edit'
  | 'inventory.audit.view'
  | 'inventory.classification.view'
  | 'inventory.classification.edit'
  | 'inventory.classification.deactivate'
  | 'inventory.classification.merge'
  | 'inventory.classification.reassign'
  | 'inventory.suppliers.view'
  | 'inventory.suppliers.manage'
  | 'inventory.suppliers.primary'
  | 'inventory.suppliers.costs';

export type InventoryClassificationLevel = 'LINEA' | 'CATEGORIA' | 'SUBCATEGORIA' | 'SUBGRUPO';

export interface InventoryContext {
  userId: string;
  companyId: string;
  warehouseId: string;
  permissions: string[];
  assignedWarehouseIds?: string[];
}

export interface AuthProvisionInput {
  id: string;
  username: string;
  fullName: string;
  role: string;
  passwordHash: string;
  passwordSalt: string;
  permissions?: string[];
  company: { id: string; name: string };
  warehouse?: { id: string; code: string; name: string };
}

export interface AuthSession {
  token: string;
  userId: string;
  username: string;
  companyId: string;
  warehouseId: string;
  permissions: string[];
  expiresAt: string;
}

export interface InventoryProductInput {
  id?: string;
  code: string;
  name: string;
  barcode?: string;
  alternateCodes?: string[];
  categoryId?: string;
  baseUnit?: string;
  price?: number;
  averageCost?: number;
  active?: boolean;
  tracksLots?: boolean;
  tracksSerials?: boolean;
  tracksExpiry?: boolean;
  lineId?: string;
  subcategoryId?: string;
  subgroupId?: string;
  brand?: string;
  flavor?: string;
  contentValue?: number;
  contentUnit?: string;
  presentation?: string;
  containerType?: string;
  returnable?: boolean;
  size?: string;
  color?: string;
  internalUnit?: string;
  purchaseUnit?: string;
  saleUnit?: string;
  purchaseConversionFactor?: number;
  saleConversionFactor?: number;
  inventoryAccount?: string;
  salesAccount?: string;
  costAccount?: string;
}

export interface InventoryClassificationInput {
  id?: string;
  code: string;
  name: string;
  lineId?: string;
  categoryId?: string;
  subcategoryId?: string;
  inventoryAccount?: string;
  salesAccount?: string;
  costAccount?: string;
  active?: boolean;
}

export interface InventorySupplierInput {
  id?: string;
  code?: string;
  name: string;
  taxId?: string;
  active?: boolean;
}

export interface InventorySupplierRelationInput {
  supplierId: string;
  isPrimary?: boolean;
  supplierProductCode?: string;
  purchaseUnitId?: string;
  conversionFactor?: number;
  lastCost?: number;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  paymentTerms?: string;
  usualDiscount?: number;
  priority?: number;
  status?: string;
  notes?: string;
}

export interface InventoryLineInput {
  productId: string;
  quantity: number;
  unitCost?: number;
  direction?: 1 | -1;
  countedQuantity?: number;
  note?: string;
}

export interface InventoryDocumentInput {
  idempotencyKey: string;
  type: InventoryDocumentType;
  warehouseId: string;
  destinationWarehouseId?: string;
  documentNumber?: string;
  sourceDocumentId?: string;
  supplierId?: string;
  note?: string;
  lines: InventoryLineInput[];
}

const now = () => new Date().toISOString();
const normalize = (value: unknown) => String(value ?? '').trim().toUpperCase();
const ALL_INVENTORY_PERMISSIONS: InventoryPermission[] = [
  'inventory.products.view', 'inventory.products.edit', 'inventory.warehouses.view',
  'inventory.warehouses.manage', 'inventory.receipts.create', 'inventory.issues.create',
  'inventory.transfers.create', 'inventory.adjustments.create', 'inventory.counts.create',
  'inventory.documents.post', 'inventory.documents.reverse', 'inventory.replenishment.view',
  'inventory.replenishment.edit', 'inventory.audit.view', 'inventory.classification.view',
  'inventory.classification.edit', 'inventory.classification.deactivate', 'inventory.classification.merge',
  'inventory.classification.reassign', 'inventory.suppliers.view', 'inventory.suppliers.manage',
  'inventory.suppliers.primary', 'inventory.suppliers.costs'
];
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const base64 = (value: ArrayBuffer) => Buffer.from(value).toString('base64');

const derivePasswordHash = async (password: string, saltBase64: string) => {
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Buffer.from(saltBase64, 'base64'),
    iterations: 100_000
  }, key, 256);
  return base64(bits);
};

export class InventoryDatabase {
  private readonly db: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  private constructor(db: DatabaseSync) {
    this.db = db;
    this.migrate();
  }

  static async open(dataDirectory: string) {
    await fs.mkdir(dataDirectory, { recursive: true });
    const database = new DatabaseSync(path.join(dataDirectory, 'tendi.inventory.sqlite'));
    database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    return new InventoryDatabase(database);
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_products (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        category_id TEXT,
        base_unit TEXT NOT NULL DEFAULT 'UNIDAD',
        sale_price REAL NOT NULL DEFAULT 0,
        average_cost REAL NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        tracks_lots INTEGER NOT NULL DEFAULT 0,
        tracks_serials INTEGER NOT NULL DEFAULT 0,
        tracks_expiry INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_codes (
        company_id TEXT NOT NULL,
        code TEXT NOT NULL,
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        code_type TEXT NOT NULL,
        PRIMARY KEY(company_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_lines (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        inventory_account TEXT,
        sales_account TEXT,
        cost_account TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deactivated_at TEXT,
        UNIQUE(company_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_categories (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        line_id TEXT NOT NULL REFERENCES inventory_product_lines(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deactivated_at TEXT,
        UNIQUE(company_id, line_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_subcategories (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        category_id TEXT NOT NULL REFERENCES inventory_product_categories(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deactivated_at TEXT,
        UNIQUE(company_id, category_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_subgroups (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        subcategory_id TEXT NOT NULL REFERENCES inventory_product_subcategories(id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deactivated_at TEXT,
        UNIQUE(company_id, subcategory_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_suppliers (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        code TEXT,
        name TEXT NOT NULL,
        tax_id TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_product_suppliers (
        company_id TEXT NOT NULL,
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        supplier_id TEXT NOT NULL REFERENCES inventory_suppliers(id),
        is_primary INTEGER NOT NULL DEFAULT 0,
        supplier_product_code TEXT,
        purchase_unit_id TEXT,
        conversion_factor REAL NOT NULL DEFAULT 1,
        last_cost REAL NOT NULL DEFAULT 0,
        average_cost REAL NOT NULL DEFAULT 0,
        last_purchase_date TEXT,
        minimum_order_quantity REAL NOT NULL DEFAULT 0,
        lead_time_days INTEGER NOT NULL DEFAULT 0,
        payment_terms TEXT,
        usual_discount REAL NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ACTIVO',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(company_id, product_id, supplier_id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_primary_supplier
        ON inventory_product_suppliers(company_id, product_id)
        WHERE is_primary = 1 AND status = 'ACTIVO';

      CREATE TABLE IF NOT EXISTS inventory_warehouses (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(company_id, code)
      );

      CREATE TABLE IF NOT EXISTS inventory_balances (
        company_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id),
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        stock REAL NOT NULL DEFAULT 0,
        average_cost REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(company_id, warehouse_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_documents (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id),
        destination_warehouse_id TEXT REFERENCES inventory_warehouses(id),
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        document_number TEXT,
        source_document_id TEXT,
        reversal_of_id TEXT REFERENCES inventory_documents(id),
        note TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        posted_by TEXT,
        created_at TEXT NOT NULL,
        posted_at TEXT,
        UNIQUE(company_id, idempotency_key),
        UNIQUE(company_id, document_number)
      );

      CREATE TABLE IF NOT EXISTS inventory_document_lines (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES inventory_documents(id),
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        direction INTEGER NOT NULL DEFAULT 1 CHECK(direction IN (-1, 1)),
        counted_quantity REAL,
        note TEXT NOT NULL DEFAULT '',
        CHECK(quantity > 0)
      );

      CREATE TABLE IF NOT EXISTS inventory_ledger (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id),
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        document_id TEXT NOT NULL REFERENCES inventory_documents(id),
        document_line_id TEXT NOT NULL REFERENCES inventory_document_lines(id),
        movement_type TEXT NOT NULL,
        quantity_delta REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        running_stock REAL NOT NULL,
        running_average_cost REAL NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(document_id, document_line_id, warehouse_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_replenishment_rules (
        company_id TEXT NOT NULL,
        warehouse_id TEXT NOT NULL REFERENCES inventory_warehouses(id),
        product_id TEXT NOT NULL REFERENCES inventory_products(id),
        minimum_stock REAL NOT NULL DEFAULT 0,
        maximum_stock REAL NOT NULL DEFAULT 0,
        reorder_quantity REAL NOT NULL DEFAULT 0,
        PRIMARY KEY(company_id, warehouse_id, product_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_audit_log (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_auth_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_auth_companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS inventory_auth_memberships (
        user_id TEXT NOT NULL REFERENCES inventory_auth_users(id),
        company_id TEXT NOT NULL REFERENCES inventory_auth_companies(id),
        permissions_json TEXT NOT NULL,
        assigned_warehouses_json TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY(user_id, company_id)
      );

      CREATE TABLE IF NOT EXISTS inventory_auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES inventory_auth_users(id),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_ledger_lookup
        ON inventory_ledger(company_id, warehouse_id, product_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_inventory_documents_lookup
      ON inventory_documents(company_id, warehouse_id, status, created_at);
    `);

    this.ensureColumn('inventory_products', 'line_id', 'TEXT');
    this.ensureColumn('inventory_products', 'subcategory_id', 'TEXT');
    this.ensureColumn('inventory_products', 'subgroup_id', 'TEXT');
    this.ensureColumn('inventory_products', 'brand', 'TEXT');
    this.ensureColumn('inventory_products', 'flavor', 'TEXT');
    this.ensureColumn('inventory_products', 'content_value', 'REAL');
    this.ensureColumn('inventory_products', 'content_unit', 'TEXT');
    this.ensureColumn('inventory_products', 'presentation', 'TEXT');
    this.ensureColumn('inventory_products', 'container_type', 'TEXT');
    this.ensureColumn('inventory_products', 'returnable', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('inventory_products', 'size', 'TEXT');
    this.ensureColumn('inventory_products', 'color', 'TEXT');
    this.ensureColumn('inventory_products', 'internal_unit', 'TEXT');
    this.ensureColumn('inventory_products', 'purchase_unit', 'TEXT');
    this.ensureColumn('inventory_products', 'sale_unit', 'TEXT');
    this.ensureColumn('inventory_products', 'purchase_conversion_factor', 'REAL NOT NULL DEFAULT 1');
    this.ensureColumn('inventory_products', 'sale_conversion_factor', 'REAL NOT NULL DEFAULT 1');
    this.ensureColumn('inventory_products', 'inventory_account', 'TEXT');
    this.ensureColumn('inventory_products', 'sales_account', 'TEXT');
    this.ensureColumn('inventory_products', 'cost_account', 'TEXT');
    this.ensureColumn('inventory_documents', 'supplier_id', 'TEXT');
    this.ensureColumn('inventory_product_suppliers', 'purchased_quantity', 'REAL NOT NULL DEFAULT 0');

    const adminMemberships = this.statement(`
      SELECT m.user_id, m.company_id, m.permissions_json
      FROM inventory_auth_memberships m
      JOIN inventory_auth_users u ON u.id = m.user_id
      WHERE UPPER(u.role) IN ('ADMIN', 'ADMINISTRADOR', 'SUPER USUARIO')
    `).all() as any[];
    for (const membership of adminMemberships) {
      const permissions = JSON.parse(membership.permissions_json || '[]') as string[];
      const missingPermissions = ALL_INVENTORY_PERMISSIONS.filter(permission => !permissions.includes(permission));
      if (missingPermissions.length) {
        permissions.push(...missingPermissions);
        this.statement('UPDATE inventory_auth_memberships SET permissions_json = ? WHERE user_id = ? AND company_id = ?').run(JSON.stringify(permissions), membership.user_id, membership.company_id);
      }
    }
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const existing = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    if (!existing.some(item => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  private statement(sql: string) {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private createSession(userId: string, username: string, companyId: string, warehouseId: string, permissions: string[]): AuthSession {
    const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    this.statement(`INSERT INTO inventory_auth_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`).run(hashToken(token), userId, expiresAt, now());
    return { token, userId, username, companyId, warehouseId, permissions, expiresAt };
  }

  async provisionInitialAdmin(input: AuthProvisionInput) {
    const existing = this.statement('SELECT COUNT(*) AS count FROM inventory_auth_users').get() as any;
    if (Number(existing?.count || 0) > 0) throw new Error('La configuración inicial del servidor ya fue realizada.');
    const warehouse = input.warehouse || { id: `${input.company.id}-MAIN`, code: '001', name: 'Bodega principal' };
    const permissions = Array.from(new Set([...(input.permissions || []), ...ALL_INVENTORY_PERMISSIONS]));
    const timestamp = now();

    return this.transaction(() => {
      this.statement(`INSERT INTO inventory_auth_users (id, username, full_name, role, password_hash, password_salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.id, normalize(input.username), input.fullName.trim(), input.role, input.passwordHash, input.passwordSalt, timestamp, timestamp);
      this.statement(`INSERT INTO inventory_auth_companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(input.company.id, input.company.name.trim(), timestamp, timestamp);
      this.statement(`INSERT INTO inventory_auth_memberships (user_id, company_id, permissions_json, assigned_warehouses_json) VALUES (?, ?, ?, ?)`).run(input.id, input.company.id, JSON.stringify(permissions), JSON.stringify([warehouse.id]));
      this.ensureWarehouse(input.company.id, warehouse.id, warehouse.code, warehouse.name);
      return this.createSession(input.id, normalize(input.username), input.company.id, warehouse.id, permissions);
    });
  }

  async authenticate(username: string, password: string, companyId?: string, warehouseId?: string) {
    const user: any = this.statement('SELECT * FROM inventory_auth_users WHERE username = ? AND active = 1').get(normalize(username));
    if (!user) throw new Error('Usuario inexistente o inactivo.');
    const candidateHash = await derivePasswordHash(password, user.password_salt);
    if (candidateHash !== user.password_hash) throw new Error('Contraseña incorrecta.');
    const membership: any = this.statement(`
      SELECT m.*, c.name AS company_name FROM inventory_auth_memberships m
      JOIN inventory_auth_companies c ON c.id = m.company_id
      WHERE m.user_id = ? AND m.active = 1 AND c.active = 1
    `).get(user.id);
    if (!membership) throw new Error('El usuario no tiene una empresa activa asignada.');
    const assignedWarehouses = JSON.parse(membership.assigned_warehouses_json || '[]') as string[];
    const selectedCompany = companyId && companyId === membership.company_id ? companyId : membership.company_id;
    const selectedWarehouse = warehouseId && assignedWarehouses.includes(warehouseId) ? warehouseId : assignedWarehouses[0];
    if (!selectedWarehouse) throw new Error('El usuario no tiene una bodega activa asignada.');
    return this.createSession(user.id, user.username, selectedCompany, selectedWarehouse, JSON.parse(membership.permissions_json || '[]'));
  }

  resolveSession(token: string, companyId?: string, warehouseId?: string): InventoryContext {
    if (!token) throw new Error('Sesión de inventario ausente.');
    const session: any = this.statement(`
      SELECT s.*, u.username, m.company_id, m.permissions_json, m.assigned_warehouses_json
      FROM inventory_auth_sessions s
      JOIN inventory_auth_users u ON u.id = s.user_id AND u.active = 1
      JOIN inventory_auth_memberships m ON m.user_id = u.id AND m.active = 1
      JOIN inventory_auth_companies c ON c.id = m.company_id AND c.active = 1
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(hashToken(token), now());
    if (!session) throw new Error('Sesión de inventario inválida o expirada.');
    const assignedWarehouses = JSON.parse(session.assigned_warehouses_json || '[]') as string[];
    const resolvedCompanyId = companyId || session.company_id;
    const resolvedWarehouseId = warehouseId || assignedWarehouses[0];
    if (resolvedCompanyId !== session.company_id) throw new Error('La sesión no pertenece a la empresa solicitada.');
    if (!resolvedWarehouseId || !assignedWarehouses.includes(resolvedWarehouseId)) throw new Error('La sesión no tiene acceso a la bodega solicitada.');
    return {
      userId: session.user_id,
      companyId: session.company_id,
      warehouseId: resolvedWarehouseId,
      permissions: JSON.parse(session.permissions_json || '[]'),
      assignedWarehouseIds: assignedWarehouses
    };
  }

  private audit(context: InventoryContext, action: string, entityType: string, entityId: string, details: unknown) {
    this.statement(`
      INSERT INTO inventory_audit_log
        (id, company_id, user_id, action, entity_type, entity_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(`AUD-${crypto.randomUUID()}`, context.companyId, context.userId, action, entityType, entityId, JSON.stringify(details), now());
  }

  assertWarehouse(context: InventoryContext, warehouseId: string) {
    if (context.companyId.trim() === '' || context.userId.trim() === '' || warehouseId.trim() === '') {
      throw new Error('El contexto de empresa, usuario y bodega es obligatorio.');
    }
    if (context.assignedWarehouseIds?.length && !context.assignedWarehouseIds.includes(warehouseId)) {
      throw new Error('El usuario no tiene acceso a la bodega solicitada.');
    }
    const warehouse = this.statement(`
      SELECT id FROM inventory_warehouses
      WHERE id = ? AND company_id = ? AND active = 1
    `).get(warehouseId, context.companyId);
    if (!warehouse) throw new Error('La bodega no existe o no pertenece a la empresa activa.');
  }

  assertPermission(context: InventoryContext, permission: InventoryPermission) {
    if (!context.permissions.includes(permission)) {
      throw new Error(`Permiso insuficiente: ${permission}`);
    }
  }

  ensureWarehouse(companyId: string, warehouseId: string, code: string, name: string) {
    const timestamp = now();
    this.statement(`
      INSERT INTO inventory_warehouses (id, company_id, code, name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, updated_at = excluded.updated_at
    `).run(warehouseId, companyId, normalize(code), name.trim(), timestamp, timestamp);
  }

  private classificationTable(level: InventoryClassificationLevel) {
    if (!['LINEA', 'CATEGORIA', 'SUBCATEGORIA', 'SUBGRUPO'].includes(level)) throw new Error('Nivel de clasificación inválido.');
    return level === 'LINEA' ? 'inventory_product_lines'
      : level === 'CATEGORIA' ? 'inventory_product_categories'
        : level === 'SUBCATEGORIA' ? 'inventory_product_subcategories'
          : 'inventory_product_subgroups';
  }

  private classificationParent(level: InventoryClassificationLevel) {
    return level === 'CATEGORIA' ? 'line_id'
      : level === 'SUBCATEGORIA' ? 'category_id'
        : level === 'SUBGRUPO' ? 'subcategory_id'
          : null;
  }

  private assertClassificationPermission(context: InventoryContext, permission: InventoryPermission) {
    this.assertPermission(context, permission);
  }

  private validateClassificationPath(companyId: string, lineId?: string, categoryId?: string, subcategoryId?: string, subgroupId?: string, requireActive = true) {
    if ((categoryId || subcategoryId || subgroupId) && !lineId) throw new Error('La clasificación inferior requiere una línea.');
    const activeClause = requireActive ? ' AND active = 1' : '';
    const line: any = lineId ? this.statement(`SELECT * FROM inventory_product_lines WHERE id = ? AND company_id = ?${activeClause}`).get(lineId, companyId) : null;
    if (lineId && !line) throw new Error('La línea no existe, está inactiva o pertenece a otra empresa.');
    const category: any = categoryId ? this.statement(`SELECT * FROM inventory_product_categories WHERE id = ? AND company_id = ?${activeClause}`).get(categoryId, companyId) : null;
    if (categoryId && (!category || category.line_id !== lineId)) throw new Error('La categoría no pertenece a la línea seleccionada.');
    const subcategory: any = subcategoryId ? this.statement(`SELECT * FROM inventory_product_subcategories WHERE id = ? AND company_id = ?${activeClause}`).get(subcategoryId, companyId) : null;
    if (subcategoryId && (!subcategory || subcategory.category_id !== categoryId)) throw new Error('La subcategoría no pertenece a la categoría seleccionada.');
    const subgroup: any = subgroupId ? this.statement(`SELECT * FROM inventory_product_subgroups WHERE id = ? AND company_id = ?${activeClause}`).get(subgroupId, companyId) : null;
    if (subgroupId && (!subgroup || subgroup.subcategory_id !== subcategoryId)) throw new Error('El subgrupo no pertenece a la subcategoría seleccionada.');
    return { line, category, subcategory, subgroup };
  }

  listClassifications(context: InventoryContext) {
    this.assertClassificationPermission(context, 'inventory.classification.view');
    const companyId = context.companyId;
    const lines = this.statement(`
      SELECT l.*, (SELECT COUNT(*) FROM inventory_product_categories c WHERE c.line_id = l.id) AS category_count,
        (SELECT COUNT(*) FROM inventory_products p WHERE p.line_id = l.id AND p.company_id = l.company_id) AS product_count
      FROM inventory_product_lines l WHERE l.company_id = ? ORDER BY l.name
    `).all(companyId);
    const categories = this.statement(`
      SELECT c.*, l.name AS line_name,
        (SELECT COUNT(*) FROM inventory_product_subcategories s WHERE s.category_id = c.id) AS subcategory_count,
        (SELECT COUNT(*) FROM inventory_products p WHERE p.category_id = c.id AND p.company_id = c.company_id) AS product_count
      FROM inventory_product_categories c JOIN inventory_product_lines l ON l.id = c.line_id AND l.company_id = c.company_id
      WHERE c.company_id = ? ORDER BY l.name, c.name
    `).all(companyId);
    const subcategories = this.statement(`
      SELECT s.*, c.name AS category_name, l.name AS line_name,
        (SELECT COUNT(*) FROM inventory_product_subgroups g WHERE g.subcategory_id = s.id) AS subgroup_count,
        (SELECT COUNT(*) FROM inventory_products p WHERE p.subcategory_id = s.id AND p.company_id = s.company_id) AS product_count
      FROM inventory_product_subcategories s
      JOIN inventory_product_categories c ON c.id = s.category_id AND c.company_id = s.company_id
      JOIN inventory_product_lines l ON l.id = c.line_id AND l.company_id = s.company_id
      WHERE s.company_id = ? ORDER BY l.name, c.name, s.name
    `).all(companyId);
    const subgroups = this.statement(`
      SELECT g.*, s.name AS subcategory_name, c.name AS category_name, l.name AS line_name,
        (SELECT COUNT(*) FROM inventory_products p WHERE p.subgroup_id = g.id AND p.company_id = g.company_id) AS product_count
      FROM inventory_product_subgroups g
      JOIN inventory_product_subcategories s ON s.id = g.subcategory_id AND s.company_id = g.company_id
      JOIN inventory_product_categories c ON c.id = s.category_id AND c.company_id = g.company_id
      JOIN inventory_product_lines l ON l.id = c.line_id AND l.company_id = g.company_id
      WHERE g.company_id = ? ORDER BY l.name, c.name, s.name, g.name
    `).all(companyId);
    return { lines, categories, subcategories, subgroups };
  }

  upsertClassification(context: InventoryContext, level: InventoryClassificationLevel, input: InventoryClassificationInput) {
    this.assertClassificationPermission(context, 'inventory.classification.edit');
    const code = normalize(input.code);
    const name = input.name.trim();
    if (!code || !name) throw new Error('La clasificación requiere código y nombre.');
    const table = this.classificationTable(level);
    const parentColumn = this.classificationParent(level);
    const parentId = level === 'CATEGORIA' ? input.lineId : level === 'SUBCATEGORIA' ? input.categoryId : level === 'SUBGRUPO' ? input.subcategoryId : undefined;
    if (parentColumn && !parentId) throw new Error(`${level} requiere su nivel superior.`);
    if (level === 'CATEGORIA') this.validateClassificationPath(context.companyId, parentId);
    if (level === 'SUBCATEGORIA') {
      const parent: any = this.statement('SELECT line_id FROM inventory_product_categories WHERE id = ? AND company_id = ? AND active = 1').get(parentId, context.companyId);
      if (!parent || (input.lineId && parent.line_id !== input.lineId)) throw new Error('La categoría no existe, está inactiva o no pertenece a la línea seleccionada.');
    }
    if (level === 'SUBGRUPO') {
      const parent: any = this.statement('SELECT s.category_id, c.line_id FROM inventory_product_subcategories s JOIN inventory_product_categories c ON c.id = s.category_id AND c.company_id = s.company_id WHERE s.id = ? AND s.company_id = ? AND s.active = 1 AND c.active = 1').get(parentId, context.companyId);
      if (!parent || (input.categoryId && parent.category_id !== input.categoryId) || (input.lineId && parent.line_id !== input.lineId)) throw new Error('La subcategoría no existe, está inactiva o no pertenece a la ruta seleccionada.');
    }
    const id = input.id || `INV-${level}-${crypto.randomUUID()}`;
    const timestamp = now();
    return this.transaction(() => {
      const existing: any = this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(id, context.companyId);
      if (existing && existing.active === 0 && input.active !== false) throw new Error('Una clasificación desactivada debe reactivarse mediante una operación explícita.');
      const columns = parentColumn ? `id, company_id, ${parentColumn}, code, name, active, created_by, created_at, updated_at` : 'id, company_id, code, name, inventory_account, sales_account, cost_account, active, created_by, created_at, updated_at';
      const values = parentColumn
        ? [id, context.companyId, parentId, code, name, input.active === false ? 0 : 1, context.userId, existing?.created_at || timestamp, timestamp]
        : [id, context.companyId, code, name, input.inventoryAccount || null, input.salesAccount || null, input.costAccount || null, input.active === false ? 0 : 1, context.userId, existing?.created_at || timestamp, timestamp];
      this.statement(`INSERT INTO ${table} (${columns}) VALUES (${values.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${parentColumn ? `${parentColumn}=excluded.${parentColumn},` : 'inventory_account=excluded.inventory_account, sales_account=excluded.sales_account, cost_account=excluded.cost_account,'} code=excluded.code, name=excluded.name, active=excluded.active, updated_at=excluded.updated_at`).run(...values);
      this.audit(context, existing ? 'ACTUALIZAR_CLASIFICACION' : 'CREAR_CLASIFICACION', level, id, { code, name, parentId });
      return this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(id, context.companyId);
    });
  }

  deactivateClassification(context: InventoryContext, level: InventoryClassificationLevel, id: string) {
    this.assertClassificationPermission(context, 'inventory.classification.deactivate');
    const table = this.classificationTable(level);
    const existing: any = this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(id, context.companyId);
    if (!existing) throw new Error('Clasificación no encontrada dentro de la empresa activa.');
    if (existing.active === 0) return existing;
    const timestamp = now();
    this.statement(`UPDATE ${table} SET active = 0, deactivated_at = ?, updated_at = ? WHERE id = ? AND company_id = ?`).run(timestamp, timestamp, id, context.companyId);
    this.audit(context, 'DESACTIVAR_CLASIFICACION', level, id, {});
    return this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(id, context.companyId);
  }

  mergeClassification(context: InventoryContext, level: InventoryClassificationLevel, sourceId: string, targetId: string) {
    this.assertClassificationPermission(context, 'inventory.classification.merge');
    if (sourceId === targetId) throw new Error('La clasificación origen y destino deben ser diferentes.');
    const table = this.classificationTable(level);
    const source: any = this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ? AND active = 1`).get(sourceId, context.companyId);
    const target: any = this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ? AND active = 1`).get(targetId, context.companyId);
    if (!source || !target) throw new Error('La clasificación origen y destino deben estar activas y pertenecer a la empresa.');
    const parentColumn = this.classificationParent(level);
    if (parentColumn && source[parentColumn] !== target[parentColumn]) throw new Error('Origen y destino deben pertenecer al mismo nivel superior.');
    return this.transaction(() => {
      if (level === 'LINEA') {
        this.statement('UPDATE inventory_product_categories SET line_id = ? WHERE company_id = ? AND line_id = ?').run(targetId, context.companyId, sourceId);
        this.statement('UPDATE inventory_products SET line_id = ? WHERE company_id = ? AND line_id = ?').run(targetId, context.companyId, sourceId);
      } else if (level === 'CATEGORIA') {
        this.statement('UPDATE inventory_product_subcategories SET category_id = ? WHERE company_id = ? AND category_id = ?').run(targetId, context.companyId, sourceId);
        this.statement('UPDATE inventory_products SET category_id = ? WHERE company_id = ? AND category_id = ?').run(targetId, context.companyId, sourceId);
      } else if (level === 'SUBCATEGORIA') {
        this.statement('UPDATE inventory_product_subgroups SET subcategory_id = ? WHERE company_id = ? AND subcategory_id = ?').run(targetId, context.companyId, sourceId);
        this.statement('UPDATE inventory_products SET subcategory_id = ? WHERE company_id = ? AND subcategory_id = ?').run(targetId, context.companyId, sourceId);
      } else {
        this.statement('UPDATE inventory_products SET subgroup_id = ? WHERE company_id = ? AND subgroup_id = ?').run(targetId, context.companyId, sourceId);
      }
      const timestamp = now();
      this.statement(`UPDATE ${table} SET active = 0, deactivated_at = ?, updated_at = ? WHERE id = ? AND company_id = ?`).run(timestamp, timestamp, sourceId, context.companyId);
      this.audit(context, 'FUSIONAR_CLASIFICACION', level, sourceId, { targetId });
      return this.statement(`SELECT * FROM ${table} WHERE id = ? AND company_id = ?`).get(targetId, context.companyId);
    });
  }

  reassignProductsClassification(context: InventoryContext, input: { productIds: string[]; lineId?: string; categoryId?: string; subcategoryId?: string; subgroupId?: string }) {
    this.assertClassificationPermission(context, 'inventory.classification.reassign');
    if (!input.productIds.length) throw new Error('Seleccione al menos un producto.');
    this.validateClassificationPath(context.companyId, input.lineId, input.categoryId, input.subcategoryId, input.subgroupId);
    return this.transaction(() => {
      for (const productId of input.productIds) {
        const product = this.statement('SELECT id FROM inventory_products WHERE id = ? AND company_id = ?').get(productId, context.companyId);
        if (!product) throw new Error('Uno de los productos no pertenece a la empresa activa.');
        this.statement('UPDATE inventory_products SET line_id = ?, category_id = ?, subcategory_id = ?, subgroup_id = ?, updated_at = ? WHERE id = ? AND company_id = ?').run(input.lineId || null, input.categoryId || null, input.subcategoryId || null, input.subgroupId || null, now(), productId, context.companyId);
        this.audit(context, 'REASIGNAR_CLASIFICACION', 'PRODUCT', productId, input);
      }
      return input.productIds;
    });
  }

  upsertProduct(companyId: string, input: InventoryProductInput) {
    const id = input.id || `INV-PROD-${crypto.randomUUID()}`;
    const timestamp = now();
    const code = normalize(input.code);
    const codes = Array.from(new Set([input.barcode, ...(input.alternateCodes || [])].map(normalize).filter(Boolean)));
    if (!code || !input.name.trim()) throw new Error('El producto requiere código interno y nombre.');
    this.validateClassificationPath(companyId, input.lineId, input.categoryId, input.subcategoryId, input.subgroupId);
    const line: any = input.lineId ? this.statement('SELECT inventory_account, sales_account, cost_account FROM inventory_product_lines WHERE id = ? AND company_id = ?').get(input.lineId, companyId) : null;
    const inventoryAccount = input.inventoryAccount ?? line?.inventory_account ?? null;
    const salesAccount = input.salesAccount ?? line?.sales_account ?? null;
    const costAccount = input.costAccount ?? line?.cost_account ?? null;

    return this.transaction(() => {
      this.statement(`
        INSERT INTO inventory_products
          (id, company_id, code, name, line_id, category_id, subcategory_id, subgroup_id, base_unit, sale_price, average_cost, active, tracks_lots, tracks_serials, tracks_expiry, brand, flavor, content_value, content_unit, presentation, container_type, returnable, size, color, internal_unit, purchase_unit, sale_unit, purchase_conversion_factor, sale_conversion_factor, inventory_account, sales_account, cost_account, created_at, updated_at)
        VALUES (${Array.from({ length: 34 }, () => '?').join(', ')})
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code, name = excluded.name, line_id = excluded.line_id, category_id = excluded.category_id, subcategory_id = excluded.subcategory_id, subgroup_id = excluded.subgroup_id,
          base_unit = excluded.base_unit, sale_price = excluded.sale_price, average_cost = excluded.average_cost,
          active = excluded.active, tracks_lots = excluded.tracks_lots, tracks_serials = excluded.tracks_serials,
          tracks_expiry = excluded.tracks_expiry, brand = excluded.brand, flavor = excluded.flavor, content_value = excluded.content_value, content_unit = excluded.content_unit,
          presentation = excluded.presentation, container_type = excluded.container_type, returnable = excluded.returnable, size = excluded.size, color = excluded.color,
          internal_unit = excluded.internal_unit, purchase_unit = excluded.purchase_unit, sale_unit = excluded.sale_unit, purchase_conversion_factor = excluded.purchase_conversion_factor,
          sale_conversion_factor = excluded.sale_conversion_factor, inventory_account = excluded.inventory_account, sales_account = excluded.sales_account, cost_account = excluded.cost_account,
          updated_at = excluded.updated_at
      `).run(
        id, companyId, code, input.name.trim(), input.lineId || null, input.categoryId || null, input.subcategoryId || null, input.subgroupId || null, input.baseUnit || 'UNIDAD',
        Number(input.price || 0), Number(input.averageCost || 0), input.active === false ? 0 : 1,
        input.tracksLots ? 1 : 0, input.tracksSerials ? 1 : 0, input.tracksExpiry ? 1 : 0, input.brand || null, input.flavor || null,
        input.contentValue ?? null, input.contentUnit || null, input.presentation || null, input.containerType || null, input.returnable ? 1 : 0,
        input.size || null, input.color || null, input.internalUnit || null, input.purchaseUnit || null, input.saleUnit || null,
        Number(input.purchaseConversionFactor || 1), Number(input.saleConversionFactor || 1), inventoryAccount, salesAccount, costAccount,
        timestamp, timestamp
      );

      this.statement('DELETE FROM inventory_product_codes WHERE company_id = ? AND product_id = ?').run(companyId, id);
      this.statement(`
        INSERT INTO inventory_product_codes (company_id, code, product_id, code_type)
        VALUES (?, ?, ?, ?)
      `).run(companyId, code, id, 'INTERNO');
      if (input.barcode && normalize(input.barcode) !== code) this.statement(`INSERT INTO inventory_product_codes (company_id, code, product_id, code_type) VALUES (?, ?, ?, ?)`).run(companyId, normalize(input.barcode), id, 'BARRAS');
      for (const alternate of codes.filter(item => item !== normalize(input.barcode))) {
        this.statement(`INSERT INTO inventory_product_codes (company_id, code, product_id, code_type) VALUES (?, ?, ?, ?)`).run(companyId, alternate, id, 'ALTERNO');
      }
      return { id, code, codes };
    });
  }

  listCatalogProducts(context: InventoryContext, filters: { query?: string; lineId?: string; categoryId?: string; subcategoryId?: string; subgroupId?: string; brand?: string; supplierId?: string; anySupplierId?: string; lastSupplierId?: string; withoutSupplier?: boolean; active?: boolean } = {}) {
    this.assertPermission(context, 'inventory.products.view');
    const conditions = ['p.company_id = ?'];
    const values: any[] = [context.companyId];
    if (filters.lineId) { conditions.push('p.line_id = ?'); values.push(filters.lineId); }
    if (filters.categoryId) { conditions.push('p.category_id = ?'); values.push(filters.categoryId); }
    if (filters.subcategoryId) { conditions.push('p.subcategory_id = ?'); values.push(filters.subcategoryId); }
    if (filters.subgroupId) { conditions.push('p.subgroup_id = ?'); values.push(filters.subgroupId); }
    if (filters.brand) { conditions.push('UPPER(COALESCE(p.brand, \'\')) LIKE ?'); values.push(`%${normalize(filters.brand)}%`); }
    if (filters.query) { conditions.push('(UPPER(p.name) LIKE ? OR UPPER(p.code) LIKE ? OR EXISTS (SELECT 1 FROM inventory_product_codes pcq WHERE pcq.product_id = p.id AND pcq.company_id = p.company_id AND pcq.code LIKE ?))'); const q = `%${normalize(filters.query)}%`; values.push(q, q, q); }
    if (filters.supplierId) { conditions.push('EXISTS (SELECT 1 FROM inventory_product_suppliers psf WHERE psf.company_id = p.company_id AND psf.product_id = p.id AND psf.supplier_id = ?)'); values.push(filters.supplierId); }
    if (filters.anySupplierId) { conditions.push('EXISTS (SELECT 1 FROM inventory_product_suppliers psf2 WHERE psf2.company_id = p.company_id AND psf2.product_id = p.id AND psf2.supplier_id = ?)'); values.push(filters.anySupplierId); }
    if (filters.lastSupplierId) { conditions.push('(SELECT ps3.supplier_id FROM inventory_product_suppliers ps3 WHERE ps3.company_id = p.company_id AND ps3.product_id = p.id ORDER BY ps3.last_purchase_date DESC NULLS LAST LIMIT 1) = ?'); values.push(filters.lastSupplierId); }
    if (filters.withoutSupplier) conditions.push('NOT EXISTS (SELECT 1 FROM inventory_product_suppliers ps4 WHERE ps4.company_id = p.company_id AND ps4.product_id = p.id)');
    if (filters.active !== undefined) { conditions.push('p.active = ?'); values.push(filters.active ? 1 : 0); }
    const rows = this.statement(`
      SELECT p.*, GROUP_CONCAT(DISTINCT pc.code) AS codes,
        l.code AS line_code, l.name AS line_name, c.code AS category_code, c.name AS category_name,
        sc.code AS subcategory_code, sc.name AS subcategory_name, sg.code AS subgroup_code, sg.name AS subgroup_name,
        (SELECT s.id FROM inventory_product_suppliers ps JOIN inventory_suppliers s ON s.id = ps.supplier_id AND s.company_id = ps.company_id WHERE ps.company_id = p.company_id AND ps.product_id = p.id AND ps.is_primary = 1 AND ps.status = 'ACTIVO' LIMIT 1) AS primary_supplier_id,
        (SELECT s.name FROM inventory_product_suppliers ps JOIN inventory_suppliers s ON s.id = ps.supplier_id AND s.company_id = ps.company_id WHERE ps.company_id = p.company_id AND ps.product_id = p.id AND ps.is_primary = 1 AND ps.status = 'ACTIVO' LIMIT 1) AS primary_supplier_name,
        (SELECT s.id FROM inventory_product_suppliers ps JOIN inventory_suppliers s ON s.id = ps.supplier_id AND s.company_id = ps.company_id WHERE ps.company_id = p.company_id AND ps.product_id = p.id ORDER BY ps.last_purchase_date DESC NULLS LAST LIMIT 1) AS last_supplier_id,
        (SELECT s.name FROM inventory_product_suppliers ps JOIN inventory_suppliers s ON s.id = ps.supplier_id AND s.company_id = ps.company_id WHERE ps.company_id = p.company_id AND ps.product_id = p.id ORDER BY ps.last_purchase_date DESC NULLS LAST LIMIT 1) AS last_supplier_name,
        TRIM(COALESCE(l.name, '') || CASE WHEN c.name IS NOT NULL THEN ' > ' || c.name ELSE '' END || CASE WHEN sc.name IS NOT NULL THEN ' > ' || sc.name ELSE '' END || CASE WHEN sg.name IS NOT NULL THEN ' > ' || sg.name ELSE '' END) AS classification_path
      FROM inventory_products p
      LEFT JOIN inventory_product_codes pc ON pc.product_id = p.id AND pc.company_id = p.company_id
      LEFT JOIN inventory_product_lines l ON l.id = p.line_id AND l.company_id = p.company_id
      LEFT JOIN inventory_product_categories c ON c.id = p.category_id AND c.company_id = p.company_id
      LEFT JOIN inventory_product_subcategories sc ON sc.id = p.subcategory_id AND sc.company_id = p.company_id
      LEFT JOIN inventory_product_subgroups sg ON sg.id = p.subgroup_id AND sg.company_id = p.company_id
      WHERE ${conditions.join(' AND ')} GROUP BY p.id ORDER BY p.name
    `).all(...values) as any[];
    if (context.permissions.includes('inventory.suppliers.costs')) return rows;
    return rows.map(row => ({ ...row, last_cost: undefined, average_cost: undefined }));
  }

  listSuppliers(context: InventoryContext) {
    this.assertPermission(context, 'inventory.suppliers.view');
    return this.statement('SELECT * FROM inventory_suppliers WHERE company_id = ? ORDER BY active DESC, name').all(context.companyId);
  }

  upsertSupplier(context: InventoryContext, input: InventorySupplierInput) {
    this.assertPermission(context, 'inventory.suppliers.manage');
    const name = input.name.trim();
    if (!name) throw new Error('El proveedor requiere nombre.');
    const id = input.id || `INV-SUP-${crypto.randomUUID()}`;
    const timestamp = now();
    return this.transaction(() => {
      this.statement(`INSERT INTO inventory_suppliers (id, company_id, code, name, tax_id, active, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, name=excluded.name, tax_id=excluded.tax_id, active=excluded.active, updated_at=excluded.updated_at`).run(id, context.companyId, input.code ? normalize(input.code) : null, name, input.taxId || null, input.active === false ? 0 : 1, context.userId, timestamp, timestamp);
      this.audit(context, input.id ? 'ACTUALIZAR_PROVEEDOR' : 'CREAR_PROVEEDOR', 'SUPPLIER', id, { name });
      return this.statement('SELECT * FROM inventory_suppliers WHERE id = ? AND company_id = ?').get(id, context.companyId);
    });
  }

  listProductSuppliers(context: InventoryContext, productId: string) {
    this.assertPermission(context, 'inventory.suppliers.view');
    const product = this.statement('SELECT id FROM inventory_products WHERE id = ? AND company_id = ?').get(productId, context.companyId);
    if (!product) throw new Error('Producto inexistente dentro de la empresa activa.');
    const rows = this.statement(`SELECT ps.*, s.code AS supplier_code, s.name AS supplier_name, s.tax_id, s.active AS supplier_active FROM inventory_product_suppliers ps JOIN inventory_suppliers s ON s.id = ps.supplier_id AND s.company_id = ps.company_id WHERE ps.company_id = ? AND ps.product_id = ? ORDER BY ps.is_primary DESC, ps.priority DESC, s.name`).all(context.companyId, productId) as any[];
    if (context.permissions.includes('inventory.suppliers.costs')) return rows;
    return rows.map(row => ({ ...row, last_cost: undefined, average_cost: undefined, payment_terms: undefined, usual_discount: undefined }));
  }

  upsertProductSupplier(context: InventoryContext, productId: string, input: InventorySupplierRelationInput) {
    this.assertPermission(context, input.isPrimary ? 'inventory.suppliers.primary' : 'inventory.suppliers.manage');
    const product = this.statement('SELECT id FROM inventory_products WHERE id = ? AND company_id = ?').get(productId, context.companyId);
    const supplier: any = this.statement('SELECT id FROM inventory_suppliers WHERE id = ? AND company_id = ? AND active = 1').get(input.supplierId, context.companyId);
    if (!product || !supplier) throw new Error('Producto o proveedor inexistente, inactivo o fuera de la empresa.');
    if (input.isPrimary && input.status === 'INACTIVO') throw new Error('Un proveedor inactivo no puede ser principal.');
    const timestamp = now();
    return this.transaction(() => {
      if (input.isPrimary) this.statement("UPDATE inventory_product_suppliers SET is_primary = 0, updated_at = ? WHERE company_id = ? AND product_id = ? AND status = 'ACTIVO'").run(timestamp, context.companyId, productId);
      this.statement(`INSERT INTO inventory_product_suppliers (company_id, product_id, supplier_id, is_primary, supplier_product_code, purchase_unit_id, conversion_factor, last_cost, average_cost, minimum_order_quantity, lead_time_days, payment_terms, usual_discount, priority, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(company_id, product_id, supplier_id) DO UPDATE SET is_primary=excluded.is_primary, supplier_product_code=excluded.supplier_product_code, purchase_unit_id=excluded.purchase_unit_id, conversion_factor=excluded.conversion_factor, minimum_order_quantity=excluded.minimum_order_quantity, lead_time_days=excluded.lead_time_days, payment_terms=excluded.payment_terms, usual_discount=excluded.usual_discount, priority=excluded.priority, status=excluded.status, notes=excluded.notes, updated_at=excluded.updated_at`).run(context.companyId, productId, input.supplierId, input.isPrimary ? 1 : 0, input.supplierProductCode || null, input.purchaseUnitId || null, Number(input.conversionFactor || 1), Number(input.lastCost || 0), Number(input.lastCost || 0), Number(input.minimumOrderQuantity || 0), Number(input.leadTimeDays || 0), input.paymentTerms || null, Number(input.usualDiscount || 0), Number(input.priority || 0), input.status || 'ACTIVO', input.notes || null, timestamp, timestamp);
      this.audit(context, input.isPrimary ? 'CAMBIAR_PROVEEDOR_PRINCIPAL' : 'ASOCIAR_PROVEEDOR', 'PRODUCT_SUPPLIER', `${productId}:${input.supplierId}`, input);
      return context.permissions.includes('inventory.suppliers.view') ? this.listProductSuppliers(context, productId) : [];
    });
  }

  listProducts(companyId: string, query = '') {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) {
      return this.statement(`SELECT p.*, GROUP_CONCAT(c.code) AS codes FROM inventory_products p LEFT JOIN inventory_product_codes c ON c.product_id = p.id WHERE p.company_id = ? GROUP BY p.id ORDER BY p.name`).all(companyId);
    }
    return this.statement(`
      SELECT DISTINCT p.*, GROUP_CONCAT(c.code) AS codes
      FROM inventory_products p
      LEFT JOIN inventory_product_codes c ON c.product_id = p.id
      WHERE p.company_id = ? AND (p.name LIKE ? OR p.code LIKE ? OR c.code LIKE ?)
      GROUP BY p.id ORDER BY p.name
    `).all(companyId, `%${normalizedQuery}%`, `%${normalizedQuery}%`, `%${normalizedQuery}%`);
  }

  listWarehouses(companyId: string) {
    return this.statement('SELECT * FROM inventory_warehouses WHERE company_id = ? ORDER BY name').all(companyId);
  }

  createWarehouse(context: InventoryContext, input: { id: string; code: string; name: string }) {
    this.assertPermission(context, 'inventory.warehouses.manage');
    const warehouseId = input.id.trim();
    if (!warehouseId || !input.code.trim() || !input.name.trim()) throw new Error('La bodega requiere identificador, código y nombre.');
    return this.transaction(() => {
      this.ensureWarehouse(context.companyId, warehouseId, input.code, input.name);
      const membership: any = this.statement('SELECT assigned_warehouses_json FROM inventory_auth_memberships WHERE user_id = ? AND company_id = ?').get(context.userId, context.companyId);
      const assigned = new Set<string>(JSON.parse(membership?.assigned_warehouses_json || '[]'));
      assigned.add(warehouseId);
      this.statement('UPDATE inventory_auth_memberships SET assigned_warehouses_json = ? WHERE user_id = ? AND company_id = ?').run(JSON.stringify(Array.from(assigned)), context.userId, context.companyId);
      this.audit(context, 'CREAR_BODEGA', 'WAREHOUSE', warehouseId, { code: input.code, name: input.name });
      return this.statement('SELECT * FROM inventory_warehouses WHERE id = ? AND company_id = ?').get(warehouseId, context.companyId);
    });
  }

  createDraft(context: InventoryContext, input: InventoryDocumentInput) {
    this.assertWarehouse(context, input.warehouseId);
    if (input.destinationWarehouseId) this.assertWarehouse(context, input.destinationWarehouseId);
    if (!input.idempotencyKey.trim()) throw new Error('La clave de idempotencia es obligatoria.');
    if (!input.lines.length) throw new Error('El documento debe tener al menos una línea.');
    if (input.type === 'TRANSFERENCIA' && !input.destinationWarehouseId) throw new Error('La transferencia requiere bodega destino.');
    for (const line of input.lines) {
      if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error('Las cantidades deben ser mayores a cero.');
    }

    return this.transaction(() => this.createDraftInternal(context, input));
  }

  private createDraftInternal(context: InventoryContext, input: InventoryDocumentInput) {
      const existing = this.statement('SELECT * FROM inventory_documents WHERE company_id = ? AND idempotency_key = ?').get(context.companyId, input.idempotencyKey);
      if (existing) return existing;
      if (input.supplierId) {
        const supplier: any = this.statement('SELECT id FROM inventory_suppliers WHERE id = ? AND company_id = ? AND active = 1').get(input.supplierId, context.companyId);
        if (!supplier) throw new Error('El proveedor no existe, está inactivo o pertenece a otra empresa.');
      }

      const documentId = `INV-DOC-${crypto.randomUUID()}`;
      const timestamp = now();
      this.statement(`
        INSERT INTO inventory_documents
          (id, company_id, warehouse_id, destination_warehouse_id, type, status, idempotency_key, document_number, source_document_id, supplier_id, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'BORRADOR', ?, ?, ?, ?, ?, ?, ?)
      `).run(documentId, context.companyId, input.warehouseId, input.destinationWarehouseId || null, input.type, input.idempotencyKey, input.documentNumber || null, input.sourceDocumentId || null, input.supplierId || null, input.note || '', context.userId, timestamp);

      for (const line of input.lines) {
        const product = this.statement('SELECT id FROM inventory_products WHERE id = ? AND company_id = ? AND active = 1').get(line.productId, context.companyId);
        if (!product) throw new Error('Producto inexistente, inactivo o fuera de la empresa activa.');
        this.statement(`
          INSERT INTO inventory_document_lines (id, document_id, product_id, quantity, unit_cost, direction, counted_quantity, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`INV-LINE-${crypto.randomUUID()}`, documentId, line.productId, line.quantity, Number(line.unitCost || 0), line.direction === -1 ? -1 : 1, line.countedQuantity ?? null, line.note || '');
      }
      this.audit(context, 'CREAR_BORRADOR', 'INVENTORY_DOCUMENT', documentId, { type: input.type });
      return this.statement('SELECT * FROM inventory_documents WHERE id = ?').get(documentId);
  }

  postDocument(context: InventoryContext, documentId: string) {
    return this.transaction(() => this.postDocumentInternal(context, documentId));
  }

  private updateSupplierHistory(context: InventoryContext, document: any, line: any, quantity: number, unitCost: number, timestamp: string) {
    if (document.type !== 'ENTRADA' || !document.supplier_id) return;
    const existing: any = this.statement('SELECT * FROM inventory_product_suppliers WHERE company_id = ? AND product_id = ? AND supplier_id = ?').get(context.companyId, line.product_id, document.supplier_id);
    if (!existing) {
      this.statement(`INSERT INTO inventory_product_suppliers (company_id, product_id, supplier_id, is_primary, last_cost, average_cost, purchased_quantity, last_purchase_date, status, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'ACTIVO', ?, ?)`)
        .run(context.companyId, line.product_id, document.supplier_id, unitCost, unitCost, quantity, timestamp, timestamp, timestamp);
    } else {
      const priorQuantity = Number(existing.purchased_quantity || 0);
      const priorAverage = Number(existing.average_cost || 0);
      const nextQuantity = priorQuantity + quantity;
      const nextAverage = nextQuantity > 0 ? ((priorQuantity * priorAverage) + (quantity * unitCost)) / nextQuantity : unitCost;
      this.statement(`UPDATE inventory_product_suppliers SET last_cost = ?, average_cost = ?, purchased_quantity = ?, last_purchase_date = ?, updated_at = ? WHERE company_id = ? AND product_id = ? AND supplier_id = ?`)
        .run(unitCost, nextAverage, nextQuantity, timestamp, timestamp, context.companyId, line.product_id, document.supplier_id);
    }
    this.audit(context, 'ACTUALIZAR_HISTORIAL_PROVEEDOR', 'PRODUCT_SUPPLIER', `${line.product_id}:${document.supplier_id}`, { quantity, unitCost });
  }

  private postDocumentInternal(context: InventoryContext, documentId: string) {
      const document: any = this.statement('SELECT * FROM inventory_documents WHERE id = ? AND company_id = ?').get(documentId, context.companyId);
      if (!document) throw new Error('Documento no encontrado dentro de la empresa activa.');
      this.assertWarehouse(context, document.warehouse_id);
      if (document.status === 'CONTABILIZADO') return document;
      if (document.status !== 'BORRADOR') throw new Error('Solo se pueden contabilizar documentos en borrador.');

      const lines: any[] = this.statement('SELECT * FROM inventory_document_lines WHERE document_id = ?').all(documentId) as any[];
      if (!lines.length) throw new Error('El documento no tiene detalles.');
      const timestamp = now();

      for (const line of lines) {
        const sourceWarehouse = document.warehouse_id;
        const destinationWarehouse = document.destination_warehouse_id;
        const quantity = document.type === 'CONTEO' ? Number(line.counted_quantity) : Number(line.quantity);
        if (!Number.isFinite(quantity) || quantity < 0) throw new Error('El conteo debe tener cantidades válidas.');
        const warehouses = document.type === 'TRANSFERENCIA' ? [sourceWarehouse, destinationWarehouse] : [sourceWarehouse];
        const sourceBalance: any = document.type === 'TRANSFERENCIA'
          ? this.statement('SELECT average_cost FROM inventory_balances WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(context.companyId, sourceWarehouse, line.product_id)
          : null;
        const transferCost = Number(sourceBalance?.average_cost || line.unit_cost || 0);
        for (const warehouseId of warehouses) {
          if (!warehouseId) throw new Error('La transferencia requiere una bodega destino válida.');
          const balance: any = this.statement('SELECT * FROM inventory_balances WHERE company_id = ? AND warehouse_id = ? AND product_id = ?').get(context.companyId, warehouseId, line.product_id);
          const currentStock = Number(balance?.stock || 0);
          const currentCost = Number(balance?.average_cost || 0);
          let delta = 0;
          if (document.type === 'TRANSFERENCIA') delta = warehouseId === sourceWarehouse ? -quantity : quantity;
          else if (document.type === 'CONTEO') delta = quantity - currentStock;
          else if (document.type === 'REVERSA') {
            const originalMovement: any = this.statement(`
              SELECT COALESCE(SUM(quantity_delta), 0) AS quantity_delta
              FROM inventory_ledger
              WHERE document_id = ? AND warehouse_id = ? AND product_id = ?
            `).get(document.source_document_id, warehouseId, line.product_id);
            delta = -Number(originalMovement?.quantity_delta || 0);
          } else if (document.type === 'AJUSTE') delta = (line.direction === -1 ? -1 : 1) * quantity;
          else delta = document.type === 'ENTRADA' ? quantity : -quantity;
          if (currentStock + delta < 0) throw new Error('El movimiento dejaría stock negativo.');

          const unitCost = Number(line.unit_cost || (document.type === 'TRANSFERENCIA' ? transferCost : currentCost) || 0);
          const nextStock = currentStock + delta;
          const nextCost = nextStock > 0 && unitCost > 0
            ? ((currentStock * currentCost) + (delta * unitCost)) / nextStock
            : 0;
          this.statement(`
            INSERT INTO inventory_balances (company_id, warehouse_id, product_id, stock, average_cost, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(company_id, warehouse_id, product_id) DO UPDATE SET stock = excluded.stock, average_cost = excluded.average_cost, updated_at = excluded.updated_at
          `).run(context.companyId, warehouseId, line.product_id, nextStock, nextCost, timestamp);
          this.statement(`
            INSERT INTO inventory_ledger
              (id, company_id, warehouse_id, product_id, document_id, document_line_id, movement_type, quantity_delta, unit_cost, running_stock, running_average_cost, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(`INV-MOV-${crypto.randomUUID()}`, context.companyId, warehouseId, line.product_id, documentId, line.id, document.type, delta, unitCost, nextStock, nextCost, timestamp);
        }
        this.updateSupplierHistory(context, document, line, quantity, Number(line.unit_cost || 0), timestamp);
      }

      this.statement(`UPDATE inventory_documents SET status = 'CONTABILIZADO', posted_by = ?, posted_at = ? WHERE id = ?`).run(context.userId, timestamp, documentId);
      this.audit(context, 'CONTABILIZAR', 'INVENTORY_DOCUMENT', documentId, { type: document.type });
      return this.statement('SELECT * FROM inventory_documents WHERE id = ?').get(documentId);
  }

  reverseDocument(context: InventoryContext, documentId: string, idempotencyKey: string) {
    return this.transaction(() => {
      const original: any = this.statement('SELECT * FROM inventory_documents WHERE id = ? AND company_id = ?').get(documentId, context.companyId);
      if (!original || original.status !== 'CONTABILIZADO') throw new Error('Solo se pueden reversar documentos contabilizados.');
      const existing = this.statement('SELECT * FROM inventory_documents WHERE company_id = ? AND idempotency_key = ?').get(context.companyId, idempotencyKey);
      if (existing) return existing;

      const lines: any[] = this.statement('SELECT * FROM inventory_document_lines WHERE document_id = ?').all(documentId) as any[];
      const reversal = this.createDraftInternal(context, {
        idempotencyKey,
        type: 'REVERSA',
        warehouseId: original.warehouse_id,
        destinationWarehouseId: original.destination_warehouse_id,
        sourceDocumentId: original.id,
        note: `Reversa de ${original.id}`,
        lines: lines.map(line => ({ productId: line.product_id, quantity: line.quantity, unitCost: line.unit_cost }))
      }) as any;
      this.statement('UPDATE inventory_documents SET reversal_of_id = ? WHERE id = ?').run(original.id, reversal.id);
      this.postDocumentInternal(context, reversal.id);
      this.statement('UPDATE inventory_documents SET status = \'REVERSADO\' WHERE id = ?').run(original.id);
      this.audit(context, 'REVERSAR', 'INVENTORY_DOCUMENT', original.id, { reversalId: reversal.id });
      return this.statement('SELECT * FROM inventory_documents WHERE id = ?').get(reversal.id);
    });
  }

  listDocuments(context: InventoryContext, filters: { status?: string; type?: string; productId?: string } = {}) {
    this.assertWarehouse(context, context.warehouseId);
    return this.statement(`
      SELECT d.*, COUNT(l.id) AS line_count
      FROM inventory_documents d
      LEFT JOIN inventory_document_lines l ON l.document_id = d.id
      WHERE d.company_id = ? AND d.warehouse_id = ?
        AND (? IS NULL OR d.status = ?)
        AND (? IS NULL OR d.type = ?)
        AND (? IS NULL OR EXISTS (SELECT 1 FROM inventory_document_lines lx WHERE lx.document_id = d.id AND lx.product_id = ?))
      GROUP BY d.id ORDER BY d.created_at DESC
    `).all(context.companyId, context.warehouseId, filters.status || null, filters.status || null, filters.type || null, filters.type || null, filters.productId || null, filters.productId || null);
  }

  getDocument(context: InventoryContext, documentId: string) {
    const document: any = this.statement(`
      SELECT d.*, source.document_number AS source_document_number, source.type AS source_document_type
      FROM inventory_documents d
      LEFT JOIN inventory_documents source ON source.id = d.source_document_id AND source.company_id = d.company_id
      WHERE d.id = ? AND d.company_id = ?
    `).get(documentId, context.companyId);
    if (!document) throw new Error('Documento no encontrado dentro de la empresa activa.');
    this.assertWarehouse(context, document.warehouse_id);
    if (document.destination_warehouse_id) this.assertWarehouse(context, document.destination_warehouse_id);
    const lines = this.statement(`
      SELECT l.*, p.code, p.name, p.base_unit
      FROM inventory_document_lines l
      JOIN inventory_products p ON p.id = l.product_id AND p.company_id = ?
      WHERE l.document_id = ? ORDER BY l.id
    `).all(context.companyId, documentId);
    const ledger = this.statement(`
      SELECT * FROM inventory_ledger
      WHERE company_id = ? AND document_id = ? ORDER BY created_at ASC, id ASC
    `).all(context.companyId, documentId);
    return { ...document, lines, ledger };
  }

  getKardex(context: InventoryContext, productId: string) {
    this.assertWarehouse(context, context.warehouseId);
    return this.statement(`
      SELECT l.*, d.type AS document_type, d.status AS document_status, d.document_number
      FROM inventory_ledger l JOIN inventory_documents d ON d.id = l.document_id
      WHERE l.company_id = ? AND l.warehouse_id = ? AND l.product_id = ?
      ORDER BY l.created_at ASC, l.id ASC
    `).all(context.companyId, context.warehouseId, productId);
  }

  getBalances(context: InventoryContext) {
    this.assertWarehouse(context, context.warehouseId);
    return this.statement(`
      SELECT b.*, p.code, p.name, p.base_unit
      FROM inventory_balances b JOIN inventory_products p ON p.id = b.product_id
      WHERE b.company_id = ? AND b.warehouse_id = ? ORDER BY p.name
    `).all(context.companyId, context.warehouseId);
  }

  listReplenishment(context: InventoryContext) {
    this.assertWarehouse(context, context.warehouseId);
    return this.statement(`
      SELECT p.id AS product_id, p.code, p.name, b.stock, b.average_cost,
        COALESCE(r.minimum_stock, 0) AS minimum_stock,
        COALESCE(r.maximum_stock, 0) AS maximum_stock,
        COALESCE(r.reorder_quantity, 0) AS reorder_quantity
      FROM inventory_products p
      LEFT JOIN inventory_balances b ON b.product_id = p.id AND b.company_id = p.company_id AND b.warehouse_id = ?
      LEFT JOIN inventory_replenishment_rules r ON r.product_id = p.id AND r.company_id = p.company_id AND r.warehouse_id = ?
      WHERE p.company_id = ? AND p.active = 1
      ORDER BY p.name
    `).all(context.warehouseId, context.warehouseId, context.companyId);
  }

  saveReplenishmentRule(context: InventoryContext, input: { productId: string; minimumStock: number; maximumStock: number; reorderQuantity: number }) {
    this.assertPermission(context, 'inventory.replenishment.edit');
    if (![input.minimumStock, input.maximumStock, input.reorderQuantity].every(value => Number.isFinite(value) && value >= 0)) {
      throw new Error('Los parámetros de reposición deben ser números no negativos.');
    }
    if (input.maximumStock > 0 && input.maximumStock < input.minimumStock) throw new Error('El máximo no puede ser menor que el mínimo.');
    const product = this.statement('SELECT id FROM inventory_products WHERE id = ? AND company_id = ?').get(input.productId, context.companyId);
    if (!product) throw new Error('Producto inexistente dentro de la empresa activa.');
    this.statement(`
      INSERT INTO inventory_replenishment_rules (company_id, warehouse_id, product_id, minimum_stock, maximum_stock, reorder_quantity)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, warehouse_id, product_id) DO UPDATE SET minimum_stock = excluded.minimum_stock, maximum_stock = excluded.maximum_stock, reorder_quantity = excluded.reorder_quantity
    `).run(context.companyId, context.warehouseId, input.productId, input.minimumStock, input.maximumStock, input.reorderQuantity);
    this.audit(context, 'ACTUALIZAR_REPOSICION', 'REPLENISHMENT_RULE', input.productId, input);
    return this.listReplenishment(context).find((item: any) => item.product_id === input.productId);
  }

  reconcile(context: InventoryContext, productId?: string) {
    this.assertWarehouse(context, context.warehouseId);
    const balances: any[] = this.statement(`
      SELECT b.product_id, b.stock AS balance_stock,
        COALESCE((SELECT SUM(l.quantity_delta) FROM inventory_ledger l WHERE l.company_id = b.company_id AND l.warehouse_id = b.warehouse_id AND l.product_id = b.product_id), 0) AS ledger_stock
      FROM inventory_balances b
      WHERE b.company_id = ? AND b.warehouse_id = ? AND (? IS NULL OR b.product_id = ?)
    `).all(context.companyId, context.warehouseId, productId || null, productId || null) as any[];
    return balances.map(item => ({ ...item, difference: Number(item.balance_stock) - Number(item.ledger_stock), matches: Number(item.balance_stock) === Number(item.ledger_stock) }));
  }

  listAudit(context: InventoryContext) {
    this.assertWarehouse(context, context.warehouseId);
    return this.statement('SELECT * FROM inventory_audit_log WHERE company_id = ? ORDER BY created_at DESC').all(context.companyId);
  }
}

export { normalize as normalizeInventoryValue };
