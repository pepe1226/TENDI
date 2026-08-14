import React, { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Plus, Save, Store, X, XCircle } from 'lucide-react';
import { Company } from './src/types';

interface EmissionPoint {
  code: string;
  name: string;
  active: boolean;
}

interface Establishment {
  id: string;
  code: string;
  name: string;
  address: string;
  active: boolean;
  points: EmissionPoint[];
}

interface GestionEstablecimientosProps {
  company: Company;
}

const emptyEstablishment = (): Establishment => ({
  id: `est-${Date.now()}`,
  code: '',
  name: '',
  address: '',
  active: true,
  points: []
});

export const GestionEstablecimientos: React.FC<GestionEstablecimientosProps> = ({ company }) => {
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [editing, setEditing] = useState<Establishment | null>(null);
  const [pointParentId, setPointParentId] = useState<string | null>(null);
  const [pointForm, setPointForm] = useState<EmissionPoint>({ code: '', name: '', active: true });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const storageKey = `tendi_establishments_${company.id}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setEstablishments(Array.isArray(parsed) ? parsed : []);
      } else if (company.establishment || company.emissionPoint) {
        setEstablishments([{
          id: `${company.id}-${company.establishment || '001'}`,
          code: company.establishment || '001',
          name: 'Matriz',
          address: company.address || '',
          active: true,
          points: company.emissionPoint ? [{ code: company.emissionPoint, name: 'Caja principal', active: true }] : []
        }]);
      } else {
        setEstablishments([]);
      }
    } catch {
      setEstablishments([]);
    }
    setEditing(null);
    setPointParentId(null);
    setNotice('');
  }, [company.id, company.establishment, company.emissionPoint, company.address]);

  const persist = (next: Establishment[], message: string) => {
    setEstablishments(next);
    localStorage.setItem(`tendi_establishments_${company.id}`, JSON.stringify(next));
    setNotice(message);
  };

  const saveEstablishment = () => {
    if (!editing) return;
    const code = editing.code.trim();
    const name = editing.name.trim();
    if (!/^\d{3}$/.test(code)) {
      setNotice('El código del establecimiento debe tener exactamente 3 dígitos.');
      return;
    }
    if (!name) {
      setNotice('Ingrese el nombre del establecimiento.');
      return;
    }
    if (establishments.some(item => item.id !== editing.id && item.code === code)) {
      setNotice(`El establecimiento ${code} ya existe.`);
      return;
    }
    const saved = { ...editing, code, name, address: editing.address.trim() };
    const exists = establishments.some(item => item.id === saved.id);
    persist(exists ? establishments.map(item => item.id === saved.id ? saved : item) : [...establishments, saved], 'Establecimiento guardado.');
    setEditing(null);
  };

  const savePoint = () => {
    const parent = establishments.find(item => item.id === pointParentId);
    const code = pointForm.code.trim();
    const name = pointForm.name.trim();
    if (!parent) return;
    if (!/^\d{3}$/.test(code)) {
      setNotice('El código del punto de emisión debe tener exactamente 3 dígitos.');
      return;
    }
    if (!name) {
      setNotice('Ingrese el nombre del punto de emisión.');
      return;
    }
    if (parent.points.some(point => point.code === code)) {
      setNotice(`El punto ${code} ya existe en el establecimiento ${parent.code}.`);
      return;
    }
    const next = establishments.map(item => item.id === parent.id
      ? { ...item, points: [...item.points, { ...pointForm, code, name }] }
      : item);
    persist(next, 'Punto de emisión guardado.');
    setPointParentId(null);
    setPointForm({ code: '', name: '', active: true });
  };

  const toggleEstablishment = (id: string) => {
    const target = establishments.find(item => item.id === id);
    if (!target) return;
    persist(establishments.map(item => item.id === id ? { ...item, active: !item.active } : item), target.active ? 'Establecimiento desactivado.' : 'Establecimiento reactivado.');
  };

  const togglePoint = (establishmentId: string, code: string) => {
    const next = establishments.map(item => item.id === establishmentId
      ? { ...item, points: item.points.map(point => point.code === code ? { ...point, active: !point.active } : point) }
      : item);
    persist(next, 'Estado del punto de emisión actualizado.');
  };

  return (
    <div className="bg-[#121217] border border-zinc-800 p-5 rounded-lg space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h3 className="font-bold text-sm text-zinc-200 flex items-center gap-2"><Store size={18} className="text-emerald-400" /> Establecimientos y puntos de emisión</h3>
        <button type="button" onClick={() => { setEditing(emptyEstablishment()); setNotice(''); }} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded text-xs flex items-center gap-1.5"><Plus size={14} /> Nuevo establecimiento</button>
      </div>

      {notice && <div role="status" className="border border-amber-700/50 bg-amber-950/30 text-amber-200 px-3 py-2 rounded text-xs font-bold">{notice}</div>}

      {editing && (
        <div className="border border-emerald-600/40 bg-[#0a0a0d] p-4 rounded space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs text-zinc-300 font-bold">Código
              <input value={editing.code} onChange={event => setEditing({ ...editing, code: event.target.value.replace(/\D/g, '').slice(0, 3) })} className="mt-1 w-full bg-[#181820] border border-zinc-700 rounded px-3 py-2 text-white font-mono" />
            </label>
            <label className="text-xs text-zinc-300 font-bold">Nombre
              <input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} className="mt-1 w-full bg-[#181820] border border-zinc-700 rounded px-3 py-2 text-white" />
            </label>
            <label className="text-xs text-zinc-300 font-bold">Dirección
              <input value={editing.address} onChange={event => setEditing({ ...editing, address: event.target.value })} className="mt-1 w-full bg-[#181820] border border-zinc-700 rounded px-3 py-2 text-white" />
            </label>
          </div>
          <div className="flex gap-2"><button type="button" onClick={saveEstablishment} className="bg-emerald-500 text-black font-bold px-4 py-2 rounded text-xs flex items-center gap-1"><Save size={14} /> Guardar</button><button type="button" onClick={() => setEditing(null)} className="bg-zinc-800 text-zinc-200 px-4 py-2 rounded text-xs flex items-center gap-1"><X size={14} /> Cancelar</button></div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {establishments.map(establishment => (
          <article key={establishment.id} className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div><strong className="text-white text-sm">{establishment.code} - {establishment.name}</strong><div className="text-[11px] text-zinc-500 mt-1">{establishment.address || 'Sin dirección registrada'}</div></div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded ${establishment.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>{establishment.active ? 'ACTIVO' : 'INACTIVO'}</span>
            </div>
            <div className="space-y-1.5">
              {establishment.points.map(point => (
                <div key={point.code} className="flex items-center justify-between border-t border-zinc-800 pt-2 text-xs"><span className={point.active ? 'text-zinc-300' : 'text-zinc-600'}><strong className="text-amber-400 font-mono">{point.code}</strong> {point.name}</span><button type="button" onClick={() => togglePoint(establishment.id, point.code)} title={point.active ? 'Desactivar punto' : 'Reactivar punto'} className="text-zinc-400 hover:text-white">{point.active ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</button></div>
              ))}
              {establishment.points.length === 0 && <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-2">Sin puntos de emisión.</div>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => setEditing({ ...establishment, points: [...establishment.points] })} className="bg-blue-600/20 text-blue-300 border border-blue-700 px-2.5 py-1.5 rounded text-xs flex items-center gap-1"><Edit3 size={13} /> Editar</button>
              <button type="button" onClick={() => { setPointParentId(establishment.id); setPointForm({ code: '', name: '', active: true }); setNotice(''); }} className="bg-amber-500/15 text-amber-300 border border-amber-700 px-2.5 py-1.5 rounded text-xs flex items-center gap-1"><Plus size={13} /> Punto</button>
              <button type="button" onClick={() => toggleEstablishment(establishment.id)} className="bg-zinc-800 text-zinc-300 border border-zinc-700 px-2.5 py-1.5 rounded text-xs">{establishment.active ? 'Desactivar' : 'Reactivar'}</button>
            </div>
            {pointParentId === establishment.id && (
              <div className="border-t border-zinc-800 pt-3 space-y-2"><div className="grid grid-cols-3 gap-2"><input value={pointForm.code} onChange={event => setPointForm({ ...pointForm, code: event.target.value.replace(/\D/g, '').slice(0, 3) })} placeholder="Código" className="bg-[#181820] border border-zinc-700 rounded px-2 py-1.5 text-white font-mono" /><input value={pointForm.name} onChange={event => setPointForm({ ...pointForm, name: event.target.value })} placeholder="Nombre del punto" className="col-span-2 bg-[#181820] border border-zinc-700 rounded px-2 py-1.5 text-white" /></div><div className="flex gap-2"><button type="button" onClick={savePoint} className="bg-amber-500 text-black font-bold px-3 py-1.5 rounded text-xs">Guardar punto</button><button type="button" onClick={() => setPointParentId(null)} className="bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded text-xs">Cancelar</button></div></div>
            )}
          </article>
        ))}
      </div>
      {establishments.length === 0 && <div className="text-center border border-dashed border-zinc-700 rounded p-8 text-zinc-500 text-xs">No hay establecimientos registrados para esta empresa.</div>}
    </div>
  );
};
