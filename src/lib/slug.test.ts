import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("remove acentos, pontuação e usa hífens", () => {
    expect(slugify("Pet Shop do João!")).toBe("pet-shop-do-joao");
  });
  it("não deixa hífens nas pontas", () => {
    expect(slugify("  ---Au Au---  ")).toBe("au-au");
  });
  it("usa um valor padrão quando não sobra nada", () => {
    expect(slugify("!!!")).toBe("petshop");
  });
});
