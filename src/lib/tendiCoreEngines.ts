/**
 * TENDI ERP - Motores Transaccionales y Reglas de Negocio (Puntos 8 a 14)
 * Motor de Validaciones, Secuenciales, Concurrencia de Stock, Cantidades, Stock Acumulado, Costos e Impuestos/Precios.
 */

// --------------------------------------------------------------------------
// 8. MOTOR DE VALIDACIONES (ValidationEngine)
// --------------------------------------------------------------------------
export interface ValidationContext {
  isCompanyActive: boolean;
  isUserAuthorized: boolean;
  isPeriodOpen: boolean;
  isCustomerOrSupplierValid: boolean;
  isCashAndWarehouseActive: boolean;
  isSequentialAvailable: boolean;
  areProductsActive: boolean;
  quantitiesAndValuesPositive: boolean;
  hasValidIvaAndPaymentMethod: boolean;
  stockAvailable: boolean;
  debitEqualsCredit?: boolean; // Para comprobantes contables
  isDocumentNotRepeated: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class ValidationEngine {
  public fontName = 'ValidationEngine';

  public static validateBeforeSave(ctx: ValidationContext): ValidationResult {
    const errors: string[] = [];

    if (!ctx.isCompanyActive) errors.push('La empresa seleccionada no se encuentra activa.');
    if (!ctx.isUserAuthorized) errors.push('El usuario no posee permisos para realizar esta transacción.');
    if (!ctx.isPeriodOpen) errors.push('El período contable/comercial correspondiente se encuentra cerrado.');
    if (!ctx.isCustomerOrSupplierValid) errors.push('El cliente o proveedor no es válido o está inactivo.');
    if (!ctx.isCashAndWarehouseActive) errors.push('La caja asignada o la bodega seleccionada no están activas.');
    if (!ctx.isSequentialAvailable) errors.push('El secuencial del comprobante no está disponible o ya fue utilizado.');
    if (!ctx.areProductsActive) errors.push('Uno o más productos seleccionados están desactivados.');
    if (!ctx.quantitiesAndValuesPositive) errors.push('Las cantidades y valores deben ser mayores a cero.');
    if (!ctx.hasValidIvaAndPaymentMethod) errors.push('La tarifa de IVA o la forma de pago no son válidas.');
    if (!ctx.stockAvailable) errors.push('Stock insuficiente en la bodega para completar la venta.');
    if (ctx.debitEqualsCredit === false) errors.push('Desbalance contable: El Debe no es igual al Haber.');
    if (!ctx.isDocumentNotRepeated) errors.push('El documento/clave de acceso ya se encuentra registrado (documento duplicado).');

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

// --------------------------------------------------------------------------
// 9. CONCURRENCIA Y SECUENCIALES (SequenceEngine)
// --------------------------------------------------------------------------
export interface SequentialLockState {
  establishment: string;
  emissionPoint: string;
  docType: string;
  currentNumber: number;
  isLocked: boolean;
}

const lockRegistry = new Map<string, boolean>();
const currentSequences = new Map<string, number>();

export class SequenceEngine {
  /**
   * Reserva atómica de secuencial para evitar colisión entre dos cajas simultáneas
   */
  public static async reserveSequentialAtomic(
    establishment: string,
    emissionPoint: string,
    docType: string
  ): Promise<string> {
    const key = `${establishment}-${emissionPoint}-${docType}`;

    // Esperar si está bloqueado por otro hilo de caja
    let attempts = 0;
    while (lockRegistry.get(key) && attempts < 20) {
      await new Promise((res) => setTimeout(res, 50));
      attempts++;
    }

    // Bloquear secuencial
    lockRegistry.set(key, true);

    try {
      // Leer número actual
      const current = currentSequences.get(key) || 1;
      const nextNumber = current;
      
      // Incrementar y guardar
      currentSequences.set(key, current + 1);

      // Formatear secuencial 001-001-000000001
      const formattedNumber = String(nextNumber).padStart(9, '0');
      return formattedNumber;
    } finally {
      // Liberar bloqueo de forma atómica
      lockRegistry.set(key, false);
    }
  }

  public static setNextSequence(establishment: string, emissionPoint: string, docType: string, startValue: number) {
    const key = `${establishment}-${emissionPoint}-${docType}`;
    currentSequences.set(key, startValue);
  }
}

// --------------------------------------------------------------------------
// 10. CONCURRENCIA DE STOCK (StockConcurrencyEngine)
// --------------------------------------------------------------------------
const stockLocks = new Map<string, boolean>();

export class StockConcurrencyEngine {
  /**
   * Reserva y deducción atómica de saldo en bodega
   */
  public static async reserveStockAtomic(
    productId: string,
    warehouseId: string,
    requiredQty: number,
    currentStock: number,
    allowNegative: boolean = false
  ): Promise<{ success: boolean; remainingStock: number; error?: string }> {
    const lockKey = `${warehouseId}-${productId}`;

    // Bloqueo síncrono atómico
    let attempts = 0;
    while (stockLocks.get(lockKey) && attempts < 20) {
      await new Promise((res) => setTimeout(res, 30));
      attempts++;
    }

    stockLocks.set(lockKey, true);

    try {
      if (!allowNegative && currentStock < requiredQty) {
        return {
          success: false,
          remainingStock: currentStock,
          error: `Stock insuficiente. Disponible: ${currentStock}, Requerido: ${requiredQty}`
        };
      }

      const newStock = currentStock - requiredQty;
      return {
        success: true,
        remainingStock: newStock
      };
    } finally {
      stockLocks.set(lockKey, false);
    }
  }

  public static reserveStock(
    warehouseId: string,
    productId: string,
    requiredQty: number,
    currentStock: number = 100
  ): { success: boolean; remainingStock: number; error?: string; message: string } {
    if (currentStock < requiredQty) {
      return {
        success: false,
        remainingStock: currentStock,
        error: `Stock insuficiente en bodega ${warehouseId}. Solicitado: ${requiredQty}, Disponible: ${currentStock}`,
        message: `RESERVA RECHAZADA: Stock insuficiente (${currentStock} u. disponible vs ${requiredQty} u. solicitadas)`
      };
    }
    return {
      success: true,
      remainingStock: currentStock - requiredQty,
      message: `RESERVA AUTORIZADA: Saldo restante ${currentStock - requiredQty} u. en Bodega Principal`
    };
  }
}

// --------------------------------------------------------------------------
// 11. MOTOR DE CANTIDADES (QuantityEngine)
// --------------------------------------------------------------------------
export interface CommercialQuantityInput {
  cantidadDigitada: number; // Ej. 2 pacas
  cantidadFactor: number;   // Ej. 12 unidades por paca
  unidadComercial: string;  // Ej. "paca"
  unidadBase: string;       // Ej. "unidad"
}

export interface NormalizedQuantityResult {
  cantidadBase: number;        // Ej. 24 unidades para Kardex
  cantidadDigitada: number;    // Ej. 2 pacas para factura comercial
  unidadComercial: string;
  unidadBase: string;
}

export class QuantityEngine {
  public static getUnitFactor(unitType: string): number {
    switch (unitType) {
      case 'CAJA_24':
        return 24;
      case 'PACAS_12':
        return 12;
      case 'DOCENA':
        return 12;
      case 'UNIDAD':
      default:
        return 1;
    }
  }

  public static toBaseUnits(quantity: number, unitType: string): number {
    return quantity * QuantityEngine.getUnitFactor(unitType);
  }

  /**
   * Normaliza la cantidad digitada a unidades base para el Kardex
   */
  public static normalizeQuantity(input: CommercialQuantityInput): NormalizedQuantityResult {
    const factor = input.cantidadFactor > 0 ? input.cantidadFactor : 1;
    const cantidadBase = input.cantidadDigitada * factor;

    return {
      cantidadBase,
      cantidadDigitada: input.cantidadDigitada,
      unidadComercial: input.unidadComercial || 'unidad',
      unidadBase: input.unidadBase || 'unidad'
    };
  }
}

// --------------------------------------------------------------------------
// 12. MOTOR DE STOCK (StockEngine)
// --------------------------------------------------------------------------
export interface MovimientoInventario {
  id: string;
  fecha: string;
  productoId: string;
  almacenId: string;
  tipoMovimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';
  cantidadBase: number;
  stockAcumuladoPostMovimiento: number;
  referenciaDoc: string; // Venta, compra o ajuste
  usuarioResponsableId: string;
}

export interface StockAcumuladoAlmacen {
  almacenId: string;
  productoId: string;
  existencias: number;
}

export class StockEngine {
  /**
   * Registra un movimiento y actualiza los saldos acumulados de forma consistente
   */
  public static processInventoryMovement(
    mov: Omit<MovimientoInventario, 'id' | 'stockAcumuladoPostMovimiento'>,
    currentWarehouseStock: number,
    currentTotalCompanyStock: number
  ): {
    movimiento: MovimientoInventario;
    nuevoStockAlmacen: number;
    nuevoStockTotalEmpresa: number;
  } {
    const isPositive = mov.tipoMovimiento === 'ENTRADA' || mov.tipoMovimiento === 'AJUSTE_POSITIVO';
    const delta = isPositive ? mov.cantidadBase : -mov.cantidadBase;

    const nuevoStockAlmacen = currentWarehouseStock + delta;
    const nuevoStockTotalEmpresa = currentTotalCompanyStock + delta;

    const movimientoCompleto: MovimientoInventario = {
      ...mov,
      id: 'MOV-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
      stockAcumuladoPostMovimiento: nuevoStockAlmacen
    };

    return {
      movimiento: movimientoCompleto,
      nuevoStockAlmacen,
      nuevoStockTotalEmpresa
    };
  }

  /**
   * Recalcula existencias desde el historial de movimientos en caso de desincronización
   */
  public static recalculateFromLedger(ledger: MovimientoInventario[]): number {
    return ledger.reduce((acc, mov) => {
      const isPositive = mov.tipoMovimiento === 'ENTRADA' || mov.tipoMovimiento === 'AJUSTE_POSITIVO';
      return acc + (isPositive ? mov.cantidadBase : -mov.cantidadBase);
    }, 0);
  }
}

// --------------------------------------------------------------------------
// 13. MOTOR DE COSTOS (CostEngine)
// --------------------------------------------------------------------------
export interface HistoricalSaleItemCost {
  productoId: string;
  cantidadVendidaBase: number;
  precioVentaUnitarioSinIva: number;
  costoHistoricoUnitario: number; // Snapshot del costo promedio/última compra vigente al vender
}

export interface CostAndProfitSummary {
  subtotalVentaNeta: number;
  costoTotalVenta: number;
  utilidadBruta: number;
  margenPorcentaje: number; // (Utilidad / Venta Neta) * 100
}

export class CostEngine {
  /**
   * Calcula el costo histórico de venta y utilidad exacta
   */
  public static calculateProfit(items: HistoricalSaleItemCost[]): CostAndProfitSummary {
    let subtotalVentaNeta = 0;
    let costoTotalVenta = 0;

    for (const item of items) {
      const ventaLinea = item.cantidadVendidaBase * item.precioVentaUnitarioSinIva;
      const costoLinea = item.cantidadVendidaBase * item.costoHistoricoUnitario;

      subtotalVentaNeta += ventaLinea;
      costoTotalVenta += costoLinea;
    }

    const utilidadBruta = subtotalVentaNeta - costoTotalVenta;
    const margenPorcentaje = subtotalVentaNeta > 0 
      ? Number(((utilidadBruta / subtotalVentaNeta) * 100).toFixed(2))
      : 0;

    return {
      subtotalVentaNeta: Number(subtotalVentaNeta.toFixed(4)),
      costoTotalVenta: Number(costoTotalVenta.toFixed(4)),
      utilidadBruta: Number(utilidadBruta.toFixed(4)),
      margenPorcentaje
    };
  }
}

// --------------------------------------------------------------------------
// 14. MOTOR DE PRECIOS E IMPUESTOS (PriceEngine)
// --------------------------------------------------------------------------
export interface PriceCalculationInput {
  precioLista: number;
  tarifaIvaPercent: number; // Ej. 15 para Ecuador SRI
  descuentoPorcentaje?: number;
  precioMinimoPermitido?: number;
  incluyeIvaEnIngreso: boolean;
  customerGroupDiscountPercent?: number;
  volumeTierDiscountPercent?: number;
}

export interface DetailedPriceBreakdown {
  precioSinIvaUnitario: number;
  descuentoUnitario: number;
  subtotalNetoUnitario: number;
  ivaUnitario: number;
  totalUnitario: number;
  descuentoTotalAplicadoPercent: number;
  violaPrecioMinimo: boolean;
}

export class PriceEngine {
  /**
   * Resuelve tarifa, grupo de cliente, volumen, IVA 15% y control de precio mínimo
   */
  public static calculatePriceDetails(input: PriceCalculationInput): DetailedPriceBreakdown {
    const {
      precioLista,
      tarifaIvaPercent,
      descuentoPorcentaje = 0,
      precioMinimoPermitido = 0,
      incluyeIvaEnIngreso,
      customerGroupDiscountPercent = 0,
      volumeTierDiscountPercent = 0
    } = input;

    // Descuento acumulado autorizado (promoción + cliente + volumen)
    const totalDiscountPercent = Math.min(
      100,
      descuentoPorcentaje + customerGroupDiscountPercent + volumeTierDiscountPercent
    );

    let precioBaseSinIva = precioLista;

    if (incluyeIvaEnIngreso) {
      precioBaseSinIva = precioLista / (1 + tarifaIvaPercent / 100);
    }

    const descuentoUnitario = precioBaseSinIva * (totalDiscountPercent / 100);
    const subtotalNetoUnitario = precioBaseSinIva - descuentoUnitario;

    const violaPrecioMinimo = subtotalNetoUnitario < precioMinimoPermitido;

    const ivaUnitario = subtotalNetoUnitario * (tarifaIvaPercent / 100);
    const totalUnitario = subtotalNetoUnitario + ivaUnitario;

    return {
      precioSinIvaUnitario: Number(precioBaseSinIva.toFixed(4)),
      descuentoUnitario: Number(descuentoUnitario.toFixed(4)),
      subtotalNetoUnitario: Number(subtotalNetoUnitario.toFixed(4)),
      ivaUnitario: Number(ivaUnitario.toFixed(4)),
      totalUnitario: Number(totalUnitario.toFixed(4)),
      descuentoTotalAplicadoPercent: totalDiscountPercent,
      violaPrecioMinimo
    };
  }
}
