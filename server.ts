import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { promises as fs } from "fs";
import { InventoryDatabase, type InventoryContext, type InventoryPermission } from "./server/inventoryDatabase";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Almacenamiento temporal hasta conectar los adaptadores de solo lectura de Perseo.
  let products: any[] = [
    {
      id: 'prod_101',
      code: '7861001',
      barcode: '7861001',
      name: 'QUESO MANABA CRIOLLO (LB)',
      price: 3.50,
      costPrice: 2.40,
      stock: 50.0,
      category: 'dairy',
      sellByWeight: true,
      saleUnit: 'LB',
      image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=400&q=80'
    },
    {
      id: 'prod_102',
      code: '7861002',
      barcode: '7861002',
      name: 'CARNE DE RES LOMO FINO (LB)',
      price: 4.50,
      costPrice: 3.20,
      stock: 40.0,
      category: 'food',
      sellByWeight: true,
      saleUnit: 'LB',
      image: 'https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=400&q=80'
    },
    {
      id: 'prod_103',
      code: '7861003',
      barcode: '7861003',
      name: 'POLLO ENTERO FRESCO (LB)',
      price: 1.80,
      costPrice: 1.25,
      stock: 100.0,
      category: 'food',
      sellByWeight: true,
      saleUnit: 'LB',
      image: 'https://images.unsplash.com/photo-1587593810167-a84920ea0781?auto=format&fit=crop&w=400&q=80'
    },
    {
      id: 'prod_104',
      code: '7861004',
      barcode: '7861004',
      name: 'MANZANAS ROJAS IMPORTADAS (KG)',
      price: 2.20,
      costPrice: 1.40,
      stock: 60.0,
      category: 'food',
      sellByWeight: true,
      saleUnit: 'KG',
      image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=400&q=80'
    },
    {
      id: 'prod_105',
      code: '7861005',
      barcode: '7861005',
      name: 'ACEITE VEGETAL 1 LITRO',
      price: 2.50,
      costPrice: 1.80,
      stock: 35,
      category: 'food',
      sellByWeight: false,
      saleUnit: 'UNIDAD',
      image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80'
    }
  ];
  let cajaOperativa = 0;
  let cajaCentral = 0;
  let dineroInicial: number | null = null;
  let movements: any[] = [];
  let credits: any[] = [];
  let customers: any[] = [
    { name: 'CONSUMIDOR FINAL', ruc: '9999999999999', phone: '', email: '', address: '', type: 'NATURAL', idType: 'CEDULA' }
  ];
  let sales: any[] = [];
  let suppliers: any[] = [];
  let purchases: any[] = [];

  type LocalState = {
    products: any[];
    cajaOperativa: number;
    cajaCentral: number;
    dineroInicial: number | null;
    movements: any[];
    credits: any[];
    customers: any[];
    sales: any[];
    suppliers: any[];
    purchases: any[];
  };

  const dataDirectory = path.join(process.cwd(), "data");
  const dataFile = path.join(dataDirectory, "tendi.local.json");

  const getLocalState = (): LocalState => ({
    products,
    cajaOperativa,
    cajaCentral,
    dineroInicial,
    movements,
    credits,
    customers,
    sales,
    suppliers,
    purchases,
  });

  const persistLocalState = async () => {
    await fs.mkdir(dataDirectory, { recursive: true });
    const temporaryFile = `${dataFile}.tmp`;
    await fs.writeFile(temporaryFile, JSON.stringify(getLocalState(), null, 2), "utf8");
    await fs.rename(temporaryFile, dataFile);
  };

  const loadLocalState = async () => {
    await fs.mkdir(dataDirectory, { recursive: true });

    try {
      const stored = JSON.parse(await fs.readFile(dataFile, "utf8")) as Partial<LocalState>;
      if (Array.isArray(stored.products)) products = stored.products;
      if (typeof stored.cajaOperativa === "number") cajaOperativa = stored.cajaOperativa;
      if (typeof stored.cajaCentral === "number") cajaCentral = stored.cajaCentral;
      if (typeof stored.dineroInicial === "number" || stored.dineroInicial === null) {
        dineroInicial = stored.dineroInicial;
      }
      if (Array.isArray(stored.movements)) movements = stored.movements;
      if (Array.isArray(stored.credits)) credits = stored.credits;
      if (Array.isArray(stored.customers)) customers = stored.customers;
      if (Array.isArray(stored.sales)) sales = stored.sales;
      if (Array.isArray(stored.suppliers)) suppliers = stored.suppliers;
      if (Array.isArray(stored.purchases)) purchases = stored.purchases;
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.warn("No se pudo leer la persistencia local. Se usarán datos iniciales.", error);
      }
      await persistLocalState();
    }
  };

  await loadLocalState();
  const inventoryDatabase = await InventoryDatabase.open(dataDirectory);

  const normalizeProductCode = (value: unknown) => String(value ?? '').trim().toUpperCase();
  const getProductCodes = (product: any) => [
    product.code,
    product.barcode,
    product.altCode,
    ...(Array.isArray(product.barcodeAliases) ? product.barcodeAliases : [])
  ].map(normalizeProductCode).filter(Boolean);

  const findProductCodeConflict = (product: any) => {
    const candidateCodes = new Set(getProductCodes(product));
    if (candidateCodes.size === 0) return null;

    return products.find(existing => (
      String(existing.id) !== String(product.id) &&
      getProductCodes(existing).some((code: string) => candidateCodes.has(code))
    )) || null;
  };

  const findProductByReference = (item: any) => {
    const referenceId = item?.id ?? item?.productId;
    const itemCodes = getProductCodes(item);

    return products.find(product => (
      (referenceId !== undefined && String(product.id) === String(referenceId)) ||
      itemCodes.some(code => getProductCodes(product).includes(code))
    ));
  };

  const getPositiveQuantity = (item: any) => Number(item?.quantity ?? 1);

  const validateQuantities = (items: any[]) => {
    return items.find(item => {
      const quantity = getPositiveQuantity(item);
      return !Number.isFinite(quantity) || quantity <= 0;
    });
  };

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", persistence: "local-file", dataFile: "data/tendi.local.json" });
  });

  type IdentityLookupCacheEntry = { expiresAt: number; payload: any };
  const identityLookupCache = new Map<string, IdentityLookupCacheEntry>();
  const IDENTITY_FOUND_TTL_MS = 30 * 60 * 1000;
  const IDENTITY_NOT_FOUND_TTL_MS = 2 * 60 * 1000;

  const cacheIdentityResult = (id: string, payload: any, ttlMs: number) => {
    identityLookupCache.set(id, { expiresAt: Date.now() + ttlMs, payload });
    return payload;
  };

  // --- API ROUTES ---

  const inventoryTokenFromRequest = (req: express.Request) => {
    const authorization = req.header('authorization') || '';
    return authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : req.header('x-tendi-inventory-session') || '';
  };

  const requireInventoryContext = (req: express.Request, permission?: InventoryPermission): InventoryContext => {
    const context = inventoryDatabase.resolveSession(
      inventoryTokenFromRequest(req),
      req.header('x-tendi-company-id') || undefined,
      req.header('x-tendi-warehouse-id') || undefined
    );
    if (permission) inventoryDatabase.assertPermission(context, permission);
    return context;
  };

  const inventoryErrorStatus = (error: any) => {
    const message = String(error?.message || error);
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes('sesión') || normalizedMessage.includes('permiso') || normalizedMessage.includes('acceso')) return 403;
    if (normalizedMessage.includes('idempotencia') || normalizedMessage.includes('repite') || normalizedMessage.includes('unique')) return 409;
    return 400;
  };

  app.post('/api/inventory/auth/bootstrap', async (req, res) => {
    try {
      const { user, company, warehouse } = req.body || {};
      if (!user?.id || !user?.username || !user?.passwordHash || !user?.passwordSalt || !company?.id) {
        return res.status(400).json({ error: 'Datos iniciales de autenticación incompletos.' });
      }
      const session = await inventoryDatabase.provisionInitialAdmin({
        id: String(user.id),
        username: String(user.username),
        fullName: String(user.fullName || user.username),
        role: String(user.role || 'ADMINISTRADOR'),
        passwordHash: String(user.passwordHash),
        passwordSalt: String(user.passwordSalt),
        permissions: Array.isArray(user.inventoryPermissions) ? user.inventoryPermissions : undefined,
        company: { id: String(company.id), name: String(company.name || company.tradeName || company.id) },
        warehouse: warehouse?.id ? { id: String(warehouse.id), code: String(warehouse.code || '001'), name: String(warehouse.name || 'Bodega principal') } : undefined
      });
      res.status(201).json({ success: true, session });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo configurar la autenticación del servidor.' });
    }
  });

  app.post('/api/inventory/auth/login', async (req, res) => {
    try {
      const { username, password, companyId, warehouseId } = req.body || {};
      const session = await inventoryDatabase.authenticate(String(username || ''), String(password || ''), companyId, warehouseId);
      res.json({ success: true, session });
    } catch (error: any) {
      res.status(401).json({ error: error?.message || 'No se pudo iniciar sesión.' });
    }
  });

  app.get('/api/inventory/context', (req, res) => {
    try {
      const context = requireInventoryContext(req);
      res.json({ success: true, context });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'Contexto no autorizado.' });
    }
  });

  app.get('/api/inventory/products', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.view');
      res.json(inventoryDatabase.listProducts(context.companyId, String(req.query.q || '')));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo consultar el catálogo.' });
    }
  });

  app.post('/api/inventory/products', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.edit');
      const result = inventoryDatabase.upsertProduct(context.companyId, req.body);
      res.status(201).json({ success: true, product: result });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo guardar el producto.' });
    }
  });

  app.get('/api/inventory/warehouses', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.warehouses.view');
      res.json(inventoryDatabase.listWarehouses(context.companyId));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudieron consultar las bodegas.' });
    }
  });

  app.post('/api/inventory/warehouses', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.warehouses.manage');
      res.status(201).json({ success: true, warehouse: inventoryDatabase.createWarehouse(context, req.body) });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo guardar la bodega.' });
    }
  });

  app.post('/api/inventory/documents', (req, res) => {
    try {
      const { type } = req.body || {};
      const permission = type === 'ENTRADA' ? 'inventory.receipts.create'
        : type === 'EGRESO' ? 'inventory.issues.create'
          : type === 'TRANSFERENCIA' ? 'inventory.transfers.create'
            : type === 'CONTEO' ? 'inventory.counts.create'
              : 'inventory.adjustments.create';
      const context = requireInventoryContext(req, permission);
      const document = inventoryDatabase.createDraft(context, req.body);
      res.status(201).json({ success: true, document });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo crear el documento.' });
    }
  });

  app.post('/api/inventory/documents/:id/post', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.documents.post');
      res.json({ success: true, document: inventoryDatabase.postDocument(context, req.params.id) });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo contabilizar el documento.' });
    }
  });

  app.post('/api/inventory/documents/:id/reverse', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.documents.reverse');
      const idempotencyKey = String(req.body?.idempotencyKey || '');
      res.json({ success: true, document: inventoryDatabase.reverseDocument(context, req.params.id, idempotencyKey) });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo reversar el documento.' });
    }
  });

  app.get('/api/inventory/documents', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.view');
      res.json(inventoryDatabase.listDocuments(context, {
        status: req.query.status ? String(req.query.status) : undefined,
        type: req.query.type ? String(req.query.type) : undefined,
        productId: req.query.productId ? String(req.query.productId) : undefined
      }));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudieron consultar los documentos.' });
    }
  });

  app.get('/api/inventory/documents/:id', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.view');
      res.json(inventoryDatabase.getDocument(context, req.params.id));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo consultar el documento.' });
    }
  });

  app.get('/api/inventory/kardex/:productId', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.view');
      res.json(inventoryDatabase.getKardex(context, req.params.productId));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo consultar el Kardex.' });
    }
  });

  app.get('/api/inventory/balances', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.products.view');
      res.json(inventoryDatabase.getBalances(context));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudieron consultar los saldos.' });
    }
  });

  app.get('/api/inventory/replenishment', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.replenishment.view');
      res.json(inventoryDatabase.listReplenishment(context));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo consultar la reposición.' });
    }
  });

  app.post('/api/inventory/replenishment', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.replenishment.view');
      res.json({ success: true, rule: inventoryDatabase.saveReplenishmentRule(context, req.body) });
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo guardar la reposición.' });
    }
  });

  app.get('/api/inventory/reconciliation', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.audit.view');
      res.json(inventoryDatabase.reconcile(context, req.query.productId ? String(req.query.productId) : undefined));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo realizar la conciliación.' });
    }
  });

  app.get('/api/inventory/audit', (req, res) => {
    try {
      const context = requireInventoryContext(req, 'inventory.audit.view');
      res.json(inventoryDatabase.listAudit(context));
    } catch (error: any) {
      res.status(inventoryErrorStatus(error)).json({ error: error?.message || 'No se pudo consultar la auditoría.' });
    }
  });

  // Search products
  app.get("/api/products", (req, res) => {
    const query = (req.query.q as string || "").toUpperCase();
    if (!query) return res.json(products);

    // Prioritize exact barcode, then partial name
    const exactMatch = products.find(p => getProductCodes(p).includes(normalizeProductCode(query)));
    if (exactMatch) return res.json([exactMatch]);

    const partialMatches = products.filter(p => 
      p.name.toUpperCase().includes(query) || getProductCodes(p).some((code: string) => code.includes(query))
    );
    res.json(partialMatches);
  });

  // Save or Update Product
  app.post("/api/products", async (req, res) => {
    const prod = req.body;
    if (!prod || !prod.name) {
      return res.status(400).json({ error: "Datos de producto inválidos" });
    }
    const normalizedProduct = {
      ...prod,
      code: normalizeProductCode(prod.code || prod.barcode),
      barcode: normalizeProductCode(prod.barcode),
      altCode: normalizeProductCode(prod.altCode),
      barcodeAliases: Array.from(new Set(
        (Array.isArray(prod.barcodeAliases) ? prod.barcodeAliases : [])
          .map(normalizeProductCode)
          .filter(Boolean)
      ))
    };

    if (!normalizedProduct.barcode) {
      return res.status(400).json({ error: "Debe escanear o ingresar el codigo de barras antes de guardar el producto." });
    }

    const candidateCodes = getProductCodes(normalizedProduct);
    const conflict = findProductCodeConflict(normalizedProduct);
    if (conflict) {
      const conflictCode = candidateCodes.find(code => getProductCodes(conflict).includes(code));
      return res.status(409).json({
        error: `El codigo ${conflictCode} ya esta asignado al producto ${conflict.name}.`,
        conflictProductId: conflict.id
      });
    }

    const idx = products.findIndex(p => String(p.id) === String(normalizedProduct.id));
    if (idx >= 0) {
      products[idx] = { ...products[idx], ...normalizedProduct };
    } else {
      products.push(normalizedProduct);
    }
    await persistLocalState();
    res.json({ success: true, products });
  });

  // Delete product
  app.delete("/api/products/:id", async (req, res) => {
    const { id } = req.params;
    products = products.filter(p => String(p.id) !== String(id));
    await persistLocalState();
    res.json({ success: true, products });
  });

  // Process Sale
  app.post("/api/sales", async (req, res) => {
    const { items, total, customer, paymentMethod, destinationCaja, sriPaymentForm, paymentLines, transferVoucherImage } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "El carrito de ventas está vacío." });
    }

    if (typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: "No se puede procesar una venta con total menor o igual a $0.00" });
    }

    const invalidQuantity = validateQuantities(items);
    if (invalidQuantity) {
      return res.status(400).json({ error: "Todas las cantidades de la venta deben ser mayores a cero." });
    }

    const normalizedItems = items.map((item: any) => ({
      ...item,
      quantity: getPositiveQuantity(item)
    }));

    if (paymentMethod === 'CREDITO') {
      const custUpper = (customer || '').toUpperCase();
      if (!customer || custUpper.includes('CONSUMIDOR FINAL') || custUpper.includes('9999999999999')) {
        return res.status(400).json({ error: "No se permite otorgar crédito a CONSUMIDOR FINAL. Seleccione un cliente identificado." });
      }
    }

    if (paymentMethod === 'TRANSFERENCIA') {
      const custUpper = (customer || '').toUpperCase();
      if (!customer || custUpper.includes('CONSUMIDOR FINAL') || custUpper.includes('9999999999999')) {
        return res.status(400).json({ error: "Para pagos por transferencia se requiere un cliente identificado (Cédula/RUC y Nombre) para posterior verificación." });
      }
    }

    // Validate the total quantity per product before changing any stock.
    const requestedByProduct = new Map<string, { product: any; quantity: number; name: string }>();
    for (const item of normalizedItems) {
      const product = findProductByReference(item);
      if (!product) {
        return res.status(400).json({ error: `Producto no encontrado: ${item.name || item.code || item.barcode || 'sin referencia'}` });
      }

      const key = String(product.id);
      const current = requestedByProduct.get(key);
      requestedByProduct.set(key, {
        product,
        quantity: (current?.quantity || 0) + item.quantity,
        name: product.name || item.name
      });
    }

    for (const { product, quantity, name } of requestedByProduct.values()) {
      if (Number(product.stock || 0) < quantity) {
        return res.status(400).json({ error: `Stock insuficiente: ${name}. Disponible: ${product.stock || 0}, solicitado: ${quantity}.` });
      }
    }

    // Deduct stock
    for (const { product, quantity } of requestedByProduct.values()) {
      product.stock -= quantity;
    }

    const sale = {
      id: Date.now(),
      items: normalizedItems,
      total,
      customer,
      paymentMethod,
      destinationCaja: destinationCaja || (paymentMethod === 'TRANSFERENCIA' ? 'CUENTA BANCARIA' : 'CAJA POS'),
      sriPaymentForm: sriPaymentForm || 'Sin Utilización Del Sistema Financiero (01)',
      paymentLines: paymentLines || [],
      transferVoucherImage: transferVoucherImage || null,
      timestamp: new Date().toISOString()
    };
    sales.push(sale);

    // Update cash if there's cash payment
    let cashAmount = 0;
    if (paymentLines && paymentLines.length > 0) {
      cashAmount = paymentLines
        .filter((l: any) => l.type === 'EFECTIVO')
        .reduce((acc: number, curr: any) => acc + curr.value, 0);
    } else if (paymentMethod === 'EFECTIVO') {
      cashAmount = total;
    }

    if (cashAmount > 0) {
      cajaOperativa += cashAmount;
      movements.push({
        type: 'ingreso',
        amount: cashAmount,
        description: 'Venta POS',
        timestamp: new Date()
      });
    }

    await persistLocalState();
    res.json({ success: true, cajaOperativa, sale });
  });

  app.get("/api/sales", (req, res) => {
    res.json(sales);
  });

  // Cash Management
  app.get("/api/cash", (req, res) => {
    res.json({ cajaOperativa, cajaCentral, dineroInicial, movements });
  });

  app.post("/api/cash/initial", async (req, res) => {
    const { amount } = req.body;
    dineroInicial = amount;
    cajaOperativa = amount;
    movements = [{
      type: 'inicial',
      amount,
      reason: 'Fondo de caja inicial',
      timestamp: new Date().toISOString()
    }];
    await persistLocalState();
    res.json({ success: true, cajaOperativa, dineroInicial });
  });

  app.post("/api/cash/transfer", async (req, res) => {
    const { amount } = req.body;
    if (amount > cajaOperativa) {
      return res.status(400).json({ error: "Fondos insuficientes en caja operativa" });
    }

    cajaOperativa -= amount;
    cajaCentral += amount;
    
    movements.push({
      type: 'transferencia',
      amount,
      description: 'Recolección a Central',
      timestamp: new Date()
    });

    await persistLocalState();
    res.json({ success: true, cajaOperativa, cajaCentral });
  });

  // Cash movements (Entries/Exits)
  app.post("/api/cash/movement", async (req, res) => {
    const { type, amount, reason } = req.body;
    if (type === 'in') {
      cajaOperativa += amount;
    } else if (type === 'out') {
      cajaOperativa -= amount;
    }
    
    movements.push({
      type: type === 'in' ? 'entrada' : 'salida',
      amount,
      reason,
      timestamp: new Date().toISOString()
    });
    
    await persistLocalState();
    res.json({ success: true, cajaOperativa, cajaCentral });
  });

  app.post("/api/cash/corte", async (req, res) => {
    const { amountToTransfer } = req.body;
    
    if (amountToTransfer > cajaOperativa) {
      return res.status(400).json({ error: "No hay suficiente efectivo en caja" });
    }

    cajaOperativa -= amountToTransfer;
    cajaCentral += amountToTransfer;

    movements.push({
      type: 'corte',
      amount: amountToTransfer,
      reason: 'Corte de caja / Retiro a Central',
      timestamp: new Date().toISOString()
    });

    await persistLocalState();
    res.json({ success: true, cajaOperativa, cajaCentral });
  });

  // Credit Management (Fiar)
  app.post("/api/credits", async (req, res) => {
    const { items, total, customer, transferVoucherImage } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "El carrito de ventas está vacío." });
    }

    if (typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: "No se puede registrar un crédito con total menor o igual a $0.00." });
    }

    const invalidQuantity = validateQuantities(items);
    if (invalidQuantity) {
      return res.status(400).json({ error: "Todas las cantidades del crédito deben ser mayores a cero." });
    }

    const normalizedItems = items.map((item: any) => ({
      ...item,
      quantity: getPositiveQuantity(item)
    }));

    const custUpper = (customer || '').toUpperCase();
    if (!customer || custUpper.includes('CONSUMIDOR FINAL') || custUpper.includes('9999999999999')) {
      return res.status(400).json({ error: "No se permite otorgar crédito a CONSUMIDOR FINAL. Seleccione un cliente identificado." });
    }

    const requestedByProduct = new Map<string, { product: any; quantity: number; name: string }>();
    for (const item of normalizedItems) {
      const product = findProductByReference(item);
      if (!product) {
        return res.status(400).json({ error: `Producto no encontrado: ${item.name || item.code || item.barcode || 'sin referencia'}` });
      }

      const key = String(product.id);
      const current = requestedByProduct.get(key);
      requestedByProduct.set(key, {
        product,
        quantity: (current?.quantity || 0) + item.quantity,
        name: product.name || item.name
      });
    }

    for (const { product, quantity, name } of requestedByProduct.values()) {
      if (Number(product.stock || 0) < quantity) {
        return res.status(400).json({ error: `Stock insuficiente: ${name}. Disponible: ${product.stock || 0}, solicitado: ${quantity}.` });
      }
    }

    for (const { product, quantity } of requestedByProduct.values()) {
      product.stock -= quantity;
    }

    credits.push({
      id: Date.now(),
      customer,
      items: normalizedItems,
      total,
      transferVoucherImage: transferVoucherImage || null,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });
    
    await persistLocalState();
    res.json({ success: true });
  });

  // Consulta auxiliar de identidad para autocompletar datos de personas naturales.
  app.get("/api/sri/cedula-lookup", async (req, res) => {
    const rawId = ((req.query.id as string) || (req.query.cedula as string) || (req.query.ruc as string) || "").trim();
    const cleanId = rawId.replace(/\D/g, "");

    if (cleanId.length !== 10 && cleanId.length !== 13) {
      return res.status(400).json({
        found: false,
        error: "Debe ingresar una cédula de 10 dígitos o un RUC de 13 dígitos."
      });
    }

    const cached = identityLookupCache.get(cleanId);
    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader("X-TENDI-Identity-Cache", "HIT");
      return res.json(cached.payload);
    }
    if (cached) identityLookupCache.delete(cleanId);

    const isRuc = cleanId.length === 13;
    const thirdDigit = cleanId.charAt(2);
    const cedula10 = cleanId.substring(0, 10);

    if (isRuc && (thirdDigit === "6" || thirdDigit === "9")) {
      const payload = cacheIdentityResult(cleanId, {
        found: false,
        id: cleanId,
        message: "Complete la razón social manualmente."
      }, IDENTITY_NOT_FOUND_TTL_MS);
      return res.json(payload);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    try {
      const targetUrl = "https://online.registropropiedadportoviejo.gob.ec/registro/searchPersona";
      const bodyData = new URLSearchParams();
      bodyData.append("identificacion", cedula10);
      bodyData.append("tipoidentificacion", "2");

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "Referer": "https://online.registropropiedadportoviejo.gob.ec/registro/registrarUsuario"
        },
        body: bodyData.toString(),
        signal: controller.signal
      });

      if (!response.ok) {
        return res.status(503).json({
          found: false,
          error: "No se pudo completar la búsqueda. Ingrese los datos manualmente."
        });
      }

      const text = await response.text();
      const parsed = JSON.parse(text);
      const rawData = parsed?.data;
      const d = Array.isArray(rawData) ? rawData[0] : rawData;

      if (d && typeof d === "object") {
        const surnames = String(d.apellidos || d.lastName || "").trim();
        const names = String(d.nombres || d.firstName || "").trim();
        const fullName = String(d.nombreCompleto || d.razonSocial || (surnames + " " + names)).trim();

        if (fullName.length > 2) {
          const payload = cacheIdentityResult(cleanId, {
            found: true,
            id: cleanId,
            name: fullName.toUpperCase(),
            firstName: names.toUpperCase(),
            lastName: surnames.toUpperCase(),
            companyName: fullName.toUpperCase(),
            type: "PERSONA_NATURAL",
            idType: isRuc ? "RUC" : "CEDULA",
            address: String(d.direccion || d.address || "").toUpperCase(),
            email: d.email || "",
          }, IDENTITY_FOUND_TTL_MS);
          res.setHeader("Cache-Control", "private, max-age=120");
          return res.json(payload);
        }
      }

      const payload = cacheIdentityResult(cleanId, {
        found: false,
        id: cleanId,
        message: "No se encontraron datos. Complete la información manualmente."
      }, IDENTITY_NOT_FOUND_TTL_MS);
      return res.json(payload);
    } catch (error: any) {
      const timedOut = error?.name === "AbortError";
      return res.status(503).json({
        found: false,
        error: timedOut
          ? "La búsqueda excedió el tiempo de espera. Complete los datos manualmente."
          : "No se pudo completar la búsqueda. Ingrese los datos manualmente."
      });
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // Customers Management
  app.get("/api/customers", (req, res) => {
    res.json(customers);
  });

  app.post("/api/customers", async (req, res) => {
    const customer = req.body;
    if (!customer || !customer.name) {
      return res.status(400).json({ error: "Datos de cliente no válidos." });
    }

    const custNameUpper = customer.name.trim().toUpperCase();
    const custRuc = (customer.ruc || '').trim();

    const existingIdx = customers.findIndex(c => 
      (custRuc && c.ruc && c.ruc === custRuc) || 
      (c.name && c.name.trim().toUpperCase() === custNameUpper)
    );

    if (existingIdx >= 0) {
      customers[existingIdx] = { ...customers[existingIdx], ...customer, name: custNameUpper };
    } else {
      customers.unshift({ ...customer, name: custNameUpper });
    }

    await persistLocalState();
    res.json({ success: true, customers });
  });

  // Suppliers Management
  app.get("/api/suppliers", (req, res) => {
    res.json(suppliers);
  });

  app.post("/api/suppliers", async (req, res) => {
    const supplier = req.body;
    if (!supplier || !supplier.name || !supplier.ruc) {
      return res.status(400).json({ error: "Nombre y RUC del proveedor son obligatorios." });
    }
    const supUpper = supplier.name.trim().toUpperCase();
    const supRuc = supplier.ruc.trim().toUpperCase();

    const existingIdx = suppliers.findIndex(s => s.ruc === supRuc);
    if (existingIdx >= 0) {
      suppliers[existingIdx] = { ...suppliers[existingIdx], ...supplier, name: supUpper, ruc: supRuc };
    } else {
      suppliers.unshift({ id: Date.now(), ...supplier, name: supUpper, ruc: supRuc });
    }
    await persistLocalState();
    res.json({ success: true, suppliers });
  });

  // Purchases / Comprobantes de Compra & Liquidaciones SRI
  app.get("/api/purchases", (req, res) => {
    res.json(purchases);
  });

  app.post("/api/purchases", async (req, res) => {
    const { supplier, docType, documentNumber, authorizationNumber, items, total, subtotal15, subtotal0, vatAmount, paymentMethod, notes } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "El comprobante de compra debe contener al menos un producto o ítem." });
    }

    if (!supplier || !supplier.name || !supplier.ruc) {
      return res.status(400).json({ error: "Debe seleccionar o ingresar un proveedor con RUC/Cédula válido." });
    }

    if (typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: "El total del comprobante de compra debe ser mayor a $0.00" });
    }

    const invalidQuantity = validateQuantities(items);
    if (invalidQuantity) {
      return res.status(400).json({ error: "Todas las cantidades de la compra deben ser mayores a cero." });
    }

    const normalizedItems = items.map((item: any) => ({
      ...item,
      quantity: getPositiveQuantity(item),
      code: normalizeProductCode(item.code || item.barcode),
      barcode: normalizeProductCode(item.barcode),
      altCode: normalizeProductCode(item.altCode),
      barcodeAliases: Array.from(new Set(
        (Array.isArray(item.barcodeAliases) ? item.barcodeAliases : [])
          .map(normalizeProductCode)
          .filter(Boolean)
      ))
    }));

    const productWithoutBarcode = normalizedItems.find((item: any) => item.createIfMissing && !normalizeProductCode(item.barcode));
    if (productWithoutBarcode) {
      return res.status(400).json({ error: "Todo producto nuevo debe ingresar primero por un cÃ³digo de barras escaneado." });
    }

    const incomingNewProducts = normalizedItems
      .filter((item: any) => item.createIfMissing)
      .map((item: any) => ({
        id: `incoming-${item.barcode}`,
        code: normalizeProductCode(item.code || item.barcode),
        barcode: normalizeProductCode(item.barcode),
        altCode: normalizeProductCode(item.altCode),
        barcodeAliases: Array.isArray(item.barcodeAliases) ? item.barcodeAliases : [],
        name: item.name
      }));
    const seenIncomingCodes = new Set<string>();
    let duplicateIncomingCode = '';
    for (const incomingProduct of incomingNewProducts) {
      for (const code of getProductCodes(incomingProduct)) {
        if (seenIncomingCodes.has(code)) duplicateIncomingCode = code;
        seenIncomingCodes.add(code);
      }
    }
    if (duplicateIncomingCode) {
      return res.status(409).json({ error: `El codigo ${duplicateIncomingCode} se repite dentro del comprobante de compra.` });
    }

    const purchaseConflict = incomingNewProducts
      .map(findProductCodeConflict)
      .find(Boolean);
    if (purchaseConflict) {
      return res.status(409).json({ error: `Uno de los cÃ³digos ya estÃ¡ asignado al producto ${purchaseConflict.name}.` });
    }

    // Process Stock Entry (Increase Stock) & Update Costs
    normalizedItems.forEach((item: any) => {
      const p = findProductByReference(item);
      if (p) {
        p.stock = Number(p.stock || 0) + item.quantity;
        if (item.costPrice && item.costPrice > 0) {
          p.costPrice = item.costPrice;
        }
      } else if (item.createIfMissing && item.name) {
        // Option to create new product directly from purchase
        const newProd = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          code: normalizeProductCode(item.code || item.barcode),
          barcode: normalizeProductCode(item.barcode),
          altCode: normalizeProductCode(item.altCode),
          barcodeAliases: item.barcodeAliases,
          name: item.name.toUpperCase(),
          price: item.salePrice || (item.costPrice * 1.3) || 1.00,
          costPrice: item.costPrice || 0,
          stock: item.quantity,
          category: 'food',
          image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80'
        };
        products.push(newProd);
      }
    });

    const newPurchase = {
      id: Date.now(),
      purchaseCode: `COMP-${Date.now().toString().slice(-6)}`,
      supplier,
      docType: docType || 'FACTURA_PROVEEDOR', // 'FACTURA_PROVEEDOR' or 'LIQUIDACION_COMPRA_SRI_03'
      documentNumber: documentNumber || `001-001-${Math.floor(Math.random() * 899999 + 100000)}`,
      authorizationNumber: authorizationNumber || `AUT-${Date.now()}`,
      items: normalizedItems,
      subtotal15: subtotal15 || 0,
      subtotal0: subtotal0 || 0,
      vatAmount: vatAmount || 0,
      total,
      paymentMethod: paymentMethod || 'EFECTIVO',
      notes: notes || '',
      timestamp: new Date().toISOString()
    };

    purchases.unshift(newPurchase);

    // If paid in cash, record cash expense (egreso de caja)
    if (paymentMethod === 'EFECTIVO') {
      cajaOperativa -= total;
      const obsText = notes ? ` | OBS: ${notes}` : '';
      movements.push({
        id: Date.now(),
        type: 'salida',
        amount: total,
        reason: `COMPRA MERCADERÍA: ${supplier.name} - Doc: ${newPurchase.documentNumber}${obsText}`,
        paymentMethod: 'EFECTIVO',
        supplierName: supplier.name,
        docNumber: newPurchase.documentNumber,
        observation: notes || '',
        timestamp: new Date().toISOString()
      });
    }

    await persistLocalState();
    res.json({ success: true, purchase: newPurchase, cajaOperativa });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`PosMarket Server running on http://localhost:${PORT}`);
  });
}

startServer();
