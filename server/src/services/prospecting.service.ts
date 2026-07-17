import { createHash } from "node:crypto";
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

type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

type AiProspect = {
  name?: string;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  source_url?: string | null;
  notes?: string | null;
};

export const prospectingSearchSchema = z.object({
  keyword: z.string().min(2),
  city: z.string().optional().nullable(),
  source_provider: z.enum(["ai_search", "osm", "google_places"]).default("ai_search"),
  max_results: z.coerce.number().int().min(1).max(20).default(10),
  filters: z
    .object({
      has_website: z.boolean().optional()
    })
    .default({})
});

export const prospectingCompanyFiltersSchema = z.object({
  search_id: z.string().uuid().optional(),
  source_provider: z.enum(["ai_search", "osm", "google_places"]).optional(),
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
        filters: { ...payload.filters, source_provider: payload.source_provider }
      })
      .select("*")
      .single()
  );

  if (payload.source_provider === "ai_search" && !env.GEMINI_API_KEY) {
    const updatedSearch = await updateSearch(search.id, tenantId, {
      status: "missing_api_key",
      error_message: "Configure GEMINI_API_KEY no ambiente da API para usar a prospeccao assistida por IA."
    });
    return { search: updatedSearch, companies: [] };
  }

  if (payload.source_provider === "google_places" && !env.GOOGLE_PLACES_API_KEY) {
    const updatedSearch = await updateSearch(search.id, tenantId, {
      status: "missing_api_key",
      error_message: "Configure GOOGLE_PLACES_API_KEY no ambiente da API para buscar empresas no Google Places."
    });
    return { search: updatedSearch, companies: [] };
  }

  try {
    const rawCompanies =
      payload.source_provider === "ai_search"
        ? (await fetchAiProspects(payload.keyword, payload.city ?? "", payload.max_results)).map((company) =>
            normalizeAiProspect(tenantId, search.id, payload.keyword, payload.city ?? null, company)
          )
        : payload.source_provider === "google_places"
        ? (await fetchGooglePlaces(payload.keyword, payload.city ?? "", payload.max_results))
            .filter((place) => Boolean(place.id))
            .map((place) => normalizeGooglePlace(tenantId, search.id, payload.keyword, payload.city ?? null, place))
        : (await fetchOsmCompanies(payload.keyword, payload.city ?? "", payload.max_results)).map((element) =>
            normalizeOsmElement(tenantId, search.id, payload.keyword, payload.city ?? null, element)
          );

    const companies = rawCompanies
      .filter((company) =>
        typeof payload.filters.has_website === "boolean" ? company.has_website === payload.filters.has_website : true
      );

    const savedCompanies = companies.length
      ? (assertDb(
          await supabase
            .from("prospecting_companies")
            .upsert(companies, { onConflict: "tenant_id,source_provider,external_id" })
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
      error_message: error instanceof Error ? error.message : "Nao foi possivel consultar a fonte de prospeccao."
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
  if (filters.source_provider) query = query.eq("source_provider", filters.source_provider);
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
    source:
      company.source_provider === "ai_search"
        ? "IA com busca web"
        : company.source_provider === "google_places"
          ? "Google Places"
          : "OpenStreetMap",
    source_type: `prospecting_${company.source_provider}`,
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

async function fetchAiProspects(keyword: string, city: string, maxResults: number) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      model: env.GEMINI_MODEL,
      input: buildAiProspectingPrompt(keyword, city, maxResults),
      tools: [{ type: "google_search" }]
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Gemini Search retornou erro ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }

  const payload = (await response.json()) as { output_text?: string; steps?: unknown[] };
  const text = payload.output_text || extractInteractionOutputText(payload);
  return parseAiProspects(text).slice(0, maxResults);
}

async function fetchOsmCompanies(keyword: string, city: string, maxResults: number) {
  if (!city.trim()) throw new Error("Informe uma cidade para buscar empresas pelo OpenStreetMap.");

  const query = buildOverpassQuery(keyword, city, maxResults);
  const response = await fetch(env.OVERPASS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "ThM ConnectX prospecting MVP"
    },
    body: new URLSearchParams({ data: query })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenStreetMap/Overpass retornou erro ${response.status}${detail ? `: ${detail.slice(0, 220)}` : ""}`);
  }

  const payload = (await response.json()) as { elements?: OsmElement[] };
  return (payload.elements ?? []).filter((element) => Boolean(element.tags?.name)).slice(0, maxResults);
}

function normalizeAiProspect(tenantId: string, searchId: string, keyword: string, city: string | null, company: AiProspect) {
  const website = company.website || company.source_url || null;
  const externalId = createHash("sha256")
    .update(`${company.name ?? ""}|${company.city ?? city ?? ""}|${company.source_url ?? company.website ?? ""}`)
    .digest("hex");

  return {
    tenant_id: tenantId,
    search_id: searchId,
    source_provider: "ai_search",
    external_id: externalId,
    google_place_id: null,
    name: company.name ?? "Empresa sem nome",
    phone: company.phone ?? null,
    website,
    address: company.address ?? null,
    city: company.city ?? city,
    niche: keyword,
    rating: null,
    reviews_count: 0,
    business_status: "NEEDS_REVIEW",
    has_website: Boolean(website),
    status: "prospect",
    tags: uniqueTags(["ia_busca_web", slugify(keyword), city ? slugify(city) : ""]),
    notes: company.notes ?? "Prospect sugerido por IA com busca web. Validar dados antes de contato.",
    raw_payload: company,
    updated_at: new Date().toISOString()
  };
}

function normalizeGooglePlace(tenantId: string, searchId: string, keyword: string, city: string | null, place: GooglePlace) {
  const website = place.websiteUri ?? null;
  return {
    tenant_id: tenantId,
    search_id: searchId,
    source_provider: "google_places",
    external_id: place.id,
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

function normalizeOsmElement(tenantId: string, searchId: string, keyword: string, city: string | null, element: OsmElement) {
  const tags = element.tags ?? {};
  const website = tags.website ?? tags["contact:website"] ?? tags.url ?? null;
  const phone = tags.phone ?? tags["contact:phone"] ?? tags.mobile ?? tags["contact:mobile"] ?? null;
  const address = formatOsmAddress(tags);
  const externalId = `${element.type}:${element.id}`;

  return {
    tenant_id: tenantId,
    search_id: searchId,
    source_provider: "osm",
    external_id: externalId,
    google_place_id: null,
    name: tags.name ?? "Empresa sem nome",
    phone,
    website,
    address,
    city: city ?? tags["addr:city"] ?? null,
    niche: keyword,
    rating: null,
    reviews_count: 0,
    business_status: tags.opening_hours ? "OPERATIONAL" : null,
    has_website: Boolean(website),
    status: "prospect",
    tags: uniqueTags(["openstreetmap", slugify(keyword), city ? slugify(city) : "", tags.shop ?? "", tags.amenity ?? ""]),
    raw_payload: element,
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
  const details = ["Origem: pesquisa de prospeccao."];
  if (website) details.push(`Site encontrado: ${website}.`);
  if (address) details.push(`Endereco: ${address}.`);
  details.push("Opt-in nao confirmado. Validar permissao antes de campanha ativa.");
  return details.join(" ");
}

function buildOverpassQuery(keyword: string, city: string, maxResults: number) {
  const nameRegex = escapeOverpassRegex(keyword);
  const filters = osmFiltersForKeyword(keyword);
  const filterQueries = filters
    .map(
      (filter) => `
  node${filter}(area.searchArea);
  way${filter}(area.searchArea);
  relation${filter}(area.searchArea);`
    )
    .join("\n");

  return `
[out:json][timeout:25];
area["name"="${escapeOverpassString(city)}"]["boundary"="administrative"]->.searchArea;
(
  node["name"~"${nameRegex}",i](area.searchArea);
  way["name"~"${nameRegex}",i](area.searchArea);
  relation["name"~"${nameRegex}",i](area.searchArea);
${filterQueries}
);
out center tags ${maxResults};
`.trim();
}

function buildAiProspectingPrompt(keyword: string, city: string, maxResults: number) {
  return `
Pesquise na web empresas reais para prospeccao comercial.

Nicho: ${keyword}
Cidade/regiao: ${city || "Brasil"}
Quantidade maxima: ${maxResults}

Regras obrigatorias:
- Use busca na web.
- Nao invente empresas.
- Retorne apenas empresas que voce encontrou em fonte publica verificavel.
- Priorize empresas locais com site, pagina publica ou telefone.
- Se nao encontrar telefone, use null.
- Se nao encontrar site, use a melhor URL publica encontrada como source_url.
- Responda somente JSON valido, sem markdown.

Formato:
{
  "companies": [
    {
      "name": "Nome da empresa",
      "phone": "telefone ou null",
      "website": "site oficial ou null",
      "address": "endereco ou null",
      "city": "cidade",
      "source_url": "url publica usada para validar",
      "notes": "breve observacao"
    }
  ]
}
`.trim();
}

function parseAiProspects(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as { companies?: AiProspect[] };
    return (parsed.companies ?? []).filter((company) => company.name && (company.source_url || company.website));
  } catch {
    throw new Error("A IA nao retornou JSON valido para salvar prospects. Tente uma busca mais especifica.");
  }
}

function extractInteractionOutputText(payload: { steps?: unknown[] }) {
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (const step of steps) {
    if (!step || typeof step !== "object" || (step as { type?: string }).type !== "model_output") continue;
    const content = (step as { content?: unknown[] }).content;
    if (!Array.isArray(content)) continue;
    const block = content.find((item) => item && typeof item === "object" && (item as { type?: string }).type === "text");
    const text = (block as { text?: string } | undefined)?.text;
    if (text) return text;
  }
  return "";
}

function osmFiltersForKeyword(keyword: string) {
  const normalized = slugify(keyword);
  const filters = new Set<string>();

  if (/(barbear|cabelo|salao|salao_de_beleza|beleza|estetica|designer_de_sobrancelha)/.test(normalized)) {
    filters.add('["shop"~"hairdresser|beauty",i]');
    filters.add('["amenity"~"beauty_salon",i]');
  }
  if (/(restaurante|lanchonete|pizzaria|hamburguer|food|comida)/.test(normalized)) {
    filters.add('["amenity"~"restaurant|fast_food|cafe|bar",i]');
  }
  if (/(clinica|medico|dentista|odontologia|saude|fisioterapia)/.test(normalized)) {
    filters.add('["amenity"~"clinic|doctors|dentist|hospital",i]');
    filters.add('["healthcare"~"clinic|doctor|dentist|physiotherapist",i]');
  }
  if (/(hotel|pousada|hospedagem)/.test(normalized)) {
    filters.add('["tourism"~"hotel|guest_house|hostel",i]');
  }
  if (/(academia|crossfit|pilates|fitness)/.test(normalized)) {
    filters.add('["leisure"~"fitness_centre|sports_centre",i]');
    filters.add('["sport"~"fitness|pilates",i]');
  }
  if (/(pet|veterinaria|banho|tosa)/.test(normalized)) {
    filters.add('["amenity"~"veterinary",i]');
    filters.add('["shop"~"pet",i]');
  }
  if (filters.size === 0) {
    filters.add('["shop"]');
    filters.add('["amenity"]');
    filters.add('["office"]');
  }

  return Array.from(filters);
}

function escapeOverpassString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeOverpassRegex(value: string) {
  return escapeOverpassString(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

function formatOsmAddress(tags: Record<string, string>) {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  const suburb = tags["addr:suburb"] ?? tags["addr:neighbourhood"];
  const city = tags["addr:city"];
  const parts = [
    street && number ? `${street}, ${number}` : street ?? number,
    suburb,
    city
  ].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}
