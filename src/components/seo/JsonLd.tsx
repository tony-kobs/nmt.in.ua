import { headers } from "next/headers";

type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

/** Embeds schema.org JSON-LD for crawlers and rich results. */
export async function JsonLd({ data }: JsonLdProps) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
