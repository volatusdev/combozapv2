export interface WooviCharge {
  correlationID: string;
  brCode: string;
  qrCodeImageBase64: string;
  valueCents: number;
}

export async function createWooviCharge(opts: {
  valueCents: number;
  description: string;
  correlationID: string;
}): Promise<WooviCharge> {
  const apiKey = process.env.WOOVI_API_KEY;
  if (!apiKey) throw new Error("WOOVI_API_KEY não configurada");

  const res = await fetch("https://api.openpix.com.br/api/v1/charge", {
    method: "POST",
    headers: {
      "Authorization": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      correlationID: opts.correlationID,
      value: opts.valueCents,
      comment: opts.description,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Woovi API ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = await res.json() as {
    charge?: {
      correlationID?: string;
      brCode?: string;
      qrCodeImage?: string;
      value?: number;
    };
  };

  const charge = data.charge;
  if (!charge?.brCode) throw new Error("Woovi retornou cobrança sem brCode");

  const rawImg = charge.qrCodeImage ?? "";
  const base64 = rawImg.startsWith("data:")
    ? (rawImg.split(",")[1] ?? "")
    : rawImg;

  return {
    correlationID: charge.correlationID ?? opts.correlationID,
    brCode: charge.brCode,
    qrCodeImageBase64: base64,
    valueCents: charge.value ?? opts.valueCents,
  };
}

export function parsePixValue(raw: string): number | null {
  const normalized = raw.trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const v = parseFloat(normalized);
  return isNaN(v) || v <= 0 ? null : v;
}
