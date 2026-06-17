const optOutPatterns = [
  "parar",
  "sair",
  "remover",
  "cancelar",
  "nao quero",
  "não quero",
  "sem interesse"
];

export function detectsOptOut(text: string) {
  const normalized = text.trim().toLowerCase();
  return optOutPatterns.some((pattern) => normalized.includes(pattern));
}

export function detectsNegative(text: string) {
  const normalized = text.trim().toLowerCase();
  return (
    detectsOptOut(text) ||
    ["nao tenho interesse", "não tenho interesse", "agora nao", "agora não"].some((pattern) =>
      normalized.includes(pattern)
    )
  );
}
