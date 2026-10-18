"use client";

import type { ReactNode } from "react";

/** Botão de submit que pede confirmação antes de uma exclusão. */
export function ConfirmSubmit({ message, children }: { message: string; children: ReactNode }) {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
