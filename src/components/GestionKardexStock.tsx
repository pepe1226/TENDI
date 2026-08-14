import React, { useState } from 'react';
import { Package, Search, ArrowUpRight, ArrowDownRight, Layers, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react';
import { QuantityEngine, StockEngine, CostEngine, StockConcurrencyEngine } from '../lib/tendiCoreEngines';

export const GestionKardexStock: React.FC = () => {
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [unitType, setUnitType] = useState<'UNIDAD' | 'CAJA_24' | 'PACAS_12'>('UNIDAD');
  const [quantityInput, setQuantityInput] = useState<number>(0);
  const products: any[] = [];
  const [movements] = useState<any[]>([]);
  const activeProductObj = products.find(p => p.id === selectedProduct) || { stock: 0, cost: 0 };

  // Normalized quantity calculation using QuantityEngine
  const normalizedFactor = QuantityEngine.getUnitFactor(unitType);
  const normalizedBaseUnits = QuantityEngine.toBaseUnits(quantityInput, unitType);

  // Stock Reservation Check using StockConcurrencyEngine
  const reservationTest = selectedProduct
    ? StockConcurrencyEngine.reserveStock('', selectedProduct, normalizedBaseUnits)
    : { success: false, message: 'Seleccione un producto sincronizado' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <Package className="text-[#00ff41]" />
            <span>KARDEX DE INVENTARIOS Y MOTOR DE CANTIDADES NORMALIZADAS</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Transformación automática de cajas/pacas a unidades base y costo promedio ponderado
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="bg-[#0a0a0d] border border-zinc-800 text-[#00ff41] font-mono font-bold rounded-xl px-3 py-2 text-xs outline-none"
          >
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Normalization & Conversion Simulator */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
          <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <Layers size={18} className="text-emerald-400" />
            <span>Simulador de Conversión de Unidades Comercial → Base</span>
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-zinc-400 font-bold block mb-1">Cantidad Digitada</label>
              <input
                type="number"
                value={quantityInput}
                onChange={(e) => setQuantityInput(Number(e.target.value))}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-zinc-400 font-bold block mb-1">Empaque Comercial</label>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value as any)}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
              >
                <option value="UNIDAD">UNIDAD (x1)</option>
                <option value="CAJA_24">CAJA (x24 u.)</option>
                <option value="PACAS_12">PACA (x12 u.)</option>
              </select>
            </div>
          </div>

          <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400 font-mono">
              <span>Factor de Multiplicación:</span>
              <span className="font-bold text-white">x{normalizedFactor}</span>
            </div>
            <div className="flex justify-between text-zinc-400 font-mono border-t border-zinc-800/80 pt-2">
              <span>Unidades Físicas Reales a Descontar:</span>
              <span className="font-bold text-[#00ff41] text-sm">{normalizedBaseUnits} Unidades Base</span>
            </div>
          </div>
        </div>

        {/* Reserva Atómica y Kardex Metrics */}
        <div className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl space-y-4">
          <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2 border-b border-zinc-800 pb-3">
            <CheckCircle2 size={18} className="text-[#00ff41]" />
            <span>Verificación de Reserva Concurrente de Stock</span>
          </h3>

          <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-mono">Stock Disponible Actual:</span>
              <span className="font-mono font-bold text-white text-base">{activeProductObj.stock} u.</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 font-mono">Reserva Solicitada:</span>
              <span className="font-mono font-bold text-amber-400">{normalizedBaseUnits} u.</span>
            </div>

            <div className={`p-3 rounded-xl border font-mono text-[11px] font-bold flex items-center gap-2 ${
              reservationTest.success 
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' 
                : 'bg-red-950/60 border-red-800 text-red-400'
            }`}>
              {reservationTest.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              <span>{reservationTest.message}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Movimientos del Kardex */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 font-bold text-sm text-zinc-200 flex justify-between items-center">
          <span>Historial Físico de Movimientos (Kardex Ponderado)</span>
          <span className="text-xs text-[#00ff41] font-mono font-normal">Costo Promedio Actual: ${activeProductObj.cost.toFixed(2)}</span>
        </div>

        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
            <tr>
              <th className="p-3.5">Fecha</th>
              <th className="p-3.5">Tipo</th>
              <th className="p-3.5">Referencia</th>
              <th className="p-3.5 text-right">Cant. Comercial</th>
              <th className="p-3.5 text-right font-mono">Unidades Base</th>
              <th className="p-3.5 text-right font-mono">Stock Resultante</th>
              <th className="p-3.5 text-right font-mono">Costo Unitario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
            {movements.map(m => (
              <tr key={m.id} className="hover:bg-zinc-800/40">
                <td className="p-3.5 text-zinc-400">{m.date}</td>
                <td className="p-3.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 w-fit ${
                    m.type === 'ENTRADA' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {m.type === 'ENTRADA' ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                    {m.type}
                  </span>
                </td>
                <td className="p-3.5 text-white font-sans">{m.ref}</td>
                <td className="p-3.5 text-right font-bold text-zinc-200">{m.qtyCommercial} {m.unit}</td>
                <td className="p-3.5 text-right font-bold text-[#00ff41]">{m.qtyBase} u.</td>
                <td className="p-3.5 text-right font-bold text-white">{m.stockAfter} u.</td>
                <td className="p-3.5 text-right text-zinc-400">${m.unitCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
