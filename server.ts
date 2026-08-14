import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { promises as fs } from "fs";

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

    // Validate stock
    for (const item of items) {
      const p = products.find(prod => prod.id === item.id);
      if (!p || p.stock < 1) {
        return res.status(400).json({ error: `Sin stock: ${item.name}` });
      }
    }

    // Deduct stock
    items.forEach((item: any) => {
      const p = products.find(prod => prod.id === item.id);
      if (p) p.stock -= item.quantity || 1;
    });

    const sale = {
      id: Date.now(),
      items,
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

    const custUpper = (customer || '').toUpperCase();
    if (!customer || custUpper.includes('CONSUMIDOR FINAL') || custUpper.includes('9999999999999')) {
      return res.status(400).json({ error: "No se permite otorgar crédito a CONSUMIDOR FINAL. Seleccione un cliente identificado." });
    }

    credits.push({
      id: Date.now(),
      customer,
      items,
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

    const productWithoutBarcode = items.find((item: any) => item.createIfMissing && !normalizeProductCode(item.barcode));
    if (productWithoutBarcode) {
      return res.status(400).json({ error: "Todo producto nuevo debe ingresar primero por un cÃ³digo de barras escaneado." });
    }

    const incomingNewProducts = items
      .filter((item: any) => item.createIfMissing)
      .map((item: any) => ({
        id: `incoming-${item.barcode}`,
        code: normalizeProductCode(item.code || item.barcode),
        barcode: normalizeProductCode(item.barcode),
        altCode: normalizeProductCode(item.altCode),
        barcodeAliases: Array.isArray(item.barcodeAliases) ? item.barcodeAliases : [],
        name: item.name
      }));
    const purchaseConflict = incomingNewProducts
      .map(findProductCodeConflict)
      .find(Boolean);
    if (purchaseConflict) {
      return res.status(409).json({ error: `Uno de los cÃ³digos ya estÃ¡ asignado al producto ${purchaseConflict.name}.` });
    }

    // Process Stock Entry (Increase Stock) & Update Costs
    items.forEach((item: any) => {
      let p = products.find(prod => prod.id === item.productId || prod.code === item.code);
      if (p) {
        p.stock += (item.quantity || 1);
        if (item.costPrice && item.costPrice > 0) {
          p.costPrice = item.costPrice;
        }
      } else if (item.createIfMissing && item.name) {
        // Option to create new product directly from purchase
        const newProd = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          code: normalizeProductCode(item.code || item.barcode),
          barcode: normalizeProductCode(item.barcode),
          barcodeAliases: [],
          name: item.name.toUpperCase(),
          price: item.salePrice || (item.costPrice * 1.3) || 1.00,
          costPrice: item.costPrice || 0,
          stock: item.quantity || 1,
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
      items,
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
