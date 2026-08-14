import { useMemo, useState } from 'react';

export interface Product {
  id: number | string;
  code: string;
  name: string;
  price: number;
  stock: number;
  salesCount?: number;
  image?: string;
  sellByWeight?: boolean;
  saleUnit?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

interface PosTicket {
  id: number;
  cart: CartItem[];
}

export const usePosCart = () => {
  const [tickets, setTickets] = useState<PosTicket[]>([{ id: 1, cart: [] }]);
  const [activeTicketId, setActiveTicketId] = useState(1);

  const activeTicket = tickets.find(ticket => ticket.id === activeTicketId) ?? tickets[0];
  const cart = activeTicket.cart;
  const total = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const updateActiveCart = (newCart: CartItem[]) => {
    setTickets(previous => previous.map(ticket =>
      ticket.id === activeTicketId ? { ...ticket, cart: newCart } : ticket,
    ));
  };

  const addTicket = () => {
    const newId = Math.max(...tickets.map(ticket => ticket.id)) + 1;
    setTickets(previous => [...previous, { id: newId, cart: [] }]);
    setActiveTicketId(newId);
  };

  const removeTicket = (id: number) => {
    if (tickets.length === 1) return false;

    const remainingTickets = tickets.filter(ticket => ticket.id !== id);
    setTickets(remainingTickets);
    if (activeTicketId === id) setActiveTicketId(remainingTickets[0].id);
    return true;
  };

  return {
    tickets,
    activeTicketId,
    cart,
    total,
    updateActiveCart,
    addTicket,
    removeTicket,
  };
};
