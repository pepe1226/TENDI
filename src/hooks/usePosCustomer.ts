import { useMemo, useState } from 'react';

export function usePosCustomer() {
  const [customerName, setCustomerName] = useState('CONSUMIDOR FINAL');
  const [customerRuc, setCustomerRuc] = useState('9999999999999');

  const customer = useMemo(() => {
    if (!customerRuc) return customerName;
    return `${customerName} ${customerRuc}`;
  }, [customerName, customerRuc]);

  const setCustomer = (fullCustomerString: string) => {
    const trimmed = (fullCustomerString || '').trim();
    if (!trimmed || trimmed === 'CONSUMIDOR FINAL 9999999999999' || trimmed === 'CONSUMIDOR FINAL') {
      setCustomerName('CONSUMIDOR FINAL');
      setCustomerRuc('9999999999999');
      return;
    }

    const lastSpaceIdx = trimmed.lastIndexOf(' ');
    if (lastSpaceIdx !== -1) {
      const possibleRuc = trimmed.substring(lastSpaceIdx + 1);
      if (/^[0-9A-Za-z]+$/.test(possibleRuc) && possibleRuc.length >= 5) {
        setCustomerName(trimmed.substring(0, lastSpaceIdx).trim());
        setCustomerRuc(possibleRuc);
        return;
      }
    }

    setCustomerName(trimmed);
    setCustomerRuc('');
  };

  return {
    customerName,
    setCustomerName,
    customerRuc,
    setCustomerRuc,
    customer,
    setCustomer,
  };
}
