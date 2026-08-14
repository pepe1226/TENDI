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
    assert.throws(() => database.resolveSession('invalid-session', 'company-test', 'warehouse-test'), /sesión/i);
    assert.throws(() => database.resolveSession(session.token, 'other-company', 'warehouse-test'), /empresa/i);
  } finally {
    database.close();
  }
});
