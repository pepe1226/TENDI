import React, { useMemo, useState } from 'react';
import { ArrowLeft, Building2, KeyRound, Lock, LogIn, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { Company, SystemUser } from '../types';
import { verifyPasswordCredential } from '../lib/ecuadorValidador';

interface LoginScreenProps {
  companies: Company[];
  onSelectCompanyAndLogin: (company: Company, user: SystemUser) => void;
  onCreateInitialAdmin?: (user: SystemUser & { password: string }) => Promise<void>;
  users?: SystemUser[];
}

const allInitialPermissions: Record<string, boolean> = {
  pos_access: true,
  pos_discount: true,
  pos_reimprimir: true,
  pos_anular: true,
  inv_ver: true,
  inv_ingresos: true,
  inv_egresos: true,
  inv_ajustes: true,
  inv_precios: true,
  caja_apertura: true,
  caja_cierre: true,
  caja_movimientos: true,
  rep_ventas: true,
  rep_utilidades: true,
  admin_usuarios: true,
  admin_empresas: true,
  admin_sri: true
};

export const LoginScreen: React.FC<LoginScreenProps> = ({
  companies,
  onSelectCompanyAndLogin,
  onCreateInitialAdmin,
  users = []
}) => {
  const activeCompanies = useMemo(() => companies.filter(company => company.active !== false), [companies]);
  const hasConfiguredAdministrator = users.some(user => (
    user.active &&
    (user.role === 'ADMINISTRADOR' || user.role === 'SUPER USUARIO') &&
    Boolean((user.passwordHash && user.passwordSalt) || user.password)
  ));
  const needsBootstrap = !hasConfiguredAdministrator;

  const [step, setStep] = useState<'login' | 'company_select'>(needsBootstrap ? 'login' : 'login');
  const [username, setUsername] = useState(() => localStorage.getItem('tendi_last_username') || '');
  const [password, setPassword] = useState('');
  const [rememberUsername, setRememberUsername] = useState(() => Boolean(localStorage.getItem('tendi_last_username')));
  const [companySearch, setCompanySearch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapUsername, setBootstrapUsername] = useState('ADMIN');
  const [bootstrapPassword, setBootstrapPassword] = useState('');
  const [bootstrapPasswordConfirm, setBootstrapPasswordConfirm] = useState('');
  const [bootstrapPin, setBootstrapPin] = useState('');
  const [bootstrapCompanyId, setBootstrapCompanyId] = useState(activeCompanies[0]?.id || '');
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);

  const handleBootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedUsername = bootstrapUsername.trim().toUpperCase();
    const selectedCompany = activeCompanies.find(company => company.id === bootstrapCompanyId);
    const errors: string[] = [];
    if (!bootstrapName.trim()) errors.push('Ingrese los nombres completos.');
    if (!normalizedUsername) errors.push('Ingrese un nombre de usuario.');
    if (!bootstrapPassword) errors.push('Ingrese una contraseña.');
    if (bootstrapPassword !== bootstrapPasswordConfirm) errors.push('Las contraseñas no coinciden.');
    if (!/^\d{4}$/.test(bootstrapPin)) errors.push('El PIN debe tener exactamente 4 dígitos.');
    if (!selectedCompany) errors.push('Seleccione una empresa activa.');
    if (!onCreateInitialAdmin) errors.push('No está disponible la configuración inicial.');
    if (errors.length) {
      setErrorMsg(errors.join(' '));
      return;
    }

    const newAdmin: SystemUser & { password: string } = {
      id: `admin-${Date.now()}`,
      username: normalizedUsername,
      fullName: bootstrapName.trim().toUpperCase(),
      role: 'SUPER USUARIO',
      pin: bootstrapPin,
      active: true,
      password: bootstrapPassword,
      companyIds: [selectedCompany!.id],
      permissions: { ...allInitialPermissions }
    };

    setIsCreatingAdmin(true);
    setErrorMsg('');
    try {
      await onCreateInitialAdmin!(newAdmin);
      localStorage.setItem('tendi_last_username', normalizedUsername);
      onSelectCompanyAndLogin(selectedCompany!, newAdmin);
    } catch {
      setErrorMsg('No se pudo crear el administrador inicial. Intente nuevamente.');
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedUsername = username.trim().toUpperCase();
    if (!normalizedUsername || !password) {
      setErrorMsg('Ingrese usuario y contraseña.');
      return;
    }

    const foundUser = users.find(user => user.active && user.username.toUpperCase() === normalizedUsername);
    if (!foundUser) {
      setErrorMsg('Usuario inexistente o inactivo.');
      return;
    }

    if (foundUser.passwordHash && foundUser.passwordSalt) {
      const passwordIsValid = await verifyPasswordCredential(password, foundUser.passwordHash, foundUser.passwordSalt);
      if (!passwordIsValid) {
        setErrorMsg('Contraseña incorrecta.');
        return;
      }
    } else if (foundUser.password) {
      if (foundUser.password !== password) {
        setErrorMsg('Contraseña incorrecta.');
        return;
      }
    } else {
      setErrorMsg('Este usuario no tiene una contraseña configurada. Un administrador debe corregirlo.');
      return;
    }

    const assignedActiveCompanies = activeCompanies.filter(company => foundUser.companyIds?.includes(company.id));
    if (assignedActiveCompanies.length === 0) {
      setErrorMsg('El usuario no tiene una empresa activa asignada.');
      return;
    }

    if (rememberUsername) localStorage.setItem('tendi_last_username', normalizedUsername);
    else localStorage.removeItem('tendi_last_username');
    setErrorMsg('');
    setStep('company_select');
  };

  const loginUser = users.find(user => user.active && user.username.toUpperCase() === username.trim().toUpperCase());
  const allowedCompanies = activeCompanies.filter(company => loginUser?.companyIds?.includes(company.id));
  const filteredCompanies = allowedCompanies.filter(company => {
    const query = companySearch.toLowerCase();
    return company.name.toLowerCase().includes(query) || company.tradeName.toLowerCase().includes(query) || company.ruc.includes(query);
  });

  const handleSelectCompany = (company: Company) => {
    if (!loginUser || !loginUser.companyIds?.includes(company.id)) {
      setErrorMsg('El usuario no tiene acceso a esta empresa.');
      setStep('login');
      return;
    }
    onSelectCompanyAndLogin(company, loginUser);
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0d12] flex items-center justify-center p-4 font-sans text-zinc-100 select-none">
      {needsBootstrap ? (
        <div className="w-full max-w-lg bg-[#13131a] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-zinc-800 bg-[#1a1a24]">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-amber-500 rounded-lg flex items-center justify-center text-zinc-950"><UserPlus size={24} /></div>
              <div>
                <h1 className="text-lg font-black text-white">CONFIGURACIÓN INICIAL</h1>
                <p className="text-xs text-zinc-400">Cree el primer administrador protegido del sistema.</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleBootstrap} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {errorMsg && <div className="sm:col-span-2 p-3 bg-red-950/60 border border-red-800 rounded text-red-200 text-xs font-bold">{errorMsg}</div>}
            <label className="sm:col-span-2 text-xs font-bold text-zinc-300">Nombres completos
              <input value={bootstrapName} onChange={e => setBootstrapName(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none" autoFocus />
            </label>
            <label className="text-xs font-bold text-zinc-300">Usuario
              <input value={bootstrapUsername} onChange={e => setBootstrapUsername(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none font-mono uppercase" />
            </label>
            <label className="text-xs font-bold text-zinc-300">PIN de facturación
              <input value={bootstrapPin} onChange={e => setBootstrapPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none font-mono" />
            </label>
            <label className="text-xs font-bold text-zinc-300">Contraseña
              <input type="password" value={bootstrapPassword} onChange={e => setBootstrapPassword(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none" />
            </label>
            <label className="text-xs font-bold text-zinc-300">Confirmar contraseña
              <input type="password" value={bootstrapPasswordConfirm} onChange={e => setBootstrapPasswordConfirm(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none" />
            </label>
            <label className="sm:col-span-2 text-xs font-bold text-zinc-300">Empresa inicial
              <select value={bootstrapCompanyId} onChange={e => setBootstrapCompanyId(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-3 py-2.5 outline-none">
                {activeCompanies.map(company => <option key={company.id} value={company.id}>{company.tradeName || company.name}</option>)}
              </select>
            </label>
            <button disabled={isCreatingAdmin} className="sm:col-span-2 bg-amber-500 hover:bg-amber-400 disabled:bg-zinc-700 text-zinc-950 font-black py-3 rounded flex items-center justify-center gap-2">
              <ShieldCheck size={18} /> {isCreatingAdmin ? 'CREANDO...' : 'CREAR ADMINISTRADOR E INGRESAR'}
            </button>
          </form>
        </div>
      ) : step === 'login' ? (
        <div className="w-full max-w-md bg-[#13131a] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-7 text-center bg-[#1a1a24] border-b border-zinc-800">
            <div className="w-14 h-14 bg-amber-500 rounded-lg mx-auto flex items-center justify-center mb-3"><KeyRound size={28} className="text-zinc-950" /></div>
            <h1 className="text-2xl font-black text-white">TENDI</h1>
            <p className="text-[10px] tracking-widest text-amber-400 font-bold">SISTEMA CONTABLE Y FACTURACIÓN</p>
          </div>
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {errorMsg && <div className="p-3 bg-red-950/60 border border-red-800 rounded text-red-200 text-xs font-bold">{errorMsg}</div>}
            <label className="block text-xs font-bold text-zinc-300">Usuario
              <input value={username} onChange={e => setUsername(e.target.value)} className="mt-1 w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded px-4 py-3 outline-none font-mono uppercase" autoFocus />
            </label>
            <label className="block text-xs font-bold text-zinc-300">Contraseña
              <div className="relative mt-1"><Lock className="absolute left-3 top-3.5 text-zinc-500" size={16} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0a0a0e] border border-zinc-700 focus:border-amber-500 rounded pl-10 pr-4 py-3 outline-none" /></div>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400"><input type="checkbox" checked={rememberUsername} onChange={e => setRememberUsername(e.target.checked)} className="accent-amber-500" /> Recordar usuario</label>
            <button className="w-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black py-3 rounded flex items-center justify-center gap-2"><LogIn size={18} /> INGRESAR</button>
          </form>
        </div>
      ) : (
        <div className="w-full max-w-2xl bg-[#13131a] border border-zinc-800 rounded-lg shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-zinc-800 flex items-center justify-between bg-[#171722]">
            <button type="button" onClick={() => setStep('login')} className="flex items-center gap-2 text-xs font-bold text-zinc-400 hover:text-amber-400"><ArrowLeft size={16} /> Volver</button>
            <div className="flex items-center gap-2 font-black text-xs text-amber-400"><ShieldCheck size={16} /> TENDI ECUADOR</div>
          </div>
          <div className="p-6 space-y-5">
            <div><h2 className="text-xl font-black text-white">Seleccione una empresa</h2><p className="text-zinc-400 text-xs">Empresas habilitadas para <strong className="text-amber-400">{username.toUpperCase()}</strong></p></div>
            <div className="relative"><Search className="absolute left-3.5 top-3 text-zinc-500" size={16} /><input value={companySearch} onChange={e => setCompanySearch(e.target.value)} placeholder="Buscar por RUC o razón social" className="w-full bg-[#0a0a0e] border border-zinc-700 rounded pl-10 pr-4 py-2.5 text-xs outline-none focus:border-amber-500" /></div>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {filteredCompanies.map(company => (
                <button key={company.id} type="button" onClick={() => handleSelectCompany(company)} className="w-full bg-[#0a0a0e] hover:bg-[#181824] border border-zinc-800 hover:border-amber-500/50 p-4 rounded flex items-center justify-between text-left">
                  <span className="flex items-center gap-3"><Building2 size={23} className="text-amber-400" /><span><strong className="block text-white">{company.tradeName || company.name}</strong><span className="text-[11px] text-zinc-500">RUC: {company.ruc}</span></span></span><LogIn size={17} className="text-amber-400" />
                </button>
              ))}
              {filteredCompanies.length === 0 && <div className="p-6 text-center text-zinc-500 text-xs">No hay empresas activas asignadas.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
