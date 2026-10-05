import type { SupabaseClient } from "@supabase/supabase-js";

// Giá mua (mỏ), giá bán (công trình) theo hợp đồng còn hiệu lực, và giá cước tuyến, tại ngày phiếu
async function contractPrice(sb: SupabaseClient, partnerId: number, dir: "buy" | "sell", date: string) {
  const { data: c } = await sb.from("contracts").select("id").eq("partner_id", partnerId).eq("direction", dir).eq("status", "active")
    .or(`end_date.is.null,end_date.gte.${date}`).order("id", { ascending: false }).limit(1);
  const contractId: number | null = c?.[0]?.id ?? null;
  if (!contractId) return { contractId: null, price: null as number | null };
  const { data: p } = await sb.from("contract_prices").select("unit_price").eq("contract_id", contractId)
    .lte("valid_from", date).or(`valid_to.is.null,valid_to.gte.${date}`).order("valid_from", { ascending: false }).limit(1);
  return { contractId, price: (p?.[0]?.unit_price ?? null) as number | null };
}

export async function tripPrices(sb: SupabaseClient, mineId: number, siteId: number, date: string) {
  const [buy, sell, rate] = await Promise.all([
    contractPrice(sb, mineId, "buy", date), contractPrice(sb, siteId, "sell", date),
    sb.from("freight_rates").select("price").eq("from_partner_id", mineId).eq("to_partner_id", siteId)
      .lte("valid_from", date).or(`valid_to.is.null,valid_to.gte.${date}`).order("valid_from", { ascending: false }).limit(1),
  ]);
  return {
    buy_contract_id: buy.contractId, buy_price: buy.price, sell_contract_id: sell.contractId, sell_price: sell.price,
    freight_price: (rate.data?.[0]?.price ?? null) as number | null,
  };
}

// Tải hết các dòng (máy chủ trả tối đa 1000 dòng mỗi lần)
export async function fetchAll<T>(make: (from: number, to: number) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < 100; page++) {
    const { data } = await make(page * 1000, page * 1000 + 999);
    const rows = (data as T[] | null) ?? [];
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  return all;
}
