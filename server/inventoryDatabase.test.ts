import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { InventoryDatabase } from './inventoryDatabase';

const passwordCredentials = async (password: string) => {
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const key = await webcrypto.subtle.importKey('raw', Buffer.from(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await webcrypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return { passwordHash: Buffer.from(bits).toString('base64'), passwordSalt: Buffer.from(salt).toString('base64') };
};

test('inventario: contabilización atómica, costo promedio, transferencia, reversa, permisos y conciliación', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'tendi-inventory-'));
  const database = await InventoryDatabase.open(dataDirectory);
  try {
    const credentials = await passwordCredentials('test-password');
    const session = await database.provisionInitialAdmin({
      id: 'user-test', username: 'TEST', fullName: 'Usuario de prueba', role: 'ADMINISTRADOR',
      ...credentials, company: { id: 'company-test', name: 'Empresa de prueba' },
      warehouse: { id: 'warehouse-test', code: '001', name: 'Bodega principal' }
    });
    let context = database.resolveSession(session.token, 'company-test', 'warehouse-test');
    const destination = database.createWarehouse(context, { id: 'warehouse-test-2', code: '002', name: 'Bodega secundaria' });
    assert.equal(destination.id, 'warehouse-test-2');
    context = database.resolveSession(session.token, 'company-test', 'warehouse-test');

    const product = database.upsertProduct('company-test', { id: 'product-test', code: 'P-TEST', barcode: 'BAR-TEST', name: 'Producto de prueba' });
    assert.equal(product.id, 'product-test');
    assert.throws(() => database.upsertProduct('company-test', { id: 'product-test-2', code: 'P-TEST', name: 'Código duplicado' }), /UNIQUE|constraint/i);

    const line = database.upsertClassification(context, 'LINEA', { code: 'BEB', name: 'Bebidas', inventoryAccount: 'INV-01', salesAccount: 'VEN-01', costAccount: 'COS-01' }) as any;
    const category = database.upsertClassification(context, 'CATEGORIA', { code: 'GAS', name: 'Gaseosas', lineId: String(line.id) }) as any;
    const subcategory = database.upsertClassification(context, 'SUBCATEGORIA', { code: 'COL', name: 'Colas', categoryId: String(category.id), lineId: String(line.id) }) as any;
    const subgroup = database.upsertClassification(context, 'SUBGRUPO', { code: 'RET', name: 'Retornables', categoryId: String(category.id), subcategoryId: String(subcategory.id), lineId: String(line.id) }) as any;
    assert.equal((database.listClassifications(context).subgroups as any[]).length, 1);
    assert.throws(() => database.upsertClassification(context, 'SUBGRUPO', { code: 'INV', name: 'Inválido', subcategoryId: 'missing', categoryId: String(category.id) }), /subcategoría/i);
    database.upsertProduct('company-test', { id: 'product-test', code: 'P-TEST', barcode: 'BAR-TEST', name: 'Producto de prueba', lineId: String(line.id), categoryId: String(category.id), subcategoryId: String(subcategory.id), subgroupId: String(subgroup.id), brand: 'Marca QA', flavor: 'Cola', contentValue: 500, contentUnit: 'ML', presentation: 'Botella', containerType: 'PET', returnable: true, internalUnit: 'UNIDAD', purchaseUnit: 'CAJA', saleUnit: 'UNIDAD', purchaseConversionFactor: 12, saleConversionFactor: 1 });
    const supplierA = database.upsertSupplier(context, { code: 'SUP-A', name: 'Proveedor A', taxId: '111' }) as any;
    const supplierB = database.upsertSupplier(context, { code: 'SUP-B', name: 'Proveedor B', taxId: '222' }) as any;
    database.upsertProductSupplier(context, 'product-test', { supplierId: String(supplierA.id), isPrimary: true, lastCost: 2 });
    database.upsertProductSupplier(context, 'product-test', { supplierId: String(supplierB.id), isPrimary: true, lastCost: 4 });
    const relatedSuppliers = database.listProductSuppliers(context, 'product-test') as any[];
    assert.equal(relatedSuppliers.filter(item => item.is_primary && item.status === 'ACTIVO').length, 1);
    database.upsertProductSupplier(context, 'product-test', { supplierId: String(supplierB.id), isPrimary: true, lastCost: 4 });
    assert.equal((database.listProductSuppliers(context, 'product-test') as any[]).length, 2);
    database.deactivateClassification(context, 'CATEGORIA', String(category.id));
    assert.ok((database.listClassifications(context).categories as any[]).find(item => item.id === String(category.id) && item.active === 0));
    assert.throws(() => database.upsertProduct('company-test', { id: 'product-test-3', code: 'P-TEST-3', name: 'No asignable', lineId: String(line.id), categoryId: String(category.id) }), /categoría/i);

    const create = (key: string, type: 'ENTRADA' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE' | 'CONTEO', quantity: number, warehouseId = 'warehouse-test', destinationWarehouseId?: string, direction?: 1 | -1, countedQuantity?: number): any => database.createDraft(context, {
      idempotencyKey: key, type, warehouseId, destinationWarehouseId,
      lines: [{ productId: 'product-test', quantity, unitCost: type === 'ENTRADA' ? (key.endsWith('1') ? 2 : 4) : 0, direction, countedQuantity }]
    });

    const first = create('entry-1', 'ENTRADA', 10);
    database.postDocument(context, first.id);
    const second = create('entry-2', 'ENTRADA', 10);
    database.postDocument(context, second.id);
    const weighted = database.getBalances(context).find((item: any) => item.product_id === 'product-test') as any;
    assert.equal(weighted.stock, 20);
    assert.equal(weighted.average_cost, 3);

    const transfer = create('transfer-1', 'TRANSFERENCIA', 4, 'warehouse-test', 'warehouse-test-2');
    database.postDocument(context, transfer.id);
    const counted = create('count-1', 'CONTEO', 1, 'warehouse-test-2', undefined, undefined, 6);
    database.postDocument({ ...context, warehouseId: 'warehouse-test-2' }, counted.id);
    const adjustment = create('adjustment-1', 'AJUSTE', 1, 'warehouse-test', undefined, -1);
    database.postDocument(context, adjustment.id);

    const reversal = database.reverseDocument(context, first.id, 'reverse-entry-1');
    assert.equal(reversal.status, 'CONTABILIZADO');
    assert.equal((database.getDocument(context, first.id) as any).status, 'REVERSADO');

    const sourceBalance = database.getBalances(context).find((item: any) => item.product_id === 'product-test') as any;
    const destinationBalance = database.getBalances({ ...context, warehouseId: 'warehouse-test-2' }).find((item: any) => item.product_id === 'product-test') as any;
    assert.equal(sourceBalance.stock, 5);
    assert.equal(sourceBalance.average_cost, 5);
    assert.equal(destinationBalance.stock, 6);

    const duplicateDrafts: any[] = await Promise.all(Array.from({ length: 5 }, () => database.createDraft(context, {
      idempotencyKey: 'concurrent-entry', type: 'ENTRADA', warehouseId: 'warehouse-test',
      lines: [{ productId: 'product-test', quantity: 1, unitCost: 5 }]
    })));
    assert.equal(new Set(duplicateDrafts.map((item: any) => item.id)).size, 1);
    database.postDocument(context, duplicateDrafts[0].id);
    database.postDocument(context, duplicateDrafts[0].id);

    const negative = create('negative-1', 'EGRESO', 999);
    assert.throws(() => database.postDocument(context, negative.id), /stock negativo/i);
    const afterNegative = database.getBalances(context).find((item: any) => item.product_id === 'product-test') as any;
    assert.equal(afterNegative.stock, 6);

    const detail = database.getDocument(context, transfer.id) as any;
    assert.equal(detail.lines.length, 1);
    assert.equal(detail.ledger.length, 2);
    assert.ok(database.reconcile(context).every((item: any) => item.matches));
    assert.ok(database.listAudit(context).some((item: any) => item.action === 'REVERSAR'));
    assert.ok(database.saveReplenishmentRule(context, { productId: 'product-test', minimumStock: 2, maximumStock: 10, reorderQuantity: 4 }));
    const purchase: any = database.createDraft(context, { idempotencyKey: 'purchase-supplier-1', type: 'ENTRADA', warehouseId: 'warehouse-test', supplierId: String(supplierB.id), lines: [{ productId: 'product-test', quantity: 2, unitCost: 6 }] });
    database.postDocument(context, String(purchase.id));
    assert.equal(Number((database.listProductSuppliers(context, 'product-test') as any[]).find(item => item.supplier_id === String(supplierB.id))?.last_cost), 6);
    assert.throws(() => database.resolveSession('invalid-session', 'company-test', 'warehouse-test'), /sesión/i);
    assert.throws(() => database.resolveSession(session.token, 'other-company', 'warehouse-test'), /empresa/i);
  } finally {
    database.close();
  }
});
