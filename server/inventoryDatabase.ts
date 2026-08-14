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
  | 'inventory.audit.view';

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
  'inventory.replenishment.edit', 'inventory.audit.view'
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

    const adminMemberships = this.statement(`
      SELECT m.user_id, m.company_id, m.permissions_json
      FROM inventory_auth_memberships m
      JOIN inventory_auth_users u ON u.id = m.user_id
      WHERE UPPER(u.role) IN ('ADMIN', 'ADMINISTRADOR', 'SUPER USUARIO')
    `).all() as any[];
    for (const membership of adminMemberships) {
      const permissions = JSON.parse(membership.permissions_json || '[]') as string[];
      if (!permissions.includes('inventory.replenishment.edit')) {
        permissions.push('inventory.replenishment.edit');
        this.statement('UPDATE inventory_auth_memberships SET permissions_json = ? WHERE user_id = ? AND company_id = ?').run(JSON.stringify(permissions), membership.user_id, membership.company_id);
      }
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

  upsertProduct(companyId: string, input: InventoryProductInput) {
    const id = input.id || `INV-PROD-${crypto.randomUUID()}`;
    const timestamp = now();
    const code = normalize(input.code);
    const codes = Array.from(new Set([input.barcode, ...(input.alternateCodes || [])].map(normalize).filter(Boolean)));

    return this.transaction(() => {
      this.statement(`
        INSERT INTO inventory_products
          (id, company_id, code, name, category_id, base_unit, sale_price, average_cost, active, tracks_lots, tracks_serials, tracks_expiry, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          code = excluded.code, name = excluded.name, category_id = excluded.category_id,
          base_unit = excluded.base_unit, sale_price = excluded.sale_price, average_cost = excluded.average_cost,
          active = excluded.active, tracks_lots = excluded.tracks_lots, tracks_serials = excluded.tracks_serials,
          tracks_expiry = excluded.tracks_expiry, updated_at = excluded.updated_at
      `).run(
        id, companyId, code, input.name.trim(), input.categoryId || null, input.baseUnit || 'UNIDAD',
        Number(input.price || 0), Number(input.averageCost || 0), input.active === false ? 0 : 1,
        input.tracksLots ? 1 : 0, input.tracksSerials ? 1 : 0, input.tracksExpiry ? 1 : 0,
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

      const documentId = `INV-DOC-${crypto.randomUUID()}`;
      const timestamp = now();
      this.statement(`
        INSERT INTO inventory_documents
          (id, company_id, warehouse_id, destination_warehouse_id, type, status, idempotency_key, document_number, source_document_id, note, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, 'BORRADOR', ?, ?, ?, ?, ?, ?)
      `).run(documentId, context.companyId, input.warehouseId, input.destinationWarehouseId || null, input.type, input.idempotencyKey, input.documentNumber || null, input.sourceDocumentId || null, input.note || '', context.userId, timestamp);

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
