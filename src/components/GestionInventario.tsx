import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, BookOpen, CheckCircle2, ClipboardList, History, Package, Plus, RefreshCw, Save, ShieldCheck, Warehouse } from 'lucide-react';

interface GestionInventarioProps {
  companyId: string;
  sessionToken: string;
  activeSubAction?: string;
}

type InventoryProduct = { id: string; code: string; name: string; base_unit?: string; codes?: string; average_cost?: number; sale_price?: number };
type Warehouse = { id: string; code: string; name: string; active: number };
type Balance = { product_id: string; code: string; name: string; stock: number; average_cost: number };
type DocumentRecord = { id: string; type: string; status: string; document_number?: string; created_at: string; line_count: number };

const actionTitle: Record<string, string> = {
  entradas: 'Entradas de inventario',
  salidas: 'Salidas y ajustes',
  kardex: 'Kardex de movimientos',
  ajuste_fisico: 'Conteos y ajustes físicos',
  stock_minimo: 'Reposición',
};

export const GestionInventario: React.FC<GestionInventarioProps> = ({ companyId, sessionToken, activeSubAction }) => {
  const [section, setSection] = useState(activeSubAction === 'kardex' ? 'kardex' : activeSubAction === 'stock_minimo' ? 'reposicion' : activeSubAction === 'ajuste_fisico' ? 'conteos' : 'movimientos');
  const [warehouseId, setWarehouseId] = useState('');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [kardex, setKardex] = useState<any[]>([]);
  const [replenishment, setReplenishment] = useState<any[]>([]);
  const [replenishmentDrafts, setReplenishmentDrafts] = useState<Record<string, { minimumStock: string; maximumStock: string; reorderQuantity: string }>>({});
  const [audit, setAudit] = useState<any[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [movementType, setMovementType] = useState<'ENTRADA' | 'EGRESO' | 'TRANSFERENCIA' | 'AJUSTE' | 'CONTEO'>('ENTRADA');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [quantity, setQuantity] = useState('1');
  const [countedQuantity, setCountedQuantity] = useState('0');
  const [unitCost, setUnitCost] = useState('0');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [newWarehouse, setNewWarehouse] = useState({ id: '', code: '', name: '' });

  const headers = useCallback((warehouse = warehouseId) => ({
    Authorization: `Bearer ${sessionToken}`,
    'Content-Type': 'application/json',
    'x-tendi-company-id': companyId,
    ...(warehouse ? { 'x-tendi-warehouse-id': warehouse } : {})
  }), [companyId, sessionToken, warehouseId]);

  const api = useCallback(async (path: string, init: RequestInit = {}, warehouse = warehouseId) => {
    const response = await fetch(path, { ...init, headers: { ...headers(warehouse), ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación.');
    return data;
  }, [headers, warehouseId]);

  const loadData = useCallback(async (targetWarehouse = warehouseId) => {
    if (!sessionToken) return;
    setError('');
    try {
      const [warehouseData, productData] = await Promise.all([
        api('/api/inventory/warehouses', {}, targetWarehouse),
        api('/api/inventory/products', {}, targetWarehouse)
      ]);
      setWarehouses(warehouseData);
      setProducts(productData.map((product: any) => ({ ...product, codes: product.codes || '' })));
      const activeWarehouse = targetWarehouse || warehouseData[0]?.id || '';
      if (!targetWarehouse && activeWarehouse) setWarehouseId(activeWarehouse);
      if (!activeWarehouse) return;
      const [balanceData, documentData, replenishmentData, auditData] = await Promise.all([
        api('/api/inventory/balances', {}, activeWarehouse),
        api('/api/inventory/documents', {}, activeWarehouse),
        api('/api/inventory/replenishment', {}, activeWarehouse),
        api('/api/inventory/audit', {}, activeWarehouse)
      ]);
      setBalances(balanceData);
      setDocuments(documentData);
      setReplenishment(replenishmentData);
      setReplenishmentDrafts(Object.fromEntries(replenishmentData.map((item: any) => [item.product_id, {
        minimumStock: String(item.minimum_stock || 0),
        maximumStock: String(item.maximum_stock || 0),
        reorderQuantity: String(item.reorder_quantity || 0)
      }])));
      setAudit(auditData);
      if (!selectedProductId && productData[0]?.id) setSelectedProductId(productData[0].id);
    } catch (operationError: any) {
      setError(operationError.message);
    }
  }, [api, selectedProductId, sessionToken, warehouseId]);

  useEffect(() => {
    setSection(activeSubAction === 'kardex' ? 'kardex' : activeSubAction === 'stock_minimo' ? 'reposicion' : activeSubAction === 'ajuste_fisico' ? 'conteos' : 'movimientos');
  }, [activeSubAction]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedProductId || !warehouseId || !sessionToken) return;
    api(`/api/inventory/kardex/${selectedProductId}`).then(setKardex).catch((operationError: any) => setError(operationError.message));
  }, [api, selectedProductId, sessionToken, warehouseId]);

  const selectedBalance = balances.find(item => item.product_id === selectedProductId);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toUpperCase();
    return products.filter(product => !query || `${product.code} ${product.name} ${product.codes || ''}`.toUpperCase().includes(query));
  }, [products, search]);

  const createDocument = async (postImmediately: boolean) => {
    if (!selectedProductId) return setError('Seleccione un producto.');
    const parsedQuantity = Number(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return setError('La cantidad debe ser mayor a cero.');
    if (movementType === 'TRANSFERENCIA' && (!destinationWarehouseId || destinationWarehouseId === warehouseId)) return setError('Seleccione una bodega destino diferente.');
    try {
      setError('');
      const data = await api('/api/inventory/documents', {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: `ui-${crypto.randomUUID()}`,
          type: movementType,
          warehouseId,
          destinationWarehouseId: movementType === 'TRANSFERENCIA' ? destinationWarehouseId : undefined,
          lines: [{
            productId: selectedProductId,
            quantity: parsedQuantity,
            unitCost: Number(unitCost) || 0,
            direction,
            countedQuantity: movementType === 'CONTEO' ? Number(countedQuantity) : undefined
          }]
        })
      });
      if (postImmediately) await api(`/api/inventory/documents/${data.document.id}/post`, { method: 'POST', body: '{}' });
      setNotice(postImmediately ? 'Documento contabilizado y saldo actualizado.' : 'Borrador guardado; todavía no afecta existencias.');
      await loadData(warehouseId);
    } catch (operationError: any) {
      setError(operationError.message);
    }
  };

  const postDocument = async (documentId: string) => {
    try {
      await api(`/api/inventory/documents/${documentId}/post`, { method: 'POST', body: '{}' });
      setNotice('Documento contabilizado.');
      await loadData(warehouseId);
    } catch (operationError: any) { setError(operationError.message); }
  };

  const reverseDocument = async (documentId: string) => {
    try {
      await api(`/api/inventory/documents/${documentId}/reverse`, { method: 'POST', body: JSON.stringify({ idempotencyKey: `reverse-${documentId}-${crypto.randomUUID()}` }) });
      setNotice('Reversa contabilizada; el documento original permanece como antecedente.');
      await loadData(warehouseId);
    } catch (operationError: any) { setError(operationError.message); }
  };

  const viewDocument = async (documentId: string) => {
    try {
      setError('');
      setSelectedDocument(await api(`/api/inventory/documents/${documentId}`));
    } catch (operationError: any) { setError(operationError.message); }
  };

  const saveReplenishment = async (item: any) => {
    const draft = replenishmentDrafts[item.product_id];
    if (!draft) return;
    try {
      await api('/api/inventory/replenishment', {
        method: 'POST',
        body: JSON.stringify({
          productId: item.product_id,
          minimumStock: Number(draft.minimumStock),
          maximumStock: Number(draft.maximumStock),
          reorderQuantity: Number(draft.reorderQuantity)
        })
      });
      setNotice('Parámetros de reposición guardados.');
      await loadData(warehouseId);
    } catch (operationError: any) { setError(operationError.message); }
  };

  const createWarehouse = async () => {
    try {
      await api('/api/inventory/warehouses', { method: 'POST', body: JSON.stringify(newWarehouse) });
      setNewWarehouse({ id: '', code: '', name: '' });
      setShowWarehouseForm(false);
      setNotice('Bodega guardada y asignada a la sesión actual.');
      await loadData(warehouseId);
    } catch (operationError: any) { setError(operationError.message); }
  };

  if (!sessionToken) return <div className="p-6 rounded-2xl border border-red-900 bg-red-950/20 text-red-200">La sesión de inventario del servidor no está disponible.</div>;

  return (
    <div className="space-y-5">
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4 flex flex-col xl:flex-row gap-4 xl:items-center xl:justify-between">
        <div>
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2"><Package className="text-[#00ff41]" />{actionTitle[activeSubAction || 'entradas'] || 'Catálogo e inventario'}</h2>
          <p className="text-xs text-zinc-400 mt-1">Libro de movimientos, saldos por bodega y documentos contabilizados.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={warehouseId} onChange={event => setWarehouseId(event.target.value)} className="bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white">
            {warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
          </select>
          <button type="button" onClick={() => setShowWarehouseForm(value => !value)} className="px-3 py-2 rounded-xl border border-zinc-700 text-xs font-bold text-zinc-200 hover:border-[#00ff41]"><Warehouse size={14} className="inline mr-1" />Bodegas</button>
          <button type="button" onClick={() => void loadData(warehouseId)} className="p-2 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white" title="Actualizar"><RefreshCw size={15} /></button>
        </div>
      </div>

      {showWarehouseForm && <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2">
        <input value={newWarehouse.id} onChange={event => setNewWarehouse({ ...newWarehouse, id: event.target.value })} placeholder="Identificador" className="bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs" />
        <input value={newWarehouse.code} onChange={event => setNewWarehouse({ ...newWarehouse, code: event.target.value })} placeholder="Código" className="bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs" />
        <input value={newWarehouse.name} onChange={event => setNewWarehouse({ ...newWarehouse, name: event.target.value })} placeholder="Nombre de bodega" className="bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs" />
        <button type="button" onClick={() => void createWarehouse()} className="bg-[#00ff41] text-black rounded-xl px-3 py-2 text-xs font-black"><Plus size={14} className="inline mr-1" />Guardar bodega</button>
      </div>}

      <div className="flex flex-wrap gap-2">
        {[['movimientos', 'Movimientos'], ['kardex', 'Kardex'], ['conteos', 'Conteos'], ['reposicion', 'Reposición'], ['auditoria', 'Auditoría']].map(([id, label]) => <button key={id} type="button" onClick={() => setSection(id)} className={`px-3 py-2 rounded-xl text-xs font-bold border ${section === id ? 'bg-[#00ff41] text-black border-[#00ff41]' : 'bg-[#121217] text-zinc-300 border-zinc-800'}`}>{label}</button>)}
      </div>

      {notice && <div className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/30 text-emerald-300 text-xs font-bold"><CheckCircle2 size={15} className="inline mr-1" />{notice}</div>}
      {error && <div className="p-3 rounded-xl border border-red-800 bg-red-950/30 text-red-300 text-xs font-bold"><AlertTriangle size={15} className="inline mr-1" />{error}</div>}

      {section === 'movimientos' || section === 'conteos' ? <>
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <label className="text-[11px] text-zinc-400 font-bold xl:col-span-2">Tipo de documento<select value={movementType} onChange={event => setMovementType(event.target.value as any)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"><option value="ENTRADA">Entrada</option><option value="EGRESO">Egreso</option><option value="TRANSFERENCIA">Transferencia</option><option value="AJUSTE">Ajuste</option><option value="CONTEO">Conteo físico</option></select></label>
          <label className="text-[11px] text-zinc-400 font-bold xl:col-span-2">Producto<select value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"><option value="">Seleccione</option>{products.map(product => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}</select></label>
          <label className="text-[11px] text-zinc-400 font-bold">Cantidad<input type="number" min="0.001" step="0.001" value={quantity} onChange={event => setQuantity(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white" /></label>
          <label className="text-[11px] text-zinc-400 font-bold">Costo unitario<input type="number" min="0" step="0.000001" value={unitCost} onChange={event => setUnitCost(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white" /></label>
          {movementType === 'CONTEO' && <label className="text-[11px] text-zinc-400 font-bold">Cantidad contada<input type="number" min="0" step="0.001" value={countedQuantity} onChange={event => setCountedQuantity(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white" /></label>}
          {movementType === 'AJUSTE' && <label className="text-[11px] text-zinc-400 font-bold">Sentido<select value={direction} onChange={event => setDirection(Number(event.target.value) as 1 | -1)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"><option value="1">Aumenta</option><option value="-1">Disminuye</option></select></label>}
          {movementType === 'TRANSFERENCIA' && <label className="text-[11px] text-zinc-400 font-bold xl:col-span-2">Bodega destino<select value={destinationWarehouseId} onChange={event => setDestinationWarehouseId(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"><option value="">Seleccione</option>{warehouses.filter(warehouse => warehouse.id !== warehouseId).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>}
          <div className="flex gap-2 items-end xl:col-span-2"><button type="button" onClick={() => void createDocument(false)} className="flex-1 px-3 py-2 rounded-xl border border-zinc-700 text-xs font-black text-zinc-200"><Save size={14} className="inline mr-1" />Borrador</button><button type="button" onClick={() => void createDocument(true)} className="flex-1 px-3 py-2 rounded-xl bg-[#00ff41] text-black text-xs font-black"><CheckCircle2 size={14} className="inline mr-1" />Contabilizar</button></div>
        </div>
        <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden"><div className="p-4 border-b border-zinc-800 font-bold text-sm">Documentos de inventario</div><div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-[#181820] text-zinc-400"><tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Estado</th><th className="p-3">Líneas</th><th className="p-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-zinc-800">{documents.map(document => <tr key={document.id}><td className="p-3 text-zinc-400">{new Date(document.created_at).toLocaleString('es-EC')}</td><td className="p-3 font-bold">{document.type}</td><td className="p-3"><span className={`px-2 py-1 rounded-lg text-[10px] font-black ${document.status === 'CONTABILIZADO' ? 'bg-emerald-950 text-emerald-300' : document.status === 'REVERSADO' ? 'bg-red-950 text-red-300' : 'bg-amber-950 text-amber-300'}`}>{document.status}</span></td><td className="p-3">{document.line_count}</td><td className="p-3 text-right space-x-2"><button type="button" onClick={() => void viewDocument(document.id)} className="text-cyan-300 font-bold">Ver documento</button>{document.status === 'BORRADOR' && <button type="button" onClick={() => void postDocument(document.id)} className="text-emerald-300 font-bold">Contabilizar</button>}{document.status === 'CONTABILIZADO' && <button type="button" onClick={() => void reverseDocument(document.id)} className="text-red-300 font-bold">Reversar</button>}</td></tr>)}</tbody></table></div></div>
        {selectedDocument && <div className="bg-[#121217] border border-cyan-900/70 rounded-2xl p-4 space-y-3"><div className="flex items-center justify-between gap-2"><div><div className="text-sm font-bold">Documento {selectedDocument.document_number || selectedDocument.id}</div><div className="text-[11px] text-zinc-400">{selectedDocument.type} · {selectedDocument.status} · Bodega {selectedDocument.warehouse_id}</div></div><button type="button" onClick={() => setSelectedDocument(null)} className="text-xs text-zinc-400 hover:text-white">Cerrar</button></div>{selectedDocument.source_document_id && <div className="text-xs text-cyan-300">Origen: <button type="button" onClick={() => void viewDocument(selectedDocument.source_document_id)} className="underline font-bold">{selectedDocument.source_document_number || selectedDocument.source_document_id}</button></div>}<div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-400"><tr><th className="py-2">Producto</th><th className="py-2 text-right">Cantidad</th><th className="py-2 text-right">Costo</th><th className="py-2 text-right">Movimientos Kardex</th></tr></thead><tbody className="divide-y divide-zinc-800">{selectedDocument.lines?.map((line: any) => <tr key={line.id}><td className="py-2">{line.code} · {line.name}</td><td className="py-2 text-right">{Number(line.quantity).toFixed(3)}</td><td className="py-2 text-right">${Number(line.unit_cost || 0).toFixed(4)}</td><td className="py-2 text-right">{selectedDocument.ledger?.filter((entry: any) => entry.document_line_id === line.id).length || 0}</td></tr>)}</tbody></table></div></div>}
      </> : section === 'kardex' ? <div className="space-y-4"><div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 md:items-end"><label className="text-[11px] text-zinc-400 font-bold flex-1">Producto<select value={selectedProductId} onChange={event => setSelectedProductId(event.target.value)} className="mt-1 w-full bg-[#0a0a0d] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white"><option value="">Seleccione</option>{products.map(product => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}</select></label><div className="text-xs text-zinc-300">Saldo actual: <strong className="text-[#00ff41]">{selectedBalance?.stock || 0} {selectedBalance ? 'u.' : ''}</strong> · Costo promedio: <strong>${Number(selectedBalance?.average_cost || 0).toFixed(4)}</strong></div></div><div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-[#181820] text-zinc-400"><tr><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Movimiento</th><th className="p-3 text-right">Delta</th><th className="p-3 text-right">Saldo</th><th className="p-3 text-right">Costo</th></tr></thead><tbody className="divide-y divide-zinc-800">{kardex.map(item => <tr key={item.id}><td className="p-3 text-zinc-400">{new Date(item.created_at).toLocaleString('es-EC')}</td><td className="p-3 font-mono">{item.document_number || item.document_id}</td><td className="p-3">{item.movement_type}</td><td className={`p-3 text-right font-bold ${item.quantity_delta < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{Number(item.quantity_delta).toFixed(3)}</td><td className="p-3 text-right font-bold">{Number(item.running_stock).toFixed(3)}</td><td className="p-3 text-right">${Number(item.running_average_cost).toFixed(4)}</td></tr>)}</tbody></table></div></div> : section === 'reposicion' ? <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-auto"><div className="p-4 border-b border-zinc-800 font-bold">Parámetros de reposición</div><table className="w-full text-left text-xs"><thead className="bg-[#181820] text-zinc-400"><tr><th className="p-3">Producto</th><th className="p-3 text-right">Stock</th><th className="p-3 text-right">Mínimo</th><th className="p-3 text-right">Máximo</th><th className="p-3 text-right">Reponer</th><th className="p-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-zinc-800">{replenishment.map(item => { const draft = replenishmentDrafts[item.product_id] || { minimumStock: '0', maximumStock: '0', reorderQuantity: '0' }; return <tr key={item.product_id}><td className="p-3 font-bold">{item.code} · {item.name}</td><td className="p-3 text-right">{Number(item.stock || 0).toFixed(3)}</td><td className="p-2"><input aria-label={`Mínimo ${item.code}`} type="number" min="0" step="0.001" value={draft.minimumStock} onChange={event => setReplenishmentDrafts(current => ({ ...current, [item.product_id]: { ...draft, minimumStock: event.target.value } }))} className="w-24 bg-[#0a0a0d] border border-zinc-700 rounded-lg px-2 py-1 text-right" /></td><td className="p-2"><input aria-label={`Máximo ${item.code}`} type="number" min="0" step="0.001" value={draft.maximumStock} onChange={event => setReplenishmentDrafts(current => ({ ...current, [item.product_id]: { ...draft, maximumStock: event.target.value } }))} className="w-24 bg-[#0a0a0d] border border-zinc-700 rounded-lg px-2 py-1 text-right" /></td><td className="p-2"><input aria-label={`Reponer ${item.code}`} type="number" min="0" step="0.001" value={draft.reorderQuantity} onChange={event => setReplenishmentDrafts(current => ({ ...current, [item.product_id]: { ...draft, reorderQuantity: event.target.value } }))} className="w-24 bg-[#0a0a0d] border border-zinc-700 rounded-lg px-2 py-1 text-right" /></td><td className="p-3 text-right"><button type="button" onClick={() => void saveReplenishment(item)} className="text-emerald-300 font-bold">Guardar</button></td></tr> })}</tbody></table></div> : <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-auto"><div className="p-4 border-b border-zinc-800 font-bold flex items-center gap-2"><ShieldCheck size={16} className="text-cyan-300" />Auditoría de inventario</div><table className="w-full text-left text-xs"><thead className="bg-[#181820] text-zinc-400"><tr><th className="p-3">Fecha</th><th className="p-3">Usuario</th><th className="p-3">Acción</th><th className="p-3">Entidad</th></tr></thead><tbody className="divide-y divide-zinc-800">{audit.map(item => <tr key={item.id}><td className="p-3 text-zinc-400">{new Date(item.created_at).toLocaleString('es-EC')}</td><td className="p-3 font-mono">{item.user_id}</td><td className="p-3">{item.action}</td><td className="p-3">{item.entity_type} · {item.entity_id}</td></tr>)}</tbody></table></div>}

      {section === 'movimientos' && <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-4"><div className="flex items-center gap-2 text-sm font-bold"><History size={16} className="text-cyan-300" />Saldos actuales de la bodega</div><div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">{balances.slice(0, 6).map(item => <button type="button" key={item.product_id} onClick={() => { setSelectedProductId(item.product_id); setSection('kardex'); }} className="text-left p-3 rounded-xl border border-zinc-800 hover:border-cyan-500"><div className="text-[10px] text-zinc-500 font-mono">{item.code}</div><div className="text-xs font-bold text-white">{item.name}</div><div className="text-sm font-black text-[#00ff41] mt-1">{Number(item.stock).toFixed(3)} u.</div></button>)}</div></div>}
    </div>
  );
};
