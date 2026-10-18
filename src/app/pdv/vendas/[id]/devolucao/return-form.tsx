"use client";

import { useActionState, useState } from "react";
import { formatBRL } from "@/lib/money";
import { previewReturnValue } from "@/lib/returns-math";
import { PAYMENT_LABEL, PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales-constants";
import { createReturnAction, type SaleFormState } from "../../../actions";

export interface ReturnItem {
  id: string;
  description: string;
  kind: "PRODUCT" | "SERVICE" | "APPOINTMENT";
  unitPriceCents: number;
  quantity: number;
  returnedQuantity: number;
}
interface Option {
  id: string;
  name: string;
  priceCents: number;
}
interface ExchangeLine {
  kind: "PRODUCT" | "SERVICE";
  id: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

const field = { display: "block", width: "100%" } as const;
const initial: SaleFormState = {};
const KIND_LABEL = { PRODUCT: "Produto", SERVICE: "Serviço", APPOINTMENT: "Atendimento" } as const;

export function ReturnForm({
  saleId,
  sale,
  items,
  products,
  services,
}: {
  saleId: string;
  sale: { subtotalCents: number; totalCents: number; returnedValueCents: number; paymentMethod: PaymentMethod };
  items: ReturnItem[];
  products: Option[];
  services: Option[];
}) {
  const [state, action, pending] = useActionState(createReturnAction.bind(null, saleId), initial);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [refundMethod, setRefundMethod] = useState<string>(sale.paymentMethod);
  const [exLines, setExLines] = useState<ExchangeLine[]>([]);
  const [exProduct, setExProduct] = useState("");
  const [exProductQty, setExProductQty] = useState("1");
  const [exService, setExService] = useState("");
  const [exServiceQty, setExServiceQty] = useState("1");
  const [exPayment, setExPayment] = useState<string>(sale.paymentMethod);
  const [localError, setLocalError] = useState("");

  // quantidades válidas (inteiras, de 0 até o que ainda dá para devolver); o servidor confere tudo de novo
  const numeric: Record<string, number> = {};
  for (const it of items) {
    const raw = (qty[it.id] ?? "").trim();
    const n = /^\d{1,4}$/.test(raw) ? Number(raw) : 0;
    numeric[it.id] = Math.min(n, it.quantity - it.returnedQuantity);
  }
  const value = previewReturnValue({ ...sale, items }, numeric);
  const exchangeTotal = exLines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const applied = Math.min(value, exchangeTotal);
  const refund = value - applied;
  const due = exchangeTotal - applied;

  const itemsJson = JSON.stringify(
    Object.entries(numeric)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity })),
  );
  const exchangeJson = JSON.stringify(
    exLines.map((l) => (l.kind === "PRODUCT" ? { kind: "PRODUCT", productId: l.id, quantity: l.quantity } : { kind: "SERVICE", serviceId: l.id, quantity: l.quantity })),
  );

  const validQty = (raw: string) => /^\d{1,4}$/.test(raw.trim()) && Number(raw) >= 1;
  function addExchange(kind: "PRODUCT" | "SERVICE") {
    const list = kind === "PRODUCT" ? products : services;
    const chosen = list.find((o) => o.id === (kind === "PRODUCT" ? exProduct : exService));
    const rawQty = kind === "PRODUCT" ? exProductQty : exServiceQty;
    if (!chosen) return setLocalError(kind === "PRODUCT" ? "Escolha um produto para a troca" : "Escolha um serviço para a troca");
    if (!validQty(rawQty)) return setLocalError("Quantidade inválida (de 1 a 9999)");
    setLocalError("");
    const quantity = Number(rawQty);
    setExLines((prev) => {
      const existing = prev.find((l) => l.kind === kind && l.id === chosen.id);
      return existing
        ? prev.map((l) => (l === existing ? { ...l, quantity: Math.min(l.quantity + quantity, 9999) } : l))
        : [...prev, { kind, id: chosen.id, name: chosen.name, unitPriceCents: chosen.priceCents, quantity }];
    });
    if (kind === "PRODUCT") {
      setExProduct("");
      setExProductQty("1");
    } else {
      setExService("");
      setExServiceQty("1");
    }
  }

  const hasProducts = items.some((i) => i.kind === "PRODUCT");
  const error = localError || state.error;

  return (
    <form action={action} style={{ display: "grid", gap: "1.25rem" }}>
      <section>
        <h2>Itens a devolver</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Item</th>
              <th align="left">Tipo</th>
              <th align="left">Vendido</th>
              <th align="left">Já devolvido</th>
              <th align="left">Devolver</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const available = it.quantity - it.returnedQuantity;
              return (
                <tr key={it.id} data-testid="return-item">
                  <td>
                    {it.description} <small>({formatBRL(it.unitPriceCents)})</small>
                  </td>
                  <td>{KIND_LABEL[it.kind]}</td>
                  <td>{it.quantity}</td>
                  <td>{it.returnedQuantity}</td>
                  <td>
                    {available > 0 ? (
                      <input
                        aria-label={`Quantidade a devolver de ${it.description}`}
                        value={qty[it.id] ?? ""}
                        onChange={(e) => setQty((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        inputMode="numeric"
                        placeholder={`0 a ${available}`}
                        size={6}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <label>
          Motivo da devolução
          <input name="reason" value={reason} onChange={(e) => setReason(e.target.value)} style={field} />
        </label>
        {hasProducts && (
          <label>
            <input type="checkbox" name="restock" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Devolver os produtos ao estoque
          </label>
        )}
      </section>

      <fieldset style={{ display: "grid", gap: "0.5rem" }}>
        <legend>Troca (opcional)</legend>
        <label>
          Produto da troca
          <select data-testid="exchange-product-select" value={exProduct} onChange={(e) => setExProduct(e.target.value)} style={field}>
            <option value="">Selecione</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatBRL(p.priceCents)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade do produto da troca
          <input data-testid="exchange-product-qty" value={exProductQty} onChange={(e) => setExProductQty(e.target.value)} inputMode="numeric" style={field} />
        </label>
        <button type="button" onClick={() => addExchange("PRODUCT")}>
          Adicionar produto à troca
        </button>
        <label>
          Serviço da troca
          <select data-testid="exchange-service-select" value={exService} onChange={(e) => setExService(e.target.value)} style={field}>
            <option value="">Selecione</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatBRL(s.priceCents)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantidade do serviço da troca
          <input data-testid="exchange-service-qty" value={exServiceQty} onChange={(e) => setExServiceQty(e.target.value)} inputMode="numeric" style={field} />
        </label>
        <button type="button" onClick={() => addExchange("SERVICE")}>
          Adicionar serviço à troca
        </button>

        {exLines.length > 0 && (
          <ul>
            {exLines.map((l, i) => (
              <li key={`${l.kind}-${l.id}`} data-testid="exchange-line">
                {l.quantity} × {l.name} — {formatBRL(l.unitPriceCents * l.quantity)}{" "}
                <button type="button" aria-label={`Remover ${l.name} da troca`} onClick={() => setExLines((prev) => prev.filter((_, j) => j !== i))}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <section>
        <p>
          Valor devolvido: <strong data-testid="return-value">{formatBRL(value)}</strong>
        </p>
        {exLines.length > 0 && (
          <>
            <p>
              Valor da troca: <span data-testid="exchange-total">{formatBRL(exchangeTotal)}</span>
            </p>
            <p>
              Crédito aplicado na troca: <span data-testid="return-applied">{formatBRL(applied)}</span>
            </p>
          </>
        )}
        <p>
          Dinheiro a devolver ao cliente: <strong data-testid="return-refund">{formatBRL(refund)}</strong>
        </p>
        {exLines.length > 0 && (
          <p>
            Diferença a pagar pelo cliente: <strong data-testid="return-due">{formatBRL(due)}</strong>
          </p>
        )}
      </section>

      {refund > 0 && (
        <label>
          Forma de devolução do dinheiro
          <select name="refundMethod" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={field}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      )}
      {due > 0 && (
        <label>
          Forma de pagamento da diferença
          <select name="exchangePayment" value={exPayment} onChange={(e) => setExPayment(e.target.value)} style={field}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
      )}

      <input type="hidden" name="items" value={itemsJson} />
      <input type="hidden" name="exchangeItems" value={exchangeJson} />
      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Registrando..." : exLines.length > 0 ? "Registrar troca" : "Registrar devolução"}
      </button>
    </form>
  );
}
