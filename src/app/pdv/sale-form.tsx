"use client";

import { useActionState, useState } from "react";
import { formatBRL, parsePriceToCents } from "@/lib/money";
import { PAYMENT_LABEL, PAYMENT_METHODS } from "@/lib/sales-constants";
import { createSaleAction, type SaleFormState } from "./actions";

export interface ProductOption {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}
export interface AppointmentOption {
  id: string;
  label: string;
  priceCents: number;
  customerId: string;
}
export interface CustomerOption {
  id: string;
  name: string;
}

type Line =
  | { kind: "PRODUCT"; productId: string; name: string; unitPriceCents: number; quantity: number; stock: number }
  | { kind: "APPOINTMENT"; appointmentId: string; name: string; unitPriceCents: number; customerId: string };

const field = { display: "block", width: "100%" } as const;
const initial: SaleFormState = {};

export function SaleForm({
  products,
  appointments,
  customers,
  initialAppointmentId,
}: {
  products: ProductOption[];
  appointments: AppointmentOption[];
  customers: CustomerOption[];
  initialAppointmentId?: string;
}) {
  const [state, action, pending] = useActionState(createSaleAction, initial);

  const [lines, setLines] = useState<Line[]>(() => {
    const a = appointments.find((x) => x.id === initialAppointmentId);
    return a ? [{ kind: "APPOINTMENT", appointmentId: a.id, name: a.label, unitPriceCents: a.priceCents, customerId: a.customerId }] : [];
  });
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [appointmentId, setAppointmentId] = useState("");
  const [localError, setLocalError] = useState("");
  const [payment, setPayment] = useState("");
  const [discount, setDiscount] = useState("");
  const [customerChoice, setCustomerChoice] = useState("");
  const [notes, setNotes] = useState("");

  const appointmentLine = lines.find((l) => l.kind === "APPOINTMENT");
  const customerId = appointmentLine?.kind === "APPOINTMENT" ? appointmentLine.customerId : customerChoice;

  function addProduct() {
    const p = products.find((x) => x.id === productId);
    if (!p) return setLocalError("Escolha um produto");
    if (!/^\d{1,4}$/.test(quantity.trim()) || Number(quantity) < 1) return setLocalError("Quantidade inválida (de 1 a 9999)");
    setLocalError("");
    const qty = Number(quantity);
    setLines((prev) => {
      const existing = prev.find((l) => l.kind === "PRODUCT" && l.productId === p.id);
      if (existing && existing.kind === "PRODUCT") {
        return prev.map((l) => (l === existing ? { ...existing, quantity: Math.min(existing.quantity + qty, 9999) } : l));
      }
      return [...prev, { kind: "PRODUCT", productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: qty, stock: p.stock }];
    });
    setProductId("");
    setQuantity("1");
  }

  function addAppointment() {
    const a = appointments.find((x) => x.id === appointmentId);
    if (!a) return setLocalError("Escolha um atendimento");
    if (appointmentLine && appointmentLine.kind === "APPOINTMENT" && appointmentLine.customerId !== a.customerId) {
      return setLocalError("Os atendimentos da venda devem ser do mesmo cliente");
    }
    setLocalError("");
    setLines((prev) =>
      prev.some((l) => l.kind === "APPOINTMENT" && l.appointmentId === a.id)
        ? prev
        : [...prev, { kind: "APPOINTMENT", appointmentId: a.id, name: a.label, unitPriceCents: a.priceCents, customerId: a.customerId }],
    );
    setAppointmentId("");
  }

  function setLineQuantity(index: number, raw: string) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index || l.kind !== "PRODUCT") return l;
        const n = /^\d{1,4}$/.test(raw.trim()) ? Math.max(1, Number(raw)) : l.quantity;
        return { ...l, quantity: n };
      }),
    );
  }

  const lineTotal = (l: Line) => (l.kind === "PRODUCT" ? l.unitPriceCents * l.quantity : l.unitPriceCents);
  const subtotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  const parsedDiscount = discount.trim() === "" ? 0 : (parsePriceToCents(discount) ?? 0);
  const total = Math.max(subtotal - parsedDiscount, 0);

  const itemsJson = JSON.stringify(
    lines.map((l) =>
      l.kind === "PRODUCT"
        ? { kind: "PRODUCT", productId: l.productId, quantity: l.quantity }
        : { kind: "APPOINTMENT", appointmentId: l.appointmentId },
    ),
  );
  const error = localError || state.error;

  return (
    <form action={action} style={{ display: "grid", gap: "1.25rem" }}>
      <fieldset style={{ display: "grid", gap: "0.5rem" }}>
        <legend>Produtos</legend>
        <label>
          Produto
          <select value={productId} onChange={(e) => setProductId(e.target.value)} style={field}>
            <option value="">Selecione</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatBRL(p.priceCents)} — estoque {p.stock}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade
          <input value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" style={field} />
        </label>
        <button type="button" onClick={addProduct}>
          Adicionar produto
        </button>
      </fieldset>

      <fieldset style={{ display: "grid", gap: "0.5rem" }}>
        <legend>Atendimentos</legend>
        <label>
          Atendimento concluído
          <select value={appointmentId} onChange={(e) => setAppointmentId(e.target.value)} style={field}>
            <option value="">Selecione</option>
            {appointments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={addAppointment}>
          Adicionar atendimento
        </button>
      </fieldset>

      <section>
        <h2>Itens da venda</h2>
        {lines.length === 0 ? (
          <p>Nenhum item adicionado.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Item</th>
                <th align="left">Qtd</th>
                <th align="left">Unitário</th>
                <th align="left">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.kind === "PRODUCT" ? `p-${l.productId}` : `a-${l.appointmentId}`} data-testid="cart-line">
                  <td>{l.name}</td>
                  <td>
                    {l.kind === "PRODUCT" ? (
                      <input
                        aria-label={`Quantidade de ${l.name}`}
                        value={l.quantity}
                        onChange={(e) => setLineQuantity(i, e.target.value)}
                        inputMode="numeric"
                        size={4}
                      />
                    ) : (
                      1
                    )}
                  </td>
                  <td>{formatBRL(l.unitPriceCents)}</td>
                  <td>{formatBRL(lineTotal(l))}</td>
                  <td>
                    <button type="button" aria-label={`Remover ${l.name}`} onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <label>
          Cliente (opcional)
          <select
            value={customerId}
            onChange={(e) => setCustomerChoice(e.target.value)}
            disabled={Boolean(appointmentLine)}
            style={field}
          >
            <option value="">Sem cliente</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <input type="hidden" name="customerId" value={customerId} />
        <label>
          Forma de pagamento
          <select name="paymentMethod" value={payment} onChange={(e) => setPayment(e.target.value)} style={field}>
            <option value="">Selecione</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desconto (R$)
          <input name="discount" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" style={field} />
        </label>
        <label>
          Observações
          <input name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={field} />
        </label>
      </section>

      <section>
        <p>
          Subtotal: <span data-testid="cart-subtotal">{formatBRL(subtotal)}</span>
        </p>
        <p>
          Desconto: <span data-testid="cart-discount">{formatBRL(parsedDiscount)}</span>
        </p>
        <p>
          <strong>
            Total: <span data-testid="cart-total">{formatBRL(total)}</span>
          </strong>
        </p>
      </section>

      <input type="hidden" name="items" value={itemsJson} />
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Finalizando..." : "Finalizar venda"}
      </button>
    </form>
  );
}
