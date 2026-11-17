import { cofactoryEnabled } from "./feature-flags";

export const PRODUCT_NAME = "dusk bot";
export const COFACTORY_NAME = "Cofactory";

export function productName(): string {
  return cofactoryEnabled() ? COFACTORY_NAME : PRODUCT_NAME;
}

/** The hosted place bots can live, by the product's own name. */
export function cloudName(): string {
  return cofactoryEnabled() ? "Cofactory cloud" : "dusk cloud";
}
