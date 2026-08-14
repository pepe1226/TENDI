import React, { useEffect, useRef, useState } from 'react';
import { consultarClienteExterno } from '../lib/ecuadorValidador';
import {
  Building2,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  Filter,
  Check,
  CheckSquare,
  Square,
  Shield,
  Smartphone,
  Globe,
  Database,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { Company } from '../types';

export interface ExtendedCompany extends Company {
  id: string;
  idType: 'RUC' | 'CEDULA' | 'PASAPORTE';
  appMovil?: boolean;
  accesoWeb?: boolean;
  dbName?: string;
  phone?: string;
  email?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  active: boolean;
}

interface GestionEmpresasProps {
  companiesList?: ExtendedCompany[];
  selectedCompanyId?: string;
  onSelectCompany?: (comp: ExtendedCompany) => void;
  onSaveCompany?: (comp: ExtendedCompany) => void;
  onDeleteCompany?: (id: string) => void;
}

export const GestionEmpresas: React.FC<GestionEmpresasProps> = ({
  companiesList = [],
  selectedCompanyId,
  onSelectCompany,
  onSaveCompany,
  onDeleteCompany
}) => {
  const initialCompanies: ExtendedCompany[] = companiesList.length > 0 ? companiesList : [
    {
      id: '3',
      name: 'MARCOS CHUNGA',
      tradeName: 'TMCH CAMPOZANO',
      ruc: '1304149329',
      idType: 'CEDULA',
      environment: 'PRUEBAS',
      establishment: '',
      emissionPoint: '',
      address: '',
      phone: '',
      email: '',
      active: true,
      appMovil: false,
      accesoWeb: false,
      dbName: 'tenant_3',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-3',
      baseOrigen: 'tenant_3'
    },
    {
      id: '5',
      name: 'CHUNGA LOPEZ NASTHAR JULIANA',
      tradeName: 'TMCH ESQUINA',
      ruc: '1314229749001',
      idType: 'RUC',
      environment: 'PRUEBAS',
      establishment: '',
      emissionPoint: '',
      address: '',
      phone: '',
      email: '',
      active: true,
      appMovil: false,
      accesoWeb: false,
      dbName: 'tenant_5',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-5',
      baseOrigen: 'tenant_5'
    },
    {
      id: '6',
      name: 'PARRALES PIN JOSE ARSENIO',
      tradeName: 'TMCH DISTRIBUCIONES',
      ruc: '1315398154001',
      idType: 'RUC',
      environment: 'PRUEBAS',
      establishment: '',
      emissionPoint: '',
      address: '',
      phone: '',
      email: '',
      active: true,
      appMovil: false,
      accesoWeb: false,
      dbName: 'tenant_6',
      systemDb: 'tendi_system',
      empresaId: 'TENDI-6',
      baseOrigen: 'tenant_6'
    }
  ];

  const [companies, setCompanies] = useState<ExtendedCompany[]>(initialCompanies);
  const [activeFilter, setActiveFilter] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [selectedId, setSelectedId] = useState<string>(selectedCompanyId || initialCompanies[0]?.id || '');
  const [mode, setMode] = useState<'VIEW' | 'NEW' | 'EDIT'>('VIEW');

  const selectedCompany = companies.find(c => c.id === selectedId) || companies[0];

  const [formData, setFormData] = useState<Partial<ExtendedCompany>>({ ...selectedCompany });
  const [isSearchingRuc, setIsSearchingRuc] = useState(false);
  const [lookupNotice, setLookupNotice] = useState<string | null>(null);
  const lookupRequestRef = useRef(0);

  useEffect(() => {
    if (companiesList.length > 0) {
      setCompanies(companiesList);
      const nextSelectedId = selectedCompanyId || companiesList[0]?.id || '';
      setSelectedId(nextSelectedId);
      const nextSelected = companiesList.find(company => company.id === nextSelectedId) || companiesList[0];
      if (nextSelected) setFormData({ ...nextSelected });
      setMode('VIEW');
    }
  }, [companiesList, selectedCompanyId]);

  const handleLookupRuc = async (idNum: string) => {
    const clean = (idNum || '').trim().replace(/\D/g, '');
    if (clean.length !== 10 && clean.length !== 13) return;

    const requestId = ++lookupRequestRef.current;

    setIsSearchingRuc(true);
    setLookupNotice(null);

    try {
      const res = await consultarClienteExterno(clean);
      if (requestId !== lookupRequestRef.current) return;
      if (res.found && res.data) {
        const companyName = res.data.name || '';
        setFormData(prev => ({
          ...prev,
          name: companyName,
          tradeName: res.data!.companyName || companyName,
          address: res.data!.address || prev.address || '',
          email: res.data!.email || prev.email || '',
          idType: res.data!.idType || (clean.length === 13 ? 'RUC' : 'CEDULA')
        }));
        setLookupNotice(null);
      } else {
        setLookupNotice(res.error || res.message || 'Complete los datos manualmente.');
      }
    } catch {
      setLookupNotice('No se pudo completar la búsqueda. Ingrese los datos manualmente.');
    } finally {
      if (requestId === lookupRequestRef.current) setIsSearchingRuc(false);
    }
  };

  const handleSelectCompany = (comp: ExtendedCompany) => {
    setSelectedId(comp.id);
    setFormData({ ...comp });
    setMode('VIEW');
    if (onSelectCompany) {
      onSelectCompany(comp);
    }
  };

  const handleStartNew = () => {
    const newComp: Partial<ExtendedCompany> = {
      id: String(Date.now()),
      idType: 'RUC',
      ruc: '',
      name: '',
      tradeName: '',
      active: true,
      appMovil: false,
      accesoWeb: false,
      dbName: '',
      environment: 'PRUEBAS',
      establishment: '',
      emissionPoint: '',
      createdBy: '',
      createdAt: new Date().toLocaleString('es-EC'),
      updatedBy: '',
      updatedAt: new Date().toLocaleString('es-EC')
    };
    setFormData(newComp);
    setMode('NEW');
  };

  const handleStartEdit = () => {
    if (!selectedCompany) return;
    setFormData({ ...selectedCompany });
    setMode('EDIT');
  };

  const handleSave = () => {
    if (!formData.name || !formData.name.trim()) {
      alert('Debe ingresar la Razón Social de la Empresa');
      return;
    }

    if (!formData.ruc || !formData.ruc.trim()) {
      alert('Debe ingresar el número de Identificación (RUC)');
      return;
    }

    const saved: ExtendedCompany = {
      id: formData.id || String(Date.now()),
      idType: formData.idType || 'RUC',
      ruc: formData.ruc.trim(),
      name: formData.name.toUpperCase().trim(),
      tradeName: (formData.tradeName || formData.name).toUpperCase().trim(),
      active: formData.active !== false,
      appMovil: !!formData.appMovil,
      accesoWeb: !!formData.accesoWeb,
      dbName: formData.dbName || '',
      systemDb: formData.systemDb || 'tendi_system',
      empresaId: formData.empresaId || '',
      baseOrigen: formData.baseOrigen || formData.dbName || '',
      environment: formData.environment || 'PRUEBAS',
      establishment: formData.establishment || '',
      emissionPoint: formData.emissionPoint || '',
      address: formData.address || '',
      phone: formData.phone || '',
      email: formData.email || '',
      createdBy: formData.createdBy || '',
      createdAt: formData.createdAt || new Date().toLocaleString('es-EC'),
      updatedBy: '',
      updatedAt: new Date().toLocaleString('es-EC')
    };

    let updatedList: ExtendedCompany[];
    if (mode === 'NEW') {
      updatedList = [...companies, saved];
    } else {
      updatedList = companies.map(c => c.id === saved.id ? saved : c);
    }

    setCompanies(updatedList);
    setSelectedId(saved.id);
    setMode('VIEW');

    if (onSaveCompany) {
      onSaveCompany(saved);
    }
  };

  const handleDelete = () => {
    if (!selectedCompany) return;
    if (companies.length <= 1) {
      alert('No se puede eliminar la última empresa registrada. Cree otra empresa antes de eliminar esta.');
      return;
    }
    if (confirm(`¿Desea desactivar la empresa ${selectedCompany.tradeName || selectedCompany.name}?`)) {
      const updatedList = companies.filter(c => c.id !== selectedCompany.id);
      const nextCompany = updatedList[0];
      setCompanies(updatedList);
      setSelectedId(nextCompany?.id || '');
      setFormData(nextCompany ? { ...nextCompany } : {});
      setMode('VIEW');
      if (onDeleteCompany) {
        onDeleteCompany(selectedCompany.id);
      }
    }
  };

  const filteredCompanies = companies.filter(c => activeFilter === 'ACTIVE' ? c.active : !c.active);

  return (
    <div className="bg-[#181820] border border-zinc-700/80 rounded-lg overflow-hidden font-sans text-xs text-zinc-200 shadow-2xl max-w-6xl mx-auto">
      {/* 1. WINDOW TITLE TAB */}
      <div className="bg-[#121217] border-b border-zinc-700/80 px-3 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-zinc-800 border border-zinc-600/80 px-3 py-1 rounded-t text-zinc-100 font-bold text-xs flex items-center gap-2 shadow-inner">
            <Building2 size={14} className="text-amber-400" />
            <span>Gestión de Empresas</span>
            <span className="text-zinc-500 hover:text-white cursor-pointer ml-1 font-mono font-bold">×</span>
          </div>
        </div>
      </div>

      {/* 2. TOP CONTROLS & RIBBON BAR */}
      <div className="p-3 bg-[#202028] border-b border-zinc-700/80 flex flex-wrap items-center justify-between gap-3">
        {/* Active / Inactive Radio Group */}
        <div className="flex items-center gap-4 text-xs font-medium text-zinc-200">
          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="radio"
              name="company_status"
              checked={activeFilter === 'ACTIVE'}
              onChange={() => setActiveFilter('ACTIVE')}
              className="accent-amber-500"
            />
            <span>Ver Empresas Activas</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer hover:text-white">
            <input
              type="radio"
              name="company_status"
              checked={activeFilter === 'INACTIVE'}
              onChange={() => setActiveFilter('INACTIVE')}
              className="accent-amber-500"
            />
            <span>Ver Empresas Inactivas</span>
          </label>
        </div>

        {/* Action Buttons (Exact visual styling as screenshot) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={handleStartNew}
            className="flex items-center gap-1 bg-gradient-to-b from-orange-500 to-amber-600 hover:from-orange-400 hover:to-amber-500 text-white font-bold px-3 py-1 rounded border border-amber-400/50 shadow transition-all cursor-pointer active:scale-95 text-xs"
          >
            <span>Nuevo</span>
            <Plus size={14} />
          </button>

          <button
            onClick={handleStartEdit}
            disabled={mode !== 'VIEW' || !selectedCompany}
            className="flex items-center gap-1 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold px-3 py-1 rounded border border-blue-400/50 shadow transition-all cursor-pointer active:scale-95 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Modificar</span>
            <Edit3 size={13} />
          </button>

          <button
            onClick={handleDelete}
            disabled={mode !== 'VIEW' || !selectedCompany}
            className="flex items-center gap-1 bg-gradient-to-b from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold px-3 py-1 rounded border border-red-400/50 shadow transition-all cursor-pointer active:scale-95 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Eliminar</span>
            <Trash2 size={13} />
          </button>

          <button
            onClick={handleSave}
            disabled={mode === 'VIEW'}
            className="flex items-center gap-1 bg-zinc-700 disabled:bg-zinc-800/60 text-zinc-100 disabled:text-zinc-500 font-bold px-3 py-1 rounded border border-zinc-600/50 shadow transition-all text-xs disabled:cursor-not-allowed"
          >
            <span>Guardar</span>
            <Save size={13} />
          </button>

          <button
            onClick={() => {
              setMode('VIEW');
              if (selectedCompany) setFormData({ ...selectedCompany });
            }}
            disabled={mode === 'VIEW'}
            className="flex items-center gap-1 bg-zinc-700 disabled:bg-zinc-800/60 text-zinc-100 disabled:text-zinc-500 font-bold px-3 py-1 rounded border border-zinc-600/50 shadow transition-all text-xs disabled:cursor-not-allowed"
          >
            <span>Cancelar</span>
            <X size={13} />
          </button>

        </div>
      </div>

      {/* 3. MAIN SPLIT BODY */}
      <div className="grid grid-cols-1 md:grid-cols-12 min-h-[380px] bg-[#181820]">
        {/* LEFT COLUMN: TABLE OF COMPANIES (4 COLS) */}
        <div className="md:col-span-4 border-r border-zinc-700/80 bg-[#121217] flex flex-col">
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#202028] text-zinc-300 font-bold border-b border-zinc-700">
                <tr>
                  <th className="p-2 border-r border-zinc-700">
                    <div className="flex items-center justify-between">
                      <span>Empresa</span>
                      <Filter size={12} className="text-zinc-400" />
                    </div>
                  </th>
                  <th className="p-2 w-16 text-center">
                    <span>Activa</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80 font-sans">
                {filteredCompanies.map((comp) => {
                  const isSelected = comp.id === selectedId;
                  return (
                    <tr
                      key={comp.id}
                      onClick={() => handleSelectCompany(comp)}
                      className={`cursor-pointer select-none transition-colors ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 font-bold border-l-4 border-amber-500'
                          : 'hover:bg-zinc-800/60 text-zinc-200'
                      }`}
                    >
                      <td className="p-2.5 font-semibold text-xs uppercase tracking-tight">
                        {comp.tradeName || comp.name}
                      </td>
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={comp.active}
                          readOnly
                          className="accent-amber-500 rounded cursor-pointer"
                        />
                      </td>
                    </tr>
                  );
                })}

                {filteredCompanies.length === 0 && (
                  <tr>
                    <td colSpan={2} className="p-4 text-center text-zinc-500 italic">
                      No hay empresas {activeFilter === 'ACTIVE' ? 'activas' : 'inactivas'} registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: FORM DETAILS (8 COLS) */}
        <div className="md:col-span-8 p-6 bg-[#181820] space-y-4 font-sans">
          <div className="space-y-4 max-w-2xl">
            {/* ROW 1: TIPO IDENTIFICACION */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Tipo Identificación :
              </label>
              <div className="col-span-9">
                <select
                  disabled={mode === 'VIEW'}
                  value={formData.idType || 'RUC'}
                  onChange={(e) => setFormData({ ...formData, idType: e.target.value as any })}
                  className="bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-80 w-36"
                >
                  <option value="RUC">RUC</option>
                  <option value="CEDULA">CEDULA</option>
                  <option value="PASAPORTE">PASAPORTE</option>
                </select>
              </div>
            </div>

            {/* ROW 2: IDENTIFICACION + CHECKBOXES */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Identificación :
              </label>
              <div className="col-span-9 flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.ruc || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    lookupRequestRef.current += 1;
                    setFormData({ ...formData, ruc: val });
                    setLookupNotice(null);
                  }}
                  onBlur={() => handleLookupRuc(formData.ruc || '')}
                  placeholder="RUC (13 dig) / Cédula (10 dig)"
                  className="bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono font-bold text-amber-400 outline-none focus:border-amber-500 disabled:opacity-80 w-44"
                />

                {mode !== 'VIEW' && (
                  <button
                    type="button"
                    onClick={() => handleLookupRuc(formData.ruc || '')}
                    disabled={isSearchingRuc || !formData.ruc || formData.ruc.length < 10}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-1 rounded transition-all cursor-pointer disabled:opacity-40"
                  >
                    {isSearchingRuc ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    <span>Buscar</span>
                  </button>
                )}

                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200">
                  <input
                    type="checkbox"
                    disabled={mode === 'VIEW'}
                    checked={formData.active !== false}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Estado</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200">
                  <input
                    type="checkbox"
                    disabled={mode === 'VIEW'}
                    checked={!!formData.appMovil}
                    onChange={(e) => setFormData({ ...formData, appMovil: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>App Móvil</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-200">
                  <input
                    type="checkbox"
                    disabled={mode === 'VIEW'}
                    checked={!!formData.accesoWeb}
                    onChange={(e) => setFormData({ ...formData, accesoWeb: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Acceso Web</span>
                </label>

                {lookupNotice && (
                  <p className="w-full text-[10px] font-mono text-amber-300 bg-amber-950/40 px-2 py-1 rounded border border-amber-800/40 mt-1">
                    {lookupNotice}
                  </p>
                )}
              </div>
            </div>

            {/* ROW 3: RAZON SOCIAL */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Razón Social :
              </label>
              <div className="col-span-9">
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="MARCOS CHUNGA"
                  className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-80 uppercase"
                />
              </div>
            </div>

            {/* ROW 4: NOMBRE COMERCIAL */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Nombre Comercial :
              </label>
              <div className="col-span-9">
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.tradeName || ''}
                  onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                  placeholder="TMCH CAMPOZANO"
                  className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-80 uppercase"
                />
              </div>
            </div>

            {/* ROW 5: NOMBRE BASE DE DATOS */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Base de Datos Operativa :
              </label>
              <div className="col-span-9">
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.dbName || ''}
                  onChange={(e) => setFormData({ ...formData, dbName: e.target.value, baseOrigen: e.target.value })}
                  placeholder="Base de datos de origen"
                  className="w-full bg-[#121217] border border-zinc-600 rounded px-2.5 py-1 text-xs font-mono font-bold text-amber-400 outline-none focus:border-amber-500 disabled:opacity-80"
                />
              </div>
            </div>

            {/* ROW 6: ARCHITECTURE & CLOUD CONSOLIDATION */}
            <div className="grid grid-cols-12 items-center gap-2">
              <label className="col-span-3 text-right pr-2 text-zinc-300 font-medium">
                Base Sistema / Consolidación :
              </label>
              <div className="col-span-9 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">Base Sistema (Nivel 1):</span>
                  <input
                    type="text"
                    readOnly
                    value={formData.systemDb || 'tendi_system'}
                    className="w-full bg-[#121217] border border-zinc-700 rounded px-2 py-1 text-xs font-mono text-emerald-400 outline-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block mb-0.5">empresaId (Consolidación Nube):</span>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.empresaId || ''}
                    onChange={(e) => setFormData({ ...formData, empresaId: e.target.value })}
                  placeholder="Identificador de empresa"
                    className="w-full bg-[#121217] border border-zinc-600 rounded px-2 py-1 text-xs font-mono text-cyan-400 outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* ARCHITECTURE SUMMARY BOX */}
            <div className="hidden">
              <div className="flex items-center gap-1.5 font-bold text-amber-400">
                <Database size={13} />
                <span>Arquitectura Multiempresa TENDI & Consolidación en la Nube</span>
              </div>
              <p className="text-zinc-400 text-[10px] leading-relaxed">
                Nivel 1 (<strong className="text-emerald-400">tendi_system</strong>): Administra usuarios, empresas, licencias, permisos, módulos y registros globales.
                <br />
                Nivel 2 (Bases Operativas): Conmutación completa de contexto (<strong className="text-amber-300">{formData.dbName || '7791163287_db...'}</strong>). Facturas, productos, stock, cajas y secuenciales 100% aislados.
                <br />
                Consolidación Nube: Registros etiquetados con <strong className="text-cyan-400">empresaId</strong> y <strong className="text-cyan-400">baseOrigen</strong> para evitar colisiones de ID entre sucursales.
              </p>
            </div>

            {/* SEPARATOR BAND LIKE IN SCREENSHOT */}
            <div className="h-4 bg-zinc-800/60 rounded border border-zinc-700/60 my-2" />
          </div>
        </div>
      </div>

      {/* 4. Footer audit status bar */}
      <div className="bg-[#121217] border-t border-zinc-700/80 px-4 py-2 flex flex-wrap items-center justify-start gap-x-8 gap-y-2 text-xs font-mono text-zinc-400">
        <div className="flex items-center gap-2">
          <span>Creación :</span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-white font-bold">
            {formData.createdBy || selectedCompany?.createdBy || 'SIN CONFIGURAR'}
          </span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-zinc-300">
            {formData.createdAt || selectedCompany?.createdAt || 'SIN CONFIGURAR'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>Modificación :</span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-white font-bold">
            {formData.updatedBy || selectedCompany?.updatedBy || 'SIN CONFIGURAR'}
          </span>
          <span className="bg-[#181820] border border-zinc-700 px-2 py-0.5 rounded text-zinc-300">
            {formData.updatedAt || selectedCompany?.updatedAt || 'SIN CONFIGURAR'}
          </span>
        </div>
      </div>
    </div>
  );
};
