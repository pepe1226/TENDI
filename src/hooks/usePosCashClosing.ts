import { useMemo, useState } from 'react';

interface UsePosCashClosingOptions {
  salesHistory: any[];
}

export const usePosCashClosing = ({ salesHistory }: UsePosCashClosingOptions) => {
  const [movements, setMovements] = useState<any[]>([]);
  const [dineroInicial, setDineroInicial] = useState<number | null>(0);
  const [physicalCash, setPhysicalCash] = useState('');
  const [cierreNotes, setCierreNotes] = useState('');
  const [showBillCounter, setShowBillCounter] = useState(false);
  const [billCounts, setBillCounts] = useState<Record<string, number>>({
    b100: 0,
    b50: 0,
    b20: 0,
    b10: 0,
    b5: 0,
    b1: 0,
    m1: 0,
    m050: 0,
    m025: 0,
    m010: 0,
    m005: 0,
    m001: 0,
  });

  const calculatedBillTotal = useMemo(() =>
    (billCounts.b100 || 0) * 100 +
    (billCounts.b50 || 0) * 50 +
    (billCounts.b20 || 0) * 20 +
    (billCounts.b10 || 0) * 10 +
    (billCounts.b5 || 0) * 5 +
    (billCounts.b1 || 0) +
    (billCounts.m1 || 0) +
    (billCounts.m050 || 0) * 0.50 +
    (billCounts.m025 || 0) * 0.25 +
    (billCounts.m010 || 0) * 0.10 +
    (billCounts.m005 || 0) * 0.05 +
    (billCounts.m001 || 0) * 0.01,
  [billCounts]);

  const turnSalesSummary = useMemo(() => {
    let efectivo = 0;
    let transferencia = 0;
    let tarjeta = 0;
    let credito = 0;
    const count = salesHistory.length;

    salesHistory.forEach(sale => {
      if (sale.paymentLines && Array.isArray(sale.paymentLines) && sale.paymentLines.length > 0) {
        sale.paymentLines.forEach((line: any) => {
          const type = (line.type || '').toUpperCase();
          const value = Number(line.value) || 0;
          if (type.includes('TRANSFER') || type.includes('BANCO') || type.includes('DEUNA')) {
            transferencia += value;
          } else if (type.includes('TARJETA') || type.includes('CARD')) {
            tarjeta += value;
          } else if (type.includes('CREDIT') || type.includes('FIAR')) {
            credito += value;
          } else {
            efectivo += value;
          }
        });
        return;
      }

      const method = (sale.paymentMethod || 'EFECTIVO').toUpperCase();
      const value = Number(sale.total) || 0;
      if (method.includes('TRANSFER') || method.includes('BANCO') || method.includes('DEUNA')) {
        transferencia += value;
      } else if (method.includes('TARJETA') || method.includes('CARD')) {
        tarjeta += value;
      } else if (method.includes('CREDIT') || method.includes('FIAR')) {
        credito += value;
      } else {
        efectivo += value;
      }
    });

    return {
      count,
      efectivo,
      transferencia,
      tarjeta,
      credito,
      total: efectivo + transferencia + tarjeta + credito,
    };
  }, [salesHistory]);

  const turnMovementsSummary = useMemo(() => {
    let ingresos = 0;
    let egresos = 0;
    let comprasEfectivo = 0;
    let egresosVarios = 0;
    const egresosList: Array<{
      id: string | number;
      reason: string;
      amount: number;
      time: string;
      paymentMethod: string;
      observation: string;
    }> = [];

    movements.forEach(movement => {
      const type = (movement.type || '').toLowerCase();
      const reason = movement.reason || movement.description || '';
      const reasonUpper = reason.toUpperCase();
      const amount = Number(movement.amount) || 0;

      if (type === 'in' || type === 'entrada' || type === 'ingreso') {
        if (!reasonUpper.includes('VENTA POS') && type !== 'inicial') ingresos += amount;
        return;
      }

      if (type !== 'out' && type !== 'salida' && type !== 'egreso') return;
      if (type === 'corte' || type === 'transferencia' || reasonUpper.includes('CORTE') || reasonUpper.includes('RECOLECCIÓN')) return;

      egresos += amount;
      if (reasonUpper.includes('COMPRA')) comprasEfectivo += amount;
      else egresosVarios += amount;

      egresosList.push({
        id: movement.id || Math.random(),
        reason,
        amount,
        time: movement.timestamp
          ? new Date(movement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '',
        paymentMethod: movement.paymentMethod || 'EFECTIVO',
        observation: movement.observation || '',
      });
    });

    return { ingresos, egresos, comprasEfectivo, egresosVarios, egresosList };
  }, [movements]);

  const efectivoEsperado = useMemo(() =>
    (dineroInicial || 0) +
    turnSalesSummary.efectivo +
    turnMovementsSummary.ingresos -
    turnMovementsSummary.egresos,
  [dineroInicial, turnSalesSummary, turnMovementsSummary]);

  return {
    movements,
    setMovements,
    dineroInicial,
    setDineroInicial,
    physicalCash,
    setPhysicalCash,
    cierreNotes,
    setCierreNotes,
    showBillCounter,
    setShowBillCounter,
    billCounts,
    setBillCounts,
    calculatedBillTotal,
    turnSalesSummary,
    turnMovementsSummary,
    efectivoEsperado,
  };
};
