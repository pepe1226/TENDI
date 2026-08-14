import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Clock, FileText, Search, AlertTriangle, ArrowRight, Lock, Plus } from 'lucide-react';
import { ApprovalWorkflowManager, AuditLogger, ApprovalRequest, AuditLog } from '../lib/tendiAdminEngine';
import { SystemUser } from '../types';

interface GestionAprobacionesAuditProps {
  companyId?: string;
  currentUser?: SystemUser;
}

export const GestionAprobacionesAudit: React.FC<GestionAprobacionesAuditProps> = ({ companyId = 'global', currentUser }) => {
  const [activeTab, setActiveTab] = useState<'aprobaciones' | 'auditoria'>('aprobaciones');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [newActionType, setNewActionType] = useState<ApprovalRequest['actionType']>('ANNUL_INVOICE');
  const [newResourceId, setNewResourceId] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const canResolveRequests = Boolean(
    currentUser?.active &&
    currentUser.companyIds?.includes(companyId) &&
    (currentUser.role === 'SUPER USUARIO' || currentUser.role === 'ADMINISTRADOR' || currentUser.permissions?.admin_usuarios === true)
  );

  // Initial Sample Requests if empty
  const [requests, setRequests] = useState<ApprovalRequest[]>(() => {
    const existing = ApprovalWorkflowManager.getRequests(companyId);
    // Las solicitudes deben originarse en una operacion real.
    return existing;

    /* Legacy demo data intentionally disabled.
    // Seed mock pending requests for user interaction
    ApprovalWorkflowManager.createRequest({
      companyId,
      applicantUserId: 'USR-CAJERO-1',
      applicantName: 'Carlos Mendoza (Cajero)',
      actionType: 'ANNUL_INVOICE',
      resourceId: 'FAC-001-001-00000845',
      details: 'Cliente solicitó anulación por error en cantidad digitada (3 pacas en lugar de 1)'
    });

    ApprovalWorkflowManager.createRequest({
      companyId,
      applicantUserId: 'USR-BODEGA-2',
      applicantName: 'Luis Delgado (Bodega)',
      actionType: 'ADJUST_INVENTORY',
      resourceId: 'PROD-102 (Aceite Crisol)',
      details: 'Ajuste negativo por caducidad en bodega de almacenamiento (-5 unidades)'
    });

    ApprovalWorkflowManager.createRequest({
      companyId,
      applicantUserId: 'USR-CAJERO-1',
      applicantName: 'Carlos Mendoza (Cajero)',
      actionType: 'OVERRIDE_DISCOUNT',
      resourceId: 'PED-2026-0089',
      details: 'Solicitud de descuento comercial especial del 15% para cliente mayorista'
    });

    */
    return existing;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    return AuditLogger.getLogs(companyId);
  });

  useEffect(() => {
    setRequests(ApprovalWorkflowManager.getRequests(companyId));
    setAuditLogs(AuditLogger.getLogs(companyId));
    setNewRequestOpen(false);
  }, [companyId]);

  const handleResolve = (requestId: string, approve: boolean) => {
    const request = requests.find(item => item.requestId === requestId);
    if (!currentUser || !canResolveRequests) {
      setActionNotice('El usuario actual no tiene autorización para resolver solicitudes.');
      return;
    }
    if (request?.applicantUserId === currentUser.id) {
      setActionNotice('El solicitante no puede aprobar ni rechazar su propia solicitud.');
      return;
    }
    const result = ApprovalWorkflowManager.resolveRequest(
      requestId,
      currentUser.id,
      currentUser.fullName || currentUser.username,
      approve,
      approve ? 'Aprobado por el administrador' : 'Rechazado por política de seguridad'
    );

    if (result) {
      setActionNotice(approve ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
      setRequests([...ApprovalWorkflowManager.getRequests(companyId)]);
      setAuditLogs([...AuditLogger.getLogs(companyId)]);
    }
  };

  const handleCreateRequest = () => {
    if (!currentUser) {
      setActionNotice('No existe una sesión de usuario válida.');
      return;
    }
    if (!newResourceId.trim() || !newDetails.trim()) return;
    ApprovalWorkflowManager.createRequest({
      companyId,
      applicantUserId: currentUser.id,
      applicantName: currentUser.fullName || currentUser.username,
      actionType: newActionType,
      resourceId: newResourceId.trim(),
      details: newDetails.trim()
    });
    setRequests([...ApprovalWorkflowManager.getRequests(companyId)]);
    setAuditLogs([...AuditLogger.getLogs(companyId)]);
    setNewRequestOpen(false);
    setNewResourceId('');
    setNewDetails('');
    setActionNotice('Solicitud creada correctamente.');
  };

  const filteredRequests = requests.filter(r => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchesSearch = r.applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.resourceId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          r.details.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const filteredAuditLogs = auditLogs.filter(l => {
    return l.userFullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
           l.module.toLowerCase().includes(searchTerm.toLowerCase()) ||
           l.traceabilityId.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#121217] p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-display font-black text-white flex items-center gap-2">
            <ShieldCheck className="text-[#00ff41]" />
            <span>SOLICITUDES DE APROBACIÓN Y AUDITORÍA INMUTABLE</span>
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Gestión de anulaciones, reaperturas de caja y trazabilidad inmutable de todas las acciones sensibles
          </p>
        </div>

        <div className="flex items-center gap-2 bg-[#0a0a0d] p-1 rounded-xl border border-zinc-800 text-xs font-bold">
          <button
            onClick={() => setActiveTab('aprobaciones')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'aprobaciones' ? 'bg-[#00ff41] text-black font-display' : 'text-zinc-400 hover:text-white'}`}
          >
            <Clock size={14} />
            <span>Aprobaciones ({requests.filter(r => r.status === 'PENDING').length})</span>
          </button>
          <button
            type="button"
            onClick={() => setNewRequestOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold flex items-center gap-1.5"
          >
            <Plus size={14} /> Nueva solicitud
          </button>
          <button
            onClick={() => setActiveTab('auditoria')}
            className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${activeTab === 'auditoria' ? 'bg-[#00ff41] text-black font-display' : 'text-zinc-400 hover:text-white'}`}
          >
            <FileText size={14} />
            <span>Bitácora de Auditoría</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div role="status" className="bg-amber-950/40 border border-amber-700/50 text-amber-200 px-4 py-2 rounded-xl text-xs font-bold">
          {actionNotice}
        </div>
      )}

      {/* TAB 1: SOLICITUDES DE APROBACIÓN */}
      {newRequestOpen && (
        <div className="bg-[#121217] border border-amber-500/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold text-white">Nueva solicitud de aprobación</h3><button type="button" onClick={() => setNewRequestOpen(false)} className="text-zinc-400 hover:text-white">Cerrar</button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <select value={newActionType} onChange={(event) => setNewActionType(event.target.value as ApprovalRequest['actionType'])} className="bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white">
              <option value="ANNUL_INVOICE">Anular factura</option>
              <option value="REOPEN_CASH_CLOSE">Reabrir cierre de caja</option>
              <option value="ADJUST_INVENTORY">Ajustar inventario</option>
              <option value="MODIFY_CLOSED_PERIOD">Modificar período cerrado</option>
              <option value="CHANGE_SEQUENCE">Cambiar secuencia</option>
              <option value="OVERRIDE_DISCOUNT">Autorizar descuento</option>
            </select>
            <input value={newResourceId} onChange={(event) => setNewResourceId(event.target.value)} placeholder="Documento o recurso" className="bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white" />
            <input value={newDetails} onChange={(event) => setNewDetails(event.target.value)} placeholder="Motivo de la solicitud" className="bg-[#0a0a0d] border border-zinc-800 rounded-xl px-3 py-2 text-white" />
          </div>
          <button type="button" onClick={handleCreateRequest} disabled={!newResourceId.trim() || !newDetails.trim()} className="bg-[#00ff41] disabled:bg-zinc-800 disabled:text-zinc-500 text-black font-bold px-4 py-2 rounded-xl text-xs">Crear solicitud</button>
        </div>
      )}

      {activeTab === 'aprobaciones' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between gap-3 bg-[#121217] p-4 rounded-xl border border-zinc-800 text-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Buscar por solicitante, documento o detalle..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white outline-none focus:border-[#00ff41]"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-bold">Estado:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#0a0a0d] border border-zinc-800 text-white rounded-xl px-3 py-2 outline-none font-mono"
              >
                <option value="ALL">TODOS LOS ESTADOS</option>
                <option value="PENDING">PENDIENTES</option>
                <option value="APPROVED">APROBADOS</option>
                <option value="REJECTED">RECHAZADOS</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredRequests.map(req => (
              <div key={req.requestId} className="bg-[#121217] border border-zinc-800 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-zinc-700 transition-colors">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-[#00ff41]/10 text-[#00ff41] border border-[#00ff41]/30 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                      {req.requestId}
                    </span>
                    <span className="text-xs font-bold text-white font-mono">
                      {req.actionType}
                    </span>
                    <span className="text-zinc-500 text-[11px]">
                      • {new Date(req.requestedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-200">
                    Solicitado por: <strong className="text-white">{req.applicantName}</strong> sobre <strong className="text-emerald-400 font-mono">{req.resourceId}</strong>
                  </div>

                  <p className="text-xs text-zinc-400 bg-[#0a0a0d] p-3 rounded-xl border border-zinc-800/80">
                    {req.details}
                  </p>

                  {req.status !== 'PENDING' && (
                    <div className="text-[11px] text-zinc-400 font-mono flex items-center gap-2 pt-1">
                      <span>Resuelto por: {req.approverName}</span>
                      <span>• {req.resolvedAt ? new Date(req.resolvedAt).toLocaleString() : ''}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {req.status === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => handleResolve(req.requestId, false)}
                        disabled={!canResolveRequests || req.applicantUserId === currentUser?.id}
                        className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 disabled:bg-zinc-900 disabled:text-zinc-600 border border-red-800 disabled:border-zinc-800 text-red-300 font-bold text-xs rounded-xl flex items-center gap-1.5 font-display disabled:cursor-not-allowed"
                      >
                        <XCircle size={15} />
                        <span>Rechazar</span>
                      </button>
                      <button
                        onClick={() => handleResolve(req.requestId, true)}
                        disabled={!canResolveRequests || req.applicantUserId === currentUser?.id}
                        className="px-3.5 py-2 bg-[#00ff41] hover:bg-[#00e038] disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold text-xs rounded-xl flex items-center gap-1.5 font-display disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 size={15} />
                        <span>Aprobar Operación</span>
                      </button>
                    </>
                  ) : (
                    <span className={`px-3 py-1 rounded-xl text-xs font-bold font-mono border ${
                      req.status === 'APPROVED' ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-red-950 text-red-400 border-red-800'
                    }`}>
                      {req.status === 'APPROVED' ? '● APROBADO' : '▲ RECHAZADO'}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {filteredRequests.length === 0 && (
              <div className="text-center p-8 bg-[#121217] border border-zinc-800 rounded-2xl text-zinc-500 text-xs">
                No existen solicitudes de aprobación registradas con el filtro seleccionado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BITÁCORA DE AUDITORÍA */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-[#121217] p-4 rounded-xl border border-zinc-800 text-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 text-zinc-500" size={16} />
              <input
                type="text"
                placeholder="Filtrar por trazabilidad, usuario o módulo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a0a0d] border border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-white outline-none focus:border-[#00ff41]"
              />
            </div>
            <div className="text-zinc-400 font-mono text-[11px]">
              Total Registros Inmutables: <strong className="text-[#00ff41]">{filteredAuditLogs.length}</strong>
            </div>
          </div>

          <div className="bg-[#121217] border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="bg-[#181820] text-zinc-400 uppercase font-mono text-[10px] tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="p-3.5">ID Trazabilidad</th>
                  <th className="p-3.5">Fecha / Hora</th>
                  <th className="p-3.5">Usuario Responsable</th>
                  <th className="p-3.5">Módulo / Entidad</th>
                  <th className="p-3.5">Acción Ejecutada</th>
                  <th className="p-3.5 text-center">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {filteredAuditLogs.map(log => (
                  <tr key={log.auditId} className="hover:bg-zinc-800/40">
                    <td className="p-3.5 text-amber-400 font-bold">{log.traceabilityId}</td>
                    <td className="p-3.5 text-zinc-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="p-3.5 font-bold text-white">{log.userFullName}</td>
                    <td className="p-3.5 text-[#00ff41]">{log.module}.{log.entity}</td>
                    <td className="p-3.5 text-zinc-200 font-sans">{log.action}</td>
                    <td className="p-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.result === 'SUCCESS' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-red-950 text-red-400 border border-red-800'
                      }`}>
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
