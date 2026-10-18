"use client";

import { useActionState } from "react";
import { UFS } from "@/lib/br-validators";
import { TAX_REGIMES, TAX_REGIME_LABEL } from "@/lib/fiscal-constants";
import { saveCompanyAction, type CompanyFormState } from "./actions";

const field = { display: "block", width: "100%" } as const;
const initial: CompanyFormState = {};

export function CompanyForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, action, pending] = useActionState(saveCompanyAction, initial);
  const v = (k: string) => state.values?.[k] ?? defaults[k] ?? "";
  return (
    <form action={action} style={{ display: "grid", gap: "0.75rem" }}>
      <label>
        Nome do pet shop
        <input name="name" required defaultValue={v("name")} style={field} />
      </label>
      <label>
        Razão social
        <input name="legalName" defaultValue={v("legalName")} style={field} />
      </label>
      <label>
        CNPJ
        <input name="cnpj" inputMode="numeric" defaultValue={v("cnpj")} placeholder="00.000.000/0000-00" style={field} />
      </label>
      <label>
        Inscrição estadual
        <input name="stateRegistration" defaultValue={v("stateRegistration")} style={field} />
      </label>
      <label>
        Inscrição municipal
        <input name="municipalRegistration" defaultValue={v("municipalRegistration")} style={field} />
      </label>
      <label>
        Regime tributário
        <select name="taxRegime" defaultValue={v("taxRegime")} style={field}>
          <option value="">Não informado</option>
          {TAX_REGIMES.map((r) => (
            <option key={r} value={r}>
              {TAX_REGIME_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Endereço
        <input name="addressLine" defaultValue={v("addressLine")} style={field} />
      </label>
      <label>
        Cidade
        <input name="city" defaultValue={v("city")} style={field} />
      </label>
      <label>
        UF
        <select name="state" defaultValue={v("state")} style={field}>
          <option value="">Não informado</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label>
        CEP
        <input name="zipCode" inputMode="numeric" defaultValue={v("zipCode")} placeholder="00000-000" style={field} />
      </label>
      <label>
        Telefone
        <input name="phone" type="tel" defaultValue={v("phone")} style={field} />
      </label>
      {state.error && (
        <p role="alert" style={{ color: "crimson" }}>
          {state.error}
        </p>
      )}
      {state.saved && <p role="status">Dados salvos.</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "Salvar dados da empresa"}
      </button>
    </form>
  );
}
