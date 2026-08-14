import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Delete, Check, X, ShieldAlert } from 'lucide-react';
import { SystemUser } from '../types';

interface PosPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: SystemUser) => void;
  users: SystemUser[];
}

export const PosPinModal: React.FC<PosPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  users = []
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const usersWithPin = useMemo(
    () => users.filter(user => {
      const permissions = (user as any).permissions;
      return user.active && /^\d{4}$/.test(user.pin) && (!permissions || permissions.pos_access === true);
    }),
    [users]
  );

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError(false);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleClear = () => {
    setPin('');
    setError(false);
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  };

  const verifyPin = (inputPin: string) => {
    const matchedUser = usersWithPin.find(user => user.pin === inputPin);
    if (matchedUser) {
      onSuccess(matchedUser);
      setPin('');
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setPin(''), 400);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-[#121216] border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative flex flex-col items-center">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-[#00ff41]/10 border border-[#00ff41]/30 flex items-center justify-center mb-3">
          <Lock className="text-[#00ff41]" size={24} />
        </div>

        <h3 className="font-display font-black text-white text-lg tracking-wide uppercase text-center">
          ACCESO AL PUNTO DE VENTA
        </h3>
        <p className="text-zinc-400 text-xs text-center mb-4">
          Ingrese el PIN de facturación de un usuario activo
        </p>

        {usersWithPin.length === 0 && (
          <div className="w-full mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs font-bold text-amber-300">
            No hay usuarios activos con PIN configurado. Créelo en Administración, Usuarios y Roles.
          </div>
        )}

        {/* PIN Display */}
        <div className={`w-full bg-[#0a0a0d] border ${error ? 'border-red-500 bg-red-500/10' : 'border-zinc-800'} rounded-xl py-3 px-4 mb-4 flex justify-center items-center gap-3 transition-all`}>
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                idx < pin.length
                  ? error
                    ? 'bg-red-500 border-red-400 scale-110 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
                    : 'bg-[#00ff41] border-[#00ff41] scale-110 shadow-[0_0_8px_rgba(0,255,65,0.8)]'
                  : 'bg-zinc-900 border-zinc-700'
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-1.5 text-red-400 text-xs font-bold mb-3 animate-bounce">
            <ShieldAlert size={14} />
            <span>Clave incorrecta. Intente de nuevo.</span>
          </div>
        )}

        {/* Touch Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              disabled={usersWithPin.length === 0}
              className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-display font-black text-xl py-3.5 rounded-xl shadow transition-all flex items-center justify-center border border-amber-300"
            >
              {num}
            </button>
          ))}

          <button
            type="button"
            onClick={handleClear}
            disabled={usersWithPin.length === 0}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm py-3.5 rounded-xl transition-all border border-zinc-700"
          >
            C
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            disabled={usersWithPin.length === 0}
            className="bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-display font-black text-xl py-3.5 rounded-xl shadow transition-all flex items-center justify-center border border-amber-300"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            disabled={usersWithPin.length === 0}
            className="bg-red-900/60 hover:bg-red-800 text-red-200 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center border border-red-700/50"
          >
            <Delete size={20} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => verifyPin(pin)}
          disabled={usersWithPin.length === 0 || pin.length !== 4}
          className="mt-4 w-full bg-[#00ff41] hover:bg-[#00e038] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none text-black font-display font-black py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_15px_rgba(0,255,65,0.2)]"
        >
          <Check size={18} />
          <span>INGRESAR AL POS</span>
        </button>

      </div>
    </div>
  );
};
