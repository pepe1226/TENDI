import React, { useRef, useState } from 'react';
import { consultarClienteExterno } from '../lib/ecuadorValidador';
import {
  Users,
  Search,
  Plus,
  Edit3,
  Trash2,
  Save,
  X,
  FileText,
  MapPin,
  Phone,
  Mail,
  CreditCard,
  Building2,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Download,
  BarChart3,
  UserCheck,
  ShieldAlert,
  HelpCircle,
  Image as ImageIcon,
  Globe,
  Layers,
  Check,
  RefreshCw,
  Sparkles
} from 'lucide-react';

export interface Customer {
  id: string;
  idType: 'CEDULA' | 'RUC' | 'PASAPORTE' | 'CONSUMIDOR_FINAL';
  ruc: string;
  name: string;
  tradeName?: string;
  email: string;
  phone: string;
  address: string;
  province?: string;
  city?: string;
  parish?: string;
  type: 'PERSONA_NATURAL' | 'PERSONA_JURIDICA';
  regimen?: 'GENERAL' | 'RIMPE_POPULAR' | 'RIMPE_EMPRENDEDOR' | 'CONTRIBUYENTE_ESPECIAL';
  accountingObligated?: boolean;
  retentionAgent?: boolean;
  creditLimit: number;
  creditDays: number;
  assignedPriceList: 'PVP' | 'MAYORISTA' | 'DISTRIBUIDOR' | 'ESPECIAL';
  vendor?: string;
  group?: string;
  active: boolean;
  guarantorName?: string;
  guarantorCedula?: string;
  guarantorPhone?: string;
  notes?: string;
  totalPurchased?: number;
  balanceDue?: number;
}

interface GestionClientesProps {
  clientsList?: Customer[];
  onSaveCustomer?: (cust: Customer) => void;
  onDeleteCustomer?: (id: string) => void;
}

// ECUADORIAN IDENTIFICATION VALIDATOR
export function validateEcuadorianId(type: string, idNumber: string): { isValid: boolean; message: string } {
  const cleanId = idNumber.trim();

  if (type === 'CONSUMIDOR_FINAL') {
    if (cleanId === '9999999999999' || cleanId === '9999999999') {
      return { isValid: true, message: 'Consumidor Final válido' };
    }
    return { isValid: false, message: 'Identificación de Consumidor Final debe ser 9999999999999' };
  }

  if (type === 'PASAPORTE') {
    if (cleanId.length >= 3 && cleanId.length <= 20) {
      return { isValid: true, message: 'Pasaporte válido' };
    }
    return { isValid: false, message: 'El pasaporte debe tener entre 3 y 20 caracteres' };
  }

  if (type === 'CEDULA') {
    if (!/^\d{10}$/.test(cleanId)) {
      return { isValid: false, message: 'La cédula ecuatoriana debe tener exactamente 10 dígitos numéricos' };
    }

    const prov = parseInt(cleanId.substring(0, 2), 10);
    if ((prov < 1 || prov > 24) && prov !== 30) {
      return { isValid: false, message: 'Código provincial inválido (primeros 2 dígitos)' };
    }

    const thirdDigit = parseInt(cleanId.charAt(2), 10);
    if (thirdDigit >= 6) {
      return { isValid: false, message: 'Tercer dígito inválido para cédula de persona natural' };
    }

    // Verify digit (Modulo 10)
    const coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      let val = parseInt(cleanId.charAt(i), 10) * coefs[i];
      if (val >= 10) val -= 9;
      sum += val;
    }
    const verifier = (Math.ceil(sum / 10) * 10) - sum;
    const lastDigit = parseInt(cleanId.charAt(9), 10);

    if ((verifier === 10 ? 0 : verifier) !== lastDigit) {
      return { isValid: false, message: 'Número de cédula ecuatoriana inválido (Dígito verificador incorrecto)' };
    }

    return { isValid: true, message: 'Cédula de ciudadanía ecuatoriana válida' };
  }

  if (type === 'RUC') {
    if (!/^\d{13}$/.test(cleanId)) {
      return { isValid: false, message: 'El RUC ecuatoriano debe tener exactamente 13 dígitos numéricos' };
    }

    const prov = parseInt(cleanId.substring(0, 2), 10);
    if ((prov < 1 || prov > 24) && prov !== 30) {
      return { isValid: false, message: 'Código provincial del RUC inválido (primeros 2 dígitos)' };
    }

    if (!cleanId.endsWith('001') && !cleanId.endsWith('002') && !cleanId.endsWith('003')) {
      return { isValid: false, message: 'El RUC debe finalizar en un establecimiento válido (ej: 001)' };
    }

    const thirdDigit = parseInt(cleanId.charAt(2), 10);

    // RUC Persona Natural (primeros 10 dígitos forman una cédula válida)
    if (thirdDigit < 6) {
      const cedulaPart = cleanId.substring(0, 10);
      const cedCheck = validateEcuadorianId('CEDULA', cedulaPart);
      if (!cedCheck.isValid) {
        return { isValid: false, message: 'RUC de Persona Natural no contiene una cédula válida: ' + cedCheck.message };
      }
      return { isValid: true, message: 'RUC de Persona Natural válido' };
    }

    // RUC Sociedad Privada o Extranjera (Tercer dígito = 9)
    if (thirdDigit === 9) {
      const coefs = [4, 3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(cleanId.charAt(i), 10) * coefs[i];
      }
      const rem = sum % 11;
      const verifier = rem === 0 ? 0 : 11 - rem;
      const tenthDigit = parseInt(cleanId.charAt(9), 10);
      if (verifier !== tenthDigit) {
        return { isValid: false, message: 'RUC de Sociedad Privada inválido (Dígito verificador falló)' };
      }
      return { isValid: true, message: 'RUC de Sociedad Privada / Extranjera válido' };
    }

    // RUC Entidad Pública (Tercer dígito = 6)
    if (thirdDigit === 6) {
      const coefs = [3, 2, 7, 6, 5, 4, 3, 2];
      let sum = 0;
      for (let i = 0; i < 8; i++) {
        sum += parseInt(cleanId.charAt(i), 10) * coefs[i];
      }
      const rem = sum % 11;
      const verifier = rem === 0 ? 0 : 11 - rem;
      const ninthDigit = parseInt(cleanId.charAt(8), 10);
      if (verifier !== ninthDigit) {
        return { isValid: false, message: 'RUC de Institución Pública inválido' };
      }
      return { isValid: true, message: 'RUC de Institución Pública válido' };
    }

    return { isValid: true, message: 'RUC Estructura general aceptada' };
  }

  return { isValid: true, message: 'Identificación válida' };
}

