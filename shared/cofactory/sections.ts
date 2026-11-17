/** The sidebar section a Cofactory seat is created in: one for the factory, one per company. */
export function cofactorySection(companyName: string | null): string {
  return `${SECTION_PREFIX}${companyName ?? "Factory"}`;
}

/** Whether a sidebar section is one Cofactory made, so the company rail may hide it when it is out of scope. */
export function isCofactorySection(name: string): boolean {
  return name.startsWith(SECTION_PREFIX);
}

const SECTION_PREFIX = "Cofactory · ";
