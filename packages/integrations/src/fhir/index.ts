/**
 * Minimal FHIR R4 client interface. Concrete implementations for Epic,
 * Cerner, and generic SMART-on-FHIR live alongside this file.
 */
export interface FhirClient {
  readonly baseUrl: string;
  read<T>(resourceType: string, id: string): Promise<T>;
  search<T>(resourceType: string, params: Record<string, string>): Promise<T>;
}

export function createFhirClient(baseUrl = process.env.FHIR_BASE_URL): FhirClient {
  if (!baseUrl) {
    throw new Error("FHIR_BASE_URL is required");
  }
  return {
    baseUrl,
    async read<T>(resourceType: string, id: string): Promise<T> {
      const res = await fetch(`${baseUrl}/${resourceType}/${id}`, {
        headers: { accept: "application/fhir+json" },
      });
      if (!res.ok) {
        throw new Error(`FHIR read ${resourceType}/${id} failed: ${res.status}`);
      }
      return (await res.json()) as T;
    },
    async search<T>(resourceType: string, params: Record<string, string>): Promise<T> {
      const url = `${baseUrl}/${resourceType}?${new URLSearchParams(params).toString()}`;
      const res = await fetch(url, { headers: { accept: "application/fhir+json" } });
      if (!res.ok) {
        throw new Error(`FHIR search ${resourceType} failed: ${res.status}`);
      }
      return (await res.json()) as T;
    },
  };
}