export const GestionClientes: React.FC<GestionClientesProps> = ({
  clientsList = [],
  onSaveCustomer,
  onDeleteCustomer
}) => {
  const initialClients: Customer[] = clientsList.length > 0 ? clientsList : [
    {
      id: 'CONSUMIDOR-FINAL',
      idType: 'CONSUMIDOR_FINAL',
      ruc: '9999999999999',
      name: 'CONSUMIDOR FINAL',
      tradeName: 'CONSUMIDOR FINAL',
      email: '',
      phone: '',
      address: '',
      type: 'PERSONA_NATURAL',
      creditLimit: 0,
      creditDays: 0,
      assignedPriceList: '',
      active: true,
      totalPurchased: 0,
      balanceDue: 0
    }
  ];

  const [customers, setCustomers] = useState<Customer[]>(initialClients);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialClients[0]?.id || '');
  const [activeTab, setActiveTab] = useState<
    'COBERTURA' | 'OBSERVACION' | 'GRAFICO' | 'GARANTES' | 'SUCURSALES' | 'IMAGENES' | 'PRECIOS' | 'CUENTAS' | 'LISTADO' | 'GEOLOCALIZACION'
  >('COBERTURA');

  const [mode, setMode] = useState<'VIEW' | 'NEW' | 'EDIT'>('VIEW');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected or Editing Customer Form State
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || customers[0];

  const [formData, setFormData] = useState<Partial<Customer>>({ ...selectedCustomer });
  const [validationResult, setValidationResult] = useState<{ isValid: boolean; message: string }>({ isValid: true, message: '' });
  const [isSearchingCedula, setIsSearchingCedula] = useState(false);
  const [autoLookupNotice, setAutoLookupNotice] = useState<string | null>(null);
  const lookupRequestRef = useRef(0);

  const handleLookupCedula = async (idNum: string) => {
    const clean = (idNum || '').trim().replace(/\D/g, '');
    if (clean.length !== 10 && clean.length !== 13) return;

    const requestId = ++lookupRequestRef.current;

    setIsSearchingCedula(true);
    setAutoLookupNotice(null);

    try {
      const res = await consultarClienteExterno(clean);
      if (requestId !== lookupRequestRef.current) return;
      if (res.found && res.data) {
        setFormData(prev => ({
          ...prev,
          name: res.data!.name,
          tradeName: res.data!.companyName || res.data!.name,
          address: res.data!.address || prev.address || '',
          email: res.data!.email || prev.email || '',
          type: res.data!.type === 'JURIDICA' ? 'PERSONA_JURIDICA' : 'PERSONA_NATURAL',
          idType: res.data!.idType || (clean.length === 13 ? 'RUC' : 'CEDULA')
        }));
        setAutoLookupNotice(null);
      } else {
        setAutoLookupNotice(res.error || res.message || 'Complete los datos manualmente.');
      }
    } catch {
      setAutoLookupNotice('No se pudo completar la búsqueda. Ingrese los datos manualmente.');
    } finally {
      if (requestId === lookupRequestRef.current) setIsSearchingCedula(false);
    }
  };

  // Update formData when selection changes if in VIEW mode
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setFormData({ ...cust });
    setMode('VIEW');
    setValidationResult({ isValid: true, message: '' });
  };

  // Live validation on ID type or RUC change
  const handleIdChange = (idType: Customer['idType'], ruc: string) => {
    const res = validateEcuadorianId(idType, ruc);
    setValidationResult(res);
  };

  const handleStartNew = () => {
    const newCust: Partial<Customer> = {
      id: String(Date.now()),
      idType: 'CEDULA',
      ruc: '',
      name: '',
      tradeName: '',
      email: '',
      phone: '',
      address: '',
      province: '',
      city: '',
      type: 'PERSONA_NATURAL',
      regimen: 'GENERAL',
      accountingObligated: false,
      retentionAgent: false,
      creditLimit: 0,
      creditDays: 0,
      assignedPriceList: 'PVP',
      vendor: '',
      group: 'General',
      active: true,
      totalPurchased: 0,
      balanceDue: 0
    };
    setFormData(newCust);
    setMode('NEW');
    setActiveTab('COBERTURA');
    setValidationResult({ isValid: false, message: 'Ingrese el número de cédula o RUC' });
  };

  const handleStartEdit = () => {
    if (!selectedCustomer) return;
    setFormData({ ...selectedCustomer });
    setMode('EDIT');
    setActiveTab('COBERTURA');
    handleIdChange(selectedCustomer.idType, selectedCustomer.ruc);
  };

  const handleSave = () => {
    if (!formData.name || !formData.name.trim()) {
      alert('Debe ingresar el Nombre o Razón Social del cliente');
      return;
    }

    if (!formData.ruc || !formData.ruc.trim()) {
      alert('Debe ingresar el número de Cédula o RUC');
      return;
    }

    const val = validateEcuadorianId(formData.idType || 'CEDULA', formData.ruc || '');
    if (!val.isValid) {
      if (!confirm(`La identificación tiene advertencias:\n\n${val.message}\n\n¿Desea guardar de todos modos?`)) {
        return;
      }
    }

    const savedCust: Customer = {
      id: formData.id || String(Date.now()),
      idType: formData.idType || 'CEDULA',
      ruc: formData.ruc || '9999999999999',
      name: formData.name.toUpperCase(),
      tradeName: (formData.tradeName || formData.name).toUpperCase(),
      email: formData.email || '',
      phone: formData.phone || '',
      address: formData.address || '',
      province: formData.province || '',
      city: formData.city || '',
      parish: formData.parish || '',
      type: formData.type || 'PERSONA_NATURAL',
      regimen: formData.regimen || 'GENERAL',
      accountingObligated: !!formData.accountingObligated,
      retentionAgent: !!formData.retentionAgent,
      creditLimit: Number(formData.creditLimit) || 0,
      creditDays: Number(formData.creditDays) || 0,
      assignedPriceList: formData.assignedPriceList || 'PVP',
      vendor: formData.vendor || '',
      group: formData.group || 'General',
      active: formData.active !== false,
      guarantorName: formData.guarantorName || '',
      guarantorCedula: formData.guarantorCedula || '',
      guarantorPhone: formData.guarantorPhone || '',
      notes: formData.notes || '',
      totalPurchased: formData.totalPurchased || 0,
      balanceDue: formData.balanceDue || 0
    };

    let updatedList: Customer[];
    if (mode === 'NEW') {
      updatedList = [savedCust, ...customers];
    } else {
      updatedList = customers.map(c => c.id === savedCust.id ? savedCust : c);
    }

    setCustomers(updatedList);
    setSelectedCustomerId(savedCust.id);
    setMode('VIEW');

    if (onSaveCustomer) {
      onSaveCustomer(savedCust);
    }
  };

  const handleDelete = () => {
    if (!selectedCustomer) return;
    if (selectedCustomer.ruc === '9999999999999') {
      alert('No se puede eliminar el cliente de Consumidor Final predeterminado');
      return;
    }

    if (confirm(`¿Está seguro de desactivar o eliminar al cliente ${selectedCustomer.name}?`)) {
      const updatedList = customers.filter(c => c.id !== selectedCustomer.id);
      setCustomers(updatedList);
      if (updatedList.length > 0) {
        setSelectedCustomerId(updatedList[0].id);
        setFormData({ ...updatedList[0] });
      }
      setMode('VIEW');

      if (onDeleteCustomer) {
        onDeleteCustomer(selectedCustomer.id);
      }
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.ruc.includes(searchTerm) ||
    (c.tradeName || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4 font-sans text-xs text-zinc-200">
      {/* HEADER BAR WITH ACTION RIBBON (PERSEO STYLE) */}
      <div className="bg-[#121217] border border-zinc-800 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
            <Users size={20} />
          </div>
          <div>
            <h2 className="text-base font-display font-black text-white uppercase tracking-wider">
              GESTIÓN DE CLIENTES DE VENTAS
            </h2>
            <p className="text-[11px] text-zinc-400">
              Directorio comercial, perfil crediticio y validación tributaria SRI
            </p>
          </div>
        </div>

        {/* ACTION BUTTONS RIBBON */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('LISTADO')}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded-xl font-display font-bold text-xs transition-all cursor-pointer border border-zinc-700"
          >
            <Search size={14} className="text-amber-400" />
            <span>Buscar</span>
          </button>

          <button
            onClick={handleStartNew}
            disabled={mode === 'NEW'}
            className="flex items-center gap-1.5 bg-[#00ff41] hover:bg-[#00e038] text-zinc-950 px-3.5 py-1.5 rounded-xl font-display font-black text-xs transition-all shadow-[0_0_12px_rgba(0,255,65,0.2)] active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Plus size={15} />
            <span>Nuevo</span>
          </button>

          <button
            onClick={handleStartEdit}
            disabled={mode !== 'VIEW' || !selectedCustomer}
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 px-3 py-1.5 rounded-xl font-display font-bold text-xs transition-all border border-zinc-700 cursor-pointer disabled:opacity-50"
          >
            <Edit3 size={14} />
            <span>Modificar</span>
          </button>

          <button
            onClick={handleDelete}
            disabled={mode !== 'VIEW' || !selectedCustomer}
            className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 px-3 py-1.5 rounded-xl font-display font-bold text-xs transition-all border border-red-800/80 cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>Eliminar</span>
          </button>

          {(mode === 'NEW' || mode === 'EDIT') && (
            <>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 px-4 py-1.5 rounded-xl font-display font-black text-xs transition-all shadow-lg active:scale-95 cursor-pointer"
              >
                <Save size={15} />
                <span>Guardar</span>
              </button>

              <button
                onClick={() => {
                  setMode('VIEW');
                  setFormData({ ...selectedCustomer });
                }}
                className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 px-3 py-1.5 rounded-xl font-display font-bold text-xs transition-all cursor-pointer"
              >
                <X size={14} />
                <span>Cancelar</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* TOP STATUS BAR FOR SELECTED CLIENT */}
      {selectedCustomer && (
        <div className="bg-[#121217] border border-zinc-800/80 p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-[#00ff41] bg-emerald-950/80 border border-emerald-800/80 px-2.5 py-1 rounded-lg">
              {formData.ruc || selectedCustomer.ruc}
            </span>
            <span className="font-display font-black text-white text-sm">
              {formData.name || selectedCustomer.name}
            </span>
            {formData.tradeName && formData.tradeName !== formData.name && (
              <span className="text-zinc-400 text-xs italic">
                ({formData.tradeName})
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 text-zinc-400 font-mono text-[11px]">
            <div>
              <span>Cupo Crédito:</span>{' '}
              <strong className="text-emerald-400">${(formData.creditLimit || 0).toFixed(2)}</strong>
            </div>
            <div>
              <span>Días Crédito:</span>{' '}
              <strong className="text-amber-400">{formData.creditDays || 0} días</strong>
            </div>
            <div>
              <span>Tarifa:</span>{' '}
              <strong className="text-white">{formData.assignedPriceList || 'PVP'}</strong>
            </div>
            <div>
              <span>Estado:</span>{' '}
              <strong className={formData.active !== false ? 'text-emerald-400' : 'text-red-400'}>
                {formData.active !== false ? 'ACTIVO' : 'INACTIVO'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TABS NAVIGATION (PERSEO FORMAT) */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-1.5 flex items-center gap-1 overflow-x-auto custom-scrollbar">
        {[
          { id: 'COBERTURA', label: 'Cobertura / Datos Generales', icon: <FileText size={14} /> },
          { id: 'OBSERVACION', label: 'Observación', icon: <HelpCircle size={14} /> },
          { id: 'GRAFICO', label: 'Gráfico & Estadísticas', icon: <BarChart3 size={14} /> },
          { id: 'GARANTES', label: 'Datos Garantes', icon: <UserCheck size={14} /> },
          { id: 'SUCURSALES', label: 'Sucursales', icon: <Building2 size={14} /> },
          { id: 'IMAGENES', label: 'Imágenes', icon: <ImageIcon size={14} /> },
          { id: 'PRECIOS', label: 'Precios Productos', icon: <DollarSign size={14} /> },
          { id: 'CUENTAS', label: 'Cuentas', icon: <CreditCard size={14} /> },
          { id: 'LISTADO', label: 'Listado Clientes', icon: <Users size={14} /> },
          { id: 'GEOLOCALIZACION', label: 'Geolocalización', icon: <MapPin size={14} /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-display font-bold text-xs whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-amber-500 text-zinc-950 shadow-md font-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* MAIN TAB CONTENT CONTAINER */}
      <div className="bg-[#121217] border border-zinc-800 rounded-2xl p-6 shadow-xl">
        {/* TAB 1: DATOS GENERALES Y COBERTURA */}
        {activeTab === 'COBERTURA' && (
          <div className="space-y-6">
            {/* VALIDATION FEEDBACK BOX */}
            {mode !== 'VIEW' && (
              <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                validationResult.isValid
                  ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/80 text-amber-300'
              }`}>
                <div className="flex items-center gap-2 font-mono">
                  {validationResult.isValid ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{validationResult.message || 'Validación de Identificación SRI'}</span>
                </div>
                <span className="text-[10px] uppercase font-bold font-display tracking-widest text-zinc-400">
                  Algoritmo SRI Ecuador
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* SECTION A: IDENTIFICACIÓN Y REGIMEN */}
              <div className="space-y-4 bg-[#0a0a0d] border border-zinc-800/80 p-4 rounded-xl">
                <h3 className="font-display font-black text-xs text-amber-400 uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
                  <ShieldAlert size={15} />
                  <span>1. Identificación SRI</span>
                </h3>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Tipo Identificación
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.idType || 'CEDULA'}
                    onChange={(e) => {
                      const newType = e.target.value as any;
                      setFormData({ ...formData, idType: newType });
                      handleIdChange(newType, formData.ruc || '');
                    }}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  >
                    <option value="CEDULA">Cédula (10 Dígitos)</option>
                    <option value="RUC">RUC (13 Dígitos)</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="CONSUMIDOR_FINAL">Consumidor Final (9999999999999)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase">
                      Cédula / RUC / Id
                    </label>
                    {mode !== 'VIEW' && (
                      <button
                        type="button"
                        onClick={() => handleLookupCedula(formData.ruc || '')}
                        disabled={isSearchingCedula || !formData.ruc || formData.ruc.length < 10}
                        className="text-[10px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition-all cursor-pointer disabled:opacity-40"
                      >
                        {isSearchingCedula ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
                        <span>Consultar datos</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.ruc || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      lookupRequestRef.current += 1;
                      setFormData({ ...formData, ruc: val });
                      handleIdChange(formData.idType || 'CEDULA', val);
                    }}
                    onBlur={() => handleLookupCedula(formData.ruc || '')}
                    placeholder="Cédula (10 dig) o RUC (13 dig)"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#00ff41] outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                  {autoLookupNotice && (
                    <p className="mt-1 text-[10px] font-mono text-amber-300 bg-amber-950/30 p-1 rounded border border-amber-800/40">
                      {autoLookupNotice}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Tipo de Persona
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.type || 'PERSONA_NATURAL'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  >
                    <option value="PERSONA_NATURAL">Persona Natural</option>
                    <option value="PERSONA_JURIDICA">Persona Jurídica / Sociedad</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Régimen Tributario
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.regimen || 'GENERAL'}
                    onChange={(e) => setFormData({ ...formData, regimen: e.target.value as any })}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  >
                    <option value="GENERAL">Régimen General</option>
                    <option value="RIMPE_POPULAR">RIMPE - Negocio Popular</option>
                    <option value="RIMPE_EMPRENDEDOR">RIMPE - Emprendedor</option>
                    <option value="CONTRIBUYENTE_ESPECIAL">Contribuyente Especial</option>
                  </select>
                </div>

                <div className="pt-2 space-y-2 border-t border-zinc-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      disabled={mode === 'VIEW'}
                      checked={!!formData.accountingObligated}
                      onChange={(e) => setFormData({ ...formData, accountingObligated: e.target.checked })}
                      className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0"
                    />
                    <span>Obligado a Llevar Contabilidad</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      disabled={mode === 'VIEW'}
                      checked={!!formData.retentionAgent}
                      onChange={(e) => setFormData({ ...formData, retentionAgent: e.target.checked })}
                      className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 text-amber-500 focus:ring-0"
                    />
                    <span>Agente de Retención SRI</span>
                  </label>
                </div>
              </div>

              {/* SECTION B: NOMBRES Y CONTACTO */}
              <div className="space-y-4 bg-[#0a0a0d] border border-zinc-800/80 p-4 rounded-xl">
                <h3 className="font-display font-black text-xs text-amber-400 uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
                  <Mail size={15} />
                  <span>2. Razón Social y Contacto</span>
                </h3>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Cliente / Razón Social *
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nombres completos o Razón Social"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Nombre Comercial
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.tradeName || ''}
                    onChange={(e) => setFormData({ ...formData, tradeName: e.target.value })}
                    placeholder="ej: TMCH DISTRIBUCIONES"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Correo Electrónico (Comprobantes RIDE/XML)
                  </label>
                  <input
                    type="email"
                    disabled={mode === 'VIEW'}
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="cliente@ejemplo.com"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-amber-400 outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Teléfono / Celular
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="Teléfono"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Dirección Principal
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Calle principal y secundaria"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>
              </div>

              {/* SECTION C: CONDICIONES DE CRÉDITO Y TARIFAS */}
              <div className="space-y-4 bg-[#0a0a0d] border border-zinc-800/80 p-4 rounded-xl">
                <h3 className="font-display font-black text-xs text-amber-400 uppercase tracking-wider border-b border-zinc-800 pb-2 flex items-center gap-2">
                  <CreditCard size={15} />
                  <span>3. Crédito y Tarifas de Venta</span>
                </h3>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Cupo de Crédito ($ USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500 font-mono font-bold">$</span>
                    <input
                      type="number"
                      step="0.01"
                      disabled={mode === 'VIEW'}
                      value={formData.creditLimit !== undefined ? formData.creditLimit : ''}
                      onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-emerald-400 outline-none focus:border-amber-500 disabled:opacity-75"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Días de Crédito Plazo
                  </label>
                  <input
                    type="number"
                    disabled={mode === 'VIEW'}
                    value={formData.creditDays !== undefined ? formData.creditDays : ''}
                    onChange={(e) => setFormData({ ...formData, creditDays: parseInt(e.target.value, 10) || 0 })}
                    placeholder="30"
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Tarifa de Precio Asignada
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.assignedPriceList || 'PVP'}
                    onChange={(e) => setFormData({ ...formData, assignedPriceList: e.target.value as any })}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-bold text-amber-400 outline-none focus:border-amber-500 disabled:opacity-75"
                  >
                    <option value="PVP">PVP - Precio Venta Público</option>
                    <option value="MAYORISTA">Precio Mayorista (Descuento 5%)</option>
                    <option value="DISTRIBUIDOR">Precio Distribuidor (Descuento 10%)</option>
                    <option value="ESPECIAL">Precio Especial Corporativo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Vendedor Asignado
                  </label>
                  <input
                    type="text"
                    disabled={mode === 'VIEW'}
                    value={formData.vendor || ''}
                    onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase mb-1">
                    Estado en Sistema
                  </label>
                  <select
                    disabled={mode === 'VIEW'}
                    value={formData.active !== false ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, active: e.target.value === 'true' })}
                    className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-bold text-white outline-none focus:border-amber-500 disabled:opacity-75"
                  >
                    <option value="true">ACTIVO (Permite Facturación)</option>
                    <option value="false">INACTIVO (Bloqueado para Ventas)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: OBSERVACIÓN */}
        {activeTab === 'OBSERVACION' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Notas u Observaciones del Cliente
            </h3>
            <textarea
              disabled={mode === 'VIEW'}
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={8}
              placeholder="Escriba comentarios adicionales sobre el cliente, referencias personales, condiciones especiales de entrega, etc..."
              className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl p-4 text-xs font-mono text-zinc-200 outline-none focus:border-amber-500 disabled:opacity-80"
            />
          </div>
        )}

        {/* TAB 3: GRÁFICO Y ESTADÍSTICAS */}
        {activeTab === 'GRAFICO' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl">
                <div className="text-zinc-400 text-xs font-mono">Total Ventas Históricas</div>
                <div className="text-2xl font-display font-black text-[#00ff41] mt-1 font-mono">
                  ${(selectedCustomer.totalPurchased || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl">
                <div className="text-zinc-400 text-xs font-mono">Saldo Pendiente por Cobrar</div>
                <div className="text-2xl font-display font-black text-amber-400 mt-1 font-mono">
                  ${(selectedCustomer.balanceDue || 0).toFixed(2)}
                </div>
              </div>
              <div className="bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl">
                <div className="text-zinc-400 text-xs font-mono">Cupo Disponible</div>
                <div className="text-2xl font-display font-black text-emerald-400 mt-1 font-mono">
                  ${Math.max(0, (selectedCustomer.creditLimit || 0) - (selectedCustomer.balanceDue || 0)).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 p-6 rounded-xl text-center space-y-3">
              <BarChart3 size={32} className="text-amber-400 mx-auto" />
              <div className="font-display font-black text-sm text-white">
                Distribución de Ventas por Días de Vencimiento
              </div>
              <p className="text-zinc-400 text-xs max-w-md mx-auto">
                El cliente registra un saldo vencido de $0.00 y $
                {(selectedCustomer.balanceDue || 0).toFixed(2)} por vencer a 30 días.
              </p>
            </div>
          </div>
        )}

        {/* TAB 4: DATOS GARANTES */}
        {activeTab === 'GARANTES' && (
          <div className="space-y-4 max-w-xl">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Garante o Cónyuge de Respaldo
            </h3>
            <div className="space-y-3 bg-[#0a0a0d] border border-zinc-800 p-4 rounded-xl">
              <div>
                <label className="block text-[11px] text-zinc-400 uppercase font-bold mb-1">
                  Nombres Completos Garante
                </label>
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.guarantorName || ''}
                  onChange={(e) => setFormData({ ...formData, guarantorName: e.target.value })}
                  placeholder="Nombre de la persona garante"
                  className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 disabled:opacity-75"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 uppercase font-bold mb-1">
                  Cédula Garante
                </label>
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.guarantorCedula || ''}
                  onChange={(e) => setFormData({ ...formData, guarantorCedula: e.target.value })}
                  placeholder="Identificación"
                  className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-400 uppercase font-bold mb-1">
                  Teléfono Garante
                </label>
                <input
                  type="text"
                  disabled={mode === 'VIEW'}
                  value={formData.guarantorPhone || ''}
                  onChange={(e) => setFormData({ ...formData, guarantorPhone: e.target.value })}
                  placeholder="Teléfono"
                  className="w-full bg-[#121217] border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-white outline-none focus:border-amber-500 disabled:opacity-75"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SUCURSALES */}
        {activeTab === 'SUCURSALES' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Sucursales y Direcciones de Entrega
            </h3>
            <div className="bg-[#0a0a0d] border border-zinc-800 rounded-xl overflow-hidden font-mono text-xs">
              <table className="w-full text-left">
                <thead className="bg-[#181820] text-zinc-400 uppercase text-[10px] border-b border-zinc-800">
                  <tr>
                    <th className="p-3">Código</th>
                    <th className="p-3">Nombre Sucursal</th>
                    <th className="p-3">Dirección de Despacho</th>
                    <th className="p-3">Ciudad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  <tr>
                    <td className="p-3 text-amber-400 font-bold">SUC-001</td>
                    <td className="p-3 font-sans font-bold text-white">Matriz Paján</td>
                    <td className="p-3 text-zinc-300">{formData.address || selectedCustomer.address}</td>
                    <td className="p-3 text-zinc-400">{formData.city || selectedCustomer.city || 'Paján'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: IMÁGENES Y ADJUNTOS */}
        {activeTab === 'IMAGENES' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Documentos Adjuntos (Cédula, RUC escaneado, Planilla)
            </h3>
            <div className="border-2 border-dashed border-zinc-800 hover:border-amber-500/50 p-8 rounded-xl text-center space-y-2 cursor-pointer transition-colors">
              <ImageIcon size={32} className="text-zinc-600 mx-auto" />
              <div className="text-xs text-zinc-400 font-bold">
                Arrastre o haga clic para subir copia de Cédula/RUC escaneado
              </div>
              <div className="text-[10px] font-mono text-zinc-600">Archivos PDF, JPG, PNG hasta 10MB</div>
            </div>
          </div>
        )}

        {/* TAB 7: PRECIOS PRODUCTOS */}
        {activeTab === 'PRECIOS' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Lista de Precios y Descuentos Asignados
            </h3>
            <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-2">
              <div className="flex justify-between text-xs py-1 border-b border-zinc-800">
                <span className="text-zinc-400">Tarifa Actual:</span>
                <span className="font-bold text-amber-400 font-mono">{formData.assignedPriceList || 'PVP'}</span>
              </div>
              <div className="flex justify-between text-xs py-1 border-b border-zinc-800">
                <span className="text-zinc-400">Aplica Descuento por Volumen:</span>
                <span className="font-bold text-zinc-500">SIN REGLA CONFIGURADA</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: CUENTAS BANCARIAS Y PAGO */}
        {activeTab === 'CUENTAS' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Cuentas Bancarias Registradas para Transferencias
            </h3>
            <div className="p-4 bg-[#0a0a0d] border border-zinc-800 rounded-xl space-y-2 text-xs font-mono">
              <div className="text-zinc-500">Sin cuentas bancarias registradas.</div>
            </div>
          </div>
        )}

        {/* TAB 9: LISTADO COMPLETO DE CLIENTES */}
        {activeTab === 'LISTADO' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-3 text-zinc-500" size={16} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar por Cédula, RUC o Nombre..."
                  className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs font-mono text-white outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="bg-[#0a0a0d] border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="p-3">RUC / Cédula</th>
                    <th className="p-3">Cliente / Razón Social</th>
                    <th className="p-3">Teléfono</th>
                    <th className="p-3 font-mono">Email</th>
                    <th className="p-3">Tarifa</th>
                    <th className="p-3 text-right">Cupo</th>
                    <th className="p-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                  {filteredCustomers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className={`hover:bg-zinc-800/50 cursor-pointer transition-colors ${
                        c.id === selectedCustomerId ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''
                      }`}
                    >
                      <td className="p-3 font-bold text-[#00ff41]">{c.ruc}</td>
                      <td className="p-3 font-sans font-bold text-white">{c.name}</td>
                      <td className="p-3 text-zinc-300">{c.phone}</td>
                      <td className="p-3 text-zinc-400">{c.email}</td>
                      <td className="p-3 font-sans font-bold text-amber-400">{c.assignedPriceList}</td>
                      <td className="p-3 text-right text-emerald-400">${c.creditLimit.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectCustomer(c);
                            setActiveTab('COBERTURA');
                          }}
                          className="px-2.5 py-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500 hover:text-zinc-950 rounded text-[10px] font-bold font-display transition-colors"
                        >
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 10: GEOLOCALIZACIÓN */}
        {activeTab === 'GEOLOCALIZACION' && (
          <div className="space-y-4">
            <h3 className="font-display font-black text-sm text-amber-400 uppercase tracking-wider">
              Ubicación GPS del Cliente para Entregas de Ruta
            </h3>
            <div className="bg-[#0a0a0d] border border-zinc-800 p-8 rounded-xl text-center space-y-2">
              <MapPin size={32} className="text-amber-400 mx-auto" />
              <div className="text-xs text-white font-bold">
                Coordenadas GPS: Lat -1.5521, Long -80.4289 (Paján, Ecuador)
              </div>
              <div className="text-[11px] text-zinc-400">
                Dirección: {formData.address || selectedCustomer.address}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
