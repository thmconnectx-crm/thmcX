import { z } from "zod";
import { env } from "../config.js";
import { assertDb, supabase } from "../db.js";
import { HttpError } from "../http/errors.js";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
};

export const prospectingSearchSchema = z.object({
  keyword: z.string().min(2),
  city: z.string().optional().nullable(),
  max_results: z.coerce.number().int().min(1).max(20).default(10),
  filters: z
    .object({
      has_website: z.boolean().optional()
    })
    .default({})
});

export const prospectingCompanyFiltersSchema = z.object({
  search_id: z.string().uuid().optional(),
  city: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  has_website: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === true || value === "true"))
});

export async function searchProspects(tenantId: string, input: z.infer<typeof prospectingSearchSchema>) {
  const payload = prospectingSearchSchema.parse(input);
  const search = assertDb(
    await supabase
      .from("prospecting_searches")
      .insert({
        tenant_id: tenantId,
        keyword: payload.keyword,
        city: payload.city ?? null,
        status: "running",
        filters: payload.filters
      })
      .select("*")
      .single()
  );

  if (!env.GOOGLE_PLACES_API_KEY) {
    const updatedSearch = await updateSearch(search.id, tenantId, {
      status: "missing_api_key",
      error_message: "Configure GOOGLE_PLACES_API_KEY no ambiente da API para buscar empresas no Google Places."
    });
    return { search: updatedSearch, companies: [] };
  }

  try {
    const places = await fetchGooglePlaces(payload.keyword, payload.city ?? "", payload.max_results);
    const companies = places
      .filter((place) => Boolean(place.id))
      .map((place) => normalizePlace(tenantId, search.id, payload.keyword, payload.city ?? null, place))
      .filter((company) =>
        typeof payload.filters.has_website === "boolean" ? company.has_website === payload.filters.has_website : true
      );

    const savedCompanies = companies.length
      ? (assertDb(
          await supabase
            .from("prospecting_companies")
            .upsert(companies, { onConflict: "tenant_id,google_place_id" })
            .select("*")
        ) ?? [])
      : [];

    const updatedSearch = await updateSearch(search.id, tenantId, {
      status: "completed",
      results_count: savedCompanies.length,
      error_message: null
    });

    return { search: updatedSearch, companies: savedCompanies };
  } catch (error) {
    const updatedSearch = await updateSearch(search.id, tenantId, {
      status: "error",
      error_message: error instanceof Error ? error.message : "Nao foi possivel consultar o Google Places."
    });
    return { search: updatedSearch, companies: [] };
  }
}

export async function listProspectingSearches(tenantId: string) {
  return (
    assertDb(
      await supabase
        .from("prospecting_searches")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(30)
    ) ?? []
  );
}

export async function listProspectingCompanies(
  tenantId: string,
  filters: z.infer<typeof prospectingCompanyFiltersSchema>
) {
  let query = supabase
    .from("prospecting_companies")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters.search_id) query = query.eq("search_id", filters.search_id);
  if (filters.city) query = query.ilike("city", `%${filters.city}%`);
  if (filters.status) query = query.eq("status", filters.status);
  if (typeof filters.has_website === "boolean") query = query.eq("has_website", filters.has_website);
  if (filters.q) query = query.ilike("name", `%${filters.q}%`);

  return assertDb(await query) ?? [];
}

export async function convertProspectingCompanyToLead(tenantId: string, companyId: string) {
  const company = assertDb(
    await supabase
      .from("prospecting_companies")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", companyId)
      .single()
  );

  const phone = normalizePhone(company.phone);
  if (!phone) throw new HttpError(400, "Este prospect ainda nao tem telefone valido para virar lead.");

  const tags = uniqueTags([...(company.tags ?? []), "prospeccao", company.has_website ? "com_site" : "sem_site"]);
  const leadPayload = {
    tenant_id: tenantId,
    name: company.name,
    phone,
    company: company.name,
    city: company.city,
    niche: company.niche,
    source: "Google Places",
    source_type: "prospecting_google_places",
    status: "prospect_frio",
    tags,
    observations: buildLeadObservation(company.website, company.address),
    opt_in_status: "unknown",
    opt_out: false,
    updated_at: new Date().toISOString()
  };

  const lead = assertDb(
    await supabase.from("leads").upsert(leadPayload, { onConflict: "tenant_id,phone" }).select("*").single()
  );

  const updatedCompany = assertDb(
    await supabase
      .from("prospecting_companies")
      .update({ status: "converted", lead_id: lead.id, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", companyId)
      .select("*")
      .single()
  );

  return { lead, company: updatedCompany };
}

async function fetchGooglePlaces(keyword: string, city: string, maxResults: number) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus"
    },
    body: JSON.stringify({
      textQuery: `${keyword} ${city}`.trim(),
      languageCode: "pt-BR",
      maxResultCount: maxResults
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Places retornou erro ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }

  const payload = (await response.json()) as { places?: GooglePlace[] };
  return payload.places ?? [];
}

function normalizePlace(tenantId: string, searchId: string, keyword: string, city: string | null, place: GooglePlace) {
  const website = place.websiteUri ?? null;
  return {
    tenant_id: tenantId,
    search_id: searchId,
    google_place_id: place.id,
    name: place.displayName?.text ?? "Empresa sem nome",
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null,
    website,
    address: place.formattedAddress ?? null,
    city,
    niche: keyword,
    rating: place.rating ?? null,
    reviews_count: place.userRatingCount ?? 0,
    business_status: place.businessStatus ?? null,
    has_website: Boolean(website),
    status: "prospect",
    tags: uniqueTags(["google_places", slugify(keyword), city ? slugify(city) : ""]),
    raw_payload: place,
    updated_at: new Date().toISOString()
  };
}

async function updateSearch(id: string, tenantId: string, values: Record<string, unknown>) {
  return assertDb(
    await supabase
      .from("prospecting_searches")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .single()
  );
}

function normalizePhone(phone?: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "";
  return digits;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function uniqueTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
}

function buildLeadObservation(website?: string | null, address?: string | null) {
  const details = ["Origem: pesquisa no Google Places."];
  if (website) details.push(`Site encontrado: ${website}.`);
  if (address) details.push(`Endereco: ${address}.`);
  details.push("Opt-in nao confirmado. Validar permissao antes de campanha ativa.");
  return details.join(" ");
}
